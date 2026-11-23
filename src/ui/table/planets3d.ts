// Procedural planets for the 3D map: one per planet system, the size of the
// planet on the board picture, turning slowly under the map's glass. Each
// follows a recipe (planets.json) read from its illustration: a surface
// pattern drawn in a shader (contour lines, craters, bands, swirls, veins,
// patches, machinery, glowing cracks, ice) in the colours of its resource, and
// extra bodies (a ring, moons, a network of moons, asteroids, shards, blocks).
// The owner's own model, assets/models/planets/<system id>.glb, replaces the
// procedural planet when present.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import recipes from './planets.json';

const ownModels = import.meta.glob('../../../assets/models/planets/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Surface patterns the shader knows, in the order of its uStyle switch. */
export const STYLES = ['terrain', 'cratered', 'banded', 'swirled', 'veined', 'patched', 'machine', 'cracked', 'icy'] as const;
export type PlanetStyle = (typeof STYLES)[number];
export type PlanetExtra = 'ring' | 'moons' | 'network' | 'asteroids' | 'shards' | 'blocks';

/** A planet's recipe with the defaults filled in. */
export interface PlanetRecipe {
  style: PlanetStyle;
  extras: PlanetExtra[];
  size: number;
  spin: number;
  tilt: number;
  craterScale: number;
}

/** Colours of a resource's planets. */
export interface PlanetPalette {
  base: string;
  line: string;
  accent: string;
}

/** The recipe for planet `id` (defaults when planets.json does not name it). Pure. */
export function planetRecipe(id: string): PlanetRecipe {
  const d = recipes.defaults;
  const r = (recipes.planets as Record<string, Partial<PlanetRecipe> & { style?: string; extras?: string[] }>)[id] ?? {};
  const style = (STYLES as readonly string[]).includes(r.style ?? '') ? (r.style as PlanetStyle) : 'terrain';
  return { style, extras: (r.extras ?? []) as PlanetExtra[], size: r.size ?? d.size, spin: r.spin ?? d.spin, tilt: r.tilt ?? d.tilt, craterScale: r.craterScale ?? 1 };
}

/** The palette of a resource (relic's when unknown). Pure. */
export function planetPalette(resource: string | undefined): PlanetPalette {
  const p = recipes.palette as Record<string, PlanetPalette>;
  return p[resource ?? ''] ?? p.relic;
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
// Distance to the nearest and second nearest cell point (Worley).
vec2 worley(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = o + hash3(i + o) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(vec2(d1, d2));
}
// A thin line where v crosses whole numbers, about px pixels wide on screen.
float isoline(float v, float px) {
  float w = fwidth(v) * px;
  float d = abs(fract(v - 0.5) - 0.5);
  return 1.0 - smoothstep(0.0, w, d);
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
uniform float uDim;
uniform vec3 uSun;
varying vec3 vPos;
varying vec3 vNormalW;
varying vec3 vViewDir;
${NOISE}
void main() {
  vec3 p = vPos + uSeed;
  float shade = 0.5 + 0.5 * fbm3(p * 1.2);
  vec3 col = uBase * (0.7 + 0.6 * shade);
  float line = 0.0;
  float glow = 0.0;
  if (uStyle == 0) {            // terrain: contour lines of a rolling relief
    float h = fbm3(p * 1.4);
    line = isoline(h * 6.0, 1.0);
    col = mix(col, uBase * 1.6, smoothstep(0.0, 0.5, h));
  } else if (uStyle == 1) {     // cratered: rings around cells
    vec2 w = worley(p * 2.6 * uCrater);
    line = 1.0 - smoothstep(0.0, fwidth(w.x) * 1.4, abs(w.x - 0.33));
    line = max(line, 0.6 * (1.0 - smoothstep(0.0, fwidth(w.x) * 1.4, abs(w.x - 0.2))));
    col *= 0.75 + 0.5 * smoothstep(0.2, 0.36, w.x);
  } else if (uStyle == 2) {     // banded: wavy bands of a gas giant
    float b = vPos.y * 6.0 + 0.5 * fbm3(p * 1.8);
    line = isoline(b, 1.0) * 0.9;
    col = mix(col, uLine * 0.55, 0.35 * smoothstep(-0.2, 0.8, sin(b * 3.14159)));
  } else if (uStyle == 3) {     // swirled: warped marble, spirals
    vec3 q = vec3(fbm3(p * 1.1), fbm3(p * 1.1 + 5.2), fbm3(p * 1.1 + 9.7));
    float f = fbm3(p * 1.0 + 2.2 * q);
    line = isoline(f * 6.0, 1.0);
    col = mix(col, uAccent * 0.55, smoothstep(0.1, 0.6, q.x));
  } else if (uStyle == 4) {     // veined: ridges
    float r = 1.0 - abs(fbm3(p * 1.8));
    line = smoothstep(0.86, 0.96, r);
    col = mix(col, uLine * 0.45, smoothstep(0.6, 0.95, r) * 0.5);
  } else if (uStyle == 5) {     // patched: bright blobs with outlines
    float f = fbm3(p * 1.6);
    float blob = smoothstep(0.1, 0.16, f);
    col = mix(col, mix(uLine, uAccent, smoothstep(0.2, 0.5, fbm3(p * 2.0 + 4.0))) * 0.75, blob);
    line = isoline(f * 1.0 + 0.86, 1.2) * 0.8;
  } else if (uStyle == 6) {     // machine: panels on a lattice of latitudes and longitudes
    float lat = asin(clamp(vPos.y, -1.0, 1.0));
    float lon = atan(vPos.z, vPos.x);
    float a = lat * 6.0;
    float b = lon * 6.0 + 0.5 * floor(a);
    line = max(isoline(a, 1.0), isoline(b, 1.0) * step(0.3, hash3(vec3(floor(a), floor(b), 1.0)).x));
    float cell = hash3(vec3(floor(a), floor(b), 3.0)).y;
    col *= 0.7 + 0.6 * cell;
    glow = step(0.93, cell) * 0.7;
  } else if (uStyle == 7) {     // cracked: dark crust, glowing fissures
    col = uBase * (0.45 + 0.4 * shade);
    vec2 w = worley(p * 2.2);
    float edge = w.y - w.x;
    glow = 1.0 - smoothstep(0.0, 0.06, edge);
    line = 0.3 * isoline(fbm3(p * 1.6) * 5.0, 1.0);
  } else {                      // icy: pale plates with dark seams
    vec2 w = worley(p * 3.0);
    col = mix(uLine * 0.55, uAccent * 0.75, shade);
    line = -(1.0 - smoothstep(0.0, 0.05, w.y - w.x));
  }
  col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 0.75);
  if (line >= 0.0) col = mix(col, uLine, clamp(line, 0.0, 1.0) * 0.85);
  else col = mix(col, uBase * 0.6, clamp(-line, 0.0, 1.0));
  // Light: a distant sun, a soft fill, and a thin atmosphere at the rim.
  vec3 n = normalize(vNormalW);
  float lit = max(dot(n, normalize(uSun)), 0.0);
  float rim = pow(1.0 - max(dot(n, normalize(vViewDir)), 0.0), 3.0);
  vec3 c = col * (0.22 + 0.95 * lit) + uLine * rim * 0.55 + uAccent * glow * 1.2;
  gl_FragColor = vec4(c * uDim, 1.0);
  #include <colorspace_fragment>
}
`;

/** Direction of the light that shines on the planets (world space). */
export const SUN = new THREE.Vector3(-0.55, 0.75, 0.45).normalize();

function surface(recipe: PlanetRecipe, pal: PlanetPalette, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uStyle: { value: STYLES.indexOf(recipe.style) },
      uBase: { value: new THREE.Color(pal.base) },
      uLine: { value: new THREE.Color(pal.line) },
      uAccent: { value: new THREE.Color(pal.accent) },
      uSeed: { value: seed },
      uCrater: { value: recipe.craterScale },
      uDim: { value: 1 },
      uSun: { value: SUN },
    },
  });
}

/** A flat-shaded material for the small bodies, in the planet's colours. */
function rockMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true });
}

/** A lumpy rock: an icosahedron with its vertices pushed in and out. */
function rock(r: number, rand: () => number, detail = 0): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).multiplyScalar(0.75 + rand() * 0.5);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** The extra bodies of a recipe, around a planet of radius r. */
function extras(recipe: PlanetRecipe, pal: PlanetPalette, r: number, rand: () => number): { still: THREE.Object3D[]; orbit: THREE.Object3D[] } {
  const still: THREE.Object3D[] = [];
  const orbit: THREE.Object3D[] = [];
  for (const x of recipe.extras) {
    if (x === 'ring') {
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 4;
      const g = cv.getContext('2d')!;
      for (let i = 0; i < 256; i++) {
        const a = (0.25 + 0.6 * rand()) * Math.sin((i / 256) * Math.PI);
        g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        g.fillRect(i, 0, 1, 4);
      }
      const tex = new THREE.CanvasTexture(cv);
      const geo = new THREE.RingGeometry(r * 1.35, r * 2.05, 96, 1);
      // Map the texture across the ring's width.
      const uv = geo.getAttribute('uv');
      const pos = geo.getAttribute('position');
      for (let i = 0; i < uv.count; i++) {
        const d = Math.hypot(pos.getX(i), pos.getY(i));
        uv.setXY(i, (d - r * 1.35) / (r * 0.7), 0.5);
      }
      const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: pal.line, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2 + 0.45;
      ring.rotation.y = 0.35;
      still.push(ring);
    } else if (x === 'moons') {
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(rock(r * (0.14 + 0.06 * i), rand, 1), rockMaterial(pal.line));
        const pivot = new THREE.Group();
        m.position.set(r * (1.45 + 0.35 * i), r * 0.1 * (i ? -1 : 1), 0);
        pivot.rotation.set(0.3 * rand(), rand() * Math.PI * 2, 0.25);
        pivot.userData.orbit = 0.25 + 0.2 * i;
        pivot.add(m);
        orbit.push(pivot);
      }
    } else if (x === 'network') {
      // Small moons joined by struts, turning with the planet as one structure.
      const net = new THREE.Group();
      const mat = rockMaterial(pal.line);
      const strut = new THREE.MeshStandardMaterial({ color: pal.accent, roughness: 0.6 });
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + rand() * 0.4;
        const p = new THREE.Vector3(Math.cos(a) * r * 1.7, (rand() - 0.5) * r * 0.9, Math.sin(a) * r * 1.7);
        pts.push(p);
        const m = new THREE.Mesh(new THREE.SphereGeometry(r * (0.22 + 0.18 * rand()), 20, 14), mat);
        m.position.copy(p);
        net.add(m);
      }
      const link = (a: THREE.Vector3, b: THREE.Vector3) => {
        const len = a.distanceTo(b);
        const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.035, r * 0.035, len, 6), strut);
        c.position.copy(a).add(b).multiplyScalar(0.5);
        c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        net.add(c);
      };
      pts.forEach((p, i) => {
        link(p, pts[(i + 1) % pts.length]);
        if (i % 2 === 0) link(p, new THREE.Vector3(0, 0, 0));
      });
      net.userData.orbit = 0.12;
      orbit.push(net);
    } else if (x === 'asteroids') {
      const belt = new THREE.Group();
      const mat = rockMaterial(pal.line);
      const mat2 = rockMaterial(pal.accent);
      for (let i = 0; i < 14; i++) {
        const a = rand() * Math.PI * 2;
        const d = r * (1.2 + rand() * 1.0);
        const m = new THREE.Mesh(rock(r * (0.12 + rand() * 0.3), rand), i % 3 ? mat : mat2);
        m.position.set(Math.cos(a) * d, (rand() - 0.5) * r * 1.2, Math.sin(a) * d);
        m.rotation.set(rand() * 6, rand() * 6, rand() * 6);
        belt.add(m);
      }
      belt.userData.orbit = 0.2;
      orbit.push(belt);
    } else if (x === 'shards') {
      // Pieces broken off the planet, drifting just off its surface.
      const shards = new THREE.Group();
      const mat = rockMaterial(pal.line);
      for (let i = 0; i < 9; i++) {
        const dir = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
        const m = new THREE.Mesh(rock(r * (0.18 + rand() * 0.22), rand), mat);
        m.position.copy(dir.multiplyScalar(r * (1.15 + rand() * 0.35)));
        m.rotation.set(rand() * 6, rand() * 6, rand() * 6);
        shards.add(m);
      }
      shards.userData.orbit = 0.15;
      orbit.push(shards);
    } else if (x === 'blocks') {
      // A blocky crust: cubes over the surface, some missing, some lifted off.
      const blocks = new THREE.Group();
      const mats = [rockMaterial(pal.line), rockMaterial(pal.accent), rockMaterial(pal.base)];
      const n = 70;
      for (let i = 0; i < n; i++) {
        if (rand() < 0.25) continue;
        const y = 1 - (2 * (i + 0.5)) / n;
        const rad = Math.sqrt(1 - y * y);
        const t = i * 2.399963;
        const dir = new THREE.Vector3(Math.cos(t) * rad, y, Math.sin(t) * rad);
        const s = r * (0.22 + rand() * 0.12);
        const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mats[i % 3]);
        m.position.copy(dir.multiplyScalar(r * (0.95 + (rand() < 0.15 ? 0.3 : 0))));
        m.lookAt(0, 0, 0);
        blocks.add(m);
      }
      still.push(blocks);
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
  surface: THREE.ShaderMaterial | null;
  spin: number;
}

/**
 * Builds planet `id` of resource `resource` with radius `r` (world units):
 * the owner's model when assets/models/planets/<id>.glb exists (loaded in the
 * background, the procedural planet shows meanwhile), else the recipe.
 */
export function buildPlanet(id: string, resource: string | undefined, r: number): Planet {
  const recipe = planetRecipe(id);
  const pal = planetPalette(resource);
  const rand = rng(id);
  const holder = new THREE.Group();
  const body = new THREE.Group();
  holder.add(body);
  body.rotation.z = recipe.tilt * (rand() - 0.5) * 2;
  const R = r * recipe.size;
  const mat = surface(recipe, pal, rand() * 50);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), mat);
  body.add(sphere);
  const { still, orbit } = extras(recipe, pal, R, rand);
  for (const o of still) body.add(o);
  for (const o of orbit) holder.add(o);
  const planet: Planet = { id, holder, body, orbits: orbit, surface: mat, spin: recipe.spin };
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
      for (const o of orbit) holder.remove(o);
      planet.orbits = [];
      planet.surface = null;
    }).catch(() => undefined);
  }
  return planet;
}

/** Turns the planets and their moons: `sec` seconds on the clock. */
export function turnPlanets(planets: readonly Planet[], sec: number): void {
  for (const p of planets) {
    p.body.rotation.y = (sec / 60) * p.spin * Math.PI * 2;
    for (const o of p.orbits) o.rotation.y = (sec / 60) * (o.userData.orbit as number) * Math.PI * 2 * 4;
  }
}

/** Dims a planet (out of play) or lights it fully. */
export function dimPlanet(p: Planet, dim: boolean): void {
  if (p.surface) p.surface.uniforms.uDim.value = dim ? 0.3 : 1;
  p.holder.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!m || !(m instanceof THREE.MeshStandardMaterial)) return;
    m.userData.base ??= m.color.clone();
    m.color.copy(m.userData.base as THREE.Color).multiplyScalar(dim ? 0.3 : 1);
  });
}
