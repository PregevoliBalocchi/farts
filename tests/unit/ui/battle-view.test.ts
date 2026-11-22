// The battle view's helpers (src/ui/table/battle.ts): which official picture
// and face index a rolled die face maps to, what the chosen hits leave on the
// table, how many hits are still to place, and which clicks may take a hit.
import { describe, expect, it } from 'vitest';
import type { Allocation, BattleRef } from '../../../src/game/engine';
import { addHit, battleAfter, emptyAllocation, faceIndex, faceKey, facePicture, hitsLeft } from '../../../src/ui/table/battle';
import type { BattleForces } from '../../../src/ui/table/battle';

/** A battle with the given symbol totals (attacker seat 0, defender seat 1). */
function battle(totals: Partial<BattleRef['totals']> = {}, interceptHits = 0): BattleRef {
  return { attacker: 0, target: 1, system: 's', totals: { hit: 0, selfHit: 0, buildingHit: 0, key: 0, intercept: 0, ...totals }, interceptHits };
}

/** Two fresh ships each, one damaged defender, and one defender city plus a third seat's starport. */
function forces(): BattleForces {
  return {
    attacker: { fresh: 2, damaged: 0 },
    defender: { fresh: 2, damaged: 1 },
    buildings: [
      { owner: 1, type: 'city', damaged: false },
      { owner: 2, type: 'starport', damaged: false },
    ],
  };
}

const none = (): Allocation => ({ selfHits: [], hits: [], buildingHits: [] });

describe('die faces', () => {
  it('keys a face by its symbols, in a stable order, blank as empty', () => {
    expect(faceKey({ selfHit: 1, hit: 2 })).toBe('hit2|selfHit1');
    expect(faceKey({ hit: 0 })).toBe('');
    expect(faceKey({})).toBe('');
  });

  it('maps faces to the official dice pictures', () => {
    expect(facePicture('skirmish', { hit: 1 })).toBe('dice.skirmish-1-3');
    expect(facePicture('skirmish', {})).toBe('dice.skirmish-4-5');
    expect(facePicture('assault', { hit: 2, selfHit: 1 })).toBe('dice.assault-3');
    expect(facePicture('raid', { key: 2, intercept: 1 })).toBe('dice.raid-1');
    expect(facePicture('raid', { hit: 9 })).toBeNull();
  });

  it('finds which face of the die came up, the first match, 0 when absent', () => {
    const faces = [{ hit: 1 }, {}, { hit: 1 }];
    expect(faceIndex(faces, {})).toBe(1);
    expect(faceIndex(faces, { hit: 1 })).toBe(0);
    expect(faceIndex(faces, { key: 1 })).toBe(0);
  });
});

describe('battleAfter', () => {
  it('damages fresh ships, destroys damaged ones, and wrecks buildings in two hits', () => {
    const after = battleAfter(forces(), { selfHits: ['fresh'], hits: ['fresh', 'damaged', 'damaged'], buildingHits: [0, 0] });
    expect(after.attacker).toEqual({ fresh: 1, damaged: 1, destroyed: 0 });
    expect(after.defender).toEqual({ fresh: 1, damaged: 0, destroyed: 2 });
    expect(after.buildings).toEqual(['destroyed', 'ok']);
  });

  it('ignores a hit on a ship kind that is not there', () => {
    const after = battleAfter(forces(), { selfHits: ['damaged'], hits: [], buildingHits: [] });
    expect(after.attacker).toEqual({ fresh: 2, damaged: 0, destroyed: 0 });
  });
});

describe('hitsLeft', () => {
  it('counts intercept hits as hits on the attacker', () => {
    const b = battle({ hit: 2, selfHit: 1, buildingHit: 1 }, 2);
    expect(hitsLeft(b, none())).toEqual({ hits: 2, buildingHits: 1, selfHits: 3 });
    expect(hitsLeft(b, { selfHits: ['fresh'], hits: ['fresh', 'fresh'], buildingHits: [] })).toEqual({ hits: 0, buildingHits: 1, selfHits: 2 });
  });
});

describe('addHit', () => {
  it('puts hits on the defender and self hits on the attacker, until none are left', () => {
    const b = battle({ hit: 1, selfHit: 1 });
    const one = addHit(forces(), b, none(), { side: 'defender', ship: 'fresh' });
    expect(one?.hits).toEqual(['fresh']);
    expect(addHit(forces(), b, one!, { side: 'defender', ship: 'fresh' })).toBeNull();
    expect(addHit(forces(), b, one!, { side: 'attacker', ship: 'fresh' })?.selfHits).toEqual(['fresh']);
  });

  it('refuses a ship kind the side no longer has', () => {
    const b = battle({ hit: 3 });
    expect(addHit(forces(), b, none(), { side: 'attacker', ship: 'damaged' })).toBeNull();
    let al = none();
    al = addHit(forces(), b, al, { side: 'defender', ship: 'damaged' })!;
    expect(addHit(forces(), b, al, { side: 'defender', ship: 'damaged' })).toBeNull();
  });

  it('sends building hits only to the defender’s buildings', () => {
    const b = battle({ buildingHit: 1 });
    expect(addHit(forces(), b, none(), { building: 0 })?.buildingHits).toEqual([0]);
    expect(addHit(forces(), b, none(), { building: 1 })).toBeNull();
  });

  it('lets ordinary hits reach buildings only once the defender has no ships', () => {
    const b = battle({ hit: 1 });
    expect(addHit(forces(), b, none(), { building: 0 })).toBeNull();
    const bare = { ...forces(), defender: { fresh: 0, damaged: 0 } };
    expect(addHit(bare, b, none(), { building: 0 })?.hits).toEqual([{ building: 0 }]);
  });

  it('empties the hits but keeps the raid', () => {
    const al: Allocation = { selfHits: ['fresh'], hits: ['damaged'], buildingHits: [0], raid: [{ resource: 1 }] };
    expect(emptyAllocation(al)).toEqual({ selfHits: [], hits: [], buildingHits: [], raid: [{ resource: 1 }] });
  });
});
