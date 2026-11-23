// Court card faces from the kit (src/ui/table/cardface.ts): the rules text markup. Synthetic text only:
// the card texts live in the owner's content, never in tests.
import { describe, expect, it } from 'vitest';
import { rulesHtml } from '../../../src/ui/table/cardface';

describe('rules text markup', () => {
  it('makes one paragraph per line with bold, italic and bold italic', () => {
    expect(rulesHtml('**Lead:** do a *small* thing.\nThen ***all*** of it.')).toBe('<p><b>Lead:</b> do a <i>small</i> thing.</p><p>Then <b><i>all</i></b> of it.</p>');
  });

  it('escapes everything else and skips empty lines', () => {
    expect(rulesHtml('a <b> & "c"\n\n')).toBe('<p>a &#60;b&#62; &#38; &#34;c&#34;</p>');
  });

  it('turns {key} into the key icon', () => {
    expect(rulesHtml('spend {key}')).toMatch(/^<p>spend (<img class="cf-ic ic-key" [^>]*alt="key">|⚷)<\/p>$/);
  });

  it('turns {hit} and {intercept} into the dice icons', () => {
    expect(rulesHtml('{hit} {intercept}')).toMatch(/^<p>(<img [^>]*alt="hit">|✸) (<img [^>]*alt="intercept">|⊘)<\/p>$/);
  });

  it('leaves other braces as they are', () => {
    expect(rulesHtml('{other}')).toBe('<p>{other}</p>');
  });
});
