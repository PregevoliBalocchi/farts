// Card options of basic actions offered by the table (src/ui/table/variants.ts actionVariants,
// production/base-fixes.md #47): found by trying the action's optional fields against the engine.
import { describe, expect, it } from 'vitest';
import { dispatch } from '../../../src/game/engine';
import type { ActionPayload, GameState } from '../../../src/game/engine';
import { actionVariants } from '../../../src/ui/table/variants';
import { cardsIndex, runAll, start } from '../cards/fixture';

const ix = cardsIndex((c) => {
  c.map.systems.find((x) => x.id === 'c1-p1')!.slots = 1;
});
const city = (owner: number) => ({ owner, type: 'city' as const, damaged: false });

/** P0 holds `leader` and has led an Administration card (Tax, Influence...). */
function leading(leader: string | null, setup: (s: GameState) => void = () => {}): GameState {
  const s = start(ix, [['suitA-2', 'suitA-3'], ['suitA-5', 'suitA-6']]);
  s.players[0].leader = leader;
  setup(s);
  return dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-2' });
}

const keys = (s: GameState, a: ActionPayload) => actionVariants(ix, s, 0, a).map((v) => v.parts.map((p) => p.key).join('+'));

describe('actionVariants', () => {
  it('offers nothing for a plain tax without a card that changes it', () => {
    const s = leading(null, (x) => {
      x.map['c1-p2'].buildings = [city(0)];
    });
    expect(actionVariants(ix, s, 0, { kind: 'tax', system: 'c1-p2' })).toEqual([]);
  });

  it('offers the Overseer tax twice, accepted by the engine', () => {
    const s = leading('leader-10', (x) => {
      x.map['c1-p2'].buildings = [city(0)];
    });
    const vs = actionVariants(ix, s, 0, { kind: 'tax', system: 'c1-p2' });
    expect(vs.map((v) => v.parts.map((p) => p.key))).toEqual([['again']]);
    expect(() => dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'tax', system: 'c1-p2', ...vs[0].extra } as ActionPayload })).not.toThrow();
  });

  it('offers the Shaper a planet change with each resource held', () => {
    const s = leading('leader-14', (x) => {
      x.players[0].resources = ['fuel', 'material'];
      x.map['c1-p2'].buildings = [city(0)];
    });
    const shapes = actionVariants(ix, s, 0, { kind: 'tax', system: 'c1-p2' }).flatMap((v) => v.parts).filter((p) => p.key === 'shape');
    expect(shapes.map((p) => (p.key === 'shape' ? p.resource : '')).sort()).toEqual(['fuel', 'material']);
  });

  it('offers the Noble a second influence only when copying', () => {
    let s = start(ix, [['suitA-2'], ['suitA-4']]);
    s.players[1].leader = 'leader-12';
    s = runAll(ix, s, [
      { type: 'lead', player: 0, card: 'suitA-2' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitA-4', mode: 'copy' },
    ]);
    const twice = actionVariants(ix, s, 1, { kind: 'influence', courtSlot: 0 });
    expect(twice.length).toBeGreaterThan(0);
    expect(twice.every((v) => v.parts[0].key === 'twice')).toBe(true);
    expect(keys(leading('leader-12'), { kind: 'influence', courtSlot: 0 })).toEqual([]);
  });
});
