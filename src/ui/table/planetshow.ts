// ?view=planets: every planet of the 3D map, seen from the map's angle, next
// to the same planet cut from the owner's board picture when it is present
// (assets/ui/map/board.*, git-ignored), to compare them. ?id=c5-p1 shows one
// planet large; ?cols=3 sets the columns; ?spin=0 holds them still. Display only, no game.

import * as THREE from 'three';
import { loadContent } from '../content';
import { assetUrl } from './assets';
import { createRenderer, drawRatio } from './gpu';
import calibration from './board.default.json';
import { bakePlanets, buildPlanet, turnPlanets } from './planets3d';
import type { Planet } from './planets3d';
import './table.css';

/** Width of the sheet, and of one planet shown alone, in CSS pixels (a cell is half as tall as wide). */
const SHEET_W = 1900;
const BIG = { w: 1200, h: 600 } as const;

/** Mounts the planet sheet into `root`. */
export function mountPlanets(root: HTMLElement): void {
  const params = new URLSearchParams(location.search);
  const one = params.get('id');
  const planets = loadContent().content.map.systems.filter((s) => s.kind === 'planet' && (!one || s.id === one));
  const cols = one ? 1 : Math.max(1, Number(params.get('cols')) || 6);
  const cw = Math.floor(SHEET_W / cols);
  const cell = one ? BIG : { w: cw, h: Math.floor(cw / 2) };
  const W = cols * cell.w;
  const H = Math.ceil(planets.length / cols) * cell.h;
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:relative;width:${W}px;height:${H}px;background:#07080d`;
  root.appendChild(wrap);
  document.body.style.background = '#07080d';

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = createRenderer({ antialias: true });
  } catch {
    wrap.textContent = 'WebGL';
    return;
  }
  renderer.setPixelRatio(drawRatio(window.devicePixelRatio));
  renderer.setSize(W, H);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setScissorTest(true);
  renderer.domElement.style.cssText = 'position:absolute;left:0;top:0';
  wrap.appendChild(renderer.domElement);

  const board = assetUrl('map.board');
  const discs = calibration.systems as Record<string, { disc?: { x: number; y: number; r: number } }>;
  const cells = planets.map((s, i) => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07080d');
    scene.add(new THREE.HemisphereLight('#cfd8ff', '#1a1410', 1.2));
    const sun = new THREE.DirectionalLight('#fff1dc', 2);
    sun.position.set(-3, 7, 5);
    scene.add(sun);
    const planet: Planet = buildPlanet(s.id, s.resource ?? undefined, 1);
    // ?bake=0: the live drawing, to compare with the baked one.
    if (params.get('bake') !== '0') bakePlanets(renderer, [planet], one ? 1024 : 256, one ? 3.5 : 2);
    scene.add(planet.holder);
    // Seen from above and a little in front, as the map's camera sees it.
    const camera = new THREE.PerspectiveCamera(32, cell.w / 2 / cell.h, 0.1, 50);
    camera.position.set(0, 7.2, 2.4);
    camera.lookAt(0, 0, 0);
    const x = (i % cols) * cell.w;
    const y = Math.floor(i / cols) * cell.h;
    const label = document.createElement('div');
    label.textContent = s.id;
    label.style.cssText = `position:absolute;left:${x + 6}px;top:${y + 4}px;color:#f3c463;font:700 12px sans-serif;z-index:2`;
    wrap.appendChild(label);
    const d = discs[s.id]?.disc;
    if (board && d) {
      // The board's planet, cut out at about the size of the 3D one.
      const ref = document.createElement('div');
      const k = (cell.h * 0.74) / (2 * d.r);
      ref.style.cssText = `position:absolute;left:${x + cell.w / 2}px;top:${y}px;width:${cell.w / 2}px;height:${cell.h}px;background:url(${board}) no-repeat;background-size:${calibration.width * k}px ${calibration.height * k}px;background-position:${cell.w / 4 - d.x * k}px ${cell.h / 2 - d.y * k}px`;
      wrap.appendChild(ref);
    }
    return { scene, camera, planet, x, y };
  });

  const still = params.get('spin') === '0';
  const frame = (t: number) => {
    for (const c of cells) {
      turnPlanets([c.planet], still ? 0 : t / 1000);
      renderer.setViewport(c.x, H - c.y - cell.h, cell.w / 2, cell.h);
      renderer.setScissor(c.x, H - c.y - cell.h, cell.w / 2, cell.h);
      renderer.render(c.scene, c.camera);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
