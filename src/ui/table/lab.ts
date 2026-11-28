// The test lab (?lab=<id>, local games only): a game set up so one leader, lore,
// Court card or action card can be tried at once. Pure: it builds a GameState from
// the content and never touches the page; the panel is in labpanel.ts.
//
// The lab game is not a regular game: the seat to lead (seat 0) gets the item and
// what it needs to use it (a card of each suit, a token of each resource, more ships
// and a rival fleet with buildings in one of its systems). Every piece and token is
// taken from a supply, so the piece ledger stays the same as a new game's.

import { activePlayer, gainResource, newGame, openSlots, RESOURCES } from '../../game/engine';
import type { ContentIndex, GameState, PlayerCount } from '../../game/engine';
import { battleScenario } from './scenario';

/** What the lab can set up. */
export type LabKind = 'leader' | 'lore' | 'court' | 'action';

/** One item of the lab's list. */
export interface LabItem {
  kind: LabKind;
  id: string;
  /** Content set: 'base', 'pack' (lore), 'campaign' (Court cards tried outside a campaign). */
  set: string;
}

/** Tuning of the lab game. */
export const LAB = {
  /** Seats at the table (4 for the action cards printed for 4 players). */
  players: 3 as PlayerCount,
  /** Extra fresh ships for the seat trying the item, in its system facing the rival. */
  extraShips: 3,
  /** Agents of the seat trying a decree, on the decree in the Court row. */
  decreeAgents: 3,
  /** The seat that tries the item and leads first. */
  seat: 0,
};

/** Every item the lab can set up, in list order: leaders, lore, Court cards, action cards. */
export function labItems(ix: ContentIndex): LabItem[] {
  const c = ix.content;
  return [
    ...(c.leaders ?? []).map((l) => ({ kind: 'leader' as const, id: l.id, set: (l as { set?: string }).set ?? 'base' })),
    ...(c.loreCards ?? []).map((l) => ({ kind: 'lore' as const, id: l.id, set: l.set ?? 'base' })),
    ...c.courtCards.map((x) => ({ kind: 'court' as const, id: x.id, set: x.set ?? 'base' })),
    ...c.actionCards.map((x) => ({ kind: 'action' as const, id: x.id, set: 'base' })),
  ];
}

/** The lab item with this id, or null. */
export function labItem(ix: ContentIndex, id: string): LabItem | null {
  return labItems(ix).find((x) => x.id === id) ?? null;
}

/**
 * A game ready for seat 0 to try `id`: seat 0 leads, holds the item (as its leader,
 * its lore, a card in its Court, a decree with its agents in the Court row, or a card
 * in hand), a card of each suit, a token of each resource that fits, extra ships and
 * a rival fleet with a city and a starport in one of its systems.
 * Throws for an unknown id.
 */
export function labGame(ix: ContentIndex, id: string, seed = 1): GameState {
  const item = labItem(ix, id);
  if (!item) throw new Error(`Unknown lab item ${id}`);
  const c = ix.content;
  const action = item.kind === 'action' ? ix.actionCards.get(id) : undefined;
  const n = Math.max(LAB.players, action?.minPlayers ?? 0) as PlayerCount;
  const me = LAB.seat;

  // Leaders and lore for every seat, seat 0's being the item when it is one.
  const leaderIds = (c.leaders ?? []).map((l) => l.id);
  const loreIds = (c.loreCards ?? []).filter((l) => (l.set ?? 'base') === 'base').map((l) => l.id);
  const pick = (all: string[], first: string | null) => {
    const rest = all.filter((x) => x !== first);
    return Array.from({ length: n }, (_, i) => (i === me && first ? first : rest[i]));
  };
  const leaders = pick(leaderIds, item.kind === 'leader' ? id : null);
  const lore = pick(loreIds, item.kind === 'lore' ? id : null).map((l) => [l]);
  let s = newGame(ix, { playerCount: n, seed, firstPlayer: me, variant: 'leaders', leaders, lore });
  s.mulligan = null;
  // Seat 0 leads, or first makes its leader's setup choice (the Archivist's lore).
  if (activePlayer(s) !== me) throw new Error(`Lab: seat ${me} does not lead`);

  // The rival fleet, city and starport (and a strong Aggression card in hand).
  s = battleScenario(ix, s, me);
  const p = s.players[me];

  // The hand: the item when it is an action card, then a card of each suit missing.
  const want: string[] = action ? [id] : [];
  for (const suit of Object.keys(c.suits)) {
    if (want.some((w) => ix.actionCards.get(w)?.suit === suit)) continue;
    const mine = p.hand.find((h) => ix.actionCards.get(h)?.suit === suit);
    const best = [...ix.actionCards.values()]
      .filter((a) => a.suit === suit && (a.minPlayers ?? 0) <= n && !want.includes(a.id))
      .sort((a, b) => b.pips - a.pips)[0];
    const card = mine ?? best?.id;
    if (card) want.push(card);
  }
  for (const card of want) bringToHand(s, me, card, want);

  // The item in place.
  if (item.kind === 'court') placeCourtCard(ix, s, me, id);

  // A token of each resource, as far as the open slots go.
  for (const r of RESOURCES) {
    if (p.resources.includes(r) || (s.resourceSupply[r] ?? 0) <= 0) continue;
    if (!openSlots(c, p).some((i) => !p.resources[i])) break;
    gainResource(c, p, r);
    s.resourceSupply[r]--;
  }
  delete p.arranging;

  // More ships where the rival fleet is (a system holding both fleets).
  const rivalIn = (x: GameState['map'][string]) =>
    Object.entries(x.ships).some(([k, v]) => Number(k) !== me && (v?.fresh ?? 0) + (v?.damaged ?? 0) > 0);
  const front = Object.values(s.map).find((x) => (x.ships[me]?.fresh ?? 0) > 0 && rivalIn(x));
  if (front) {
    const got = Math.min(LAB.extraShips, p.supply.ships);
    p.supply.ships -= got;
    front.ships[me]!.fresh += got;
  }
  return s;
}

/** Moves `card` into the hand of `seat`, swapping out a hand card that is not in `keep`. */
function bringToHand(s: GameState, seat: number, card: string, keep: string[]): void {
  const hand = s.players[seat].hand;
  if (hand.includes(card)) return;
  const out = hand.findIndex((h) => !keep.includes(h));
  if (out < 0) return;
  const swap = hand[out];
  const holder = s.players.find((pl) => pl.hand.includes(card));
  const at = s.deck.indexOf(card);
  const disc = s.discard.indexOf(card);
  if (holder) holder.hand[holder.hand.indexOf(card)] = swap;
  else if (at >= 0) s.deck[at] = swap;
  else if (disc >= 0) s.discard[disc] = swap;
  else s.deck.push(swap);
  hand[out] = card;
}

/**
 * A faction card goes into the seat's Court; a decree goes into the Court row's first
 * slot with the seat's agents on it (the card it replaces goes under the Court deck,
 * its agents back to their owners).
 */
function placeCourtCard(ix: ContentIndex, s: GameState, seat: number, id: string): void {
  // Out of wherever it is: deck, discard, the Court row (refilled) or a seat's Court.
  s.courtDeck = s.courtDeck.filter((x) => x !== id);
  s.courtDiscard = s.courtDiscard.filter((x) => x !== id);
  for (const pl of s.players) pl.court = pl.court.filter((x) => x !== id);
  const inRow = s.court.findIndex((x) => x.card === id);
  if (inRow >= 0) {
    for (const [k, v] of Object.entries(s.court[inRow].agents)) s.players[Number(k)].supply.agents += v;
    const refill = s.courtDeck.shift();
    if (refill) s.court[inRow] = { card: refill, agents: {} };
    else s.court.splice(inRow, 1);
  }
  const def = ix.courtCards.get(id)!;
  const p = s.players[seat];
  if (def.kind === 'faction') {
    p.court.push(id);
    return;
  }
  const old = s.court[0];
  if (old) {
    for (const [k, v] of Object.entries(old.agents)) s.players[Number(k)].supply.agents += v;
    s.courtDeck.push(old.card);
  }
  const agents = Math.min(LAB.decreeAgents, p.supply.agents);
  p.supply.agents -= agents;
  const slot = { card: id, agents: { [seat]: agents } as Record<number, number> };
  if (old) s.court[0] = slot;
  else s.court.unshift(slot);
}
