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
import { assetUrl, seatColor } from './assets';
import defaultCalibration from './board.default.json';
import { BOARD_DEPTH, boardWidth, buildingSpots, headingJitter, isCalibration, MAX_SHOWN, pictureToWorld, shipGroups, shipSpot, slotSpots, stackCentres, stackSpots, systemSpots, TILT_FAR, tiltForZoom } from './board3d-layout';
import type { BoardCalibration, Spot } from './board3d-layout';
import { loadKitPieces, piece } from './kitpieces';
import { arcHeight, easeInOut, planMoves } from './model-fx';
import type { ShipGroupAt } from './model-fx';
import modelConfig from './models.json';
import { fxTime, fxViewHeight, hasModels, loadModels } from './models3d';
import { boardImageSvg } from './mapview';
import { loadCardFonts } from './cardfonts';
import boardLinesData from './board.lines.json';
import { drawInfoLayer, isBoardLines, resourceIconSpots, sectorTints, withLayerSpots } from './infolayer';
import type { BoardLines, SectorMode } from './infolayer';
import { SEAT_PAINT } from './pieces3d';
import { buildPlanet, planetPalette, turnPlanets } from './planets3d';
import type { Planet } from './planets3d';
import { starfield } from './starfield';
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
  /** ?map=picture: the board picture on a table instead of the map in space. */
  picture?: boolean;
  /** ?debug=spots: the information layer marks where pieces go. */
  showSpots?: boolean;
}

/** The board's traced lines and zones (board.lines.json), or null when the file is not usable. */
const BOARD_LINES: BoardLines | null = isBoardLines(boardLinesData) ? boardLinesData : null;
/** Pixel width of the information layer's canvas. */
const INFO_WIDTH = 4096;
/** Font of the gate numbers on the information layer. */
const NUMBER_FONT = '"Arcs Card Title", "Cinzel", Georgia, serif';

/** Width / height of our schematic board picture. */
const SCHEMATIC_ASPECT = 1.6;
/** Camera tilt of the default view, from the table plane. */
const TILT = TILT_FAR;
/** Our own piece shapes are drawn a little larger than modelled; the kit's are already to scale. */
const OWN_SCALE = 1.15;
/** Scale of the kit's ships on the map (their pictures are larger than the board's scale). */
const KIT_SHIP_SCALE = 1.15;
/** Ships in the calibrated ship zones are drawn smaller, closer to the real pieces on the board picture. */
const ZONE_SHIP_SCALE = 0.85;
/** Default heading of a ship model: three-quarters to the viewer. */
const SHIP_HEADING = -0.55;
const VALID = new THREE.Color('#5fd4e6');
const CHOSEN = new THREE.Color('#ffcc66');
const SURROUND = '#0b0a0c';

/** A seat's ship groups to light up: those in `systems`, the one in `chosen` as picked. */
export interface ShipGlow {
  player: number;
  systems: ReadonlySet<string>;
  chosen?: string;
}

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
  /** Ship groups as last drawn, to fly the ones that moved when the map changes. */
  private shipsAt: ShipGroupAt[] = [];
  private glow: ShipGlow | null = null;
  /** Ship groups flying from one system to another: start time set on the first frame. */
  private flights: { o: THREE.Object3D; from: { x: number; z: number }; to: { x: number; z: number }; heading: number; t0: number | null }[] = [];
  private framed = false;
  /** Distance at which the board just covers the window: from here outwards the camera looks straight down. */
  private coverDist = 1;
  private size2 = { w: 1, h: 1 };
  private focus: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private down: { x: number; y: number } | null = null;
  private readonly topMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0 });
  /** The map in space (default): planets under a glass carrying the information layer, stars below. */
  private readonly space: boolean;
  private readonly glassMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  private infoCanvas: HTMLCanvasElement | null = null;
  /** How the information layer colours the sectors. */
  private sectorMode: SectorMode = 'resource';
  /** What the layer's sector colours were last drawn from. */
  private sectorKey = '';
  /** The resource icons' pictures (assets/ui/icon/<resource>.*), once loaded. */
  private readonly iconImages = new Map<string, HTMLImageElement>();
  private inPlay: ReadonlyMap<string, boolean> = new Map();
  /** Gates linked across systems out of play (the setup card's open links). */
  private bridges: [string, string][] = [];
  private readonly planetGroup = new THREE.Group();
  private planets: Planet[] = [];

  constructor(private readonly ix: ContentIndex, private readonly opts: Board3DOptions, renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.canvas.className = 'map3d';
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.space = !opts.picture && !opts.onCalibrate && !!BOARD_LINES && !!boardCalibration();
    this.scene.background = new THREE.Color(this.space ? '#000000' : SURROUND);

    const calib = this.space || assetUrl('map.board') ? boardCalibration() : null;
    // In space the ships stand where the information layer leaves room for them.
    this.calib = calib && this.space && BOARD_LINES ? withLayerSpots(calib, BOARD_LINES) : calib;

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

    if (this.space) {
      // Space: stars far below, planets under the glass, the pieces' shadows on the glass.
      this.scene.add(starfield(60, 44), this.planetGroup);
      const catcher = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.32, depthWrite: false }));
      catcher.rotation.x = -Math.PI / 2;
      catcher.position.y = 0.0005;
      catcher.receiveShadow = true;
      catcher.renderOrder = 1;
      this.scene.add(catcher);
    } else {
      // The surface around the board: the same dark as the picture's edge, so the map seems to go on.
      const table = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: SURROUND, roughness: 1 }));
      table.rotation.x = -Math.PI / 2;
      table.position.y = -0.02;
      table.receiveShadow = true;
      this.scene.add(table);
    }

    // The board: a thin slab, the picture (or, in space, the information layer) on its top face.
    const side = new THREE.MeshStandardMaterial({ color: SURROUND, roughness: 1, visible: !this.space });
    this.board = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 1), [side, side, this.space ? this.glassMaterial : this.topMaterial, side, side, side]);
    this.board.position.y = -0.01;
    this.board.receiveShadow = !this.space;
    if (this.space) this.board.renderOrder = 2;
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
    void loadModels().then((any) => {
      // The owner's models replace every other piece once loaded.
      if (!any) return;
      this.piecesKey = '';
      if (this.last) this.buildPieces(this.last, false);
      this.dirty = true;
    });
    void loadKitPieces().then((any) => {
      // The kit's shapes replace our own once their pictures are cut.
      if (!any) return;
      this.piecesKey = '';
      if (this.last) this.buildPieces(this.last, false);
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
    this.camera.clearViewOffset();
    this.controls.target.set(0, 0, 0);
    // Seated at the table: the closest distance at which the whole board is in view.
    const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.Vector3((sx * w) / 2, 0, (sz * d) / 2)));
    const place = (r: number) => {
      this.camera.position.set(0, r * Math.sin(TILT), r * Math.cos(TILT));
      this.camera.lookAt(0, 0, 0);
      this.camera.updateMatrixWorld();
    };
    const fits = (r: number) => {
      place(r);
      return corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) <= 0.98 && Math.abs(p.y) <= 0.98 && p.z < 1;
      });
    };
    let lo = 0.5;
    let hi = 200;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    const dist = hi;
    place(dist);
    this.placePlanets();
    this.coverDist = dist;
    this.controls.minDistance = dist * 0.22;
    this.controls.maxDistance = dist * 1.3;
    this.controls.update();
    this.framed = true;
    this.dirty = true;
  }

  /**
   * Sets each planet on the line from the default camera through its disc on
   * the glass, at its depth: from the default view it shows right under its
   * disc and slots (it is below the glass, so it would otherwise drift towards
   * the middle of the screen and away from the viewer).
   */
  private placePlanets(): void {
    const cam = this.camera.position;
    for (const p of this.planets) {
      const { gx, gz, depth } = p.holder.userData as { gx: number; gz: number; depth: number };
      const t = (cam.y + depth) / cam.y;
      p.holder.position.set(cam.x + (gx - cam.x) * t, -depth, cam.z + (gz - cam.z) * t);
      p.holder.scale.setScalar(t);
    }
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
    fxViewHeight.value = h * this.renderer.getPixelRatio();
    if (this.boardKey) this.resetView();
    this.dirty = true;
  }

  /** Shows the view: board (redrawn when systems leave play), pieces, and the step's highlights. */
  /**
   * `ships`: a seat's ship groups to light up under the models, in the given
   * systems (`chosen` drawn as picked): the ships the local player can move.
   */
  update(v: TableView, valid: ReadonlySet<string>, chosen: ReadonlySet<string>, ships: ShipGlow | null = null): void {
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
    if (this.space) {
      const sk = this.sectorMode + JSON.stringify(v.systems.map((s) => [s.controller, s.resource]));
      if (sk !== this.sectorKey) {
        this.sectorKey = sk;
        this.drawInfo();
      }
    }
    this.glow = ships;
    this.buildRings(v, valid, chosen);
    this.dirty = true;
  }

  private loadBoard(inPlay: ReadonlyMap<string, boolean>, links: [string, string][]): void {
    const c = this.calib;
    this.board.scale.set(c ? boardWidth(c.width, c.height) : BOARD_DEPTH * SCHEMATIC_ASPECT, 1, BOARD_DEPTH);
    if (this.space && c && BOARD_LINES) {
      this.inPlay = inPlay;
      const base = this.ix.content.map.links;
      const known = (a: string, b: string) => base.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
      this.bridges = links.filter(([a, b]) => a.endsWith('gate') && b.endsWith('gate') && !known(a, b));
      if (!this.planets.length) this.buildPlanets(c);
      for (const p of this.planets) p.holder.visible = inPlay.get(p.id) !== false;
      this.drawInfo();
      return;
    }
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

  /** True when the map is the map in space, with its information layer. */
  get hasInfoLayer(): boolean {
    return this.space;
  }

  /** Colours the sectors by resource (default) or by who controls them. */
  setSectorMode(mode: SectorMode): void {
    if (mode === this.sectorMode) return;
    this.sectorMode = mode;
    this.sectorKey = '';
    if (this.space) this.drawInfo();
  }

  /** The resource icon's picture, loading it (and redrawing the layer) the first time. */
  private iconImage(resource: string): HTMLImageElement | null {
    const have = this.iconImages.get(resource);
    if (have) return have.complete && have.naturalWidth ? have : null;
    const url = assetUrl(`icon.${resource}`);
    if (!url) return null;
    const img = new Image();
    img.onload = () => this.drawInfo();
    img.src = url;
    this.iconImages.set(resource, img);
    return null;
  }

  /** Draws the information layer onto the glass (again once the numbers' font has loaded). */
  private drawInfo(): void {
    const lines = BOARD_LINES;
    if (!lines) return;
    if (!this.infoCanvas) {
      this.infoCanvas = document.createElement('canvas');
      this.infoCanvas.width = INFO_WIDTH;
      this.infoCanvas.height = Math.round((INFO_WIDTH * lines.height) / lines.width);
      const tex = new THREE.CanvasTexture(this.infoCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.glassMaterial.map = tex;
      this.glassMaterial.needsUpdate = true;
      void loadCardFonts().then(() => this.drawInfo());
    }
    const systems = this.last?.systems ?? [];
    const tints = sectorTints(systems, this.sectorMode, (r) => planetPalette(r).line, (p) => SEAT_PAINT[seatColor(p)]);
    const icons = [];
    for (const spot of this.calib ? resourceIconSpots(this.calib, lines.ring, systems) : []) {
      const image = this.iconImage(spot.resource);
      if (image) icons.push({ ...spot, image, ring: planetPalette(spot.resource).line });
    }
    drawInfoLayer(this.infoCanvas, lines, this.calib, { inPlay: this.inPlay, numberFont: NUMBER_FONT, tints, icons, bridges: this.bridges, showSpots: this.opts.showSpots });
    if (this.glassMaterial.map) this.glassMaterial.map.needsUpdate = true;
    this.dirty = true;
  }

  /**
   * One 3D planet under each planet system's disc on the board: as large as
   * the disc, sunk just below the glass (placePlanets sets it under its disc).
   */
  private buildPlanets(c: BoardCalibration): void {
    const unit = BOARD_DEPTH / c.height;
    for (const s of this.ix.content.map.systems) {
      const disc = c.systems[s.id]?.disc;
      if (s.kind !== 'planet' || !disc) continue;
      const p = buildPlanet(s.id, s.resource, disc.r * unit);
      const top = new THREE.Box3().setFromObject(p.holder).max.y;
      const depth = top + 0.06;
      const at = pictureToWorld(c, disc.x, disc.y);
      p.holder.userData = { gx: at.x, gz: at.z, depth };
      p.holder.position.set(at.x, -depth, at.z);
      this.planetGroup.add(p.holder);
      this.planets.push(p);
    }
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
      } else if (this.calib && !this.space) this.shades.add(disc);
    }
  }

  /**
   * Draws every piece of the view. With `fly`, ship groups that arrived from
   * another system since the last drawing fly in from there (motion on only).
   */
  private buildPieces(v: TableView, fly = true): void {
    this.pieces.traverse((x) => {
      if ((x as THREE.Sprite).isSprite) (x as THREE.Sprite).material.map?.dispose();
      if ((x as THREE.Points).isPoints) (x as THREE.Points).geometry.dispose();
    });
    this.pieces.clear();
    this.flights = [];
    const shipsAt: ShipGroupAt[] = [];
    const groupObjects = new Map<string, THREE.Object3D>();
    for (const s of v.systems) {
      const p = this.spots[s.id];
      if (!p) continue;
      const slots = slotSpots(this.calib, s.id);
      const centres = stackCentres(s.ships.length, slots ? 0.7 : 0.75);
      s.ships.forEach((st, i) => {
        // On the owner's picture each seat has its own spot in the system's
        // ship zone (clear of the slots, inside the planet): one model for its
        // fresh ships and one for its damaged ones, each with how many it
        // stands for. Elsewhere the stacks ring the system point.
        const zone = shipSpot(this.calib, s.id, st.player);
        const c = zone ? { x: zone.x - p.x, z: zone.z - p.z } : centres[i];
        const at = (dx: number, dz: number) => ({ x: p.x + c.x + dx, z: p.z + c.z + dz });
        if (zone) {
          for (const g of shipGroups(st.fresh, st.damaged)) {
            const o = piece('ship', st.player, { lying: g.lying });
            const w = at(g.dx, g.dz);
            o.position.set(w.x, 0, w.z);
            // Three-quarters to the viewer, each group turned its own way.
            o.rotation.y = SHIP_HEADING + headingJitter(`${s.id}:${st.player}:${g.lying ? 'd' : 'f'}`);
            if (!o.userData.model) o.scale.setScalar((o.userData.kit ? KIT_SHIP_SCALE : OWN_SCALE) * ZONE_SHIP_SCALE);
            o.userData.system = s.id;
            this.pieces.add(o);
            shipsAt.push({ player: st.player, damaged: g.lying, system: s.id, count: g.count, x: w.x, z: w.z });
            groupObjects.set(`${s.id}:${st.player}:${g.lying ? 1 : 0}`, o);
            if (g.count > 1) this.pieces.add(countTag(g.count, w.x, w.z, 'small', o.userData.model ? 0.5 : 0.3));
          }
          return;
        }
        for (const sp of stackSpots(st.fresh, st.damaged, 0.36)) {
          const o = piece('ship', st.player, { lying: sp.lying });
          const w = at(sp.dx, sp.dz);
          o.position.set(w.x, 0, w.z);
          // Turned three-quarters to the viewer, so the profile of a standing ship shows.
          o.rotation.y = SHIP_HEADING;
          if (!o.userData.model) o.scale.setScalar(o.userData.kit ? KIT_SHIP_SCALE : OWN_SCALE);
          o.userData.system = s.id;
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
        if (!o.userData.kit && !o.userData.model) {
          o.rotation.y = -0.4;
          o.scale.setScalar(OWN_SCALE);
        }
        o.userData.system = s.id;
        this.pieces.add(o);
      });
    }
    this.planFlights(shipsAt, groupObjects, fly);
  }

  /** Sets the ship groups that arrived from another system flying in from there. */
  private planFlights(shipsAt: ShipGroupAt[], groupObjects: Map<string, THREE.Object3D>, fly: boolean): void {
    const prev = this.shipsAt;
    this.shipsAt = shipsAt;
    if (!fly || !this.opts.motion || !prev.length) return;
    for (const m of planMoves(prev, shipsAt)) {
      const o = groupObjects.get(`${m.system}:${m.player}:${m.damaged ? 1 : 0}`);
      if (!o) continue;
      this.flights.push({ o, from: m.from, to: { x: o.position.x, z: o.position.z }, heading: o.rotation.y, t0: null });
      o.position.set(m.from.x, 0, m.from.z);
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
    // The local player's movable ships: a small ring under each of their groups.
    const g = this.glow;
    if (!g) return;
    for (const at of this.shipsAt) {
      if (at.player !== g.player || !g.systems.has(at.system)) continue;
      const picked = g.chosen === at.system;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.16, 0.21, 40),
        new THREE.MeshBasicMaterial({ color: picked ? CHOSEN : VALID, transparent: true, opacity: 0.95, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(at.x, 0.014, at.z);
      ring.userData.pulse = !picked;
      if (!picked) this.pulsing = true;
      this.rings.add(ring);
    }
  }

  /**
   * Where system `id` is on screen, in CSS pixels from the canvas's top-left
   * (null when it is not on the board or is behind the camera).
   */
  screenOf(id: string): { x: number; y: number } | null {
    const p = this.spots[id];
    if (!p) return null;
    const v = new THREE.Vector3(p.x, 0, p.z).project(this.camera);
    if (v.z > 1) return null;
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  private frame(t: number): void {
    if (this.planets.length && this.opts.motion) {
      turnPlanets(this.planets, t / 1000);
      this.dirty = true;
    }
    if (hasModels() && this.opts.motion && this.pieces.children.length) {
      this.animatePieces(t / 1000);
      this.dirty = true;
    }
    if (this.pulsing && this.opts.motion) {
      const a = 0.55 + 0.4 * Math.sin(t / 260);
      for (const r of this.rings.children) if (r.userData.pulse) ((r as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = a;
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * One step of the pieces' life at `sec` seconds: the effects clock, ships
   * bobbing and rolling a little in space, and ship groups flying to their
   * new system along an arc, nose first, then turning back to rest.
   */
  private animatePieces(sec: number): void {
    fxTime.value = sec;
    const f = modelConfig.float;
    for (const o of this.pieces.children) {
      const fl = o.userData.float as { phase: number; base: number } | undefined;
      const body = o.userData.body as THREE.Object3D | undefined;
      if (!fl || !body) continue;
      const w = (sec / f.period) * Math.PI * 2 + fl.phase;
      body.position.y = fl.base + f.amplitude * Math.sin(w);
      body.rotation.z = f.roll * Math.sin(w * 0.7 + 1.3);
    }
    const dur = modelConfig.move.duration;
    this.flights = this.flights.filter((fl) => {
      fl.t0 ??= sec;
      const p = Math.min(1, (sec - fl.t0) / dur);
      const e = easeInOut(p);
      fl.o.position.set(fl.from.x + (fl.to.x - fl.from.x) * e, arcHeight(e, modelConfig.move.arc), fl.from.z + (fl.to.z - fl.from.z) * e);
      // The models' nose is −X: face the way of travel, and settle back to the resting heading on arrival.
      const travel = Math.atan2(fl.to.z - fl.from.z, -(fl.to.x - fl.from.x));
      const settle = easeInOut((p - 0.75) / 0.25);
      fl.o.rotation.y = travel + (fl.heading - travel) * settle;
      if (p < 1) return true;
      fl.o.position.set(fl.to.x, 0, fl.to.z);
      fl.o.rotation.y = fl.heading;
      return false;
    });
  }

  private pointer(e: PointerEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private hit(e: PointerEvent): string | null {
    this.ray.setFromCamera(this.pointer(e), this.camera);
    // A ship or building model picks its system; else the system's disc under the pointer.
    for (const h of this.ray.intersectObjects(this.pieces.children, true)) {
      if (!(h.object as THREE.Mesh).isMesh) continue;
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) {
        if (o.userData.system) return o.userData.system as string;
      }
    }
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

/**
 * A "×n" label floating over a stack with more pieces than drawn; `small` is
 * the plain number beside one ship group in a ship zone.
 */
function countTag(n: number, x: number, z: number, size: 'large' | 'small' = 'large', height = 0.3): THREE.Sprite {
  const small = size === 'small';
  const cv = document.createElement('canvas');
  cv.width = small ? 64 : 128;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(10,14,28,.9)';
  g.beginPath();
  if (small) g.arc(32, 32, 30, 0, Math.PI * 2);
  else g.roundRect(4, 4, 120, 56, 18);
  g.fill();
  if (small) {
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.lineWidth = 3;
    g.stroke();
  }
  g.fillStyle = '#fff';
  g.font = 'bold 40px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(small ? String(n) : `×${n}`, cv.width / 2, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  if (small) {
    sprite.scale.set(0.15, 0.15, 1);
    sprite.position.set(x + 0.08, height, z);
  } else {
    sprite.scale.set(0.5, 0.25, 1);
    sprite.position.set(x, 0.6, z);
  }
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
