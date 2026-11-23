// Battle effects for the 3D battle view: laser bolts, missiles with smoke
// trails, tractor beams, explosions (flash, fireball, sparks, shock ring,
// smoke, a flash of light) and flying debris. Each effect is scheduled a few
// seconds ahead, runs on the view's clock, and removes and frees itself.

import * as THREE from 'three';

/** Lengths of the effects, in seconds. */
const FX = { boltSpeed: 11, boltLength: 0.7, missile: 0.62, tractor: 0.7, flash: 0.4, fireball: 0.95, sparks: 0.9, smoke: 1.7, debris: 1.9 } as const;

let glow: THREE.Texture | null = null;
/** A soft round spot, white in the middle, fading out: the base of every glow. */
function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(cv);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

interface Fx {
  t0: number;
  dur: number;
  obj: THREE.Object3D;
  /** Progress 0..1 and the frame's length in seconds. */
  tick(p: number, dt: number): void;
  /** Called once, on the first frame the effect is live. */
  start?: () => void;
  started?: boolean;
  /** Frees what the effect created (never shared pieces). */
  free?: () => void;
  /** Leave `obj` in the scene graph's hands when done (a piece borrowed from the view). */
  borrowed?: boolean;
}

function sprite(color: THREE.ColorRepresentation, additive = true, opacity = 1): THREE.Sprite {
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
}

const UP = new THREE.Vector3(0, 1, 0);

/** The effects layer: add `group` to the scene and call `update` every frame. */
export class BattleFx {
  readonly group = new THREE.Group();
  /** How hard the camera shakes now (decays by itself). */
  shake = 0;
  private list: Fx[] = [];
  private now = 0;
  private readonly r: () => number;

  /** `seed` varies the scatter of sparks and debris; `now` is the view's clock at creation (seconds). */
  constructor(seed = 1, now = 0) {
    this.now = now;
    let x = seed >>> 0 || 1;
    this.r = () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
  }

  /** Drops every effect at once. */
  clear(): void {
    for (const f of this.list) this.drop(f);
    this.list = [];
    this.shake = 0;
  }

  /** Advances every effect to time `sec` (the view's clock). */
  update(sec: number): void {
    const dt = Math.min(0.05, Math.max(0, sec - this.now));
    this.now = sec;
    const cur = this.list;
    // Effects started from inside a tick (trails, sparks) land in the fresh list.
    this.list = [];
    const keep: Fx[] = [];
    for (const f of cur) {
      const p = (sec - f.t0) / f.dur;
      if (p < 0) {
        if (!f.borrowed) f.obj.visible = false;
        keep.push(f);
        continue;
      }
      if (!f.started) {
        f.started = true;
        f.start?.();
      }
      if (p >= 1) {
        this.drop(f);
        continue;
      }
      f.obj.visible = true;
      f.tick(p, dt);
      keep.push(f);
    }
    this.list = [...keep, ...this.list];
    this.shake *= Math.pow(0.02, dt);
  }

  private add(f: Fx): void {
    if (!f.borrowed) f.obj.visible = false;
    this.group.add(f.obj);
    this.list.push(f);
  }

  private drop(f: Fx): void {
    this.group.remove(f.obj);
    f.free?.();
  }

  /** A sprite that grows from `s0` to `s1` and fades out. */
  private puff(at: THREE.Vector3, delay: number, dur: number, color: THREE.ColorRepresentation, s0: number, s1: number, o: { additive?: boolean; opacity?: number; drift?: THREE.Vector3 } = {}): void {
    const sp = sprite(color, o.additive ?? true, o.opacity ?? 1);
    sp.position.copy(at);
    sp.scale.setScalar(s0);
    const base = o.opacity ?? 1;
    const drift = o.drift;
    this.add({
      t0: this.now + delay,
      dur,
      obj: sp,
      tick: (p, dt) => {
        sp.scale.setScalar(s0 + (s1 - s0) * (1 - (1 - p) * (1 - p)));
        sp.material.opacity = base * (1 - p);
        if (drift) sp.position.addScaledVector(drift, dt);
      },
      free: () => sp.material.dispose(),
    });
  }

  /**
   * A laser bolt flying from `from` to `to` after `delay` seconds. On a hit it
   * bursts on the hull: sparks and an explosion of `blast` (0: sparks only).
   * Returns the time from firing to impact, in seconds.
   */
  laser(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, delay: number, hit: boolean, blast = 0.4): number {
    const end = hit ? to.clone() : this.miss(from, to);
    const dir = end.clone().sub(from);
    const len = dir.length();
    const flight = Math.max(0.12, len / FX.boltSpeed);
    const bolt = Math.min(FX.boltLength, len * 0.5);
    const beam = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const haloMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 6, 1, true), coreMat);
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 8, 1, true), haloMat);
    beam.add(core, halo);
    beam.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    this.add({
      t0: this.now + delay,
      dur: flight,
      obj: beam,
      tick: (p) => {
        // The bolt's head runs from the gun to the target; its tail follows a bolt's length behind.
        const head = p * len;
        const tail = Math.max(0, head - bolt);
        beam.position.copy(from).addScaledVector(dir, (head + tail) / 2 / len);
        beam.scale.set(1, Math.max(0.001, head - tail), 1);
      },
      free: () => {
        core.geometry.dispose();
        halo.geometry.dispose();
        coreMat.dispose();
        haloMat.dispose();
      },
    });
    this.puff(from, delay, 0.18, color, 0.45, 0.05);
    if (hit) {
      this.puff(end, delay + flight, 0.3, '#ffffff', 0.2, 0.7);
      this.puff(end, delay + flight, 0.45, color, 0.35, 1.1, { opacity: 0.85 });
      this.sparks(end, delay + flight, 10, 1.8, color);
      if (blast > 0) this.explosion(end, delay + flight, blast);
    }
    return flight;
  }

  /**
   * A burst of `count` laser bolts at `to`, fired in turn from each of
   * `muzzles` (the nose and the wings), `gap` seconds apart, each aimed a little
   * off the last. Every bolt that hits sparks on the hull; the last one also
   * explodes with `blast`. Returns the time from `delay` to the last impact.
   */
  burst(muzzles: readonly THREE.Vector3[], to: THREE.Vector3, color: THREE.ColorRepresentation, delay: number, hit: boolean, blast: number, count = 3, gap = 0.08): number {
    let last = 0;
    for (let i = 0; i < count; i++) {
      const from = muzzles[i % muzzles.length];
      const at = to.clone().add(new THREE.Vector3((this.r() - 0.5) * 0.14, (this.r() - 0.5) * 0.1, (this.r() - 0.5) * 0.14));
      const flight = this.laser(from, at, color, delay + i * gap, hit, i === count - 1 ? blast : 0);
      last = i * gap + flight;
    }
    return last;
  }

  /**
   * A missile from `from` curving to `to`, with a smoke trail; on a hit it
   * explodes (of `size`) unless `blast` is false. Returns its flight time.
   */
  missile(from: THREE.Vector3, to: THREE.Vector3, delay: number, hit: boolean, size = 0.5, blast = true): number {
    const end = hit ? to.clone() : this.miss(from, to);
    const side = new THREE.Vector3().subVectors(end, from).cross(UP).normalize().multiplyScalar((this.r() - 0.5) * 1.6);
    const ctrl = from.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.7 + this.r() * 0.5, 0)).add(side);
    const curve = new THREE.QuadraticBezierCurve3(from.clone(), ctrl, end);
    const head = sprite('#ffb347', true, 1);
    head.scale.setScalar(0.24);
    head.position.copy(from);
    let trailClock = 0;
    this.add({
      t0: this.now + delay,
      dur: FX.missile,
      obj: head,
      tick: (p, dt) => {
        head.position.copy(curve.getPoint(Math.min(1, p * p * (1.6 - 0.6 * p))));
        head.scale.setScalar(0.2 + 0.06 * Math.sin(p * 60));
        trailClock += dt;
        while (trailClock > 0.016) {
          trailClock -= 0.016;
          this.puff(head.position.clone(), 0, 0.5, '#9a8f86', 0.1, 0.32, { additive: false, opacity: 0.45 });
          this.puff(head.position.clone(), 0, 0.12, '#ff8a2a', 0.16, 0.04);
        }
      },
      free: () => head.material.dispose(),
    });
    this.puff(from, delay, 0.2, '#ffd27a', 0.4, 0.1);
    if (hit && blast) this.explosion(end, delay + FX.missile, size);
    return FX.missile;
  }

  /** A tractor beam (a key: something is taken), pulsing from `from` to `to`. */
  tractor(from: THREE.Vector3, to: THREE.Vector3, delay: number): void {
    const dir = to.clone().sub(from);
    const mat = new THREE.MeshBasicMaterial({ color: '#7fd6ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.14, 1, 12, 1, true), mat);
    beam.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    beam.position.copy(from).addScaledVector(dir, 0.5);
    beam.scale.set(1, dir.length(), 1);
    this.add({
      t0: this.now + delay,
      dur: FX.tractor,
      obj: beam,
      tick: (p) => {
        mat.opacity = Math.sin(p * Math.PI) * (0.35 + 0.15 * Math.sin(p * 40));
      },
      free: () => {
        beam.geometry.dispose();
        mat.dispose();
      },
    });
  }

  /** An explosion of `size` (about 0.4 for a hit, 1 for a ship destroyed) at `at` after `delay`. */
  explosion(at: THREE.Vector3, delay: number, size: number): void {
    this.puff(at, delay, FX.flash, '#fff6d8', size * 0.8, size * 3.4);
    this.puff(at, delay, FX.fireball, '#ff8a2a', size * 0.9, size * 2.6);
    this.puff(at, delay + 0.04, FX.fireball * 0.9, '#ff3b0a', size * 0.6, size * 2);
    this.puff(at, delay + 0.08, FX.fireball * 0.7, '#ffe08a', size * 0.4, size * 1.3);
    // Secondary blasts around the first, for the bigger ones.
    for (let i = 0; i < Math.floor(size * 3); i++) {
      const off = new THREE.Vector3((this.r() - 0.5) * size, (this.r() - 0.3) * size * 0.6, (this.r() - 0.5) * size);
      this.puff(at.clone().add(off), delay + 0.1 + this.r() * 0.25, FX.fireball * 0.7, '#ff6a1a', size * 0.3, size * 1.3);
    }
    this.sparks(at, delay, Math.round(10 + size * 22), 2.2 + size * 2.4, '#ffc469');
    for (let i = 0; i < 2 + Math.round(size * 3); i++) {
      const off = new THREE.Vector3((this.r() - 0.5) * size * 0.5, (this.r() - 0.2) * size * 0.4, (this.r() - 0.5) * size * 0.5);
      const drift = new THREE.Vector3((this.r() - 0.5) * 0.4, 0.25 + this.r() * 0.3, (this.r() - 0.5) * 0.4);
      this.puff(at.clone().add(off), delay + 0.12 + this.r() * 0.15, FX.smoke * (0.7 + this.r() * 0.5), '#5d5550', size * 0.4, size * 1.6, { additive: false, opacity: 0.55, drift });
    }
    // The shock ring, lying flat, and a flash of light on the ships around.
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd7a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(at);
    this.add({
      t0: this.now + delay,
      dur: 0.6,
      obj: ring,
      tick: (p) => {
        ring.scale.setScalar(0.1 + size * 1.9 * (1 - (1 - p) * (1 - p)));
        ringMat.opacity = 0.5 * (1 - p) * (1 - p);
      },
      free: () => {
        ring.geometry.dispose();
        ringMat.dispose();
      },
    });
    const light = new THREE.PointLight('#ff9a3c', 0, 3 + size * 4, 2);
    light.position.copy(at);
    this.add({
      t0: this.now + delay,
      dur: 0.5,
      obj: light,
      start: () => {
        this.shake = Math.max(this.shake, size * 0.09);
      },
      tick: (p) => {
        light.intensity = (1 - p) * (1 - p) * 14 * size;
      },
    });
  }

  /** Pieces of hull flying apart from `at`, some tinted `color`, after `delay`. */
  debris(at: THREE.Vector3, color: THREE.ColorRepresentation, delay: number, count = 12): void {
    for (let i = 0; i < count; i++) {
      const s = 0.04 + this.r() * 0.1;
      const mat = new THREE.MeshStandardMaterial({ color: this.r() < 0.5 ? color : '#3b3936', emissive: '#ff6a1a', emissiveIntensity: 1.5, roughness: 0.6, metalness: 0.4, transparent: true });
      const m = new THREE.Mesh(new THREE.BoxGeometry(s * (1 + this.r()), s * 0.5, s * (1 + this.r() * 2)), mat);
      m.position.copy(at);
      const v = new THREE.Vector3(this.r() - 0.5, this.r() * 0.9 - 0.2, this.r() - 0.5).normalize().multiplyScalar(1.2 + this.r() * 2.2);
      const spin = new THREE.Vector3(this.r() - 0.5, this.r() - 0.5, this.r() - 0.5).multiplyScalar(14);
      this.add({
        t0: this.now + delay,
        dur: FX.debris * (0.7 + this.r() * 0.5),
        obj: m,
        tick: (p, dt) => {
          m.position.addScaledVector(v, dt);
          v.multiplyScalar(Math.pow(0.35, dt));
          m.rotation.x += spin.x * dt;
          m.rotation.y += spin.y * dt;
          m.rotation.z += spin.z * dt;
          mat.emissiveIntensity = 1.5 * Math.max(0, 1 - p * 2.5);
          mat.opacity = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
        },
        free: () => {
          m.geometry.dispose();
          mat.dispose();
        },
      });
    }
  }

  /** Keeps `obj` (a piece that is being destroyed) on screen for `secs`, shaking harder, then takes it away. */
  hold(obj: THREE.Object3D, secs: number): void {
    const base = obj.position.clone();
    this.add({
      t0: this.now,
      dur: Math.max(0.01, secs),
      obj,
      borrowed: true,
      tick: (p) => {
        const a = 0.06 * p;
        obj.position.set(base.x + (this.r() - 0.5) * a, base.y + (this.r() - 0.5) * a, base.z + (this.r() - 0.5) * a);
      },
    });
  }

  private sparks(at: THREE.Vector3, delay: number, n: number, speed: number, color: THREE.ColorRepresentation): void {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(this.r() - 0.5, this.r() - 0.4, this.r() - 0.5).normalize().multiplyScalar(speed * (0.4 + this.r() * 0.8));
      const sp = sprite(color, true, 1);
      sp.position.copy(at);
      const s = 0.05 + this.r() * 0.08;
      this.add({
        t0: this.now + delay,
        dur: FX.sparks * (0.5 + this.r() * 0.6),
        obj: sp,
        tick: (p, dt) => {
          sp.position.addScaledVector(v, dt);
          v.multiplyScalar(Math.pow(0.2, dt));
          sp.scale.setScalar(s * (1 - p * 0.6));
          sp.material.opacity = 1 - p;
        },
        free: () => sp.material.dispose(),
      });
    }
  }

  /** Where a missed shot goes: past the target, a little to the side and above. */
  private miss(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
    const dir = to.clone().sub(from);
    const side = dir.clone().cross(UP).normalize().multiplyScalar((this.r() < 0.5 ? -1 : 1) * (0.5 + this.r() * 0.4));
    return to.clone().add(dir.normalize().multiplyScalar(1.4)).add(side).add(new THREE.Vector3(0, 0.3 + this.r() * 0.3, 0));
  }
}
