// One glossary (production/piano-blindatura-tavolo-2026-11-25.md, rule 11): a thing of the game has one
// name in each language. A retired synonym found in a table is the same thing under a second name.
import { describe, expect, it } from 'vitest';
import itUi from '../../../src/i18n/it.json';
import itMessages from '../../../src/i18n/messages.it.json';

/** Retired Italian names and the term the rulebook's word maps to ("ambition box" → "riquadro ambizione"). */
const RETIRED_IT: Record<string, string> = {
  'casella ambizione': 'riquadro ambizione',
  'caselle ambizione': 'riquadri ambizione',
};

describe('Italian glossary', () => {
  it('uses one name for each thing, never a retired synonym', () => {
    const texts = [...Object.entries(itUi), ...Object.entries(itMessages)];
    const found = texts.flatMap(([key, text]) =>
      Object.keys(RETIRED_IT)
        .filter((old) => String(text).toLowerCase().includes(old))
        .map((old) => `${key}: "${old}" → "${RETIRED_IT[old]}"`),
    );
    expect(found).toEqual([]);
  });
});
