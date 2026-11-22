// The players' pieces as painted wooden tokens (our own shapes): a ship and a
// flagship cut from a plank (profile extruded, edges sanded round), an agent
// turned on a lathe, a city and a starport cut like the ship. A fresh ship
// stands on its keel; a damaged one lies on its side. Each seat's pieces are
// painted in its colour with the grain showing through.

import * as THREE from 'three';

/** Kinds of piece this module builds. */
export type PieceKind = 'ship' | 'flagship' | 'agent' | 'city' | 'starport';

/** Seat paint colours (same hues as the table's --seat-N tokens). */
export const SEAT_PAINT = ['#f2a93b', '#2ec4b6', '#a68bff', '#ff6f91'] as const;

// ---- wood ----

/** Pseudo-random numbers from a seed, so the grain is the same on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let grainCache: { map: THREE.Texture; bump: THREE.Texture } | null = null;

/**
 * A wood grain texture drawn in a canvas: light base, wavy darker rings and
 * fine pores. Used as the colour map (tinted by the paint) and as the bump map.
 */
export function woodGrain(): { map: THREE.Texture; bump: THREE.Texture } {
  if (grainCache) return grainCache;
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const rand = rng(7);
  g.fillStyle = '#efe6d6';
  g.fillRect(0, 0, size, size);
  // Growth rings: long wavy bands along x.
  for (let i = 0; i < 46; i++) {
    const y0 = rand() * size;
    const amp = 4 + rand() * 10;
    const freq = 0.006 + rand() * 0.01;
    const phase = rand() * Math.PI * 2;
    g.strokeStyle = `rgba(120, 82, 48, ${0.08 + rand() * 0.16})`;
    g.lineWidth = 1 + rand() * 3.5;
    g.beginPath();
    for (let x = -10; x <= size + 10; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.25;
      if (x < 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // Pores: short dark dashes.
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(90, 60, 35, ${0.05 + rand() * 0.12})`;
    g.fillRect(rand() * size, rand() * size, 2 + rand() * 6, 1);
  }
  const map = new THREE.CanvasTexture(cv);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.repeat.set(3, 3);
  map.anisotropy = 4;
  const bump = map.clone();
  bump.colorSpace = THREE.NoColorSpace;
  bump.needsUpdate = true;
  grainCache = { map, bump };
  return grainCache;
}

const paintCache = new Map<string, THREE.MeshStandardMaterial>();

/** Painted wood in `color` (cached per colour). */
export function paintedWood(color: string): THREE.MeshStandardMaterial {
  const hit = paintCache.get(color);
  if (hit) return hit;
  const { map, bump } = woodGrain();
  const m = new THREE.MeshStandardMaterial({ color, map, bumpMap: bump, bumpScale: 0.6, roughness: 0.62, metalness: 0 });
  paintCache.set(color, m);
  return m;
}

// ---- shapes (x along the piece, y up; units: world units, a ship is ~0.36 long) ----

function shipProfile(): THREE.Shape {
  // A long low hull, a raked bow to the right, a swept fin at the stern.
  const s = new THREE.Shape();
  s.moveTo(-0.17, 0);
  s.lineTo(0.12, 0);
  s.quadraticCurveTo(0.2, 0.01, 0.19, 0.05);
  s.lineTo(0.05, 0.1);
  s.lineTo(-0.06, 0.1);
  s.lineTo(-0.12, 0.2);
  s.lineTo(-0.18, 0.2);
  s.lineTo(-0.15, 0.08);
  s.closePath();
  // A round porthole through the hull.
  const hole = new THREE.Path();
  hole.absarc(0.06, 0.045, 0.018, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

function flagshipProfile(): THREE.Shape {
  // Twice as long, two decks and a bridge tower: unmistakable next to a ship.
  const s = new THREE.Shape();
  s.moveTo(-0.3, 0);
  s.lineTo(0.22, 0);
  s.quadraticCurveTo(0.34, 0.01, 0.32, 0.07);
  s.lineTo(0.16, 0.12);
  s.lineTo(0.06, 0.12);
  s.lineTo(0.02, 0.2);
  s.lineTo(-0.1, 0.2);
  s.lineTo(-0.12, 0.14);
  s.lineTo(-0.2, 0.14);
  s.lineTo(-0.26, 0.26);
  s.lineTo(-0.32, 0.26);
  s.lineTo(-0.28, 0.1);
  s.closePath();
  for (const x of [0.12, 0.04, -0.04]) {
    const hole = new THREE.Path();
    hole.absarc(x, 0.06, 0.016, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  return s;
}

function cityProfile(): THREE.Shape {
  // Three towers of different heights on one base.
  const s = new THREE.Shape();
  s.moveTo(-0.15, 0);
  s.lineTo(0.15, 0);
  s.lineTo(0.15, 0.13);
  s.lineTo(0.06, 0.13);
  s.lineTo(0.06, 0.25);
  s.lineTo(0.03, 0.28);
  s.lineTo(-0.03, 0.28);
  s.lineTo(-0.06, 0.25);
  s.lineTo(-0.06, 0.17);
  s.lineTo(-0.15, 0.17);
  s.closePath();
  return s;
}

function starportProfile(): THREE.Shape {
  // A ring on a foot: the dock ships pass through.
  const s = new THREE.Shape();
  s.moveTo(-0.13, 0);
  s.lineTo(0.13, 0);
  s.lineTo(0.08, 0.06);
  s.absarc(0, 0.16, 0.12, -Math.PI / 2 + 0.75, -Math.PI / 2 - 0.75 + Math.PI * 2, false);
  s.lineTo(-0.13, 0);
  const hole = new THREE.Path();
  hole.absarc(0, 0.16, 0.065, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

/** Extrudes a profile `depth` thick with a sanded edge, centred on z, base on y = 0. */
function plank(shape: THREE.Shape, depth: number, bevel = 0.012): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 18 });
  g.translate(0, bevel, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** The agent: a figure turned on a lathe (base, robe, collar, round head, wide-brimmed hat). */
function agentGeometry(): THREE.BufferGeometry {
  const pts: [number, number][] = [
    [0, 0], [0.068, 0], [0.072, 0.012], [0.064, 0.026], [0.046, 0.04], [0.04, 0.1], [0.05, 0.17],
    [0.055, 0.19], [0.03, 0.205], [0.024, 0.215], [0.04, 0.232], [0.044, 0.25], [0.04, 0.266],
    [0.075, 0.27], [0.078, 0.28], [0.036, 0.286], [0.033, 0.318], [0.022, 0.33], [0, 0.332],
  ];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 32);
  g.computeVertexNormals();
  return g;
}

const geoCache = new Map<PieceKind, THREE.BufferGeometry>();

/** Shared geometry of a piece kind. */
export function pieceGeometry(kind: PieceKind): THREE.BufferGeometry {
  const hit = geoCache.get(kind);
  if (hit) return hit;
  const g =
    kind === 'ship' ? plank(shipProfile(), 0.09)
    : kind === 'flagship' ? plank(flagshipProfile(), 0.14, 0.016)
    : kind === 'city' ? plank(cityProfile(), 0.16)
    : kind === 'starport' ? plank(starportProfile(), 0.07)
    : agentGeometry();
  geoCache.set(kind, g);
  return g;
}

/**
 * A piece mesh in a seat's paint. `lying` turns a ship or flagship onto its
 * side (damaged); `damaged` buildings are drawn darker and tilted.
 */
export function makePiece(kind: PieceKind, seat: number, opts: { lying?: boolean; damaged?: boolean } = {}): THREE.Object3D {
  const paint = SEAT_PAINT[seat % SEAT_PAINT.length];
  const mat = opts.damaged ? paintedWood(`#${new THREE.Color(paint).multiplyScalar(0.55).getHexString()}`) : paintedWood(paint);
  const mesh = new THREE.Mesh(pieceGeometry(kind), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const holder = new THREE.Group();
  holder.add(mesh);
  if (opts.lying && (kind === 'ship' || kind === 'flagship')) {
    // On its side: rotate about the length, lift by half the thickness so it rests on the table.
    const depth = kind === 'ship' ? 0.09 : 0.14;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = depth / 2 + 0.012;
  }
  // A damaged building keeps its place; the darker paint marks it.
  holder.userData.kind = kind;
  return holder;
}
