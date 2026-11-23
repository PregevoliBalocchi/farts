// The planned move on the 3D map (board3d.ts draws it while the player plans a
// route): a glowing arrow in the mover's colour along the route, with flowing
// chevrons, small marks on the systems passed through, and hologram ships
// where the ships will stand. Materials and geometry only; where things go is
// board3d.ts's.

import * as THREE from 'three';
import { fxTime } from './models3d';
import config from './models.json';

/** A point on the table (world units). */
export interface TablePoint {
  x: number;
  z: number;
}

const ARROW_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// u: world units along the route; v: 0..1 across. The body glows in the seat's
// colour, brightest in the middle, with chevrons flowing towards the end.
const ARROW_FRAG = `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uSpeed;
uniform float uSpacing;
varying vec2 vUv;
void main() {
  float across = abs(vUv.y - 0.5) * 2.0;
  float core = smoothstep(0.62, 0.0, across);
  float glow = pow(1.0 - across, 2.0) * 0.7;
  float s = fract((vUv.x - across * 0.06) / uSpacing - uTime * uSpeed);
  float chev = smoothstep(0.0, 0.12, s) * smoothstep(0.5, 0.3, s);
  float fadeIn = smoothstep(0.0, 0.3, vUv.x);
  float a = (glow + core * (0.4 + 0.6 * chev)) * fadeIn;
  vec3 c = mix(uColor, vec3(1.0), core * (0.25 + 0.45 * chev));
  gl_FragColor = vec4(c, a * uOpacity);
}
`;

// The arrow's head: a soft-edged triangle (u along, 0 at the base; v across).
const HEAD_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float across = abs(vUv.y - 0.5) * 2.0 / max(1.0 - vUv.x, 0.001);
  float fill = smoothstep(1.0, 0.72, across);
  float rim = smoothstep(1.0, 0.85, across) - smoothstep(0.85, 0.6, across);
  vec3 c = mix(uColor, vec3(1.0), 0.35 + 0.4 * rim);
  gl_FragColor = vec4(c, (0.25 + 0.75 * fill) * uOpacity);
}
`;

const HOLO_VERT = `
varying vec3 vNormal;
varying vec3 vView;
varying float vY;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = -mv.xyz;
  vY = (modelMatrix * vec4(position, 1.0)).y;
  gl_Position = projectionMatrix * mv;
}
`;

// A see-through ship of light: bright rims, faint body, scan lines drifting up, a light flicker.
const HOLO_FRAG = `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vView;
varying float vY;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.8);
  float scan = 0.7 + 0.3 * sin(vY * 220.0 - uTime * 5.0);
  float flick = 0.93 + 0.07 * sin(uTime * 21.0) * sin(uTime * 3.7);
  float a = (0.3 + 0.85 * fres) * scan * flick;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), fres * 0.45), a * uOpacity);
}
`;

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false } as const;

/** The arrow body's material in `color`; `opacity` dims it (the hovered next step is fainter). */
export function arrowMaterial(color: string, opacity = 1): THREE.ShaderMaterial {
  const a = config.route;
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: fxTime,
      uOpacity: { value: opacity },
      uSpeed: { value: a.speed },
      uSpacing: { value: a.spacing },
    },
    vertexShader: ARROW_VERT,
    fragmentShader: ARROW_FRAG,
    side: THREE.DoubleSide,
    ...additive,
  });
}

function headMaterial(color: string, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: ARROW_VERT,
    fragmentShader: HEAD_FRAG,
    side: THREE.DoubleSide,
    ...additive,
  });
}

/** The hologram material in `color`. */
export function holoMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: fxTime, uOpacity: { value: config.route.holo } },
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    ...additive,
  });
}

/**
 * Turns a piece into its hologram: every mesh in `material`, no shadows, its
 * glow points hidden. Its geometry stays shared with the real pieces (disposeRoute leaves it).
 */
export function toHologram(o: THREE.Object3D, material: THREE.Material): THREE.Object3D {
  o.userData.hologram = true;
  o.traverse((x) => {
    if ((x as THREE.Points).isPoints) x.visible = false;
    else if ((x as THREE.Mesh).isMesh) {
      const m = x as THREE.Mesh;
      m.material = material;
      m.castShadow = false;
      m.receiveShadow = false;
      m.renderOrder = 4;
    }
  });
  return o;
}

/**
 * The route's course through `points` (at least two): a smooth curve; a single
 * step bends a little to one side, like a ship steering rather than a straight cut.
 */
export function routeCurve(points: readonly TablePoint[]): THREE.CatmullRomCurve3 {
  const pts = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
  if (pts.length === 2) {
    const d = pts[1].clone().sub(pts[0]);
    const side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.1);
    pts.splice(1, 0, pts[0].clone().add(pts[1]).multiplyScalar(0.5).add(side));
  }
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

/**
 * The arrow along `curve`: a glowing ribbon from `startGap` after its start to
 * `endGap` before its end, then the head. `opacity` dims it.
 */
export function routeArrow(curve: THREE.Curve<THREE.Vector3>, color: string, startGap: number, endGap: number, opacity = 1): THREE.Group {
  const a = config.route;
  const len = curve.getLength();
  const group = new THREE.Group();
  const head = Math.min(a.headLength, len * 0.4);
  const u0 = Math.min(startGap, len * 0.3) / len;
  const u1 = Math.max(u0 + 0.01, (len - Math.min(endGap, len * 0.3) - head) / len);
  const n = Math.max(8, Math.ceil(((u1 - u0) * len) / 0.03));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * i) / n;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const side = new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(a.width / 2);
    pos.push(p.x - side.x, a.height, p.z - side.z, p.x + side.x, a.height, p.z + side.z);
    uv.push((u - u0) * len, 0, (u - u0) * len, 1);
    if (i < n) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  body.setIndex(idx);
  const ribbon = new THREE.Mesh(body, arrowMaterial(color, opacity));
  ribbon.renderOrder = 3;
  group.add(ribbon);

  // The head: from where the ribbon ends to the tip, along the course's last direction.
  const base = curve.getPointAt(u1);
  const tip = curve.getPointAt(Math.min(1, u1 + head / len));
  const dir = tip.clone().sub(base).setY(0).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(a.headWidth / 2);
  const hg = new THREE.BufferGeometry();
  hg.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([base.x - side.x, a.height, base.z - side.z, base.x + side.x, a.height, base.z + side.z, tip.x, a.height, tip.z], 3),
  );
  hg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0.5], 2));
  const tipMesh = new THREE.Mesh(hg, headMaterial(color, opacity));
  tipMesh.renderOrder = 3;
  group.add(tipMesh);
  return group;
}

/**
 * A mark on the table at `p` in `color`: a small ring on a system the route
 * passes through, or (`stop`) a double ring round the place where it must end.
 */
export function routeMark(p: TablePoint, color: string, stop = false): THREE.Group {
  const g = new THREE.Group();
  const rings: [number, number, number][] = stop ? [[0.27, 0.3, 0.9], [0.33, 0.345, 0.5]] : [[0.07, 0.1, 0.95]];
  for (const [r0, r1, o] of rings) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), new THREE.MeshBasicMaterial({ color, opacity: o, ...additive }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, config.route.height + 0.002, p.z);
    m.renderOrder = 3;
    g.add(m);
  }
  return g;
}

/**
 * Frees what was made for the route under `g`: its geometries and materials,
 * a sprite's picture. Holograms keep their geometry (shared with the real
 * pieces); their material is in `keep` and freed by the caller.
 */
export function disposeRoute(g: THREE.Object3D, keep: ReadonlySet<THREE.Material> = new Set()): void {
  const free = (x: THREE.Object3D, shared: boolean) => {
    const sharedHere = shared || !!x.userData.hologram;
    const m = x as THREE.Mesh;
    if (m.isMesh || (x as THREE.Sprite).isSprite) {
      if (!sharedHere && !(x as THREE.Sprite).isSprite) m.geometry?.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        if (!mat || keep.has(mat)) continue;
        (mat as THREE.SpriteMaterial).map?.dispose();
        if (!sharedHere || (x as THREE.Sprite).isSprite) mat.dispose();
      }
    }
    for (const c of x.children) free(c, sharedHere);
  };
  free(g, false);
}
