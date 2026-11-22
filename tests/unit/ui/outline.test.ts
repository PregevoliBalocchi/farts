// The outline of a picture's shape (src/ui/table/outline.ts), used to cut the
// 3D pieces out of the kit's pictures.
import { describe, expect, it } from 'vitest';
import { largestBlob, outlineArea, simplifyOutline, traceOutline } from '../../../src/ui/table/outline';
import type { Pt } from '../../../src/ui/table/outline';

/** A mask from rows of text: '#' is inside. */
function mask(rows: string[]): { m: Uint8Array; w: number; h: number } {
  const w = rows[0].length;
  const m = new Uint8Array(w * rows.length);
  rows.forEach((r, y) => [...r].forEach((c, x) => (m[y * w + x] = c === '#' ? 1 : 0)));
  return { m, w, h: rows.length };
}

const SQUARE = ['......', '.####.', '.####.', '.####.', '.####.', '......'];

describe('largestBlob', () => {
  it('keeps the biggest shape and drops detached specks', () => {
    const { m, w, h } = mask(['#.....', '..###.', '..###.', '......']);
    const out = largestBlob(m, w, h);
    expect(out[0]).toBe(0);
    expect([...out].filter(Boolean)).toHaveLength(6);
  });

  it('returns an empty mask for an empty picture', () => {
    const { m, w, h } = mask(['...', '...']);
    expect([...largestBlob(m, w, h)].some(Boolean)).toBe(false);
  });
});

describe('traceOutline', () => {
  it('walks the border of a square once, clockwise on screen', () => {
    const { m, w, h } = mask(SQUARE);
    const pts = traceOutline(m, w, h);
    expect(pts[0]).toEqual([1, 1]);
    expect(pts).toHaveLength(12);
    expect(new Set(pts.map((p) => p.join())).size).toBe(12);
    expect(outlineArea(pts)).toBeGreaterThan(0);
  });

  it('returns nothing for an empty mask and one point for a single pixel', () => {
    const empty = mask(['..', '..']);
    expect(traceOutline(empty.m, empty.w, empty.h)).toEqual([]);
    const dot = mask(['..', '.#']);
    expect(traceOutline(dot.m, dot.w, dot.h)).toEqual([[1, 1]]);
  });

  it('follows a concave shape without leaving it', () => {
    const { m, w, h } = mask(['#####', '#...#', '#...#']);
    const pts = traceOutline(m, w, h);
    expect(pts.every(([x, y]) => m[y * w + x] === 1)).toBe(true);
    expect(pts.some(([x, y]) => x === 0 && y === 2)).toBe(true);
    expect(pts.some(([x, y]) => x === 4 && y === 2)).toBe(true);
  });
});

describe('simplifyOutline', () => {
  it('reduces a square border to its four corners', () => {
    const { m, w, h } = mask(SQUARE);
    const corners = simplifyOutline(traceOutline(m, w, h), 0.5);
    expect(corners).toHaveLength(4);
    expect(new Set(corners.map((p) => p.join()))).toEqual(new Set(['1,1', '4,1', '4,4', '1,4']));
  });

  it('keeps the enclosed area within the tolerance', () => {
    const ring: Pt[] = Array.from({ length: 80 }, (_, i) => {
      const a = (i / 80) * 2 * Math.PI;
      return [50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)];
    });
    const simple = simplifyOutline(ring, 1);
    expect(simple.length).toBeLessThan(ring.length);
    expect(Math.abs(outlineArea(simple))).toBeGreaterThan(Math.abs(outlineArea(ring)) * 0.93);
  });
});
