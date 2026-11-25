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

  it('prints the five Prelude resources under the local slots as icons, none Outraged', () => {
    const v = tableView(ix, game(ix, 3, 7, 0), 0);
    const html = localPanel(v.players[0], t, new Set(), null);
    expect(count(html, 'class="pl-chip')).toBe(5);
    expect(count(html, 'data-tip="res:0-')).toBe(5);
    expect(html).not.toContain('pl-agent');
  });

  it('greys a resource with no token, lights the spendable ones gold, counts tokens and cards', () => {
    const s = game(ix, 3, 7, 0);
    s.players[0].resources = ['fuel', 'fuel', null, null, null, null];
    const v = tableView(ix, s, 0);
    const p = { ...v.players[0], symbols: v.players[0].symbols.map((x) => (x.resource === 'fuel' ? { ...x, cards: 1 } : x)) };
    const html = localPanel(p, t, new Set([0, 1]), null);
    expect(html).toMatch(/class="pl-chip live" data-tip="res:0-fuel"[^]*?<b class="pl-n num">3<\/b>/);
    expect(html).toContain('class="pl-chip none" data-tip="res:0-relic"');
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
    expect(rivalPanel(ix, v, v.players[1], t)).toContain('class="o-space"');
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

  it('draws the bar that opens the Court whenever it holds cards, lays them side by side once open, and has no title', () => {
    const v = tableView(ix, game(ix, 3, 7, 0), 0);
    const data = (id: string) => ({ card: id, kind: 'guild', resource: null, keys: 0, name: id, text: '' });
    const few = { ...v.players[0], court: ['a', 'b'], lore: [] };
    const many = { ...v.players[0], court: 'abcdefghij'.split(''), lore: [] };
    const none = { ...v.players[0], court: [], lore: [] };
    expect(ownCourtPanel(none, t, 'got', data, 454)).not.toContain('data-act="mine-open"');
    expect(ownCourtPanel(few, t, 'got', data, 454)).toContain('data-act="mine-open"');
    expect(ownCourtPanel(few, t, 'got', data, 454)).not.toContain('mine-title');
    expect(ownCourtPanel(many, t, 'got', data, 454)).toContain('data-act="mine-open" aria-expanded="false"');
    const open = ownCourtPanel(many, t, 'got', data, 454, new Set(), true);
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('--gap:8px');
  });

  it('keeps guild cards and lore cards in two groups, each card with its resource above it, parted by a shadow when they overlap', () => {
    const v = tableView(ix, game(ix, 3, 7, 0), 0);
    const data = (id: string) => ({ card: id, kind: id.startsWith('l') ? 'lore' : 'guild', resource: id.startsWith('l') ? null : 'fuel', keys: 0, name: id, text: '' });
    const p = { ...v.players[0], court: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'], lore: ['l1'] };
    const html = ownCourtPanel(p, t, 'got', data as never, 454);
    expect(count(html, 'class="mine-group')).toBe(2);
    expect(html.indexOf('mine-group lore')).toBeGreaterThan(html.lastIndexOf('data-zoom="g6"'));
    expect(count(html, 'class="r-fuel')).toBe(6);
    expect(html).toContain('mine-cards stacked');
  });
});
