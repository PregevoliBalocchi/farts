// The table map as an SVG string: clusters on a ring (positions from the debug
// map's layout()), ship stacks with a count badge, buildings, and highlights
// for the systems the current step accepts. Clicks are read by table.ts from
// the `data-sys` attribute. Display only (docs/ui/UI_SPEC.md §3).

import type { ContentIndex } from '../../game/engine';
import type { Translate } from '../../i18n';
import { layout } from '../map';
import type { TableView } from './view';

const SIZE = 640;
const C = SIZE / 2;

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

// Offsets around a system for up to 4 ship stacks (one per seat in it).
const STACK_OFFSETS: [number, number][] = [[-30, -30], [30, -30], [30, 30], [-30, 30]];

function shipStack(x: number, y: number, player: number, fresh: number, damaged: number): string {
  const seat = `var(--seat-${player % 4})`;
  let h = `<g transform="translate(${x} ${y})">`;
  // A wedge pointing right; damaged-only stacks are drawn turned and dimmed.
  const turned = fresh === 0 ? ' rotate(90)' : '';
  h += `<path d="M-13 0 13 -8 6 0 13 8z" fill="${seat}" stroke="#0b0f1c" stroke-width="1.5" transform="scale(1.1)${turned}"${fresh === 0 ? ' opacity=".55"' : ''}/>`;
  h += `<circle cx="13" cy="-11" r="9" class="m-ship-badge"/><text x="13" y="-11" class="m-ship-n">${fresh + damaged}</text>`;
  if (damaged) h += `<circle cx="13" cy="9" r="7" fill="var(--danger)" stroke="#0b0f1c" stroke-width="1.5"/><text x="13" y="9" class="m-ship-n" style="font-size:10px;fill:#fff">${damaged}</text>`;
  return h + '</g>';
}

function building(x: number, y: number, owner: number, type: 'city' | 'starport', damaged: boolean): string {
  const seat = `var(--seat-${owner % 4})`;
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
  h += `<circle cx="${C}" cy="${C}" r="62" class="m-core"/>`;
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
    const label = `${s.id}${s.resource ? ' · ' + t(`resource.${s.resource}`) : ''}`;
    h += `<g class="${cls}" data-sys="${esc(s.id)}" tabindex="${s.inPlay ? 0 : -1}" role="button" aria-label="${esc(label)}">`;
    h += `<title>${esc(label)}</title>`;
    if (s.kind === 'gate') {
      h += `<polygon points="${hex(p.x, p.y, 22)}" class="m-body m-gate"/>`;
    } else {
      const fill = s.resource ? `var(--res-${s.resource})` : '#556';
      h += `<circle cx="${p.x}" cy="${p.y}" r="31" class="m-body" fill="${fill}" fill-opacity=".28"/>`;
      h += `<circle cx="${p.x - 8}" cy="${p.y - 9}" r="11" fill="${fill}" opacity=".35"/>`;
    }
    h += `<text x="${p.x}" y="${p.y + (s.kind === 'gate' ? 38 : 46)}" class="m-label">${esc(name)}${s.slots ? ` ▢${s.slots}` : ''}</text>`;
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
