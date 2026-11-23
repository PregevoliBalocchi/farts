// What the table screen shows, derived from the engine state for one player's
// seat. Pure functions, no DOM: the components only read a TableView, and every
// "is this allowed?" answer comes from the engine itself (a trial dispatch),
// so no rule is repeated here. Implements docs/ui/UI_SPEC.md §12 (data model),
// adapted to the engine types of src/game/engine.

import { cardWords } from './cardface';
import {
  activePlayer,
  AMBITIONS,
  citiesBuilt,
  ambitionMetric,
  cartelMetric,
  controls,
  dispatch,
  markerValues,
  openSlots,
  rankAmbition,
  RESOURCES,
} from '../../game/engine';
import type {
  ActionKind,
  AmbitionId,
  BattleRef,
  Command,
  ContentIndex,
  CourtKind,
  Decision,
  GameState,
  PlayerId,
  PlayMode,
  Resource,
} from '../../game/engine';

/** One resource slot on a player board. */
export interface SlotView {
  index: number;
  resource: Resource | null;
  /** Covered by a city still on the board. */
  locked: boolean;
  /** Keys printed above the slot (raid cost). */
  keys: number;
}

/** One seat as everyone at the table sees it (the hand only as a count). */
export interface PlayerView {
  id: PlayerId;
  power: number;
  hasInitiative: boolean;
  isActive: boolean;
  handCount: number;
  slots: SlotView[];
  outraged: Resource[];
  stats: { trophies: number; captives: number; ships: number; cities: number; starports: number; agents: number };
  /** Court cards the player holds. */
  court: string[];
  /** Leaders & Lore: the player's leader card and lore cards (none in the base game). */
  leader: string | null;
  lore: string[];
  /** Rival pieces taken as trophies: whose, and what. */
  trophies: { owner: PlayerId; piece: string }[];
  /** Rival agents held captive, by owner. */
  captives: PlayerId[];
  /**
   * The cities of the player board in build order: the resource slots each
   * one covers while unbuilt, and the power it adds once built.
   */
  cities: { built: boolean; slots: number[]; bonus: number }[];
  /** Resource tokens held, counted by type (every type listed, zero included). */
  held: { resource: Resource; count: number }[];
}

/** An action card, face up. */
export interface ActionCardView {
  card: string;
  suit: string;
  number: number;
  pips: number;
  /** Action kinds the suit grants. */
  kinds: ActionKind[];
}

/** A card in the local hand, with whether the engine accepts playing it now. */
export interface HandCardView extends ActionCardView {
  playable: boolean;
}

/** One card played this round (face down cards show no number). */
export interface PlayView {
  player: PlayerId;
  mode: PlayMode;
  card: ActionCardView | null;
  zeroed: boolean;
  seized: boolean;
}

/** One ambition row: markers declared on it and every seat's count. */
export interface AmbitionRowView {
  id: AmbitionId;
  markers: { id: string; first: number; second: number }[];
  /** Highest first; ties keep seat order. */
  tallies: { player: PlayerId; value: number }[];
  /** 2 players: what the ambition box counts. */
  box: number | null;
  /** Who would take first and second place if the chapter ended now (engine ranking, tie rules applied). */
  first: PlayerId[];
  second: PlayerId[];
}

/** A Court card in the row, with the agents on it. */
export interface CourtCardView {
  slot: number;
  card: string;
  kind: CourtKind | null;
  resource: Resource | null;
  keys: number;
  /** Printed name, rules text and Crisis box (owner content; absent when not transcribed). */
  name?: string;
  text?: string;
  crisis?: string;
  /** Centre of the picture's main subject, [x, y] as fractions (crops keep it in view). */
  focus?: [number, number];
  /** Court set ('base' when absent). */
  set?: string;
  agents: { player: PlayerId; count: number }[];
}

/** A system on the map, with its pieces. */
export interface SystemView {
  id: string;
  cluster: string;
  kind: 'gate' | 'planet';
  resource: Resource | null;
  slots: number | null;
  inPlay: boolean;
  ships: { player: PlayerId; fresh: number; damaged: number }[];
  buildings: { owner: PlayerId; type: 'city' | 'starport'; damaged: boolean }[];
  /** The seat that controls the system (engine rule), or null. */
  controller: PlayerId | null;
  /** Systems linked to this one by an open link. */
  neighbors: string[];
}

/** Everything the table draws, for the seat `local`. */
export interface TableView {
  chapter: number;
  phase: GameState['phase']['type'];
  active: PlayerId | null;
  local: PlayerId;
  /** Other seats clockwise from the local one. */
  rivals: PlayerId[];
  supply: { resource: Resource; count: number }[];
  players: PlayerView[];
  lead: (ActionCardView & { zeroed: boolean }) | null;
  plays: PlayView[];
  /** Who seized the initiative this round, if anyone. */
  seizedBy: PlayerId | null;
  /** Action deck and discard pile sizes. */
  deck: number;
  discard: number;
  /** The latest log lines, newest first. */
  recent: string[];
  ambitions: AmbitionRowView[];
  markersLeft: { id: string; first: number; second: number }[];
  court: CourtCardView[];
  courtDeck: number;
  hand: HandCardView[];
  /** The local player's turn budget, when they are taking actions. */
  budget: { remaining: number; kinds: ActionKind[]; preludeOpen: boolean } | null;
  battle: BattleRef | null;
  decision: Decision | null;
  winners: PlayerId[];
  /** Whether the local player may redraw the first hand now. */
  canMulligan: boolean;
  systems: SystemView[];
  links: [string, string][];
}

/** True when the engine accepts `cmd` in `state`. */
export function legal(ix: ContentIndex, state: GameState, cmd: Command): boolean {
  try {
    dispatch(ix, state, cmd);
    return true;
  } catch {
    return false;
  }
}

/** Why `cmd` is not legal now (the engine's message, untranslated), or null when it is. */
export function whyNot(ix: ContentIndex, state: GameState, cmd: Command): string | null {
  try {
    dispatch(ix, state, cmd);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Seats clockwise from `local`, without it. */
export function rivalsOf(playerCount: number, local: PlayerId): PlayerId[] {
  return Array.from({ length: playerCount - 1 }, (_, i) => (local + 1 + i) % playerCount);
}

function actionCard(ix: ContentIndex, id: string): ActionCardView | null {
  const d = ix.actionCards.get(id);
  if (!d) return null;
  return { card: id, suit: d.suit, number: d.number, pips: d.pips, kinds: ix.content.suits[d.suit] ?? [] };
}

function playerView(ix: ContentIndex, s: GameState, id: PlayerId): PlayerView {
  const p = s.players[id];
  const open = new Set(openSlots(ix.content, p));
  return {
    id,
    power: p.power,
    hasInitiative: s.initiative === id,
    isActive: activePlayer(s) === id,
    handCount: p.hand.length,
    slots: ix.content.playerBoard.slotKeys.map((keys, index) => ({
      index,
      resource: p.resources[index] ?? null,
      locked: !open.has(index),
      keys,
    })),
    outraged: [...p.outraged],
    stats: {
      trophies: p.trophies.length,
      captives: p.captives.length,
      ships: p.supply.ships,
      cities: p.supply.cities,
      starports: p.supply.starports,
      agents: p.supply.agents,
    },
    court: [...p.court],
    leader: p.leader ?? null,
    lore: [...(p.lore ?? [])],
    trophies: p.trophies.map((x) => ({ owner: x.owner, piece: x.piece })),
    captives: [...p.captives],
    cities: Array.from({ length: ix.content.citiesPerPlayer }, (_, i) => ({
      built: i < citiesBuilt(ix.content, p),
      slots: [...(ix.content.playerBoard.cityUnlocks[i] ?? [])],
      bonus: ix.content.playerBoard.cityBonusPower[i] ?? 0,
    })),
    held: RESOURCES.map((r) => ({ resource: r, count: p.resources.filter((x) => x === r).length })),
  };
}

/** Whether a hand card can be played now: led, or followed in any mode. */
function playable(ix: ContentIndex, s: GameState, local: PlayerId, card: string): boolean {
  if (activePlayer(s) !== local) return false;
  if (s.phase.type === 'lead') return legal(ix, s, { type: 'lead', player: local, card });
  if (s.phase.type === 'follow') {
    return (['surpass', 'pivot', 'copy'] as const).some((mode) => legal(ix, s, { type: 'follow', player: local, card, mode }));
  }
  return false;
}

/** What another seat is doing now, for the panel shown while you wait. */
export interface OthersTurnView {
  /** The seat whose turn it is. */
  player: PlayerId;
  phase: GameState['phase']['type'];
  /** Card actions left this turn (only while taking actions). */
  remaining: number | null;
  /** Its latest log lines this turn, oldest first. */
  live: string[];
  /** Who plays after it this round, or null when the round ends after it. */
  next: PlayerId | null;
}

/** The turn of the active seat as seen by the others, or null when nobody is acting. */
export function othersTurn(s: GameState, maxLines = 5): OthersTurnView | null {
  const player = activePlayer(s);
  if (player === null) return null;
  const live: string[] = [];
  for (let i = s.log.length - 1; i >= 0 && live.length < maxLines; i--) {
    if (!s.log[i].text.startsWith(`P${player} `)) break;
    live.unshift(s.log[i].text);
  }
  const after = (player + 1) % s.playerCount;
  const roundPlayer = s.phase.type === 'actions' ? s.phase.budget.player : player;
  const following = (roundPlayer + 1) % s.playerCount;
  return {
    player,
    phase: s.phase.type,
    remaining: s.phase.type === 'actions' ? s.phase.budget.remaining : null,
    live,
    next: s.phase.type === 'lead' ? after : following === s.round.leader ? null : following,
  };
}

/** Builds the table view of `s` for the seat `local`. */
export function tableView(ix: ContentIndex, s: GameState, local: PlayerId, lang = 'en'): TableView {
  const c = ix.content;
  const active = activePlayer(s);
  const leadPlay = s.round.plays.find((p) => p.mode === 'lead' && p.card);
  const leadCard = leadPlay?.card ? actionCard(ix, leadPlay.card) : null;

  const ambitions: AmbitionRowView[] = AMBITIONS.map((a) => {
    const tallies = s.players
      .map((p) => ({ player: p.id, value: ambitionMetric(c, p, a) + cartelMetric(ix, s, p.id, a) }))
      .sort((x, y) => y.value - x.value || x.player - y.player);
    const box = s.playerCount === 2 ? (s.ambitionBoxes[a] ?? []).length : null;
    const rank = rankAmbition(c, s, a, (p, amb) => cartelMetric(ix, s, p, amb));
    const seat = (ids: PlayerId[]) => ids.filter((p) => p < s.playerCount);
    return {
      id: a,
      markers: s.ambitions.declared[a].map((id) => ({ id, ...markerValues(c, id, s.chapter) })),
      tallies,
      box,
      first: seat(rank.first),
      second: seat(rank.second),
    };
  });

  const ph = s.phase;
  const budget = ph.type === 'actions' && ph.budget.player === local
    ? { remaining: ph.budget.remaining, kinds: [...ph.budget.kinds], preludeOpen: !ph.budget.preludeOver }
    : null;

  return {
    chapter: s.chapter,
    phase: ph.type,
    active,
    local,
    rivals: rivalsOf(s.playerCount, local),
    supply: RESOURCES.map((r) => ({ resource: r, count: s.resourceSupply[r] ?? 0 })),
    players: s.players.map((p) => playerView(ix, s, p.id)),
    lead: leadCard ? { ...leadCard, zeroed: !!leadPlay?.zeroed } : null,
    plays: s.round.plays.map((p) => ({
      player: p.player,
      mode: p.mode,
      card: p.card && p.faceUp ? actionCard(ix, p.card) : null,
      zeroed: !!p.zeroed,
      seized: !!p.seized,
    })),
    seizedBy: s.round.seizedBy,
    deck: s.deck.length,
    discard: s.discard.length,
    recent: s.log.slice(-6).reverse().map((l) => l.text),
    ambitions,
    markersLeft: s.ambitions.available.map((id) => ({ id, ...markerValues(c, id, s.chapter) })),
    court: s.court.map((slot, i) => {
      const d = ix.courtCards.get(slot.card);
      return {
        slot: i,
        card: slot.card,
        kind: d?.kind ?? null,
        resource: d?.resource ?? null,
        keys: Number(d?.keys ?? 0),
        ...cardWords(d, lang),
        focus: d?.artFocus,
        set: d?.set,
        agents: Object.entries(slot.agents)
          .filter(([, n]) => n > 0)
          .map(([p, n]) => ({ player: Number(p), count: n })),
      };
    }),
    courtDeck: s.courtDeck.length,
    hand: s.players[local].hand
      .map((id) => actionCard(ix, id))
      .filter((x): x is ActionCardView => x !== null)
      .map((card) => ({ ...card, playable: playable(ix, s, local, card.card) })),
    budget,
    battle: ph.type === 'allocate' ? ph.battle : null,
    decision: ph.type === 'decide' ? ph.decision : null,
    winners: ph.type === 'gameOver' ? [...ph.winners] : [],
    canMulligan: ph.type === 'lead' && s.mulligan === local,
    systems: c.map.systems.map((d) => {
      const st = s.map[d.id];
      const open = openLinks(c.map.links, s);
      return {
        controller: s.players.find((p) => controls(st, p.id))?.id ?? null,
        neighbors: open.filter(([a, b]) => a === d.id || b === d.id).map(([a, b]) => (a === d.id ? b : a)),
        id: d.id,
        cluster: d.cluster,
        kind: d.kind,
        resource: s.planetTypes?.[d.id] ?? d.resource ?? null,
        slots: d.slots ?? null,
        inPlay: st.inPlay,
        ships: Object.entries(st.ships)
          .filter(([, v]) => v.fresh + v.damaged > 0)
          .map(([p, v]) => ({ player: Number(p), fresh: v.fresh, damaged: v.damaged })),
        buildings: st.buildings.map((b) => ({ owner: b.owner, type: b.type, damaged: b.damaged })),
      };
    }),
    links: openLinks(c.map.links, s),
  };
}

/** The map's links minus the closed ones, plus the ones the setup card opens. */
function openLinks(links: [string, string][], s: GameState): [string, string][] {
  const closed = (a: string, b: string) => s.closedLinks.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return [...links.filter(([a, b]) => !closed(a, b)), ...s.openLinks];
}
