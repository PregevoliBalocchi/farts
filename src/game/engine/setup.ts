// Game setup (design/gdd/core-loop.md §3.2): deck filtering, map exclusions,
// court reveal, asymmetric setup card, initiative, first chapter.

import { nextInt, shuffle } from './rng';
import { promoteDecision, startChapter } from './chapter';
import { emptyAmbitionBoard } from './ambitions';
import { gainResource } from './board';
import type { EffectRegistry } from './effects';
import { ownedEffects } from './effects';
import { coverOutrage } from './ops';
import type {
  ActionCardDef,
  CourtCardDef,
  GameContent,
  GameState,
  PlayerCount,
  PlayerState,
  SetupCardDef,
  SetupPieces,
  SystemState,
  AmbitionId,
  PlayerId,
  Resource,
} from './types';

/** Lookup tables built once from the content. */
export interface ContentIndex {
  content: GameContent;
  actionCards: Map<string, ActionCardDef>;
  courtCards: Map<string, CourtCardDef>;
  /** Card effects by effect id (src/game/cards registers the owner's cards). */
  effects: EffectRegistry;
  /** Non-blocking content issues (e.g. decree effects to resolve by hand). */
  warnings: string[];
}

/** Builds lookup maps and validates cross references. Throws on bad content. */
export function indexContent(content: GameContent, effects: EffectRegistry = {}): ContentIndex {
  const actionCards = new Map(content.actionCards.map((c) => [c.id, c]));
  const courtCards = new Map(content.courtCards.map((c) => [c.id, c]));
  const errors: string[] = [];
  const warnings: string[] = [];
  const systems = new Set(content.map.systems.map((s) => s.id));
  for (const c of content.actionCards) {
    if (!content.suits[c.suit]) errors.push(`action card ${c.id}: unknown suit ${c.suit}`);
  }
  for (const [a, b] of content.map.links) {
    if (!systems.has(a) || !systems.has(b)) errors.push(`link ${a}-${b}: unknown system`);
  }
  for (const sc of content.setupCards) {
    if (sc.seats.length !== sc.playerCount) errors.push(`setup card ${sc.id}: ${sc.seats.length} seats for ${sc.playerCount} players`);
    for (const seat of sc.seats) for (const p of seat) if (!systems.has(p.system)) errors.push(`setup card ${sc.id}: unknown system ${p.system}`);
    for (const [a, b] of sc.openLinks ?? []) if (!systems.has(a) || !systems.has(b)) errors.push(`setup card ${sc.id}: open link ${a}-${b} unknown system`);
    const usesSlots = sc.seats.some((seat) => seat.some((p) => p.slot));
    if (usesSlots && !content.baseSetupPieces) errors.push(`setup card ${sc.id}: uses A/B/C slots but content has no baseSetupPieces`);
  }
  if (actionCards.size !== content.actionCards.length) errors.push('duplicate action card ids');
  if (courtCards.size !== content.courtCards.length) errors.push('duplicate court card ids');
  if (systems.size !== content.map.systems.length) errors.push('duplicate system ids');

  const clusters = new Set(content.map.systems.map((s) => s.cluster));
  for (const s of content.map.systems) {
    if (s.kind === 'planet' && !s.resource) errors.push(`planet ${s.id}: missing resource`);
  }
  for (const [n, ex] of Object.entries(content.map.exclusions)) {
    for (const id of ex?.systems ?? []) if (!systems.has(id)) errors.push(`exclusions[${n}]: unknown system ${id}`);
    for (const id of ex?.clusters ?? []) if (!clusters.has(id)) errors.push(`exclusions[${n}]: unknown cluster ${id}`);
  }
  for (const [num, amb] of Object.entries(content.declareByNumber)) {
    if (amb !== 'any' && !content.ambitionMetrics[amb]) errors.push(`declareByNumber[${num}]: no metric for ambition ${amb}`);
  }
  if (!content.ambitionMarkers.length) errors.push('no ambition markers');
  for (const m of content.ambitionMarkers) if (!m.sides.length) errors.push(`marker ${m.id}: no sides`);
  for (const [suit, kinds] of Object.entries(content.suits)) if (!kinds.length) errors.push(`suit ${suit}: no action kinds`);
  for (const d of ['skirmish', 'assault', 'raid'] as const) if (!content.dice[d]?.length) errors.push(`die ${d}: no faces`);

  for (const n of [2, 3, 4] as const) {
    if (!content.setupCards.some((s) => s.playerCount === n)) errors.push(`no setup card for ${n} players`);
    const deck = content.actionCards.filter((a) => (a.minPlayers ?? 2) <= n).length;
    if (deck < content.handSize * n) errors.push(`${n} players: deck of ${deck} cannot deal ${content.handSize} each`);
    if (content.courtCards.length < content.courtSize[n]) errors.push(`${n} players: court deck smaller than court size`);
  }
  for (const c of content.courtCards) {
    if (c.effect && !effects[c.effect]) warnings.push(`court card ${c.id}: effect '${c.effect}' not implemented (manual)`);
  }
  const pb = content.playerBoard;
  if (!pb) errors.push('missing playerBoard');
  else {
    const n = pb.slotKeys.length;
    for (const i of [...pb.baseSlots, ...pb.cityUnlocks.flat()]) if (i < 0 || i >= n) errors.push(`playerBoard: slot ${i} out of range`);
    if (pb.cityUnlocks.length !== content.citiesPerPlayer) errors.push('playerBoard.cityUnlocks needs one entry per city');
    if (pb.cityBonusPower.length !== content.citiesPerPlayer) errors.push('playerBoard.cityBonusPower needs one entry per city');
  }
  if (errors.length) throw new Error('Invalid content:\n' + errors.join('\n'));
  return { content, actionCards, courtCards, effects, warnings };
}

/** Options for a new game. */
export interface NewGameOptions {
  playerCount: PlayerCount;
  seed: number;
  /** 'base' (default): standard pieces, starting resources from the A and B planets. 'leaders': Leaders & Lore. */
  variant?: 'base' | 'leaders';
  /** Force a setup card (otherwise random among those for the player count). */
  setupCardId?: string;
  /** Force the first initiative holder (otherwise random). */
  firstPlayer?: number;
  /** Leaders & Lore: skip the draft and give these leaders, one per player. */
  leaders?: string[];
  /** Leaders & Lore: skip the draft and give these lore cards, a list per player (used with `leaders`). */
  lore?: string[][];
  /** Leaders & Lore: lore cards each player drafts (1, or 2 for more chaos). Default 1, or 0 if the content has none. */
  lorePerPlayer?: number;
  /** Court card sets used (cards without `set` are 'base'). Default ['base']. */
  courtSets?: string[];
}

/**
 * Creates a game (design/gdd/core-loop.md §3.2). Base game: ready for the first
 * lead of chapter 1. Leaders & Lore without fixed choices: in the `draft` phase.
 */
export function newGame(ix: ContentIndex, opts: NewGameOptions): GameState {
  const c = ix.content;
  const n = opts.playerCount;
  const variant = opts.variant ?? 'base';
  const rng = { rngState: opts.seed | 0 };

  // Initiative first: it decides who is "player 1" on the setup card.
  const initiative = opts.firstPlayer ?? nextInt(rng, n);

  const candidates = c.setupCards.filter((s) => s.playerCount === n);
  if (!candidates.length) throw new Error(`No setup card for ${n} players`);
  const setup: SetupCardDef = opts.setupCardId
    ? (candidates.find((s) => s.id === opts.setupCardId) ?? fail(`Setup card ${opts.setupCardId} not for ${n} players`))
    : candidates[nextInt(rng, candidates.length)];

  // Map with exclusions (content-wide for the player count + setup card's own).
  const excl = [c.map.exclusions[n] ?? {}, setup.exclusions ?? {}];
  const outSystems = new Set(excl.flatMap((e) => e.systems ?? []));
  const outClusters = new Set(excl.flatMap((e) => e.clusters ?? []));
  const map: Record<string, SystemState> = {};
  for (const s of c.map.systems) {
    map[s.id] = { id: s.id, inPlay: !outSystems.has(s.id) && !outClusters.has(s.cluster), ships: {}, buildings: [] };
  }
  const closedLinks = excl.flatMap((e) => e.links ?? []);
  const openLinks = setup.openLinks ?? [];

  if (variant !== 'leaders' && (opts.leaders || opts.lore)) fail('Leaders and lore are only used in the leaders variant');

  const players: PlayerState[] = Array.from({ length: n }, (_, id) => ({
    id,
    power: 0,
    hand: [],
    resources: [],
    supply: { agents: c.agentsPerPlayer, ships: c.shipsPerPlayer, cities: c.citiesPerPlayer, starports: c.starportsPerPlayer },
    captives: [],
    trophies: [],
    court: [],
    leader: null,
    lore: [],
    outraged: [],
  }));

  const resourceSupply = { ...c.resourceSupply };

  // 2 players: the resources of out-of-play planets go on the ambition boxes.
  const ambitionBoxes: Partial<Record<AmbitionId, Resource[]>> = {};
  if (n === 2 && c.twoPlayerAmbitionBoxes) {
    for (const sdef of c.map.systems) {
      if (sdef.kind !== 'planet' || map[sdef.id].inPlay || !sdef.resource) continue;
      const amb = c.twoPlayerAmbitionBoxes[sdef.resource];
      if (amb && (resourceSupply[sdef.resource] ?? 0) > 0) {
        resourceSupply[sdef.resource] -= 1;
        (ambitionBoxes[amb] ??= []).push(sdef.resource);
      }
    }
  }

  const deck = shuffle(rng, c.actionCards.filter((a) => (a.minPlayers ?? 2) <= n).map((a) => a.id));
  const sets = new Set(opts.courtSets ?? ['base']);
  const courtDeck = shuffle(rng, c.courtCards.filter((cc) => sets.has(cc.set ?? 'base')).map((cc) => cc.id));
  const court = courtDeck.splice(0, c.courtSize[n]).map((card) => ({ card, agents: {} }));

  const state: GameState = {
    playerCount: n,
    seed: opts.seed,
    rngState: rng.rngState,
    variant,
    chapter: 0,
    initiative,
    players,
    deck,
    discard: [],
    courtDeck,
    courtDiscard: [],
    court,
    map,
    closedLinks,
    openLinks,
    resourceSupply,
    ambitionBoxes,
    mulligan: null,
    consecutivePasses: 0,
    draft: null,
    ambitions: emptyAmbitionBoard(c, 1),
    round: { leader: initiative, leadSuit: null, plays: [], declarations: 0, seizedBy: null },
    phase: { type: 'lead' },
    setupCard: setup.id,
    log: [],
  };

  if (variant === 'leaders') {
    const leaderIds = (c.leaders ?? []).map((l) => l.id);
    const loreIds = (c.loreCards ?? []).map((l) => l.id);
    const lorePerPlayer = opts.lorePerPlayer ?? (loreIds.length ? 1 : 0);
    if (opts.leaders) {
      if (opts.leaders.length !== n || opts.leaders.some((id) => !leaderIds.includes(id))) fail('Invalid leader choice');
      players.forEach((p, i) => (p.leader = opts.leaders![i]));
      if (opts.lore) {
        if (opts.lore.length !== n || opts.lore.flat().some((id) => !loreIds.includes(id))) fail('Invalid lore choice');
        players.forEach((p, i) => (p.lore = [...opts.lore![i]]));
      }
    } else {
      // Draft: face-up rows of players+1 leaders and players*lore+1 lore cards; picks go
      // counterclockwise starting with the player to the right of the initiative holder.
      if (leaderIds.length < n) fail('Not enough leaders in content for the leaders variant');
      if (loreIds.length < n * lorePerPlayer) fail('Not enough lore cards in content');
      const leaders = shuffle(state, [...leaderIds]).slice(0, n + 1);
      const lore = lorePerPlayer ? shuffle(state, [...loreIds]).slice(0, n * lorePerPlayer + 1) : [];
      const order: PlayerId[] = [];
      for (let k = 0; k < n * (1 + lorePerPlayer); k++) order.push((((initiative - 1 - k) % n) + n) % n);
      state.draft = { leaders, lore, order, lorePerPlayer };
      state.phase = { type: 'draft' };
      log(state, 'Leaders & Lore draft begins');
      return state;
    }
  }
  finishSetup(ix, state);
  return state;
}

/**
 * Places starting pieces and resources, then starts chapter 1.
 * Base: standard pieces, resources of the A and B planets. Leaders: the leader card's.
 */
export function finishSetup(ix: ContentIndex, s: GameState): void {
  const c = ix.content;
  const n = s.playerCount;
  const setup = c.setupCards.find((x) => x.id === s.setupCard)!;
  const players = s.players;
  // Setup card seat k is the k-th player clockwise from the initiative holder.
  const playerForSeat = (seat: number) => (s.initiative + seat) % n;
  const startPlanets: Record<number, { A?: string; B?: string }> = {};
  setup.seats.forEach((placements, seat) => {
    const owner = playerForSeat(seat);
    const p = players[owner];
    const leader = c.leaders?.find((l) => l.id === p.leader);
    for (const pl of placements) {
      const sys = s.map[pl.system];
      if (!sys.inPlay) throw new Error(`Setup ${setup.id} places on out-of-play system ${pl.system}`);
      if (pl.slot === 'A' || pl.slot === 'B') (startPlanets[owner] ??= {})[pl.slot] = pl.system;
      const pieces: SetupPieces = pl.slot
        ? ((s.variant === 'leaders' ? leader?.setup[pl.slot] : c.baseSetupPieces?.[pl.slot]) ?? fail(`No pieces defined for slot ${pl.slot}`))
        : { ships: pl.ships, buildings: pl.building ? [pl.building] : [] };
      if (pieces.ships) {
        if (p.supply.ships < pieces.ships) throw new Error(`Player ${owner} out of ships during setup`);
        p.supply.ships -= pieces.ships;
        const st = (sys.ships[owner] ??= { fresh: 0, damaged: 0 });
        st.fresh += pieces.ships;
      }
      for (const building of pieces.buildings ?? []) {
        const key = building === 'city' ? 'cities' : 'starports';
        if (p.supply[key] < 1) throw new Error(`Player ${owner} out of ${key} during setup`);
        const def = c.map.systems.find((x) => x.id === pl.system)!;
        if (def.kind !== 'planet') throw new Error(`Setup ${setup.id}: building on non-planet ${pl.system}`);
        if (def.slots !== undefined && sys.buildings.length >= def.slots) throw new Error(`Setup ${setup.id}: no free slot at ${pl.system}`);
        p.supply[key] -= 1;
        sys.buildings.push({ owner, type: building, damaged: false });
      }
    }
  });

  // Starting resources, after placement (a city built at setup has freed its slot).
  players.forEach((p) => {
    const wanted =
      s.variant === 'leaders'
        ? (c.leaders?.find((l) => l.id === p.leader)?.resources ?? [])
        : (['A', 'B'] as const).flatMap((k) => {
            const sys = startPlanets[p.id]?.[k];
            const r = sys ? c.map.systems.find((x) => x.id === sys)!.resource : undefined;
            return r ? [r] : [];
          });
    for (const r of wanted) {
      if ((s.resourceSupply[r] ?? 0) < 1) throw new Error(`Resource supply has no ${r} for player ${p.id}`);
      gainResource(c, p, r);
      if (p.overflow?.length) throw new Error(`Player ${p.id}: no free slot for starting ${r}`);
      s.resourceSupply[r] -= 1;
    }
    // Starting resources sit on the leftmost slots: no rearranging at setup.
    delete p.arranging;
  });
  leaderSetup(ix, s);
  s.draft = null;
  startChapter(ix, s);
  // Choices left by setup effects come before the first lead.
  promoteDecision(ix, s);
}

/**
 * Leaders' setup steps, in turn order from the initiative holder
 * (design/gdd/card-effects.md "Setup"): agents on Outrage slots, pieces
 * scrapped, extra lore offered through a Decision.
 */
function leaderSetup(ix: ContentIndex, s: GameState): void {
  for (let k = 0; k < s.playerCount; k++) {
    const pl = s.players[(s.initiative + k) % s.playerCount];
    for (const { card, effect } of ownedEffects(ix, s, pl.id)) {
      const st = effect.setup;
      if (!st) continue;
      for (const t of st.outrage ?? []) if (!pl.outraged.includes(t)) coverOutrage(pl, t);
      // Scrapped pieces leave the game; the piece ledger still counts them.
      // Cities leave the board from the left: the slots under them open as if built.
      for (const [piece, n] of [['ships', st.scrapShips], ['agents', st.scrapAgents], ['cities', st.scrapCities]] as const) {
        const k = Math.min(n ?? 0, pl.supply[piece]);
        if (!k) continue;
        pl.supply[piece] -= k;
        pl.removed = { ...pl.removed, [piece]: (pl.removed?.[piece] ?? 0) + k };
      }
      if (st.extraLore) {
        const held = new Set([...s.players.flatMap((x) => x.lore), ...(s.loreDiscard ?? [])]);
        const deck = shuffle(s, (ix.content.loreCards ?? []).map((l) => l.id).filter((id) => !held.has(id)));
        const offer = deck.slice(0, st.extraLore.draw);
        if (offer.length) (s.pendingDecisions ??= []).push({ player: pl.id, card, effect: 'setupLore', data: { cards: offer, keep: st.extraLore.keep } });
      }
      log(s, `P${pl.id} applies ${card} setup`);
    }
  }
}

function log(s: GameState, text: string): void {
  s.log.push({ chapter: s.chapter, text });
}

function fail(msg: string): never {
  throw new Error(msg);
}
