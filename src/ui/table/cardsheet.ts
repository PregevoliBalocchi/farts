// ?view=cards: every action card of the content file side by side, to check
// numbers, actions (stars), suit actions and declarable ambitions against the
// printed cards. Two campaign examples show how a card with unusual values
// draws. Display only, no game.

import { BASE_EFFECTS } from '../../game/cards/base';
import { indexContent } from '../../game/engine';
import type { ActionKind } from '../../game/engine/types';
import { pickLang, translator } from '../../i18n';
import { loadContent } from '../content';
import { icon } from './assets';
import { courtCardFace, faceOf, fitCardText } from './cardface';
import { loadCardFonts } from './cardfonts';
import { actionCard, declareGlyphs, esc, suitClass, suitName } from './render';
import type { ActionCardView } from './view';
import './table.css';

/** Mounts the check sheet into `root`. */
export function mountCards(root: HTMLElement): void {
  const lang = pickLang(location.search, navigator.language);
  const t = translator(lang);
  const ix = indexContent(loadContent().content, BASE_EFFECTS);
  const { suits, actionCards, declareByNumber } = ix.content;

  const figure = (card: string, caption: string) => `<figure>${card}<figcaption>${caption}</figcaption></figure>`;
  const rows = Object.entries(suits)
    .map(([suit, kinds]) => {
      const cards = actionCards
        .filter((c) => c.suit === suit)
        .sort((a, b) => a.number - b.number)
        .map((c) => {
          const view: ActionCardView = { card: c.id, suit, number: c.number, pips: c.pips, kinds };
          const amb = declareByNumber[String(c.number)];
          const lines = [
            `<b>${esc(c.id)}</b>`,
            esc(t('cards.caption', { n: c.pips })),
            esc(amb ? t(`ambition.${amb}`) : t('cards.noAmbition')),
            (c.minPlayers ?? 2) >= 4 ? esc(t('cards.only4')) : '',
          ];
          return figure(actionCard(ix, view, t), lines.filter(Boolean).join('<br>'));
        })
        .join('');
      const legend = kinds.map((k) => esc(t(`action.${k}`))).join(' · ');
      return `<h2 class="${suitClass(ix, suit)}" style="color:var(--suit)">${esc(suitName(t, suit))}<small>${legend}</small></h2><div class="row">${cards}</div>`;
    })
    .join('');

  // Campaign examples: not real values, only how such a card is drawn.
  const event: ActionCardView = { card: 'event-01', suit: 'event', number: 0, pips: 0, kinds: [] };
  const fateKinds: ActionKind[] = ['build', 'move', 'secure'];
  const fate: ActionCardView = { card: 'fate-example', suit: 'fate', number: 8, pips: 2, kinds: fateKinds };
  const special = `<h2>${esc(t('cards.special'))}</h2><div class="row">
    ${figure(actionCard(ix, event, t, '', t('cards.event')), `<b>event-01</b><br>${esc(t('cards.eventNote'))}`)}
    ${figure(actionCard(ix, fate, t, '', 'F'), esc(t('cards.fateNote')))}</div>`;

  // Ambition symbols: gold as in the ambitions box, ink as on the action cards.
  const ambs = (['wealth', 'captives', 'trophies', 'relics', 'psionics'] as const)
    .map((a) => {
      const n = Number(Object.entries(declareByNumber).find(([, x]) => x === a)?.[0] ?? 0);
      const gs = declareGlyphs(ix, n);
      return `<figure class="glyph amb-glyph"><span class="big gold">${gs.map((g) => icon(g)).join('')}</span><span class="on-card">${gs.map((g) => icon(g)).join('')}</span><figcaption><b>${n} · ${esc(t(`ambition.${a}`))}</b></figcaption></figure>`;
    })
    .join('');
  const icons = `<h2>${esc(t('cards.ambitionIcons'))}</h2><div class="row glyphs">${ambs}</div>`;

  // Every Court, Lore and Leader face in the page's language, as the table draws it (the faces test reads them).
  const ids = [...ix.content.courtCards.map((c) => c.id), ...(ix.content.loreCards ?? []).map((c) => c.id), ...(ix.content.leaders ?? []).map((c) => c.id)];
  const faces = ids
    .map((id) => {
      const f = faceOf(ix, id, lang);
      return `<figure class="face${f.kind === 'leader' ? ' tall' : ''}" data-card="${esc(id)}">${courtCardFace(f)}<figcaption>${esc(f.name ?? id)}</figcaption></figure>`;
    })
    .join('');
  const faceRow = `<h2>${esc(t('cards.faces'))}</h2><div class="row faces">${faces}</div>`;

  root.innerHTML = `<div class="tbl card-sheet"><h1>${esc(t('cards.title'))}</h1><p>${esc(t('cards.intro'))}</p>${icons}${rows}${special}${faceRow}</div>`;
  const sheet = root.querySelector<HTMLElement>('.card-sheet')!;
  void loadCardFonts().then(() => {
    fitCardText(sheet, true);
    sheet.dataset.fitted = 'true';
  });
}
