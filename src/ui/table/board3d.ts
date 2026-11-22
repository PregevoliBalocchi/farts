// The map as a 3D table (three.js, WebGL) filling the whole window behind the
// interface: the board picture on a slab, the players' pieces on it, rings on
// the systems the current step accepts. Display only: a click on a system is
// reported through onPick and table.ts turns it into a command.
//
// Mouse: left drag pans, wheel zooms, right drag orbits, double-click resets.
//
// The board picture is assets/ui/map/board.* when present (git-ignored, see
// docs/ui-assets.md), placed with assets/ui/map/board.json or, without it,
// board.default.json; else our schematic board from mapview.boardImageSvg().

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ContentIndex } from '../../game/engine';
import { layout } from '../map';
import { assetUrl } from './assets';
import defaultCalibration from './board.default.json';
import { BOARD_DEPTH, boardWidth, buildingSpots, isCalibration, MAX_SHOWN, slotSpots, stackCentres, stackSpots, systemSpots, TILT_FAR, tiltForZoom } from './board3d-layout';
import type { BoardCalibration, Spot } from './board3d-layout';
import { loadKitPieces, piece } from './kitpieces';
import { boardImageSvg } from './mapview';
import type { TableView } from './view';

const calibFiles = import.meta.glob('../../../assets/ui/map/board.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/**
 * Where the systems are on the owner's board picture: assets/ui/map/board.json
 * when present and well-formed, else the calibration shipped with the code.
 */
export function boardCalibration(): BoardCalibration | null {
  const raw = Object.values(calibFiles)[0];
  if (isCalibration(raw)) return raw;
  return isCalibration(defaultCalibration) ? defaultCalibration : null;
}

/** A rectangle of the canvas, in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Options of the 3D map. */
export interface Board3DOptions {
  /** False with ?motion=off: no pulsing rings. */
  motion: boolean;
  /** A system was clicked. */
  onPick(id: string): void;
  /** Calibration mode (?debug=calibrate): a click on the board reports where, as fractions (0..1) of the picture. */
  onCalibrate?(fx: number, fy: number): void;
}

/** Width / height of our schematic board picture. */
const SCHEMATIC_ASPECT = 1.6;
/** Camera tilt of the default view, from the table plane. */
const TILT = TILT_FAR;
/** Our own piece shapes are drawn a little larger than modelled; the kit's are already to scale. */
const OWN_SCALE = 1.15;
/** Scale of the kit's ships on the map (their pictures are larger than the board's scale). */
const KIT_SHIP_SCALE = 1.15;
const VALID = new THREE.Color('#5fd4e6');
const CHOSEN = new THREE.Color('#ffcc66');
const SURROUND = '#0b0a0c';

/** The 3D map. Create with createBoard3D (null when WebGL is not available). */
export class Board3D {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 300);
  private readonly controls: OrbitControls;
  private readonly ray = new THREE.Raycaster();
  private readonly board: THREE.Mesh;
  private readonly pieces = new THREE.Group();
  private readonly rings = new THREE.Group();
  private readonly discs = new THREE.Group();
  private readonly shades = new THREE.Group();
  private spots: Record<string, Spot> = {};
  private readonly calib: BoardCalibration | null;
  private boardKey = '';
  private piecesKey = '';
  private last: TableView | null = null;
  private dirty = true;
  private pulsing = false;
  private framed = false;
  /** Distance at which the board just covers the window: from here outwards the camera looks straight down. */
  private coverDist = 1;
  private size2 = { w: 1, h: 1 };
  private focus: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private down: { x: number; y: number } | null = null;
  private readonly topMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0 });

  constructor(private readonly ix: ContentIndex, private readonly opts: Board3DOptions, renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.canvas.className = 'map3d';
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(SURROUND);

    this.calib = assetUrl('map.board') ? boardCalibration() : null;

    // Lights: an even sky so the board picture keeps its colours, a lamp for the pieces' shadows.
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#3a3530', 1.9));
    const lamp = new THREE.DirectionalLight('#fff4e4', 1.5);
    lamp.position.set(-5, 14, 7);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    Object.assign(lamp.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8, near: 1, far: 40 });
    lamp.shadow.camera.updateProjectionMatrix();
    lamp.shadow.bias = -0.0004;
    this.scene.add(lamp);

    // The surface around the board: the same dark as the picture's edge, so the map seems to go on.
    const table = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: SURROUND, roughness: 1 }));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.02;
    table.receiveShadow = true;
    this.scene.add(table);

    // The board: a thin slab, the picture on its top face.
    const side = new THREE.MeshStandardMaterial({ color: SURROUND, roughness: 1 });
    this.board = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 1), [side, side, this.topMaterial, side, side, side]);
    this.board.position.y = -0.01;
    this.board.receiveShadow = true;
    this.scene.add(this.board, this.shades, this.pieces, this.rings, this.discs);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = false;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    // No free orbit: the tilt follows the zoom (see the 'change' handler).
    this.controls.enableRotate = false;
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.addEventListener('change', () => {
      // Keep the point looked at on the board.
      const { w, d } = this.size();
      const t = this.controls.target;
      t.set(Math.max(-w / 2, Math.min(w / 2, t.x)), 0, Math.max(-d / 2, Math.min(d / 2, t.z)));
      // The tilt follows the zoom: close up the camera leans towards the pieces, far away it looks straight down.
      const dist = Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, this.camera.position.distanceTo(t)));
      const tilt = tiltForZoom(dist, this.controls.minDistance, this.coverDist);
      this.camera.position.set(t.x, dist * Math.sin(tilt), t.z + dist * Math.cos(tilt));
      this.camera.lookAt(t);
      this.dirty = true;
    });

    this.canvas.addEventListener('pointerdown', (e) => (this.down = { x: e.clientX, y: e.clientY }));
    this.canvas.addEventListener('pointerup', (e) => this.click(e));
    this.canvas.addEventListener('pointermove', (e) => this.hover(e));
    this.canvas.addEventListener('dblclick', () => this.resetView());

    renderer.setAnimationLoop((t) => this.frame(t));
    void loadKitPieces().then((any) => {
      // The kit's shapes replace our own once their pictures are cut.
      if (!any) return;
      this.piecesKey = '';
      if (this.last) this.buildPieces(this.last);
      this.dirty = true;
    });
  }

  /** Pixel size of the board picture: the owner's image once loaded, else a nominal size with the board's aspect. */
  pictureSize(): { width: number; height: number } {
    const img = this.topMaterial.map?.image as { width?: number; height?: number } | undefined;
    if (assetUrl('map.board') && img?.width && img.height) return { width: img.width, height: img.height };
    if (this.calib) return { width: this.calib.width, height: this.calib.height };
    return { width: Math.round(1000 * SCHEMATIC_ASPECT), height: 1000 };
  }

  /** Board size in world units. */
  private size(): { w: number; d: number } {
    return { w: this.board.scale.x, d: BOARD_DEPTH };
  }

  /**
   * The default view: seen from almost straight above, as close as it takes
   * for the board picture to cover the whole window (the interface is drawn in
   * front of it; the player pans and zooms to what the panels hide).
   */
  resetView(): void {
    const { w, d } = this.size();
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360);
    const tanH = tanV * this.camera.aspect;
    // The far edge looks narrower and the near one sits lower: allow for both.
    const lean = (d / 2) * Math.cos(TILT);
    const dist = Math.max(1, Math.min(w / 2 / tanH - lean, (d * Math.sin(TILT)) / 2 / tanV - lean) * 0.98);
    this.camera.clearViewOffset();
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, dist * Math.sin(TILT), dist * Math.cos(TILT));
    this.coverDist = dist;
    this.controls.minDistance = dist * 0.22;
    this.controls.maxDistance = dist * 1.7;
    this.controls.update();
    this.framed = true;
    this.dirty = true;
  }

  /**
   * Canvas size in CSS pixels, the pixel ratio to render at, and the focus
   * rectangle: where the map should be centred (the area free of panels).
   */
  resize(w: number, h: number, pixelRatio: number, focus: Rect): void {
    this.renderer.setPixelRatio(Math.min(2, pixelRatio));
    this.renderer.setSize(w, h, false);
    this.size2 = { w, h };
    this.focus = focus;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.boardKey) this.resetView();
    this.dirty = true;
  }

  /** Shows the view: board (redrawn when systems leave play), pieces, and the step's highlights. */
  update(v: TableView, valid: ReadonlySet<string>, chosen: ReadonlySet<string>): void {
    this.last = v;
    const key = v.systems.map((s) => (s.inPlay ? '1' : '0')).join('');
    if (key !== this.boardKey) {
      const first = !this.framed;
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
    this.board.scale.set(c ? boardWidth(c.width, c.height) : BOARD_DEPTH * SCHEMATIC_ASPECT, 1, BOARD_DEPTH);
    const own = assetUrl('map.board');
    if (own) {
      if (this.topMaterial.map) return;
      new THREE.TextureLoader().load(own, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this.topMaterial.map = tex;
        this.topMaterial.needsUpdate = true;
        this.dirty = true;
      });
      return;
    }
    const svg = boardImageSvg(this.ix, inPlay, links, SCHEMATIC_ASPECT);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = 4096;
      cv.height = Math.round(4096 / SCHEMATIC_ASPECT);
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

  /** Invisible discs over each in-play system (what a click hits), and a shade over those out of play. */
  private buildDiscs(v: TableView): void {
    this.discs.clear();
    this.shades.clear();
    const hit = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    // On the owner's picture every system is drawn: darken the ones this game does not use.
    const shade = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.62, depthWrite: false });
    for (const s of v.systems) {
      const p = this.spots[s.id];
      if (!p) continue;
      const r = s.kind === 'gate' ? 0.5 : 0.85;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 32), s.inPlay ? hit : shade);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(p.x, s.inPlay ? 0.02 : 0.004, p.z);
      if (s.inPlay) {
        disc.userData.sys = s.id;
        this.discs.add(disc);
      } else if (this.calib) this.shades.add(disc);
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
      const slots = slotSpots(this.calib, s.id);
      const centres = stackCentres(s.ships.length, slots ? 0.7 : 0.75);
      s.ships.forEach((st, i) => {
        const c = centres[i];
        for (const sp of stackSpots(st.fresh, st.damaged, 0.36)) {
          const o = piece('ship', st.player, { lying: sp.lying });
          o.position.set(p.x + c.x + sp.dx, 0, p.z + c.z + sp.dz);
          // Turned three-quarters to the viewer, so the profile of a standing ship shows.
          o.rotation.y = -0.55;
          o.scale.setScalar(o.userData.kit ? KIT_SHIP_SCALE : OWN_SCALE);
          this.pieces.add(o);
        }
        if (st.fresh + st.damaged > MAX_SHOWN) this.pieces.add(countTag(st.fresh + st.damaged, p.x + c.x, p.z + c.z));
      });
      const arc = buildingSpots(s.buildings.length);
      s.buildings.forEach((bd, i) => {
        const o = piece(bd.type, bd.owner, { damaged: bd.damaged });
        // On the owner's picture a building sits on its slot; elsewhere on an arc under the system.
        const at = slots?.[i];
        if (at) o.position.set(at.x, 0, at.z);
        else o.position.set(p.x + arc[i].x, 0, p.z + arc[i].z);
        if (!o.userData.kit) {
          o.rotation.y = -0.4;
          o.scale.setScalar(OWN_SCALE);
        }
        this.pieces.add(o);
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
      const r = s.kind === 'gate' ? 0.5 : 0.85;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.09, 64),
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
  sprite.position.set(x, 0.6, z);
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
