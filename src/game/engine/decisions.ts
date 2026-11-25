// How each Decision is answered (production/piano-blindatura-tavolo-2026-11-25.md, decision A, "D0").
//
// A Decision is a question a card or an event asks a player (types.ts `Decision`). The effect that asks it
// also says how it is answered: what the empty answer `{}` does, and the answers to try, each as named
// parts the table can draw (a rival, a card, a system...). The table offers the answers the engine
// accepts; it no longer guesses what each card wants. The engine itself uses the description to resolve
// a choice nobody can make (D2: a choice that may be declined with no legal answer does not ask).

import { effectOf } from './effects';
import type { ContentIndex } from './setup';
import type { Decision, GameState, PlayerId } from './types';

/**
 * How a part of an answer is shown. `fleet`: ships of several players as { [player]: { fresh, damaged } };
 * `slots`: own resource slots; `gift`: a card given, `{ card, to? }`; `word`: a fixed choice named by an
 * i18n key (`decide.word.<value>`); `take`: what to take from each seat, `{ [seat]: what }`.
 */
export type DecisionPartKind =
  | 'player'
  | 'players'
  | 'card'
  | 'system'
  | 'cluster'
  | 'resource'
  | 'ambition'
  | 'court'
  | 'index'
  | 'flag'
  | 'ships'
  | 'cards'
  | 'slot'
  | 'slots'
  | 'number'
  | 'resources'
  | 'dice'
  | 'fleet'
  | 'gift'
  | 'word'
  | 'take';

/** One named choice inside an answer, e.g. { key: 'rival', kind: 'player', value: 2 }. */
export interface DecisionPart {
  key: string;
  kind: DecisionPartKind;
  value: unknown;
}

/** An answer as the parts it is made of; the `decide` args are `{ [key]: value }`. */
export type DecisionAnswer = DecisionPart[];

/**
 * What the empty answer `{}` does: `decline` does nothing (the card's "may"), `default` takes the answer
 * the rules propose (campaign events, the dice first asked for), `none` is not allowed.
 */
export type EmptyAnswer = 'decline' | 'default' | 'none';

/** What an answer generator sees. */
export interface AskContext {
  ix: ContentIndex;
  state: GameState;
  /** The player answering. */
  player: PlayerId;
  /** Content id of the card that asks. */
  card: string;
  /** What the Decision offered (e.g. cards drawn to choose from). */
  data?: Record<string, unknown>;
}

/** How one Decision is answered. */
export interface DecisionAsk {
  empty: EmptyAnswer;
  /** Answers to try, simplest first; the engine keeps the legal ones. Never includes the empty answer. */
  answers: (ctx: AskContext) => DecisionAnswer[];
}

/** The attacker collecting dice after the defender's reactions: the dice first asked for (D1 adds the picker). */
const COLLECT_DICE: DecisionAsk = { empty: 'default', answers: () => [] };

/** Campaign event Decisions, registered by events.ts (it imports this module, so it fills the table). */
export const EVENT_ASKS: Record<string, DecisionAsk> = {};

/** How the Decision `d` is answered; undefined for an effect that never declared it (a test checks there is none). */
export function decisionAsk(ix: ContentIndex, d: Decision): DecisionAsk | undefined {
  if (d.effect === 'collectDice') return COLLECT_DICE;
  if (d.effect.startsWith('event:')) return EVENT_ASKS[d.effect];
  return effectOf(ix, d.card)?.asks?.[d.effect];
}

/** The answers to try for the Decision `d` (not checked: the table and the engine try them). */
export function decisionCandidates(ix: ContentIndex, s: GameState, d: Decision): DecisionAnswer[] {
  const ask = decisionAsk(ix, d);
  return ask ? ask.answers({ ix, state: s, player: d.player, card: d.card, data: d.data }) : [];
}

/** The `decide` args of an answer. */
export function argsOf(parts: DecisionAnswer): Record<string, unknown> {
  return Object.fromEntries(parts.map((p) => [p.key, p.value]));
}

/** Non-empty subsets of `xs` (first 16 items) with at most `max` items, smallest first. */
export function subsets<T>(xs: readonly T[], max: number): T[][] {
  const out: T[][] = [];
  const n = Math.min(xs.length, 16);
  for (let m = 1; m < 1 << n; m++) {
    const pick = xs.filter((_, i) => i < n && m & (1 << i));
    if (pick.length <= max) out.push(pick);
  }
  return out.sort((a, b) => a.length - b.length);
}

/** Subsets of exactly `n` items of `xs`, in order. */
export function choose<T>(xs: readonly T[], n: number): T[][] {
  if (n === 0) return [[]];
  if (xs.length < n) return [];
  const [head, ...rest] = xs;
  return [...choose(rest, n - 1).map((c) => [head, ...c]), ...choose(rest, n)];
}

/** Every multiset of at most `n` items taken from `xs` (order ignored), smallest first, without the empty one. */
export function subMultisets<T>(xs: readonly T[], n: number): T[][] {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  const kinds = [...counts.keys()];
  const out: T[][] = [];
  const walk = (i: number, acc: T[]) => {
    if (i === kinds.length) {
      if (acc.length) out.push(acc);
      return;
    }
    for (let k = 0; k <= counts.get(kinds[i])! && acc.length + k <= n; k++) walk(i + 1, [...acc, ...Array<T>(k).fill(kinds[i])]);
  };
  walk(0, []);
  return out.sort((a, b) => a.length - b.length);
}
