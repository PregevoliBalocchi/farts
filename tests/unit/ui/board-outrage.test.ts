// The seat boards (src/ui/table/render.ts): the Outrage corner shows each
// Outraged resource covered by the seat's agent; the prelude tab lights the
// cards whose power can be used now.
import { describe, expect, it } from 'vitest';
import { localPanel, rivalPanel } from '../../../src/ui/table/render';
import { tableView } from '../../../src/ui/table/view';
import { game, index } from '../engine/fixture';

const t = (key: string) => key;
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('seat board', () => {
  const ix = index();

  it('leaves the outrage corner empty when nothing is Outraged', () => {
    const v = tableView(ix, game(ix, 3, 7, 0), 0);
    const html = localPanel(v.players[0], t, new Set(), null);
    expect(html).toContain('class="outrage"');
    expect(html).not.toContain('o-space');
  });

  it('draws the prelude tab only with cards, lit ones as buttons', () => {
    const v = tableView(ix, game(ix, 3, 7, 0), 0);
    expect(localPanel(v.players[0], t, new Set(), null)).not.toContain('pb-tab');
    const html = localPanel(v.players[0], t, new Set(), null, [{ card: 'a', lit: true }, { card: 'b', lit: false }]);
    expect(count(html, 'class="pre lit"')).toBe(1);
    expect(count(html, 'class="pre"')).toBe(1);
    expect(html).toContain('data-act="powers-open"');
  });

  it('covers each Outraged type with an agent, on local and rival boards', () => {
    const s = game(ix, 3, 7, 0);
    s.players[1].outraged = ['fuel', 'relic'];
    const v = tableView(ix, s, 0);
    const html = rivalPanel(ix, v, v.players[1], t);
    expect(count(html, 'class="o-space"')).toBe(2);
    expect(count(html, 'class="o-agent"')).toBe(2);
    expect(count(localPanel(v.players[1], t, new Set(), null), 'class="o-agent"')).toBe(2);
  });
});
