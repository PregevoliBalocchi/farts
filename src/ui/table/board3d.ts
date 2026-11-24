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
import { BOARD_DEPTH, boardWidth, buildingSpots, headingJitter, isCalibration, MAX_SHOWN, pictureToWorld, shipGroups, shipPlace, slotSpots, stackCentres, stackSpots, systemSpots, TILT_FAR, tiltForZoom } from './board3d-layout';
import type { BoardCalibration, Spot } from './board3d-layout';
import { loadKitPieces, piece } from './kitpieces';
import { faceEnemies, flightPhase, headingTowards, planMoves, routeSystems, turnBetween } from './model-fx';
import type { ShipGroupAt } from './model-fx';
import { disposeRoute, holoMaterial, routeArrow, routeCurve, routeMark, toHologram } from './route3d';
import modelConfig from './models.json';
import { engineTrail, fxTime, fxViewHeight, hasModels, loadModels, seatGlow } from './models3d';
import type { EngineTrail } from './models3d';
import { boardImageSvg } from './mapview';
import { loadCardFonts } from './cardfonts';
import boardLinesData from './board.lines.json';
import { drawInfoLayer, isBoardLines, resourceIconSpots, sectorTints, withLayerSpots } from './infolayer';
import type { BoardLines, SectorMode } from './infolayer';
import { SEAT_PAINT } from './pieces3d';
import { bakePlanets, buildPlanet, planetPalette, roomAround, turnPlanets } from './planets3d';
import type { Planet } from './planets3d';
import { starfield } from './starfield';
import { createRenderer, drawRatio, FrameWatch, gpu, LITE_FRAME_MS } from './gpu';
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
  /** A system was clicked; `shipOf`: the seat whose ship model was clicked, if one was. */
  onPick(id: string, shipOf?: number): void;
  /** The view moved (pan or zoom): things placed over the map follow it. */
  onView?(): void;
  /** The pointer is over system `id` (null: over none, or it left the map), at client point x, y. */
  onHover?(id: string | null, x: number, y: number): void;
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

/** How the planets are drawn: as 3D globes, or flat as on the board picture. */
export type PlanetMode = '3d' | '2d';
/** A 2D planet's picture spans this many disc radii each side of its centre (tools/map/import-planets.py OUT_PAD). */
const FLAT_MARGIN = 1.7;
/** How far under the glass the 2D planets lie (world units). */
const FLAT_DEPTH = 0.01;

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

/**
 * A move being planned (table.ts): the arrow along `path` (from where the ships
 * stand, through every system passed, to the end) and holograms of the ships
 * at each stop. `open`: the route may go on, to any of `targets` (hovering one
 * shows that next step); else the ships must stop at the end.
 */
export interface RoutePreview {
  seat: number;
  path: string[];
  stops: { system: string; fresh: number; damaged: number }[];
  open: boolean;
  targets: ReadonlySet<string>;
}

/** A ship group flying to its new system: its course, how it turns at both ends, and its engine trail. */
interface Flight {
  o: THREE.Object3D;
  curve: THREE.CatmullRomCurve3;
  startHeading: number;
  endHeading: number;
  duration: number;
  /** Start time, set on the first frame. */
  t0: number | null;
  trail: EngineTrail | null;
  bank: number;
  damaged: boolean;
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
  /** The lamp whose shadows the pieces cast (off when drawing lighter). */
  private lamp!: THREE.DirectionalLight;
  /** Watches the animation's frame rate: too slow, and the map draws lighter. */
  private readonly watch = new FrameWatch();
  /** When the last frame was drawn (milliseconds). */
  private lastDraw = 0;
  private pulsing = false;
  /** Ship groups as last drawn, to fly the ones that moved when the map changes. */
  private shipsAt: ShipGroupAt[] = [];
  private glow: ShipGlow | null = null;
  /** Ship groups flying from one system to another: start time set on the first frame. */
  private flights: Flight[] = [];
  /** The move being planned, drawn over the map: its arrow, marks and holograms. */
  private route: RoutePreview | null = null;
  private routeKey = '';
  private readonly routeGroup = new THREE.Group();
  /** The faint next step towards the system under the pointer, while a route may go on. */
  private readonly nextGroup = new THREE.Group();
  private nextId: string | null = null;
  private holoMats = new Map<number, THREE.ShaderMaterial>();
  /** Glowing engine trails, kept after their ship lands until they fade out. */
  private trails: EngineTrail[] = [];
  private framed = false;
  /** Distance at which the board just covers the window: from here outwards the camera looks straight down. */
  private coverDist = 1;
  private size2 = { w: 1, h: 1 };
  private focus: Rect = { x: 0, y: 0, w: 1, h: 1 };
  /** A smooth pan under way (ensureVisible): the whole shift, how much is done, start time. */
  private pan: { delta: THREE.Vector3; done: THREE.Vector3; t0: number | null } | null = null;
  /** Systems where the local player can act now: a faint ring on each. */
  private hints: ReadonlySet<string> = new Set();
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
  /** The 2D planets: each planet cut out of the board picture (assets/ui/map/planets/<id>.png), flat under the glass. */
  private readonly flatGroup = new THREE.Group();
  private flats: { id: string; mesh: THREE.Mesh }[] = [];
  private planetMode: PlanetMode = '3d';
  /** The planets' resource tokens: sprites, so they stay round whatever the camera's tilt. */
  private readonly iconGroup = new THREE.Group();
  private iconKey = '';

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
    const lamp = (this.lamp = new THREE.DirectionalLight('#fff4e4', 1.5));
    lamp.position.set(-5, 14, 7);
    lamp.castShadow = !gpu.lite;
    lamp.shadow.mapSize.set(2048, 2048);
    Object.assign(lamp.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8, near: 1, far: 40 });
    lamp.shadow.camera.updateProjectionMatrix();
    lamp.shadow.bias = -0.0004;
    this.scene.add(lamp);

    if (this.space) {
      // Space: stars far below, planets under the glass, the pieces' shadows on the glass.
      this.scene.add(starfield(60, 44, 7000, 7, drawRatio(window.devicePixelRatio)), this.planetGroup, this.flatGroup);
      this.flatGroup.visible = false;
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
    this.scene.add(this.board, this.shades, this.pieces, this.rings, this.discs, this.routeGroup, this.nextGroup, this.iconGroup);

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
      this.opts.onView?.();
    });

    this.canvas.addEventListener('pointerdown', (e) => (this.down = { x: e.clientX, y: e.clientY }));
    this.canvas.addEventListener('pointerup', (e) => this.click(e));
    this.canvas.addEventListener('pointermove', (e) => this.hover(e));
    this.canvas.addEventListener('pointerleave', (e) => this.opts.onHover?.(null, e.clientX, e.clientY));
    this.canvas.addEventListener('dblclick', () => this.resetView());

    renderer.setAnimationLoop((t) => this.frame(t));
    void loadModels().then((any) => {
      // The owner's models replace every other piece once loaded.
      if (!any) return;
      this.piecesKey = '';
      if (this.last) this.buildPieces(this.last, false);
      this.routeKey = '';
      this.buildRoute();
      this.dirty = true;
    });
    void loadKitPieces().then((any) => {
      // The kit's shapes replace our own once their pictures are cut.
      if (!any) return;
      this.piecesKey = '';
      if (this.last) this.buildPieces(this.last, false);
      this.routeKey = '';
      this.buildRoute();
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
    this.renderer.setPixelRatio(drawRatio(pixelRatio));
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
  update(v: TableView, valid: ReadonlySet<string>, chosen: ReadonlySet<string>, ships: ShipGlow | null = null, route: RoutePreview | null = null, hints: ReadonlySet<string> = new Set()): void {
    this.hints = hints;
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
    this.route = route;
    this.buildRoute();
    this.dirty = true;
  }

  // ---- the move being planned ----

  /** Where seat `seat`'s ships would stand in system `id`, with the seats already there. */
  private placeFor(id: string, seat: number): Spot | null {
    const s = this.last?.systems.find((x) => x.id === id);
    const seats = [...new Set([...(s?.ships.filter((x) => x.fresh + x.damaged > 0).map((x) => x.player) ?? []), seat])].sort((a, b) => a - b);
    return shipPlace(this.calib, id, seat, seats) ?? this.spots[id] ?? null;
  }

  /** The route's points: the moving ships where they stand, then each system's place along the way. */
  private routePoints(r: RoutePreview): Spot[] | null {
    const mine = this.shipsAt.filter((g) => g.player === r.seat && g.system === r.path[0]);
    const start = mine.find((g) => !g.damaged) ?? mine[0] ?? this.placeFor(r.path[0], r.seat);
    const rest = r.path.slice(1).map((id) => this.placeFor(id, r.seat));
    if (!start || rest.some((p) => !p)) return null;
    return [start, ...(rest as Spot[])];
  }

  private holoFor(seat: number): THREE.ShaderMaterial {
    let m = this.holoMats.get(seat);
    if (!m) {
      m = holoMaterial(seatGlow(seatColor(seat)));
      this.holoMats.set(seat, m);
    }
    return m;
  }

  private clearRoute(g: THREE.Group): void {
    disposeRoute(g, new Set(this.holoMats.values()));
    g.clear();
  }

  /** Draws the planned route (or clears it): the arrow, a mark on each system passed through, the holograms. */
  private buildRoute(): void {
    const r = this.route;
    const key = r ? JSON.stringify([r.seat, r.path, r.stops, r.open, this.piecesKey]) : '';
    if (key === this.routeKey) return;
    this.routeKey = key;
    this.clearRoute(this.routeGroup);
    this.showNext(null);
    if (!r || r.path.length < 2) return;
    const pts = this.routePoints(r);
    if (!pts) return;
    const color = seatGlow(seatColor(r.seat));
    const cfg = modelConfig.route;
    const curve = routeCurve(pts);
    this.routeGroup.add(routeArrow(curve, color, cfg.startGap, cfg.endGap));
    // Systems passed through without leaving ships there: a small mark.
    const stopAt = new Map(r.stops.map((s) => [s.system, s]));
    r.path.slice(1, -1).forEach((id, i) => {
      if (!stopAt.has(id)) this.routeGroup.add(routeMark(pts[i + 1], color));
    });
    if (!r.open) this.routeGroup.add(routeMark(pts[pts.length - 1], color, true));
    // The ships as they will stand: holograms at each stop.
    for (const s of r.stops) {
      const k = r.path.indexOf(s.system);
      if (k < 1) continue;
      this.addHolograms(r.seat, s, pts[k], pts[k - 1]);
    }
  }

  /** Hologram ships of `seat` at `at` (one per group, as the real ones stand), facing rivals there or the way they came. */
  private addHolograms(seat: number, s: { system: string; fresh: number; damaged: number }, place: Spot, came: Spot): void {
    // Where the seat already has ships, the newcomers show beside them, on the side they come from.
    let at = place;
    if (this.shipsAt.some((g) => g.system === s.system && g.player === seat)) {
      const dx = came.x - place.x;
      const dz = came.z - place.z;
      const l = Math.hypot(dx, dz) || 1;
      at = { x: place.x + (dx / l) * modelConfig.route.beside, z: place.z + (dz / l) * modelConfig.route.beside };
    }
    const foes = this.shipsAt.filter((g) => g.system === s.system && g.player !== seat);
    const heading = foes.length
      ? headingTowards(at, { x: foes.reduce((a, g) => a + g.x, 0) / foes.length, z: foes.reduce((a, g) => a + g.z, 0) / foes.length })
      : headingTowards(came, at);
    const mat = this.holoFor(seat);
    for (const g of shipGroups(s.fresh, s.damaged)) {
      const o = toHologram(piece('ship', seat, { lying: g.lying }), mat);
      o.position.set(at.x + g.dx, 0, at.z + g.dz);
      o.rotation.y = heading;
      if (!o.userData.model) o.scale.setScalar((o.userData.kit ? KIT_SHIP_SCALE : OWN_SCALE) * ZONE_SHIP_SCALE);
      this.routeGroup.add(o);
      if (g.count > 1) this.routeGroup.add(countTag(g.count, at.x + g.dx, at.z + g.dz, 'small', o.userData.model ? 0.5 : 0.3));
    }
  }

  /** Shows the faint next step to system `id` (null: none). */
  private showNext(id: string | null): void {
    if (id === this.nextId) return;
    this.nextId = id;
    this.clearRoute(this.nextGroup);
    this.dirty = true;
    const r = this.route;
    if (!id || !r || !r.open) return;
    const pts = this.routePoints(r);
    const to = this.placeFor(id, r.seat);
    if (!pts || !to) return;
    const cfg = modelConfig.route;
    const from = pts[pts.length - 1];
    this.nextGroup.add(routeArrow(routeCurve([from, to]), seatGlow(seatColor(r.seat)), cfg.endGap, cfg.endGap, cfg.hover));
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
      if (this.planetMode === '2d' && !this.flats.length) this.buildFlats(c);
      this.showPlanets();
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

  /** True when the 2D planets can be shown: the map in space, with the planets cut out of the board picture. */
  get hasFlatPlanets(): boolean {
    return this.space && !!this.calib && this.ix.content.map.systems.some((s) => s.kind === 'planet' && !!assetUrl(`map.planets.${s.id}`));
  }

  /** Shows the 3D planets (default) or the 2D ones drawn as on the board. */
  setPlanetMode(mode: PlanetMode): void {
    if (mode === this.planetMode) return;
    this.planetMode = mode;
    if (mode === '2d' && !this.flats.length && this.calib) this.buildFlats(this.calib);
    this.showPlanets();
    this.dirty = true;
  }

  /** Each in-play planet in the chosen style; in 2D a planet with no picture keeps its 3D globe. */
  private showPlanets(): void {
    const flat = new Set(this.planetMode === '2d' ? this.flats.map((f) => f.id) : []);
    for (const p of this.planets) p.holder.visible = this.inPlay.get(p.id) !== false && !flat.has(p.id);
    for (const f of this.flats) f.mesh.visible = this.inPlay.get(f.id) !== false;
    this.flatGroup.visible = this.planetMode === '2d';
  }

  /**
   * One flat picture per planet system, drawn as on the board with its
   * covered parts rebuilt (tools/map/import-planets.py): lying just under the
   * glass, centred on the system's disc, as large as its frame (FLAT_MARGIN).
   */
  private buildFlats(c: BoardCalibration): void {
    const unit = BOARD_DEPTH / c.height;
    const loader = new THREE.TextureLoader();
    for (const s of this.ix.content.map.systems) {
      const disc = c.systems[s.id]?.disc;
      const url = assetUrl(`map.planets.${s.id}`);
      if (s.kind !== 'planet' || !disc || !url) continue;
      const side = 2 * disc.r * FLAT_MARGIN * unit;
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 });
      loader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        mat.map = tex;
        mat.opacity = 1;
        mat.needsUpdate = true;
        this.dirty = true;
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(side, side), mat);
      mesh.rotation.x = -Math.PI / 2;
      const at = pictureToWorld(c, disc.x, disc.y);
      mesh.position.set(at.x, -FLAT_DEPTH, at.z);
      this.flatGroup.add(mesh);
      this.flats.push({ id: s.id, mesh });
    }
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
    this.buildIcons(lines, systems);
    drawInfoLayer(this.infoCanvas, lines, this.calib, { inPlay: this.inPlay, numberFont: NUMBER_FONT, tints, bridges: this.bridges, showSpots: this.opts.showSpots });
    if (this.glassMaterial.map) this.glassMaterial.map.needsUpdate = true;
    this.dirty = true;
  }

  /**
   * Each planet's resource token on its rim: a dark disc ringed in the
   * resource's colour, as a sprite just over the glass (always facing the
   * camera, so it stays round). Rebuilt when systems or pictures change.
   */
  private buildIcons(lines: BoardLines, systems: readonly { id: string; resource: string | null }[]): void {
    const c = this.calib;
    if (!c) return;
    const spots = resourceIconSpots(c, lines.ring, systems)
      .filter((s) => this.inPlay.get(s.system) !== false)
      .map((s) => ({ ...s, image: this.iconImage(s.resource) }));
    const key = JSON.stringify(spots.map((s) => [s.system, s.resource, !!s.image]));
    if (key === this.iconKey) return;
    this.iconKey = key;
    for (const o of this.iconGroup.children) {
      const m = (o as THREE.Sprite).material;
      m.map?.dispose();
      m.dispose();
    }
    this.iconGroup.clear();
    const unit = BOARD_DEPTH / c.height;
    for (const s of spots) {
      if (!s.image) continue;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const g = cv.getContext('2d')!;
      g.beginPath();
      g.arc(64, 64, 58, 0, Math.PI * 2);
      g.fillStyle = 'rgba(10,9,12,0.9)';
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = planetPalette(s.resource).line;
      g.stroke();
      g.drawImage(s.image, 64 - 39, 64 - 39, 78, 78);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, toneMapped: false }));
      const at = pictureToWorld(c, s.x, s.y);
      const size = s.r * unit * 2.2;
      sprite.scale.set(size, size, 1);
      sprite.position.set(at.x, size * 0.25, at.z);
      // After the glass, so its lines never cross the token.
      sprite.renderOrder = 3;
      this.iconGroup.add(sprite);
    }
  }

  /**
   * One 3D planet under each planet system's disc on the board: as large as
   * the disc, sunk just below the glass (placePlanets sets it under its disc).
   */
  private buildPlanets(c: BoardCalibration): void {
    const unit = BOARD_DEPTH / c.height;
    // Each planet's moons and rings keep clear of its neighbours.
    const discs: Record<string, { x: number; y: number; r: number }> = {};
    for (const [id, sys] of Object.entries(c.systems)) if (sys.disc) discs[id] = sys.disc;
    for (const s of this.ix.content.map.systems) {
      const disc = c.systems[s.id]?.disc;
      if (s.kind !== 'planet' || !disc) continue;
      const p = buildPlanet(s.id, s.resource, disc.r * unit, roomAround(s.id, discs));
      const top = new THREE.Box3().setFromObject(p.holder).max.y;
      const depth = top + 0.06;
      const at = pictureToWorld(c, disc.x, disc.y);
      p.holder.userData = { gx: at.x, gz: at.z, depth };
      p.holder.position.set(at.x, -depth, at.z);
      this.planetGroup.add(p.holder);
      this.planets.push(p);
    }
    // Their surface drawings once into textures: drawn live they cost most of each frame.
    bakePlanets(this.renderer, this.planets);
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
    for (const tr of this.trails) tr.detach();
    this.trails = [];
    const shipsAt: ShipGroupAt[] = [];
    const groupObjects = new Map<string, THREE.Object3D>();
    // Every ship drawn, by system, to turn the ones that share a system with another seat towards it.
    const bySystem = new Map<string, { o: THREE.Object3D; player: number; x: number; z: number }[]>();
    const keep = (system: string, o: THREE.Object3D, player: number) =>
      bySystem.set(system, [...(bySystem.get(system) ?? []), { o, player, x: o.position.x, z: o.position.z }]);
    for (const s of v.systems) {
      const p = this.spots[s.id];
      if (!p) continue;
      const slots = slotSpots(this.calib, s.id);
      const centres = stackCentres(s.ships.length, slots ? 0.7 : 0.75);
      // The seats with ships here, in order: they stand in a figure centred in the system.
      const seats = s.ships.filter((x) => x.fresh + x.damaged > 0).map((x) => x.player);
      s.ships.forEach((st, i) => {
        // On the owner's picture each seat has its own spot in the system's
        // ship zone (clear of the slots, inside the planet): one model for its
        // fresh ships and one for its damaged ones, each with how many it
        // stands for. Elsewhere the stacks ring the system point.
        const zone = shipPlace(this.calib, s.id, st.player, seats);
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
            o.userData.shipOf = st.player;
            this.pieces.add(o);
            keep(s.id, o, st.player);
            shipsAt.push({ player: st.player, damaged: g.lying, system: s.id, count: g.count, x: w.x, z: w.z });
            groupObjects.set(`${s.id}:${st.player}:${g.lying ? 1 : 0}`, o);
            if (g.count > 0) {
              const tag = countTag(g.count, w.x, w.z, 'small', o.userData.model ? 0.5 : 0.3, SEAT_PAINT[seatColor(st.player)]);
              o.userData.tag = tag;
              this.pieces.add(tag);
            }
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
          o.userData.shipOf = st.player;
          this.pieces.add(o);
          keep(s.id, o, st.player);
        }
        if (st.fresh + st.damaged > MAX_SHOWN) this.pieces.add(countTag(st.fresh + st.damaged, p.x + c.x, p.z + c.z, 'large', 0.3, SEAT_PAINT[seatColor(st.player)]));
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
    // Ships sharing a system with another seat's ships face them, ready for battle.
    for (const list of bySystem.values()) {
      faceEnemies(list).forEach((h, i) => {
        if (h !== null) list[i].o.rotation.y = h;
      });
    }
    for (const g of shipsAt) g.heading = groupObjects.get(`${g.system}:${g.player}:${g.damaged ? 1 : 0}`)?.rotation.y;
    this.planFlights(shipsAt, groupObjects, fly);
  }

  /** Sets the ship groups that arrived from another system flying in from there. */
  private planFlights(shipsAt: ShipGroupAt[], groupObjects: Map<string, THREE.Object3D>, fly: boolean): void {
    const prev = this.shipsAt;
    this.shipsAt = shipsAt;
    if (!fly || !this.opts.motion || !prev.length) return;
    const links = this.last?.links ?? this.ix.content.map.links;
    const before = new Map(prev.map((g) => [`${g.system}:${g.player}:${g.damaged ? 1 : 0}`, g.heading]));
    for (const m of planMoves(prev, shipsAt)) {
      const o = groupObjects.get(`${m.system}:${m.player}:${m.damaged ? 1 : 0}`);
      if (!o) continue;
      // The course: from where the group stood, through the systems on the way (the gates), to its new
      // place; a single jump bends a little to one side, like a ship steering rather than a straight cut.
      const route = routeSystems(links, m.fromSystem, m.system);
      const to = { x: o.position.x, z: o.position.z };
      const via = route.slice(1, -1).map((id) => this.spots[id]).filter((p): p is Spot => !!p);
      const pts = [new THREE.Vector3(m.from.x, 0, m.from.z), ...via.map((p) => new THREE.Vector3(p.x, 0, p.z)), new THREE.Vector3(to.x, 0, to.z)];
      if (pts.length === 2) {
        const d = pts[1].clone().sub(pts[0]);
        const side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(m.player % 2 ? 0.12 : -0.12);
        pts.splice(1, 0, pts[0].clone().add(pts[1]).multiplyScalar(0.5).add(side));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const startHeading = before.get(`${m.fromSystem}:${m.player}:${m.damaged ? 1 : 0}`) ?? SHIP_HEADING;
      const move = modelConfig.move;
      const duration = Math.min(move.maxDuration, move.duration + move.perJump * Math.max(0, route.length - 2));
      const trail = m.damaged ? null : engineTrail(seatGlow(seatColor(m.player)));
      if (trail) {
        this.pieces.add(trail.object);
        this.trails.push(trail);
      }
      this.flights.push({ o, curve, startHeading, endHeading: o.rotation.y, duration, t0: null, trail, bank: 0, damaged: m.damaged });
      o.position.set(m.from.x, 0, m.from.z);
      o.rotation.y = startHeading;
      // The group's count shows once it has landed.
      if (o.userData.tag) (o.userData.tag as THREE.Sprite).visible = false;
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
    // Systems where the local player can act now (the map menu): a faint, still ring.
    for (const id of this.hints) {
      const p = this.spots[id];
      const s = v.systems.find((x) => x.id === id);
      if (!p || !s || valid.has(id) || chosen.has(id)) continue;
      const r = s.kind === 'gate' ? 0.5 : 0.85;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.035, 64), new THREE.MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.35, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, 0.011, p.z);
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

  /** The point of the table under canvas pixel (x, y), or null when the ray misses it. */
  private groundAt(x: number, y: number): THREE.Vector3 | null {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  }

  /**
   * Pans the map, smoothly, so system `id` sits inside the area the panels
   * leave free (with a margin); nothing happens when it already does.
   */
  ensureVisible(id: string, margin = 110): void {
    const at = this.screenOf(id);
    if (!at) return;
    const f = this.focus;
    const tx = Math.max(f.x + margin, Math.min(f.x + f.w - margin, at.x));
    const ty = Math.max(f.y + margin, Math.min(f.y + f.h - margin, at.y));
    if (Math.abs(tx - at.x) < 2 && Math.abs(ty - at.y) < 2) return;
    const a = this.groundAt(at.x, at.y);
    const b = this.groundAt(tx, ty);
    if (!a || !b) return;
    this.pan = { delta: a.sub(b).setY(0), done: new THREE.Vector3(), t0: null };
    this.dirty = true;
  }

  /** One frame of a pan: moves the camera and the point it looks at by the next share of the shift. */
  private stepPan(t: number): void {
    const pan = this.pan;
    if (!pan) return;
    pan.t0 ??= t;
    const k = this.opts.motion ? Math.min(1, (t - pan.t0) / 380) : 1;
    const e = k * k * (3 - 2 * k);
    const step = pan.delta.clone().multiplyScalar(e).sub(pan.done);
    pan.done.add(step);
    this.controls.target.add(step);
    this.camera.position.add(step);
    this.controls.update();
    if (k >= 1) this.pan = null;
    this.dirty = true;
  }

  /**
   * Draws lighter from now on (the graphics card cannot keep up): one pixel
   * per screen pixel, no shadows, animations at about 30 frames a second.
   */
  private goLite(): void {
    if (gpu.lite && !this.lamp.castShadow) return;
    gpu.lite = true;
    this.lamp.castShadow = false;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.size2.w, this.size2.h, false);
    fxViewHeight.value = this.size2.h;
    this.dirty = true;
  }

  private frame(t: number): void {
    this.stepPan(t);
    // Something moves on its own every frame: the map is animating.
    const animating = this.opts.motion && (!!this.planets.length || (hasModels() && !!this.pieces.children.length) || !!this.route || this.pulsing);
    // Drawing lighter, an animation is drawn about 30 times a second, not at the screen's rate.
    if (gpu.lite && animating && t - this.lastDraw < LITE_FRAME_MS) return;
    if (this.planets.length && this.opts.motion) {
      turnPlanets(this.planets, t / 1000);
      this.dirty = true;
    }
    if (hasModels() && this.opts.motion && this.pieces.children.length) {
      this.animatePieces(t / 1000);
      this.dirty = true;
    }
    if (this.route && this.opts.motion) {
      // The arrow's chevrons flow and the holograms flicker.
      fxTime.value = t / 1000;
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
    this.lastDraw = t;
    if (animating && this.watch.tick(t)) this.goLite();
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
    const move = modelConfig.move;
    this.flights = this.flights.filter((fl) => {
      fl.t0 ??= sec;
      const p = Math.min(1, (sec - fl.t0) / fl.duration);
      const ph = flightPhase(p, move.turnShare, move.settleShare);
      // The course's direction at u (the last stretch looks from just before the end).
      const course = (u: number) => {
        const a = Math.min(0.99, Math.max(0, u));
        return headingTowards(fl.curve.getPointAt(a), fl.curve.getPointAt(a + 0.01));
      };
      const at = fl.curve.getPointAt(ph.u);
      // A little off the board while flying, back down on arrival.
      fl.o.position.set(at.x, move.lift * Math.sin(Math.PI * ph.u), at.z);
      let heading: number;
      if (ph.stage === 'turn') heading = fl.startHeading + turnBetween(fl.startHeading, course(0)) * ph.k;
      else if (ph.stage === 'settle') heading = course(1) + turnBetween(course(1), fl.endHeading) * ph.k;
      else heading = course(ph.u);
      // Banking into turns: the hull rolls with how fast the heading changes (fresh ships only).
      const body = fl.o.userData.body as THREE.Object3D | undefined;
      if (body && !fl.damaged) {
        const rate = turnBetween(fl.o.rotation.y, heading);
        fl.bank += (Math.max(-move.bank, Math.min(move.bank, rate * 6)) - fl.bank) * 0.2;
        body.rotation.x = ph.stage === 'fly' ? fl.bank : fl.bank * (1 - ph.k);
      }
      fl.o.rotation.y = heading;
      fl.trail?.follow(fl.o, sec);
      if (p < 1) return true;
      fl.o.position.set(at.x, 0, at.z);
      fl.o.rotation.y = fl.endHeading;
      if (body && !fl.damaged) body.rotation.x = 0;
      fl.trail?.land(sec);
      if (fl.o.userData.tag) (fl.o.userData.tag as THREE.Sprite).visible = true;
      return false;
    });
    // Trails fade after landing, then go.
    this.trails = this.trails.filter((tr) => {

      if (!tr.done(sec)) return true;
      tr.detach();
      return false;
    });
  }

  private pointer(e: PointerEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  /** Seat of the ship model under the last hit() pointer, if it was a ship. */
  private hitShipOf: number | undefined;

  private hit(e: PointerEvent): string | null {
    this.ray.setFromCamera(this.pointer(e), this.camera);
    this.hitShipOf = undefined;
    // A ship or building model picks its system; else the system's disc under the pointer.
    for (const h of this.ray.intersectObjects(this.pieces.children, true)) {
      if (!(h.object as THREE.Mesh).isMesh) continue;
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) {
        if (o.userData.system) {
          this.hitShipOf = o.userData.shipOf as number | undefined;
          return o.userData.system as string;
        }
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
    if (id) this.opts.onPick(id, this.hitShipOf);
  }

  private hover(e: PointerEvent): void {
    if (e.buttons) {
      this.opts.onHover?.(null, e.clientX, e.clientY);
      return;
    }
    const id = this.hit(e);
    this.canvas.style.cursor = id ? 'pointer' : 'grab';
    this.opts.onHover?.(id, e.clientX, e.clientY);
    // Planning a route: the system under the pointer, if the route may go on there, shows that step.
    this.showNext(id && this.route?.open && this.route.targets.has(id) ? id : null);
  }
}

/**
 * How many ships a model stands for, as on the digital table: a paint splat
 * in the owner's colour with the number on it, white with a dark outline,
 * floating by the model (`small`: beside one ship group in a ship zone;
 * `large`: over a stack with more pieces than drawn). Drawn after the glass
 * and over everything, so no line of the map covers it.
 */
function countTag(n: number, x: number, z: number, size: 'large' | 'small' = 'large', height = 0.3, colour = '#1a2030'): THREE.Sprite {
  const small = size === 'small';
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const c = new THREE.Color(colour);
  const hex = (k: THREE.Color) => '#' + k.getHexString();
  // The splat: a disc with a rough, bitten rim and a few drops flung off it (the same for a given number).
  let seed = 977 + n * 131;
  const rand = () => ((seed = (seed * 16807) % 2147483647) & 0xffff) / 0xffff;
  const blob = (r0: number) => {
    g.beginPath();
    const steps = 44;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const r = r0 * (0.9 + 0.1 * Math.sin(a * 5 + n) + 0.07 * (rand() - 0.5) + (i % 9 === 0 ? 0.08 : 0));
      const px = S / 2 + Math.cos(a) * r;
      const py = S / 2 + Math.sin(a) * r;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.closePath();
  };
  g.shadowColor = 'rgba(0,0,0,0.7)';
  g.shadowBlur = 6;
  g.fillStyle = hex(c.clone().lerp(new THREE.Color('#000000'), 0.12));
  blob(50);
  g.fill();
  g.shadowBlur = 0;
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    const d = 52 + rand() * 7;
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 2 + rand() * 3.5, 0, Math.PI * 2);
    g.fill();
  }
  // A lighter heart, like wet paint.
  g.fillStyle = hex(c.clone().lerp(new THREE.Color('#ffffff'), 0.16));
  blob(41);
  g.fill();
  // The number: white, heavy, with a dark outline.
  g.font = `900 ${n > 9 ? 62 : 76}px ${NUMBER_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = '#17130f';
  g.strokeText(String(n), S / 2, S / 2 + 4);
  g.fillStyle = '#ffffff';
  g.fillText(String(n), S / 2, S / 2 + 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, toneMapped: false }));
  sprite.renderOrder = 10;
  if (small) {
    sprite.scale.set(0.27, 0.27, 1);
    sprite.position.set(x + 0.12, height, z - 0.04);
  } else {
    sprite.scale.set(0.34, 0.34, 1);
    sprite.position.set(x, 0.6, z);
  }
  return sprite;
}

/** The 3D map, or null when this browser cannot draw WebGL (the table then keeps the 2D map). */
export function createBoard3D(ix: ContentIndex, opts: Board3DOptions): Board3D | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = createRenderer({ antialias: true });
  } catch {
    return null;
  }
  return new Board3D(ix, opts, renderer);
}
