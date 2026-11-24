// The seat boards (src/ui/table/render.ts): the Outrage corner shows each
// Outraged resource covered by the seat's agent; the prelude tab lights the
// cards whose power can be used now.
import { describe, expect, it } from 'vitest';
import { localPanel, ownCourtPanel, preludeTab, rivalPanel, sortCourt } from '../../../src/ui/table/render';
import { tableView } from '../../../src/ui/table/view';
import { game, index } from '../engine/fixture';

const t = (key: string) => key;
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('seat board', () => {
  const ix = index();

  it('leaves the outrage corner empty when nothing is Outraged', () => {
    const v = tableView(ix, game(ix, 3, 7, 0), 0);
    const html = rivalPanel(ix, v, v.players[1], t);
    expect(html).toContain('class="outrage"');
    expect(html).not.toContain('o-space');
  });

  it('prints the five Prelude actions under the local slots, none Outraged', () => {
    const v = tableView(ix, game(ix, 3, 7, 0), 0);
    const html = localPanel(v.players[0], t, new Set(), null);
    expect(count(html, 'class="pl-chip"')).toBe(5);
    expect(html).not.toContain('pl-agent');
  });

  it('draws the prelude tab only with cards, lit ones as buttons', () => {
    const v = tableView(ix, game(ix, 3, 7, 0), 0);
    expect(localPanel(v.players[0], t, new Set(), null)).not.toContain('pb-tab');
    const html = localPanel(v.players[0], t, new Set(), null, [{ card: 'a', lit: true }, { card: 'b', lit: false }]);
    expect(count(html, 'class="pre lit"')).toBe(1);
    expect(count(html, 'class="pre"')).toBe(1);
    expect(html).toContain('data-act="power-card"');
  });

  it('covers each Outraged type with an agent, on local and rival boards', () => {
    const s = game(ix, 3, 7, 0);
    s.players[1].outraged = ['fuel', 'relic'];
    const v = tableView(ix, s, 0);
    const html = rivalPanel(ix, v, v.players[1], t);
    expect(count(html, 'class="o-space"')).toBe(2);
    expect(count(html, 'class="o-agent"')).toBe(2);
    const local = localPanel(v.players[1], t, new Set(), null);
    expect(count(local, 'class="pl-chip out"')).toBe(2);
    expect(count(local, 'class="pl-agent"')).toBe(2);
  });

  it('draws the slim local board without guild cards and the prelude powers as a row', () => {
    const v = tableView(ix, game(ix, 3, 7, 0), 0);
    expect(localPanel(v.players[0], t, new Set(), null)).toContain('pb-guild');
    const slim = localPanel(v.players[0], t, new Set(), null, [], true);
    expect(slim).toContain('local slim');
    expect(slim).not.toContain('pb-guild');
    const row = preludeTab([{ card: 'a', lit: true }], t, true);
    expect(row).toContain('class="pre-row"');
    expect(row).toContain('data-act="power-card"');
    expect(preludeTab([], t, true)).toBe('');
  });
});

describe('own Court panel', () => {
  const ix = index();
  const cards = [
    { card: 'a', kind: 'vox', resource: 'relic' },
    { card: 'b', kind: 'guild', resource: 'fuel' },
    { card: 'c', kind: 'guild', resource: null },
    { card: 'd', kind: null, resource: 'fuel' },
  ];

  it('orders cards as acquired, by type or by resource, ties in the order acquired', () => {
    expect(sortCourt(cards, 'got').map((c) => c.card)).toEqual(['a', 'b', 'c', 'd']);
    expect(sortCourt(cards, 'kind').map((c) => c.card)).toEqual(['b', 'c', 'a', 'd']);
    expect(sortCourt(cards, 'resource').map((c) => c.card)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('shows every card with the sort buttons, the chosen one pressed', () => {
    const v = tableView(ix, game(ix, 3, 7, 0), 0);
    const p = { ...v.players[0], court: ['a', 'b'], lore: ['c'] };
    const data = (id: string) => ({ card: id, kind: 'guild', resource: null, keys: 0, name: id, text: '' });
    const html = ownCourtPanel(p, t, 'kind', data, 400);
    expect(count(html, 'class="mine-card ')).toBe(3);
    expect(count(html, 'data-act="court-sort"')).toBe(3);
    expect(html).toContain('data-sort="kind" aria-pressed="true"');
    expect(ownCourtPanel({ ...p, court: [], lore: [] }, t, 'got', data, 400)).toContain('mine-empty');
  });
});
