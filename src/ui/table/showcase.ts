// ?view=pieces: every wooden piece model in every seat colour on a table, to
// look at them closely (drag to turn, wheel to zoom). Fresh and damaged ships
// side by side. Display only, no game.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pickLang, translator } from '../../i18n';
import { createRenderer, drawRatio, gpu } from './gpu';
import { loadKitPieces, piece } from './kitpieces';
import { paintedWood, SEAT_PAINT } from './pieces3d';
import type { PieceKind } from './pieces3d';
import './table.css';

/** Columns of the showcase, left to right: a piece kind and how it is placed. */
const COLUMNS: { kind: PieceKind; lying?: boolean; damaged?: boolean; label: string }[] = [
  { kind: 'ship', label: 'piece.ship' },
  { kind: 'ship', lying: true, label: 'piece.shipDamaged' },
  { kind: 'flagship', label: 'piece.flagship' },
  { kind: 'flagship', lying: true, label: 'piece.flagshipDamaged' },
  { kind: 'agent', label: 'piece.agent' },
  { kind: 'city', label: 'piece.city' },
  { kind: 'city', damaged: true, label: 'piece.cityDamaged' },
  { kind: 'starport', label: 'piece.starport' },
];

/** Mounts the showcase into `root`. */
export function mountPieces(root: HTMLElement): void {
  const params = new URLSearchParams(location.search);
  const t = translator(pickLang(location.search, navigator.language));
  const motion = params.get('motion') !== 'off';
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'tbl pieces-show';
  root.appendChild(wrap);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = createRenderer({ antialias: true });
  } catch {
    wrap.textContent = 'WebGL';
    return;
  }
  renderer.setPixelRatio(drawRatio(window.devicePixelRatio));
  renderer.shadowMap.enabled = !gpu.lite;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  wrap.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0e18');
  scene.add(new THREE.HemisphereLight('#dfe8ff', '#302418', 1.1));
  const lamp = new THREE.DirectionalLight('#fff1dc', 2.4);
  lamp.position.set(-3, 6, 4);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  Object.assign(lamp.shadow.camera, { left: -4, right: 4, top: 3, bottom: -3 });
  lamp.shadow.camera.updateProjectionMatrix();
  scene.add(lamp);
  const table = new THREE.Mesh(new THREE.PlaneGeometry(20, 12), paintedWood('#3b2b1f'));
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  const turn = new THREE.Group();
  scene.add(turn);
  const dx = 0.82;
  const dz = 0.62;
  const fill = () => {
    turn.clear();
    COLUMNS.forEach((c, i) => {
      SEAT_PAINT.forEach((_, seat) => {
        const o = piece(c.kind, seat, { lying: c.lying, damaged: c.damaged });
        o.position.set((i - (COLUMNS.length - 1) / 2) * dx, 0, (seat - 1.5) * dz);
        if (c.kind !== 'city' && c.kind !== 'starport') o.rotation.y = -0.5;
        o.scale.setScalar(o.userData.kit ? 1 : 1.4);
        turn.add(o);
      });
    });
  };
  fill();
  // The kit's shapes replace our own once their pictures are cut.
  void loadKitPieces().then((any) => any && fill());

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  camera.position.set(0, 3.4, 5.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.1, 0);
  controls.update();

  const labels = document.createElement('ol');
  labels.className = 'pieces-labels';
  labels.innerHTML = COLUMNS.map((c) => `<li>${t(c.label)}</li>`).join('');
  wrap.appendChild(labels);

  const size = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', size);
  size();

  // Optional slow turn (?spin=1), never with ?motion=off.
  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((ms) => {
    timer.update(ms);
    if (motion && params.get('spin') === '1') turn.rotation.y += Math.min(timer.getDelta(), 0.1) * 0.25;
    renderer.render(scene, camera);
  });
}
