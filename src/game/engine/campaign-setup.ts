// Act I setup of the Blighted Reach campaign (design/campaign-plan.md §2.6,
// milestone M2): docs/rules/Arcs_Campaign_Rulebook_for_web.txt pages 4-6.
// Fates are not dealt yet (they come with M4): no Fate set, no objective.

import { addToBooklet, IMPERIAL_COUNCIL, newCampaign } from './campaign';
import { RuleError } from './errors';
import { gainFromSupply } from './board';
import { emptyAmbitionBoard } from './ambitions';
import { planetType } from './ops';
import { nextInt, shuffle } from './rng';
import type { ContentIndex } from './setup';
import type { AmbitionId, CampaignContent, GameState, PlayerCount, PlayerId, PlayerState, Resource, SystemState } from './types';

/** Options for a new campaign (Act I). */
export interface NewCampaignOptions {
  playerCount: PlayerCount;
  seed: number;
  /** Force the first initiative holder (otherwise random, step 1B). */
  firstPlayer?: number;
}

/** The campaign content, or a rule error when the content has none. */
export function campaignContent(ix: ContentIndex): CampaignContent {
  return ix.content.campaign ?? fail('This content has no campaign');
}

/** Event action card ids: one per printed copy, `<id>-<copy>` (event-01-1 …). */
export function eventCardIds(cc: CampaignContent): string[] {
  return cc.eventCards.flatMap((e) => Array.from({ length: e.copies }, (_, k) => `${e.id}-${k + 1}`));
}

/** True for an Event action card (p. 12). */
export function isEventCard(ix: ContentIndex, card: string): boolean {
  const cc = ix.content.campaign;
  return !!cc?.eventCards && eventCardIds(cc).includes(card);
}

/**
 * Starts Act I (p. 4-6), up to the players' placement steps G–H, which the
 * `place` command resolves one at a time (phase `campaignSetup`).
 *
 * Table (p. 4-5): no setup card, every cluster in play; the action deck with
 * 2 or 3 Event cards; the campaign ("CC") Court, then 1 lore card per player
 * shuffled into the Court deck, and the Imperial Council In Session as the
 * leftmost Court card; the rules booklet with the Guild Envoys edict (2
 * players) and the 3 Govern the Imperial Reach edicts stacked in one slot;
 * the number die picks the 2 Imperial clusters (1 Imperial ship in each of
 * their systems); the event die's symbol places Free cities outside them; 1
 * damaged Blight in each system outside them; 2 players: the Imperial
 * clusters' planet resources go on the ambition boxes.
 * Players (p. 6): Regents all; the initiative holder takes the First Regent
 * tile (no Fate gave it).
 */
export function newCampaignGame(ix: ContentIndex, opts: NewCampaignOptions): GameState {
  const c = ix.content;
  const cc = campaignContent(ix);
  const n = opts.playerCount;
  const rng = { rngState: opts.seed | 0 };
  const initiative = opts.firstPlayer ?? nextInt(rng, n);

  const map: Record<string, SystemState> = {};
  for (const s of c.map.systems) map[s.id] = { id: s.id, inPlay: true, ships: {}, buildings: [] };

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

  // C–E: action cards 2–6 (4 players: also 1 and 7), plus 2 or 3 Event cards.
  const events = eventCardIds(cc).slice(0, cc.eventCardsInDeck[n]);
  const deck = shuffle(rng, [...c.actionCards.filter((a) => (a.minPlayers ?? 2) <= n).map((a) => a.id), ...events]);
  // I–K: the campaign Court, lore shuffled in after dealing, the Council leftmost.
  const courtDeck = shuffle(rng, c.courtCards.filter((x) => x.set === 'campaign').map((x) => x.id));
  const court = courtDeck.splice(0, c.courtSize[n]).map((card) => ({ card, agents: {} }));
  const lore = shuffle(rng, (c.loreCards ?? []).map((l) => l.id)).slice(0, n);
  const state: GameState = {
    playerCount: n,
    seed: opts.seed,
    rngState: rng.rngState,
    variant: 'base',
    chapter: 0,
    initiative,
    players,
    deck,
    discard: [],
    courtDeck: shuffle(rng, [...courtDeck, ...lore]),
    courtDiscard: [],
    court: [{ card: IMPERIAL_COUNCIL, agents: {} }, ...court],
    map,
    closedLinks: [],
    openLinks: [],
    resourceSupply: { ...c.resourceSupply },
    ambitionBoxes: {},
    mulligan: null,
    consecutivePasses: 0,
    draft: null,
    ambitions: emptyAmbitionBoard(c, 1),
    round: { leader: initiative, leadSuit: null, plays: [], declarations: 0, seizedBy: null },
    phase: { type: 'campaignSetup' },
    setupCard: 'campaign',
    campaign: newCampaign(n, cc.pieces),
    log: [],
  };
  state.rngState = rng.rngState;
  const camp = state.campaign!;

  // L–M: the rules booklet.
  const twoPlayer = cc.edicts.filter((e) => e.twoPlayerOnly).map((e) => e.id);
  if (n === 2 && twoPlayer.length) addToBooklet(state, 'edicts', twoPlayer);
  addToBooklet(state, 'edicts', shuffle(state, cc.edicts.filter((e) => e.policy).map((e) => e.id)));

  // N: the number die picks a cluster; it and the next clockwise one are Imperial.
  const clusters = [...new Set(c.map.systems.map((x) => x.cluster))];
  const rolled = cc.eventDice.number[nextInt(state, cc.eventDice.number.length)];
  const first = clusters.indexOf(`c${rolled}`);
  if (first < 0) fail(`No cluster c${rolled} on the map`);
  camp.imperialClusters = [clusters[first], clusters[(first + 1) % clusters.length]];
  const imperial = new Set(camp.imperialClusters);
  for (const sys of c.map.systems) {
    if (!imperial.has(sys.cluster)) continue;
    map[sys.id].imperial = { fresh: 1, damaged: 0 };
    camp.supply.imperialShips = Math.max(0, camp.supply.imperialShips - 1);
  }
  log(state, `Number die: ${rolled}; Imperial clusters ${camp.imperialClusters.join(' and ')}`);

  // O: the event die's symbol: 1 Free city on each such planet outside the Imperial clusters.
  const face = cc.eventDice.event[nextInt(state, cc.eventDice.event.length)];
  for (const sys of c.map.systems) {
    if (imperial.has(sys.cluster) || sys.kind !== 'planet' || sys.idSymbol !== face.symbol) continue;
    placeFree(state, sys.id, 'city');
  }
  log(state, `Event die: ${face.symbol}; Free cities on the ${face.symbol} planets outside the Imperial clusters`);

  // P: 1 damaged Blight in each system outside the Imperial clusters.
  for (const sys of c.map.systems) {
    if (imperial.has(sys.cluster)) continue;
    map[sys.id].blight = { fresh: 0, damaged: 1 };
    camp.supply.blight = Math.max(0, camp.supply.blight - 1);
  }

  // Q: 2 players: the Imperial clusters' planet resources go on the ambition boxes.
  if (n === 2 && c.twoPlayerAmbitionBoxes) {
    for (const sys of c.map.systems) {
      if (!imperial.has(sys.cluster) || sys.kind !== 'planet' || !sys.resource) continue;
      const amb: AmbitionId | undefined = c.twoPlayerAmbitionBoxes[sys.resource];
      if (!amb || (state.resourceSupply[sys.resource] ?? 0) < 1) continue;
      state.resourceSupply[sys.resource] -= 1;
      (state.ambitionBoxes[amb] ??= []).push(sys.resource);
    }
  }

  // F: the initiative holder takes the First Regent tile (no Fate gave it yet).
  camp.firstRegent = initiative;
  // G–H: placements in turn order, then in reverse turn order.
  const order = Array.from({ length: n }, (_, k) => (initiative + k) % n);
  camp.placements = [...order, ...[...order].reverse()];
  log(state, `Act I setup: P${initiative} is the First Regent; players place their starting pieces`);
  return state;
}

/**
 * Step G–H (p. 6): "place 3 ships and 1 building in an empty building slot
 * at a planet with an Imperial ship and gain 1 resource token of that planet
 * type. (The planet can have Rival pieces.)" After the last placement, step
 * I fills the empty slots of planets with Imperial ships with Free cities,
 * then `start` deals chapter 1 (step J); the undealt cards are discarded at
 * the first lead (step K, after the 2-player mulligan).
 */
export function placeStartingPieces(ix: ContentIndex, s: GameState, p: PlayerId, system: string, building: 'city' | 'starport', start: () => void): string {
  const camp = s.campaign ?? fail('Not a campaign');
  if (s.phase.type !== 'campaignSetup') fail('Starting pieces are placed during setup');
  if (camp.placements[0] !== p) fail(`P${camp.placements[0]} places next`);
  const def = ix.content.map.systems.find((x) => x.id === system) ?? fail(`No system ${system}`);
  const sys = s.map[system];
  if (def.kind !== 'planet') fail('Starting pieces go on a planet');
  if (!sys.imperial || sys.imperial.fresh + sys.imperial.damaged < 1) fail('Starting pieces go on a planet with an Imperial ship');
  if (def.slots !== undefined && sys.buildings.length >= def.slots) fail(`${system} has no empty building slot`);
  const pl = s.players[p];
  const key = building === 'city' ? 'cities' : 'starports';
  if (pl.supply[key] < 1) fail(`No ${key} left`);
  const ships = Math.min(campaignContent(ix).startingShips, pl.supply.ships);
  pl.supply.ships -= ships;
  const st = (sys.ships[p] ??= { fresh: 0, damaged: 0 });
  st.fresh += ships;
  pl.supply[key] -= 1;
  sys.buildings.push({ owner: p, type: building, damaged: false });
  const r: Resource | undefined = planetType(ix, s, system);
  const gained = r !== undefined && gainFromSupply(ix.content, s, pl, r);
  delete pl.arranging; // starting resources sit on the leftmost slots
  camp.placements.shift();
  const text = `P${p} places ${ships} ships and a ${building} at ${system}${gained ? ` and gains ${r}` : ''}`;
  if (!camp.placements.length) {
    // I: Free cities in every empty building slot of planets with Imperial ships.
    for (const d of ix.content.map.systems) {
      const x = s.map[d.id];
      if (d.kind !== 'planet' || !x.imperial || x.imperial.fresh + x.imperial.damaged < 1) continue;
      for (let k = x.buildings.length; k < (d.slots ?? 0); k++) placeFree(s, d.id, 'city');
    }
    camp.discardUndealt = true;
    start();
  }
  return text;
}

/**
 * Places a Free building from the campaign supply. p. 15: "If the supply of
 * Free cities or Free starports is empty, use a proxy piece": it is placed
 * anyway and the supply stays at 0.
 */
function placeFree(s: GameState, system: string, type: 'city' | 'starport'): void {
  const sup = s.campaign!.supply;
  const key = type === 'city' ? 'freeCities' : 'freeStarports';
  sup[key] = Math.max(0, sup[key] - 1);
  s.map[system].buildings.push({ owner: 'free', type, damaged: false });
}

function log(s: GameState, text: string): void {
  s.log.push({ chapter: s.chapter, text });
}

function fail(msg: string): never {
  throw new RuleError(msg);
}
