// Decision answers offered as buttons (src/ui/table/decide.ts) and the Catapult
// move payload (src/ui/table/intent.ts), on the card test content.
import { describe, expect, it } from 'vitest';
import { dispatch } from '../../../src/game/engine';
import { decisionOptions } from '../../../src/ui/table/decide';
import { cutRoute, extendRoute, fitDrops, movePayload, routeOf, routeStops, setDrop } from '../../../src/ui/table/intent';
import type { MoveIntent } from '../../../src/ui/table/intent';
import { cardsIndex, runAll, start } from '../cards/fixture';

describe('decisionOptions', () => {
  const ix = cardsIndex();

  /** P0 secures the Vox card with effect `effect` and waits on its Decision. */
  function secured(effect: string) {
    const s = start(ix);
    s.court[0] = { card: `v:${effect}`, agents: { 0: 1 } };
    s.players[0].resources = ['relic'];
    return runAll(ix, s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'prelude', player: 0, resource: 'relic', action: { kind: 'secure', courtSlot: 0 } },
    ]);
  }

  it('offers declining first, then one button per Outrage type', () => {
    const s = secured('court-28');
    expect(s.phase.type).toBe('decide');
    const opts = decisionOptions(ix, s, 0);
    expect(opts[0].parts).toEqual([]);
    const types = opts.filter((o) => o.parts.some((p) => p.key === 'type')).map((o) => o.args.type);
    expect(types).toContain('material');
    expect(types.length).toBeGreaterThan(1);
  });

  it('only offers answers the engine accepts', () => {
    const s = secured('court-27');
    const opts = decisionOptions(ix, s, 0);
    expect(opts.some((o) => o.parts.some((p) => p.key === 'ambition'))).toBe(true);
    for (const o of opts) expect(() => dispatch(ix, s, { type: 'decide', player: 0, args: o.args })).not.toThrow();
  });

  it('merges answers that lead to the same game state', () => {
    const s = secured('court-28');
    const opts = decisionOptions(ix, s, 0);
    // Keys the effect ignores (a rival, a system...) give the same state as declining.
    expect(opts.some((o) => o.parts.some((p) => p.key === 'rival'))).toBe(false);
  });

  it('is empty for a player the Decision does not wait on', () => {
    const s = secured('court-28');
    expect(decisionOptions(ix, s, 1)).toEqual([]);
  });
});

describe('movePayload', () => {
  it('lists the Catapult path and the ships dropped on the way', () => {
    const p = movePayload({ step: 'move', from: 'a', via: ['b', 'c'], to: 'd', ships: 3, damaged: 0, drop: { b: 1, c: 0 } });
    expect(p).toEqual({ kind: 'move', from: 'a', to: 'd', ships: 3, via: ['b', 'c'], drop: [{ at: 'b', ships: 1 }] });
  });

  it('leaves via and drop out of a plain move', () => {
    const p = movePayload({ step: 'move', from: 'a', via: [], to: 'b', ships: 2, damaged: 1, drop: {} });
    expect(p).toEqual({ kind: 'move', from: 'a', to: 'b', ships: 2, damaged: 1 });
  });
});

describe('route planning', () => {
  const plan = (over: Partial<MoveIntent> = {}): MoveIntent => ({ step: 'move', from: 'a', via: [], to: 'b', ships: 4, damaged: 1, drop: {}, ...over });

  it('carries the route on one step at a time', () => {
    const r = extendRoute(extendRoute(plan(), 'c'), 'd');
    expect(routeOf(r)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('cuts the route back to a system it passes through, forgetting what was planned after', () => {
    const r = plan({ via: ['b', 'c'], to: 'd', drop: { b: 1, c: 2 } });
    const cut = cutRoute(r, 'c')!;
    expect(routeOf(cut)).toEqual(['a', 'b', 'c']);
    expect(cut.drop).toEqual({ b: 1 });
    expect(cutRoute(r, 'a')).toBeNull();
    expect(cutRoute(r, 'd')).toBeNull();
  });

  it('lists the ships left on the way and the rest at the end', () => {
    const r = plan({ via: ['b', 'c'], to: 'd', drop: { b: 1 }, dropDamaged: { c: 1 } });
    expect(routeStops(r)).toEqual([
      { system: 'b', fresh: 1, damaged: 0, last: false },
      { system: 'c', fresh: 0, damaged: 1, last: false },
      { system: 'd', fresh: 3, damaged: 0, last: true },
    ]);
    expect(movePayload(r)).toEqual({ kind: 'move', from: 'a', to: 'd', ships: 4, damaged: 1, via: ['b', 'c'], drop: [{ at: 'b', ships: 1 }, { at: 'c', ships: 0, damaged: 1 }] });
  });

  it('keeps the ships left behind within the ships still moving', () => {
    const r = setDrop(setDrop(plan({ via: ['b', 'c'], to: 'd' }), 'b', 3), 'c', 5);
    expect(r.drop).toEqual({ b: 3, c: 1 });
    expect(fitDrops({ ...r, ships: 2 }).drop).toEqual({ b: 2, c: 0 });
  });
});
