// Ambition glyphs (src/ui/table/render.ts declareGlyphs): the symbol of the
// ambition a card number declares, as on the ambition board.
import { describe, expect, it } from 'vitest';
import { declareGlyphs } from '../../../src/ui/table/render';
import { index } from '../engine/fixture';

describe('declareGlyphs', () => {
  const ix = index();
  const numberOf = (amb: string) => Number(Object.entries(ix.content.declareByNumber).find(([, a]) => a === amb)?.[0]);

  it('draws handcuffs for captives and a broken ship for trophies', () => {
    expect(declareGlyphs(ix, numberOf('captives'))).toEqual(['ambCaptives']);
    expect(declareGlyphs(ix, numberOf('trophies'))).toEqual(['ambTrophies']);
  });

  it('draws the barrel before the crate for the fuel and material ambition', () => {
    expect(declareGlyphs(ix, numberOf('wealth'))).toEqual(['ambFuel', 'ambMaterial']);
  });

  it('draws the relic and psionic symbols for their ambitions', () => {
    expect(declareGlyphs(ix, numberOf('relics'))).toEqual(['ambRelic']);
    expect(declareGlyphs(ix, numberOf('psionics'))).toEqual(['ambPsionic']);
  });

  it('draws nothing for a number that declares no ambition', () => {
    expect(declareGlyphs(ix, 1)).toEqual([]);
  });
});
