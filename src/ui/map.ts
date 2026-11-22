// Schematic map in SVG: clusters around a ring, a gate per cluster, planets
// outside it. Display only: it reads the GameState and reports clicks.

import type { ContentIndex, GameState } from '../game/engine';

const NS = 'http://www.w3.org/2000/svg';
const SIZE = 640, C = SIZE / 2, R_GATE = 96, R_PLANET = 238;

/** Player colours, as CSS variables defined in index.html. */
export const playerColor = (p: number) => `var(--p${p})`;

/** Screen position of every system, derived from cluster order and planet order. */
export function layout(ix: ContentIndex): Record<string, { x: number; y: number; gate: boolean; cluster: number }> {
  const clusters = [...new Set(ix.content.map.systems.map((s) => s.cluster))];
  const step = 360 / clusters.length;
  const out: Record<string, { x: number; y: number; gate: boolean; cluster: number }> = {};
  clusters.forEach((cl, i) => {
    const base = -90 + i * step;
    const systems = ix.content.map.systems.filter((s) => s.cluster === cl);
    const planets = systems.filter((s) => s.kind === 'planet');
    for (const s of systems) {
      if (s.kind === 'gate') {
        const a = (base * Math.PI) / 180;
        out[s.id] = { x: C + R_GATE * Math.cos(a), y: C + R_GATE * Math.sin(a), gate: true, cluster: i };
      } else {
        const k = planets.indexOf(s);
        const spread = step * 0.62;
        const deg = base - spread / 2 + (planets.length > 1 ? (k * spread) / (planets.length - 1) : spread / 2);
        const a = (deg * Math.PI) / 180;
        out[s.id] = { x: C + R_PLANET * Math.cos(a), y: C + R_PLANET * Math.sin(a), gate: false, cluster: i };
      }
    }
  });
  return out;
}

function el(name: string, attrs: Record<string, string | number>, parent?: Element, text?: string): SVGElement {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

const RES_LETTER: Record<string, string> = { material: 'M', fuel: 'F', weapons: 'W', relic: 'R', psionic: 'P' };

/** Draws the map into `svg`. `selected` is highlighted; `onPick` receives a clicked system id. */
export function drawMap(svg: SVGSVGElement, ix: ContentIndex, s: GameState, selected: string | null, onPick: (id: string) => void): void {
  svg.textContent = '';
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  const pos = layout(ix);
  el('circle', { cx: C, cy: C, r: R_GATE - 40, class: 'core' }, svg);

  const links = el('g', { class: 'links' }, svg);
  const closed = (a: string, b: string) => s.closedLinks.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (const [a, b] of ix.content.map.links) {
    if (!pos[a] || !pos[b] || closed(a, b)) continue;
    const out = !s.map[a].inPlay || !s.map[b].inPlay;
    el('line', { x1: pos[a].x, y1: pos[a].y, x2: pos[b].x, y2: pos[b].y, class: out ? 'link out' : 'link' }, links);
  }
  for (const [a, b] of s.openLinks) {
    if (!pos[a] || !pos[b]) continue;
    el('path', { d: `M${pos[a].x} ${pos[a].y} Q${C} ${C} ${pos[b].x} ${pos[b].y}`, class: 'link open' }, links);
  }

  for (const def of ix.content.map.systems) {
    const p = pos[def.id];
    const st = s.map[def.id];
    const g = el('g', { class: `sys${st.inPlay ? '' : ' out'}${selected === def.id ? ' sel' : ''}`, tabindex: 0, role: 'button', 'aria-label': def.id }, svg);
    const r = p.gate ? 26 : 34;
    el('circle', { cx: p.x, cy: p.y, r, class: p.gate ? 'gate' : `planet r-${def.resource ?? 'none'}` }, g);
    el('text', { x: p.x, y: p.y - r + 13, class: 'sys-id' }, g, p.gate ? def.id.replace(/-gate$/, ' G') : `${def.id.split('-').pop()} ${RES_LETTER[def.resource ?? ''] ?? ''}${def.slots ? '·' + def.slots : ''}`);
    // Buildings
    st.buildings.forEach((b, i) => {
      const bx = p.x - (st.buildings.length - 1) * 9 + i * 18;
      el('rect', { x: bx - 7, y: p.y - 6, width: 14, height: 12, rx: b.type === 'city' ? 0 : 7, class: `bld${b.damaged ? ' dmg' : ''}`, fill: playerColor(b.owner) }, g);
      el('text', { x: bx, y: p.y + 4, class: 'bld-t' }, g, b.type === 'city' ? 'C' : 'S');
    });
    // Ships
    const stacks = Object.entries(st.ships).filter(([, v]) => v.fresh + v.damaged > 0);
    stacks.forEach(([owner, v], i) => {
      const y = p.y + (st.buildings.length ? 19 : 12) + i * 11;
      el('text', { x: p.x, y, class: 'ships', fill: playerColor(Number(owner)) }, g, `▲${v.fresh}${v.damaged ? ` ▼${v.damaged}` : ''}`);
    });
    g.addEventListener('click', () => onPick(def.id));
    g.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') onPick(def.id);
    });
  }
}
