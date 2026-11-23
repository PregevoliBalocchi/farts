// Pure helpers for the owner's 3D piece models (models3d.ts): fitting a model
// to its size on the board, picking the points where lights, engines and fire
// go on its surface, and working out which ship groups flew where between two
// views of the map. No three.js here, so these are unit-tested directly.

/** Target size and placement of one kind of model (models.json `pieces`). */
export interface ModelSpec {
  /** Largest dimension on the board, in world units. */
  size: number;
  /** Height of the model's base above the board (ships float; buildings stand on their base). */
  hover: number;
  /** Turn about Z, in degrees, applied before fitting (a model drawn standing on its tail). */
  rotateZ: number;
}

/** A point on a model's surface with its outward normal. */
export interface SurfacePoint {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

/** A deterministic pseudo-random sequence in [0, 1) for `seed`. */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Scale and lift that fit a model with bounding box `min`..`max` (already
 * turned) to `spec`: its largest dimension becomes `spec.size`, its base sits
 * `spec.hover` above the board.
 */
export function fitModel(min: readonly number[], max: readonly number[], spec: ModelSpec): { scale: number; lift: number } {
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const scale = extent > 0 ? spec.size / extent : 1;
  return { scale, lift: -min[1] * scale + spec.hover };
}

/**
 * Centre (x, z) of the part of a model that stands on the ground: the
 * bounding box of the vertices in the lowest `share` of its height.
 */
export function footprintCentre(pos: ArrayLike<number>, share = 0.15): { x: number; z: number } {
  const { min, max } = bounds(pos);
  const top = min[1] + (max[1] - min[1]) * share;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i + 1] > top) continue;
    x0 = Math.min(x0, pos[i]);
    x1 = Math.max(x1, pos[i]);
    z0 = Math.min(z0, pos[i + 2]);
    z1 = Math.max(z1, pos[i + 2]);
  }
  return x0 <= x1 ? { x: (x0 + x1) / 2, z: (z0 + z1) / 2 } : { x: (min[0] + max[0]) / 2, z: (min[2] + max[2]) / 2 };
}

/** Bounding box of packed xyz positions. */
export function bounds(pos: ArrayLike<number>): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k]);
      max[k] = Math.max(max[k], pos[i + k]);
    }
  }
  return { min, max };
}

function pointAt(pos: ArrayLike<number>, nrm: ArrayLike<number>, i: number): SurfacePoint {
  return { x: pos[i * 3], y: pos[i * 3 + 1], z: pos[i * 3 + 2], nx: nrm[i * 3], ny: nrm[i * 3 + 1], nz: nrm[i * 3 + 2] };
}

/**
 * Up to `count` vertices that pass `keep`, spread out (no two closer than
 * `gap`), picked in a fixed pseudo-random order from `seed`.
 */
export function sampleSurface(pos: ArrayLike<number>, nrm: ArrayLike<number>, count: number, keep: (p: SurfacePoint) => boolean, seed: number, gap = 0): SurfacePoint[] {
  const n = pos.length / 3;
  const order = Array.from({ length: n }, (_, i) => i);
  const r = rng(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const out: SurfacePoint[] = [];
  for (const i of order) {
    if (out.length >= count) break;
    const p = pointAt(pos, nrm, i);
    if (!keep(p)) continue;
    if (gap > 0 && out.some((q) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < gap)) continue;
    out.push(p);
  }
  return out;
}

/** Lit windows of a city: on its walls (normals near horizontal), above the lowest fifth. */
export function windowSpots(pos: ArrayLike<number>, nrm: ArrayLike<number>, count: number, seed = 7): SurfacePoint[] {
  const { min, max } = bounds(pos);
  const floor = min[1] + (max[1] - min[1]) * 0.2;
  const gap = (max[0] - min[0]) * 0.06;
  return sampleSurface(pos, nrm, count, (p) => Math.abs(p.ny) < 0.3 && p.y > floor, seed, gap);
}

/** Where fire and smoke come out of a damaged piece: points on its upper, upward-facing surfaces. */
export function fireSpots(pos: ArrayLike<number>, nrm: ArrayLike<number>, count: number, seed = 3): SurfacePoint[] {
  const { min, max } = bounds(pos);
  const mid = (min[1] + max[1]) / 2;
  const gap = Math.max(max[0] - min[0], max[2] - min[2]) * 0.25;
  return sampleSurface(pos, nrm, count, (p) => p.ny > 0.5 && p.y > mid, seed, gap);
}

/**
 * Landing lights of a starport: `count` points evenly round the rim of its
 * pad (the widest ring of upward-facing faces), just above it.
 */
export function rimSpots(pos: ArrayLike<number>, nrm: ArrayLike<number>, count: number): { x: number; y: number; z: number }[] {
  let rMax = 0;
  for (let i = 0; i < pos.length / 3; i++) {
    if (nrm[i * 3 + 1] < 0.7) continue;
    rMax = Math.max(rMax, Math.hypot(pos[i * 3], pos[i * 3 + 2]));
  }
  if (rMax === 0) return [];
  const ys: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) {
    if (nrm[i * 3 + 1] < 0.7) continue;
    if (Math.hypot(pos[i * 3], pos[i * 3 + 2]) > rMax * 0.8) ys.push(pos[i * 3 + 1]);
  }
  ys.sort((a, b) => a - b);
  const y = ys[Math.floor(ys.length / 2)];
  const r = rMax * 0.9;
  return Array.from({ length: count }, (_, k) => {
    const a = (k / count) * Math.PI * 2;
    return { x: r * Math.cos(a), y: y + 0.01, z: r * Math.sin(a) };
  });
}

/**
 * Engine nozzles at the back of a ship pointing along −X (its back is +X):
 * one at the middle of the rear, or two side by side when the rear is wide.
 */
export function engineSpots(pos: ArrayLike<number>): { x: number; y: number; z: number }[] {
  const { min, max } = bounds(pos);
  const len = max[0] - min[0];
  const rear: number[][] = [];
  for (let i = 0; i < pos.length / 3; i++) if (pos[i * 3] > max[0] - len * 0.05) rear.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
  if (!rear.length) return [];
  const avg = (k: number) => rear.reduce((s, p) => s + p[k], 0) / rear.length;
  const zs = rear.map((p) => p[2]);
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  const y = avg(1);
  const x = max[0] + len * 0.02;
  if (zMax - zMin > (max[2] - min[2]) * 0.35) return [{ x, y, z: zMin + (zMax - zMin) * 0.25 }, { x, y, z: zMax - (zMax - zMin) * 0.25 }];
  return [{ x, y, z: avg(2) }];
}

/**
 * Corners of the triangular base a building stands on, as on the physical
 * board's slots: an equilateral triangle of side `side`, one corner pointing
 * away from the viewer (−Z), centred on the origin.
 */
export function triangleCorners(side: number): { x: number; z: number }[] {
  const h = (side * Math.sqrt(3)) / 2;
  return [
    { x: 0, z: (-2 * h) / 3 },
    { x: side / 2, z: h / 3 },
    { x: -side / 2, z: h / 3 },
  ];
}

/**
 * Outline of a building's base like the triangles printed on the map: the
 * triangle of `side` with each corner rounded to `radius` (`steps` points per
 * corner), one corner away from the viewer (−Z), centred on its bounding box
 * (as the map's slot points are). Points go round in order.
 */
export function roundedTriangle(side: number, radius: number, steps = 6): { x: number; z: number }[] {
  const c = triangleCorners(side);
  const pts: { x: number; z: number }[] = [];
  c.forEach((v) => {
    // A corner's arc: centred 2r inside the corner along its bisector, spanning 120°.
    const toCentre = { x: -v.x, z: -v.z };
    const len = Math.hypot(toCentre.x, toCentre.z);
    const centre = { x: v.x + (toCentre.x / len) * 2 * radius, z: v.z + (toCentre.z / len) * 2 * radius };
    const mid = Math.atan2(v.z - centre.z, v.x - centre.x);
    for (let k = 0; k <= steps; k++) {
      const a = mid - Math.PI / 3 + ((2 * Math.PI) / 3) * (k / steps);
      pts.push({ x: centre.x + radius * Math.cos(a), z: centre.z + radius * Math.sin(a) });
    }
  });
  const zs = pts.map((p) => p.z);
  const shift = (Math.min(...zs) + Math.max(...zs)) / 2;
  return pts.map((p) => ({ x: p.x, z: p.z - shift }));
}

/** One ship of a fleet in battle formation: distance from the centre line (x ≥ 0), across (z), and whether it is damaged. */
export interface FormationSpot {
  x: number;
  z: number;
  damaged: boolean;
}

/**
 * A fleet drawn in formation for the battle view: fresh ships in lines
 * across the front (`front` from the centre), damaged ships in lines behind
 * them, `perLine` ships per line `gapZ` apart, lines `gapX` apart, each line
 * centred and every other line staggered by half a gap. `x` grows away from
 * the enemy; the caller mirrors it for the side on the left.
 */
export function fleetFormation(fresh: number, damaged: number, o: { front: number; gapX: number; gapZ: number; perLine: number }): FormationSpot[] {
  const out: FormationSpot[] = [];
  let line = 0;
  const place = (n: number, dmg: boolean) => {
    for (let start = 0; start < n; start += o.perLine, line++) {
      const k = Math.min(o.perLine, n - start);
      const stagger = line % 2 ? o.gapZ / 4 : -o.gapZ / 4;
      for (let j = 0; j < k; j++) out.push({ x: o.front + line * o.gapX, z: (j - (k - 1) / 2) * o.gapZ + (k < o.perLine ? 0 : stagger), damaged: dmg });
    }
  };
  place(fresh, false);
  place(damaged, true);
  return out;
}

/** One seat's group of ships drawn in a system: fresh or damaged, how many, and where. */
export interface ShipGroupAt {
  player: number;
  damaged: boolean;
  system: string;
  count: number;
  x: number;
  z: number;
  /** Its resting heading as drawn (to start a flight from). */
  heading?: number;
}

/** A group that arrived in `system` and should be flown in from `from` (in system `fromSystem`). */
export interface ShipMove {
  player: number;
  damaged: boolean;
  system: string;
  fromSystem: string;
  from: { x: number; z: number };
}

/**
 * Which ship groups moved between two builds of the map: for each seat and
 * condition, systems that gained ships take them from the nearest system that
 * lost some (a group whose count only changed in place does not move).
 */
export function planMoves(prev: readonly ShipGroupAt[], next: readonly ShipGroupAt[]): ShipMove[] {
  const key = (g: ShipGroupAt) => `${g.player}:${g.damaged ? 1 : 0}`;
  const keys = new Set([...prev, ...next].map(key));
  const out: ShipMove[] = [];
  for (const k of keys) {
    const before = prev.filter((g) => key(g) === k);
    const after = next.filter((g) => key(g) === k);
    const countIn = (list: readonly ShipGroupAt[], sys: string) => list.find((g) => g.system === sys)?.count ?? 0;
    const sources = before.filter((g) => g.count > countIn(after, g.system)).map((g) => ({ g, left: g.count - countIn(after, g.system) }));
    if (!sources.length) continue;
    for (const g of after) {
      let need = g.count - countIn(before, g.system);
      while (need > 0) {
        const open = sources.filter((s) => s.left > 0);
        if (!open.length) break;
        open.sort((a, b) => Math.hypot(a.g.x - g.x, a.g.z - g.z) - Math.hypot(b.g.x - g.x, b.g.z - g.z));
        const s = open[0];
        const take = Math.min(need, s.left);
        s.left -= take;
        need -= take;
        if (!out.some((m) => m.player === g.player && m.damaged === g.damaged && m.system === g.system)) {
          out.push({ player: g.player, damaged: g.damaged, system: g.system, fromSystem: s.g.system, from: { x: s.g.x, z: s.g.z } });
        }
      }
    }
  }
  return out;
}

/**
 * Heading (rotation about the vertical axis) that points a ship model's nose
 * from `from` towards `to`. The models' nose is −X: heading 0 faces −X.
 */
export function headingTowards(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.z - from.z, -(to.x - from.x));
}

/** The signed smallest turn from heading `a` to heading `b`, in (−π, π]. */
export function turnBetween(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Resting headings of the ship groups in one system: a group that shares the
 * system with another seat's ships faces the middle of those ships; a group
 * alone keeps its own heading (null).
 */
export function faceEnemies(groups: readonly { player: number; x: number; z: number }[]): (number | null)[] {
  return groups.map((g) => {
    const foes = groups.filter((o) => o.player !== g.player);
    if (!foes.length) return null;
    const c = { x: foes.reduce((s, o) => s + o.x, 0) / foes.length, z: foes.reduce((s, o) => s + o.z, 0) / foes.length };
    return Math.hypot(c.x - g.x, c.z - g.z) < 1e-6 ? null : headingTowards(g, c);
  });
}

/**
 * The systems a group passes through from `from` to `to` along the map's
 * links (breadth first, so the fewest jumps), both ends included; just the
 * two ends when no route is known.
 */
export function routeSystems(links: readonly (readonly [string, string])[], from: string, to: string): string[] {
  if (from === to) return [from];
  const next = new Map<string, string[]>();
  for (const [a, b] of links) {
    next.set(a, [...(next.get(a) ?? []), b]);
    next.set(b, [...(next.get(b) ?? []), a]);
  }
  const back = new Map<string, string>([[from, from]]);
  const queue = [from];
  while (queue.length) {
    const s = queue.shift()!;
    if (s === to) break;
    for (const n of next.get(s) ?? []) {
      if (back.has(n)) continue;
      back.set(n, s);
      queue.push(n);
    }
  }
  if (!back.has(to)) return [from, to];
  const path = [to];
  while (path[0] !== from) path.unshift(back.get(path[0])!);
  return path;
}

/**
 * Where a flying ship is in its flight at progress `p` (0..1): it first turns
 * on the spot to its course (`turn` share of the time), then flies along the
 * course easing in and out (`u` is the share of the course covered), then
 * turns to its resting heading (`settle` share).
 */
export function flightPhase(p: number, turn = 0.18, settle = 0.17): { stage: 'turn' | 'fly' | 'settle'; k: number; u: number } {
  const c = Math.min(1, Math.max(0, p));
  if (c < turn) return { stage: 'turn', k: easeInOut(c / turn), u: 0 };
  if (c > 1 - settle) return { stage: 'settle', k: easeInOut((c - (1 - settle)) / settle), u: 1 };
  return { stage: 'fly', k: 0, u: easeInOut((c - turn) / (1 - turn - settle)) };
}

/** Height along a move's arc at progress `t` (0..1): up and down again, peaking at `arc`. */
export function arcHeight(t: number, arc: number): number {
  return 4 * arc * t * (1 - t);
}

/** Smooth start and stop for a move at progress `t` (0..1). */
export function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** One agent model to stand in front of a Court card: whose, and where (card-local units, x across, z towards the viewer). */
export interface AgentSpot {
  player: number;
  x: number;
  z: number;
}

/**
 * Where the agents on a Court card stand in its close-up: each seat's agents
 * in their own cluster (up to `maxShown`, in rows of `perRow`), the clusters
 * side by side and centred. `more` lists the seats with more agents than drawn.
 */
export function agentLayout(groups: readonly { player: number; count: number }[], maxShown = 5, perRow = 3, step = 0.14, gap = 0.12): { spots: AgentSpot[]; more: { player: number; count: number; x: number }[] } {
  const clusters = groups
    .filter((g) => g.count > 0)
    .map((g) => {
      const n = Math.min(g.count, maxShown);
      const cols = Math.min(n, perRow);
      return { g, n, cols, width: (cols - 1) * step };
    });
  const total = clusters.reduce((s, c) => s + c.width, 0) + gap * Math.max(0, clusters.length - 1) + step * clusters.length;
  let left = -total / 2 + step / 2;
  const spots: AgentSpot[] = [];
  const more: { player: number; count: number; x: number }[] = [];
  for (const c of clusters) {
    for (let i = 0; i < c.n; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const inRow = Math.min(perRow, c.n - row * perRow);
      // A back row sits behind and between the front one.
      const x = left + (c.width - (inRow - 1) * step) / 2 + col * step;
      spots.push({ player: c.g.player, x, z: -row * step * 0.9 });
    }
    if (c.g.count > c.n) more.push({ player: c.g.player, count: c.g.count, x: left + c.width / 2 });
    left += c.width + step + gap;
  }
  return { spots, more };
}

/** An agent's turn at `sec` seconds: a fixed lean of its own (from `phase`) plus a slow small sway. */
export function headingSway(sec: number, phase: number): number {
  return 0.25 * Math.sin(phase * 2.3) + 0.12 * Math.sin(sec * 0.7 + phase);
}
