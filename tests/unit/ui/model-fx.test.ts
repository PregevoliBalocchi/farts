// Pure helpers behind the 3D piece models (src/ui/table/model-fx.ts): fitting,
// surface points for lights and fire, building bases, and ship flights.
import { describe, expect, it } from 'vitest';
import { arcHeight, easeInOut, engineSpots, fireSpots, fitModel, planMoves, rimSpots, triangleCorners, windowSpots } from '../../../src/ui/table/model-fx';
import type { ShipGroupAt } from '../../../src/ui/table/model-fx';

/** A box from -1..1 on every axis as 8 corner vertices, normals pointing out along y for the top four. */
function box(): { pos: number[]; nrm: number[] } {
  const pos: number[] = [];
  const nrm: number[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    pos.push(x, y, z);
    nrm.push(0, y, 0);
  }
  return { pos, nrm };
}

/** A ring of `n` upward-facing points at radius `r`, height `y`, wall points just under it, and an underside. */
function pad(n: number, r: number, y: number): { pos: number[]; nrm: number[] } {
  const pos: number[] = [];
  const nrm: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos.push(r * Math.cos(a), y, r * Math.sin(a));
    nrm.push(0, 1, 0);
    pos.push(r * Math.cos(a), y - 0.2, r * Math.sin(a));
    nrm.push(Math.cos(a), 0, Math.sin(a));
  }
  // The underside, so the walls stand above the ground floor.
  pos.push(0, y - 1, 0);
  nrm.push(0, -1, 0);
  return { pos, nrm };
}

describe('fitModel', () => {
  it('scales the largest dimension to the size and puts the base at the hover height', () => {
    const f = fitModel([-0.5, -0.25, -0.1], [0.5, 0.25, 0.1], { size: 0.5, hover: 0.1, rotateZ: 0 });
    expect(f.scale).toBeCloseTo(0.5);
    expect(-0.25 * f.scale + f.lift).toBeCloseTo(0.1);
  });
});

describe('surface points', () => {
  it('puts engines at the back (+X) of a ship, two when its rear is wide', () => {
    const { pos } = box();
    const e = engineSpots(pos);
    expect(e).toHaveLength(2);
    for (const p of e) expect(p.x).toBeGreaterThan(1);
  });

  it('puts landing lights evenly round the pad rim, just above it', () => {
    const { pos, nrm } = pad(24, 1, 0.2);
    const r = rimSpots(pos, nrm, 6);
    expect(r).toHaveLength(6);
    for (const p of r) {
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(0.9);
      expect(p.y).toBeCloseTo(0.21);
    }
  });

  it('lights windows only on walls above the ground floor, and the same ones every time', () => {
    const { pos, nrm } = pad(40, 1, 0.5);
    const w = windowSpots(pos, nrm, 5);
    expect(w.length).toBeGreaterThan(0);
    for (const p of w) expect(Math.abs(p.ny)).toBeLessThan(0.3);
    expect(windowSpots(pos, nrm, 5)).toEqual(w);
  });

  it('starts fire on upper, upward-facing faces', () => {
    const { pos, nrm } = box();
    for (const p of fireSpots(pos, nrm, 2)) {
      expect(p.ny).toBeGreaterThan(0.5);
      expect(p.y).toBeGreaterThan(0);
    }
  });
});

describe('triangleCorners', () => {
  it('makes an equilateral triangle of the given side, centred, one corner away from the viewer', () => {
    const c = triangleCorners(0.6);
    const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
    expect(d(c[0], c[1])).toBeCloseTo(0.6);
    expect(d(c[1], c[2])).toBeCloseTo(0.6);
    expect(d(c[2], c[0])).toBeCloseTo(0.6);
    expect(c.reduce((s, p) => s + p.z, 0)).toBeCloseTo(0);
    expect(c[0].z).toBeLessThan(0);
  });
});

describe('planMoves', () => {
  const g = (system: string, count: number, x: number, player = 0, damaged = false): ShipGroupAt => ({ player, damaged, system, count, x, z: 0 });

  it('flies a group that left one system into the system that gained it', () => {
    const moves = planMoves([g('a', 2, 0), g('b', 1, 5)], [g('b', 3, 5)]);
    expect(moves).toEqual([{ player: 0, damaged: false, system: 'b', from: { x: 0, z: 0 } }]);
  });

  it('takes ships from the nearest system that lost some', () => {
    const moves = planMoves([g('far', 1, 10), g('near', 1, 2)], [g('far', 1, 10), g('dest', 1, 0)]);
    expect(moves[0].from.x).toBe(2);
  });

  it('does not move groups whose count changed in place, or other seats and conditions', () => {
    expect(planMoves([g('a', 2, 0)], [g('a', 3, 0)])).toEqual([]);
    expect(planMoves([g('a', 1, 0, 1)], [g('b', 1, 5, 2)])).toEqual([]);
    expect(planMoves([g('a', 1, 0, 0, true)], [g('b', 1, 5, 0, false)])).toEqual([]);
  });
});

describe('flight curve', () => {
  it('rises to the arc height halfway and lands at both ends', () => {
    expect(arcHeight(0, 0.5)).toBe(0);
    expect(arcHeight(1, 0.5)).toBe(0);
    expect(arcHeight(0.5, 0.5)).toBeCloseTo(0.5);
  });

  it('eases from 0 to 1 and clamps outside', () => {
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(2)).toBe(1);
  });
});
