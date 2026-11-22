// Detail windows: clicking a seat, a map system, an ambition or the supply opens
// everything known about it (owner's decision in the UI lab: "many elements open
// a window with the details when clicked"). HTML strings from the TableView only.

import type { ContentIndex } from '../../game/engine';
import type { Translate } from '../../i18n';
import { icon, seatIcon } from './assets';
import { button, cardLabel, courtFace, esc, playerName } from './render';
import type { AmbitionRowView, PlayerView, SystemView, TableView } from './view';

/** What a detail window shows. */
export type DetailTarget =
  | { kind: 'seat'; player: number }
  | { kind: 'system'; id: string }
  | { kind: 'ambition'; id: string }
  | { kind: 'supply' };

const seatTag = (t: Translate, p: number) => `<span class="s-${p % 4}"><span class="seat-c">${icon(seatIcon(p))}</span> ${esc(playerName(t, p))}</span>`;

const row = (label: string, value: string) => `<dt>${esc(label)}</dt><dd>${value}</dd>`;

function countBy<T>(items: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const x of items) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

function seatDetail(ix: ContentIndex, v: TableView, p: PlayerView, t: Translate): string {
  const res = p.slots
    .filter((s) => !s.locked)
    .map((s) => (s.resource ? `<span class="r-${s.resource}">${icon(s.resource)}</span> ${esc(t(`resource.${s.resource}`))}` : esc(t('slot.empty'))))
    .join(' · ');
  const trophies = [...countBy(p.trophies.map((x) => `${x.owner}|${x.piece}`))]
    .map(([k, n]) => {
      const [owner, piece] = k.split('|');
      return `${seatTag(t, Number(owner))} ${esc(t(`piece.${piece}`))} ×${n}`;
    })
    .join('<br>');
  const captives = [...countBy(p.captives)].map(([o, n]) => `${seatTag(t, o)} ×${n}`).join('<br>');
  const played = v.plays.find((x) => x.player === p.id);
  const playedText = played ? `${esc(t(`play.${played.mode}`))}${played.card ? ` ${esc(cardLabel(t, played.card))}` : ''}` : esc(t('empty'));
  const cards = p.court.length
    ? `<div class="detail-cards">${p.court.map((c) => {
        const d = ix.courtCards.get(c);
        return `<span class="detail-card" data-zoom="${esc(c)}" tabindex="0">${courtFace({ card: c, kind: d?.kind ?? null, resource: d?.resource ?? null, keys: d?.keys ?? 0 }, t)}</span>`;
      }).join('')}</div>`
    : esc(t('empty'));
  return `<h2 id="modal-title">${seatTag(t, p.id)}</h2>
    <div class="detail-sub">${p.hasInitiative ? esc(t('initiative')) + ' · ' : ''}${esc(t('stat.power'))} ${p.power} · ${esc(t('rival.cards', { n: p.handCount }))}</div>
    <div class="modal-body detail-grid"><dl>
      ${row(t('detail.resources'), res || esc(t('empty')))}
      ${p.outraged.length ? row(t('detail.outraged'), p.outraged.map((r) => esc(t(`resource.${r}`))).join(', ')) : ''}
      ${row(t('detail.reserve'), `${icon('ship')} ${p.stats.ships} · ${icon('city')} ${p.stats.cities} · ${icon('starport')} ${p.stats.starports} · ${icon('agent')} ${p.stats.agents}`)}
      ${row(t('stat.trophies'), trophies || esc(t('empty')))}
      ${row(t('stat.captives'), captives || esc(t('empty')))}
      ${row(t('detail.played'), playedText)}
      ${row(t('stat.court'), cards)}
    </dl></div>
    <div class="modal-foot">${button('close-modal', t('btn.back'))}${p.court.length ? button('seat-cards', t('btn.court'), { args: { player: p.id } }) : '<span></span>'}</div>`;
}

function systemDetail(s: SystemView, t: Translate): string {
  const ships = s.ships.map((x) => `${seatTag(t, x.player)} ${icon('ship')} ${x.fresh}${x.damaged ? ` · ${esc(t('detail.damaged', { n: x.damaged }))}` : ''}`).join('<br>');
  const blds = s.buildings.map((b) => `${seatTag(t, b.owner)} ${icon(b.type)} ${esc(t(`build.${b.type}`))}${b.damaged ? ` (${esc(t('detail.damagedOne'))})` : ''}`).join('<br>');
  const near = s.neighbors.map((n) => button('detail-system', n, { args: { id: n }, cls: 'chip-btn' })).join(' ');
  return `<h2 id="modal-title">${esc(s.id)}</h2>
    <div class="detail-sub">${esc(t(`detail.kind.${s.kind}`))}${s.resource ? ` · <span class="r-${s.resource}">${icon(s.resource)}</span> ${esc(t(`resource.${s.resource}`))}` : ''}${s.slots ? ` · ${esc(t('detail.slots', { n: s.slots }))}` : ''}${s.inPlay ? '' : ` · ${esc(t('detail.outOfPlay'))}`}</div>
    <div class="modal-body detail-grid"><dl>
      ${row(t('detail.controller'), s.controller !== null ? seatTag(t, s.controller) : esc(t('detail.nobody')))}
      ${row(t('detail.ships'), ships || esc(t('empty')))}
      ${row(t('detail.buildings'), blds || esc(t('empty')))}
      ${row(t('detail.neighbors'), near || esc(t('empty')))}
    </dl></div>
    <div class="modal-foot">${button('close-modal', t('btn.back'))}<span></span></div>`;
}

function ambitionDetail(ix: ContentIndex, v: TableView, a: AmbitionRowView, t: Translate): string {
  const m = ix.content.ambitionMetrics[a.id];
  const measure = m.kind === 'resources' ? (m.resources ?? []).map((r) => esc(t(`resource.${r}`))).join(' + ') : esc(t(`stat.${m.kind}`));
  const markers = a.markers.map((x) => `<span class="marker"><span>${x.first}</span><span>${x.second}</span></span>`).join('') || esc(t('detail.notDeclared'));
  const place = (p: number) => (a.first.includes(p) ? ` · ${esc(t('amb.first'))}` : a.second.includes(p) ? ` · ${esc(t('amb.second'))}` : '');
  const tallies = a.tallies.map((x) => `${seatTag(t, x.player)} <b class="num">${x.value}</b>${place(x.player)}`).join('<br>');
  const left = v.markersLeft.map((x) => `<span class="marker"><span>${x.first}</span><span>${x.second}</span></span>`).join('') || esc(t('empty'));
  return `<h2 id="modal-title">${esc(t(`ambition.${a.id}`))}</h2>
    <div class="detail-sub">${esc(t('detail.measures'))}: ${measure}</div>
    <div class="modal-body detail-grid"><dl>
      ${row(t('detail.markers'), markers)}
      ${row(t('amb.ifNow'), tallies)}
      ${a.box !== null ? row(t('detail.box'), String(a.box)) : ''}
      ${row(t('ambitions.available'), left)}
    </dl></div>
    <div class="modal-foot">${button('close-modal', t('btn.back'))}<span></span></div>`;
}

function supplyDetail(v: TableView, t: Translate): string {
  const items = v.supply.map((s) => row(t(`resource.${s.resource}`), `<span class="r-${s.resource}">${icon(s.resource)}</span> <b class="num">${s.count}</b>`)).join('');
  return `<h2 id="modal-title">${esc(t('supply'))}</h2><div class="detail-sub"></div>
    <div class="modal-body detail-grid"><dl>${items}</dl></div>
    <div class="modal-foot">${button('close-modal', t('btn.back'))}<span></span></div>`;
}

/** Inner HTML of the detail window for `d`, or null if it no longer exists. */
export function detailHtml(ix: ContentIndex, v: TableView, d: DetailTarget, t: Translate): string | null {
  switch (d.kind) {
    case 'seat': {
      const p = v.players[d.player];
      return p ? seatDetail(ix, v, p, t) : null;
    }
    case 'system': {
      const s = v.systems.find((x) => x.id === d.id);
      return s ? systemDetail(s, t) : null;
    }
    case 'ambition': {
      const a = v.ambitions.find((x) => x.id === d.id);
      return a ? ambitionDetail(ix, v, a, t) : null;
    }
    case 'supply':
      return supplyDetail(v, t);
  }
}
