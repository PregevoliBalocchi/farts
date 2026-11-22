// Where things sit on the 3D table, as plain numbers (no three.js here, so it
// is unit-tested). World units: the board is BOARD_DEPTH deep along z, x to
// the right, y up. Systems come either from the owner's calibration of their
// board picture (assets/ui/map/board.json) or from the schematic layout().

/** Board depth in world units; the width follows the picture's aspect. */
export const BOARD_DEPTH = 10;

/** The schematic board picture: layout() pixels per world unit, and its centre. */
export const SCHEMATIC = { pxPerUnit: 72, cx: 320, cy: 320 } as const;

/** The owner's calibration of a board picture: system id → pixel position in it. */
export interface BoardCalibration {
  width: number;
  height: number;
  systems: Record<string, { x: number; y: number }>;
}

/** A point on the table. */
export interface Spot {
  x: number;
  z: number;
}

/** True if `v` has the shape of a BoardCalibration (read from a JSON file). */
export function isCalibration(v: unknown): v is BoardCalibration {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (typeof c.width !== 'number' || typeof c.height !== 'number' || c.width <= 0 || c.height <= 0) return false;
  if (!c.systems || typeof c.systems !== 'object') return false;
  return Object.values(c.systems as Record<string, unknown>).every(
    (p) => !!p && typeof (p as { x: unknown }).x === 'number' && typeof (p as { y: unknown }).y === 'number',
  );
}

/** Width of a board picture of `width`×`height` pixels, in world units. */
export function boardWidth(width: number, height: number): number {
  return (BOARD_DEPTH * width) / height;
}

/** A pixel of a calibrated picture as a table point (picture centre = origin). */
export function pictureToWorld(c: Pick<BoardCalibration, 'width' | 'height'>, px: number, py: number): Spot {
  return { x: (px / c.width - 0.5) * boardWidth(c.width, c.height), z: (py / c.height - 0.5) * BOARD_DEPTH };
}

/** The inverse of pictureToWorld: a table point as a pixel of the picture. */
export function worldToPicture(c: Pick<BoardCalibration, 'width' | 'height'>, s: Spot): { x: number; y: number } {
  return { x: (s.x / boardWidth(c.width, c.height) + 0.5) * c.width, y: (s.z / BOARD_DEPTH + 0.5) * c.height };
}

/** A layout() position as a table point on the schematic board. */
export function schematicToWorld(px: number, py: number): Spot {
  return { x: (px - SCHEMATIC.cx) / SCHEMATIC.pxPerUnit, z: (py - SCHEMATIC.cy) / SCHEMATIC.pxPerUnit };
}

/**
 * Table point of every system: from the calibration when it names the system,
 * else from the schematic layout (so a half-calibrated board still plays).
 */
export function systemSpots(schematic: Record<string, { x: number; y: number }>, calib: BoardCalibration | null): Record<string, Spot> {
  const out: Record<string, Spot> = {};
  for (const [id, p] of Object.entries(schematic)) {
    const c = calib?.systems[id];
    out[id] = c && calib ? pictureToWorld(calib, c.x, c.y) : schematicToWorld(p.x, p.y);
  }
  return out;
}

/** One ship of a stack: offset from the stack centre, and whether it lies down (damaged). */
export interface ShipSpot {
  dx: number;
  dz: number;
  lying: boolean;
}

/** Pieces drawn per stack; more are summed up by a count tag. */
export const MAX_SHOWN = 6;

/**
 * Ships of one seat in one system: fresh ones standing in a row, damaged ones
 * lying in a row behind them, at most MAX_SHOWN in all (fresh first).
 */
export function stackSpots(fresh: number, damaged: number, gap = 0.22): ShipSpot[] {
  const f = Math.min(fresh, MAX_SHOWN);
  const d = Math.min(damaged, MAX_SHOWN - f);
  const row = (n: number, dz: number, lying: boolean) =>
    Array.from({ length: n }, (_, i) => ({ dx: (i - (n - 1) / 2) * gap * (lying ? 1.5 : 1), dz, lying }));
  return [...row(f, d ? -0.14 : 0, false), ...row(d, f ? 0.2 : 0, true)];
}

/** Centres of up to 4 seat stacks around a system point (radius `r`). */
export function stackCentres(n: number, r = 0.62): Spot[] {
  const angles = [-135, -45, 45, 135];
  return Array.from({ length: n }, (_, i) => {
    const a = (angles[i % 4] * Math.PI) / 180;
    return { x: r * Math.cos(a), z: r * Math.sin(a) };
  });
}

/** Building spots under a system point, on a small arc (same arc as the board's slot marks). */
export function buildingSpots(n: number, r = 0.5): Spot[] {
  return Array.from({ length: n }, (_, i) => {
    const a = ((90 + (i - (n - 1) / 2) * 24) * Math.PI) / 180;
    return { x: r * Math.cos(a), z: r * Math.sin(a) };
  });
}
