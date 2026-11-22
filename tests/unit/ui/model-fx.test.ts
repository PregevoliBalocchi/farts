// Pure helpers behind the 3D piece models (src/ui/table/model-fx.ts): fitting,
// surface points for lights and fire, building bases, and ship flights.
import { describe, expect, it } from 'vitest';
import { agentLayout, arcHeight, easeInOut, headingSway, engineSpots, fireSpots, fitModel, planMoves, rimSpots, fleetFormation, roundedTriangle, triangleCorners, windowSpots } from '../../../src/ui/table/model-fx';
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

describe('roundedTriangle', () => {
  it('rounds the corners and centres the outline on its bounding box, apex away from the viewer', () => {
    const side = 0.73;
    const r = 0.07;
    const pts = roundedTriangle(side, r, 12);
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    // Rounding trims each base corner by r·(√3 − 1) and the apex by r.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(side - 2 * r * (Math.sqrt(3) - 1), 3);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo((side * Math.sqrt(3)) / 2 - r, 3);
    expect(Math.min(...zs) + Math.max(...zs)).toBeCloseTo(0);
    expect(pts.length).toBe(39);
    expect(pts.find((p) => p.z === Math.min(...zs))!.x).toBeCloseTo(0);
  });
});

describe('fleetFormation', () => {
  const o = { front: 1.5, gapX: 1.2, gapZ: 0.8, perLine: 3 };

  it('puts fresh ships in the front lines and damaged ones behind', () => {
    const f = fleetFormation(4, 2, o);
    expect(f).toHaveLength(6);
    const freshX = Math.max(...f.filter((p) => !p.damaged).map((p) => p.x));
    const damagedX = Math.min(...f.filter((p) => p.damaged).map((p) => p.x));
    expect(Math.min(...f.map((p) => p.x))).toBe(1.5);
    expect(damagedX).toBeGreaterThan(freshX);
  });

  it('keeps every two ships at least a gap apart, so none overlap', () => {
    const f = fleetFormation(8, 8, o);
    for (let i = 0; i < f.length; i++)
      for (let j = i + 1; j < f.length; j++) {
        const sameLine = f[i].x === f[j].x;
        expect(sameLine ? Math.abs(f[i].z - f[j].z) : Math.abs(f[i].x - f[j].x)).toBeGreaterThanOrEqual(sameLine ? o.gapZ - 1e-9 : o.gapX - 1e-9);
      }
  });

  it('centres a short line across the field', () => {
    const f = fleetFormation(2, 0, o);
    expect(f[0].z + f[1].z).toBeCloseTo(0);
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

describe('agentLayout', () => {
  it('draws every agent up to the cap, each seat in its own cluster, centred', () => {
    const { spots, more } = agentLayout([{ player: 0, count: 2 }, { player: 2, count: 7 }, { player: 3, count: 0 }], 5);
    expect(spots.filter((s) => s.player === 0)).toHaveLength(2);
    expect(spots.filter((s) => s.player === 2)).toHaveLength(5);
    expect(spots.some((s) => s.player === 3)).toBe(false);
    expect(more).toEqual([expect.objectContaining({ player: 2, count: 7 })]);
    const xs = spots.map((s) => s.x);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0);
  });

  it('keeps clusters apart: every agent of the first seat stands left of the second', () => {
    const { spots } = agentLayout([{ player: 1, count: 3 }, { player: 0, count: 3 }]);
    const a = spots.filter((s) => s.player === 1).map((s) => s.x);
    const b = spots.filter((s) => s.player === 0).map((s) => s.x);
    expect(Math.max(...a)).toBeLessThan(Math.min(...b));
  });

  it('puts the fourth agent and on in a row behind', () => {
    const { spots } = agentLayout([{ player: 0, count: 4 }], 5, 3);
    expect(spots.filter((s) => s.z < 0)).toHaveLength(1);
  });
});

describe('headingSway', () => {
  it('stays a small turn and is the same for the same time and agent', () => {
    for (const t of [0, 1, 5, 9]) expect(Math.abs(headingSway(t, 2))).toBeLessThan(0.4);
    expect(headingSway(3, 1)).toBe(headingSway(3, 1));
  });
});
