// The Outrage row of the seat boards (src/ui/table/render.ts): one space per
// resource type, covered by the seat's agent when that type is Outraged.
import { describe, expect, it } from 'vitest';
import { localPanel, rivalPanel } from '../../../src/ui/table/render';
import { tableView } from '../../../src/ui/table/view';
import { game, index } from '../engine/fixture';

const t = (key: string) => key;
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('outrage row', () => {
  const ix = index();

  it('shows one empty space per resource type when nothing is Outraged', () => {
    const v = tableView(ix, game(ix, 3, 7, 0), 0);
    const html = localPanel(v.players[0], t, new Set(), null);
    expect(count(html, 'class="o-space"')).toBe(v.players[0].held.length);
    expect(html).not.toContain('o-agent');
  });

  it('covers each Outraged type with an agent, on local and rival boards', () => {
    const s = game(ix, 3, 7, 0);
    s.players[1].outraged = ['fuel', 'relic'];
    const v = tableView(ix, s, 0);
    const html = rivalPanel(ix, v, v.players[1], t);
    expect(count(html, 'class="o-space on"')).toBe(2);
    expect(count(html, 'class="o-agent"')).toBe(2);
    expect(count(localPanel(v.players[1], t, new Set(), null), 'class="o-space on"')).toBe(2);
  });
});
