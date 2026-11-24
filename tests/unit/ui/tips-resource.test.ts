// The hover card of a resource in a seat's Prelude row (src/ui/table/tips.ts):
// what spending it does, its tokens and Court cards, and whether it can be spent.
import { describe, expect, it } from 'vitest';
import { parseTip, tipHtml } from '../../../src/ui/table/tips';
import { tableView } from '../../../src/ui/table/view';
import { game, index } from '../engine/fixture';

const t = (key: string) => key;

describe('resource hover card', () => {
  const ix = index();

  it('reads a resource target and rejects an unknown resource', () => {
    expect(parseTip('res:2-fuel')).toEqual({ kind: 'resource', player: 2, resource: 'fuel' });
    expect(parseTip('res:2-gold')).toBeNull();
  });

  it('says what spending it does and that an Outraged one cannot be spent', () => {
    const s = game(ix, 3, 7, 0);
    s.players[1].outraged = ['relic'];
    const v = tableView(ix, s, 0);
    const html = tipHtml(ix, v, { kind: 'resource', player: 1, resource: 'relic' }, t) ?? '';
    expect(html).toContain('prelude.act.relic');
    expect(html).toContain('prelude.state.outraged');
  });

  it('says there is nothing to spend when the seat holds no token of it', () => {
    const s = game(ix, 3, 7, 0);
    s.players[0].resources = s.players[0].resources.map(() => null);
    const v = tableView(ix, s, 0);
    expect(tipHtml(ix, v, { kind: 'resource', player: 0, resource: 'fuel' }, t)).toContain('prelude.state.none');
  });

  it('reads a trophies or captives target', () => {
    expect(parseTip('spoils:1-trophies')).toEqual({ kind: 'spoils', player: 1, what: 'trophies' });
    expect(parseTip('spoils:1-loot')).toBeNull();
  });

  it('lists the captives of a seat by whose agents they are, and says nobody when there are none', () => {
    const s = game(ix, 3, 7, 0);
    s.players[1].captives = [0, 2, 2];
    const v = tableView(ix, s, 0);
    const html = tipHtml(ix, v, { kind: 'spoils', player: 1, what: 'captives' }, t) ?? '';
    expect(html).toContain('stat.captives');
    expect(html.split('class="tip-row"').length - 1).toBe(2);
    expect(tipHtml(ix, v, { kind: 'spoils', player: 1, what: 'trophies' }, t)).toContain('detail.nobody');
  });

  it('shows the board of a rival without repeating trophies, captives and cards under it', () => {
    const v = tableView(ix, game(ix, 3, 7, 0), 0);
    const html = tipHtml(ix, v, { kind: 'seat', player: 1 }, t) ?? '';
    expect(html).toContain('data-tip="spoils:1-trophies"');
    expect(html).not.toContain('tip-cards');
    expect(html).not.toContain('class="tip-row"');
  });
});
