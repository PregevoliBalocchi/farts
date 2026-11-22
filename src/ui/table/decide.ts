// Answers to a pending card-effect Decision, as buttons instead of typed JSON.
// The UI does not know what each card asks: it proposes candidate answers built
// from the choice names effects read (a rival, a card, a system, a resource...),
// trial-dispatches each one, and keeps the legal ones that lead to different
// outcomes. Declining (empty answer) is always offered first when legal.

import { AMBITIONS, dispatch, RESOURCES } from '../../game/engine';
import { effectOf } from '../../game/engine';
import type { Command, ContentIndex, GameState, PlayerId } from '../../game/engine';

/** How a part of an answer is shown. */
export type DecisionPartKind = 'player' | 'card' | 'system' | 'cluster' | 'resource' | 'ambition' | 'court' | 'index' | 'flag' | 'ships' | 'cards' | 'slot' | 'number' | 'resources' | 'dice';

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

/** Candidate answers for the Decision `s` is waiting on (or, with `powers`, for a card ability), simplest first. */
function candidates(ix: ContentIndex, s: GameState, me: PlayerId, powers = false): Candidate[] {
  if (s.phase.type !== 'decide' && !powers) return [];
  const d = s.phase.type === 'decide' ? s.phase.decision : null;
  const rivals = s.players.map((p) => p.id).filter((p) => p !== me);
  const systems = Object.values(s.map).filter((x) => x.inPlay).map((x) => x.id);
  const clusters = [...new Set(ix.content.map.systems.filter((x) => s.map[x.id]?.inPlay).map((x) => x.cluster))];
  const offered = Array.isArray(d?.data?.cards) ? (d!.data!.cards as string[]) : [];
  const keep = typeof d?.data?.keep === 'number' ? (d!.data!.keep as number) : 0;
  const out: Candidate[] = [[]];
  /** Large groups tried last, so the trial budget reaches every simple answer first. */
  const late: Candidate[] = [];
  const one = (key: string, kind: DecisionPartKind, values: readonly unknown[]) => {
    for (const value of values) out.push([{ key, kind, value }]);
  };
  if (powers) {
    // Choices only card abilities ask for: a seat, a slot of your board or a Rival's,
    // cards from your hand, Captives to spend, a trade.
    const pl = s.players[me];
    one('player', 'player', s.players.map((p) => p.id));
    one('slot', 'slot', pl.resources.map((r, i) => (r ? i : -1)).filter((i) => i >= 0));
    for (const r of rivals) {
      out.push([{ key: 'from', kind: 'player', value: r }]);
      s.players[r].resources.forEach((res, i) => {
        if (res) out.push([{ key: 'from', kind: 'player', value: r }, { key: 'slot', kind: 'slot', value: i }]);
      });
    }
    for (const set of subsets(pl.hand, 3)) out.push([{ key: 'cards', kind: 'cards', value: set }]);
    for (let n = 1; n <= pl.captives.length; n++) {
      out.push([{ key: 'count', kind: 'number', value: n }]);
      for (const r of RESOURCES) out.push([{ key: 'resources', kind: 'resources', value: Array(n).fill(r) }]);
    }
    for (const id of systems) {
      for (const r of rivals) {
        for (const give of new Set(pl.resources.filter(Boolean))) {
          late.push([{ key: 'system', kind: 'system', value: id }, { key: 'rival', kind: 'player', value: r }, { key: 'give', kind: 'resource', value: give }]);
        }
      }
    }
  }

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
  return [...out, ...late];
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

/** One way to use a card power right now: the command to send and how to describe its choices. */
export interface PowerOption {
  card: string;
  /** The ability's name in the effect registry ('reroll' for a battle reroll). */
  ability: string;
  kind: 'prelude' | 'action' | 'reroll';
  cmd: Command;
  parts: DecisionPart[];
}

/** Trial budget per ability (abilities with many possible choices stop there). */
const MAX_POWER_TRIALS = 1500;

/** Legal, distinct uses of `make` over the candidate choices (as decisionOptions does for Decisions). */
function legalUses(ix: ContentIndex, s: GameState, me: PlayerId, make: (args: Record<string, unknown>) => Command): { args: Record<string, unknown>; parts: DecisionPart[]; cmd: Command }[] {
  const seen = new Set<string>();
  const out: { args: Record<string, unknown>; parts: DecisionPart[]; cmd: Command }[] = [];
  let trials = 0;
  for (const c of candidates(ix, s, me, true)) {
    if (trials++ >= MAX_POWER_TRIALS) break;
    const args = argsOf(c);
    const cmd = make(args);
    let next: GameState;
    try {
      next = dispatch(ix, s, cmd);
    } catch {
      continue;
    }
    const key = JSON.stringify(next);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ args, parts: c, cmd });
  }
  return out;
}

/** Dice index groups a reroll may pick: each die alone, then every die that missed. */
function rerollSets(s: GameState): number[][] {
  if (s.phase.type !== 'allocate') return [];
  const faces = s.phase.battle.faces ?? [];
  const singles = faces.map((_, i) => [i]);
  const missed = faces.map((f, i) => (f.face.hit ? -1 : i)).filter((i) => i >= 0);
  return missed.length > 1 ? [...singles, missed, faces.map((_, i) => i)] : [...singles, faces.map((_, i) => i)];
}

/**
 * Every card power the local player can use now, from the cards they hold
 * (Court cards, lore, leader): "Prelude:" abilities, new actions "Name (Kind)",
 * and, while allocating a battle, rerolls. Each option is a command the engine
 * accepts; options with the same outcome are merged.
 */
export function cardPowers(ix: ContentIndex, s: GameState, me: PlayerId): PowerOption[] {
  const pl = s.players[me];
  const cards = [...pl.court, ...pl.lore, ...(pl.leader ? [pl.leader] : [])];
  const out: PowerOption[] = [];
  for (const card of cards) {
    const eff = effectOf(ix, card);
    if (!eff) continue;
    if (s.phase.type === 'actions') {
      for (const ability of Object.keys(eff.prelude ?? {})) {
        for (const u of legalUses(ix, s, me, (args) => ({ type: 'ability', player: me, card, ability, args }))) out.push({ card, ability, kind: 'prelude', cmd: u.cmd, parts: u.parts });
      }
      for (const name of Object.keys(eff.actions ?? {})) {
        for (const u of legalUses(ix, s, me, (args) => ({ type: 'action', player: me, action: { kind: 'card', card, name, args } }))) out.push({ card, ability: name, kind: 'action', cmd: u.cmd, parts: u.parts });
      }
    }
    if (eff.reroll && s.phase.type === 'allocate') {
      const seen = new Set<string>();
      for (const dice of rerollSets(s)) {
        const cmd: Command = { type: 'reroll', player: me, card, dice };
        try {
          const key = JSON.stringify(dispatch(ix, s, cmd));
          if (seen.has(key)) continue;
          seen.add(key);
        } catch {
          continue;
        }
        out.push({ card, ability: 'reroll', kind: 'reroll', cmd, parts: [{ key: 'dice', kind: 'dice', value: dice }] });
      }
    }
  }
  return out;
}
