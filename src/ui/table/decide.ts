// Answers to a pending card-effect Decision and uses of card powers, as buttons instead of typed JSON.
// A Decision's answers come from the engine (decisions.ts: each card declares what it asks); the table
// trial-dispatches them and keeps the legal ones that lead to different outcomes. Card powers (Prelude
// abilities, card actions, rerolls) still build their candidates here from the choice names they read.

import { adjacent, AMBITIONS, argsOf, decisionAsk, decisionCandidates, dispatch, RESOURCES } from '../../game/engine';
import { effectOf } from '../../game/engine';
import type { Command, ContentIndex, DecisionPart, DecisionPartKind, GameState, PlayerId } from '../../game/engine';

export type { DecisionPart, DecisionPartKind } from '../../game/engine';

/** A legal answer: the `decide` args and how to describe them. `parts` is empty for the empty answer. */
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

/** Every multiset of `n` items of `xs` (order ignored), e.g. 2 of [a, b]: [a, a], [a, b], [b, b]. */
function multisets<T>(xs: readonly T[], n: number): T[][] {
  if (n === 0) return [[]];
  return xs.flatMap((x, i) => multisets(xs.slice(i), n - 1).map((rest) => [x, ...rest]));
}

/** Most Captives returned at once among the Ransom candidates (court-12: any mix of resources). */
const MAX_RANSOM = 4;
/** Most resources exchanged at once among the Tycoon's Charm candidates (lore-28). */
const MAX_EXCHANGE = 3;

/** Candidate choices for a card ability (a Decision's answers come from the engine), simplest first. */
function candidates(ix: ContentIndex, s: GameState, me: PlayerId, powers = true): Candidate[] {
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
    // Cards from the hand: any number of them (Farseers redraws as many as you like, court-17).
    for (const set of subsets(pl.hand, pl.hand.length)) out.push([{ key: 'cards', kind: 'cards', value: set }]);
    // Captives returned, each for any resource (Prison Wardens, court-12): every mix.
    for (let n = 1; n <= pl.captives.length; n++) {
      out.push([{ key: 'count', kind: 'number', value: n }]);
      if (n <= MAX_RANSOM) for (const set of multisets(RESOURCES, n)) out.push([{ key: 'resources', kind: 'resources', value: set }]);
    }
    // Material and Fuel exchanged for any resources (Tycoon's Charm, lore-28).
    const mf = pl.resources.map((r, i) => (r === 'material' || r === 'fuel' ? i : -1)).filter((i) => i >= 0);
    for (const slots of subsets(mf, MAX_EXCHANGE)) {
      for (const gain of multisets(RESOURCES, slots.length)) late.push([{ key: 'slots', kind: 'slots', value: slots }, { key: 'gain', kind: 'resources', value: gain }]);
    }
    const present = (id: string, p: PlayerId) => (s.map[id].ships[p]?.fresh ?? 0) + (s.map[id].ships[p]?.damaged ?? 0) > 0;
    for (const id of systems) {
      const fresh = s.map[id].ships[me]?.fresh ?? 0;
      const near = systems.filter((x) => x !== id && adjacent(ix, s, id, x));
      // Firing at an adjacent system (Galactic Rifles, lore-02): from where, at where, at whom.
      if (fresh > 0) {
        for (const at of near) {
          for (const r of rivals) {
            if (present(at, r) || s.map[at].buildings.some((b) => b.owner === r)) out.push([{ key: 'system', kind: 'system', value: id }, { key: 'at', kind: 'system', value: at }, { key: 'target', kind: 'player', value: r }]);
          }
        }
        // A ship sacrificed to destroy a Rival's there (Survival Overrides, lore-18): fresh or damaged.
        for (const r of rivals) {
          if ((s.map[id].ships[r]?.fresh ?? 0) > 0) out.push([{ key: 'system', kind: 'system', value: id }, { key: 'target', kind: 'player', value: r }]);
          if ((s.map[id].ships[r]?.damaged ?? 0) > 0) out.push([{ key: 'system', kind: 'system', value: id }, { key: 'target', kind: 'player', value: r }, { key: 'damaged', kind: 'flag', value: true }]);
        }
      }
      // Ships of any player guided to an adjacent system (Force Beams, lore-16): one player's, or everyone's.
      const here = s.players.map((p) => p.id).filter((p) => present(id, p));
      if (!here.length) continue;
      const fleets: Record<string, { fresh?: number; damaged?: number }>[] = [Object.fromEntries(here.map((p) => [p, { fresh: s.map[id].ships[p]?.fresh ?? 0, damaged: s.map[id].ships[p]?.damaged ?? 0 }]))];
      for (const p of here) {
        const f = s.map[id].ships[p]?.fresh ?? 0;
        const d = s.map[id].ships[p]?.damaged ?? 0;
        for (let n = 1; n <= f; n++) fleets.push({ [p]: { fresh: n } });
        for (let n = 1; n <= d; n++) fleets.push({ [p]: { damaged: n } });
        if (f && d && here.length > 1) fleets.push({ [p]: { fresh: f, damaged: d } });
      }
      for (const to of near) for (const ships of fleets) late.push([{ key: 'from', kind: 'system', value: id }, { key: 'to', kind: 'system', value: to }, { key: 'ships', kind: 'fleet', value: ships }]);
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
  // ...or from several (Predictive Sensors, lore-15): every fresh ship of each neighbouring system.
  const at = s.battleSetup?.system;
  if (at) {
    const sources = systems.filter((id) => id !== at && (s.map[id].ships[me]?.fresh ?? 0) > 0 && adjacent(ix, s, id, at));
    for (const set of subsets(sources, sources.length)) if (set.length > 1) out.push([{ key: 'moves', kind: 'ships', value: set.map((from) => ({ from, ships: s.map[from].ships[me]?.fresh ?? 0 })) }]);
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

/**
 * The legal, distinct answers to the Decision `s` waits on for player `me`, from the answers the
 * engine declares for it (decisions.ts). Two answers that leave the game in the same state are one
 * option (the simpler is kept). The empty answer (no parts) comes first when it declines; when it takes
 * the rules' default it comes last, merged into the answer it equals (keep the Policy, make no Outlaw).
 * Empty when no Decision is pending for `me`.
 */
export function decisionOptions(ix: ContentIndex, s: GameState, me: PlayerId): DecisionOption[] {
  if (s.phase.type !== 'decide' || s.phase.decision.player !== me) return [];
  const d = s.phase.decision;
  const empty = decisionAsk(ix, d)?.empty ?? 'decline';
  const seen = new Set<string>();
  const out: DecisionOption[] = [];
  const offer = (parts: DecisionPart[]) => {
    const args = argsOf(parts);
    let next: GameState;
    try {
      next = dispatch(ix, s, { type: 'decide', player: me, args });
    } catch {
      return;
    }
    const key = JSON.stringify(next);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ args, parts });
  };
  if (empty === 'decline') offer([]);
  let trials = 0;
  for (const parts of decisionCandidates(ix, s, d)) {
    if (trials++ >= MAX_TRIALS) break;
    offer(parts);
  }
  if (empty === 'default') offer([]);
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
  for (const c of candidates(ix, s, me)) {
    const args = Object.fromEntries(c.map((p) => [p.key, p.value]));
    if (trials++ >= MAX_POWER_TRIALS) break;
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
