// Answers to a pending card-effect Decision, as buttons instead of typed JSON.
// The UI does not know what each card asks: it proposes candidate answers built
// from the choice names effects read (a rival, a card, a system, a resource...),
// trial-dispatches each one, and keeps the legal ones that lead to different
// outcomes. Declining (empty answer) is always offered first when legal.

import { AMBITIONS, dispatch, RESOURCES } from '../../game/engine';
import type { ContentIndex, GameState, PlayerId } from '../../game/engine';

/** How a part of an answer is shown. */
export type DecisionPartKind = 'player' | 'card' | 'system' | 'cluster' | 'resource' | 'ambition' | 'court' | 'index' | 'flag' | 'ships' | 'cards';

/** One named choice inside an answer, e.g. { key: 'rival', kind: 'player', value: 2 }. */
export interface DecisionPart {
  key: string;
  kind: DecisionPartKind;
  value: unknown;
}

/** A legal answer: the `decide` args and how to describe them. `parts` is empty for "decline". */
export interface DecisionOption {
  args: Record<string, unknown>;
  parts: DecisionPart[];
}

/** Upper bound on trial dispatches per Decision, to keep the window responsive. */
const MAX_TRIALS = 800;

type Candidate = DecisionPart[];

/** Non-empty subsets of `xs` (first 10 items) with at most `max` items, smallest first. */
function subsets<T>(xs: T[], max: number): T[][] {
  const out: T[][] = [];
  const n = Math.min(xs.length, 10);
  for (let m = 1; m < 1 << n; m++) {
    const pick = xs.filter((_, i) => i < n && m & (1 << i));
    if (pick.length <= max) out.push(pick);
  }
  return out.sort((a, b) => a.length - b.length);
}

/** Candidate answers for the Decision `s` is waiting on, simplest first. */
function candidates(ix: ContentIndex, s: GameState, me: PlayerId): Candidate[] {
  if (s.phase.type !== 'decide') return [];
  const d = s.phase.decision;
  const rivals = s.players.map((p) => p.id).filter((p) => p !== me);
  const systems = Object.values(s.map).filter((x) => x.inPlay).map((x) => x.id);
  const clusters = [...new Set(ix.content.map.systems.filter((x) => s.map[x.id]?.inPlay).map((x) => x.cluster))];
  const offered = Array.isArray(d.data?.cards) ? (d.data!.cards as string[]) : [];
  const keep = typeof d.data?.keep === 'number' ? (d.data!.keep as number) : 0;
  const out: Candidate[] = [[]];
  const one = (key: string, kind: DecisionPartKind, values: readonly unknown[]) => {
    for (const value of values) out.push([{ key, kind, value }]);
  };

  one('ambition', 'ambition', AMBITIONS);
  one('resource', 'resource', RESOURCES);
  one('type', 'resource', RESOURCES);
  one('cluster', 'cluster', clusters);
  one('courtSlot', 'court', s.court.map((_, i) => i));
  for (const set of subsets(s.court.map((_, i) => i), s.court.length)) out.push([{ key: 'courtSlots', kind: 'court', value: set }]);
  if (offered.length && keep) {
    for (const set of subsets(offered, keep)) if (set.length === keep) out.push([{ key: 'keep', kind: 'cards', value: set }]);
  }
  for (const r of rivals) {
    out.push([{ key: 'rival', kind: 'player', value: r }]);
    for (const card of s.players[r].court) out.push([{ key: 'card', kind: 'card', value: card }, { key: 'from', kind: 'player', value: r }]);
  }
  for (const id of systems) {
    out.push([{ key: 'system', kind: 'system', value: id }]);
    const n = s.map[id].buildings.length;
    for (let index = 0; index < n; index++) {
      out.push([{ key: 'system', kind: 'system', value: id }, { key: 'index', kind: 'index', value: index }]);
      out.push([{ key: 'system', kind: 'system', value: id }, { key: 'index', kind: 'index', value: index }, { key: 'seize', kind: 'flag', value: true }]);
    }
    // Fresh ships moved in from one neighbouring system (a reaction before dice).
    const fresh = s.map[id].ships[me]?.fresh ?? 0;
    for (let ships = 1; ships <= fresh; ships++) out.push([{ key: 'moves', kind: 'ships', value: [{ from: id, ships }] }]);
  }
  // Swapping a card with a rival after looking at their hand: the largest group, last.
  for (const r of rivals) {
    for (const give of s.players[me].hand) {
      for (const take of s.players[r].hand) {
        out.push([{ key: 'rival', kind: 'player', value: r }, { key: 'give', kind: 'card', value: give }, { key: 'take', kind: 'card', value: take }]);
      }
    }
  }
  return out;
}

function argsOf(c: Candidate): Record<string, unknown> {
  return Object.fromEntries(c.map((p) => [p.key, p.value]));
}

/**
 * The legal, distinct answers to the Decision `s` waits on for player `me`.
 * Two answers that leave the game in the same state are one option (the
 * simpler is kept). Empty when no Decision is pending for `me`.
 */
export function decisionOptions(ix: ContentIndex, s: GameState, me: PlayerId): DecisionOption[] {
  if (s.phase.type !== 'decide' || s.phase.decision.player !== me) return [];
  const seen = new Set<string>();
  const out: DecisionOption[] = [];
  let trials = 0;
  for (const c of candidates(ix, s, me)) {
    if (trials++ >= MAX_TRIALS) break;
    const args = argsOf(c);
    let next: GameState;
    try {
      next = dispatch(ix, s, { type: 'decide', player: me, args });
    } catch {
      continue;
    }
    const key = JSON.stringify(next);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ args, parts: c });
  }
  return out;
}
