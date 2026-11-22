// The owner's 3D piece models (assets/models/*.glb), dressed for the board:
// fitted to their size (models.json), painted in the seat's colour where the
// model's plating is cream or orange while its other patches (teal, rust,
// grey, dark metal) stay as they are; ships float with glowing engines;
// damaged pieces smoke and burn; cities have lit windows, starports blinking
// landing lights. Cities and starports stand on a triangular base like the
// physical pieces. All light and particle motion runs in shaders off one
// shared clock (fxTime), so it costs nothing per frame on the CPU.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import config from './models.json';
import { bounds, engineSpots, fireSpots, fitModel, rimSpots, rng, roundedTriangle, windowSpots } from './model-fx';
import type { ModelSpec } from './model-fx';
import { paintedWood, SEAT_PAINT } from './pieces3d';
import type { PieceKind } from './pieces3d';

const urls = import.meta.glob('../../../assets/models/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Seconds on the effects clock (frozen when motion is off). Shared by every effect shader. */
export const fxTime = { value: 0 };
/** Drawing-buffer height in pixels, for sizing the glow points. */
export const fxViewHeight = { value: 1080 };

interface Model {
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture;
  engines: THREE.Vector3[];
  windows: THREE.Vector3[];
  rim: THREE.Vector3[];
  fire: THREE.Vector3[];
}

const models = new Map<PieceKind, Model>();
let loading: Promise<boolean> | null = null;

/** True once at least one model is loaded. */
export function hasModels(): boolean {
  return models.size > 0;
}

function urlFor(kind: PieceKind): string | null {
  const hit = Object.entries(urls).find(([path]) => path.endsWith(`/${kind}.glb`));
  return hit ? hit[1] : null;
}

/** Loads every model present in assets/models. Resolves true when at least one loaded. Safe to call more than once. */
export function loadModels(): Promise<boolean> {
  loading ??= (async () => {
    const loader = new GLTFLoader();
    const kinds = Object.keys(config.pieces) as PieceKind[];
    await Promise.all(
      kinds.map(async (kind) => {
        const url = urlFor(kind);
        if (!url) return;
        try {
          const gltf = await loader.loadAsync(url);
          let mesh: THREE.Mesh | null = null;
          gltf.scene.traverse((o) => {
            if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
          });
          if (!mesh) return;
          models.set(kind, prepare(kind, mesh));
        } catch {
          // A broken file leaves that kind on the older pieces.
        }
      }),
    );
    return models.size > 0;
  })();
  return loading;
}

function prepare(kind: PieceKind, mesh: THREE.Mesh): Model {
  const spec = config.pieces[kind as keyof typeof config.pieces] as ModelSpec;
  const g = mesh.geometry.clone();
  mesh.updateWorldMatrix(true, false);
  g.applyMatrix4(mesh.matrixWorld);
  if (spec.rotateZ) g.rotateZ((spec.rotateZ * Math.PI) / 180);
  const pos0 = g.getAttribute('position').array;
  const b0 = bounds(pos0);
  g.translate(-(b0.min[0] + b0.max[0]) / 2, 0, -(b0.min[2] + b0.max[2]) / 2);
  const fit = fitModel(b0.min, b0.max, spec);
  g.scale(fit.scale, fit.scale, fit.scale);
  g.translate(0, fit.lift, 0);
  g.computeBoundingBox();
  const pos = g.getAttribute('position').array;
  const nrm = g.getAttribute('normal').array;
  const v = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
  const texture = ((mesh.material as THREE.MeshStandardMaterial).map ?? null) as THREE.Texture;
  return {
    geometry: g,
    texture,
    engines: kind === 'ship' || kind === 'flagship' ? engineSpots(pos).map(v) : [],
    windows: kind === 'city' ? windowSpots(pos, nrm, config.windows.count).map((p) => new THREE.Vector3(p.x + p.nx * 0.006, p.y, p.z + p.nz * 0.006)) : [],
    rim: kind === 'starport' ? rimSpots(pos, nrm, config.landing.count).map(v) : [],
    fire: fireSpots(pos, nrm, config.fire.sources).map(v),
  };
}

// ---- seat paint on the model's texture ----

const TINT_GLSL = `
#include <map_fragment>
{
  vec3 lin = diffuseColor.rgb;
  vec3 s = pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2));
  float mx = max(s.r, max(s.g, s.b));
  float mn = min(s.r, min(s.g, s.b));
  float d = mx - mn;
  float sat = mx > 0.001 ? d / mx : 0.0;
  float lum = dot(s, vec3(0.299, 0.587, 0.114));
  float h = 0.0;
  if (d > 0.0001) {
    if (mx == s.r) h = mod((s.g - s.b) / d, 6.0);
    else if (mx == s.g) h = (s.b - s.r) / d + 2.0;
    else h = (s.r - s.g) / d + 4.0;
    h /= 6.0;
  }
  // The plating: cream panels and bright orange paint. Teal, rust, grey and dark metal stay.
  float cream = smoothstep(0.55, 0.66, lum) * (1.0 - smoothstep(0.3, 0.42, sat));
  float orange = smoothstep(0.045, 0.06, h) * (1.0 - smoothstep(0.115, 0.135, h)) * smoothstep(0.5, 0.6, sat) * smoothstep(0.62, 0.72, mx);
  float m = clamp(max(cream, orange), 0.0, 1.0) * uTintStrength;
  vec3 paint = uSeat * (0.42 + 0.8 * lum);
  diffuseColor.rgb = mix(lin, paint, m) * uShade;
}
`;

const materials = new Map<string, THREE.MeshStandardMaterial>();

function bodyMaterial(kind: PieceKind, seat: number, damaged: boolean): THREE.MeshStandardMaterial {
  const key = `${kind}:${seat}:${damaged ? 1 : 0}`;
  const hit = materials.get(key);
  if (hit) return hit;
  const m = models.get(kind)!;
  const mat = new THREE.MeshStandardMaterial({ map: m.texture, roughness: 0.72, metalness: 0.12 });
  const seatColor = new THREE.Color(SEAT_PAINT[seat % SEAT_PAINT.length]);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSeat = { value: seatColor };
    shader.uniforms.uTintStrength = { value: config.tint.strength };
    shader.uniforms.uShade = { value: damaged ? config.tint.damagedShade : 1 };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uSeat;\nuniform float uTintStrength;\nuniform float uShade;\nvoid main() {')
      .replace('#include <map_fragment>', TINT_GLSL);
  };
  mat.customProgramCacheKey = () => 'arcs-tint';
  materials.set(key, mat);
  return mat;
}

// ---- glowing points: engines, windows, landing lights, fire, smoke ----

/** Effect modes understood by the points shader. */
const Fx = { Engine: 0, Window: 1, Landing: 2, Fire: 3, Smoke: 4 } as const;
type Fx = (typeof Fx)[keyof typeof Fx];

const POINTS_VERT = `
uniform float uTime;
uniform float uSize;
uniform float uViewH;
uniform float uMode;
attribute vec3 aColor;
attribute float aPhase;
varying vec3 vColor;
varying float vAlpha;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  vec3 p = position;
  float a = 1.0;
  float s = uSize;
  if (uMode < 0.5) {
    a = 0.72 + 0.28 * sin(uTime * 31.0 + aPhase * 20.0) * sin(uTime * 7.0 + aPhase * 5.0);
  } else if (uMode < 1.5) {
    float slot = floor(uTime * 0.2 + aPhase * 5.0);
    a = step(0.22, hash(slot * 12.9898 + aPhase * 78.233)) * (0.85 + 0.15 * sin(uTime * 1.7 + aPhase * 9.0));
  } else if (uMode < 2.5) {
    float k = fract(uTime * 0.55 - aPhase);
    a = 0.18 + 0.82 * smoothstep(0.0, 0.05, k) * (1.0 - smoothstep(0.07, 0.25, k));
  } else {
    bool fire = uMode < 3.5;
    float life = fract(uTime * (fire ? 1.1 : 0.32) + aPhase);
    float rise = fire ? 0.1 : 0.32;
    p += vec3(sin(aPhase * 41.0) * 0.035 * life, life * rise, cos(aPhase * 29.0) * 0.035 * life);
    if (fire) { a = 1.0 - life; s = uSize * (1.0 - 0.55 * life); }
    else { a = sin(life * 3.14159) * 0.5; s = uSize * (0.45 + life); }
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = s * projectionMatrix[1][1] * uViewH * 0.5 / -mv.z;
  vColor = aColor;
  vAlpha = a;
}
`;

const POINTS_FRAG = `
varying vec3 vColor;
varying float vAlpha;
uniform float uMode;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float g = uMode > 3.5 ? smoothstep(1.0, 0.2, d) : pow(1.0 - d, 1.6);
  vec3 c = uMode < 3.5 ? mix(vColor, vec3(1.0), pow(1.0 - d, 4.0) * 0.8) : vColor;
  gl_FragColor = vec4(c, g * vAlpha);
}
`;

const pointMaterials = new Map<string, THREE.ShaderMaterial>();

function pointMaterial(mode: Fx, size: number): THREE.ShaderMaterial {
  const key = `${mode}:${size}`;
  const hit = pointMaterials.get(key);
  if (hit) return hit;
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: fxTime, uViewH: fxViewHeight, uSize: { value: size }, uMode: { value: mode } },
    vertexShader: POINTS_VERT,
    fragmentShader: POINTS_FRAG,
    transparent: true,
    depthWrite: false,
    blending: mode === Fx.Smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  pointMaterials.set(key, m);
  return m;
}

function points(mode: Fx, size: number, at: readonly THREE.Vector3[], colors: readonly string[], seed: number): THREE.Points {
  const r = rng(seed);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(at.flatMap((p) => [p.x, p.y, p.z]), 3));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(at.flatMap((_, i) => new THREE.Color(colors[i % colors.length]).toArray()), 3));
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(at.map((_, i) => (mode === Fx.Landing ? i / at.length : r())), 1));
  const p = new THREE.Points(geo, pointMaterial(mode, size));
  p.frustumCulled = false;
  p.renderOrder = mode === Fx.Smoke ? 3 : 2;
  return p;
}

/** Fire and smoke over a damaged piece: a few particles from each source, in the holder's (unturned) frame. */
function burning(sources: readonly THREE.Vector3[], seed: number): THREE.Object3D[] {
  if (!sources.length) return [];
  const fire = sources.flatMap((s) => Array.from({ length: config.fire.perSource }, () => s.clone()));
  const smoke = sources.flatMap((s) => Array.from({ length: config.smoke.perSource }, () => s.clone().setY(s.y + 0.02)));
  return [points(Fx.Fire, config.fire.size, fire, [config.fire.color, '#ffd25a'], seed), points(Fx.Smoke, config.smoke.size, smoke, [config.smoke.color, '#b3aca1'], seed + 1)];
}

// ---- the triangular base of a building ----

let baseGeo: THREE.BufferGeometry | null = null;

function baseGeometry(): THREE.BufferGeometry {
  if (baseGeo) return baseGeo;
  const { side, radius, height, bevel } = config.base;
  // The outline is shrunk by the bevel, which grows it back out to the printed triangle's size.
  const c = roundedTriangle(side - 2 * Math.sqrt(3) * bevel, Math.max(0.001, radius - bevel), 6);
  const shape = new THREE.Shape();
  // Shape space is x/y; it is laid flat below, so shape y becomes −z.
  shape.moveTo(c[0].x, -c[0].z);
  for (const p of c.slice(1)) shape.lineTo(p.x, -p.z);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: height - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  baseGeo = g;
  return g;
}

let seedCounter = 1;

/**
 * A model piece for a seat, or null when that kind's model is not loaded.
 * Ships and flagships float (userData.float) with glowing engines; `lying`
 * marks a damaged ship: tilted, low, burning. Cities and starports stand on
 * their triangular base; `damaged` darkens them and sets them burning.
 */
export function modelPiece(kind: PieceKind, seat: number, opts: { lying?: boolean; damaged?: boolean } = {}): THREE.Object3D | null {
  const m = models.get(kind);
  if (!m) return null;
  const damaged = !!(opts.lying || opts.damaged);
  const seed = seedCounter++;
  const holder = new THREE.Group();
  const body = new THREE.Group();
  holder.add(body);
  const mesh = new THREE.Mesh(m.geometry, bodyMaterial(kind, seat, damaged));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  body.add(mesh);
  const ship = kind === 'ship' || kind === 'flagship';
  if (ship) {
    const spec = config.pieces[kind] as ModelSpec;
    if (opts.lying) {
      body.rotation.x = config.damagedTilt;
      body.position.y = config.damagedHover - spec.hover;
    } else if (m.engines.length) {
      body.add(points(Fx.Engine, config.engine.size * (kind === 'flagship' ? 1.3 : 1), m.engines, [config.engine.color], seed));
    }
    holder.userData.float = { phase: rng(seed)() * Math.PI * 2, base: body.position.y };
  } else if (kind === 'city' || kind === 'starport') {
    const base = new THREE.Mesh(baseGeometry(), paintedWood(SEAT_PAINT[seat % SEAT_PAINT.length]));
    base.castShadow = true;
    base.receiveShadow = true;
    holder.add(base);
    if (!damaged && m.windows.length) body.add(points(Fx.Window, config.windows.size, m.windows, [config.windows.color, '#ffe6a8', '#9fd8ff'], seed));
    if (!damaged && m.rim.length) body.add(points(Fx.Landing, config.landing.size, m.rim, config.landing.colors, seed));
  }
  if (damaged) {
    body.updateMatrix();
    const sources = m.fire.map((p) => p.clone().applyMatrix4(body.matrix));
    holder.add(...burning(sources, seed));
  }
  holder.userData.kind = kind;
  holder.userData.model = true;
  holder.userData.body = body;
  return holder;
}
