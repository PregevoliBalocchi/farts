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
  | { step: 'to'; from: string; prelude?: Resource }
  | { step: 'court'; kind: 'influence' | 'secure'; prelude?: Resource }
  | { step: 'build'; system: string; prelude?: Resource }
  | { step: 'repair'; system: string; prelude?: Resource }
  | { step: 'tax'; system: string; prelude?: Resource }
  | { step: 'move'; from: string; to: string; ships: number; damaged: number; prelude?: Resource }
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

/** The move payload of a 'move' intent (damaged ships only when some are moved). */
export function movePayload(i: Extract<Intent, { step: 'move' }>): ActionPayload {
  return { kind: 'move', from: i.from, to: i.to, ships: i.ships, ...(i.damaged ? { damaged: i.damaged } : {}) };
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
