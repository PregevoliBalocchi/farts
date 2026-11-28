// Test scenarios for the table, opened with ?scenario=<name> (local games only).
// "battle": the seat about to lead gets a card that can battle and finds a rival
// fleet with buildings in one of its systems, so a battle can be fought at once.

import { activePlayer } from '../../game/engine';
import type { ContentIndex, GameState } from '../../game/engine';

/** Ships and buildings the battle scenario puts in the chosen system. */
export const BATTLE_SCENARIO = {
  attacker: { fresh: 4, damaged: 1 },
  defender: { fresh: 2, damaged: 1 },
  buildings: ['city', 'starport'] as const,
};

/**
 * The state with a battle ready for the seat about to lead: an Aggression card
 * in hand (the one with most actions), and in a planet system where it has
 * ships, its fleet facing a rival's fleet, city and starport (taken from their
 * supplies). Returns `s` unchanged outside the lead phase or when no system fits.
 * `seat` sets it up for that seat in any phase (the test lab, before a leader's setup choice).
 */
export function battleScenario(ix: ContentIndex, s: GameState, seat?: number): GameState {
  const who = seat ?? (s.phase.type === 'lead' ? activePlayer(s) : null);
  if (who === null) return s;
  const next = structuredClone(s);
  const me = next.players[who];
  const rival = next.players[(who + 1) % next.players.length];
  const mine = (x: GameState['map'][string]) => x.inPlay && (x.ships[who]?.fresh ?? 0) > 0;
  const sys = Object.values(next.map).find((x) => mine(x) && /-p\d/.test(x.id)) ?? Object.values(next.map).find(mine);
  if (!sys) return s;

  // A card whose suit can battle (Aggression), the one with most actions, swapped into the hand from wherever it is.
  const aggr = [...ix.actionCards.values()]
    .filter((c) => (ix.content.suits[c.suit] ?? []).includes('battle') && (c.minPlayers ?? 0) <= next.players.length)
    .sort((a, b) => b.pips - a.pips)[0];
  if (aggr && !me.hand.includes(aggr.id)) {
    const swap = me.hand[0];
    const holder = next.players.find((p) => p.hand.includes(aggr.id));
    const at = next.deck.indexOf(aggr.id);
    if (holder) holder.hand[holder.hand.indexOf(aggr.id)] = swap;
    else if (at >= 0) next.deck[at] = swap;
    if (holder || at >= 0) me.hand[0] = aggr.id;
  }

  const take = (p: typeof me, n: number) => {
    const got = Math.max(0, Math.min(n, p.supply.ships));
    p.supply.ships -= got;
    return got;
  };
  const had = sys.ships[who] ?? { fresh: 0, damaged: 0 };
  const a = BATTLE_SCENARIO.attacker;
  const got = take(me, a.fresh + a.damaged - had.fresh - had.damaged);
  const total = had.fresh + had.damaged + got;
  sys.ships[who] = { fresh: Math.max(1, total - a.damaged), damaged: Math.min(a.damaged, total - 1) };
  const d = BATTLE_SCENARIO.defender;
  const theirs = take(rival, d.fresh + d.damaged);
  sys.ships[rival.id] = { fresh: Math.max(0, theirs - d.damaged), damaged: Math.min(d.damaged, theirs) };
  for (const type of BATTLE_SCENARIO.buildings) {
    const key = type === 'city' ? 'cities' : 'starports';
    if (rival.supply[key] <= 0) continue;
    rival.supply[key]--;
    sys.buildings.push({ owner: rival.id, type, damaged: false });
  }
  return next;
}
