// What the local player is in the middle of choosing (pick a system, then the
// options), and how that choice becomes an engine Command. Pure: table.ts keeps
// the current Intent and sends the Command; the engine decides if it is legal.

import type { ActionKind, ActionPayload, Command, DieType, PlayerId, Resource } from '../../game/engine';

/** Dice counts asked for a battle. */
export type Dice = Record<DieType, number>;

/** One step of building an action. `prelude`: the resource being spent for it, if any. */
export type Intent =
  | { step: 'idle' }
  | { step: 'choose'; prelude: Resource; kinds: ActionKind[] }
  | { step: 'system'; kind: 'tax' | 'build' | 'repair' | 'battle'; prelude?: Resource }
  | { step: 'from'; prelude?: Resource }
  /** `via`: systems already passed through on a Catapult move. */
  | { step: 'to'; from: string; via: string[]; prelude?: Resource }
  | { step: 'court'; kind: 'influence' | 'secure'; prelude?: Resource }
  /**
   * A planned route: `from`, through `via` (a Catapult), to `to`. `ships` and `damaged` leave `from`;
   * `drop` / `dropDamaged`: fresh / damaged ships left behind on the way, by system passed through.
   */
  | { step: 'move'; from: string; via: string[]; to: string; ships: number; damaged: number; drop: Record<string, number>; dropDamaged?: Record<string, number>; prelude?: Resource }
  | { step: 'battle'; system: string; target: PlayerId | null; dice: Dice; prelude?: Resource };

export const IDLE: Intent = { step: 'idle' };

/** First step after choosing an action kind. */
export function startAction(kind: ActionKind, prelude?: Resource): Intent {
  switch (kind) {
    case 'move':
      return { step: 'from', prelude };
    case 'influence':
    case 'secure':
      return { step: 'court', kind, prelude };
    default:
      return { step: 'system', kind, prelude };
  }
}

/** Wraps an action payload as a card action, or as a prelude spend of `prelude`. */
export function actionCommand(player: PlayerId, action: ActionPayload, prelude?: Resource): Command {
  return prelude ? { type: 'prelude', player, resource: prelude, action } : { type: 'action', player, action };
}

/**
 * The move payload of a 'move' intent: damaged ships only when some are moved;
 * for a Catapult, the systems passed through and the ships dropped there.
 * `ships` counts every fresh ship leaving `from`, dropped ones included.
 */
export function movePayload(i: Extract<Intent, { step: 'move' }>): ActionPayload {
  const dd = i.dropDamaged ?? {};
  const drop = i.via
    .filter((at) => (i.drop[at] ?? 0) > 0 || (dd[at] ?? 0) > 0)
    .map((at) => ({ at, ships: i.drop[at] ?? 0, ...((dd[at] ?? 0) > 0 ? { damaged: dd[at] } : {}) }));
  return {
    kind: 'move',
    from: i.from,
    to: i.to,
    ships: i.ships,
    ...(i.damaged ? { damaged: i.damaged } : {}),
    ...(i.via.length ? { via: [...i.via] } : {}),
    ...(drop.length ? { drop } : {}),
  };
}

/** A planned move. */
export type MoveIntent = Extract<Intent, { step: 'move' }>;

/** Every system of the route, in order: where it starts, the ones passed through, where it ends. */
export function routeOf(i: MoveIntent): string[] {
  return [i.from, ...i.via, i.to];
}

/** The route carried on one more step, to `id`: the old end becomes a system passed through. */
export function extendRoute(i: MoveIntent, id: string): MoveIntent {
  return { ...i, via: [...i.via, i.to], to: id };
}

/**
 * The route cut back to end at `id`, a system it passes through (null when
 * it does not): what was planned after it, and the ships left there, go.
 */
export function cutRoute(i: MoveIntent, id: string): MoveIntent | null {
  const k = i.via.indexOf(id);
  if (k < 0) return null;
  const via = i.via.slice(0, k);
  const keep = (r: Record<string, number> | undefined) => Object.fromEntries(Object.entries(r ?? {}).filter(([at]) => via.includes(at)));
  return { ...i, via, to: id, drop: keep(i.drop), ...(i.dropDamaged ? { dropDamaged: keep(i.dropDamaged) } : {}) };
}

/** Where the moving ships end up: each system passed through where some are left, then the end with the rest. */
export interface RouteStop {
  system: string;
  fresh: number;
  damaged: number;
  /** The end of the route. */
  last: boolean;
}

/** The ships at each stop of the route (stops with no ship left out, the end always in). */
export function routeStops(i: MoveIntent): RouteStop[] {
  const dd = i.dropDamaged ?? {};
  let fresh = i.ships;
  let damaged = i.damaged;
  const out: RouteStop[] = [];
  for (const at of i.via) {
    const f = Math.min(fresh, i.drop[at] ?? 0);
    const d = Math.min(damaged, dd[at] ?? 0);
    fresh -= f;
    damaged -= d;
    if (f + d > 0) out.push({ system: at, fresh: f, damaged: d, last: false });
  }
  out.push({ system: i.to, fresh, damaged, last: true });
  return out;
}

/**
 * Sets how many fresh (or damaged) ships are left at `at` on the way, kept
 * between 0 and what is still moving there; then every later drop is kept
 * within what is left.
 */
export function setDrop(i: MoveIntent, at: string, n: number, damaged = false): MoveIntent {
  const next: MoveIntent = damaged ? { ...i, dropDamaged: { ...(i.dropDamaged ?? {}), [at]: n } } : { ...i, drop: { ...i.drop, [at]: n } };
  return fitDrops(next);
}

/** The route with its drops kept within the ships moving (after the counts change). */
export function fitDrops(i: MoveIntent): MoveIntent {
  let fresh = i.ships;
  let damaged = i.damaged;
  const drop: Record<string, number> = {};
  const dropDamaged: Record<string, number> = {};
  for (const at of i.via) {
    drop[at] = clamp(i.drop[at] ?? 0, fresh);
    dropDamaged[at] = clamp(i.dropDamaged?.[at] ?? 0, damaged);
    fresh -= drop[at];
    damaged -= dropDamaged[at];
  }
  return { ...i, drop, dropDamaged };
}

/** The battle payload of a 'battle' intent, or null until a defender is chosen. */
export function battlePayload(i: Extract<Intent, { step: 'battle' }>): ActionPayload | null {
  if (i.target === null) return null;
  return { kind: 'battle', system: i.system, target: i.target, dice: { ...i.dice } };
}

/** Clamps a stepper value to 0..max. */
export function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(max, n));
}
