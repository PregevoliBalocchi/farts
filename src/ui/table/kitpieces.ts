// The players' pieces cut out of the development kit's pictures
// (assets/ui/piece/*.png, installed by tools/fetch-kit.mjs): the
// outline of each picture becomes a wooden piece of the same shape, with the
// picture on its faces. Ships, agents and flagships stand up (a damaged ship
// lies on its side); cities and starports are tiles lying on their slot, the
// damaged side up when damaged. Without the pictures, pieces3d's own shapes
// are used.

import * as THREE from 'three';
import { assetUrl, seatColor } from './assets';
import { largestBlob, simplifyOutline, traceOutline } from './outline';
import { modelPiece } from './models3d';
import { makePiece, paintedWood, SEAT_PAINT, woodGrain } from './pieces3d';
import type { PieceKind } from './pieces3d';

/** World units per picture pixel: a 151 px ship is about 0.63 units long, a tile about as wide as a slot on the board. */
const K = 0.0042;
/** Thickness of each kind of piece, in world units. */
const DEPTH: Record<PieceKind, number> = { ship: 0.1, agent: 0.1, flagship: 0.12, city: 0.05, starport: 0.05 };
const TILES: ReadonlySet<PieceKind> = new Set(['city', 'starport']);
const BEVEL = 0.007;

interface Cut {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
  /** Height of the standing piece (world units), to centre it when it lies down. */
  height: number;
}

const cuts = new Map<string, Cut>();
let loading: Promise<boolean> | null = null;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error(`Cannot load ${url}`));
    img.src = url;
  });
}

/** Cuts one picture into a piece. A tile is the whole picture; other pieces only its coloured face (not the drawn shadow). */
function cut(img: HTMLImageElement, kind: PieceKind, paint: string): Cut | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, w, h).data;
  const tile = TILES.has(kind);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3];
    mask[i] = a > 128 && (tile || Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) > 70) ? 1 : 0;
  }
  const outline = simplifyOutline(traceOutline(largestBlob(mask, w, h), w, h), 0.75);
  if (outline.length < 3) return null;
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  // Standing pieces sit on y = 0; tiles are centred, to be laid flat.
  const y0 = tile ? (top + bottom) / 2 : bottom;
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2((x - cx) * K, (y0 - y) * K)));
  const depth = DEPTH[kind];
  const uv = (x: number, y: number) => new THREE.Vector2((x / K + cx) / w, 1 - (y0 - y / K) / h);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelOffset: -BEVEL,
    bevelSegments: 2,
    UVGenerator: {
      generateTopUV: (_g, v, a, b, c) => [a, b, c].map((i) => uv(v[i * 3], v[i * 3 + 1])),
      generateSideWallUV: (_g, v, a, b, c, d) => [a, b, c, d].map((i) => new THREE.Vector2(v[i * 3] * 2 + v[i * 3 + 2] * 3, v[i * 3 + 1] * 2)),
    },
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const face = new THREE.MeshStandardMaterial({ map: tex, bumpMap: woodGrain().bump, bumpScale: 0.35, roughness: 0.6, metalness: 0 });
  const side = paintedWood(tile ? '#2a2622' : paint);
  return { geometry, materials: [face, side], height: (bottom - top) * K };
}

/**
 * Loads and cuts every kit piece picture present. Resolves true when at least
 * one piece comes from the kit. Safe to call more than once.
 */
export function loadKitPieces(): Promise<boolean> {
  loading ??= (async () => {
    const jobs: Promise<void>[] = [];
    const add = (key: string, kind: PieceKind, paint: string) => {
      const url = assetUrl(`piece.${key}`);
      if (!url) return;
      jobs.push(
        loadImage(url)
          .then((img) => {
            const c = cut(img, kind, paint);
            if (c) cuts.set(key, c);
          })
          .catch(() => undefined),
      );
    };
    SEAT_PAINT.forEach((paint, seat) => {
      for (const kind of ['ship', 'agent', 'flagship', 'city', 'starport'] as const) add(`${kind}-${seat}`, kind, paint);
      for (const kind of ['city', 'starport'] as const) add(`${kind}-back-${seat}`, kind, paint);
    });
    await Promise.all(jobs);
    return cuts.size > 0;
  })();
  return loading;
}

/**
 * A piece for a seat: the owner's 3D model when loaded (models3d), else the
 * kit's shape when its picture is installed and loaded, else pieces3d's own. `lying`: a damaged ship or flagship on its
 * side; `damaged`: a building tile with its damaged side up.
 */
export function piece(kind: PieceKind, seat: number, opts: { lying?: boolean; damaged?: boolean } = {}): THREE.Object3D {
  seat = seatColor(seat);
  const model = modelPiece(kind, seat, opts);
  if (model) return model;
  const s = seat % SEAT_PAINT.length;
  const tile = TILES.has(kind);
  const c = (tile && opts.damaged ? cuts.get(`${kind}-back-${s}`) : undefined) ?? cuts.get(`${kind}-${s}`);
  if (!c) return makePiece(kind, seat, opts);
  const mesh = new THREE.Mesh(c.geometry, c.materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const holder = new THREE.Group();
  holder.add(mesh);
  const depth = DEPTH[kind];
  if (tile) {
    // Flat on the board, the picture's top away from the viewer.
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = depth / 2 + BEVEL;
  } else if (opts.lying) {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = depth / 2 + BEVEL;
    mesh.position.z = c.height / 2;
  }
  holder.userData.kind = kind;
  holder.userData.kit = true;
  return holder;
}
