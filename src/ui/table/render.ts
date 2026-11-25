// HUD components as HTML strings, all read from a TableView (docs/ui/UI_SPEC.md
// §4–§11). No rules here: what is clickable comes in as sets computed by
// table.ts from the engine. Buttons carry `data-act` (and data-* arguments),
// read by one delegated click handler in table.ts.

import { RESOURCES } from '../../game/engine';
import type { ContentIndex, Resource } from '../../game/engine';
import type { Translate } from '../../i18n';
import { assetUrl, cardArt, cardAvatar, cardCut, icon, seatColor, seatIcon } from './assets';
import type { IconName } from './assets';
import { cardFaceById, courtBanner, courtCardFace, hasKitFace } from './cardface';
import type { CourtFaceData } from './cardface';
import { REGIONS } from './layout';
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

/** A resource's icon, labelled with its name (`cls`: extra classes). */
export function resIcon(r: Resource, t: Translate, cls = ''): string {
  return `<span class="r-${r} ${cls}">${icon(r as IconName, '', t(`resource.${r}`))}</span>`;
}

/** Simple line glyphs for the action kinds (24×24, currentColor). */
const ACTION_GLYPHS: Record<string, string> = {
  influence: '<circle cx="12" cy="6.5" r="3.5"/><path d="M6 21c0-5 2.5-9 6-9s6 4 6 9z"/>',
  move: '<path d="M3 13l7-1 4-7 2 1-2 6 6 1 1 2-6 1 2 6-2 1-4-7-7-1z"/>',
  build: '<path d="M3 21V11l5-3v3l5-3v3l5-3v13zM9 21v-4h3v4"/>',
  repair: '<path d="M14.5 3.5a5 5 0 0 0-5.6 6.7L3 16.1 5.9 19l5.9-5.9a5 5 0 0 0 6.7-5.6l-3 3-2.8-.7-.7-2.8z"/>',
  tax: '<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 10v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-4M5 14v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-4"/>',
  battle: '<path d="M4 3l9 9-2 2-9-9V3zM20 3v2l-9 9-2-2 9-9zM6 15l3 3-2 2-1-1-2 2-1-1 2-2-1-1zM18 15l-3 3 2 2 1-1 2 2 1-1-2-2 1-1z"/>',
  secure: '<path d="M3 8l4.5 3.5L12 4l4.5 7.5L21 8l-2 10H5zM5 20h14"/>',
};

/** The glyph of action kind `kind`, as inline SVG. */
export function actionIcon(kind: string): string {
  const g = ACTION_GLYPHS[kind];
  return g ? `<svg class="act-ic" viewBox="0 0 24 24" aria-hidden="true">${g}</svg>` : '';
}

/** A system as the table names it: its resource and cluster number ("Armi 4"), or "Gate 6". */
export function systemName(s: { id: string; cluster?: string; kind?: string; resource?: string | null } | undefined, t: Translate, id = s?.id ?? ''): string {
  const n = (s?.cluster ?? id).replace(/\D/g, '');
  return s?.kind === 'planet' && s.resource ? t('move.sysPlanet', { res: t(`resource.${s.resource}`), n }) : t('move.sysGate', { n });
}

/** The system's name with its resource icon in front, as HTML. */
export function systemTag(s: { id: string; cluster?: string; kind?: string; resource?: string | null } | undefined, t: Translate): string {
  const r = s?.kind === 'planet' && s.resource ? `<span class="r-${s.resource}">${icon(s.resource as IconName)}</span> ` : '';
  return `<span class="sys-tag">${r}${esc(systemName(s, t))}</span>`;
}

/**
 * The top strip, as on the digital table: the chapter in a ring and the
 * general supply (left); the prompt over a thin gold line, with the round's
 * lead and seize under it (centre); the menu buttons (right). `control`:
 * whether the map shows who controls each sector (null: the map has no such
 * layer); `open`: the drop-down open under its button (log or help);
 * `flat`: whether the planets are drawn in 2D as on the board (null: no such pictures).
 */
export function header(v: TableView, t: Translate, exampleContent: boolean, promptText: string, control: boolean | null = null, open: 'log' | 'help' | 'piles' | null = null, flat: boolean | null = null): string {
  const supply = v.supply.map((s) => `<span title="${esc(t(`resource.${s.resource}`))}">${resIcon(s.resource, t)}<b class="num">${s.count}</b></span>`).join('');
  const declared = v.ambitions.filter((a) => a.markers.length).map((a) => t(`ambition.${a.id}`));
  // The lead card lies on the table: the line under the hand does not repeat it (production/base-fixes.md #36).
  const notes = [
    declared.length ? t('header.declared', { amb: declared.join(', ') }) : '',
    v.lead?.kept ? t('header.kept', { n: v.lead.number }) : '',
    v.seizedBy !== null ? t('header.seize', { name: playerName(t, v.seizedBy) }) : '',
  ].filter(Boolean);
  const last = v.recent[0] ?? t('empty');
  const round = `${t('chapter', { n: v.chapter })} · ${t('header.deck', { deck: v.deck, discard: v.discard })}`;
  return `<div class="hd round-c" title="${esc(round)}" aria-label="${esc(round)}"><span class="num">${v.chapter}</span></div>
    <div class="hd supply" role="group" aria-label="${esc(t('supply'))}">${supply}</div>
    <div class="hd prompt"><span class="pr-text" title="${esc(promptText)}">${esc(promptText)}</span>${notes.length ? `<span class="pr-notes">${esc(notes.join(' · '))}</span>` : ''}</div>
    <div class="hd tools">
      ${exampleContent ? `<span class="content-note">${esc(t('content.example'))}</span>` : ''}
      <span data-region="recent">${button('log', '', { cls: `icon sq${open === 'log' ? ' on' : ''}`, title: `${t('btn.log')} · ${t('recent.last')} ${last}`, html: icon('log') })}</span>
      ${control !== null ? `<button type="button" class="btn icon sq${control ? ' on' : ''}" data-act="map-control" title="${esc(t('btn.control'))}" aria-label="${esc(t('btn.control'))}" aria-pressed="${control}">${icon('control')}</button>` : ''}
      ${flat !== null ? `<button type="button" class="btn icon sq${flat ? ' on' : ''}" data-act="map-planets" title="${esc(t('btn.planets2d'))}" aria-label="${esc(t('btn.planets2d'))}" aria-pressed="${flat}">${icon('planet')}</button>` : ''}
      ${button('help', '', { cls: `icon sq${open === 'help' ? ' on' : ''}`, title: t('btn.help'), html: icon('anyAmbition') })}
      ${button('settings', '', { cls: 'icon sq', title: t('btn.settings'), html: icon('settings') })}
    </div>`;
}

/** A game piece of a seat as a small picture (the kit's piece image), else its glyph in the seat colour. */
export function pieceIcon(kind: 'ship' | 'agent' | 'city' | 'starport', seat: number, label?: string): string {
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
  // Two blocks, each its icon, name and count; pointing at one shows whose pieces they are.
  const block = (what: 'trophies' | 'captives', glyph: IconName, n: number) =>
    `<span class="sp-block sp-${what}${n ? '' : ' none'}" data-tip="spoils:${p.id}-${what}" tabindex="0">${icon(glyph, '', t(`stat.${what}`))}<span class="sp-name">${esc(t(`stat.${what}`))}</span><b class="num">${n}</b></span>`;
  return `<div class="spoils">${block('trophies', 'ambTrophies', p.stats.trophies)}${block('captives', 'ambCaptives', p.stats.captives)}</div>`;
}

/** The name bar under a seat board: seat shape, name, initiative, `extra` (a rival band's chips), and power in a laurel ring. */
function nameBar(p: PlayerView, t: Translate, extra = ''): string {
  const token = assetUrl('token.initiative');
  const mark = token ? `<img class="ic init-img" src="${esc(token)}" alt="${esc(t('initiative'))}">` : icon('power', '', t('initiative'));
  const title = p.initiativeSeized ? t('initiative.seized') : t('initiative');
  const init = p.hasInitiative ? `<span class="init-mark${p.initiativeSeized ? ' seized' : ''}" title="${esc(title)}">${mark}</span>` : '';
  return `<div class="name-bar"><span class="seat-c">${icon(seatIcon(p.id))}</span><span class="nm">${esc(playerName(t, p.id))}</span>${init}${extra}<span class="pow num" title="${esc(t('stat.power'))}">${p.power}</span></div>`;
}

/** The city triangle printed on the board (rounded corners, like the map's), as an SVG outline. */
const CITY_TRIANGLE = (() => {
  const pts = roundedTriangle(100, 9.6, 5);
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
function slotsHtml(p: PlayerView, t: Translate, spendable: ReadonlySet<number>, chosen: number | null, arrange = false): string {
  // Rearranging: every open slot takes a dragged token, every token can be dragged.
  const drop = (i: number) => (arrange ? ` data-drop="${i}"` : '');
  const drag = (i: number) => (arrange ? ` draggable="true" data-drag="${i}"` : '');
  const slot = (i: number, covered: boolean) => {
    const s = p.slots[i];
    // The keys as the Court cards print them: the kit's 1, 2 or 3 key tab.
    const tab = s.keys > 0 ? assetUrl(`cardkit.cost-${Math.min(3, s.keys)}`) : null;
    const keys = tab
      ? `<span class="keys kit" style="background-image:url('${esc(tab)}')" aria-label="${s.keys}"></span>`
      : `<span class="keys">${Array.from({ length: s.keys }, () => icon('key')).join('')}</span>`;
    if (s.locked) return `<div class="slot locked${covered ? ' covered' : ''}" title="${esc(t('slot.locked'))}">${keys}<span class="well">${covered ? '' : icon('lock')}</span></div>`;
    if (!s.resource) return `<div class="slot${covered ? ' covered' : ''}${arrange ? ' drop' : ''}"${drop(s.index)} title="${esc(t('slot.empty'))}">${keys}<span class="well"></span></div>`;
    const out = p.outraged.includes(s.resource) ? ' outraged' : '';
    const cls = `slot${covered ? ' covered' : ''}${out}${arrange ? ' drop' : ''}`;
    const label = t(`resource.${s.resource}`);
    if (spendable.has(s.index)) {
      return `<button type="button" class="${cls} spend${chosen === s.index ? ' chosen' : ''}" data-act="spend" data-slot="${s.index}"${drop(s.index)}${drag(s.index)} title="${esc(label)}">${keys}<span class="well">${resIcon(s.resource, t)}</span></button>`;
    }
    return `<div class="${cls}"${drop(s.index)}${drag(s.index)} title="${esc(label)}">${keys}<span class="well">${resIcon(s.resource, t)}</span></div>`;
  };
  const onCity = (built: boolean) => (built ? '' : `<span class="on-city">${pieceIcon('city', p.id)}</span>`);
  const covered = new Set(p.cities.flatMap((c) => c.slots));
  const free = p.slots.filter((s) => !covered.has(s.index) && !s.onCard).map((s) => slot(s.index, false));
  // A slot on a held lore card (Ancient Holdings, lore-13): after the board's, marked as the card's.
  const onCards = p.slots.filter((s) => s.onCard).map((s) => `<div class="card-slot" title="${esc(t('slot.onCard'))}">${slot(s.index, false)}</div>`);
  const cities = p.cities.map((c) => {
    if (c.slots.length) {
      const pair = c.slots.length > 1 ? ' pair' : '';
      return `<div class="cover${pair}${c.built ? ' built' : ''}">${c.slots.map((i) => slot(i, true)).join('')}${CITY_TRIANGLE}${onCity(c.built)}</div>`;
    }
    return `<div class="cover bonus${c.built ? ' built' : ''}" title="${esc(t('slot.bonus', { n: c.bonus }))}"><span class="keys"></span><span class="tri-cell">${CITY_TRIANGLE}<b class="plus num">+${c.bonus}</b></span>${onCity(c.built)}</div>`;
  });
  return `<div class="slots">${free.join('')}${cities.join('')}${onCards.join('')}</div>`;
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

/** The leader's character (cut from its card) when the seat has a leader (hover or focus shows the whole card), else the seat portrait. */
/**
 * Gives every leader avatar under `root` its picture's proportions (`--ar`,
 * width / height), so the CSS can size each to about the same area whatever
 * its shape (a wide one lower, a tall one narrower).
 */
export function sizeAvatars(root: ParentNode): void {
  for (const img of root.querySelectorAll<HTMLImageElement>('.portrait.leader.bust img')) {
    const set = () => {
      if (img.naturalWidth && img.naturalHeight) img.style.setProperty('--ar', (img.naturalWidth / img.naturalHeight).toFixed(3));
    };
    if (img.complete) set();
    else img.addEventListener('load', set, { once: true });
  }
}

function leaderPortrait(p: PlayerView): string {
  // `bust`: the character cut out of its card, with no frame: it rises out of the board's top edge.
  const avatar = p.leader ? cardAvatar(p.leader) : null;
  if (avatar) return `<div class="portrait leader bust" data-zoom="${esc(p.leader)}" tabindex="0"><img src="${esc(avatar)}" alt=""></div>`;
  const art = p.leader ? (cardCut(p.leader) ?? cardArt(p.leader)) : null;
  return art ? `<div class="portrait leader" data-zoom="${esc(p.leader)}" tabindex="0"><img src="${esc(art)}" alt=""></div>` : portrait(p.id);
}

/** A card with a prelude power on the board's tab: lit (and clickable) when it can be used now. */
export interface PreludeCard {
  card: string;
  lit: boolean;
}

/**
 * The cards with a prelude power as round buttons (a lit one uses its power,
 * or offers its choices beside it): the tab on a seat board, or (`row`) the
 * row in the action box.
 */
export function preludeTab(cards: readonly PreludeCard[], t: Translate, row = false): string {
  if (!cards.length) return '';
  const btns = cards
    .map((c) => {
      const art = cardCut(c.card) ?? cardArt(c.card);
      const face = art ? `<img src="${esc(art)}" alt="">` : icon('court');
      return c.lit
        ? `<button type="button" class="pre lit" data-act="power-card" data-card="${esc(c.card)}" data-zoom="${esc(c.card)}" title="${esc(t('powers.title'))}">${face}</button>`
        : `<span class="pre" data-zoom="${esc(c.card)}" title="${esc(c.card)}">${face}</span>`;
    })
    .join('');
  if (row) return `<div class="pre-row" aria-label="${esc(t('powers.title'))}"><span class="pre-label">${esc(t('prelude.row'))}</span>${btns}</div>`;
  return `<div class="pb-tab" aria-label="${esc(t('powers.title'))}">${btns}</div>`;
}

/**
 * A seat board drawn like the physical one (local and rivals alike, rivals
 * smaller): the leader top left, the prelude tab top right, the resource
 * slots with their keys and the unbuilt cities on them; captives and
 * trophies beside the guild cards; the reserve and the Outraged resources;
 * the name bar with the power in a ring. `maxCards` 0: no guild cards (the
 * local player's are in their own panel of the bar).
 */
function seatBoard(p: PlayerView, t: Translate, o: { spendable: ReadonlySet<number>; chosen: number | null; preludes: readonly PreludeCard[]; maxCards: number; head: string; legend?: boolean; arrange?: boolean }): string {
  return `${preludeTab(o.preludes, t)}
    <div class="pb-body${o.legend ? ' with-legend' : ''}">
      <div class="pb-face">${o.head}</div>
      ${slotsHtml(p, t, o.spendable, o.chosen, o.arrange)}
      <div class="pb-rule" aria-hidden="true"></div>
      ${o.legend ? preludeLegend(p, t, spentTypes(p, o.spendable)) : ''}
      ${spoils(p, t)}
      ${o.maxCards > 0 ? `<div class="pb-guild">${miniCards([...p.court, ...p.lore], o.maxCards)}</div>` : ''}
      <div class="pb-low">${stats(p, t, false)}${o.legend ? '' : outrage(p, t)}</div>
    </div>
    ${nameBar(p, t)}`;
}

/** The resource types of the slots that can be spent now. */
function spentTypes(p: PlayerView, spendable: ReadonlySet<number>): Set<Resource> {
  const out = new Set<Resource>();
  for (const i of spendable) {
    const r = p.slots[i]?.resource;
    if (r) out.add(r);
  }
  return out;
}

/**
 * The five Prelude actions as icons, one per resource, each with the number of
 * its symbols the seat counts (tokens and Court cards); the hover card says
 * what spending it does. Grey: no token to spend; gold: it can be spent now
 * (`live`); red with one of the seat's agents on it: Outraged.
 */
function preludeLegend(p: PlayerView, t: Translate, live: ReadonlySet<Resource>): string {
  const agent = pieceIcon('agent', p.id, t('stat.agents'));
  const chips = p.symbols.map(({ resource: r, tokens, cards }) => {
    const out = p.outraged.includes(r);
    const cls = out ? ' out' : tokens === 0 ? ' none' : live.has(r) ? ' live' : '';
    return `<span class="pl-chip${cls}" data-tip="res:${p.id}-${r}" tabindex="0" aria-label="${esc(t(`resource.${r}`))}">${resIcon(r, t)}<b class="pl-n num">${tokens + cards}</b>${out ? `<span class="pl-agent">${agent}</span>` : ''}</span>`;
  }).join('');
  return `<div class="pl-legend" aria-label="${esc(t('prelude.row'))}">${chips}</div>`;
}

/**
 * A rival's whole board (the card a click on their band opens): drawn exactly
 * like the local board, at its size, and nothing on it can be used; the Court
 * cards they hold in a row under it.
 */
export function seatBoardCard(p: PlayerView, t: Translate): string {
  const { w, h } = REGIONS.local;
  const cards = [...p.court, ...p.lore];
  const row = cards.length ? `<div class="tip-guild">${miniCards(cards, 12)}</div>` : '';
  return `<div class="tipboard" style="width:${w}px;height:${h}px">${localPanel(p, t, new Set(), null, [], true, false)}</div>${row}`;
}

function miniCards(cards: string[], max: number): string {
  const shown = cards
    .slice(0, max)
    // Each card over the next one: overlapping (a rival's band), their right sides stay in sight.
    .map((c, i) => `<div class="mini-card kitted" data-zoom="${esc(c)}" style="z-index:${max - i}">${cardFaceById(c)}</div>`)
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
 * The card a seat played this round, with how it was played (lead, surpass,
 * copy, pivot, and "takes the initiative") over it; an empty slot before the seat plays.
 */
export function playedCard(ix: ContentIndex, v: TableView, t: Translate, player: number): string {
  const pl = v.plays.find((x) => x.player === player);
  if (!pl) return `<div class="play none" title="${esc(t('played.none'))}"></div>`;
  const face = pl.card ? actionCard(ix, pl.card, t, pl.zeroed ? 'zeroed' : '') : '<div class="facedown"></div>';
  // The card's actions as gold tags beside it, as on the digital table.
  const tags = pl.card?.kinds.length ? `<span class="tags">${pl.card.kinds.map((k) => `<span class="tag">${esc(t(`action.${k}`))}</span>`).join('')}</span>` : '';
  // How it was played, over the card; a seat that seized the initiative says so in words.
  const how = `<span class="how">${esc(t(`played.${pl.mode}`))}</span>${pl.seized ? `<span class="how seized">${esc(t('played.seized'))}</span>` : ''}`;
  return `<div class="play${pl.mode === 'lead' ? ' lead' : ''}"><span class="hows">${how}</span>${face}${tags}</div>`;
}

/**
 * One rival as a compact band, its counts laid out like the local board's (base-fixes #45): the resource
 * slots with the cities on them; trophies over captives; the reserve and the hand as a 2×2 grid of cells;
 * on the name bar, the Outraged resources and how many Court cards they hold (the cards themselves in the
 * board a click opens). The card they played sits at its right end.
 */
export function rivalPanel(ix: ContentIndex, v: TableView, p: PlayerView, t: Translate): string {
  const n = p.court.length + p.lore.length;
  const court = n ? `<span class="rb-court" title="${esc(t('stat.court'))}">${icon('court', '', t('stat.court'))}<b class="num">${n}</b></span>` : '';
  const out = p.outraged.length ? outrage(p, t) : '';
  return `<div class="rival-wrap band"><div class="board rband s-${seatColor(p.id)}${p.isActive ? ' active' : ''}" data-tip="seat:${p.id}" tabindex="0" role="group" aria-label="${esc(playerName(t, p.id))}">
    ${nameBar(p, t, `${out}${court}`)}
    <div class="rb-body">
      ${slotsHtml(p, t, new Set(), null)}
      ${spoils(p, t)}
      ${stats(p, t, false)}
    </div>
  </div>${playedCard(ix, v, t, p.id)}</div>`;
}

/**
 * The local seat's board, like the physical one: a slot is clickable when its
 * token can be spent; the prelude tab lights the cards whose power can be used
 * now. `slim`: without the guild cards and with the leader rising out of the
 * frame (the table's bottom bar, which shows those cards in their own panel).
 */
export function localPanel(p: PlayerView, t: Translate, spendable: ReadonlySet<number>, chosen: number | null, preludes: readonly PreludeCard[] = [], slim = false, arrange = false): string {
  const head = leaderPortrait(p);
  const can = arrange && p.arranging;
  return `<div class="board pb local${slim ? ' slim' : ''}${can ? ' arranging' : ''} s-${seatColor(p.id)}${p.isActive ? ' active' : ''}">
    ${seatBoard(p, t, { spendable, chosen, preludes, maxCards: slim ? 0 : 9, head, legend: true, arrange: can })}
    ${can ? arrangeStrip(p, t) : ''}
  </div>`;
}

/**
 * Over the local board while its resources can be rearranged: what to do,
 * and the tokens that found no slot (dragged onto a slot they take its place;
 * what is still here at the next move is discarded).
 */
function arrangeStrip(p: PlayerView, t: Translate): string {
  const aside = p.overflow.map((r, i) => `<span class="ov-token" draggable="true" data-drag="o${i}" title="${esc(t(`resource.${r}`))}">${resIcon(r, t)}</span>`).join('');
  return `<div class="pb-arrange" data-drop="o">
    <span class="ar-hint">${esc(t(p.overflow.length ? 'arrange.over' : 'arrange.hint'))}</span>
    ${aside ? `<span class="ar-aside">${aside}</span>` : ''}
  </div>`;
}

/** Width of one of the local player's own Court cards (stage pixels). */
export const OWN_CARD_W = 106;
/** Room (stage pixels) between the guild cards and the lore cards in the own Court. */
const LORE_GAP = 18;

/** How the local player's own Court cards are ordered: as acquired, by type, or by resource. */
export type CourtSort = 'got' | 'kind' | 'resource';
/** The sort buttons shown: by type and by resource (the owner dropped "as acquired", base-fixes #33). */
export const COURT_SORTS: readonly CourtSort[] = ['kind', 'resource'];

/** `cards` in the order `sort` asks for (stable: ties keep the order acquired). Pure. */
export function sortCourt<T extends { kind?: string | null; resource?: string | null }>(cards: readonly T[], sort: CourtSort): T[] {
  if (sort === 'got') return [...cards];
  const key = (c: T) => (sort === 'kind' ? c.kind : c.resource) ?? null;
  // Cards without the key (no type, no resource) go last.
  const order = (x: string | null, y: string | null) => (x === y ? 0 : x === null ? 1 : y === null ? -1 : x < y ? -1 : 1);
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => order(key(a.c), key(b.c)) || a.i - b.i)
    .map((x) => x.c);
}

/**
 * The local player's own Court at the right end of the bar: their guild and
 * lore cards as small faces (hover shows the whole card), with buttons to
 * order them. `data` reads a card's type and resource; `width`: the panel's
 * inner width in stage pixels, to size the cards so that two rows hold them all;
 * `lit`: the cards whose power can be used now (they glow and use it on a click).
 */
export function ownCourtPanel(p: PlayerView, t: Translate, sort: CourtSort, data: (id: string) => CourtFaceData, width: number, lit: ReadonlySet<string> = new Set(), open = false): string {
  // Guild cards and lore cards in two groups, apart (production/base-fixes.md #29).
  const guild = sortCourt(p.court.map(data), sort);
  const lore = sortCourt(p.lore.map(data), sort);
  const n = guild.length + lore.length;
  // One row of whole cards, a small gap between them; when they do not fit they overlap just enough.
  // Opened (leftwards over the bar), the cards sit side by side in rows.
  const w = OWN_CARD_W;
  // Two groups: the gap and the lore group's rule (9px) between them, and one card fewer overlapping.
  const both = guild.length > 0 && lore.length > 0;
  const room = width - (both ? LORE_GAP + 9 : 0);
  const steps = n - (both ? 2 : 1);
  const fit = steps > 0 ? Math.min(8, Math.floor((room - n * w) / steps)) : 0;
  const gap = open ? 8 : fit;
  // The long bar on the left edge that opens the whole Court leftwards (or closes it), when there are cards.
  const toggle = n
    ? `<button type="button" class="mine-open" data-act="mine-open" aria-expanded="${open}" title="${esc(t(open ? 'mine.collapse' : 'mine.expand'))}" aria-label="${esc(t(open ? 'mine.collapse' : 'mine.expand'))}">${open ? '&#x25B6;' : '&#x25C0;'}</button>`
    : '';
  const sorts = COURT_SORTS.map((k) => `<button type="button" class="cs-btn${k === sort ? ' on' : ''}" data-act="court-sort" data-sort="${k}" aria-pressed="${k === sort}">${esc(t(`mine.sort.${k}`))}</button>`).join('');
  // Overlapping cards leave their right side in sight (the printed resource): each card lies over the next one.
  // The keys, printed top left and so covered, stand above each card at its right end.
  // A card whose power can be used now glows and uses it on a click.
  let z = n;
  const item = (c: CourtFaceData) => {
    const keys = c.keys ? `${icon('key')}<b class="num">${c.keys}</b>` : '';
    const res = `<span class="mine-keys" aria-label="${c.keys}">${keys}</span>`;
    const face = lit.has(c.card)
      ? `<button type="button" class="mine-card lit k-${esc(c.kind ?? 'none')}" data-act="power-card" data-card="${esc(c.card)}" data-zoom="${esc(c.card)}" title="${esc(t('powers.title'))}">${cardFaceById(c.card)}</button>`
      : `<div class="mine-card k-${esc(c.kind ?? 'none')}" data-zoom="${esc(c.card)}" tabindex="0">${cardFaceById(c.card)}</div>`;
    return `<div class="mine-item" style="z-index:${z--}">${res}${face}</div>`;
  };
  const groups = [guild, lore].filter((g) => g.length).map((g, i) => `<div class="mine-group${i ? ' lore' : ''}">${g.map(item).join('')}</div>`).join('');
  return `${toggle}<div class="mine-head" aria-label="${esc(t('mine.title'))}">${sorts}</div>
    <div class="mine-cards${gap < 0 ? ' stacked' : ''}" style="--w:${w}px;--gap:${gap}px;--lore-gap:${LORE_GAP}px">${groups || `<span class="mine-empty">${esc(t('mine.empty'))}</span>`}</div>`;
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

/**
 * The decks and discard piles, for the header drop-down: the action discard
 * (face-down cards as card backs, unless the local seat discarded them), the
 * Court discard, and the Court deck's contents by name. Court cards zoom on hover.
 */
export function pilesPanel(ix: ContentIndex, v: TableView, t: Translate): string {
  const p = v.piles;
  const section = (title: string, n: number, note: string, row: string) =>
    `<section class="pile"><div class="pile-head">${esc(title)} <b class="num">${n}</b></div><div class="pile-note">${esc(note)}</div><div class="pile-row">${row || `<span class="pile-empty">${esc(t('empty'))}</span>`}</div></section>`;
  const discard = p.discard
    .map((d) => {
      if (!d.card) return `<div class="facedown pile-card" title="${esc(t('piles.faceDown'))}"></div>`;
      return d.faceDown
        ? `<span class="pile-fd" title="${esc(t('piles.faceDownMine'))}">${actionCard(ix, d.card, t, 'pile-card')}</span>`
        : actionCard(ix, d.card, t, 'pile-card');
    })
    .join('');
  const court = (ids: string[]) => ids.map((id) => `<span class="pile-court" data-zoom="${esc(id)}" tabindex="0">${cardFaceById(id)}</span>`).join('');
  const secret = p.courtDeckSecret ? `<span class="pile-secret">${esc(t('piles.secret', { n: p.courtDeckSecret }))}</span>` : '';
  return `<div class="piles">${section(t('piles.discard'), p.discard.length, t('piles.discardNote'), discard)}${section(t('piles.courtDiscard'), p.courtDiscard.length, t('piles.courtDiscardNote'), court(p.courtDiscard))}${section(t('piles.courtDeck'), p.courtDeck.length + p.courtDeckSecret, t('piles.courtDeckNote'), court(p.courtDeck) + secret)}</div>`;
}

/** An ambition marker: a small hexagon with its first-place value over its second-place one. */
function hexMarker(m: { id: string; first: number; second: number }, t: Translate): string {
  return `<span class="hexm" title="${esc(t('amb.marker', { first: m.first, second: m.second }))}"><b class="num">${m.first}</b><i class="num">${m.second}</i></span>`;
}

/**
 * The ambitions as the digital table's right column: the markers still to
 * declare in hexagon slots on top, then one row per ambition in card-number
 * order (2 to 6): its number and glyphs, the markers declared on it, and the
 * count of every seat in the running (above 0) as a coloured dot, highest
 * first, the places it would score now lit. Names are in the tooltips.
 */
export function ambitionsStrip(ix: ContentIndex, v: TableView, t: Translate): string {
  const numberOf = (a: string) => Number(Object.entries(ix.content.declareByNumber).find(([, x]) => x === a)?.[0] ?? 0);
  const rows = [...v.ambitions]
    .sort((x, y) => numberOf(x.id) - numberOf(y.id))
    .map((a) => {
      const n = numberOf(a.id);
      const glyphs = n ? declareGlyphs(ix, n).map((g) => icon(g)).join('') : '';
      const place = (p: number) => (a.first.includes(p) ? ' first' : a.second.includes(p) ? ' second' : '');
      // Only the players in the running: a seat with nothing toward this ambition is not shown.
      // 2 players: the ambition box stands among them as the count to beat (production/base-fixes.md #9).
      const tallies = [
        ...a.tallies
          .filter((x) => x.value > 0)
          .map((x) => ({ value: x.value, html: `<span class="tl s-${seatColor(x.player)}${place(x.player)}" title="${esc(`${playerName(t, x.player)}: ${x.value}`)}"><i class="dot"></i><b class="num">${x.value}</b></span>` })),
        ...(a.box ? [{ value: a.box, html: `<span class="tl box-tl" title="${esc(t('amb.boxTip'))}"><span class="bx">${esc(t('scoring.box'))}</span><b class="num">${a.box}</b></span>` }] : []),
      ]
        .sort((x, y) => y.value - x.value)
        .map((x) => x.html)
        .join('');
      const box = '';
      const name = t(`ambition.${a.id}`);
      const rule = AMB_RULE[a.id] ? `<span class="ab-rule">${esc(t(AMB_RULE[a.id]))}</span>` : '';
      return `<div class="abox${a.markers.length ? ' declared' : ''}" data-tip="amb:${a.id}" tabindex="0" role="group" aria-label="${esc(name)}">
        <span class="ab-name">${n ? `<span class="ab-n num">${n}</span>` : ''}<span class="ab-word">${esc(name)}</span></span>
        <span class="ab-g">${glyphs}</span>
        <span class="ab-m">${a.markers.map((m) => ambMarker(m, t)).join('')}${box}</span>
        ${rule}
        <span class="ab-t">${tallies}</span></div>`;
    })
    .join('');
  const left = v.markersLeft.map((m) => ambMarker(m, t)).join('');
  const empty = Array.from({ length: Math.max(0, 3 - v.markersLeft.length) }, () => '<span class="amk empty"></span>').join('');
  return `<div class="amb-title">${esc(t('ambitions'))}</div>
    <div class="amb-left" title="${esc(t('ambitions.available'))}">${left}${empty}</div><div class="amb-rows">${rows}</div>`;
}

/** The cleanup note printed in an ambition's box (i18n key), for the ambitions that have one. */
const AMB_RULE: Record<string, string> = { captives: 'amb.rule.captives', trophies: 'amb.rule.trophies' };

/** An ambition marker as the kit's token (its side by its values), else the drawn hexagon. */
function ambMarker(m: { id: string; first: number; second: number }, t: Translate): string {
  // Each side has its own values (front 5/3, 3/2, 2/0; back 9/4, 6/3, 4/2): use the picture that shows them.
  const url = assetUrl(`token.ambition-front-${m.first}-${m.second}`) ?? assetUrl(`token.ambition-back-${m.first}-${m.second}`);
  return url ? `<img class="amk" src="${esc(url)}" alt="${esc(t('amb.marker', { first: m.first, second: m.second }))}" title="${esc(t('amb.marker', { first: m.first, second: m.second }))}">` : hexMarker(m, t);
}

/** Small portrait face of a Court card: its image when present, else a drawn placeholder with its data. */
export function courtFace(c: CourtFaceData, t: Translate): string {
  if (hasKitFace(c)) return courtCardFace(c);
  const art = cardArt(c.card);
  if (art) return `<img class="face-img" src="${esc(art)}" alt="">`;
  const keys = c.keys ? `<span>${icon('key')}${c.keys}</span>` : '';
  return `<span class="face-ph"><b>${esc(c.card)}</b><span>${c.kind ? esc(t(`card.kind.${c.kind}`)) : ''}</span><span class="face-ph-foot">${c.resource ? resIcon(c.resource, t) : ''}${keys}</span></span>`;
}

/**
 * The Court as banners in a row along the top: each card's picture cropped to
 * a strip, with the agents on it per seat under it; `pickable` cards glow and
 * pick on click.
 */
export function courtPanel(v: TableView, t: Translate, pickable: ReadonlySet<number>, ix?: ContentIndex): string {
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
  // The Court deck shows the back of its top card (production/base-fixes.md #36): the base and campaign Court cards
  // share one back; a card with its own back (an expansion's) would show that one.
  const back = assetUrl('back.court');
  const backFace = back ? `<img class="cp-back" src="${esc(back)}" alt="">` : '';
  const deck = `<button type="button" class="cpile deck" data-act="piles" title="${esc(`${t('piles.courtDeck')}: ${v.courtDeck}`)}"><span class="cp-stack">${v.courtDeck ? `<i></i><i></i><i>${backFace}</i>` : '<i class="empty"></i>'}</span><span class="cp-n">${esc(t('piles.courtDeckShort'))} <b class="num">${v.courtDeck}</b></span></button>`;
  // The action cards' discard pile, left of the Court deck: the last card discarded, or a card back when it went
  // face down (production/base-fixes.md #36).
  const lastAction = v.piles.discard[0];
  const actionTop = !lastAction ? '<i class="empty"></i>' : lastAction.card && !lastAction.faceDown && ix ? `<span class="cp-face act">${actionCard(ix, lastAction.card, t)}</span>` : '<span class="cp-face act"><span class="facedown"></span></span>';
  const actions = `<button type="button" class="cpile adiscard" data-act="piles" title="${esc(`${t('piles.discard')}: ${v.discard}`)}"><span class="cp-stack">${actionTop}</span><span class="cp-n">${esc(t('piles.actionDiscardShort'))} <b class="num">${v.discard}</b></span></button>`;
  const top = v.piles.courtDiscard[0];
  const discard = `<button type="button" class="cpile discard" data-act="piles" title="${esc(`${t('piles.courtDiscard')}: ${v.piles.courtDiscard.length}`)}"><span class="cp-stack">${top ? `<span class="cp-face">${cardFaceById(top)}</span>` : '<i class="empty"></i>'}</span><span class="cp-n">${esc(t('piles.discardShort'))} <b class="num">${v.piles.courtDiscard.length}</b></span></button>`;
  return `<div class="court-row">${actions}${deck}${cards}${discard}</div>`;
}

/** The right column: the ambitions. */
export function sidePanel(ix: ContentIndex, v: TableView, t: Translate, shut = false): string {
  // The tab on its left edge folds the column away or opens it again (production/base-fixes.md #36).
  const tip = esc(t(shut ? 'amb.open' : 'amb.shut'));
  const tab = `<button type="button" class="amb-tab" data-act="amb-toggle" aria-expanded="${!shut}" title="${tip}" aria-label="${tip}">${icon(shut ? 'prev' : 'next')}${shut ? `<span class="amb-tab-name">${esc(t('ambitions'))}</span>` : ''}</button>`;
  return `<div class="side-amb${shut ? ' shut' : ''}" data-region="ambitions">${tab}${shut ? '' : ambitionsStrip(ix, v, t)}</div>`;
}

/** The local hand with its caption; `selected` is raised. */
export function handPanel(ix: ContentIndex, v: TableView, t: Translate, selected: string | null, mine: boolean, seizeWith: string | null = null, tools = ''): string {
  // Fanned like a hand of cards: each card turned a little more the further it is from the middle.
  const n = v.hand.length;
  const cards = v.hand
    .map((h, i) => {
      const cls = `hand-card${h.playable ? '' : ' unplayable'}${selected === h.card ? ' selected' : ''}${seizeWith === h.card ? ' seize-mark' : ''}`;
      const off = i - (n - 1) / 2;
      return `<button type="button" class="${cls}" style="--fan:${(off * 3.2).toFixed(1)}deg;--drop:${(off * off * 1.8).toFixed(1)}px" data-act="hand" data-card="${esc(h.card)}" aria-pressed="${selected === h.card}" aria-label="${esc(cardLabel(t, h))}">${actionCard(ix, h, t)}</button>`;
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
  if (hasKitFace(c)) return `<button type="button" class="${cls} kit k-${c.kind}" ${attrs}>${courtCardFace(c)}</button>`;
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
