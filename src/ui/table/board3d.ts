// The map as a 3D table (three.js, WebGL): the board picture on a slab, the
// players' wooden pieces on it, rings on the systems the current step
// accepts. Display only: a click on a system is reported through onPick and
// table.ts turns it into a command, exactly like a click on the 2D map.
//
// The board picture is the owner's assets/ui/map/board.* with its calibration
// assets/ui/map/board.json when present (git-ignored, local only), else our
// schematic board drawn by mapview.boardImageSvg().

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ContentIndex } from '../../game/engine';
import { layout } from '../map';
import { assetUrl } from './assets';
import { BOARD_DEPTH, boardWidth, buildingSpots, isCalibration, MAX_SHOWN, stackCentres, stackSpots, systemSpots } from './board3d-layout';
import type { BoardCalibration, Spot } from './board3d-layout';
import { boardImageSvg } from './mapview';
import { makePiece, paintedWood } from './pieces3d';
import type { TableView } from './view';

const calibFiles = import.meta.glob('../../../assets/ui/map/board.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** The owner's board calibration, when assets/ui/map/board.json exists and has the right shape. */
export function boardCalibration(): BoardCalibration | null {
  const raw = Object.values(calibFiles)[0];
  return isCalibration(raw) ? raw : null;
}

/** Options of the 3D map. */
export interface Board3DOptions {
  /** Width / height of the area the map is drawn in. */
  aspect: number;
  /** False with ?motion=off: no pulsing rings. */
  motion: boolean;
  /** A system was clicked. */
  onPick(id: string): void;
  /** Calibration mode (?debug=calibrate): a click on the board reports where, as fractions (0..1) of the picture. */
  onCalibrate?(fx: number, fy: number): void;
}

/** Pieces are drawn a little smaller than their models, so full systems stay readable. */
const PIECE_SCALE = 1.15;
const VALID = new THREE.Color('#5fd4e6');
const CHOSEN = new THREE.Color('#ffcc66');

/** The 3D map. Create with createBoard3D (null when WebGL is not available). */
export class Board3D {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly ray = new THREE.Raycaster();
  private readonly board: THREE.Mesh;
  private readonly pieces = new THREE.Group();
  private readonly rings = new THREE.Group();
  private readonly discs = new THREE.Group();
  private spots: Record<string, Spot> = {};
  private readonly calib: BoardCalibration | null;
  private boardKey = '';
  private piecesKey = '';
  private dirty = true;
  private pulsing = false;
  private down: { x: number; y: number } | null = null;
  private readonly topMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0 });

  constructor(private readonly ix: ContentIndex, private readonly opts: Board3DOptions, renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.canvas.className = 'map3d';
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color('#070a14');

    this.calib = assetUrl('map.board') ? boardCalibration() : null;
    this.camera = new THREE.PerspectiveCamera(30, opts.aspect, 0.1, 200);

    // Lights: a cool sky, a warm lamp casting soft shadows.
    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#302418', 1.1));
    const lamp = new THREE.DirectionalLight('#fff1dc', 2.2);
    lamp.position.set(-6, 13, 6);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    Object.assign(lamp.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8, near: 1, far: 40 });
    lamp.shadow.camera.updateProjectionMatrix();
    lamp.shadow.bias = -0.0004;
    this.scene.add(lamp);

    // The table under the board: dark wood.
    const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), paintedWood('#3b2b1f'));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.07;
    table.receiveShadow = true;
    this.scene.add(table);

    // The board: a thin slab, the picture on its top face.
    const side = new THREE.MeshStandardMaterial({ color: '#151a2c', roughness: 0.7 });
    this.board = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1), [side, side, this.topMaterial, side, side, side]);
    this.board.position.y = -0.03;
    this.board.receiveShadow = true;
    this.scene.add(this.board, this.pieces, this.rings, this.discs);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = false;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = 1.2;
    this.controls.minAzimuthAngle = -Math.PI / 4;
    this.controls.maxAzimuthAngle = Math.PI / 4;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener('change', () => (this.dirty = true));

    this.canvas.addEventListener('pointerdown', (e) => (this.down = { x: e.clientX, y: e.clientY }));
    this.canvas.addEventListener('pointerup', (e) => this.click(e));
    this.canvas.addEventListener('pointermove', (e) => this.hover(e));
    this.canvas.addEventListener('dblclick', () => this.resetView());

    renderer.setAnimationLoop((t) => this.frame(t));
  }

  /** Pixel size of the board picture: the owner's image once loaded, else a nominal size with the board's aspect. */
  pictureSize(): { width: number; height: number } {
    const img = this.topMaterial.map?.image as { width?: number; height?: number } | undefined;
    if (assetUrl('map.board') && img?.width && img.height) return { width: img.width, height: img.height };
    if (this.calib) return { width: this.calib.width, height: this.calib.height };
    return { width: Math.round(1000 * this.opts.aspect), height: 1000 };
  }

  /** Board size in world units. */
  private size(): { w: number; d: number } {
    const c = this.calib;
    return { w: c ? boardWidth(c.width, c.height) : this.board.scale.x > 1 ? this.board.scale.x : BOARD_DEPTH * this.opts.aspect, d: BOARD_DEPTH };
  }

  /** Puts the camera back above the board, tilted, the whole board in view. */
  resetView(): void {
    // Frame the systems (plus room for their pieces), not the whole picture.
    const pts = Object.values(this.spots);
    const board = this.size();
    const w = pts.length ? Math.min(board.w, 2 * Math.max(...pts.map((p) => Math.abs(p.x))) + 2.2) : board.w;
    const d = pts.length ? Math.min(board.d, 2 * Math.max(...pts.map((p) => Math.abs(p.z))) + 2.2) : board.d;
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const tilt = (56 * Math.PI) / 180;
    const dist = Math.max(w / 2 / Math.tan(hfov / 2), (d * Math.sin(tilt)) / 2 / Math.tan(vfov / 2));
    this.controls.target.set(0, 0, 0.15);
    this.camera.position.set(0, dist * Math.sin(tilt), 0.15 + dist * Math.cos(tilt));
    this.controls.minDistance = dist * 0.35;
    this.controls.maxDistance = dist * 1.4;
    this.controls.update();
    this.dirty = true;
  }

  /** Drawing size in CSS pixels of the area and the pixel ratio to render at. */
  resize(w: number, h: number, pixelRatio: number): void {
    this.renderer.setPixelRatio(Math.min(2, pixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  /** Shows the view: board (redrawn when systems leave play), pieces, and the step's highlights. */
  update(v: TableView, valid: ReadonlySet<string>, chosen: ReadonlySet<string>): void {
    const key = v.systems.map((s) => (s.inPlay ? '1' : '0')).join('');
    if (key !== this.boardKey) {
      const first = this.boardKey === '';
      this.boardKey = key;
      this.loadBoard(new Map(v.systems.map((s) => [s.id, s.inPlay])), v.links);
      this.spots = systemSpots(layout(this.ix), this.calib);
      this.buildDiscs(v);
      if (first) this.resetView();
    }
    const pk = JSON.stringify(v.systems.map((s) => [s.ships, s.buildings]));
    if (pk !== this.piecesKey) {
      this.piecesKey = pk;
      this.buildPieces(v);
    }
    this.buildRings(v, valid, chosen);
    this.dirty = true;
  }

  private loadBoard(inPlay: ReadonlyMap<string, boolean>, links: [string, string][]): void {
    const c = this.calib;
    this.board.scale.set(c ? boardWidth(c.width, c.height) : BOARD_DEPTH * this.opts.aspect, 1, BOARD_DEPTH);
    const own = assetUrl('map.board');
    if (own) {
      if (this.topMaterial.map) return;
      new THREE.TextureLoader().load(own, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        // Without a calibration the picture's own aspect sets the board width.
        if (!this.calib) {
          const img = tex.image as { width: number; height: number };
          this.board.scale.x = boardWidth(img.width, img.height);
          this.resetView();
        }
        this.topMaterial.map = tex;
        this.topMaterial.needsUpdate = true;
        this.dirty = true;
      });
      return;
    }
    const svg = boardImageSvg(this.ix, inPlay, links, this.opts.aspect);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = 4096;
      cv.height = Math.round(4096 / this.opts.aspect);
      cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.topMaterial.map?.dispose();
      this.topMaterial.map = tex;
      this.topMaterial.needsUpdate = true;
      this.dirty = true;
    };
    img.src = url;
  }

  /** Invisible discs over each in-play system: what a click hits. */
  private buildDiscs(v: TableView): void {
    this.discs.clear();
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    for (const s of v.systems) {
      const p = this.spots[s.id];
      if (!p || !s.inPlay) continue;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(s.kind === 'gate' ? 0.42 : 0.62, 24), mat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(p.x, 0.02, p.z);
      disc.userData.sys = s.id;
      this.discs.add(disc);
    }
  }

  private buildPieces(v: TableView): void {
    this.pieces.traverse((x) => {
      if ((x as THREE.Sprite).isSprite) (x as THREE.Sprite).material.map?.dispose();
    });
    this.pieces.clear();
    for (const s of v.systems) {
      const p = this.spots[s.id];
      if (!p) continue;
      const centres = stackCentres(s.ships.length);
      s.ships.forEach((st, i) => {
        const c = centres[i];
        for (const sp of stackSpots(st.fresh, st.damaged)) {
          const piece = makePiece('ship', st.player, { lying: sp.lying });
          // Standing ships face the viewer edge-on along x, so their profile shows.
          piece.position.set(p.x + c.x + sp.dx, 0, p.z + c.z + sp.dz);
          // Turned three-quarters to the viewer, so the profile of a standing ship shows.
          piece.rotation.y = -0.65;
          piece.scale.setScalar(PIECE_SCALE);
          this.pieces.add(piece);
        }
        if (st.fresh + st.damaged > MAX_SHOWN) this.pieces.add(countTag(st.fresh + st.damaged, p.x + c.x, p.z + c.z));
      });
      buildingSpots(s.buildings.length).forEach((b, i) => {
        const bd = s.buildings[i];
        const piece = makePiece(bd.type, bd.owner, { damaged: bd.damaged });
        piece.position.set(p.x + b.x, 0, p.z + b.z);
        piece.rotation.y = -0.4;
        piece.scale.setScalar(PIECE_SCALE);
        this.pieces.add(piece);
      });
    }
  }

  private buildRings(v: TableView, valid: ReadonlySet<string>, chosen: ReadonlySet<string>): void {
    for (const r of this.rings.children) {
      const m = r as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.rings.clear();
    this.pulsing = false;
    for (const s of v.systems) {
      const on = chosen.has(s.id) ? CHOSEN : valid.has(s.id) ? VALID : null;
      const p = this.spots[s.id];
      if (!on || !p) continue;
      const r = s.kind === 'gate' ? 0.42 : 0.6;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.08, 48),
        new THREE.MeshBasicMaterial({ color: on, transparent: true, opacity: 0.9, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, 0.012, p.z);
      ring.userData.pulse = on === VALID;
      if (ring.userData.pulse) this.pulsing = true;
      this.rings.add(ring);
    }
  }

  private frame(t: number): void {
    if (this.pulsing && this.opts.motion) {
      const a = 0.55 + 0.4 * Math.sin(t / 260);
      for (const r of this.rings.children) if (r.userData.pulse) ((r as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = a;
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  }

  private pointer(e: PointerEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private hit(e: PointerEvent): string | null {
    this.ray.setFromCamera(this.pointer(e), this.camera);
    return (this.ray.intersectObjects(this.discs.children, false)[0]?.object.userData.sys as string | undefined) ?? null;
  }

  private click(e: PointerEvent): void {
    const d = this.down;
    this.down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || e.button !== 0) return;
    if (this.opts.onCalibrate) {
      this.ray.setFromCamera(this.pointer(e), this.camera);
      const at = this.ray.intersectObject(this.board, false)[0]?.point;
      if (!at) return;
      const { w, d: depth } = this.size();
      this.opts.onCalibrate(at.x / w + 0.5, at.z / depth + 0.5);
      return;
    }
    const id = this.hit(e);
    if (id) this.opts.onPick(id);
  }

  private hover(e: PointerEvent): void {
    if (e.buttons) return;
    const id = this.hit(e);
    this.canvas.style.cursor = id ? 'pointer' : 'grab';
    this.canvas.title = id ?? '';
  }
}

/** A small "×n" label floating over a stack with more pieces than drawn. */
function countTag(n: number, x: number, z: number): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(10,14,28,.85)';
  g.beginPath();
  g.roundRect(4, 4, 120, 56, 18);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 40px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`×${n}`, 64, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(0.5, 0.25, 1);
  sprite.position.set(x, 0.5, z);
  return sprite;
}

/** The 3D map, or null when this browser cannot draw WebGL (the table then keeps the 2D map). */
export function createBoard3D(ix: ContentIndex, opts: Board3DOptions): Board3D | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  return new Board3D(ix, opts, renderer);
}
