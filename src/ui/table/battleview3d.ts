// The battle view's 3D scene: the attacker's ships on the left facing the
// defender's ships and buildings on the right, as the owner's models; the
// rolled dice tumble into a tray between them and settle on the faces the
// engine rolled (official face pictures, assets/ui/dice). While the attacker
// assigns hits, every piece that can take one has a ring under it and a click
// on it reports which piece (onPick). Damaged pieces burn; destroyed ones are
// left out. One renderer, created on the first battle and reused.

import * as THREE from 'three';
import type { DieFace, DieType } from '../../game/engine';
import { assetUrl } from './assets';
import type { BattleAfter, BattlePick } from './battle';
import { facePicture } from './battle';
import { piece } from './kitpieces';
import { easeInOut, rng } from './model-fx';

/** Size of the 3D view in the battle window, in CSS pixels. */
export const BATTLE_VIEW = { w: 1180, h: 520 } as const;

/** One rolled die: its type, its faces in content order, and which one came up. */
export interface RolledDie {
  type: DieType;
  faces: readonly DieFace[];
  index: number;
}

/** What the view shows. `rollKey` changes when the dice are (re)rolled, which throws them again. */
export interface BattleScene {
  attackerSeat: number;
  defenderSeat: number;
  after: BattleAfter;
  buildings: { owner: number; type: 'city' | 'starport' }[];
  dice: readonly RolledDie[];
  rollKey: string;
  /** Whether a piece can take a hit now (null: nothing can be clicked). */
  canPick: ((p: BattlePick) => boolean) | null;
}

/** Scale of the pieces in this close view, against their size on the board. */
const PIECE_SCALE = 2.1;
const DIE_SIZE = 0.42;
/** Height of a floating ship's body in this view (its hover times PIECE_SCALE). */
const SHIP_RING_Y = 0.3;
const ROLL_SECONDS = 1.3;
const DIE_COLOURS: Record<DieType, string> = { skirmish: '#11a3c8', assault: '#a82a2a', raid: '#e0702a' };

const textureCache = new Map<string, THREE.Texture>();

function faceTexture(type: DieType, face: DieFace): THREE.Texture {
  const key = facePicture(type, face);
  const url = key ? assetUrl(key) : null;
  const id = url ?? `${type}:${JSON.stringify(face)}`;
  const hit = textureCache.get(id);
  if (hit) return hit;
  let tex: THREE.Texture;
  if (url) tex = new THREE.TextureLoader().load(url);
  else {
    // No picture: the die's colour with its symbols written out.
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d')!;
    g.fillStyle = DIE_COLOURS[type];
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff';
    g.font = 'bold 20px sans-serif';
    g.textAlign = 'center';
    Object.entries(face).forEach(([k, n], i) => g.fillText(`${k} ${n}`, 64, 50 + i * 24));
    tex = new THREE.CanvasTexture(cv);
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textureCache.set(id, tex);
  return tex;
}

/** Turn that brings box face `k` (three.js order +X, −X, +Y, −Y, +Z, −Z) to the top. */
function faceUp(k: number): THREE.Quaternion {
  const e = [
    new THREE.Euler(0, 0, Math.PI / 2),
    new THREE.Euler(0, 0, -Math.PI / 2),
    new THREE.Euler(0, 0, 0),
    new THREE.Euler(Math.PI, 0, 0),
    new THREE.Euler(-Math.PI / 2, 0, 0),
    new THREE.Euler(Math.PI / 2, 0, 0),
  ][k];
  return new THREE.Quaternion().setFromEuler(e);
}

interface DieAnim {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  spinAxis: THREE.Vector3;
  end: THREE.Quaternion;
}

export class BattleView3D {
  readonly canvas: HTMLCanvasElement;
  /** Called with the piece clicked while hits are being assigned. */
  onPick: ((p: BattlePick) => void) | null = null;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, BATTLE_VIEW.w / BATTLE_VIEW.h, 0.1, 100);
  private readonly forces = new THREE.Group();
  private readonly diceGroup = new THREE.Group();
  private readonly ray = new THREE.Raycaster();
  private dice: DieAnim[] = [];
  private rollKey = '';
  private rollStart: number | null = null;
  private raf = 0;
  private canPick: BattleScene['canPick'] = null;

  constructor(private readonly motion: boolean) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(BATTLE_VIEW.w, BATTLE_VIEW.h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'battle-3d';
    this.scene.background = new THREE.Color('#07080d');

    this.scene.add(new THREE.HemisphereLight('#cfd8ff', '#1a1410', 1.4));
    const lamp = new THREE.DirectionalLight('#fff1dc', 2);
    lamp.position.set(-3, 7, 5);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    Object.assign(lamp.shadow.camera, { left: -6, right: 6, top: 4, bottom: -4, near: 1, far: 20 });
    this.scene.add(lamp);
    const rim = new THREE.DirectionalLight('#7fb6ff', 0.8);
    rim.position.set(4, 3, -5);
    this.scene.add(rim);

    // Deep space behind, a dark floor that takes shadows, and the dice tray in the middle.
    const stars = new THREE.BufferGeometry();
    const r = rng(11);
    stars.setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 900 }, () => [(r() - 0.5) * 40, r() * 14 - 1, -8 - r() * 10]).flat(), 3));
    this.scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: '#c9d6ff', size: 0.05, sizeAttenuation: true })));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: '#12131a', roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 1.5), new THREE.MeshStandardMaterial({ color: '#2a1d12', roughness: 0.8 }));
    tray.position.y = 0.04;
    tray.receiveShadow = true;
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.3), new THREE.MeshStandardMaterial({ color: '#1d3a2f', roughness: 1 }));
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 0.081;
    felt.receiveShadow = true;
    this.scene.add(tray, felt, this.forces, this.diceGroup);

    this.camera.position.set(0.55, 3.6, 5.9);
    this.camera.lookAt(0.55, 0.35, -0.1);

    this.canvas.addEventListener('pointermove', (e) => {
      this.canvas.style.cursor = this.pickAt(e) ? 'pointer' : 'default';
    });
    this.canvas.addEventListener('click', (e) => {
      const p = this.pickAt(e);
      if (p) this.onPick?.(p);
    });
  }

  /** Shows `scene`; throws the dice again when its rollKey is new. */
  update(scene: BattleScene): void {
    this.canPick = scene.canPick;
    this.buildForces(scene);
    if (scene.rollKey !== this.rollKey) {
      this.rollKey = scene.rollKey;
      this.buildDice(scene.dice);
      this.rollStart = null;
    }
    cancelAnimationFrame(this.raf);
    const tick = (t: number) => {
      this.step(t / 1000);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Stops drawing (the battle window is closed). */
  hide(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private pickAt(e: MouseEvent): BattlePick | null {
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
    const can = scene.canPick;
    const ring = (x: number, y: number, z: number, size: number) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(size, size + 0.07, 40), new THREE.MeshBasicMaterial({ color: '#5fd4e6', transparent: true, opacity: 0.9, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.userData.pulse = true;
      this.forces.add(m);
    };
    const fleet = (seat: number, st: BattleAfter['attacker'], side: 'attacker' | 'defender') => {
      const dir = side === 'attacker' ? -1 : 1;
      const ships: ('fresh' | 'damaged')[] = [...Array<'fresh'>(Math.min(st.fresh, 8)).fill('fresh'), ...Array<'damaged'>(Math.min(st.damaged, 8)).fill('damaged')];
      ships.forEach((kind, i) => {
        const o = piece('ship', seat, { lying: kind === 'damaged' });
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = dir * (1.75 + row * 0.95 + (col % 2) * 0.2);
        const z = -0.9 + col * 0.9;
        o.position.set(x, 0, z);
        o.scale.setScalar(PIECE_SCALE);
        // The models' nose is −X: the attacker faces right, the defender left.
        o.rotation.y = side === 'attacker' ? Math.PI : 0;
        const pick: BattlePick = { side, ship: kind };
        o.userData.pick = pick;
        this.forces.add(o);
        // The ring circles the ship at the height it floats, so it reads as that ship's.
        if (can?.(pick)) ring(x, SHIP_RING_Y, z, 0.5);
      });
    };
    fleet(scene.attackerSeat, scene.after.attacker, 'attacker');
    fleet(scene.defenderSeat, scene.after.defender, 'defender');
    // The defender's buildings stand behind its ships; other seats' buildings further back.
    let k = 0;
    scene.buildings.forEach((b, i) => {
      const state = scene.after.buildings[i];
      if (state === 'destroyed') return;
      const o = piece(b.type, b.owner, { damaged: state === 'damaged' });
      const x = 3.9 + (k % 2) * 0.9;
      const z = -1.3 + Math.floor(k / 2) * 1.1;
      k++;
      o.position.set(x, 0, z);
      o.scale.setScalar(PIECE_SCALE);
      const pick: BattlePick = { building: i };
      o.userData.pick = pick;
      this.forces.add(o);
      if (can?.(pick)) ring(x, 0.02, z, 0.62);
    });
  }

  private buildDice(dice: readonly RolledDie[]): void {
    for (const d of this.dice) {
      d.mesh.geometry.dispose();
      for (const m of d.mesh.material as THREE.Material[]) m.dispose();
    }
    this.diceGroup.clear();
    const r = rng(this.rollKey.length * 977 + dice.length);
    const cols = Math.min(dice.length, 5);
    this.dice = dice.map((d, i) => {
      const mats = d.faces.slice(0, 6).map((f) => new THREE.MeshStandardMaterial({ map: faceTexture(d.type, f), roughness: 0.45 }));
      while (mats.length < 6) mats.push(new THREE.MeshStandardMaterial({ color: DIE_COLOURS[d.type] }));
      const geo = new THREE.BoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE);
      const mesh = new THREE.Mesh(geo, mats);
      mesh.castShadow = true;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const to = new THREE.Vector3((col - (cols - 1) / 2) * 0.5 + (r() - 0.5) * 0.08, 0.08 + DIE_SIZE / 2, -0.3 + row * 0.55 + (r() - 0.5) * 0.08);
      const from = new THREE.Vector3(-2.6 + r() * 0.4, 1.6 + r() * 0.5, 0.8 + r() * 0.4);
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (r() - 0.5) * 0.7);
      const end = yaw.multiply(faceUp(Math.min(5, d.index)));
      const spinAxis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      this.diceGroup.add(mesh);
      return { mesh, from, to, spinAxis, end };
    });
    if (!this.motion) for (const d of this.dice) this.place(d, 1);
  }

  /** A die at progress `p` (0..1) of its throw: an arc with two bounces, spinning down to its rolled face. */
  private place(d: DieAnim, p: number): void {
    const e = easeInOut(p);
    const pos = d.from.clone().lerp(d.to, 1 - (1 - p) * (1 - p));
    const bounce = Math.abs(Math.cos(p * Math.PI * 2.5)) * (1 - p) * (1 - p) * 1.4;
    pos.y = d.to.y + bounce + (1 - p) * (d.from.y - d.to.y) * (1 - p);
    d.mesh.position.copy(pos);
    const spin = new THREE.Quaternion().setFromAxisAngle(d.spinAxis, (1 - e) * Math.PI * 6);
    d.mesh.quaternion.copy(spin.multiply(d.end));
  }

  private step(sec: number): void {
    if (this.motion && this.dice.length) {
      this.rollStart ??= sec;
      const p = Math.min(1, (sec - this.rollStart) / ROLL_SECONDS);
      for (const d of this.dice) this.place(d, p);
    }
    const pulse = 0.55 + 0.4 * Math.sin(sec * 4);
    for (const o of this.forces.children) {
      if (o.userData.pulse) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = this.motion ? pulse : 0.9;
      const fl = o.userData.float as { phase: number; base: number } | undefined;
      const body = o.userData.body as THREE.Object3D | undefined;
      if (fl && body && this.motion) body.position.y = fl.base + 0.025 * Math.sin(sec * 1.9 + fl.phase);
    }
  }
}
