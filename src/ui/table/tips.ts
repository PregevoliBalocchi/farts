// Hover cards: pointing at a rival's board, an ambition row or a map system
// shows a small framed card beside it with what the table does not already
// show, drawn with the pieces' pictures. They replace the old detail windows
// (no click, nothing to close). HTML strings from the TableView only.

import type { ContentIndex } from '../../game/engine';
import type { Translate } from '../../i18n';
import { icon, seatColor, seatIcon } from './assets';
import { cardFaceById } from './cardface';
import { esc, pieceIcon, playerName, systemTag, seatBoardCard } from './render';
import type { AmbitionRowView, PlayerView, SystemView, TableView } from './view';

/** What a hover card is about: a seat, a map system or an ambition. */
export type TipTarget = { kind: 'seat'; player: number } | { kind: 'system'; id: string } | { kind: 'ambition'; id: string };

/** Reads a `data-tip` value ("seat:1", "sys:c2-p1", "amb:tyrant"), or null when it is not one. */
export function parseTip(raw: string | undefined): TipTarget | null {
  const [k, id] = (raw ?? '').split(':');
  if (!id) return null;
  if (k === 'seat' && /^\d+$/.test(id)) return { kind: 'seat', player: Number(id) };
  if (k === 'sys') return { kind: 'system', id };
  if (k === 'amb') return { kind: 'ambition', id };
  return null;
}

const seatTag = (t: Translate, p: number) => `<span class="tip-seat s-${seatColor(p)}"><span class="seat-c">${icon(seatIcon(p))}</span>${esc(playerName(t, p))}</span>`;

/** One labelled line of a hover card. */
const line = (label: string, value: string) => `<div class="tip-row"><span class="tip-k">${esc(label)}</span><span class="tip-v">${value}</span></div>`;

type Piece = 'ship' | 'agent' | 'city' | 'starport';

/** A seat's piece `n` times (several in a row up to 4, then "×n"). */
function pieces(kind: Piece, seat: number, n: number, cls = ''): string {
  const shown = Math.min(n, 4);
  const pics = Array.from({ length: shown }, () => pieceIcon(kind, seat)).join('');
  return `<span class="tip-pcs ${cls}">${pics}${n > shown ? `<b class="num">×${n}</b>` : ''}</span>`;
}

function countBy<T>(items: readonly T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const x of items) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** A rival: what their board does not show (trophies and captives by owner, every card they hold). */
function seatTip(p: PlayerView, t: Translate): string {
  const none = `<span class="tip-none">${esc(t('detail.nobody'))}</span>`;
  const trophies = [...countBy(p.trophies.map((x) => `${x.owner}|${x.piece}`))]
    .map(([k, n]) => {
      const [owner, piece] = k.split('|');
      return pieces(piece as Piece, Number(owner), n);
    })
    .join('');
  const captives = [...countBy(p.captives)].map(([o, n]) => pieces('agent', o, n)).join('');
  const cards = [...p.court, ...p.lore];
  const faces = cards.map((c) => `<span class="tip-card">${cardFaceById(c)}</span>`).join('');
  return `<div class="tip-head">${seatTag(t, p.id)}</div>
    ${seatBoardCard(p, t)}
    ${line(t('stat.trophies'), trophies || none)}
    ${line(t('stat.captives'), captives || none)}
    ${cards.length ? `<div class="tip-cards">${faces}</div>` : ''}`;
}

/** A map system: who rules it and every piece in it. */
function systemTip(s: SystemView, t: Translate): string {
  const ships = s.ships
    .map((x) => `${x.fresh ? pieces('ship', x.player, x.fresh) : ''}${x.damaged ? pieces('ship', x.player, x.damaged, 'damaged') : ''}`)
    .join('');
  const blds = s.buildings.map((b) => `<span class="tip-pcs${b.damaged ? ' damaged' : ''}">${pieceIcon(b.type, b.owner)}</span>`).join('');
  const sub = [t(`detail.kind.${s.kind}`), s.slots ? t('detail.slots', { n: s.slots }) : '', s.inPlay ? '' : t('detail.outOfPlay')].filter(Boolean).join(' · ');
  return `<div class="tip-head">${systemTag(s, t)}</div>
    <div class="tip-sub">${esc(sub)}</div>
    ${line(t('detail.controller'), s.controller !== null ? seatTag(t, s.controller) : `<span class="tip-none">${esc(t('detail.nobody'))}</span>`)}
    ${ships ? line(t('detail.ships'), ships) : ''}
    ${blds ? line(t('detail.buildings'), blds) : ''}`;
}

/** An ambition: what it counts and every seat's count now, the places it would score lit. */
function ambitionTip(ix: ContentIndex, a: AmbitionRowView, t: Translate): string {
  const m = ix.content.ambitionMetrics[a.id];
  const measure = m.kind === 'resources' ? (m.resources ?? []).map((r) => t(`resource.${r}`)).join(' + ') : t(`stat.${m.kind}`);
  const place = (p: number) => (a.first.includes(p) ? `<span class="tip-place first">${esc(t('amb.first'))}</span>` : a.second.includes(p) ? `<span class="tip-place">${esc(t('amb.second'))}</span>` : '');
  const tallies = [...a.tallies]
    .sort((x, y) => y.value - x.value)
    .map((x) => `<div class="tip-tally">${seatTag(t, x.player)}<b class="num">${x.value}</b>${place(x.player)}</div>`)
    .join('');
  return `<div class="tip-head"><span class="tip-title">${esc(t(`ambition.${a.id}`))}</span></div>
    <div class="tip-sub">${esc(`${t('detail.measures')}: ${measure}`)}${a.markers.length ? '' : ` · ${esc(t('detail.notDeclared'))}`}</div>
    <div class="tip-tallies">${tallies}</div>`;
}

/** Inner HTML of the hover card for `d`, or null when it is not on the table. */
export function tipHtml(ix: ContentIndex, v: TableView, d: TipTarget, t: Translate): string | null {
  switch (d.kind) {
    case 'seat': {
      const p = v.players[d.player];
      return p ? seatTip(p, t) : null;
    }
    case 'system': {
      const s = v.systems.find((x) => x.id === d.id);
      return s ? systemTip(s, t) : null;
    }
    case 'ambition': {
      const a = v.ambitions.find((x) => x.id === d.id);
      return a ? ambitionTip(ix, a, t) : null;
    }
  }
}
