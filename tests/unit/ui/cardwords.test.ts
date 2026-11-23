// cardWords and faceOf: a card's printed words in the table's language, falling
// back to the original words. Fixtures are made up; no card texts here.
import { describe, expect, it } from 'vitest';
import type { ContentIndex, CourtCardDef } from '../../../src/game/engine';
import { cardWords, faceOf } from '../../../src/ui/table/cardface';

const card = (extra: Partial<CourtCardDef> = {}): CourtCardDef => ({
  id: 'court-x',
  kind: 'decree',
  name: 'Name EN',
  text: 'Text EN',
  crisis: 'Crisis EN',
  ...extra,
});

describe('cardWords', () => {
  it('uses the translation for its language', () => {
    const d = card({ i18n: { it: { name: 'Nome IT', text: 'Testo IT', crisis: 'Crisi IT' } } });
    expect(cardWords(d, 'it')).toEqual({ name: 'Nome IT', text: 'Testo IT', crisis: 'Crisi IT' });
  });

  it('falls back to the original words, part by part', () => {
    const d = card({ i18n: { it: { name: 'Nome IT' } } });
    expect(cardWords(d, 'it')).toEqual({ name: 'Nome IT', text: 'Text EN', crisis: 'Crisis EN' });
  });

  it('keeps the original words in English or without a translation', () => {
    const d = card({ i18n: { it: { name: 'Nome IT' } } });
    expect(cardWords(d, 'en').name).toBe('Name EN');
    expect(cardWords(card(), 'it').name).toBe('Name EN');
  });

  it('reads the words of a card that only has a name and text', () => {
    const d = { name: 'Name EN', text: 'Text EN', i18n: { it: { text: 'Testo IT' } } };
    expect(cardWords(d, 'it')).toEqual({ name: 'Name EN', text: 'Testo IT', crisis: undefined });
  });

  it('is empty for an unknown card', () => {
    expect(cardWords(undefined, 'it')).toEqual({ name: undefined, text: undefined, crisis: undefined });
  });
});

describe('faceOf', () => {
  // A content index with only what faceOf reads: Court cards, lore cards and leaders.
  const ix = (): ContentIndex =>
    ({
      courtCards: new Map([['court-x', card()]]),
      content: {
        loreCards: [{ id: 'lore-x', set: 'base', name: 'Lore EN', text: 'Lore text EN', i18n: { it: { name: 'Lore IT' } } }],
        leaders: [{ id: 'leader-x', setup: {}, name: 'Leader EN', text: 'Leader text EN', i18n: { it: { text: 'Testo leader IT' } } }],
      },
    }) as unknown as ContentIndex;

  it('gives a lore card the lore kind and its words in the language', () => {
    expect(faceOf(ix(), 'lore-x', 'it')).toMatchObject({ card: 'lore-x', kind: 'lore', name: 'Lore IT', text: 'Lore text EN', set: 'base' });
  });

  it('gives a leader card the leader kind and its words in the language', () => {
    expect(faceOf(ix(), 'leader-x', 'it')).toMatchObject({ card: 'leader-x', kind: 'leader', name: 'Leader EN', text: 'Testo leader IT' });
  });

  it('keeps Court cards as they are and an unknown id without a kind', () => {
    expect(faceOf(ix(), 'court-x', 'en')).toMatchObject({ kind: 'decree', name: 'Name EN' });
    expect(faceOf(ix(), 'nope').kind).toBeNull();
  });
});
