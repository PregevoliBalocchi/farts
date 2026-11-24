// Court, Lore and Leader cards drawn from scratch with the publisher's
// development kit (assets/ui/cardkit/, from tools/fetch-kit.mjs): the kit's
// frame, footer and key-cost tab over the illustration cut from the owner's
// card picture, with the name and rules text from the owner's content (never
// from code). A card without a transcribed name, or without the kit, keeps
// its plain picture.

import type { CardWords, ContentIndex, CourtKind, LeaderDef, PrintedWords } from '../../game/engine';
import { assetUrl, cardArt, cardCut } from './assets';
import type { CourtCardView } from './view';

/** What a card face needs: a Court card, or a Lore or Leader card (Leaders & Lore). */
export type CourtFaceData = Omit<Pick<CourtCardView, 'card' | 'kind' | 'resource' | 'keys' | 'name' | 'text' | 'crisis' | 'set' | 'focus'>, 'kind'> & {
  kind: CourtKind | 'lore' | 'leader' | null;
  /** A leader card's starting resources and A/B/C setup pieces (its bottom bar). */
  leader?: Pick<LeaderDef, 'resources' | 'setup'>;
};

/** A card's printed words in `lang`: the translation where the content has one, else the original. */
export function cardWords(d: (PrintedWords & { crisis?: string }) | undefined, lang: string): CardWords {
  const tr = lang === 'en' ? undefined : d?.i18n?.[lang];
  return { name: tr?.name ?? d?.name, text: tr?.text ?? d?.text, crisis: tr?.crisis ?? d?.crisis };
}

/** A card's face data from the content (Court, Lore or Leader card), its words in `lang`. */
export function faceOf(ix: ContentIndex, id: string, lang = 'en'): CourtFaceData {
  const d = ix.courtCards.get(id);
  if (!d) {
    const lore = ix.content.loreCards?.find((c) => c.id === id);
    const leader = lore ? undefined : ix.content.leaders?.find((c) => c.id === id);
    const w = lore ?? leader;
    if (w) {
      const { name, text } = cardWords(w, lang);
      return { card: id, kind: lore ? 'lore' : 'leader', resource: null, keys: 0, name, text, set: lore?.set, leader: leader ? { resources: leader.resources, setup: leader.setup } : undefined };
    }
  }
  return { card: id, kind: d?.kind ?? null, resource: d?.resource ?? null, keys: Number(d?.keys ?? 0), ...cardWords(d, lang), set: d?.set, focus: d?.artFocus };
}

const esc = (v: unknown) => String(v).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * Icons a rules text may name in braces, with the fallback when the picture is
 * missing: {key}, {hit}, {intercept}; for the campaign's Fate cards {obj} (the
 * objective clock) and the planet ID symbols {arrowhead}, {hexagon}, {crescent}.
 */
const TEXT_ICONS: Record<string, string> = { key: '⚷', hit: '✸', intercept: '⊘', obj: '⏱', arrowhead: '▲', hexagon: '⬢', crescent: '☾' };

/**
 * Rules text markup to HTML: one paragraph per line, ***bold italic***,
 * **bold**, *italic*, {key} and the other names in TEXT_ICONS for their icons. Everything
 * else is escaped.
 */
export function rulesHtml(text: string): string {
  const glyph = (name: string) => {
    const url = assetUrl(`icon.${name}`);
    return url ? `<img class="cf-ic ic-${name}" src="${esc(url)}" alt="${name}">` : TEXT_ICONS[name];
  };
  return text
    .split('\n')
    .filter((p) => p.trim())
    .map((p) => {
      const html = esc(p)
        .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/\{(key|hit|intercept|obj|arrowhead|hexagon|crescent)\}/g, (_, name: string) => glyph(name));
      return `<p>${html}</p>`;
    })
    .join('');
}

/** The printed number and set code of a card id ("court-08" → BC 08, "court-cc-03" → CC 03). */
function cardNumber(id: string, set: string | undefined): { code: string; n: string } {
  const n = id.match(/(\d+)$/)?.[1] ?? '';
  return { code: set === 'campaign' || /-cc-/.test(id) ? 'CC' : 'BC', n };
}

/** Title size step for long names. */
const titleFit = (name: string) => (name.length > 18 ? ' t-3' : name.length > 14 ? ' t-2' : '');

/** True when the card can be drawn from the kit (its name is transcribed and the kit pictures are installed). */
export function hasKitFace(c: CourtFaceData): boolean {
  if (!c.name || !cardCut(c.card)) return false;
  if (c.kind === 'leader') return !!assetUrl('cardkit.leader');
  if (c.kind === 'lore') return !!assetUrl('cardkit.lore') && !!assetUrl('cardkit.footer');
  return c.kind === 'decree' ? !!assetUrl('cardkit.vox') : !!(c.resource && assetUrl(`cardkit.guild-${c.resource}`));
}

/** A leader's bottom bar: its starting resources in rings, then what it places on A, B and C (buildings and ships). */
function leaderBar(l: CourtFaceData['leader']): string {
  if (!l) return '';
  const pic = (key: string, cls: string) => {
    const u = assetUrl(key);
    return u ? `<img class="${cls}" src="${esc(u)}" alt="">` : '';
  };
  const res = (l.resources ?? []).map((r) => `<span class="lb-res">${pic(`icon.${r}`, 'lb-ic')}</span>`).join('');
  const slots = (['A', 'B', 'C'] as const)
    .map((k) => {
      const s = l.setup[k];
      if (!s) return '';
      const builds = (s.buildings ?? []).map((b) => pic(`piece.${b}-0`, 'lb-bld')).join('');
      const ships = Array.from({ length: s.ships ?? 0 }, () => pic('piece.ship-0', 'lb-ship')).join('');
      return `<span class="lb-slot"><b>${k}</b><span class="lb-body">${builds}<span class="lb-ships n${s.ships ?? 0}">${ships}</span></span></span>`;
    })
    .join('');
  return `<div class="cf-bar">${res}${slots}</div>`;
}

/** A card face (Court, Lore or Leader): the kit card when possible, else the owner's picture, else the id. */
export function courtCardFace(c: CourtFaceData): string {
  const art = cardArt(c.card);
  if (!hasKitFace(c)) return art ? `<img class="cf-plain" src="${esc(art)}" alt="">` : `<span class="cf-plain cf-id">${esc(c.card)}</span>`;
  const cut = cardCut(c.card)!;
  const kit = (k: string) => {
    const u = assetUrl(`cardkit.${k}`);
    return u ? `<img class="cf-kit" src="${esc(u)}" alt="">` : '';
  };
  const { code, n } = cardNumber(c.card, c.set);
  const text = c.text ?? '';
  if (c.kind === 'leader') {
    // The kit's Tarot space, the character cut from the owner's picture on top, then the white panel with
    // the name, the text and the bar of starting resources and A/B/C pieces drawn from the content.
    return `<div class="cface leader"><img class="cf-bg" src="${esc(assetUrl('cardkit.leader')!)}" alt=""><img class="cf-art" src="${esc(cut)}" alt="">
      <span class="cf-num">${esc(n)}</span><div class="cf-panel"></div><div class="cf-title${titleFit(c.name ?? '')}">${esc(c.name)}</div>
      <div class="cf-text cf-fit">${rulesHtml(text)}</div>${leaderBar(c.leader)}</div>`;
  }
  if (c.kind === 'lore') {
    return `<div class="cface lore"><img class="cf-art" src="${esc(cut)}" alt="">${kit('lore')}${kit('footer')}
      <div class="cf-title${titleFit(c.name ?? '')}">${esc(c.name)}</div><div class="cf-text cf-fit">${rulesHtml(text)}</div>
      <div class="cf-foot"><span>L</span><span>LORE</span><span>${esc(n)}</span></div></div>`;
  }
  const foot = `<div class="cf-foot"><span>${code}</span><span>${c.kind === 'decree' ? 'VOX' : 'GUILD'}</span><span>${esc(n)}</span></div>`;
  if (c.kind === 'decree') {
    const crisis = c.crisis ? `<div class="cf-crisis">${rulesHtml(`**Crisis:** ${c.crisis}`)}</div>` : '';
    return `<div class="cface vox${c.crisis ? ' with-crisis' : ''}">${kit('vox')}<img class="cf-sketch" src="${esc(cut)}" alt="">${kit('footer')}
      <div class="cf-title${titleFit(c.name ?? '')}">${esc(c.name)}</div><div class="cf-body cf-fit">${crisis}<div class="cf-text">${rulesHtml(text)}</div></div>${foot}</div>`;
  }
  const cost = c.keys > 0 ? kit(`cost-${c.keys > 3 ? 'x' : c.keys}`) : '';
  return `<div class="cface guild"><img class="cf-art" src="${esc(cut)}" alt="">${kit(`guild-${c.resource}`)}${kit('footer')}${cost}
    <div class="cf-title${titleFit(c.name ?? '')}">${esc(c.name)}</div><div class="cf-text cf-fit">${rulesHtml(text)}</div>${foot}</div>`;
}

/**
 * A Court card as a banner of the Court column (the digital table's look): the
 * illustration cropped to a strip, the resource badge cut from the kit frame
 * top right, the name on a white band at the bottom. Falls back to the cropped
 * picture when the card cannot be drawn from the kit.
 */
export function courtBanner(c: CourtFaceData): string {
  const art = cardArt(c.card);
  // The strip is centred on the picture's main subject (content's artFocus), zoomed in a little and never past the picture's edges.
  const [fx, fy] = c.focus ?? [0.5, c.kind === 'decree' ? 0.74 : 0.22];
  const focus = `--fx:${fx};--fy:${fy}`;
  if (!hasKitFace(c)) return art ? `<span class="cb plain" style="${focus}"><img class="cb-art" src="${esc(art)}" alt=""></span>` : `<span class="cb-title">${esc(c.card)}</span>`;
  if (c.kind === 'decree') {
    const paper = assetUrl('cardkit.vox');
    return `<span class="cb vox" style="background-image:url('${esc(paper)}');${focus}"><img class="cb-art cb-sketch" src="${esc(art!)}" alt=""><span class="cb-title${titleFit(c.name ?? '')}">${esc(c.name)}</span></span>`;
  }
  const frame = assetUrl(`cardkit.guild-${c.resource}`);
  return `<span class="cb guild" style="${focus}"><img class="cb-art" src="${esc(art!)}" alt=""><span class="cb-badge" style="background-image:url('${esc(frame)}')"></span><span class="cb-title${titleFit(c.name ?? '')}">${esc(c.name)}</span></span>`;
}

/** Where faces by card id come from: set by the table (its content and language). */
let faceSource: ((id: string) => CourtFaceData) | null = null;

/** Tells cardFaceById where to read a card's data (the table calls it once, with its content and language). */
export function setFaceSource(f: ((id: string) => CourtFaceData) | null): void {
  faceSource = f;
}

/** Any card's face by id, the same everywhere: the kit card when possible, else its picture, else its id. */
export function cardFaceById(id: string): string {
  if (faceSource) return courtCardFace(faceSource(id));
  const art = cardArt(id);
  return art ? `<img class="cf-plain" src="${esc(art)}" alt="">` : `<span class="cf-plain cf-id">${esc(id)}</span>`;
}

/** Smallest scale the fitter goes down to, as a share of the normal size. */
const MIN_SCALE = 0.55;

/**
 * Makes every card face under `root` fit its boxes: the rules text shrinks
 * (CSS `--k`) until it stays inside the paper, the title until it fits its
 * band. Only boxes on screen are measured; a box keeps its size until its
 * width changes. Call it after cards are drawn and once the fonts are loaded.
 */
export function fitCardText(root: ParentNode, force = false): void {
  const boxes = root.querySelectorAll<HTMLElement>('.cface .cf-fit, .cface .cf-title');
  for (const el of boxes) {
    const w = el.clientWidth;
    if (!w || !el.clientHeight) continue;
    if (!force && el.dataset.fitW === String(w)) continue;
    el.dataset.fitW = String(w);
    const title = el.classList.contains('cf-title');
    let k = 1;
    el.style.setProperty('--k', '1');
    const over = () => (title ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 1);
    while (over() && k > MIN_SCALE) {
      k = Math.round((k - 0.03) * 100) / 100;
      el.style.setProperty('--k', String(k));
    }
  }
}
