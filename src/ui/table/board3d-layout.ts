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
  /**
   * Each system's point; `slots`: the centres of its building slots, in slot
   * order; `ships`: where each seat's ships stand, by seat (tools/map-zones.mjs);
   * `layouts`: where the ships stand when 1, 2, 3 or 4 seats have ships there,
   * centred in the system's free room (tools/board-trace/6-centred-spots.py);
   * `disc`: the planet drawn on the picture (centre and radius), which the ship
   * points are kept inside.
   */
  systems: Record<string, {
    x: number;
    y: number;
    slots?: { x: number; y: number }[];
    ships?: { x: number; y: number }[];
    layouts?: { x: number; y: number }[][];
    disc?: { x: number; y: number; r: number };
  }>;
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

/** Table points of a system's building slots from the calibration, or null when it gives none. */
export function slotSpots(calib: BoardCalibration | null, id: string): Spot[] | null {
  const slots = calib?.systems[id]?.slots;
  return calib && slots?.length ? slots.map((p) => pictureToWorld(calib, p.x, p.y)) : null;
}

/** Table point where seat `seat`'s ships stand in a system, from the calibration, or null when it gives none. */
export function shipSpot(calib: BoardCalibration | null, id: string, seat: number): Spot | null {
  const ships = calib?.systems[id]?.ships;
  if (!calib || !ships?.length) return null;
  const p = ships[seat % ships.length];
  return pictureToWorld(calib, p.x, p.y);
}

/**
 * Table point where seat `seat`'s ships stand in a system shared by `seats`
 * (every seat with ships there, in order): its place in the centred figure
 * for that many seats when the calibration has one, else the seat's own spot
 * (shipSpot), else null.
 */
export function shipPlace(calib: BoardCalibration | null, id: string, seat: number, seats: readonly number[]): Spot | null {
  const layouts = calib?.systems[id]?.layouts;
  const i = seats.indexOf(seat);
  if (calib && layouts?.length && i >= 0) {
    const fig = layouts[Math.min(seats.length, layouts.length) - 1];
    if (fig?.length) {
      const p = fig[i % fig.length];
      return pictureToWorld(calib, p.x, p.y);
    }
  }
  return shipSpot(calib, id, seat);
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

/** A seat's fleet in a system, drawn as one model that stands for `count` ships (`fresh` + `damaged`). */
export interface ShipGroup {
  dx: number;
  dz: number;
  /** The damaged model (lying): only when every ship of the fleet is damaged. */
  lying: boolean;
  count: number;
  fresh: number;
  damaged: number;
}

/**
 * A seat's ships in one system: always one fleet, one model on the seat's
 * spot (the owner's choice, to keep the map light): a fresh ship when at least
 * one is fresh, the damaged one when all are damaged. Its tag tells the fresh
 * ones (white) and the damaged ones (black). None when the seat has no ships.
 */
export function shipGroups(fresh: number, damaged: number): ShipGroup[] {
  if (fresh + damaged <= 0) return [];
  return [{ dx: 0, dz: 0, lying: fresh <= 0, count: fresh + damaged, fresh, damaged }];
}

/** World distance between a seat's fresh and damaged groups. */
export const GROUP_GAP = 0.2;
/** How far (radians) a ship model may turn either side of the default heading. */
export const HEADING_SPREAD = 0.6;

/**
 * A fixed, random-looking turn for the model keyed by `key` (system, seat and
 * kind): within ±HEADING_SPREAD, the same every redraw, so ships do not all
 * point the same way and do not spin when the map changes.
 */
export function headingJitter(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (((h >>> 0) % 10000) / 10000 * 2 - 1) * HEADING_SPREAD;
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

/** Camera elevation limits, in radians above the table: like a player seated at the table, leaning in when close. */
export const TILT_NEAR = (34 * Math.PI) / 180;
export const TILT_FAR = (56 * Math.PI) / 180;

/**
 * Camera elevation for a zoom distance: TILT_NEAR at `near` or closer,
 * TILT_FAR at `far` or farther, easing smoothly in between: seated at the
 * table, leaning towards the pieces when close, sitting back to see the map.
 */
export function tiltForZoom(dist: number, near: number, far: number): number {
  const t = far > near ? Math.max(0, Math.min(1, (dist - near) / (far - near))) : 1;
  const ease = t * t * (3 - 2 * t);
  return TILT_NEAR + (TILT_FAR - TILT_NEAR) * ease;
}

/** A point of a board picture, in pixels. */
export interface PicturePoint {
  x: number;
  y: number;
}

/** The corners of an SVG path made of M, L and Z commands (a sector's outline in board.lines.json). */
export function pathPoints(d: string): PicturePoint[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const out: PicturePoint[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] });
  return out;
}

/** True if `p` lies inside the polygon `poly` (even-odd rule). */
export function insidePolygon(p: PicturePoint, poly: readonly PicturePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from `p` to the nearest edge of the polygon `poly`. */
export function edgeDistance(p: PicturePoint, poly: readonly PicturePoint[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const k = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy)));
  }
  return best;
}

/** How ships orbit a planet (picture pixels): gap from the planet's rim, room kept from the sector's edge, room between two seats. */
export const ORBIT = { gap: 34, clear: 30, apart: 80, step: 18, rings: 4, squash: 0.62 } as const;

/**
 * Where the ships of 1, 2, 3 and 4 seats stand in a planet system, so that
 * they plainly belong to its planet: on an orbit just outside the planet's
 * disc, on the side towards the player (below it) first and then round its
 * sides, always inside the system's sector and clear of its edges and of
 * other planets, the seats apart from each other and in order from left to
 * right. A figure that does not fit is null (the caller keeps its old spots).
 */
export function orbitLayouts(
  disc: { x: number; y: number; r: number },
  sector: readonly PicturePoint[],
  others: readonly { x: number; y: number; r: number }[] = [],
  o: { gap: number; clear: number; apart: number; step: number; rings: number; squash: number } = ORBIT,
): (PicturePoint[] | null)[] {
  // Every free point round the planet, best first: nearest the rim, then nearest straight below it.
  const free: { p: PicturePoint; cost: number }[] = [];
  for (let ring = 0; ring < o.rings; ring++) {
    // The map is seen tilted: across the view a planet (a sphere) looks as wide as its disc, but along it the board
    // looks shorter by about `squash`, so the orbit reaches further above and below the planet than to its sides.
    const rx = disc.r + o.gap + ring * o.step;
    const ry = disc.r / o.squash + o.gap + ring * o.step;
    for (let deg = 0; deg < 360; deg += 5) {
      const a = (deg * Math.PI) / 180;
      const p = { x: disc.x + rx * Math.cos(a), y: disc.y + ry * Math.sin(a) };
      if (!insidePolygon(p, sector) || edgeDistance(p, sector) < o.clear) continue;
      if (others.some((d) => Math.hypot(p.x - d.x, p.y - d.y) < d.r + o.clear)) continue;
      const fromBelow = Math.abs(((deg - 90 + 540) % 360) - 180);
      free.push({ p, cost: ring * 40 + fromBelow });
    }
  }
  free.sort((a, b) => a.cost - b.cost);
  return [1, 2, 3, 4].map((n) => {
    const picked: PicturePoint[] = [];
    for (const f of free) {
      if (picked.length === n) break;
      if (picked.every((q) => Math.hypot(q.x - f.p.x, q.y - f.p.y) >= o.apart)) picked.push(f.p);
    }
    return picked.length === n ? picked.sort((a, b) => a.x - b.x || a.y - b.y) : null;
  });
}

/** How ships stand at a gate (picture pixels): room kept round the gate's number, from the segment's edges, and between two seats. */
export const GATE = { number: 62, clear: 26, apart: 78, along: 88 } as const;

/**
 * Where the ships of 1, 2, 3 and 4 seats stand at a gate, a segment of the
 * ring round the map's centre `centre`: in a row along the ring at the
 * gate's number `at` (the number itself left clear, one seat each side of
 * it first), a second row further in or out only when the first is full;
 * always inside the segment `sector` and clear of its edges, in order along
 * the ring. A figure that does not fit is null.
 */
export function gateLayouts(
  centre: PicturePoint,
  at: PicturePoint,
  sector: readonly PicturePoint[],
  o: { number: number; clear: number; apart: number; along: number } = GATE,
): (PicturePoint[] | null)[] {
  const d0 = Math.hypot(at.x - centre.x, at.y - centre.y);
  const a0 = Math.atan2(at.y - centre.y, at.x - centre.x);
  const free: { p: PicturePoint; cost: number; a: number }[] = [];
  for (let dr = -70; dr <= 70; dr += 10) {
    const d = d0 + dr;
    for (let da = -40; da <= 40; da += 1.5) {
      const a = a0 + (da * Math.PI) / 180;
      const p = { x: centre.x + d * Math.cos(a), y: centre.y + d * Math.sin(a) };
      if (!insidePolygon(p, sector) || edgeDistance(p, sector) < o.clear) continue;
      if (Math.hypot(p.x - at.x, p.y - at.y) < o.number) continue;
      // Best on the number's own circle, about `along` from it either side.
      const arc = Math.abs((da * Math.PI) / 180) * d;
      free.push({ p, a: da, cost: Math.abs(dr) * 1.2 + Math.abs(arc - o.along) * 0.6 });
    }
  }
  free.sort((x, y) => x.cost - y.cost);
  return [1, 2, 3, 4].map((n) => {
    const picked: { p: PicturePoint; a: number }[] = [];
    for (const f of free) {
      if (picked.length === n) break;
      // Two seats: one each side of the number, when both sides have room.
      if (n === 2 && picked.length === 1 && Math.sign(f.a) === Math.sign(picked[0].a) && free.some((g) => Math.sign(g.a) !== Math.sign(picked[0].a))) continue;
      if (picked.every((q) => Math.hypot(q.p.x - f.p.x, q.p.y - f.p.y) >= o.apart)) picked.push(f);
    }
    if (picked.length === n) return picked.sort((x, y) => x.a - y.a).map((x) => x.p);
    // No room for one row: two rows, one seat each side of the number in each (a 2 by 2 square round it).
    for (const g of [40, 46, 52]) {
      for (const s of [60, 70, 80, 90]) {
        const spots = [-g, g].flatMap((dr) =>
          [-1, 1].map((side) => {
            const d = d0 + dr;
            const a = a0 + (side * s) / d;
            return { p: { x: centre.x + d * Math.cos(a), y: centre.y + d * Math.sin(a) }, a: side * s };
          }),
        );
        const ok = spots.filter((f) => insidePolygon(f.p, sector) && edgeDistance(f.p, sector) >= o.clear && Math.hypot(f.p.x - at.x, f.p.y - at.y) >= o.number);
        if (ok.length >= n && 2 * g >= o.apart) return ok.slice(0, n).sort((x, y) => x.a - y.a).map((x) => x.p);
      }
    }
    return null;
  });
}
