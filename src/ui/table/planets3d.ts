// Procedural planets for the 3D map: one per planet system, the size of the
// planet on the board picture, turning slowly under the map's glass. Each
// follows a recipe (planets.json) drawn after its illustration on the board
// and seen from above, as the map shows it: a surface drawing in a shader
// (ink lines and fills in the colours of its resource: broken plates, armour
// panels, eroded pits, gas streaks, craters, marble veins, blotches, scratches,
// contour lines, machinery circles, eyes of spirals, glowing rifts, cracked
// ice, rock facets, pixels, bubbles), sometimes a chunk cut away, sometimes an
// atmosphere glowing at the rim, and extra bodies (a ring, cratered moons, a
// network of moons, boulders, shards, blocks, debris) kept clear of the
// neighbouring planets. The owner's own model, assets/models/planets/<system
// id>.glb, replaces the procedural planet when present.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import recipes from './planets.json';

const ownModels = import.meta.glob('../../../assets/models/planets/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Surface drawings the shader knows, in the order of its uStyle switch ('terrain' is the contour map, the default). */
export const STYLES = ['terrain', 'shattered', 'plated', 'eroded', 'striated', 'cratered', 'marbled', 'blotched', 'scratched', 'tech', 'spirals', 'rifted', 'icy', 'rocky', 'pixel', 'molecule'] as const;
export type PlanetStyle = (typeof STYLES)[number];
export type PlanetExtra = 'ring' | 'moons' | 'network' | 'asteroids' | 'shards' | 'blocks' | 'debris';

/** Colours of a resource's planets. */
export interface PlanetPalette {
  base: string;
  line: string;
  accent: string;
}

/** A planet's recipe with the defaults filled in. */
export interface PlanetRecipe {
  style: PlanetStyle;
  extras: PlanetExtra[];
  size: number;
  spin: number;
  tilt: number;
  craterScale: number;
  /** A style's variant (contours: 1 waves, 2 swirls). */
  param: number;
  /** A chunk cut away: towards [x, y, z], `depth` of the radius deep; null when whole. */
  bite: [number, number, number, number] | null;
  /** A glow at the rim: which palette colour and how strong; null when none. */
  atmosphere: { color: 'line' | 'accent'; strength: number } | null;
  /** Colours that replace the resource's palette. */
  colors: PlanetPalette | null;
}

type RawRecipe = { style?: string; extras?: string[]; size?: number; spin?: number; tilt?: number; craterScale?: number; param?: number; bite?: number[]; atmosphere?: { color: 'line' | 'accent'; strength: number }; colors?: PlanetPalette };

/** The recipe for planet `id` (defaults when planets.json does not name it). Pure. */
export function planetRecipe(id: string): PlanetRecipe {
  const d = recipes.defaults;
  const r = ((recipes.planets as Record<string, RawRecipe>)[id] ?? {}) as RawRecipe;
  const style = (STYLES as readonly string[]).includes(r.style ?? '') ? (r.style as PlanetStyle) : 'terrain';
  const bite = Array.isArray(r.bite) && r.bite.length === 4 ? (r.bite as [number, number, number, number]) : null;
  return {
    style,
    extras: (r.extras ?? []) as PlanetExtra[],
    size: r.size ?? d.size,
    spin: r.spin ?? d.spin,
    tilt: r.tilt ?? d.tilt,
    craterScale: r.craterScale ?? 1,
    param: r.param ?? 0,
    bite,
    atmosphere: r.atmosphere ?? null,
    colors: r.colors ?? null,
  };
}

/** The palette of a resource (relic's when unknown). Pure. */
export function planetPalette(resource: string | undefined): PlanetPalette {
  const p = recipes.palette as Record<string, PlanetPalette>;
  return p[resource ?? ''] ?? p.relic;
}

/**
 * How far a planet's extra bodies may reach, in its own radii, before they
 * would touch the nearest other planet: half the gap between the two discs,
 * past this one's edge. Pure. `discs` are the planets' centres and radii.
 */
export function roomAround(id: string, discs: Readonly<Record<string, { x: number; y: number; r: number }>>): number {
  const me = discs[id];
  if (!me) return Infinity;
  let room = Infinity;
  for (const [other, d] of Object.entries(discs)) {
    if (other === id) continue;
    const gap = Math.hypot(d.x - me.x, d.y - me.y) - d.r - me.r;
    room = Math.min(room, (me.r + Math.max(0, gap) * 0.5 + d.r * 0.08) / me.r);
  }
  return room;
}

/** A small deterministic random number generator from a string seed. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// ---- the surface shader ----

const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
// 3D simplex noise (Ashima Arts, Stefan Gustavson; MIT).
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p) {
  float f = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { f += a * snoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return f;
}
float fbm3(vec3 p) {
  float f = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { f += a * snoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return f;
}
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
// Worley: distance to the nearest and second nearest cell point, and a number for the nearest cell.
vec3 worley(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 h = hash3(i + o);
    vec3 r = o + h - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h.z; } else if (d < d2) { d2 = d; }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
// A thin line where v crosses whole numbers, about px pixels wide on screen.
float isoline(float v, float px) {
  float w = fwidth(v) * px;
  float d = abs(fract(v - 0.5) - 0.5);
  return 1.0 - smoothstep(0.0, w, d);
}
// A thin line where d is zero (d >= 0), about px pixels wide.
float ink(float d, float px) {
  return 1.0 - smoothstep(0.0, fwidth(d) * px + 1e-5, d);
}
// The seams of a 3D grid of cells drawn on the sphere, leaving out the planes
// that lie almost flat on the surface (they would smear into wide bands).
float grid(vec3 g, vec3 n, float px) {
  vec3 d = 0.5 - abs(fract(g) - 0.5);
  vec3 l = 1.0 - smoothstep(vec3(0.0), fwidth(g) * px, d);
  vec3 keep = smoothstep(vec3(0.93), vec3(0.72), abs(n));
  return max(max(l.x * keep.x, l.y * keep.y), l.z * keep.z);
}
// A point on the upper half of the sphere (the face the map shows), from a number.
vec3 upper(float k) {
  vec3 h = hash3(vec3(k * 7.31, k * 1.7 + 3.0, 11.0 - k));
  return normalize(vec3(h.x * 2.0 - 1.0, 0.35 + h.y, h.z * 2.0 - 1.0));
}
`;

const VERT = /* glsl */ `
varying vec3 vPos;
varying vec3 vNormalW;
varying vec3 vViewDir;
void main() {
  vPos = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform int uStyle;
uniform vec3 uBase;
uniform vec3 uLine;
uniform vec3 uAccent;
uniform float uSeed;
uniform float uCrater;
uniform float uParam;
uniform vec4 uBite;
uniform float uDim;
uniform vec3 uSun;
varying vec3 vPos;
varying vec3 vNormalW;
varying vec3 vViewDir;
${NOISE}
void main() {
  vec3 p = normalize(vPos);
  vec3 q = p + uSeed;
  float mott = fbm3(q * 2.3);
  vec3 col = uBase * (0.85 + 0.35 * mott);
  float glow = 0.0;
  vec3 glowCol = uAccent;

  // A chunk cut away: ragged, or in whole pixels for the pixel planet.
  if (uBite.w > 0.0) {
    vec3 bd = normalize(uBite.xyz);
    float b = uStyle == 14 ? dot((floor(p * 9.0) + 0.5) / 9.0, bd) - (1.0 - uBite.w)
                           : dot(p, bd) - (1.0 - uBite.w) - 0.1 * fbm3(q * 3.2);
    if (b > 0.0) discard;
  }

  if (uStyle == 0) {             // terrain: a contour map, every fourth line bolder
    // A smooth height (few octaves), so the contour lines stay apart at the map's size.
    float h = fbm3(q * 1.1) + 0.08 * snoise(q * 6.0);
    col = mix(uBase * 0.55, uLine * 0.32, smoothstep(0.0, 0.5, h));
    float lines = isoline(h * 6.0, 1.1) * 0.8 + isoline(h * 1.5, 2.0) * 0.5;
    if (uParam > 0.5 && uParam < 1.5) {        // with sweeping waves
      float wv = dot(p, normalize(vec3(1.0, 0.25, 0.45))) * 14.0 + 1.6 * sin(p.z * 7.0) + fbm3(q * 2.0) * 1.8;
      lines = max(lines * 0.8, isoline(wv, 0.9) * 0.75 * smoothstep(-0.1, 0.35, h));
    } else if (uParam > 1.5) {                 // with swirls
      vec3 w = vec3(fbm3(q * 1.2), fbm3(q * 1.2 + 4.1), fbm3(q * 1.2 + 8.3));
      float s = fbm3(q * 0.8 + 0.9 * w);
      lines = max(lines * 0.6, isoline(s * 4.0, 0.9) * 0.8);
    }
    col = mix(col, uLine, clamp(lines, 0.0, 1.0));
  } else if (uStyle == 1) {      // shattered: plates split by dark cracks, strokes across them
    vec3 w = worley(q * 2.6);
    float edge = w.y - w.x;
    col = mix(uLine * 0.78, uBase * 1.7, w.z * 0.7 + 0.3 * mott);
    float st = isoline((dot(p, vec3(0.6, 0.3, 0.74)) + w.z) * 26.0, 0.8) * (0.2 + 0.4 * w.z);
    col = mix(col, uBase * 0.7, st);
    col = mix(col, uLine * 1.05, (1.0 - smoothstep(0.07, 0.11, edge)) * 0.55);
    col = mix(col, vec3(0.035, 0.02, 0.02), 1.0 - smoothstep(0.03, 0.065, edge));
  } else if (uStyle == 2) {      // plated: armour panels in curved bands, cut into segments, a few hatches
    vec3 ax = normalize(vec3(1.0, 0.35, 0.25));
    vec3 bx = normalize(cross(ax, vec3(0.0, 1.0, 0.0)));
    vec3 by = cross(ax, bx);
    float lat = asin(clamp(dot(p, ax), -1.0, 1.0));
    float lon = atan(dot(p, by), dot(p, bx));
    float bandF = lat * 3.2 + 0.12 * sin(lon * 2.0);
    float band = floor(bandF);
    vec3 hb = hash3(vec3(band, 4.0, 1.0));
    float segF = lon / 6.2832 * (4.0 + floor(hb.x * 6.0)) + hb.y * 3.0;
    vec3 hs = hash3(vec3(band, floor(segF), 7.0));
    col = mix(uBase * 0.55, uLine * 0.42, step(0.55, hs.x) * (0.5 + 0.5 * hs.y));
    col = mix(col, uBase * 0.28, step(0.86, hs.z));
    // Segment cuts fade out near the band axis's poles, where they would bunch up.
    float lines = min(1.0, isoline(bandF, 1.3) + isoline(segF, 1.1) * (1.0 - smoothstep(0.75, 0.95, abs(dot(p, ax)))));
    lines = max(lines, isoline(bandF * 4.0, 0.7) * step(0.62, hs.y) * 0.6);
    vec2 f2 = vec2(fract(bandF), fract(segF));
    float box = step(0.72, hs.z) * step(hs.z, 0.86) * (1.0 - smoothstep(0.0, 0.05, abs(max(abs(f2.x - 0.5), abs(f2.y - 0.5)) - 0.27)));
    lines = max(lines, box * 0.8);
    col = mix(col, uLine, lines * 0.9);
  } else if (uStyle == 3) {      // eroded: pink above, yellow below, pitted, contour lines
    vec3 w = worley(q * 3.6 * uCrater);
    float R = mix(0.22, 0.42, w.z);
    float pit = 1.0 - smoothstep(R - 0.03, R, w.x);
    float h = fbm3(q * 1.3);
    float side = smoothstep(-0.25, 0.25, -p.z * 0.9 + p.x * 0.3 + h * 0.6);
    col = mix(uAccent * 0.42, uLine * 0.75, side);
    col = mix(col, uBase * 0.7, smoothstep(0.1, 0.45, fbm3(q * 2.0 + 6.0)) * 0.6);
    col = mix(col, uBase * 0.5, pit * 0.85);
    float rim = ink(abs(w.x - R), 1.3) * step(0.35, w.z);
    col = mix(col, uLine, max(rim, isoline(h * 9.0, 0.8) * 0.5) * 0.85);
  } else if (uStyle == 4) {      // striated: a gas giant's streaks, fine lines along them
    vec3 ax = normalize(vec3(0.3, 0.15, 1.0));
    float s = dot(p, ax) * 9.0 + 0.9 * fbm3(q * 1.6) + 0.3 * fbm3(q * 5.0);
    col = mix(uBase * 1.3, uLine * 0.6, 0.5 + 0.5 * sin(s * 1.7));
    col = mix(col, uAccent * 0.45, smoothstep(0.6, 1.0, sin(s * 0.6 + 1.0)) * 0.6);
    col = mix(col, uLine * 1.1, clamp(isoline(s * 6.0, 0.7) * 0.45 + isoline(s, 1.2) * 0.6, 0.0, 1.0));
  } else if (uStyle == 5) {      // cratered: craters of two sizes, shadowed inside, rims and inner rings
    col = uBase * (1.1 + 0.5 * mott);
    float lines = 0.0;
    for (int k = 0; k < 2; k++) {
      float sc = k == 0 ? 2.6 : 5.8;
      vec3 w = worley(q * sc * uCrater + float(k) * 7.3);
      float R = mix(0.18, 0.4, w.z);
      col = mix(col, uBase * 0.7, (1.0 - smoothstep(R - 0.02, R, w.x)) * 0.6);
      lines = max(lines, ink(abs(w.x - R), 1.4) * step(0.25, w.z));
      lines = max(lines, 0.5 * ink(abs(w.x - R * 0.6), 1.2) * step(0.7, w.z));
    }
    col = mix(col, uLine, lines * 0.9);
  } else if (uStyle == 6) {      // marbled: pale stone with dark winding veins
    vec3 wq = q + 0.45 * vec3(fbm3(q * 0.9), fbm3(q * 0.9 + 3.7), fbm3(q * 0.9 + 7.1));
    float v = dot(wq, normalize(vec3(1.0, 0.2, 0.35))) * 4.0 + fbm3(wq * 1.8) * 0.8;
    col = mix(uLine * 0.82, uAccent * 0.92, 0.5 + 0.5 * fbm3(q * 1.5));
    float vein = smoothstep(0.7, 0.95, abs(sin(v * 3.14159))) * smoothstep(-0.3, 0.3, fbm3(wq * 2.2 + 5.0));
    col = mix(col, uBase * 0.55, vein);
    col = mix(col, uBase * 0.9, isoline(v * 9.0, 0.6) * 0.3);
  } else if (uStyle == 7) {      // blotched: dark hatched ground, bright yellow blotches, pink flecks
    col = uBase * (0.55 + 0.3 * mott);
    col = mix(col, uLine * 0.5, isoline(dot(p, vec3(0.7, 0.0, 0.7)) * 50.0, 0.7) * 0.3 * smoothstep(0.0, 0.4, fbm3(q * 2.0)));
    float f = fbm(q * 2.0);
    float blot = smoothstep(0.16, 0.2, f);
    col = mix(col, uLine * 0.95, blot);
    col = mix(col, uAccent * 0.85, smoothstep(0.28, 0.31, fbm3(q * 3.5 + 9.0)) * (1.0 - blot));
  } else if (uStyle == 8) {      // scratched: dark ground with clusters of bright strokes
    col = uBase * (0.5 + 0.3 * mott);
    float a = fbm3(q * 0.8) * 3.0;
    vec3 dir = normalize(vec3(sin(a), 0.2, cos(a)));
    float st = isoline(dot(p, dir) * 70.0 + fbm3(q * 8.0) * 2.0, 0.7);
    col = mix(col, uLine * 0.85, st * smoothstep(0.0, 0.35, fbm3(q * 2.2 + 1.7)));
    col = mix(col, uLine * 0.6, isoline(fbm3(q * 1.5) * 7.0, 0.8) * 0.35);
  } else if (uStyle == 9) {      // tech: a machined moon: rings around a hub, great circles, little dials
    col = mix(uBase * 0.9, uLine * 0.55, smoothstep(-0.2, 0.7, p.z + 0.3 * mott));
    col = mix(col, uLine * 0.8, isoline(dot(p, vec3(0.7, 0.2, -0.7)) * 60.0, 0.6) * 0.3 * smoothstep(0.0, 0.6, p.z));
    vec3 a0 = normalize(vec3(0.2, 1.0, 0.35));
    float t0 = dot(p, a0);
    col = mix(col, uLine * 0.3, step(0.5, fract(t0 * 2.5)) * step(0.3, t0) * 0.35);
    float lines = isoline(t0 * 5.0, 1.0) * step(0.1, t0);
    lines = max(lines, isoline(dot(p, normalize(vec3(1.0, 0.2, 0.1))), 1.2));
    lines = max(lines, isoline(dot(p, normalize(vec3(-0.3, 0.3, 1.0))), 1.2));
    lines = max(lines, isoline(dot(p, normalize(vec3(0.8, 0.4, -0.7))) * 2.0, 1.0));
    for (int k = 0; k < 4; k++) {
      vec3 c = upper(float(k) + 2.0);
      float d = acos(clamp(dot(p, c), -1.0, 1.0));
      lines = max(lines, isoline(d * 10.0, 0.9) * step(d, 0.32));
    }
    col = mix(col, uLine, lines * 0.9);
  } else if (uStyle == 10) {     // spirals: eyes of rings, pink at their hearts, contours between
    float lines = 0.0, fill = 0.0;
    col = uBase * (0.9 + 0.3 * mott);
    for (int k = 0; k < 5; k++) {
      vec3 c = upper(float(k) * 1.37 + 0.5);
      float R = 0.38 + 0.3 * hash3(vec3(float(k), 9.0, 1.0)).x;
      float d = acos(clamp(dot(p, c), -1.0, 1.0)) / R;
      if (d < 1.0) {
        float w = d + 0.07 * fbm3(q * 3.0);
        lines = max(lines, isoline(w * 6.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, d)));
        fill = max(fill, 1.0 - smoothstep(0.0, 0.6, d));
      }
    }
    col = mix(col, uAccent * 0.75, fill);
    col = mix(col, uLine * 0.6, isoline(fbm3(q * 1.6) * 7.0, 0.8) * 0.35 * (1.0 - fill));
    col = mix(col, uLine, lines * 0.9);
  } else if (uStyle == 11) {     // rifted: a dark crust split by three glowing red jagged rifts
    col = uBase * (0.75 + 0.5 * mott);
    col = mix(col, uLine * 0.28, isoline(fbm3(q * 1.8) * 8.0, 0.7) * 0.3);
    float rift = 0.0, halo = 0.0;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float z0 = -0.55 + fk * 0.55 + 0.1 * sin(fk * 4.1 + uSeed);
      // Lightning: a sawtooth of uneven teeth, roughened by noise.
      float x = p.x * (1.3 + fk * 0.35) + fk * 0.37;
      float tooth = fract(x);
      float zig = (abs(tooth - 0.5) - 0.25) * (0.42 + 0.1 * fk) * (0.7 + 0.6 * hash3(vec3(floor(x), fk, 2.0)).x);
      float d = abs(p.z - z0 - zig - 0.03 * snoise(q * 8.0 + fk));
      float w = 0.025 + 0.045 * smoothstep(-0.3, 0.6, snoise(vec3(p.x * 2.5, fk, 1.0)));
      float span = smoothstep(0.95, 0.35, abs(p.x - 0.2 * sin(fk * 2.0)));
      rift = max(rift, (1.0 - smoothstep(w * 0.4, w, d)) * span);
      halo = max(halo, (1.0 - smoothstep(w, w * 3.0, d)) * span);
    }
    col = mix(col, uLine * 0.55, halo * 0.35);
    col = mix(col, mix(uLine, uAccent, 0.3), rift);
    glow = rift * 0.85 + halo * 0.12;
    glowCol = uLine;
  } else if (uStyle == 12) {     // icy: pale ice, bluer patches, a web of fine cracks
    col = mix(uLine * 0.9, uAccent * 0.95, smoothstep(-0.2, 0.4, fbm3(q * 1.7)));
    float ice = smoothstep(0.05, 0.12, fbm(q * 2.2 + 3.0));
    col = mix(col, uBase * 1.8, ice * 0.55);
    vec3 w = worley(q * 3.4);
    float crack = 1.0 - smoothstep(0.0, 0.035, w.y - w.x);
    vec3 w2 = worley(q * 8.0 + 2.0);
    crack = max(crack, 0.6 * (1.0 - smoothstep(0.0, 0.03, w2.y - w2.x)) * ice);
    float vein = smoothstep(0.93, 0.99, 1.0 - abs(fbm3(q * 2.6)));
    col = mix(col, uBase * 0.8, max(crack, vein * 0.8) * 0.85);
  } else if (uStyle == 13) {     // rocky: pink and blue rock faces with dark seams
    vec3 w = worley(q * 3.0);
    col = mix(uLine * 0.75, uAccent * 0.75, step(0.5, w.z) * 0.8 + 0.2 * mott);
    col *= 0.7 + 0.5 * smoothstep(0.0, 0.4, w.x);
    col = mix(col, uBase * 0.6, 1.0 - smoothstep(0.0, 0.04, w.y - w.x));
    col = mix(col, uLine * 1.1, isoline(fbm3(q * 3.0) * 8.0, 0.7) * 0.3);
  } else if (uStyle == 14) {     // pixel: a planet of blocks, yellow, pink and dark
    vec3 v = floor(p * 9.0);
    vec3 hv = hash3(v + 1.7);
    float f = fbm3(v / 9.0 * 1.8 + uSeed);
    col = uBase * (0.45 + 0.25 * hv.x);
    col = mix(col, uLine * 0.95, step(0.08, f));
    col = mix(col, uAccent * 0.85, step(f, -0.12) * step(0.4, hv.y));
    col = mix(col, uBase * 0.35, grid(p * 9.0, p, 0.9) * 0.8);
  } else {                       // molecule: pink to blue, bubbles outlined in white
    col = mix(uLine * 0.75, uAccent * 0.7, smoothstep(-0.6, 0.6, p.x + 0.4 * fbm3(q * 1.4)));
    vec3 w = worley(q * 3.0);
    float R = mix(0.2, 0.38, w.z);
    col = mix(col, uBase * 0.8, (1.0 - smoothstep(R - 0.02, R, w.x)) * 0.25);
    col = mix(col, vec3(1.0, 0.92, 0.98), ink(abs(w.x - R), 1.3) * 0.7);
  }

  // Inside a cut-away chunk: the dark rock under the surface.
  if (!gl_FrontFacing) {
    col = uBase * (0.18 + 0.12 * mott);
    glow = 0.0;
  }
  // Light: a distant sun, a soft fill, the edge darkening like the board's drawings, a thin bright rim.
  vec3 n = normalize(vNormalW) * (gl_FrontFacing ? 1.0 : -1.0);
  float lit = max(dot(n, normalize(uSun)), 0.0);
  float facing = max(dot(n, normalize(vViewDir)), 0.0);
  vec3 c = col * (0.32 + 0.85 * lit) * (0.55 + 0.45 * facing);
  c += uLine * smoothstep(0.86, 0.98, 1.0 - facing) * 0.3;
  c += glowCol * glow * 1.1;
  gl_FragColor = vec4(c * uDim, 1.0);
  #include <colorspace_fragment>
}
`;

/** Direction of the light that shines on the planets (world space). */
export const SUN = new THREE.Vector3(-0.55, 0.75, 0.45).normalize();

function surface(style: PlanetStyle, pal: PlanetPalette, seed: number, o: { crater?: number; param?: number; bite?: PlanetRecipe['bite'] } = {}): THREE.ShaderMaterial {
  const bite = o.bite ?? [0, 1, 0, 0];
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: o.bite ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: {
      uStyle: { value: STYLES.indexOf(style) },
      uBase: { value: new THREE.Color(pal.base) },
      uLine: { value: new THREE.Color(pal.line) },
      uAccent: { value: new THREE.Color(pal.accent) },
      uSeed: { value: seed },
      uCrater: { value: o.crater ?? 1 },
      uParam: { value: o.param ?? 0 },
      uBite: { value: new THREE.Vector4(bite[0], bite[1], bite[2], bite[3]) },
      uDim: { value: 1 },
      uSun: { value: SUN },
    },
  });
}

/** A glow around the planet's rim, seen as a halo against space. */
function atmosphere(r: number, color: string, strength: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.07, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main() { vec4 p = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-p.xyz); gl_Position = projectionMatrix * p; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying vec3 vN; varying vec3 vV;
        void main() { float f = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(uColor * f * 1.5 * uStrength, f * uStrength); }`,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  m.userData.atmosphere = true;
  return m;
}

/** A rock material in a planet's colours. */
function rockMaterial(color: string, flat = false): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.05, flatShading: flat });
}

/** A unit vector in a random direction. */
function randomDir(rand: () => number): THREE.Vector3 {
  const u = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(Math.cos(a) * s, u, Math.sin(a) * s);
}

/**
 * A boulder: a subdivided icosahedron squashed, swollen in a few places and
 * dented in others, with smooth normals (or faceted, for sharp shards).
 */
function boulder(r: number, rand: () => number, o: { detail?: number; squash?: [number, number, number]; flat?: boolean; cuts?: number } = {}): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, o.detail ?? 2);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const bumps = Array.from({ length: 7 }, () => ({ d: randomDir(rand), a: (rand() - 0.45) * 0.45, k: 2 + rand() * 7 }));
  const sq = o.squash ?? [0.8 + rand() * 0.4, 0.7 + rand() * 0.35, 0.8 + rand() * 0.5];
  // Flat cleavage faces: whatever lies beyond a plane is pressed back onto it, as if chipped off.
  const cuts = Array.from({ length: o.cuts ?? 0 }, () => ({ n: randomDir(rand), c: 0.55 + rand() * 0.3 }));
  const pos = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let s = 1;
    for (const b of bumps) s += b.a * Math.pow(Math.max(0, v.dot(b.d)), b.k);
    for (const c of cuts) {
      const t = v.dot(c.n) * s;
      if (t > c.c) s *= c.c / t;
    }
    pos.setXYZ(i, v.x * r * s * sq[0], v.y * r * s * sq[1], v.z * r * s * sq[2]);
  }
  if (o.flat) g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

/** A small moon: a sphere drawn by the planet shader (craters, or bubbles), in the planet's colours. */
function moon(r: number, pal: PlanetPalette, seed: number, style: PlanetStyle = 'cratered'): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), surface(style, pal, seed, { crater: 1.4 }));
}

/**
 * The extra bodies of a recipe, around a planet of radius r: `still` ones
 * stay put by the planet, `orbit` ones turn around it.
 */
function extras(recipe: PlanetRecipe, pal: PlanetPalette, r: number, rand: () => number): { still: THREE.Object3D[]; orbit: THREE.Object3D[] } {
  const still: THREE.Object3D[] = [];
  const orbit: THREE.Object3D[] = [];
  const bite = recipe.bite ? new THREE.Vector3(recipe.bite[0], recipe.bite[1], recipe.bite[2]).normalize() : randomDir(rand).setY(0.6).normalize();
  for (const x of recipe.extras) {
    if (x === 'ring') {
      // A tilted ring of dust bands, and a few rocks riding on it.
      const ring = new THREE.Group();
      const cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = 4;
      const g = cv.getContext('2d')!;
      for (let i = 0; i < 512; i++) {
        const band = 0.35 + 0.5 * Math.abs(Math.sin(i * 0.09 + rand() * 0.3)) * (0.6 + 0.4 * rand());
        const a = band * Math.sin((i / 512) * Math.PI) ** 0.6 * (i % 97 < 6 ? 0.15 : 1);
        g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        g.fillRect(i, 0, 1, 4);
      }
      const tex = new THREE.CanvasTexture(cv);
      const inner = r * 1.25;
      const outer = r * 1.72;
      const geo = new THREE.RingGeometry(inner, outer, 128, 1);
      const uv = geo.getAttribute('uv');
      const pos = geo.getAttribute('position');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - inner) / (outer - inner), 0.5);
      ring.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: pal.line, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })));
      const riders = new THREE.Group();
      const mat = rockMaterial(pal.accent);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
        const d = inner + (outer - inner) * (0.2 + rand() * 0.6);
        const m = new THREE.Mesh(boulder(r * (0.035 + rand() * 0.05), rand, { detail: 1 }), mat);
        m.position.set(Math.cos(a) * d, Math.sin(a) * d, (rand() - 0.5) * r * 0.04);
        riders.add(m);
      }
      riders.userData.spinZ = 0.05;
      ring.add(riders);
      // Steeply tilted and turned, as the board draws it: a long ellipse seen from above.
      ring.rotation.set(-Math.PI / 2 - 1.05, 0, 0.32);
      still.push(ring);
    } else if (x === 'moons') {
      for (let i = 0; i < 2; i++) {
        const m = moon(r * (0.13 + 0.06 * i), pal, rand() * 40);
        const pivot = new THREE.Group();
        m.position.set(r * (1.4 + 0.3 * i), r * 0.12 * (i ? -1 : 1), 0);
        pivot.rotation.set(0.3 * rand(), rand() * Math.PI * 2, 0.25);
        pivot.userData.orbit = 0.25 + 0.2 * i;
        pivot.add(m);
        orbit.push(pivot);
      }
    } else if (x === 'network') {
      // Small moons in a ring around the planet, joined by struts, turning together.
      const net = new THREE.Group();
      const strut = new THREE.MeshStandardMaterial({ color: pal.accent, roughness: 0.5, metalness: 0.3, emissive: pal.accent, emissiveIntensity: 0.25 });
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + rand() * 0.35;
        const p = new THREE.Vector3(Math.cos(a) * r * 1.5, (rand() - 0.5) * r * 0.7, Math.sin(a) * r * 1.5);
        pts.push(p);
        const m = moon(r * (0.2 + 0.14 * rand()), { base: pal.base, line: i % 2 ? pal.accent : pal.line, accent: i % 2 ? pal.line : pal.accent }, rand() * 40, 'molecule');
        m.position.copy(p);
        net.add(m);
      }
      const link = (a: THREE.Vector3, b: THREE.Vector3, w: number) => {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(r * w, r * w, a.distanceTo(b), 8), strut);
        c.position.copy(a).add(b).multiplyScalar(0.5);
        c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        net.add(c);
      };
      pts.forEach((p, i) => {
        link(p, pts[(i + 1) % pts.length], 0.03);
        if (i % 2 === 0) link(p, new THREE.Vector3(0, 0, 0), 0.022);
      });
      net.userData.orbit = 0.12;
      orbit.push(net);
    } else if (x === 'asteroids') {
      // Boulders crowding round the small planet, pink and blue, some large.
      const belt = new THREE.Group();
      // Faceted rock in muted planet colours, so the planet stays the brightest thing.
      const tone = (c: string, k: number) => '#' + new THREE.Color(c).lerp(new THREE.Color(pal.base), k).getHexString();
      const mats = [rockMaterial(tone(pal.line, 0.45), true), rockMaterial(tone(pal.accent, 0.4), true), rockMaterial(tone(pal.line, 0.7), true)];
      for (let i = 0; i < 16; i++) {
        const a = rand() * Math.PI * 2;
        const d = r * (1.25 + rand() * 0.75);
        const big = i < 4;
        const m = new THREE.Mesh(boulder(r * (big ? 0.32 + rand() * 0.18 : 0.08 + rand() * 0.14), rand, { detail: 1, flat: true, cuts: 4 }), mats[i % 3]);
        m.position.set(Math.cos(a) * d, (rand() - 0.4) * r * 0.9, Math.sin(a) * d);
        m.rotation.set(rand() * 6, rand() * 6, rand() * 6);
        belt.add(m);
      }
      belt.userData.orbit = 0.18;
      orbit.push(belt);
    } else if (x === 'shards') {
      // Sharp fragments breaking off where the chunk is missing, drifting away from it.
      const shards = new THREE.Group();
      const mats = [rockMaterial(pal.line, true), rockMaterial(pal.base, true)];
      for (let i = 0; i < 11; i++) {
        const dir = bite.clone().add(randomDir(rand).multiplyScalar(0.45)).normalize();
        const m = new THREE.Mesh(boulder(r * (0.08 + rand() * 0.14), rand, { detail: 0, squash: [1.4, 0.35, 1], flat: true }), mats[i % 3 === 0 ? 1 : 0]);
        m.position.copy(dir.multiplyScalar(r * (1.05 + rand() * 0.45)));
        m.rotation.set(rand() * 6, rand() * 6, rand() * 6);
        shards.add(m);
      }
      still.push(shards);
    } else if (x === 'blocks') {
      // Pixels of the planet lifting off where its chunk is missing.
      const blocks = new THREE.Group();
      const mats = [rockMaterial(pal.line, true), rockMaterial(pal.accent, true), rockMaterial(pal.base, true)];
      const s = (r * 2) / 9;
      for (let i = 0; i < 14; i++) {
        const dir = bite.clone().add(randomDir(rand).multiplyScalar(0.5)).normalize();
        const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mats[i % 3]);
        m.position.copy(dir.multiplyScalar(r * (0.95 + rand() * 0.5)));
        m.lookAt(0, 0, 0);
        blocks.add(m);
      }
      still.push(blocks);
    } else if (x === 'debris') {
      // A trail of small square wreckage off one side.
      const debris = new THREE.Group();
      const mats = [rockMaterial(pal.line, true), rockMaterial(pal.base, true)];
      const side = new THREE.Vector3(-0.8, 0.1, 0.6).normalize();
      for (let i = 0; i < 12; i++) {
        const s = r * (0.04 + rand() * 0.06);
        const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * (0.5 + rand()), s * (0.6 + rand())), mats[i % 2]);
        const t = rand();
        m.position.copy(side.clone().multiplyScalar(r * (1.08 + t * 0.4))).add(new THREE.Vector3((rand() - 0.5) * r * 0.5, (rand() - 0.5) * r * 0.2, (rand() - 0.5) * r * 0.5));
        m.rotation.set(rand() * 6, rand() * 6, rand() * 6);
        debris.add(m);
      }
      still.push(debris);
    }
  }
  return { still, orbit };
}

/** One planet: a holder (placed by the map) whose body turns. */
export interface Planet {
  id: string;
  holder: THREE.Group;
  body: THREE.Group;
  orbits: THREE.Object3D[];
  /** Every extra body (ring, moons, rocks, atmosphere), for views that show the globe alone. */
  extras: THREE.Object3D[];
  surface: THREE.ShaderMaterial | null;
  spin: number;
}

/** How far an object reaches from the planet's centre, in the planet's horizontal plane (it may turn about Y). */
function reach(o: THREE.Object3D): number {
  o.updateMatrix();
  let far = 0;
  const v = new THREE.Vector3();
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    // The mesh's transform up to the planet's holder.
    const t = new THREE.Matrix4();
    for (let a: THREE.Object3D | null = m; a && a !== o.parent; a = a.parent) {
      a.updateMatrix();
      t.premultiply(a.matrix);
    }
    const pos = m.geometry.getAttribute('position');
    const step = Math.max(1, Math.floor(pos.count / 200));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(t);
      far = Math.max(far, Math.hypot(v.x, v.z));
    }
  });
  return far;
}

/**
 * Builds planet `id` of resource `resource` with radius `r` (world units):
 * the owner's model when assets/models/planets/<id>.glb exists (loaded in the
 * background, the procedural planet shows meanwhile), else the recipe. Its
 * extra bodies are drawn in to reach no further than `room` radii.
 */
export function buildPlanet(id: string, resource: string | undefined, r: number, room = Infinity): Planet {
  const recipe = planetRecipe(id);
  const pal = recipe.colors ?? planetPalette(resource);
  const rand = rng(id);
  const holder = new THREE.Group();
  const body = new THREE.Group();
  holder.add(body);
  body.rotation.z = recipe.tilt * (rand() - 0.5) * 2;
  const R = r * recipe.size;
  const mat = surface(recipe.style, pal, rand() * 50, { crater: recipe.craterScale, param: recipe.param, bite: recipe.bite });
  body.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), mat));
  const { still, orbit } = extras(recipe, pal, R, rand);
  // Rings and wreckage stay put by the planet (a turning ring would sweep over its neighbours); moons orbit.
  const all: THREE.Object3D[] = [...still, ...orbit];
  for (const o of all) holder.add(o);
  if (all.length && Number.isFinite(room)) {
    const far = Math.max(...all.map(reach));
    const k = Math.min(1, (room * r) / Math.max(far, 1e-6));
    if (k < 1) for (const o of all) o.scale.multiplyScalar(k);
  }
  if (recipe.atmosphere) {
    const glow = atmosphere(R, recipe.atmosphere.color === 'accent' ? pal.accent : pal.line, recipe.atmosphere.strength);
    holder.add(glow);
    all.push(glow);
  }
  const planet: Planet = { id, holder, body, orbits: orbit, extras: all, surface: mat, spin: recipe.spin };
  const own = Object.entries(ownModels).find(([p]) => p.endsWith(`/${id}.glb`))?.[1];
  if (own) {
    void new GLTFLoader().loadAsync(own).then((gltf) => {
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3()).length() / Math.SQRT2 / 2 || 1;
      gltf.scene.scale.setScalar(r / size);
      const c = box.getCenter(new THREE.Vector3()).multiplyScalar(r / size);
      gltf.scene.position.sub(c);
      body.clear();
      body.add(gltf.scene);
      for (const o of planet.extras) holder.remove(o);
      planet.orbits = [];
      planet.extras = [];
      planet.surface = null;
    }).catch(() => undefined);
  }
  return planet;
}

/** Turns the planets, their moons and the rocks riding their rings: `sec` seconds on the clock. */
export function turnPlanets(planets: readonly Planet[], sec: number): void {
  for (const p of planets) {
    p.body.rotation.y = (sec / 60) * p.spin * Math.PI * 2;
    for (const o of p.orbits) o.rotation.y = (sec / 60) * (o.userData.orbit as number) * Math.PI * 2 * 4;
    for (const o of p.extras)
      for (const x of o.children) if (x.userData.spinZ) x.rotation.z = (sec / 60) * (x.userData.spinZ as number) * Math.PI * 2 * 4;
  }
}

/** Dims a planet (out of play) or lights it fully. */
export function dimPlanet(p: Planet, dim: boolean): void {
  p.holder.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m instanceof THREE.ShaderMaterial && m.uniforms.uDim) m.uniforms.uDim.value = dim ? 0.3 : 1;
    if (!m || !(m instanceof THREE.MeshStandardMaterial)) return;
    m.userData.base ??= m.color.clone();
    m.color.copy(m.userData.base as THREE.Color).multiplyScalar(dim ? 0.3 : 1);
  });
}
