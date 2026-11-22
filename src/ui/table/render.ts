// HUD components as HTML strings, all read from a TableView (docs/ui/UI_SPEC.md
// §4–§11). No rules here: what is clickable comes in as sets computed by
// table.ts from the engine. Buttons carry `data-act` (and data-* arguments),
// read by one delegated click handler in table.ts.

import type { ContentIndex, Resource } from '../../game/engine';
import type { Translate } from '../../i18n';
import { assetUrl, cardArt, icon, seatIcon } from './assets';
import type { IconName } from './assets';
import type { ActionCardView, CourtCardView, PlayerView, TableView } from './view';

/** Escapes text for HTML. */
export const esc = (v: unknown) =>
  String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Display name of a seat. */
export const playerName = (t: Translate, id: number) => t('player.name', { n: id + 1 });

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
 * The top strip: chapter, the Court row (`courtHtml`), the round's lead and
 * seize, deck counts, general supply, the latest move, who you are, menu buttons.
 */
export function header(v: TableView, t: Translate, exampleContent: boolean, courtHtml: string, ambitionsHtml: string, undoHtml: string): string {
  const supply = v.supply.map((s) => `<span title="${esc(t(`resource.${s.resource}`))}">${resIcon(s.resource, t)}<b class="num">${s.count}</b></span>`).join('');
  const declared = v.ambitions.filter((a) => a.markers.length).map((a) => t(`ambition.${a.id}`));
  const lead = v.lead
    ? `${esc(t('header.lead', { card: cardLabel(t, v.lead) }))}${declared.length ? ` · ${esc(t('header.declared', { amb: declared.join(', ') }))}` : ''}`
    : esc(t('header.noLead'));
  const chips = [
    `<span class="chip">${lead}</span>`,
    v.seizedBy !== null ? `<span class="chip">${esc(t('header.seize', { name: playerName(t, v.seizedBy) }))}</span>` : '',
    `<span class="chip">${esc(t('header.deck', { deck: v.deck, discard: v.discard }))}</span>`,
  ].join('');
  const last = v.recent[0] ?? t('empty');
  return `<div class="glass hd chapter-badge">${esc(t('chapter', { n: '' }).trim())}<span class="num">${v.chapter}</span></div>
    <div class="glass hd court-strip" data-region="court">${courtHtml}</div>
    <div class="glass hd amb-strip" data-region="ambitions">${ambitionsHtml}</div>
    <div class="glass hd round-strip"><div class="glass-title">${esc(t('round.title'))}</div><div class="chips">${chips}</div>
      <button type="button" class="supply" data-act="supply-detail" aria-label="${esc(t('supply'))}">${supply}</button></div>
    <div class="glass hd tools">
      ${exampleContent ? `<span class="content-note">${esc(t('content.example'))}</span>` : ''}
      <span class="you s-${v.local % 4}"><span class="seat-c">${icon(seatIcon(v.local))}</span>${esc(t('header.you', { name: playerName(t, v.local) }))}</span>
      <div class="top-buttons">
        ${undoHtml}
        ${button('court-view', '', { cls: 'icon', title: t('btn.court'), html: icon('court') })}
        <span data-region="recent">${button('log', '', { cls: 'icon', title: `${t('btn.log')} · ${t('recent.last')} ${last}`, html: icon('log') })}</span>
        ${button('help', '', { cls: 'icon', title: t('btn.help'), html: icon('anyAmbition') })}
        ${button('settings', '', { cls: 'icon', title: t('btn.settings'), html: icon('settings') })}
      </div>
    </div>`;
}


/** A game piece of a seat as a small picture (the kit's piece image), else its glyph in the seat colour. */
function pieceIcon(kind: 'ship' | 'agent' | 'city' | 'starport', seat: number, label?: string): string {
  const url = assetUrl(`piece.${kind}-${seat % 4}`);
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

/**
 * The resource slots of a board with the cities on it: each unbuilt city sits
 * on the slots it covers (the slot shows under it, locked), and the cities
 * that cover no slot sit after them with the power they add once built.
 */
function slotsHtml(p: PlayerView, t: Translate, spendable: ReadonlySet<number>, chosen: number | null): string {
  const coverOf = (i: number) => p.cities.find((c) => !c.built && c.slots.includes(i));
  const slots = p.slots
    .map((s) => {
      const keys = `<span class="keys">${Array.from({ length: s.keys }, () => icon('key')).join('')}</span>`;
      const city = coverOf(s.index);
      if (s.locked) {
        const on = city ? `<span class="on-city">${pieceIcon('city', p.id)}</span>` : icon('lock');
        return `<div class="slot locked" title="${esc(t('slot.locked'))}">${keys}<span class="well">${on}</span></div>`;
      }
      if (!s.resource) return `<div class="slot" title="${esc(t('slot.empty'))}">${keys}<span class="well"></span></div>`;
      const out = p.outraged.includes(s.resource) ? ' outraged' : '';
      const label = t(`resource.${s.resource}`);
      if (spendable.has(s.index)) {
        return `<button type="button" class="slot spend${out}${chosen === s.index ? ' chosen' : ''}" data-act="spend" data-slot="${s.index}" title="${esc(label)}">${keys}<span class="well">${resIcon(s.resource, t)}</span></button>`;
      }
      return `<div class="slot${out}" title="${esc(label)}">${keys}<span class="well">${resIcon(s.resource, t)}</span></div>`;
    })
    .join('');
  const bonus = p.cities
    .filter((c) => !c.slots.length)
    .map((c) => `<div class="slot bonus${c.built ? ' built' : ''}" title="${esc(t('slot.bonus', { n: c.bonus }))}"><span class="keys plus num">+${c.bonus}</span><span class="well">${c.built ? '' : `<span class="on-city">${pieceIcon('city', p.id)}</span>`}</span></div>`)
    .join('');
  return `<div class="slots">${slots}${bonus ? `<span class="slot-sep"></span>${bonus}` : ''}</div>`;
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
  return `<div class="play${pl.mode === 'lead' ? ' lead' : ''}">${face}<span class="how">${esc(t(`played.${pl.mode}`))}${pl.seized ? ' ↺' : ''}</span></div>`;
}

/**
 * One rival's board (click opens their details), drawn like the local one
 * but smaller. The card they played sits beside it.
 */
export function rivalPanel(ix: ContentIndex, v: TableView, p: PlayerView, t: Translate): string {
  return `<div class="rival-wrap"><button type="button" class="board pb rival s-${p.id % 4}${p.isActive ? ' active' : ''}" data-act="seat-detail" data-player="${p.id}" aria-label="${esc(playerName(t, p.id))}">
    ${seatBoard(p, t, { spendable: new Set(), chosen: null, preludes: [], maxCards: 6, head: leaderPortrait(p) })}
  </button>${playedCard(ix, v, t, p.id)}</div>`;
}

/**
 * The local seat's board, like the physical one: a slot is clickable when its
 * token can be spent; the prelude tab lights the cards whose power can be used now.
 */
export function localPanel(p: PlayerView, t: Translate, spendable: ReadonlySet<number>, chosen: number | null, preludes: readonly PreludeCard[] = []): string {
  const head = `<button type="button" class="portrait-btn" data-act="seat-detail" data-player="${p.id}" aria-label="${esc(playerName(t, p.id))}">${leaderPortrait(p)}</button>`;
  return `<div class="board pb local s-${p.id % 4}${p.isActive ? ' active' : ''}">
    ${seatBoard(p, t, { spendable, chosen, preludes, maxCards: 9, head })}
  </div>`;
}

/** The local player's Court cards, side by side (hover zooms, click opens the seat's details). */
export function ownedPanel(ix: ContentIndex, p: PlayerView, t: Translate): string {
  const cards = p.court
    .map((id) => {
      const d = ix.courtCards.get(id);
      const face = courtFace({ card: id, kind: d?.kind ?? null, resource: d?.resource ?? null, keys: d?.keys ?? 0 }, t);
      return `<button type="button" class="court-tile owned" data-act="seat-detail" data-player="${p.id}" data-zoom="${esc(id)}" aria-label="${esc(id)}"><span class="court-face">${face}</span></button>`;
    })
    .join('');
  return `<div class="glass-title">${esc(t('owned.title'))} · ${p.court.length}</div><div class="owned-row">${cards || `<div class="hand-empty" title="${esc(t('owned.none'))}">${icon('court')}</div>`}</div>`;
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
 * The ambitions as one horizontal strip, a column per ambition in card-number
 * order (2 to 6): its number and glyphs, the markers declared on it, and every
 * seat's count highest first, the places it would score now lit. The markers
 * still to declare sit by the title. Almost no text: names are in the tooltips.
 */
export function ambitionsStrip(ix: ContentIndex, v: TableView, t: Translate): string {
  const numberOf = (a: string) => Number(Object.entries(ix.content.declareByNumber).find(([, x]) => x === a)?.[0] ?? 0);
  const cols = [...v.ambitions]
    .sort((x, y) => numberOf(x.id) - numberOf(y.id))
    .map((a) => {
      const n = numberOf(a.id);
      const glyphs = n ? declareGlyphs(ix, n).map((g) => icon(g)).join('') : '';
      const place = (p: number) => (a.first.includes(p) ? ' first' : a.second.includes(p) ? ' second' : '');
      const tallies = a.tallies
        .map((x) => `<span class="tl s-${x.player % 4}${x.value ? '' : ' zero'}${place(x.player)}" title="${esc(`${playerName(t, x.player)}: ${x.value}`)}"><span class="seat-c">${icon(seatIcon(x.player))}</span><b class="num">${x.value}</b></span>`)
        .join('');
      const box = a.box ? `<span class="box num" title="${esc(t('amb.box'))}">▣${a.box}</span>` : '';
      const name = t(`ambition.${a.id}`);
      return `<button type="button" class="amb-col${a.markers.length ? ' declared' : ''}" data-act="amb-detail" data-id="${a.id}" title="${esc(name)}" aria-label="${esc(name)}">
        <span class="amb-head">${n ? `<span class="amb-n num">${n}</span>` : ''}<span class="amb-g">${glyphs}</span><span class="amb-m">${a.markers.map((m) => hexMarker(m, t)).join('')}${box}</span></span>
        <span class="amb-t">${tallies}</span></button>`;
    })
    .join('');
  const left = v.markersLeft.map((m) => hexMarker(m, t)).join('');
  return `<div class="amb-top"><span class="amb-title">${esc(t('ambitions'))}</span><span class="amb-left" title="${esc(t('ambitions.available'))}">${left}</span></div><div class="amb-cols">${cols}</div>`;
}

/** Small portrait face of a Court card: its image when present, else a drawn placeholder with its data. */
export function courtFace(c: Pick<CourtCardView, 'card' | 'kind' | 'resource' | 'keys'>, t: Translate): string {
  const art = cardArt(c.card);
  if (art) return `<img class="face-img" src="${esc(art)}" alt="">`;
  const keys = c.keys ? `<span>${icon('key')}${c.keys}</span>` : '';
  return `<span class="face-ph"><b>${esc(c.card)}</b><span>${c.kind ? esc(t(`card.kind.${c.kind}`)) : ''}</span><span class="face-ph-foot">${c.resource ? resIcon(c.resource, t) : ''}${keys}</span></span>`;
}

/** Court row: the cards side by side with the agents on each; `pickable` slots glow and pick on click. */
export function courtPanel(v: TableView, t: Translate, pickable: ReadonlySet<number>): string {
  const cards = v.court
    .map((c) => {
      const agents = c.agents.map((a) => `<span class="agent s-${a.player % 4}" title="${esc(playerName(t, a.player))}">${icon('agent')}${a.count}</span>`).join('');
      return `<button type="button" class="court-tile${pickable.has(c.slot) ? ' pickable' : ''}" data-act="court" data-slot="${c.slot}" data-zoom="${esc(c.card)}" aria-label="${esc(c.card)}">
        <span class="court-face">${courtFace(c, t)}</span><span class="agents">${agents || '&nbsp;'}</span></button>`;
    })
    .join('');
  return `<div class="glass-title">${esc(t('court'))} · ${esc(t('court.deck', { n: v.courtDeck }))}</div><div class="court-row">${cards}</div>`;
}

/** The local hand with its caption; `selected` is raised. */
export function handPanel(ix: ContentIndex, v: TableView, t: Translate, selected: string | null, mine: boolean, seizeWith: string | null = null, tools = ''): string {
  const cards = v.hand
    .map((h) => {
      const cls = `hand-card${h.playable ? '' : ' unplayable'}${selected === h.card ? ' selected' : ''}${seizeWith === h.card ? ' seize-mark' : ''}`;
      return `<button type="button" class="${cls}" data-act="hand" data-card="${esc(h.card)}" aria-pressed="${selected === h.card}" aria-label="${esc(cardLabel(t, h))}">${actionCard(ix, h, t)}</button>`;
    })
    .join('');
  const played = v.plays.some((x) => x.player === v.local) ? `<div class="own-play">${playedCard(ix, v, t, v.local)}</div>` : '';
  return `<div class="hand-top"><span class="glass-title">${esc(t(mine ? 'hand.title' : 'hand.waiting'))}</span>${tools}</div><div class="hand-cards">${played}${cards || `<div class="hand-empty">${esc(t('empty'))}</div>`}</div>`;
}

/** A Court card as shown in the picker (the large variant). */
export function largeCard(c: Pick<CourtCardView, 'card' | 'kind' | 'resource' | 'keys'>, t: Translate, state: { selected: boolean; disabled: boolean }): string {
  const art = cardArt(c.card);
  const keys = Array.from({ length: c.keys }, () => icon('key')).join('');
  const cls = `lcard${state.selected ? ' selected' : ''}${state.disabled ? ' disabled' : ''}${art ? ' full-art' : ''}`;
  const attrs = `data-act="pick" data-card="${esc(c.card)}"${state.disabled ? ' aria-disabled="true"' : ''} aria-pressed="${state.selected}" aria-label="${esc(c.card)}"`;
  // With an image, the image is the whole card face.
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
  cards: Pick<CourtCardView, 'card' | 'kind' | 'resource' | 'keys'>[];
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
    .map((x, i) => `<button type="button" class="tab${x.owner !== null ? ` s-${x.owner % 4}` : ''}${i === m.active ? ' active' : ''}" data-act="tab" data-tab="${i}" role="tab" aria-selected="${i === m.active}">${x.owner !== null ? portrait(x.owner) : icon('court')}${esc(x.label)}</button>`)
    .join('');
  const cards = shown.length
    ? shown.map((c) => largeCard(c, t, { selected: m.selected === c.card, disabled: m.selectable !== null && !m.selectable.has(c.card) })).join('')
    : `<div class="empty-note">${esc(t('empty'))}</div>`;
  return `${m.actor !== null ? `<div class="actor s-${m.actor % 4}">${portrait(m.actor)}</div>` : ''}
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
      ${m.selectable ? button('pick-confirm', t('btn.confirm'), { cls: 'primary', disabled: !m.selected }) : '<span></span>'}
    </div>`;
}
