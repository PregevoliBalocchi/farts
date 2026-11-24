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
});
