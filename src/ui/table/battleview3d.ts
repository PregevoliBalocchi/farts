// The battle view's 3D scene: in open space, the attacker's ships on the left
// facing the defender's ships and buildings on the right, as the owner's
// models. When the dice are rolled the fleets trade fire (lasers, missiles,
// tractor beams: one volley per die, from the faces the engine rolled); while
// the attacker assigns hits, every piece that can take one has a ring under it
// and a click on it reports which piece (onPick); each hit placed is shot at
// the piece, which burns when damaged and blows apart when destroyed. A
// battle at a planet is fought in orbit, the planet's curve filling the lower
// part of the view; at a gate there is only space. The dice themselves are
// shown by the battle window, not in the scene. One renderer, created on the
// first battle and reused.

import * as THREE from 'three';
import type { DieFace, DieType } from '../../game/engine';
import { seatColor } from './assets';
import type { BattleAfter, BattlePick, HitEvent, Shot } from './battle';
import { hitEvents, volleyPlan } from './battle';
import { BattleFx } from './battlefx3d';
import { piece } from './kitpieces';
import { fleetFormation, rng } from './model-fx';
import { SEAT_PAINT } from './pieces3d';
import { buildPlanet, planetPalette, turnPlanets } from './planets3d';
import type { Planet } from './planets3d';

/** Size of the 3D view in the battle window, in CSS pixels. */
export const BATTLE_VIEW = { w: 1180, h: 520 } as const;

/** What the view shows. `rollKey` changes when the dice are (re)rolled, which fires the volley again. */
export interface BattleScene {
  attackerSeat: number;
  defenderSeat: number;
  after: BattleAfter;
  buildings: { owner: number; type: 'city' | 'starport' }[];
  /** The rolled dice, in order: each one fires its volley. */
  dice: readonly { type: DieType; face: DieFace }[];
  rollKey: string;
  /** Whether a piece can take a hit now (null: nothing can be clicked). */
  canPick: ((p: BattlePick) => boolean) | null;
  /** The planet the battle is fought over (its system id and resource), or null at a gate. */
  planet?: { id: string; resource: string | undefined } | null;
}

/** The planet under an orbital battle: radius, depth below the fleets, distance behind them, turns per minute. */
const ORBIT = { radius: 30, below: 6, behind: 12, tilt: 0.5, spin: 0.15, light: 0.62, sideMin: 10, sideMax: 16 } as const;
/** Laser bolts in a burst: in the opening volley, and at a ship being damaged. */
const BURST = { volley: 3, strike: 4 } as const;

/** Scale of the pieces in this close view, against their size on the board. */
const PIECE_SCALE = 2.1;
/** Height of a floating ship's body in this view (its hover times PIECE_SCALE). */
const SHIP_RING_Y = 0.3;
/** Where shots aim on a building: above its base. */
const BUILDING_AIM_Y = 0.38;
/** Gap between the shots at the pieces hit by one batch of placed hits (seconds). */
const HIT_GAP = 0.2;
/** Explosion sizes: a ship damaged, a ship destroyed, a building damaged, a building destroyed; the volley's missiles. */
const BLAST = { shipDamaged: 0.65, shipDestroyed: 1.2, buildingDamaged: 0.75, buildingDestroyed: 1.5, volley: 0.6 } as const;

type Side = 'attacker' | 'defender';

/** The pieces on screen, by side and kind, so shots can aim at them. */
interface Pieces {
  attacker: { fresh: THREE.Object3D[]; damaged: THREE.Object3D[] };
  defender: { fresh: THREE.Object3D[]; damaged: THREE.Object3D[] };
  buildings: (THREE.Object3D | null)[];
}

const noPieces = (): Pieces => ({ attacker: { fresh: [], damaged: [] }, defender: { fresh: [], damaged: [] }, buildings: [] });

/** A seat's colour for its shots (white seats fire pale blue, which reads better on black). */
function shotColour(seat: number): string {
  const c: string = SEAT_PAINT[seatColor(seat) % SEAT_PAINT.length];
  return c === '#f4f4f0' ? '#a8ecff' : c;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class BattleView3D {
  readonly canvas: HTMLCanvasElement;
  /** Called with the piece clicked while hits are being assigned. */
  onPick: ((p: BattlePick) => void) | null = null;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, BATTLE_VIEW.w / BATTLE_VIEW.h, 0.1, 200);
  private readonly camBase = new THREE.Vector3();
  private fitX: [number, number] | null = null;
  private readonly forces = new THREE.Group();
  private fx = new BattleFx();
  private readonly ray = new THREE.Raycaster();
  private pieces: Pieces = noPieces();
  private rollKey = '';
  private shown: BattleAfter | null = null;
  private raf = 0;
  private canPick: BattleScene['canPick'] = null;
  private seats = { attacker: 0, defender: 1 };
  private buildingOwners: number[] = [];
  /** Where the pointer last was over the view, to update the cursor when the pieces change under it. */
  private pointer: { clientX: number; clientY: number } | null = null;
  /** The view's clock (seconds), as of the last frame. */
  private clock = performance.now() / 1000;
  /** The scene last shown, to lay the pieces out again once the ship model has loaded. */
  private last: BattleScene | null = null;
  /** The planet under the battle, and which one it is ('' at a gate). */
  private planet: Planet | null = null;
  private planetId = '';
  /** How far left (−) or right (+) of the fleets the planet sits: picked at random for each battle. */
  private planetSide: number = ORBIT.sideMin;

  constructor(private readonly motion: boolean) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(BATTLE_VIEW.w, BATTLE_VIEW.h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'battle-3d';
    this.scene.background = new THREE.Color('#04050a');

    this.scene.add(new THREE.HemisphereLight('#cfd8ff', '#140f1c', 1.3));
    const lamp = new THREE.DirectionalLight('#fff1dc', 2.1);
    lamp.position.set(-3, 7, 5);
    this.scene.add(lamp);
    const rim = new THREE.DirectionalLight('#7fb6ff', 1);
    rim.position.set(4, 3, -5);
    this.scene.add(rim);
    this.scene.add(this.space(), this.forces, this.fx.group);

    this.camera.position.set(0.55, 3.6, 5.9);
    this.camera.lookAt(0.55, 0.35, -0.1);
    this.camBase.copy(this.camera.position);

    this.canvas.addEventListener('pointermove', (e) => {
      this.pointer = { clientX: e.clientX, clientY: e.clientY };
      this.canvas.style.cursor = this.pickAt(this.pointer) ? 'pointer' : 'default';
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.pointer = null;
    });
    this.canvas.addEventListener('click', (e) => {
      const p = this.pickAt(e);
      if (p) this.onPick?.(p);
    });
  }

  /** Open space all around: stars at every distance and two faint nebulae far behind. */
  private space(): THREE.Group {
    const g = new THREE.Group();
    const r = rng(11);
    const layer = (n: number, rMin: number, rMax: number, size: number, color: string) => {
      const pos: number[] = [];
      for (let i = 0; i < n; i++) {
        const u = r() * 2 - 1;
        const a = r() * Math.PI * 2;
        const d = rMin + r() * (rMax - rMin);
        const s = Math.sqrt(1 - u * u);
        pos.push(Math.cos(a) * s * d, u * d, Math.sin(a) * s * d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false })));
    };
    layer(1800, 40, 70, 0.16, '#c9d6ff');
    layer(500, 25, 40, 0.12, '#ffe6c8');
    layer(160, 14, 24, 0.07, '#ffffff');
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const c = cv.getContext('2d')!;
    const grad = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    for (const [x, y, z, s, col] of [
      [-14, 6, -40, 34, '#3a2a6a'],
      [18, -4, -46, 40, '#123a4a'],
    ] as const) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.position.set(x, y, z);
      sp.scale.setScalar(s);
      g.add(sp);
    }
    return g;
  }

  /** Shows `scene`: fires the volley on a new roll, and shoots at each piece hit since the last call. */
  update(scene: BattleScene): void {
    this.last = scene;
    this.canPick = scene.canPick;
    this.seats = { attacker: scene.attackerSeat, defender: scene.defenderSeat };
    this.buildingOwners = scene.buildings.map((b) => b.owner);
    this.setPlanet(scene.planet ?? null);
    const before = this.pieces;
    const newRoll = scene.rollKey !== this.rollKey;
    this.buildForces(scene);
    if (newRoll) {
      // Framed once per roll, so the view holds still while hits are placed.
      this.fitX = null;
      this.rollKey = scene.rollKey;
      this.fx.clear();
      this.fx.group.removeFromParent();
      this.fx = new BattleFx(hash(scene.rollKey), this.clock);
      // The planet off to one side, so open space and stars show on the other.
      const pr = rng(hash(scene.rollKey) % 100000);
      this.planetSide = (pr() < 0.5 ? -1 : 1) * (ORBIT.sideMin + pr() * (ORBIT.sideMax - ORBIT.sideMin));
      this.scene.add(this.fx.group);
      if (this.motion) this.volley(volleyPlan(scene.dice));
    } else if (this.motion && this.shown) {
      this.strike(hitEvents(this.shown, scene.after), before);
    }
    this.shown = scene.after;
    this.fitCamera();
    if (this.pointer) this.canvas.style.cursor = this.pickAt(this.pointer) ? 'pointer' : 'default';
    cancelAnimationFrame(this.raf);
    const tick = (t: number) => {
      this.step(t / 1000);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /**
   * The planet under the battle: the map's planet (same recipe and colours)
   * at orbital scale, without its moons and rings, with a thin glow of
   * atmosphere on its rim. Rebuilt only when the battle moves to another system.
   */
  private setPlanet(pl: { id: string; resource: string | undefined } | null): void {
    const id = pl?.id ?? '';
    if (id === this.planetId) return;
    this.planetId = id;
    if (this.planet) {
      this.scene.remove(this.planet.holder);
      this.planet.holder.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose();
      });
      this.planet = null;
    }
    if (!pl) return;
    const planet = buildPlanet(pl.id, pl.resource, ORBIT.radius);
    // Keep the globe only (moons, rings and rocks would cut through the fleets).
    for (const o of planet.extras) planet.holder.remove(o);
    planet.orbits = [];
    planet.extras = [];
    planet.spin = ORBIT.spin;
    // A little darker than on the map, so the ships and the fire stand out against it.
    if (planet.surface) planet.surface.uniforms.uDim.value = ORBIT.light;
    const globe = planet.body.children[0] as THREE.Mesh | undefined;
    const r = globe?.geometry instanceof THREE.SphereGeometry ? globe.geometry.parameters.radius : ORBIT.radius;
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.035, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(planetPalette(pl.resource).line) } },
        vertexShader: `varying vec3 vN; varying vec3 vV;
          void main() { vec4 p = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-p.xyz); gl_Position = projectionMatrix * p; }`,
        fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
          void main() { float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(uColor * f * 1.4, f); }`,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    planet.holder.add(glow);
    planet.holder.position.set(0, -r - ORBIT.below, -ORBIT.behind);
    // Tipped towards the camera, so it shows its face rather than its pole.
    planet.holder.rotation.x = ORBIT.tilt;
    this.planet = planet;
    this.scene.add(planet.holder);
  }

  /** Stops drawing (the battle window is closed). */
  hide(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.fx.clear();
    this.rollKey = '';
    this.shown = null;
  }

  private pickAt(e: { clientX: number; clientY: number }): BattlePick | null {
    if (!this.canPick) return null;
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    for (const h of this.ray.intersectObjects(this.forces.children, true)) {
      if (!(h.object as THREE.Mesh).isMesh) continue;
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) {
        const p = o.userData.pick as BattlePick | undefined;
        if (p && this.canPick(p)) return p;
      }
    }
    return null;
  }

  private buildForces(scene: BattleScene): void {
    this.forces.traverse((o) => {
      if ((o as THREE.Points).isPoints) (o as THREE.Points).geometry.dispose();
    });
    this.forces.clear();
    this.pieces = noPieces();
    const can = scene.canPick;
    const ring = (x: number, y: number, z: number, size: number, pick: BattlePick) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(size, size + 0.07, 40), new THREE.MeshBasicMaterial({ color: '#5fd4e6', transparent: true, opacity: 0.9, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.userData.pulse = true;
      // The whole disc inside the ring takes the click too (invisible), so a piece is easy to hit.
      const disc = new THREE.Mesh(new THREE.CircleGeometry(size + 0.07, 32), new THREE.MeshBasicMaterial({ visible: false }));
      disc.userData.pick = pick;
      m.add(disc);
      this.forces.add(m);
    };
    // One ship's footprint at this scale, so the formation spaces them without overlapping.
    const size = this.shipSize(scene.attackerSeat);
    const spacing = { front: 1.35 + size.x / 2, gapX: size.x + 0.3, gapZ: Math.max(0.8, size.z + 0.45), perLine: 3 };
    const farthest = { attacker: spacing.front, defender: spacing.front };
    const fleet = (seat: number, st: BattleAfter['attacker'], side: Side) => {
      // The attacker on the left with its noses (−X on the models) turned right, the defender facing it.
      const dir = side === 'attacker' ? -1 : 1;
      for (const at of fleetFormation(Math.min(st.fresh, 8), Math.min(st.damaged, 8), spacing)) {
        const kind = at.damaged ? 'damaged' : 'fresh';
        const o = piece('ship', seat, { lying: at.damaged });
        const x = dir * at.x;
        o.position.set(x, 0, at.z);
        o.scale.setScalar(PIECE_SCALE);
        o.rotation.y = side === 'attacker' ? Math.PI : 0;
        const pick: BattlePick = { side, ship: kind };
        o.userData.pick = pick;
        this.forces.add(o);
        this.pieces[side][kind].push(o);
        farthest[side] = Math.max(farthest[side], at.x);
        // The ring circles the ship at the height it floats, so it reads as that ship's.
        if (can?.(pick)) ring(x, SHIP_RING_Y, at.z, Math.max(0.42, size.x * 0.5), pick);
      }
    };
    fleet(scene.attackerSeat, scene.after.attacker, 'attacker');
    fleet(scene.defenderSeat, scene.after.defender, 'defender');
    // Each side's buildings stand behind its own last line of ships; a third seat's at the back, between them.
    const behind = { attacker: farthest.attacker + size.x / 2 + 0.75, defender: farthest.defender + size.x / 2 + 0.75 };
    const count = { attacker: 0, defender: 0, other: 0 };
    scene.buildings.forEach((b, i) => {
      const state = scene.after.buildings[i];
      if (state === 'destroyed') {
        this.pieces.buildings.push(null);
        return;
      }
      const o = piece(b.type, b.owner, { damaged: state === 'damaged' });
      const whose = b.owner === scene.defenderSeat ? 'defender' : b.owner === scene.attackerSeat ? 'attacker' : 'other';
      const k = count[whose]++;
      let x: number;
      let z: number;
      if (whose === 'other') {
        x = (k - 0.5) * 1.1;
        z = -2.4;
      } else {
        x = (whose === 'attacker' ? -1 : 1) * (behind[whose] + Math.floor(k / 3) * 0.95);
        z = ((k % 3) - 1) * 1.05;
      }
      o.position.set(x, 0, z);
      o.scale.setScalar(PIECE_SCALE);
      const pick: BattlePick = { building: i };
      o.userData.pick = pick;
      this.forces.add(o);
      this.pieces.buildings.push(o);
      if (can?.(pick)) ring(x, 0.02, z, 0.62, pick);
    });
  }

  /** A ship's footprint in this view (its meshes only, not its lights or smoke), measured once. */
  private shipFoot: THREE.Vector3 | null = null;
  private shipSize(seat: number): THREE.Vector3 {
    if (this.shipFoot) return this.shipFoot;
    const o = piece('ship', seat);
    o.updateMatrixWorld(true);
    const box = new THREE.Box3();
    o.traverse((x) => {
      if ((x as THREE.Mesh).isMesh) box.expandByObject(x);
    });
    const size = box.isEmpty() ? new THREE.Vector3(0.5, 0.2, 0.25) : box.getSize(new THREE.Vector3());
    // Only keep it once the owner's model has loaded (the stand-in shape is a different size).
    if (o.userData.model) this.shipFoot = size.multiplyScalar(PIECE_SCALE);
    return size.clone().multiplyScalar(o.userData.model ? 1 : PIECE_SCALE);
  }

  /** Where shots aim at a piece. */
  private aim(o: THREE.Object3D, building: boolean): THREE.Vector3 {
    return o.position.clone().add(new THREE.Vector3(0, building ? BUILDING_AIM_Y : SHIP_RING_Y, 0));
  }

  private pickOne<T>(list: readonly T[], r: () => number): T | null {
    return list.length ? list[Math.floor(r() * list.length) % list.length] : null;
  }

  private ships(p: Pieces, side: Side): THREE.Object3D[] {
    return [...p[side].fresh, ...p[side].damaged];
  }

  /** The defender's buildings on screen. */
  private defenderBuildings(p: Pieces): THREE.Object3D[] {
    return p.buildings.filter((o, i): o is THREE.Object3D => !!o && this.buildingOwners[i] === this.seats.defender);
  }

  /**
   * Who fires for `side`, and from where: one of its ships, from its nose and
   * its two wings; or (a defender with no ships left) one of its buildings,
   * from its top.
   */
  private gun(p: Pieces, side: Side, r: () => number): { muzzles: THREE.Vector3[] } | null {
    const ships = this.ships(p, side);
    if (ships.length) return { muzzles: this.muzzles(this.pickOne(ships, r)!, side) };
    const blds = side === 'defender' ? this.defenderBuildings(p) : [];
    return blds.length ? { muzzles: [this.aim(this.pickOne(blds, r)!, true).add(new THREE.Vector3(0, 0.25, 0))] } : null;
  }

  /** A ship's guns in the scene: the tip of its nose, then the front of each wing. */
  private muzzles(o: THREE.Object3D, side: Side): THREE.Vector3[] {
    const foot = this.shipFoot ?? new THREE.Vector3(1.05, 0.4, 0.5);
    // The attacker faces right (+X), the defender left.
    const f = side === 'attacker' ? 1 : -1;
    const c = this.aim(o, false);
    const half = foot.x / 2;
    const wing = foot.z * 0.42;
    return [
      c.clone().add(new THREE.Vector3(f * half * 0.95, 0, 0)),
      c.clone().add(new THREE.Vector3(f * half * 0.3, 0, wing)),
      c.clone().add(new THREE.Vector3(f * half * 0.3, 0, -wing)),
    ];
  }

  /** A wing to launch a missile from (the only muzzle when there is one). */
  private wing(m: readonly THREE.Vector3[], r: () => number): THREE.Vector3 {
    return m.length > 1 ? m[1 + Math.floor(r() * 2) % (m.length - 1)] : m[0];
  }

  /** The opening exchange of fire, shot by shot. */
  private volley(shots: readonly Shot[]): void {
    const r = rng(hash(this.rollKey) % 100000);
    const p = this.pieces;
    for (const s of shots) {
      const foe: Side = s.from === 'attacker' ? 'defender' : 'attacker';
      const gun = this.gun(p, s.from, r);
      const blds = this.defenderBuildings(p);
      const foeShips = this.ships(p, foe);
      const onBuilding = s.from === 'attacker' && blds.length > 0 && (s.at === 'building' || !foeShips.length);
      const target = onBuilding ? this.pickOne(blds, r) : this.pickOne(foeShips, r);
      if (!gun || !target) continue;
      const to = this.aim(target, onBuilding);
      const colour = shotColour(s.from === 'attacker' ? this.seats.attacker : this.seats.defender);
      // Lasers in bursts from the nose and wings; missiles from a wing; the tractor beam from the nose.
      if (s.weapon === 'laser') this.fx.burst(gun.muzzles, to, colour, s.delay, s.hit, BLAST.volley, BURST.volley);
      else if (s.weapon === 'missile') this.fx.missile(this.wing(gun.muzzles, r), to, s.delay, s.hit, BLAST.volley);
      else this.fx.tractor(gun.muzzles[0], to, s.delay);
    }
  }

  /** Shoots at each piece just hit: a laser or missile, then a blast; a destroyed piece blows apart. */
  private strike(events: readonly HitEvent[], before: Pieces): void {
    const r = rng(hash(this.rollKey + events.length) % 100000);
    const now = this.pieces;
    events.forEach((e, j) => {
      const delay = 0.05 + j * HIT_GAP;
      const shooter: Side = e.piece === 'attacker' ? 'defender' : 'attacker';
      const isBld = e.piece === 'building';
      const destroyed = e.to === 'destroyed';
      let target: THREE.Object3D | null | undefined;
      if (e.piece === 'building') target = destroyed ? before.buildings[e.index] : now.buildings[e.index];
      else target = destroyed ? before[e.piece][e.was ?? 'damaged'][e.index] : now[e.piece].damaged[e.index];
      if (!target) return;
      const to = this.aim(target, isBld);
      const size = isBld ? (destroyed ? BLAST.buildingDestroyed : BLAST.buildingDamaged) : destroyed ? BLAST.shipDestroyed : BLAST.shipDamaged;
      const gun = this.gun(now, shooter, r);
      // The shot carries no blast of its own: the piece's blast below lands with it, sized to what happens.
      let flight = 0;
      if (gun) {
        if (destroyed || isBld) flight = this.fx.missile(this.wing(gun.muzzles, r), to, delay, true, size, false);
        else flight = this.fx.burst(gun.muzzles, to, shotColour(shooter === 'attacker' ? this.seats.attacker : this.seats.defender), delay, true, 0, BURST.strike);
      }
      const impact = delay + flight;
      this.fx.explosion(to, impact, size);
      if (destroyed) {
        // The piece stays, shaking, until the shot lands; then it flies apart.
        this.fx.hold(target, impact);
        const seat = isBld ? this.buildingOwners[e.index] : e.piece === 'attacker' ? this.seats.attacker : this.seats.defender;
        this.fx.debris(to, SEAT_PAINT[seatColor(seat) % SEAT_PAINT.length], impact, isBld ? 18 : 14);
      }
    });
  }

  /** Backs the camera off just enough to show every piece, centred on them (only ever widening within a roll). */
  private fitCamera(): void {
    const box = new THREE.Box3();
    this.forces.updateMatrixWorld(true);
    this.forces.traverse((x) => {
      if ((x as THREE.Mesh).isMesh) box.expandByObject(x);
    });
    let minX = Math.min(-1.3, box.isEmpty() ? -3 : box.min.x);
    let maxX = Math.max(1.3, box.isEmpty() ? 3 : box.max.x);
    if (this.fitX) {
      if (minX >= this.fitX[0] && maxX <= this.fitX[1]) return;
      minX = Math.min(minX, this.fitX[0]);
      maxX = Math.max(maxX, this.fitX[1]);
    }
    this.fitX = [minX, maxX];
    const cx = (minX + maxX) / 2;
    const half = (maxX - minX) / 2 + 0.7;
    const tanH = Math.tan(((this.camera.fov / 2) * Math.PI) / 180) * this.camera.aspect;
    const dist = Math.max(6.2, half / tanH);
    const dir = new THREE.Vector3(0, 3.6, 5.2).normalize();
    this.camera.position.set(cx, 0.35, -0.1).addScaledVector(dir, dist);
    this.camera.lookAt(cx, 0.35, -0.1);
    this.camBase.copy(this.camera.position);
  }

  private step(sec: number): void {
    this.clock = sec;
    // Laid out with the stand-in ship's size: once the owner's model is in, lay out and frame again.
    // Pieces load their models late: a few times a second, widen the framing if they grew.
    if (this.last && Math.floor(sec * 4) !== Math.floor((sec - 0.016) * 4)) {
      if (!this.shipFoot) {
        this.shipSize(this.last.attackerSeat);
        if (this.shipFoot) {
          this.buildForces(this.last);
          this.fitX = null;
        }
      }
      this.fitCamera();
    }
    this.fx.update(sec);
    if (this.planet) {
      // The planet stays to its side of the fleets and turns slowly.
      this.planet.holder.position.x = this.camBase.x + this.planetSide;
      turnPlanets([this.planet], sec);
    }
    const sh = this.fx.shake;
    this.camera.position.set(this.camBase.x + (Math.random() - 0.5) * sh, this.camBase.y + (Math.random() - 0.5) * sh, this.camBase.z + (Math.random() - 0.5) * sh * 0.5);
    const pulse = 0.55 + 0.4 * Math.sin(sec * 4);
    for (const o of this.forces.children) {
      if (o.userData.pulse) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = this.motion ? pulse : 0.9;
      const fl = o.userData.float as { phase: number; base: number } | undefined;
      const body = o.userData.body as THREE.Object3D | undefined;
      if (fl && body && this.motion) body.position.y = fl.base + 0.025 * Math.sin(sec * 1.9 + fl.phase);
    }
  }
}
