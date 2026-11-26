// The table map as an SVG string: clusters on a ring (positions from the debug
// map's layout()), ship stacks with a count badge, buildings, and highlights
// for the systems the current step accepts. Clicks are read by table.ts from
// the `data-sys` attribute. Display only (docs/ui/UI_SPEC.md §3).

import type { ContentIndex, Resource } from '../../game/engine';
import type { Translate } from '../../i18n';
import { layout } from '../map';
import { assetUrl, seatColor, svgGlyph } from './assets';
import { systemName } from './render';
import type { TableView } from './view';

const SIZE = 640;
const C = SIZE / 2;
/** Central disk (the gates sit on it), the planets' orbit, the outer edge of the sectors. */
const DISK = 128;
const ORBIT = 238;
const EDGE = 470;
/** How far the sectors are drawn: past the frame, which clips them. */
const FAR = 1100;
/** Sector tints, one per cluster in map order (our own palette, muted). */
const SECTOR_TINTS = ['#c9a23f', '#b0487f', '#3f7fa8', '#c2622f', '#6c4bb0', '#3f9a8a', '#8a8f3a', '#a84848'];

/** Small deterministic hash of a string, for per-planet variation. */
function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (r: number, deg: number) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))] as const;
const f = (n: number) => n.toFixed(1);

/**
 * The board drawn under the pieces: a sector per cluster fanning out from a
 * central disk, divider lines, the planets' orbit, scattered stars, and the
 * cluster numbers on the disk. Skipped when the owner supplied
 * assets/ui/map/background (that image is the board then).
 */
function boardSvg(clusters: string[]): string {
  const n = clusters.length;
  const step = 360 / n;
  let defs = '';
  let h = '';
  clusters.forEach((_, i) => {
    const tint = SECTOR_TINTS[i % SECTOR_TINTS.length];
    defs += `<radialGradient id="mg-s${i}" cx="${C}" cy="${C}" r="${EDGE}" gradientUnits="userSpaceOnUse">`
      + `<stop offset="0.25" stop-color="${tint}" stop-opacity="0"/><stop offset="0.5" stop-color="${tint}" stop-opacity=".30"/><stop offset="1" stop-color="${tint}" stop-opacity=".10"/></radialGradient>`;
    const a0 = -90 + i * step - step / 2;
    const a1 = a0 + step;
    const [x0, y0] = polar(FAR, a0);
    const [x1, y1] = polar(FAR, a1);
    h += `<path d="M${C} ${C}L${f(x0)} ${f(y0)}A${FAR} ${FAR} 0 0 1 ${f(x1)} ${f(y1)}Z" fill="url(#mg-s${i})"/>`;
  });
  // Dividers: a bright line and a faint companion, from the disk outwards.
  clusters.forEach((_, i) => {
    const a = -90 + i * step - step / 2;
    const tint = SECTOR_TINTS[i % SECTOR_TINTS.length];
    const [xa, ya] = polar(DISK, a);
    const [xb, yb] = polar(FAR, a);
    const [xc, yc] = polar(DISK + 6, a + 1.6);
    const [xd, yd] = polar(FAR, a + 1.2);
    h += `<line x1="${f(xa)}" y1="${f(ya)}" x2="${f(xb)}" y2="${f(yb)}" class="mb-divider" stroke="${tint}"/>`;
    h += `<line x1="${f(xc)}" y1="${f(yc)}" x2="${f(xd)}" y2="${f(yd)}" class="mb-divider faint" stroke="${tint}"/>`;
  });
  // Stars: fixed positions from a hash, so the board never changes between renders.
  for (let k = 0; k < 160; k++) {
    const r = hash(`star${k}`);
    const x = -360 + (r % 1360);
    const y = -40 + ((r >>> 10) % 720);
    if (Math.hypot(x - C, y - C) < DISK + 4) continue;
    h += `<circle cx="${x}" cy="${y}" r="${((r >>> 20) % 3) * 0.45 + 0.5}" class="mb-star"/>`;
  }
  h += `<circle cx="${C}" cy="${C}" r="${ORBIT}" class="mb-orbit"/><circle cx="${C}" cy="${C}" r="${ORBIT + 52}" class="mb-orbit faint"/>`;
  // The disk: engraved rings, tick marks, cluster numbers near each divider.
  h += `<circle cx="${C}" cy="${C}" r="${DISK}" class="mb-disk"/><circle cx="${C}" cy="${C}" r="${DISK - 8}" class="mb-disk-ring"/><circle cx="${C}" cy="${C}" r="62" class="mb-disk-ring"/>`;
  for (let d = 0; d < 360; d += 6) {
    const [xa, ya] = polar(DISK - 8, d);
    const [xb, yb] = polar(DISK - (d % 30 === 0 ? 16 : 12), d);
    h += `<line x1="${f(xa)}" y1="${f(ya)}" x2="${f(xb)}" y2="${f(yb)}" class="mb-tick"/>`;
  }
  clusters.forEach((_, i) => {
    const a = -90 + i * step + step / 2 - 5;
    const [x, y] = polar(DISK - 22, a);
    h += `<text x="${f(x)}" y="${f(y)}" class="mb-num" transform="rotate(${f(a + 90)} ${f(x)} ${f(y)})">${i + 1}</text>`;
  });
  return `<defs>${defs}</defs><g class="map-board" aria-hidden="true">${h}</g>`;
}

/** A planet as a small globe: resource-tinted shading, latitude and meridian lines, sometimes a ring. */
function planetBody(id: string, x: number, y: number, resource: Resource | null): string {
  const r = 31;
  const hv = hash(id);
  const color = resource ? `var(--res-${resource})` : '#7a8299';
  const tilt = (hv % 50) - 25;
  const ringed = hv % 4 === 0;
  const cid = `mp-${id.replace(/[^a-z0-9-]/gi, '')}`;
  let h = `<clipPath id="${cid}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath>`;
  if (ringed) h += `<ellipse cx="${x}" cy="${y}" rx="${r + 13}" ry="9" transform="rotate(${tilt} ${x} ${y})" class="mp-ring back"/>`;
  h += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" class="m-body mp-base"/>`;
  h += `<g clip-path="url(#${cid})" class="mp-lines" transform="rotate(${tilt} ${x} ${y})">`;
  for (const k of [-0.6, -0.25, 0.1, 0.45]) h += `<ellipse cx="${x}" cy="${f(y + k * r)}" rx="${r}" ry="${f(r * 0.22)}"/>`;
  h += `<ellipse cx="${x}" cy="${y}" rx="${f(r * (0.3 + (hv % 5) * 0.08))}" ry="${r}"/>`;
  h += `</g>`;
  // Light from the upper left, shadow on the lower right.
  h += `<circle cx="${x + 9}" cy="${y + 9}" r="${r}" clip-path="url(#${cid})" class="mp-shade"/>`;
  if (ringed) h += `<path d="M${f(x - r - 13)} ${y}A${r + 13} 9 0 0 0 ${f(x + r + 13)} ${y}" transform="rotate(${tilt} ${x} ${y})" class="mp-ring"/>`;
  return h;
}

/** Building slots: small diamonds on an arc under the planet. */
function slotMarks(x: number, y: number, n: number): string {
  let h = '';
  for (let i = 0; i < n; i++) {
    const a = 90 + (i - (n - 1) / 2) * 20;
    const sx = x + 37 * Math.cos(rad(a));
    const sy = y + 37 * Math.sin(rad(a));
    h += `<path d="M${f(sx)} ${f(sy - 5)}l5 5-5 5-5-5z" class="mp-slot"/>`;
  }
  return h;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

// Offsets around a system for up to 4 ship stacks (one per seat in it).
const STACK_OFFSETS: [number, number][] = [[-30, -30], [30, -30], [30, 30], [-30, 30]];

function shipStack(x: number, y: number, player: number, fresh: number, damaged: number): string {
  const seat = `var(--seat-${seatColor(player)})`;
  let h = `<g transform="translate(${x} ${y})">`;
  // A wedge pointing right; damaged-only stacks are drawn turned and dimmed.
  const turned = fresh === 0 ? ' rotate(90)' : '';
  h += `<path d="M-13 0 13 -8 6 0 13 8z" fill="${seat}" stroke="#0b0f1c" stroke-width="1.5" transform="scale(1.1)${turned}"${fresh === 0 ? ' opacity=".55"' : ''}/>`;
  h += `<circle cx="13" cy="-11" r="9" class="m-ship-badge"/><text x="13" y="-11" class="m-ship-n">${fresh + damaged}</text>`;
  if (damaged) h += `<circle cx="13" cy="9" r="7" fill="var(--danger)" stroke="#0b0f1c" stroke-width="1.5"/><text x="13" y="9" class="m-ship-n" style="font-size:10px;fill:#fff">${damaged}</text>`;
  return h + '</g>';
}

function building(x: number, y: number, owner: number, type: 'city' | 'starport', damaged: boolean): string {
  const seat = `var(--seat-${seatColor(owner)})`;
  const cls = `m-bld${damaged ? ' dmg' : ''}`;
  return type === 'city'
    ? `<path d="M${x - 8} ${y + 7}V${y - 2}l8-7 8 7v9z" fill="${seat}" class="${cls}"/>`
    : `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${seat}" stroke-width="4" class="${cls}"/><circle cx="${x}" cy="${y}" r="2.5" fill="${seat}"/>`;
}

/**
 * SVG for the map. `valid`: systems the current step accepts (pulsing);
 * `chosen`: systems already picked in this step.
 */
export function mapSvg(ix: ContentIndex, v: TableView, valid: ReadonlySet<string>, chosen: ReadonlySet<string>, t: Translate): string {
  const pos = layout(ix);
  let h = `<svg class="map-svg" viewBox="-40 -20 ${SIZE + 80} ${SIZE + 40}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="${esc(t('app.title'))}">`;
  if (!assetUrl('map.background')) h += boardSvg([...new Set(ix.content.map.systems.map((x) => x.cluster))]);
  else h += `<circle cx="${C}" cy="${C}" r="62" class="m-core"/>`;
  const inPlay = new Map(v.systems.map((s) => [s.id, s.inPlay]));
  for (const [a, b] of v.links) {
    if (!pos[a] || !pos[b]) continue;
    const out = !inPlay.get(a) || !inPlay.get(b);
    h += `<line x1="${pos[a].x}" y1="${pos[a].y}" x2="${pos[b].x}" y2="${pos[b].y}" class="m-link${out ? ' out' : ''}"/>`;
  }
  for (const s of v.systems) {
    const p = pos[s.id];
    if (!p) continue;
    const cls = ['m-sys', s.inPlay ? '' : 'out', valid.has(s.id) ? 'valid' : '', chosen.has(s.id) ? 'chosen' : ''].filter(Boolean).join(' ');
    const name = s.kind === 'gate' ? `${s.cluster} ◇` : s.id.split('-').pop()!;
    // Its name, never the id (A12); a system that can be picked now says so (A3).
    const label = valid.has(s.id) ? t('map.pickable', { name: systemName(s, t) }) : systemName(s, t);
    h += `<g class="${cls}" data-sys="${esc(s.id)}" tabindex="${s.inPlay ? 0 : -1}" role="button" aria-label="${esc(label)}">`;
    h += `<title>${esc(label)}</title>`;
    if (s.kind === 'gate') {
      h += `<polygon points="${hex(p.x, p.y, 22)}" class="m-body m-gate"/>`;
    } else {
      h += planetBody(s.id, p.x, p.y, s.resource);
      if (s.slots) h += slotMarks(p.x, p.y, s.slots);
      if (s.resource) h += `<circle cx="${p.x - 38}" cy="${p.y}" r="11" class="mp-res"/>${svgGlyph(s.resource, p.x - 38, p.y, 15, `var(--res-${s.resource})`)}`;
    }
    h += `<text x="${p.x}" y="${p.y + (s.kind === 'gate' ? 38 : 56)}" class="m-label">${esc(name)}</text>`;
    s.buildings.forEach((b, i) => {
      h += building(p.x - (s.buildings.length - 1) * 10 + i * 20, p.y + 2, b.owner, b.type, b.damaged);
    });
    s.ships.forEach((st, i) => {
      const [dx, dy] = STACK_OFFSETS[i % STACK_OFFSETS.length];
      h += shipStack(p.x + dx, p.y + dy, st.player, st.fresh, st.damaged);
    });
    h += '</g>';
  }
  return h + '</svg>';
}

function hex(x: number, y: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

/** Resource colours for the stand-alone board picture (same as the table's --res-* tokens). */
const RES_HEX: Record<string, string> = { material: '#c9a27a', fuel: '#f0c24b', weapons: '#ff7a5c', relic: '#59d0a8', psionic: '#c38bff' };

/** Styles the board picture needs, since an SVG used as an image sees no page CSS. */
const BOARD_CSS = `
.mb-divider{stroke-width:2.2;opacity:.7;stroke-linecap:round}.mb-divider.faint{stroke-width:1;opacity:.3}
.mb-star{fill:#dfe7ff;opacity:.55}.mb-orbit{fill:none;stroke:rgba(200,215,255,.14);stroke-width:1.2;stroke-dasharray:2 7}
.mb-orbit.faint{stroke:rgba(200,215,255,.07)}.mb-disk{fill:#14182a;stroke:rgba(232,214,170,.55);stroke-width:3}
.mb-disk-ring{fill:none;stroke:rgba(232,214,170,.28);stroke-width:1.5}.mb-tick{stroke:rgba(232,214,170,.35);stroke-width:1.2}
.mb-num{font:800 18px sans-serif;fill:rgba(240,228,196,.85);text-anchor:middle;dominant-baseline:central}
.m-body{stroke:rgba(230,236,248,.55);stroke-width:2}.mp-base{fill-opacity:.55}
.mp-lines ellipse{fill:none;stroke:rgba(255,255,255,.28);stroke-width:1}.mp-shade{fill:rgba(4,6,14,.45)}
.mp-ring{fill:none;stroke:rgba(240,228,196,.6);stroke-width:2}.mp-ring.back{stroke-opacity:.3}
.mp-slot{fill:rgba(10,14,28,.85);stroke:rgba(240,228,196,.7);stroke-width:1.3}
.mp-res{fill:rgba(10,14,28,.9);stroke:rgba(240,228,196,.5);stroke-width:1.2}
.m-gate{fill:#121a31;stroke:rgba(95,212,230,.6);stroke-width:3}.m-link{stroke:rgba(150,175,230,.38);stroke-width:2;fill:none}
.m-label{font:700 12px sans-serif;fill:#8d9abb;text-anchor:middle}.out{opacity:.22}`;

/**
 * The schematic board as a stand-alone SVG picture (for the 3D table's
 * texture): sectors, disk, links, planets and gates, no pieces. `aspect` is
 * width / height; the picture is 720 layout pixels high, centred on the map.
 */
export function boardImageSvg(ix: ContentIndex, inPlay: ReadonlyMap<string, boolean>, links: [string, string][], aspect: number): string {
  const pos = layout(ix);
  const H = 720;
  const W = H * aspect;
  let h = boardSvg([...new Set(ix.content.map.systems.map((x) => x.cluster))]);
  for (const [a, b] of links) {
    if (!pos[a] || !pos[b]) continue;
    const out = !inPlay.get(a) || !inPlay.get(b);
    h += `<line x1="${pos[a].x}" y1="${pos[a].y}" x2="${pos[b].x}" y2="${pos[b].y}" class="m-link${out ? ' out' : ''}"/>`;
  }
  for (const def of ix.content.map.systems) {
    const p = pos[def.id];
    if (!p) continue;
    h += `<g${inPlay.get(def.id) ? '' : ' class="out"'}>`;
    if (def.kind === 'gate') h += `<polygon points="${hex(p.x, p.y, 22)}" class="m-gate"/>`;
    else {
      h += planetBody(def.id, p.x, p.y, def.resource ?? null);
      if (def.slots) h += slotMarks(p.x, p.y, def.slots);
      if (def.resource) h += `<circle cx="${p.x - 38}" cy="${p.y}" r="11" class="mp-res"/>${svgGlyph(def.resource, p.x - 38, p.y, 15, RES_HEX[def.resource] ?? '#fff', true)}`;
    }
    const name = def.kind === 'gate' ? `${def.cluster} ◇` : def.id.split('-').pop()!;
    h += `<text x="${p.x}" y="${p.y + (def.kind === 'gate' ? 38 : 56)}" class="m-label">${esc(name)}</text></g>`;
  }
  h = h.replace(/var\(--res-([a-z]+)\)/g, (_, r: string) => RES_HEX[r] ?? '#7a8299');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * 4)}" height="${H * 4}" viewBox="${f(C - W / 2)} ${C - H / 2} ${f(W)} ${H}">`
    + `<style>${BOARD_CSS}</style><rect x="${f(C - W / 2)}" y="${C - H / 2}" width="${f(W)}" height="${H}" fill="#0a0e1c"/>${h}</svg>`;
}
