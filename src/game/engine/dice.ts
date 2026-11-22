// Combat dice (design/gdd/core-loop.md §3.1). Face lists come from content;
// this module only rolls and totals symbols, deterministically from the state RNG.

import { nextInt } from './rng';
import type { RngHolder } from './rng';
import type { DieFace, DieType, GameContent } from './types';

/** How many dice of each type to roll. */
export type DicePool = Partial<Record<DieType, number>>;

/** Totals of every symbol rolled. */
export interface DiceTotals {
  hit: number;
  selfHit: number;
  buildingHit: number;
  key: number;
  intercept: number;
}

/** Result of a roll: each face rolled plus totals. */
export interface RollResult {
  faces: { type: DieType; face: DieFace }[];
  totals: DiceTotals;
}

const DIE_ORDER: readonly DieType[] = ['skirmish', 'assault', 'raid'];

/** Rolls a pool. Throws if a die type in the pool has no faces in content. */
export function rollDice(c: GameContent, rng: RngHolder, pool: DicePool): RollResult {
  const faces: RollResult['faces'] = [];
  for (const type of DIE_ORDER) {
    const n = pool[type] ?? 0;
    const def = c.dice[type];
    if (n > 0 && !def?.length) throw new Error(`No faces defined for die '${type}'`);
    for (let i = 0; i < n; i++) faces.push({ type, face: def[nextInt(rng, def.length)] });
  }
  return { faces, totals: totalFaces(faces.map((f) => f.face)) };
}

/** Sums symbols over faces. */
export function totalFaces(faces: DieFace[]): DiceTotals {
  const t: DiceTotals = { hit: 0, selfHit: 0, buildingHit: 0, key: 0, intercept: 0 };
  for (const f of faces) {
    t.hit += f.hit ?? 0;
    t.selfHit += f.selfHit ?? 0;
    t.buildingHit += f.buildingHit ?? 0;
    t.key += f.key ?? 0;
    t.intercept += f.intercept ?? 0;
  }
  return t;
}
