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

/** Header: chapter, the round's lead, seize, deck counts, general supply, who you are, menu buttons. */
export function header(v: TableView, t: Translate, exampleContent: boolean): string {
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
  return `<div class="chapter-badge">${esc(t('chapter', { n: '' }).trim())}<span class="num">${v.chapter}</span></div>
    <div class="chips">${chips}</div>
    <button type="button" class="supply" data-act="supply-detail" aria-label="${esc(t('supply'))}">${supply}</button>
    ${exampleContent ? `<span class="content-note">${esc(t('content.example'))}</span>` : ''}
    <span class="you s-${v.local % 4}"><span class="seat-c">${icon(seatIcon(v.local))}</span>${esc(t('header.you', { name: playerName(t, v.local) }))}</span>
    <div class="top-buttons">
      ${button('court-view', '', { cls: 'icon', title: t('btn.court'), html: icon('court') })}
      ${button('log', '', { cls: 'icon', title: t('btn.log'), html: icon('log') })}
      ${button('settings', '', { cls: 'icon', title: t('btn.settings'), html: icon('settings') })}
    </div>`;
}

/** The prompt line: what to do now, and an explanation under it. `mine` lights it up when it is the local player's turn. */
export function promptBar(main: string, sub: string, mine: boolean): string {
  return `<div class="prompt${mine ? ' mine' : ''}" role="status" aria-live="polite"><div class="prompt-main">${esc(main)}</div><div class="prompt-sub">${esc(sub)}</div></div>`;
}

/** Latest moves, newest first. */
export function recentPanel(v: TableView, t: Translate): string {
  const items = v.recent.map((r) => `<li>${esc(r)}</li>`).join('');
  return `<div class="glass-title">${esc(t('recent.title'))}</div><ol class="recent-list">${items || `<li>${esc(t('empty'))}</li>`}</ol>`;
}

function stats(p: PlayerView, t: Translate): string {
  const items: [IconName, number, string][] = [
    ['cards', p.handCount, 'stat.hand'],
    ['ship', p.stats.ships, 'stat.ships'],
    ['agent', p.stats.agents, 'stat.agents'],
    ['city', p.stats.cities, 'stat.cities'],
    ['starport', p.stats.starports, 'stat.starports'],
    ['trophy', p.stats.trophies, 'stat.trophies'],
    ['captive', p.stats.captives, 'stat.captives'],
  ];
  return `<div class="stats">${items.map(([ic, n, k]) => `<span title="${esc(t(k))}">${icon(ic, '', t(k))}<b class="num">${n}</b></span>`).join('')}</div>`;
}

function slotsHtml(p: PlayerView, t: Translate, spendable: ReadonlySet<number>, chosen: number | null): string {
  return `<div class="slots">${p.slots
    .map((s) => {
      const keys = `<span class="keys">${s.keys}${icon('key')}</span>`;
      if (s.locked) return `<div class="slot locked" title="${esc(t('slot.locked'))}">${icon('lock')}${keys}</div>`;
      if (!s.resource) return `<div class="slot" title="${esc(t('slot.empty'))}">${keys}</div>`;
      const out = p.outraged.includes(s.resource) ? ' outraged' : '';
      const label = t(`resource.${s.resource}`);
      if (spendable.has(s.index)) {
        return `<button type="button" class="slot spend${out}${chosen === s.index ? ' chosen' : ''}" data-act="spend" data-slot="${s.index}" title="${esc(label)}">${resIcon(s.resource, t)}${keys}</button>`;
      }
      return `<div class="slot${out}" title="${esc(label)}">${resIcon(s.resource, t)}${keys}</div>`;
    })
    .join('')}</div>`;
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

function seatHead(p: PlayerView, t: Translate): string {
  const tags = [
    p.hasInitiative ? `<span class="tag init">${esc(t('initiative'))}</span>` : '',
    p.outraged.length ? `<span class="tag" title="${esc(t('outraged', { list: p.outraged.map((r) => t(`resource.${r}`)).join(', ') }))}">⚠ ${p.outraged.length}</span>` : '',
  ].join('');
  return `<div class="seat-head">${portrait(p.id)}
    <div><div class="seat-name"><span class="seat-c">${icon(seatIcon(p.id))}</span>${esc(playerName(t, p.id))}</div><div class="seat-tags">${tags}</div></div>
    <div class="power" title="${esc(t('stat.power'))}">${p.power}<small>${esc(t('stat.power'))}</small></div></div>`;
}

/** What a seat played this round, as text ("Surpass Aggression 5", or face down). */
export function playedText(v: TableView, t: Translate, player: number): string | null {
  const pl = v.plays.find((x) => x.player === player);
  if (!pl) return null;
  const mode = t(`play.${pl.mode}`);
  return pl.card ? `${mode} ${cardLabel(t, pl.card)}` : mode;
}

/** One rival's panel (click opens their cards). */
export function rivalPanel(v: TableView, p: PlayerView, t: Translate): string {
  const played = playedText(v, t, p.id);
  return `<button type="button" class="glass seat-panel rival s-${p.id % 4}${p.isActive ? ' active' : ''}" data-act="seat-detail" data-player="${p.id}" aria-label="${esc(playerName(t, p.id))}">
    ${seatHead(p, t)}
    <div class="rival-row">${slotsHtml(p, t, new Set(), null)}${miniCards(p.court, 3)}</div>
    ${stats(p, t)}
    <div class="played">${played ? esc(t('rival.played', { what: played })) : '&nbsp;'}</div>
  </button>`;
}

/** The local seat's board: resources (clickable when they can be spent), stats, owned cards. */
export function localPanel(p: PlayerView, t: Translate, spendable: ReadonlySet<number>, chosen: number | null): string {
  return `<div class="glass seat-panel local s-${p.id % 4}${p.isActive ? ' active' : ''}">
    <button type="button" class="seat-head-btn" data-act="seat-detail" data-player="${p.id}" aria-label="${esc(playerName(t, p.id))}">${seatHead(p, t)}</button>
    <div class="local-body">${slotsHtml(p, t, spendable, chosen)}${miniCards(p.court, 5)}</div>
    ${stats(p, t)}
  </div>`;
}

/** An action card (number, suit band, pips). */
export function actionCard(ix: ContentIndex, c: ActionCardView, t: Translate, extra = ''): string {
  const pips = Array.from({ length: c.pips }, () => '<i></i>').join('');
  const sym = assetUrl(`suit.${c.suit}`);
  const band = sym ? `<img class="suit-img" src="${esc(sym)}" alt="">` : esc(suitName(t, c.suit));
  return `<div class="acard ${suitClass(ix, c.suit)} ${extra}" title="${esc(`${cardLabel(t, c)} · ${t('card.pips', { n: c.pips })}`)}"><span class="suit">${band}</span><span class="n">${c.number}</span><span class="pips">${pips}</span></div>`;
}

/** Ambition rows: name, declared markers, every seat's count. */
export function ambitionsPanel(v: TableView, t: Translate): string {
  const rows = v.ambitions
    .map((a) => {
      const markers = a.markers.map((m) => `<span class="marker" title="${esc(m.id)}"><span>${m.first}</span><span>${m.second}</span></span>`).join('');
      const place = (p: number) => (a.first.includes(p) ? 'first' : a.second.includes(p) ? 'second' : '');
      const tallies = a.tallies
        .map((x) => {
          const pl = place(x.player);
          const tag = pl ? `<sup>${esc(t(pl === 'first' ? 'amb.first' : 'amb.second'))}</sup>` : '';
          return `<span class="s-${x.player % 4}${x.value ? '' : ' zero'}${pl ? ` ${pl}` : ''}" title="${esc(playerName(t, x.player))}"><span class="seat-c">${icon(seatIcon(x.player))}</span><b class="num">${x.value}</b>${tag}</span>`;
        })
        .join('');
      const box = a.box ? `<span>▣<b class="num">${a.box}</b></span>` : '';
      return `<button type="button" class="amb-row${a.markers.length ? ' declared' : ''}" data-act="amb-detail" data-id="${a.id}"><span class="amb-name">${esc(t(`ambition.${a.id}`))}</span><span>${markers}</span><span class="tallies">${tallies}${box}</span></button>`;
    })
    .join('');
  const left = v.markersLeft.map((m) => `<span class="marker"><span>${m.first}</span><span>${m.second}</span></span>`).join('');
  return `<div class="glass-title">${esc(t('amb.ifNow'))}</div><div class="amb-rows">${rows}</div><div class="markers-left">${esc(t('ambitions.available'))} ${left || esc(t('empty'))}</div>`;
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
export function handPanel(ix: ContentIndex, v: TableView, t: Translate, selected: string | null, mine: boolean, seizeWith: string | null = null): string {
  const cards = v.hand
    .map((h) => {
      const kinds = h.kinds.map((k) => esc(t(`action.${k}`))).join('<br>');
      const cls = `hand-card${h.playable ? '' : ' unplayable'}${selected === h.card ? ' selected' : ''}${seizeWith === h.card ? ' seize-mark' : ''}`;
      return `<button type="button" class="${cls}" data-act="hand" data-card="${esc(h.card)}" aria-pressed="${selected === h.card}" aria-label="${esc(cardLabel(t, h))}">${actionCard(ix, h, t)}<span class="kinds-mini">${kinds}</span></button>`;
    })
    .join('');
  return `<div class="glass-title">${esc(t(mine ? 'hand.title' : 'hand.waiting'))}</div><div class="hand-cards">${cards || `<div class="hand-empty">${esc(t('empty'))}</div>`}</div>`;
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
