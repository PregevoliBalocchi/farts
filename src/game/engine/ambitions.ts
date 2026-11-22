// Ambitions: declaration and end-of-chapter scoring (design/gdd/core-loop.md §3.3, §4).

import { AMBITIONS } from './types';
import { cityBonusPower, heldResources } from './board';
import type { AmbitionBoard, AmbitionId, GameContent, GameState, PlayerId, PlayerState } from './types';

/** A marker's first/second-place values in a chapter (it flips after `flipAfterChapter`). */
export function markerValues(c: GameContent, markerId: string, chapter: number): { first: number; second: number } {
  const def = c.ambitionMarkers.find((m) => m.id === markerId)!;
  const flipped = def.flipAfterChapter !== undefined && chapter > def.flipAfterChapter;
  return def.sides[Math.min(flipped ? 1 : 0, def.sides.length - 1)];
}

/** All markers available for `chapter`, best first; nothing declared. */
export function emptyAmbitionBoard(c: GameContent, chapter: number): AmbitionBoard {
  const order = c.ambitionMarkers
    .map((m) => ({ id: m.id, v: markerValues(c, m.id, chapter) }))
    .sort((a, b) => b.v.first - a.v.first || b.v.second - a.v.second);
  return {
    declared: Object.fromEntries(AMBITIONS.map((a) => [a, []])) as unknown as Record<AmbitionId, string[]>,
    available: order.map((m) => m.id),
  };
}

/** Ambition a card number declares: a fixed one, 'any' (the player picks), or null if it can't declare. */
export function ambitionForNumber(c: GameContent, n: number): AmbitionId | 'any' | null {
  return c.declareByNumber[String(n)] ?? null;
}

/** Places the highest available marker on `ambition`. Returns the marker id. */
export function declareAmbition(state: GameState, ambition: AmbitionId): string {
  const marker = state.ambitions.available.shift();
  if (!marker) throw new Error('No ambition marker available');
  state.ambitions.declared[ambition].push(marker);
  return marker;
}

/** The count a player has toward an ambition. */
export function ambitionMetric(c: GameContent, p: PlayerState, a: AmbitionId): number {
  const m = c.ambitionMetrics[a];
  switch (m.kind) {
    case 'captives':
      return p.captives.length;
    case 'trophies':
      return p.trophies.length;
    case 'resources': {
      // Tokens plus Guild cards of those suits (a Guild card counts like a resource of its suit).
      const wanted = new Set(m.resources ?? []);
      const cards = p.court.filter((id) => {
        const r = c.courtCards.find((x) => x.id === id)?.resource;
        return r !== undefined && wanted.has(r);
      }).length;
      return heldResources(p).filter((r) => wanted.has(r)).length + cards;
    }
  }
}

/** Ranking result for one ambition. */
export interface AmbitionRanking {
  ambition: AmbitionId;
  first: PlayerId[];
  second: PlayerId[];
  metrics: number[];
}

/**
 * Ranks players for one ambition applying the content's tie rules.
 * `extra` adds what cards give a player toward it (e.g. resources kept on a card).
 */
export function rankAmbition(c: GameContent, state: GameState, a: AmbitionId, extra: ExtraMetric = () => 0): AmbitionRanking {
  const metrics = state.players.map((p) => ambitionMetric(c, p, a) + extra(p.id, a));
  // 2 players: the ambition box counts as a third player (id = playerCount); it can place but gains nothing.
  if (state.playerCount === 2) metrics.push(boxMetric(c, state, a));
  const secondAllowed = true;
  const best = Math.max(...metrics);
  if (best <= 0) return { ambition: a, first: [], second: [], metrics };

  const top = idsWith(metrics, best);
  if (top.length > 1) {
    // Tie for first.
    const second = c.ties.firstTieDropsToSecond && secondAllowed ? top : [];
    return { ambition: a, first: c.ties.firstTieDropsToSecond ? [] : top, second, metrics };
  }
  if (!secondAllowed) return { ambition: a, first: top, second: [], metrics };

  const rest = metrics.map((v, i) => (i === top[0] ? -1 : v));
  const runner = Math.max(...rest);
  if (runner <= 0) return { ambition: a, first: top, second: [], metrics };
  const seconds = idsWith(rest, runner);
  return { ambition: a, first: top, second: seconds.length > 1 && c.ties.secondTieAwardsNone ? [] : seconds, metrics };
}


/** 2 players: what the tokens on an ambition box count for it (Weapons on Warlord count as trophies). */
export function boxMetric(c: GameContent, state: GameState, a: AmbitionId): number {
  const box = state.ambitionBoxes[a] ?? [];
  const m = c.ambitionMetrics[a];
  if (m.kind === 'trophies') return box.filter((r) => r === 'weapons').length;
  if (m.kind === 'captives') return 0;
  const wanted = new Set(m.resources ?? []);
  return box.filter((r) => wanted.has(r)).length;
}

/** Scores every declared ambition; mutates power. Returns rankings + gains for the log/UI. */
/** Per-player scoring rule from cards: `secondOnFirst` (first place pays the second-place value, no city bonus; second pays nothing), `firstOnly` (only an untied first place pays). */
export type ScoringRule = (p: PlayerId, a: AmbitionId) => { secondOnFirst: boolean; firstOnly: boolean };

/** What cards add to a player's count for an ambition. */
export type ExtraMetric = (p: PlayerId, a: AmbitionId) => number;

export function scoreAmbitions(
  c: GameContent,
  state: GameState,
  rule: ScoringRule = () => ({ secondOnFirst: false, firstOnly: false }),
  extra: ExtraMetric = () => 0,
): { rankings: AmbitionRanking[]; gains: number[] } {
  const gains = state.players.map(() => 0);
  const rankings: AmbitionRanking[] = [];
  for (const a of AMBITIONS) {
    const markers = state.ambitions.declared[a];
    if (!markers.length) continue;
    const r = rankAmbition(c, state, a, extra);
    rankings.push(r);
    for (const mid of markers) {
      const values = markerValues(c, mid, state.chapter);
      for (const p of r.first) if (p < gains.length) gains[p] += rule(p, a).secondOnFirst ? values.second : values.first;
      for (const p of r.second) {
        if (p >= gains.length) continue;
        const k = rule(p, a);
        if (!k.secondOnFirst && !k.firstOnly) gains[p] += values.second;
      }
    }
    // Bonus spaces uncovered by built cities: once per ambition won (first place).
    for (const p of r.first) if (p < gains.length && !rule(p, a).secondOnFirst) gains[p] += cityBonusPower(c, state.players[p]);
  }
  state.players.forEach((p, i) => (p.power += gains[i]));
  return { rankings, gains };
}

function idsWith(values: number[], v: number): PlayerId[] {
  return values.flatMap((x, i) => (x === v ? [i] : []));
}
