// The shipped board calibration (src/ui/table/board.default.json): every
// system has one ship point per seat, and planets keep them on their own
// side of the map and clear of the building slots (tools/map-zones.mjs).
import { describe, expect, it } from 'vitest';
import calib from '../../../src/ui/table/board.default.json';

type Pt = { x: number; y: number };
type Sys = Pt & { slots?: Pt[]; ships?: Pt[] };
const systems = Object.entries(calib.systems as Record<string, Sys>);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

describe('board calibration ship zones', () => {
  it('gives every system four distinct ship points', () => {
    for (const [id, s] of systems) {
      expect(s.ships, id).toHaveLength(4);
      const pts = s.ships!;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(dist(pts[i], pts[j]), id).toBeGreaterThan(20);
    }
  });

  it('keeps planet ship points nearest their own system and off the building slots', () => {
    for (const [id, s] of systems.filter(([k]) => !k.endsWith('-gate'))) {
      for (const p of s.ships!) {
        const own = dist(p, s);
        for (const [other, o] of systems) if (other !== id) expect(dist(p, o), `${id} vs ${other}`).toBeGreaterThan(own);
        for (const slot of s.slots ?? []) expect(dist(p, slot), id).toBeGreaterThanOrEqual(40);
      }
    }
  });
});
