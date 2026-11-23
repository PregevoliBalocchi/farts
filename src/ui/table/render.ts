// HUD components as HTML strings, all read from a TableView (docs/ui/UI_SPEC.md
// §4–§11). No rules here: what is clickable comes in as sets computed by
// table.ts from the engine. Buttons carry `data-act` (and data-* arguments),
// read by one delegated click handler in table.ts.

import type { ContentIndex, Resource } from '../../game/engine';
import type { Translate } from '../../i18n';
import { assetUrl, cardArt, icon, seatColor, seatIcon } from './assets';
import type { IconName } from './assets';
import { courtBanner, courtCardFace, hasKitFace } from './cardface';
import type { CourtFaceData } from './cardface';
import { roundedTriangle } from './model-fx';
import type { ActionCardView, CourtCardView, PlayerView, TableView } from './view';

/** Escapes text for HTML. */
export const esc = (v: unknown) =>
  String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Names given to the seats when the game was created (empty: "Player N"). */
let seatNames: readonly string[] = [];

/** Sets the seats' display names; blank entries keep the default name. */
export function setSeatNames(names: readonly string[] = []): void {
  seatNames = names.map((n) => String(n ?? '').trim().slice(0, 24));
}

/** Display name of a seat. */
export const playerName = (t: Translate, id: number) => seatNames[id] || t('player.name', { n: id + 1 });

/** Display name of a suit: its translation when the table has one, else its content id. */
export function suitName(t: Translate, suit: string): string {
  const key = `suit.${suit}`;
  const name = t(key);
  return name === key ? suit : name;
}

/** "Suit N" for an action card. */
export const cardLabel = (t: Translate, c: Pick<ActionCardView, 'suit' | 'number'>) => `${suitName(t, c.suit)} ${c.number}`;

/** CSS class for a suit: its position among the content's suits picks the colour. */
export function suitClass(ix: ContentIndex, suit: string): string {
  const i = Object.keys(ix.content.suits).indexOf(suit);
  return `su-${Math.max(0, i) % 5}`;
}

/** A button. `args` become data-* attributes. */
export function button(act: string, label: string, opts: { args?: Record<string, string | number>; cls?: string; disabled?: boolean; title?: string; html?: string } = {}): string {
  const data = Object.entries(opts.args ?? {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  const title = opts.title ? ` title="${esc(opts.title)}" aria-label="${esc(opts.title)}"` : '';
  return `<button type="button" class="btn ${opts.cls ?? ''}" data-act="${esc(act)}"${data}${title}${opts.disabled ? ' disabled' : ''}>${opts.html ?? esc(label)}</button>`;
}

function portrait(id: number): string {
  const url = assetUrl(`portrait.${id}`);
  return `<div class="portrait">${url ? `<img src="${esc(url)}" alt="">` : icon(seatIcon(id))}</div>`;
}

function resIcon(r: Resource, t: Translate, cls = ''): string {
  return `<span class="r-${r} ${cls}">${icon(r as IconName, '', t(`resource.${r}`))}</span>`;
}

/**
 * The top strip, as on the digital table: the chapter in a ring and the
 * general supply (left); the prompt over a thin gold line, with the round's
 * lead and seize under it (centre); the menu buttons (right).
 */
export function header(v: TableView, t: Translate, exampleContent: boolean, promptText: string): string {
  const supply = v.supply.map((s) => `<span title="${esc(t(`resource.${s.resource}`))}">${resIcon(s.resource, t)}<b class="num">${s.count}</b></span>`).join('');
  const declared = v.ambitions.filter((a) => a.markers.length).map((a) => t(`ambition.${a.id}`));
  const lead = v.lead ? t('header.lead', { card: cardLabel(t, v.lead) }) : '';
  const notes = [
    lead && declared.length ? `${lead} · ${t('header.declared', { amb: declared.join(', ') })}` : lead,
    v.seizedBy !== null ? t('header.seize', { name: playerName(t, v.seizedBy) }) : '',
  ].filter(Boolean);
  const last = v.recent[0] ?? t('empty');
  const round = `${t('chapter', { n: v.chapter })} · ${t('header.deck', { deck: v.deck, discard: v.discard })}`;
  return `<div class="hd round-c" title="${esc(round)}" aria-label="${esc(round)}"><span class="num">${v.chapter}</span></div>
    <button type="button" class="hd supply" data-act="supply-detail" aria-label="${esc(t('supply'))}">${supply}</button>
    <div class="hd prompt"><span class="pr-text">${esc(promptText)}</span>${notes.length ? `<span class="pr-notes">${esc(notes.join(' · '))}</span>` : ''}</div>
    <div class="hd tools">
      ${exampleContent ? `<span class="content-note">${esc(t('content.example'))}</span>` : ''}
      ${button('court-view', '', { cls: 'icon sq', title: t('btn.court'), html: icon('court') })}
      <span data-region="recent">${button('log', '', { cls: 'icon sq', title: `${t('btn.log')} · ${t('recent.last')} ${last}`, html: icon('log') })}</span>
      ${button('help', '', { cls: 'icon sq', title: t('btn.help'), html: icon('anyAmbition') })}
      ${button('settings', '', { cls: 'icon sq', title: t('btn.settings'), html: icon('settings') })}
    </div>`;
}

/** Undo and confirm (end the turn) as the two square buttons in the bottom-right corner. */
export function confirmButtons(t: Translate, undo: { show: boolean; enabled: boolean }, end: { show: boolean; enabled: boolean; ready: boolean }): string {
  return `${undo.show ? button('undo', '', { cls: 'icon sq big', title: t('btn.undo'), html: icon('undo'), disabled: !undo.enabled }) : ''}${
    end.show ? button('end-turn', '', { cls: `icon sq big confirm${end.ready ? ' pulse' : ''}`, title: t('play.endTurn'), html: icon('confirm'), disabled: !end.enabled }) : ''}`;
}

/** A game piece of a seat as a small picture (the kit's piece image), else its glyph in the seat colour. */
function pieceIcon(kind: 'ship' | 'agent' | 'city' | 'starport', seat: number, label?: string): string {
  const url = assetUrl(`piece.${kind}-${seatColor(seat)}`);
  const alt = label ? `alt="${esc(label)}"` : 'alt="" aria-hidden="true"';
  return url ? `<img class="ic pc pc-${kind}" src="${esc(url)}" ${alt}>` : `<span class="seat-c">${icon(kind, '', label)}</span>`;
}

/**
 * The supply row of a seat board: cards in hand and the pieces still to place.
 * `cities`: also the unbuilt cities (rivals; the local board shows them on its slots).
 */
function stats(p: PlayerView, t: Translate, cities: boolean): string {
  const cell = (pic: string, n: number, key: string) => `<span class="st" title="${esc(t(key))}">${pic}<b class="num">${n}</b></span>`;
  return `<div class="stats">${[
    cell(icon('cards', '', t('stat.hand')), p.handCount, 'stat.hand'),
    cell(pieceIcon('agent', p.id, t('stat.agents')), p.stats.agents, 'stat.agents'),
    cell(pieceIcon('ship', p.id, t('stat.ships')), p.stats.ships, 'stat.ships'),
    cell(pieceIcon('starport', p.id, t('stat.starports')), p.stats.starports, 'stat.starports'),
    cities ? cell(pieceIcon('city', p.id, t('stat.cities')), p.stats.cities, 'stat.cities') : '',
  ].join('')}</div>`;
}

/** Captives and trophies, one under the other. */
function spoils(p: PlayerView, t: Translate): string {
  return `<div class="spoils"><span class="st" title="${esc(t('stat.captives'))}">${icon('ambCaptives', '', t('stat.captives'))}<b class="num">${p.stats.captives}</b></span><span class="st" title="${esc(t('stat.trophies'))}">${icon('ambTrophies', '', t('stat.trophies'))}<b class="num">${p.stats.trophies}</b></span></div>`;
}

/** The name bar under a seat board: seat shape, name, initiative, and power in a laurel ring. */
function nameBar(p: PlayerView, t: Translate): string {
  const token = assetUrl('token.initiative');
  const mark = token ? `<img class="ic init-img" src="${esc(token)}" alt="${esc(t('initiative'))}">` : icon('power', '', t('initiative'));
  const init = p.hasInitiative ? `<span class="init-mark" title="${esc(t('initiative'))}">${mark}</span>` : '';
  return `<div class="name-bar"><span class="seat-c">${icon(seatIcon(p.id))}</span><span class="nm">${esc(playerName(t, p.id))}</span>${init}<span class="pow num" title="${esc(t('stat.power'))}">${p.power}</span></div>`;
}

/** The city triangle printed on the board (rounded corners, like the map's), as an SVG outline. */
const CITY_TRIANGLE = (() => {
  const pts = roundedTriangle(100, 13, 5);
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  const w = Math.max(...xs) - Math.min(...xs) + 6;
  const h = Math.max(...zs) - Math.min(...zs) + 6;
  const d = pts.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' ');
  return `<svg class="tri" viewBox="${(-w / 2).toFixed(1)} ${(-h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" aria-hidden="true"><polygon points="${d}"/></svg>`;
})();

/**
 * The resource slots of a board laid out like the physical one: from the
 * left, the open slots, then each city's printed triangle over the slot(s) it
 * covers (one triangle over two overlapping circles for a city covering two),
 * then the triangles of the cities that cover no slot, with the power they
 * add. An unbuilt city stands on its triangle; built, the printed outline
 * shows and its slots take resources.
 */
function slotsHtml(p: PlayerView, t: Translate, spendable: ReadonlySet<number>, chosen: number | null): string {
  const slot = (i: number, covered: boolean) => {
    const s = p.slots[i];
    // The keys as the Court cards print them: the kit's 1, 2 or 3 key tab.
    const tab = s.keys > 0 ? assetUrl(`cardkit.cost-${Math.min(3, s.keys)}`) : null;
    const keys = tab
      ? `<span class="keys kit" style="background-image:url('${esc(tab)}')" aria-label="${s.keys}"></span>`
      : `<span class="keys">${Array.from({ length: s.keys }, () => icon('key')).join('')}</span>`;
    if (s.locked) return `<div class="slot locked${covered ? ' covered' : ''}" title="${esc(t('slot.locked'))}">${keys}<span class="well">${covered ? '' : icon('lock')}</span></div>`;
    if (!s.resource) return `<div class="slot${covered ? ' covered' : ''}" title="${esc(t('slot.empty'))}">${keys}<span class="well"></span></div>`;
    const out = p.outraged.includes(s.resource) ? ' outraged' : '';
    const cls = `slot${covered ? ' covered' : ''}${out}`;
    const label = t(`resource.${s.resource}`);
    if (spendable.has(s.index)) {
      return `<button type="button" class="${cls} spend${chosen === s.index ? ' chosen' : ''}" data-act="spend" data-slot="${s.index}" title="${esc(label)}">${keys}<span class="well">${resIcon(s.resource, t)}</span></button>`;
    }
    return `<div class="${cls}" title="${esc(label)}">${keys}<span class="well">${resIcon(s.resource, t)}</span></div>`;
  };
  const onCity = (built: boolean) => (built ? '' : `<span class="on-city">${pieceIcon('city', p.id)}</span>`);
  const covered = new Set(p.cities.flatMap((c) => c.slots));
  const free = p.slots.filter((s) => !covered.has(s.index)).map((s) => slot(s.index, false));
  const cities = p.cities.map((c) => {
    if (c.slots.length) {
      const pair = c.slots.length > 1 ? ' pair' : '';
      return `<div class="cover${pair}${c.built ? ' built' : ''}">${c.slots.map((i) => slot(i, true)).join('')}${CITY_TRIANGLE}${onCity(c.built)}</div>`;
    }
    return `<div class="cover bonus${c.built ? ' built' : ''}" title="${esc(t('slot.bonus', { n: c.bonus }))}"><span class="keys"></span><span class="tri-cell">${CITY_TRIANGLE}<b class="plus num">+${c.bonus}</b></span>${onCity(c.built)}</div>`;
  });
  return `<div class="slots">${free.join('')}${cities.join('')}</div>`;
}

/**
 * The Outrage corner of a seat board: each Outraged resource type, covered by
 * one of the seat's agents (empty when none).
 */
function outrage(p: PlayerView, t: Translate): string {
  const agent = pieceIcon('agent', p.id, t('stat.agents'));
  const spaces = p.outraged
    .map((r) => {
      const label = t(`resource.${r}`);
      return `<span class="o-space" title="${esc(t('outraged', { list: label }))}"><span class="o-res">${resIcon(r, t)}</span><span class="o-agent">${agent}</span></span>`;
    })
    .join('');
  return `<div class="outrage" aria-label="${esc(t('outrage.row'))}">${spaces}</div>`;
}

/** The leader's picture when the seat has a leader card with art, else the seat portrait. */
function leaderPortrait(p: PlayerView): string {
  const art = p.leader ? cardArt(p.leader) : null;
  return art ? `<div class="portrait leader"><img src="${esc(art)}" alt=""></div>` : portrait(p.id);
}

/** A card with a prelude power on the board's tab: lit (and clickable) when it can be used now. */
export interface PreludeCard {
  card: string;
  lit: boolean;
}

function preludeTab(cards: readonly PreludeCard[], t: Translate): string {
  if (!cards.length) return '';
  const btns = cards
    .map((c) => {
      const art = cardArt(c.card);
      const face = art ? `<img src="${esc(art)}" alt="">` : icon('court');
      return c.lit
        ? `<button type="button" class="pre lit" data-act="powers-open" data-zoom="${esc(c.card)}" title="${esc(t('powers.title'))}">${face}</button>`
        : `<span class="pre" data-zoom="${esc(c.card)}" title="${esc(c.card)}">${face}</span>`;
    })
    .join('');
  return `<div class="pb-tab" aria-label="${esc(t('powers.title'))}">${btns}</div>`;
}

/**
 * A seat board drawn like the physical one (local and rivals alike, rivals
 * smaller): the leader top left, the prelude tab top right, the resource
 * slots with their keys and the unbuilt cities on them; captives and
 * trophies beside the guild cards; the reserve and the Outraged resources;
 * the name bar with the power in a ring.
 */
function seatBoard(p: PlayerView, t: Translate, o: { spendable: ReadonlySet<number>; chosen: number | null; preludes: readonly PreludeCard[]; maxCards: number; head: string }): string {
  return `${preludeTab(o.preludes, t)}
    <div class="pb-body">
      <div class="pb-face">${o.head}</div>
      ${slotsHtml(p, t, o.spendable, o.chosen)}
      ${spoils(p, t)}
      <div class="pb-guild">${miniCards([...p.court, ...p.lore], o.maxCards)}</div>
      <div class="pb-low">${stats(p, t, false)}${outrage(p, t)}</div>
    </div>
    ${nameBar(p, t)}`;
}

function miniCards(cards: string[], max: number): string {
  const shown = cards
    .slice(0, max)
    .map((c) => {
      const art = cardArt(c);
      return `<div class="mini-card${art ? ' has-art' : ''}" title="${esc(c)}" data-zoom="${esc(c)}">${art ? `<img src="${esc(art)}" alt="">` : icon('court')}</div>`;
    })
    .join('');
  return `<div class="mini-cards">${shown}${cards.length > max ? `<div class="mini-card more">+${cards.length - max}</div>` : ''}</div>`;
}

/** What a seat played this round, as text ("Surpass Aggression 5", or face down). */
export function playedText(v: TableView, t: Translate, player: number): string | null {
  const pl = v.plays.find((x) => x.player === player);
  if (!pl) return null;
  const mode = t(`play.${pl.mode}`);
  return pl.card ? `${mode} ${cardLabel(t, pl.card)}` : mode;
}

/**
 * The card a seat played this round, drawn small with how it was played
 * (lead, follow, copy, pivot) under it; an empty slot before the seat plays.
 */
export function playedCard(ix: ContentIndex, v: TableView, t: Translate, player: number): string {
  const pl = v.plays.find((x) => x.player === player);
  if (!pl) return `<div class="play none" title="${esc(t('played.none'))}"></div>`;
  const face = pl.card ? actionCard(ix, pl.card, t, pl.zeroed ? 'zeroed' : '') : '<div class="facedown"></div>';
  // The card's actions as gold tags beside it, as on the digital table.
  const tags = pl.card?.kinds.length ? `<span class="tags">${pl.card.kinds.map((k) => `<span class="tag">${esc(t(`action.${k}`))}</span>`).join('')}</span>` : '';
  return `<div class="play${pl.mode === 'lead' ? ' lead' : ''}">${face}${tags}<span class="how">${esc(t(`played.${pl.mode}`))}${pl.seized ? ' ↺' : ''}</span></div>`;
}

/**
 * One rival's board (click opens their details), drawn like the local one
 * but smaller. The card they played sits beside it.
 */
export function rivalPanel(ix: ContentIndex, v: TableView, p: PlayerView, t: Translate): string {
  return `<div class="rival-wrap"><button type="button" class="board pb rival s-${seatColor(p.id)}${p.isActive ? ' active' : ''}" data-act="seat-detail" data-player="${p.id}" aria-label="${esc(playerName(t, p.id))}">
    ${seatBoard(p, t, { spendable: new Set(), chosen: null, preludes: [], maxCards: 6, head: leaderPortrait(p) })}
  </button>${playedCard(ix, v, t, p.id)}</div>`;
}

/**
 * The local seat's board, like the physical one: a slot is clickable when its
 * token can be spent; the prelude tab lights the cards whose power can be used now.
 */
export function localPanel(p: PlayerView, t: Translate, spendable: ReadonlySet<number>, chosen: number | null, preludes: readonly PreludeCard[] = []): string {
  const head = `<button type="button" class="portrait-btn" data-act="seat-detail" data-player="${p.id}" aria-label="${esc(playerName(t, p.id))}">${leaderPortrait(p)}</button>`;
  return `<div class="board pb local s-${seatColor(p.id)}${p.isActive ? ' active' : ''}">
    ${seatBoard(p, t, { spendable, chosen, preludes, maxCards: 9, head })}
  </div>`;
}

/** Glyphs of the ambition a card of this number can declare ('any': a free choice), or [] when it declares none. */
export function declareGlyphs(ix: ContentIndex, number: number): IconName[] {
  const amb = ix.content.declareByNumber[String(number)];
  if (!amb) return [];
  if (amb === 'any') return ['anyAmbition'];
  const metric = ix.content.ambitionMetrics[amb];
  const byResource: Record<string, IconName> = { fuel: 'ambFuel', material: 'ambMaterial', relic: 'ambRelic', psionic: 'ambPsionic' };
  // Tycoon draws the barrel before the crate, as on the ambition board.
  if (metric?.kind === 'resources') return [...(metric.resources ?? [])].sort((a, b) => (a === 'fuel' ? -1 : b === 'fuel' ? 1 : 0)).map((r) => byResource[r] ?? (r as IconName));
  return [metric?.kind === 'captives' || amb === 'captives' ? 'ambCaptives' : 'ambTrophies'];
}

/**
 * An action card, tall and narrow: its number, one star per action it gives,
 * the glyphs of the actions of its suit, and the ambition it can declare.
 * Everything comes from the card's data, so a card with unusual values (an
 * Event, a Fate's own card) draws the same way; a number of 0 shows `label`.
 */
export function actionCard(ix: ContentIndex, c: ActionCardView, t: Translate, extra = '', label = ''): string {
  const pips = Array.from({ length: c.pips }, () => icon('pip')).join('');
  // The printed cards name their actions in words (no action icons exist): so do we.
  const kinds = c.kinds.map((k) => `<span class="kw">${esc(t(`action.${k}`))}</span>`).join('');
  const declares = c.number > 0 ? declareGlyphs(ix, c.number) : [];
  const ambName = t(`ambition.${ix.content.declareByNumber[String(c.number)]}`);
  const amb = declares.length ? `<span class="amb" title="${esc(t('card.declares', { amb: ambName }))}">${declares.map((g) => icon(g)).join('')}</span>` : '<span class="amb"></span>';
  const known = c.suit in ix.content.suits;
  const title = `${known ? cardLabel(t, c) : label} · ${t('card.pips', { n: c.pips })}${c.kinds.length ? ` · ${c.kinds.map((k) => t(`action.${k}`)).join(', ')}` : ''}`;
  const top = c.number > 0 ? `<span class="n">${c.number}</span>` : `<span class="n word">${esc(label)}</span>`;
  return `<div class="acard ${known ? suitClass(ix, c.suit) : 'su-x'} ${extra}" title="${esc(title)}">${top}<span class="pips">${pips}</span><span class="kinds">${kinds}</span>${amb}</div>`;
}

/** An ambition marker: a small hexagon with its first-place value over its second-place one. */
function hexMarker(m: { id: string; first: number; second: number }, t: Translate): string {
  return `<span class="hexm" title="${esc(t('amb.marker', { first: m.first, second: m.second }))}"><b class="num">${m.first}</b><i class="num">${m.second}</i></span>`;
}

/**
 * The ambitions as the digital table's right column: the markers still to
 * declare in hexagon slots on top, then one row per ambition in card-number
 * order (2 to 6): its number and glyphs, the markers declared on it, and every
 * seat's count as a coloured dot, highest first, the places it would score
 * now lit. Names are in the tooltips.
 */
export function ambitionsStrip(ix: ContentIndex, v: TableView, t: Translate): string {
  const numberOf = (a: string) => Number(Object.entries(ix.content.declareByNumber).find(([, x]) => x === a)?.[0] ?? 0);
  const rows = [...v.ambitions]
    .sort((x, y) => numberOf(x.id) - numberOf(y.id))
    .map((a) => {
      const n = numberOf(a.id);
      const glyphs = n ? declareGlyphs(ix, n).map((g) => icon(g)).join('') : '';
      const place = (p: number) => (a.first.includes(p) ? ' first' : a.second.includes(p) ? ' second' : '');
      const tallies = [...a.tallies]
        .sort((x, y) => y.value - x.value)
        .map((x) => `<span class="tl s-${seatColor(x.player)}${x.value ? '' : ' zero'}${place(x.player)}" title="${esc(`${playerName(t, x.player)}: ${x.value}`)}"><b class="num">${x.value}</b><i class="dot"></i></span>`)
        .join('');
      const box = a.box ? `<span class="box num" title="${esc(t('amb.box'))}">▣${a.box}</span>` : '';
      const name = t(`ambition.${a.id}`);
      return `<button type="button" class="amb-row${a.markers.length ? ' declared' : ''}" data-act="amb-detail" data-id="${a.id}" title="${esc(name)}" aria-label="${esc(name)}">
        <span class="amb-head">${n ? `<span class="amb-n num">${n}</span>` : ''}<span class="amb-g">${glyphs}</span></span>
        <span class="amb-m">${a.markers.map((m) => hexMarker(m, t)).join('')}${box}</span>
        <span class="amb-t">${tallies}</span></button>`;
    })
    .join('');
  const left = v.markersLeft.map((m) => hexMarker(m, t)).join('');
  const empty = Array.from({ length: Math.max(0, 3 - v.markersLeft.length) }, () => '<span class="hexm empty"></span>').join('');
  return `<div class="amb-left" title="${esc(t('ambitions.available'))}" aria-label="${esc(t('ambitions'))}">${left}${empty}</div><div class="amb-rows">${rows}</div>`;
}

/** Small portrait face of a Court card: its image when present, else a drawn placeholder with its data. */
export function courtFace(c: CourtFaceData, t: Translate): string {
  const art = cardArt(c.card);
  if (art) return `<img class="face-img" src="${esc(art)}" alt="">`;
  const keys = c.keys ? `<span>${icon('key')}${c.keys}</span>` : '';
  return `<span class="face-ph"><b>${esc(c.card)}</b><span>${c.kind ? esc(t(`card.kind.${c.kind}`)) : ''}</span><span class="face-ph-foot">${c.resource ? resIcon(c.resource, t) : ''}${keys}</span></span>`;
}

/**
 * The Court as the digital table's banners down the right column: each card's
 * picture cropped to a strip with the agents on it per seat beside it;
 * `pickable` cards glow and pick on click.
 */
export function courtPanel(v: TableView, t: Translate, pickable: ReadonlySet<number>): string {
  const cards = v.court
    .map((c) => {
      // Agents beside the card, outside it: the seat's agent piece and how many, one row per seat.
      const agents = c.agents
        .map((a) => {
          const pic = assetUrl(`piece.agent-${seatColor(a.player)}`);
          return `<span class="cb-agent s-${seatColor(a.player)}" title="${esc(`${playerName(t, a.player)}: ${a.count}`)}">${pic ? `<img src="${esc(pic)}" alt="">` : icon('agent')}<b class="num">${a.count}</b></span>`;
        })
        .join('');
      const label = c.name ?? c.card;
      return `<div class="court-slot"><button type="button" class="court-tile banner k-${esc(c.kind ?? 'none')}${pickable.has(c.slot) ? ' pickable' : ''}" data-act="court" data-slot="${c.slot}" data-zoom="${esc(c.card)}" data-agents="${esc(c.agents.map((a) => `${a.player}:${a.count}`).join(','))}" aria-label="${esc(label)}">${courtBanner(c)}</button><span class="cb-agents">${agents}</span></div>`;
    })
    .join('');
  return `<div class="court-row" title="${esc(t('court.deck', { n: v.courtDeck }))}">${cards}</div>`;
}

/** The right column: the ambitions on top, the Court under them. */
export function sidePanel(ix: ContentIndex, v: TableView, t: Translate, pickable: ReadonlySet<number>): string {
  return `<div class="side-amb" data-region="ambitions">${ambitionsStrip(ix, v, t)}</div><div class="side-court" data-region="court">${courtPanel(v, t, pickable)}</div>`;
}

/** The local hand with its caption; `selected` is raised. */
export function handPanel(ix: ContentIndex, v: TableView, t: Translate, selected: string | null, mine: boolean, seizeWith: string | null = null, tools = ''): string {
  // Fanned like a hand of cards: each card turned a little more the further it is from the middle.
  const n = v.hand.length;
  const cards = v.hand
    .map((h, i) => {
      const cls = `hand-card${h.playable ? '' : ' unplayable'}${selected === h.card ? ' selected' : ''}${seizeWith === h.card ? ' seize-mark' : ''}`;
      const off = i - (n - 1) / 2;
      return `<button type="button" class="${cls}" style="--fan:${(off * 4).toFixed(1)}deg;--drop:${(off * off * 2.2).toFixed(1)}px" data-act="hand" data-card="${esc(h.card)}" aria-pressed="${selected === h.card}" aria-label="${esc(cardLabel(t, h))}">${actionCard(ix, h, t)}</button>`;
    })
    .join('');
  return `<div class="hand-top">${tools}</div><div class="hand-cards" aria-label="${esc(t(mine ? 'hand.title' : 'hand.waiting'))}">${cards || `<div class="hand-empty">${esc(t('empty'))}</div>`}</div>`;
}

/** A Court card as shown in the picker (the large variant). */
export function largeCard(c: CourtFaceData, t: Translate, state: { selected: boolean; disabled: boolean }): string {
  const art = cardArt(c.card);
  const keys = Array.from({ length: c.keys }, () => icon('key')).join('');
  const cls = `lcard${state.selected ? ' selected' : ''}${state.disabled ? ' disabled' : ''}${art ? ' full-art' : ''}`;
  const attrs = `data-act="pick" data-card="${esc(c.card)}"${state.disabled ? ' aria-disabled="true"' : ''} aria-pressed="${state.selected}" aria-label="${esc(c.card)}"`;
  // Drawn from the kit when the card's text is known, else the picture is the whole card face.
  if (hasKitFace(c)) return `<button type="button" class="${cls} kit" ${attrs}>${courtCardFace(c)}</button>`;
  if (art) return `<button type="button" class="${cls}" ${attrs}><img class="lcard-img" src="${esc(art)}" alt=""></button>`;
  return `<button type="button" class="${cls}" ${attrs}>
    <div class="lcard-top"><span class="lcard-keys">${keys}</span>${c.resource ? `<span class="lcard-res">${resIcon(c.resource, t)}</span>` : ''}</div>
    <div class="lcard-art">${art ? `<img src="${esc(art)}" alt="">` : esc(c.card)}</div>
    <div class="lcard-name">${esc(c.card)}</div>
    <div class="lcard-foot"><span>${c.kind ? esc(t(`card.kind.${c.kind}`)) : ''}</span><span>${esc(c.card)}</span></div>
  </button>`;
}

/** One tab of the card picker: a seat, or a neutral group such as the Court. */
export interface PickerGroup {
  owner: number | null;
  label: string;
  /** The cards, with the agents already on them (Court cards). */
  cards: (CourtFaceData & { agents?: { player: number; count: number }[] })[];
}

/** Card picker state (docs/ui/UI_SPEC.md §11 CardPickerModal). */
export interface PickerState {
  title: string;
  actor: number | null;
  groups: PickerGroup[];
  active: number;
  page: number;
  /** Card ids that may be picked; null = only viewing. */
  selectable: ReadonlySet<string> | null;
  selected: string | null;
  allowDiscard: boolean;
}

/** Cards per picker page. */
export const PICKER_PAGE = 4;

/** The card picker's inner HTML. */
export function cardPicker(m: PickerState, t: Translate): string {
  const g = m.groups[m.active];
  const pages = Math.max(1, Math.ceil(g.cards.length / PICKER_PAGE));
  const page = Math.min(m.page, pages - 1);
  const shown = g.cards.slice(page * PICKER_PAGE, page * PICKER_PAGE + PICKER_PAGE);
  const tabs = m.groups
    .map((x, i) => `<button type="button" class="tab${x.owner !== null ? ` s-${seatColor(x.owner)}` : ''}${i === m.active ? ' active' : ''}" data-act="tab" data-tab="${i}" role="tab" aria-selected="${i === m.active}">${x.owner !== null ? portrait(x.owner) : icon('court')}${esc(x.label)}</button>`)
    .join('');
  // Each card with the agents already on it and, while it is the chosen one, the confirm button right under it.
  const cards = shown.length
    ? shown
        .map((c) => {
          const can = m.selectable !== null && m.selectable.has(c.card);
          const chosen = m.selected === c.card;
          const confirm = can ? button('pick-confirm', t('btn.confirm'), { cls: 'primary pick-go' }) : '';
          return `<div class="pick-slot${chosen ? ' chosen' : ''}" data-card="${esc(c.card)}">${largeCard(c, t, { selected: chosen, disabled: m.selectable !== null && !can })}${agentsOnCard(c.agents ?? [], t)}${confirm}</div>`;
        })
        .join('')
    : `<div class="empty-note">${esc(t('empty'))}</div>`;
  return `${m.actor !== null ? `<div class="actor s-${seatColor(m.actor)}">${portrait(m.actor)}</div>` : ''}
    <h2 id="modal-title">${esc(m.title)}</h2>
    <div class="tabs" role="tablist">${tabs}</div>
    <div class="card-row">
      ${button('page', '', { args: { dir: -1 }, cls: 'icon', title: t('btn.prev'), html: icon('prev'), disabled: page === 0 })}
      <div class="cards">${cards}</div>
      ${button('page', '', { args: { dir: 1 }, cls: 'icon', title: t('btn.next'), html: icon('next'), disabled: page >= pages - 1 })}
    </div>
    <div class="modal-foot">
      ${button('close-modal', t('btn.back'))}
      ${m.allowDiscard ? button('discard', '', { cls: 'icon', title: t('btn.discard'), html: icon('trash') }) : '<span></span>'}
      <span></span>
    </div>`;
}

/**
 * The agents on a card in the picker, over the card's bottom edge. `data-agents`
 * ("seat:count,…") lets the table swap the flat pieces for the 3D agents.
 */
export function agentsOnCard(agents: readonly { player: number; count: number }[], t: Translate): string {
  if (!agents.length) return '';
  const groups = agents
    .map((a) => {
      const pic = assetUrl(`piece.agent-${seatColor(a.player)}`);
      const shown = Math.min(a.count, 4);
      const pieces = Array.from({ length: shown }, () => (pic ? `<img src="${esc(pic)}" alt="">` : icon('agent'))).join('');
      return `<span class="ag-group s-${seatColor(a.player)}" title="${esc(`${playerName(t, a.player)}: ${a.count}`)}">${pieces}${a.count > shown ? `<b class="num">×${a.count}</b>` : ''}</span>`;
    })
    .join('');
  const key = agents.map((a) => `${a.player}:${a.count}`).join(',');
  const label = agents.map((a) => `${playerName(t, a.player)}: ${a.count}`).join(', ');
  return `<div class="pick-agents" data-agents="${esc(key)}" title="${esc(label)}">${groups}</div>`;
}
