// The space behind the 3D map: black, sprinkled with far stars at many depths
// below the map's glass, so moving the camera shows them drifting (parallax).

import * as THREE from 'three';

/** Star colours: mostly white, some warm, some cold. */
const TINTS = ['#ffffff', '#ffffff', '#ffffff', '#fff1d8', '#ffd9b0', '#d8e6ff', '#bcd3ff'];

/** A small deterministic random number generator. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A soft round dot, the shape of every star. */
function dot(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The star field: `count` stars spread over a wide slab under the map
 * (`width` × `depth` world units, from just under the planets to far below).
 * Two layers: many faint small stars, a few bright large ones.
 */
export function starfield(width: number, depth: number, count = 7000, seed = 7): THREE.Group {
  const rand = rng(seed);
  const group = new THREE.Group();
  const sprite = dot();
  const layer = (n: number, size: number, bright: number) => {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      // Spread wider the deeper they are, so the far field fills the view at any tilt.
      const y = -3 - Math.pow(rand(), 0.7) * 60;
      const spread = 1 + -y / 12;
      pos[i * 3] = (rand() - 0.5) * width * spread;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = (rand() - 0.5) * depth * spread - y * 0.6;
      c.set(TINTS[Math.floor(rand() * TINTS.length)]).multiplyScalar(bright * (0.35 + 0.65 * rand()));
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  };
  group.add(layer(count, 0.16, 0.9), layer(Math.round(count / 18), 0.42, 1));
  return group;
}
