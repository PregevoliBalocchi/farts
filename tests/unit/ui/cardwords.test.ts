// cardWords: a Court card's printed words in the table's language, falling
// back to the original words. Fixtures are made up; no card texts here.
import { describe, expect, it } from 'vitest';
import type { CourtCardDef } from '../../../src/game/engine';
import { cardWords } from '../../../src/ui/table/cardface';

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

  it('is empty for an unknown card', () => {
    expect(cardWords(undefined, 'it')).toEqual({ name: undefined, text: undefined, crisis: undefined });
  });
});
