// The 3D map's information layer: a flat, transparent sheet over the planets
// carrying what the board prints, traced from it (board.lines.json, made by
// tools/board-trace/): the ring of gates with their numbers, the cracks
// between clusters, the lines between systems, each planet's symbol (crescent,
// hexagon, arrowhead) on the ring, and the building slots. Systems out of play
// are shaded. Drawn on a canvas in the board picture's pixel frame.

import { BOARD_DEPTH, type BoardCalibration } from './board3d-layout';
import { roundedTriangle } from './model-fx';
import models from './models.json';

/** The board's traced line art and zones, in picture pixels (board.lines.json). */
export interface BoardLines {
  width: number;
  height: number;
  /** The ring of gates: an ellipse, `angle` in degrees. */
  ring: { cx: number; cy: number; rx: number; ry: number; angle: number };
  /** Straight lines between systems, from the ring (`a`) to the board's edge (`b`). */
  separators: { cluster: string; a: number[]; b: number[] }[];
  /** Traced shapes (SVG path data, filled): the edges of the cracks and spikes, the central hole's jagged edge. */
  lines: string[];
  /** The dark inside of each crack and spike (SVG path data, filled). */
  cracks?: string[];
  /** Each planet's symbol on the ring. */
  symbols: { system: string; shape: string; x: number; y: number; angle: number }[];
  /** Each gate's number and where it is printed. */
  gates: { system: string; n: number; x: number; y: number; angle: number }[];
  /** Each system's zone (SVG path data). */
  sectors: Record<string, string>;
  /**
   * Where pieces go in each system, inside its zone and clear of the planet,
   * lines, slots and icons: one ship spot per seat, and spots for tokens
   * (campaign markers and the like), as [x, y] picture pixels; `layouts`: where
   * the ships stand when 1, 2, 3 or 4 seats have ships there, centred in the
   * zone's free room (tools/board-trace/6-centred-spots.py).
   */
  spots?: Record<string, { ships: number[][]; tokens: number[][]; layouts?: number[][][] }>;
}

/**
 * The calibration with each system's ship spots taken from the layer's
 * spots (when it has them), so the ships stand in the open beside their
 * planet instead of on it. Pure.
 */
export function withLayerSpots(calib: BoardCalibration, lines: Pick<BoardLines, 'spots'>): BoardCalibration {
  if (!lines.spots) return calib;
  const systems: BoardCalibration['systems'] = {};
  for (const [id, sys] of Object.entries(calib.systems)) {
    const ships = lines.spots[id]?.ships;
    const layouts = lines.spots[id]?.layouts;
    const at = ([x, y]: number[]) => ({ x, y });
    systems[id] = {
      ...sys,
      ...(ships?.length ? { ships: ships.map(at) } : {}),
      ...(layouts?.length ? { layouts: layouts.map((fig) => fig.map(at)) } : {}),
    };
  }
  return { ...calib, systems };
}

/** Token spot `i` of system `id` (picture pixels), or null when the layer has none there. */
export function tokenSpot(lines: Pick<BoardLines, 'spots'>, id: string, i: number): { x: number; y: number } | null {
  const t = lines.spots?.[id]?.tokens;
  if (!t?.length) return null;
  const [x, y] = t[i % t.length];
  return { x, y };
}

/** True if `v` has the shape of BoardLines. */
export function isBoardLines(v: unknown): v is BoardLines {
  if (!v || typeof v !== 'object') return false;
  const b = v as Record<string, unknown>;
  return typeof b.width === 'number' && typeof b.height === 'number' && !!b.ring && Array.isArray(b.separators) && Array.isArray(b.lines) && Array.isArray(b.symbols) && Array.isArray(b.gates) && !!b.sectors;
}

/** The layer's ink. */
export const INK = '#f3e6c8';
const INK_RGB = '243,230,200';

/** What the layer shows besides the fixed line art. */
export interface InfoState {
  /** Systems in play (others are shaded). */
  inPlay: ReadonlyMap<string, boolean>;
  /** Font for the gate numbers (CSS font family list). */
  numberFont: string;
  /** A translucent colour over each listed sector (see sectorTints). */
  tints?: ReadonlyMap<string, SectorTint>;
  /** ?debug=spots: marks every ship spot (circle, seat number) and token spot (square). */
  showSpots?: boolean;
  /** Gates linked across systems out of play (by the setup card): a curved two-headed arrow between them. */
  bridges?: readonly (readonly [string, string])[];
  /** Resource icons on the planets' rims (see resourceIconSpots), with their pictures. */
  icons?: readonly (IconSpot & { image: CanvasImageSource; ring: string })[];
}

/** How the sectors are coloured: by the planet's resource, or by who controls them. */
export type SectorMode = 'resource' | 'control';

/** What sectorTints needs to know of a system. */
export interface SectorFacts {
  id: string;
  resource: string | null;
  controller: number | null;
  inPlay: boolean;
}

/** A sector's colour: `nebula` draws it as soft clouds (the board's look), else as an even wash. */
export interface SectorTint {
  colour: string;
  alpha: number;
  nebula: boolean;
}

/** Peak opacity of the resource colour's clouds over a planet's sector. */
export const RESOURCE_TINT = 0.15;
/** Opacity of the controller's seat colour over a sector, and of the grey over a sector nobody controls. */
export const CONTROL_TINT = 0.36;
export const NOBODY_TINT = 0.32;
const NOBODY = '#4e5157';

/** `#rrggbb` as `rgba(r,g,b,a)`. */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * The colour over each sector in play. `resource`: planets take their
 * resource's colour as a nebula (gates none). `control`: every sector takes
 * its controller's seat colour, grey when nobody controls it, as a wash.
 */
export function sectorTints(systems: readonly SectorFacts[], mode: SectorMode, resourceColor: (r: string) => string | null, seatColor: (p: number) => string): Map<string, SectorTint> {
  const out = new Map<string, SectorTint>();
  for (const s of systems) {
    if (!s.inPlay) continue;
    if (mode === 'control') {
      out.set(s.id, s.controller !== null ? { colour: seatColor(s.controller), alpha: CONTROL_TINT, nebula: false } : { colour: NOBODY, alpha: NOBODY_TINT, nebula: false });
    } else if (s.resource) {
      const c = resourceColor(s.resource);
      if (c) out.set(s.id, { colour: c, alpha: RESOURCE_TINT, nebula: true });
    }
  }
  return out;
}

/** A small seeded random generator (mulberry32) from a string. */
function seeded(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bounding box of SVG path data made of M/L/Z with absolute coordinates. */
function pathBox(d: string): { x0: number; y0: number; x1: number; y1: number } {
  const n = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [0, 0];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) {
    x0 = Math.min(x0, n[i]);
    x1 = Math.max(x1, n[i]);
    y0 = Math.min(y0, n[i + 1]);
    y1 = Math.max(y1, n[i + 1]);
  }
  return { x0, y0, x1, y1 };
}

/**
 * A sector's colour as a nebula: a faint wash and soft clouds of uneven
 * strength, some stretched into wisps, kept inside the sector (seeded by its
 * id, so it never changes between draws).
 */
function nebula(g: CanvasRenderingContext2D, id: string, d: string, t: SectorTint): void {
  const area = new Path2D(d);
  const b = pathBox(d);
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const size = Math.min(w, h);
  const rnd = seeded(id);
  g.save();
  g.clip(area);
  g.fillStyle = rgba(t.colour, t.alpha * 0.18);
  g.fill(area);
  const m = g.getTransform();
  for (let i = 0, placed = 0; i < 140 && placed < 26; i++) {
    const x = b.x0 + rnd() * w;
    const y = b.y0 + rnd() * h;
    if (!g.isPointInPath(area, x * m.a + m.e, y * m.d + m.f)) continue;
    placed++;
    const r = size * (0.12 + rnd() * 0.42);
    const a = t.alpha * (0.15 + rnd() * 0.85);
    g.save();
    g.translate(x, y);
    g.rotate(rnd() * Math.PI);
    g.scale(1, 0.35 + rnd() * 0.65);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, rgba(t.colour, a));
    grad.addColorStop(0.45, rgba(t.colour, a * 0.55));
    grad.addColorStop(1, rgba(t.colour, 0));
    g.fillStyle = grad;
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
  }
  g.restore();
}

/**
 * The curved arrow between gates `a` and `b` linked across systems out of
 * play: points (picture pixels) along the ring, the way that crosses only
 * gates out of play, ending just outside the two gates' spaces (never inside
 * them). Null when either gate is unknown.
 */
export function bridgeArc(lines: BoardLines, inPlay: ReadonlyMap<string, boolean>, a: string, b: string, steps = 48): [number, number][] | null {
  const r = lines.ring;
  const ang = (r.angle * Math.PI) / 180;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const polar = (x: number, y: number) => {
    const dx = x - r.cx;
    const dy = y - r.cy;
    const u = (dx * c + dy * s) / r.rx;
    const w = (-dx * s + dy * c) / r.ry;
    return { rho: Math.hypot(u, w), phi: Math.atan2(w, u) };
  };
  const ga = lines.gates.find((x) => x.system === a);
  const gb = lines.gates.find((x) => x.system === b);
  if (!ga || !gb) return null;
  const pa = polar(ga.x, ga.y);
  const pb = polar(gb.x, gb.y);
  const TAU = Math.PI * 2;
  const wrap = (v: number) => ((v % TAU) + TAU) % TAU;
  const up = wrap(pb.phi - pa.phi);
  // The gates passed going one way round (dir 1: increasing angle) or the other must all be out of play.
  const clear = (span: number, dir: number) =>
    lines.gates.every((x) => {
      if (x.system === a || x.system === b) return true;
      const d = wrap((polar(x.x, x.y).phi - pa.phi) * dir);
      return !(d > 0 && d < span) || inPlay.get(x.system) === false;
    });
  const okUp = clear(up, 1);
  const okDown = clear(TAU - up, -1);
  const shorter = up <= TAU - up ? 1 : -1;
  const dir = okUp && okDown ? shorter : okUp ? 1 : okDown ? -1 : shorter;
  const span = dir === 1 ? up : TAU - up;
  const along = (gap: number, n: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const phi = pa.phi + dir * (gap + (span - 2 * gap) * f);
      const rho = pa.rho + (pb.rho - pa.rho) * f;
      const u = rho * r.rx * Math.cos(phi);
      const w = rho * r.ry * Math.sin(phi);
      pts.push([r.cx + u * c - w * s, r.cy + u * s + w * c]);
    }
    return pts;
  };
  const sa = lines.sectors[a];
  const sb = lines.sectors[b];
  if (sa && sb) {
    // Finely along the whole way, then cut where it is still inside either gate's space (and a little more).
    const fine = along(0, steps * 8);
    const polyA = pathPoints(sa);
    const polyB = pathPoints(sb);
    let i0 = 0;
    while (i0 < fine.length && inPolygon(polyA, fine[i0])) i0++;
    let i1 = fine.length - 1;
    while (i1 > i0 && inPolygon(polyB, fine[i1])) i1--;
    i0 += BRIDGE_PAD;
    i1 -= BRIDGE_PAD;
    if (i1 - i0 >= steps) return Array.from({ length: steps + 1 }, (_, k) => fine[i0 + Math.round(((i1 - i0) * k) / steps)]);
  }
  return along(Math.min(0.24, span * 0.2), steps);
}

/** Fine steps left between a bridge arrow's tip and the gate's space it points at. */
const BRIDGE_PAD = 6;

/** Even-odd test of a point against a polygon. */
function inPolygon(poly: readonly [number, number][], [x, y]: [number, number]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Where a planet's resource icon goes. */
export interface IconSpot {
  system: string;
  resource: string;
  x: number;
  y: number;
  /** Radius of the icon, in picture pixels. */
  r: number;
}

/**
 * Each planet's resource icon, on its disc's rim on the side away from the
 * ring (as the board prints it), in picture pixels.
 */
export function resourceIconSpots(calib: BoardCalibration, ring: BoardLines['ring'], systems: readonly { id: string; resource: string | null }[]): IconSpot[] {
  const out: IconSpot[] = [];
  for (const s of systems) {
    const d = calib.systems[s.id]?.disc;
    if (!d || !s.resource) continue;
    const dx = d.x - ring.cx;
    const dy = d.y - ring.cy;
    const len = Math.hypot(dx, dy) || 1;
    out.push({ system: s.id, resource: s.resource, x: d.x + (dx / len) * d.r * 0.9, y: d.y + (dy / len) * d.r * 0.9, r: 17 });
  }
  return out;
}

/** Draws the layer on `cv` (any size with the picture's aspect; transparent where nothing is printed). */
export function drawInfoLayer(cv: HTMLCanvasElement, lines: BoardLines, calib: BoardCalibration | null, st: InfoState): void {
  const g = cv.getContext('2d')!;
  const k = cv.width / lines.width;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  g.setTransform(k, 0, 0, k, 0, 0);
  g.lineJoin = 'round';
  g.lineCap = 'round';

  const out = (id: string) => st.inPlay.get(id) === false;

  // The ring of gates: a faint band (none over a gate out of play: only space and the lines there).
  for (const gt of lines.gates) {
    const d = lines.sectors[gt.system];
    if (!d || out(gt.system)) continue;
    g.fillStyle = 'rgba(28,30,44,0.5)';
    g.fill(new Path2D(d));
  }

  // Each sector's colour: its resource as a nebula, or who controls it as a wash.
  for (const [id, t] of st.tints ?? []) {
    const d = lines.sectors[id];
    if (!d) continue;
    if (t.nebula) nebula(g, id, d, t);
    else {
      g.fillStyle = rgba(t.colour, t.alpha);
      g.fill(new Path2D(d));
    }
  }

  // Lines between systems: fading towards the board's edge, fainter over the planets.
  const sep = document.createElement('canvas');
  sep.width = cv.width;
  sep.height = cv.height;
  const s = sep.getContext('2d')!;
  s.setTransform(k, 0, 0, k, 0, 0);
  s.lineCap = 'round';
  s.lineWidth = 2.1;
  for (const l of lines.separators) {
    const grad = s.createLinearGradient(l.a[0], l.a[1], l.b[0], l.b[1]);
    grad.addColorStop(0, `rgba(${INK_RGB},0.85)`);
    grad.addColorStop(0.7, `rgba(${INK_RGB},0.55)`);
    grad.addColorStop(1, `rgba(${INK_RGB},0.12)`);
    s.strokeStyle = grad;
    s.beginPath();
    s.moveTo(l.a[0], l.a[1]);
    s.lineTo(l.b[0], l.b[1]);
    s.stroke();
  }
  s.globalCompositeOperation = 'destination-out';
  s.fillStyle = 'rgba(0,0,0,0.6)';
  for (const [id, sys] of Object.entries(calib?.systems ?? {})) {
    // A planet out of play is gone: its lines run on unbroken.
    if (!sys.disc || out(id)) continue;
    s.beginPath();
    s.arc(sys.disc.x, sys.disc.y, sys.disc.r, 0, Math.PI * 2);
    s.fill();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(sep, 0, 0);
  g.setTransform(k, 0, 0, k, 0, 0);

  // The ring's outline.
  const r = lines.ring;
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(r.cx, r.cy, r.rx, r.ry, (r.angle * Math.PI) / 180, 0, Math.PI * 2);
  g.stroke();

  // The cracks between clusters, dark as on the board: they break the ring.
  if (lines.cracks?.length) {
    const dark = new Path2D();
    for (const d of lines.cracks) dark.addPath(new Path2D(d));
    g.fillStyle = 'rgba(8,8,13,0.94)';
    g.fill(dark, 'evenodd');
  }

  // The edges of the cracks and spikes, and the central hole's jagged edge, as traced.
  const art = new Path2D();
  for (const d of lines.lines) art.addPath(new Path2D(d));
  g.fillStyle = `rgba(${INK_RGB},0.9)`;
  g.fill(art, 'evenodd');

  // Systems out of play keep only these lines: no planet, number, symbol,
  // slot, icon or colour is drawn over them below, so they read as empty space.

  // The map has no hard edge: its colours and lines fade out towards the
  // picture's borders. What players read or use (symbols, gate numbers, slots,
  // resource icons, arrows) comes after, so it never fades.
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  fadeEdges(g, cv.width, cv.height, (EDGE_FADE * cv.width) / lines.width);
  g.restore();

  // Each planet's symbol: a tab on the ring's outer edge, pointing out.
  for (const sym of lines.symbols) if (!out(sym.system)) symbolTab(g, sym.x, sym.y, sym.angle, sym.shape);

  // Gate numbers, upright towards the outside of the ring.
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 44px ${st.numberFont}`;
  for (const gt of lines.gates) {
    if (out(gt.system)) continue;
    g.save();
    g.translate(gt.x, gt.y);
    g.rotate(((gt.angle + 90) * Math.PI) / 180);
    g.shadowColor = 'rgba(0,0,0,0.8)';
    g.shadowBlur = 6;
    g.fillText(String(gt.n), 0, 2);
    g.restore();
  }

  // Building slots: the board's rounded triangles, exactly the outline of a city's or starport's base standing on
  // them (production/base-fixes.md #3).
  const slotShape = calib ? baseOutline(calib.height / BOARD_DEPTH) : [];
  for (const [id, sys] of Object.entries(calib?.systems ?? {})) {
    if (out(id)) continue;
    for (const p of sys.slots ?? []) slotTriangle(g, p.x, p.y, slotShape);
  }

  // Each planet's resource icon on its rim: a dark token ringed in the resource's colour.
  for (const ic of st.icons ?? []) {
    if (out(ic.system)) continue;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.7)';
    g.shadowBlur = 6;
    g.beginPath();
    g.arc(ic.x, ic.y, ic.r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(10,9,12,0.88)';
    g.fill();
    g.restore();
    g.lineWidth = 2;
    g.strokeStyle = ic.ring;
    g.stroke();
    const s = ic.r * 1.35;
    g.drawImage(ic.image, ic.x - s / 2, ic.y - s / 2, s, s);
  }

  // ?debug=spots: where pieces go.
  if (st.showSpots) {
    g.lineWidth = 2.5;
    g.font = '700 14px sans-serif';
    for (const [id, sp] of Object.entries(lines.spots ?? {})) {
      if (out(id)) continue;
      g.strokeStyle = '#5ee0ff';
      g.fillStyle = '#5ee0ff';
      sp.ships.forEach(([x, y], i) => {
        g.beginPath();
        g.arc(x, y, 13, 0, Math.PI * 2);
        g.stroke();
        g.fillText(String(i), x, y + 1);
      });
      g.strokeStyle = '#ff7ef0';
      for (const [x, y] of sp.tokens) g.strokeRect(x - 10, y - 10, 20, 20);
      // The centred places for 1–4 seats: one colour per seat count.
      (sp.layouts ?? []).forEach((fig, n) => {
        g.strokeStyle = ['#ffffff', '#ffd84a', '#7dff8a', '#ff9a4a'][n];
        for (const [x, y] of fig) {
          g.beginPath();
          g.arc(x, y, 6 + 4 * n, 0, Math.PI * 2);
          g.stroke();
        }
      });
    }
  }

  // Gates linked across the systems out of play: a curved two-headed arrow.
  for (const [a, b] of st.bridges ?? []) {
    const pts = bridgeArc(lines, st.inPlay, a, b);
    if (pts) bridgeArrow(g, pts);
  }

}

/** The corners of a traced sector path ("M x,y L x,y … Z"). */
function pathPoints(d: string): [number, number][] {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
  return pts;
}

/** Width of the fade at the map's borders, in picture pixels. */
export const EDGE_FADE = 150;

/** Fades the canvas out towards its borders: transparent at the edge, untouched from `w` pixels in. */
function fadeEdges(g: CanvasRenderingContext2D, width: number, height: number, w: number): void {
  const ramp = (x0: number, y0: number, x1: number, y1: number) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    // A smoothstep in a few stops, so the fade has no visible start.
    for (const t of [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1]) grad.addColorStop(t, `rgba(0,0,0,${(1 - t * t * (3 - 2 * t)).toFixed(3)})`);
    return grad;
  };
  g.save();
  // destination-out (not -in): it touches only the strips, the rest stays.
  g.globalCompositeOperation = 'destination-out';
  const sides: [number, number, number, number, number, number, number, number][] = [
    [0, 0, w, 0, 0, 0, w, height],
    [width, 0, width - w, 0, width - w, 0, w, height],
    [0, 0, 0, w, 0, 0, width, w],
    [0, height, 0, height - w, 0, height - w, width, w],
  ];
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of sides) {
    g.fillStyle = ramp(x0, y0, x1, y1);
    g.fillRect(rx, ry, rw, rh);
  }
  g.restore();
}

/** A curved arrow along `pts` with a head at each end, in the layer's ink over a dark edge. */
function bridgeArrow(g: CanvasRenderingContext2D, pts: [number, number][]): void {
  const head = (tip: [number, number], from: [number, number]) => {
    const a = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    const L = 24;
    const W = 14;
    const nx = Math.cos(a + Math.PI / 2);
    const ny = Math.sin(a + Math.PI / 2);
    const p = new Path2D();
    p.moveTo(tip[0] + Math.cos(a) * 6, tip[1] + Math.sin(a) * 6);
    p.lineTo(tip[0] - Math.cos(a) * L + nx * W, tip[1] - Math.sin(a) * L + ny * W);
    p.lineTo(tip[0] - Math.cos(a) * L * 0.62, tip[1] - Math.sin(a) * L * 0.62);
    p.lineTo(tip[0] - Math.cos(a) * L - nx * W, tip[1] - Math.sin(a) * L - ny * W);
    p.closePath();
    return p;
  };
  const n = pts.length;
  const shaft = new Path2D();
  shaft.moveTo(pts[2][0], pts[2][1]);
  for (let i = 3; i < n - 2; i++) shaft.lineTo(pts[i][0], pts[i][1]);
  const heads = [head(pts[0], pts[3]), head(pts[n - 1], pts[n - 4])];
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = 'rgba(0,0,0,0.85)';
  g.shadowBlur = 8;
  g.strokeStyle = '#0a090c';
  g.lineWidth = 13;
  g.stroke(shaft);
  g.lineWidth = 7;
  for (const h of heads) g.stroke(h);
  g.shadowBlur = 0;
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.stroke(shaft);
  g.fillStyle = INK;
  for (const h of heads) g.fill(h);
  g.restore();
}

/** A building base's outline (models.json `base`), in picture pixels at `pxPerUnit`, centred like the map's slot points. */
function baseOutline(pxPerUnit: number): { x: number; z: number }[] {
  const { side, radius } = models.base;
  return roundedTriangle(side * pxPerUnit, radius * pxPerUnit, 6);
}

/** A building slot: the base's rounded triangle (`shape`, pointing away from the viewer) centred on x, y. */
function slotTriangle(g: CanvasRenderingContext2D, x: number, y: number, shape: { x: number; z: number }[]): void {
  if (!shape.length) return;
  g.beginPath();
  shape.forEach((p, i) => (i ? g.lineTo(x + p.x, y + p.z) : g.moveTo(x + p.x, y + p.z)));
  g.closePath();
  g.fillStyle = 'rgba(6,6,10,0.55)';
  g.fill();
  g.strokeStyle = `rgba(${INK_RGB},0.95)`;
  g.lineWidth = 2.2;
  g.stroke();
}

/** A planet symbol's tab at x, y (`angle`: outward direction in degrees). */
function symbolTab(g: CanvasRenderingContext2D, x: number, y: number, angle: number, shape: string): void {
  g.save();
  g.translate(x, y);
  g.rotate(((angle + 90) * Math.PI) / 180);
  // The tab: a cream shield, its flat side on the ring.
  g.beginPath();
  g.moveTo(-11, 9);
  g.lineTo(-11, -4);
  g.quadraticCurveTo(-11, -12, 0, -14);
  g.quadraticCurveTo(11, -12, 11, -4);
  g.lineTo(11, 9);
  g.closePath();
  g.fillStyle = INK;
  g.fill();
  g.fillStyle = '#1a1712';
  g.strokeStyle = '#1a1712';
  g.lineWidth = 2;
  if (shape === 'hexagon') {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const px = 6 * Math.cos(a);
      const py = -1 + 6 * Math.sin(a);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.stroke();
  } else if (shape === 'crescent') {
    // A disc minus an offset disc, kept inside the first.
    const outer = new Path2D();
    outer.arc(0, -1, 6, 0, Math.PI * 2);
    g.save();
    g.clip(outer);
    const moon = new Path2D();
    moon.arc(0, -1, 6, 0, Math.PI * 2);
    moon.arc(2.8, -2.6, 5.2, 0, Math.PI * 2);
    g.fill(moon, 'evenodd');
    g.restore();
  } else {
    // arrowhead
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(6, 5);
    g.lineTo(0, 1.5);
    g.lineTo(-6, 5);
    g.closePath();
    g.fill();
  }
  g.restore();
}
