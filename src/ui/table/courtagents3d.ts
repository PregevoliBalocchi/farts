// The Court card close-up's 3D agents: when the pointer rests on a Court card
// in the top strip, its large picture shows each seat's agents standing in
// front of it as the owner's agent model, in the seat's colour (models3d),
// with a "×n" label when a seat has more agents there than are drawn. One
// small transparent renderer, reused for every card.

import * as THREE from 'three';
import { createRenderer, drawRatio, gpu } from './gpu';
import { agentLayout, headingSway } from './model-fx';
import { loadModels, modelPiece } from './models3d';

/** Size of the agents' view under the zoomed card, in CSS pixels. */
export const AGENTS_VIEW = { w: 300, h: 190 } as const;

/** Agents of one seat on a card. */
export interface CardAgents {
  player: number;
  count: number;
}

export class CourtAgents3D {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(26, AGENTS_VIEW.w / AGENTS_VIEW.h, 0.1, 20);
  private readonly group = new THREE.Group();
  private raf = 0;
  private shown: CardAgents[] = [];

  constructor(private readonly motion: boolean) {
    this.renderer = createRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(drawRatio(window.devicePixelRatio));
    this.renderer.setSize(AGENTS_VIEW.w, AGENTS_VIEW.h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = !gpu.lite;
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'zoom-agents';

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#3a3530', 1.8));
    const lamp = new THREE.DirectionalLight('#fff4e4', 1.6);
    lamp.position.set(-1.5, 3, 2.5);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    Object.assign(lamp.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 8 });
    this.scene.add(lamp);
    // The ground the agents stand on: invisible, it only takes their shadows.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.45 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor, this.group);
    this.frame([0]);
  }

  /** Moves the camera as close as it can while every agent (at `xs`) stays in view. */
  private frame(xs: readonly number[]): void {
    const span = Math.max(0.5, Math.max(...xs) - Math.min(...xs) + 0.3);
    const half = Math.tan(((this.camera.fov / 2) * Math.PI) / 180) * this.camera.aspect;
    const dist = Math.max(0.95, span / 2 / half);
    this.camera.position.set(0, dist * 0.3, dist);
    this.camera.lookAt(0, 0.13, -0.05);
  }

  /** Stands `agents` in front of the card and starts drawing. */
  show(agents: readonly CardAgents[]): void {
    const mine = [...agents];
    this.shown = mine;
    this.build();
    void loadModels().then(() => {
      if (this.shown === mine) this.build();
    });
    cancelAnimationFrame(this.raf);
    const tick = (t: number) => {
      this.sway(t / 1000);
      this.renderer.render(this.scene, this.camera);
      if (this.motion) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /**
   * A still picture (PNG data URL) of `agents` standing as in the close-up, for
   * places that show many cards at once (the Court picker). Null when no model
   * is loaded. Do not use the instance that animates the close-up.
   */
  async snapshot(agents: readonly CardAgents[]): Promise<string | null> {
    if (!(await loadModels())) return null;
    cancelAnimationFrame(this.raf);
    this.shown = [...agents];
    this.build();
    this.sway(0);
    // The same framing for every card, so agents have the same size whatever their number.
    this.frame([-0.55, 0.55]);
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }

  /** Stops drawing (the card close-up is hidden). */
  hide(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private build(): void {
    this.group.traverse((o) => {
      if ((o as THREE.Sprite).isSprite) (o as THREE.Sprite).material.map?.dispose();
    });
    this.group.clear();
    const { spots, more } = agentLayout(this.shown);
    spots.forEach((s, i) => {
      const o = modelPiece('agent', s.player);
      if (!o) return;
      o.position.set(s.x, 0, s.z);
      o.userData.sway = i * 1.7;
      o.traverse((x) => {
        x.castShadow = true;
      });
      this.group.add(o);
    });
    for (const m of more) this.group.add(countLabel(m.count, m.x));
    this.frame(spots.map((p) => p.x));
    this.renderer.render(this.scene, this.camera);
  }

  /** Agents shift their weight a little, each at its own pace. */
  private sway(sec: number): void {
    for (const o of this.group.children) {
      if (o.userData.sway === undefined) continue;
      o.rotation.y = headingSway(this.motion ? sec : 0, o.userData.sway as number);
    }
  }
}

function countLabel(n: number, x: number): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 96;
  cv.height = 48;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(10,14,28,.88)';
  g.beginPath();
  g.roundRect(2, 2, 92, 44, 16);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`×${n}`, 48, 26);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(0.2, 0.1, 1);
  s.position.set(x, 0.03, 0.2);
  return s;
}
