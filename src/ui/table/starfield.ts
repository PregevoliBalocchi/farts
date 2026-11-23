// The space behind the 3D map, after the board's own art: black, with far
// nebulae in the board's paints, a dense band of faint stars like a galaxy,
// stars of many sizes and tints, and the four-pointed sparkles painted on the
// board. All at many depths below the map's glass, so moving the camera shows
// them drifting (parallax).

import * as THREE from 'three';

/** Star colours: mostly white, some warm and cold, a few in the board's pinks, teals and golds. */
const TINTS = ['#ffffff', '#ffffff', '#ffffff', '#fff1d8', '#ffd9b0', '#d8e6ff', '#bcd3ff', '#ffd6f0', '#c4fff2', '#ffe7a8'];
/** Colours of the far nebulae: the board's sector paints, darkened. */
const NEBULAE = ['#6a2c6e', '#2a5a66', '#7a3c1c', '#30386e', '#5a4a1a', '#7a2a48'];

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

function texture(cv: HTMLCanvasElement): THREE.Texture {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft round dot, the shape of most stars. */
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
  return texture(cv);
}

/** A four-pointed sparkle with a glow, like the stars painted on the board. */
function sparkle(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const glow = g.createRadialGradient(64, 64, 0, 64, 64, 40);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(0.2, 'rgba(255,255,255,0.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  // Two thin spikes, tapering to points.
  g.fillStyle = '#ffffff';
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    g.beginPath();
    g.moveTo(64 - 62 * dx, 64 - 62 * dy);
    g.lineTo(64 + 4 * dy, 64 + 4 * dx);
    g.lineTo(64 + 62 * dx, 64 + 62 * dy);
    g.lineTo(64 - 4 * dy, 64 - 4 * dx);
    g.closePath();
    g.fill();
  }
  return texture(cv);
}

/** A sheet of far nebula: soft clouds in the board's paints with darker lanes, transparent elsewhere. */
function nebulaSheet(seed: number): THREE.Texture {
  const rand = rng(seed);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1024;
  const g = cv.getContext('2d')!;
  const cloud = (x: number, y: number, r: number, squash: number, stops: [number, string][]) => {
    g.save();
    g.translate(x, y);
    g.rotate(rand() * Math.PI);
    g.scale(1, squash);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [t, c] of stops) grad.addColorStop(t, c);
    g.fillStyle = grad;
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
  };
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 34; i++) {
    const c = new THREE.Color(NEBULAE[Math.floor(rand() * NEBULAE.length)]);
    const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
    const a = 0.025 + rand() * 0.07;
    cloud(rand() * 1024, rand() * 1024, 60 + rand() * 260, 0.3 + rand() * 0.7, [
      [0, `rgba(${rgb},${a})`],
      [0.5, `rgba(${rgb},${a * 0.45})`],
      [1, `rgba(${rgb},0)`],
    ]);
  }
  // Dark lanes through the clouds.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 18; i++) {
    cloud(rand() * 1024, rand() * 1024, 40 + rand() * 160, 0.15 + rand() * 0.3, [
      [0, 'rgba(0,0,0,0.6)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
  }
  // Fade the sheet's own edges so its square never shows.
  g.globalCompositeOperation = 'destination-in';
  const edge = g.createRadialGradient(512, 512, 300, 512, 512, 512);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 1024, 1024);
  return texture(cv);
}

/**
 * The space under the map (`width` × `depth` world units around it, from just
 * under the planets to far below). Stars keep a size in screen pixels (times
 * `pixelRatio`), so the far ones stay visible; `count` sets the density.
 */
export function starfield(width: number, depth: number, count = 7000, seed = 7, pixelRatio = 1): THREE.Group {
  const rand = rng(seed);
  const group = new THREE.Group();
  const round = dot();
  const star4 = sparkle();
  const place = (band: boolean): number[] => {
    // Deeper is wider, so the far field fills the view at any tilt.
    const y = -3 - Math.pow(rand(), 0.7) * 60;
    const spread = 1 + -y / 12;
    if (!band) return [(rand() - 0.5) * width * spread, y, (rand() - 0.5) * depth * spread - y * 0.6];
    // The galaxy's band: along a diagonal, thickest in the middle.
    const t = rand() - 0.5;
    const off = (rand() + rand() + rand() - 1.5) * 0.18;
    return [(t * 1.2 + off * 0.6) * width * spread, y, (t * 0.7 - off) * depth * spread - y * 0.6];
  };
  const layer = (n: number, size: number, bright: number, map: THREE.Texture, band = 0) => {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos.set(place(rand() < band), i * 3);
      c.set(TINTS[Math.floor(rand() * TINTS.length)]).multiplyScalar(bright * (0.3 + 0.7 * Math.pow(rand(), 1.5)));
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: size * pixelRatio, map, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  };
  // Far nebulae: a few sheets at different depths, turned so they do not line up.
  for (let i = 0; i < 4; i++) {
    const y = -16 - i * 12;
    const spread = 1 + -y / 12;
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(width * spread * 0.9, width * spread * 0.9),
      new THREE.MeshBasicMaterial({ map: nebulaSheet(seed * 31 + i), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }),
    );
    sheet.rotation.x = -Math.PI / 2;
    sheet.rotation.z = i * 1.3;
    sheet.position.set((rand() - 0.5) * width * 0.6, y, -y * 0.6 + (rand() - 0.5) * depth * 0.5);
    sheet.renderOrder = -1;
    group.add(sheet);
  }
  group.add(
    layer(count * 8, 1.4, 0.9, round, 0.5),
    layer(count * 3, 2.2, 1, round, 0.35),
    layer(count, 3.2, 1.1, round, 0.2),
    layer(Math.round(count / 6), 5, 1.2, round),
    layer(Math.round(count / 8), 14, 1.1, star4, 0.25),
    layer(Math.round(count / 40), 26, 1.2, star4),
  );
  return group;
}
