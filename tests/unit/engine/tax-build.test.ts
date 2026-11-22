// Tax and Build per the rulebook (design/gdd/core-loop.md §3.5).
import { describe, expect, it } from 'vitest';
import { dispatch, heldResources, RuleError } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { game, index, run, setHands } from './fixture';

const ix = index();

/** 2-player game (setup-2a), P0 leads `card`; c1-p1 holds P0's city. */
function leading(card: string): GameState {
  const s = game(ix, 2, 5, 0, 'setup-2a');
  setHands(s, [[card], ['suitA-4']]);
  return dispatch(ix, s, { type: 'lead', player: 0, card });
}

describe('tax', () => {
  it('a damaged Loyal city can be taxed', () => {
    const s = leading('suitA-2');
    s.map['c1-p1'].buildings[0].damaged = true;
    const after = dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'tax', system: 'c1-p1' } });
    expect(heldResources(after.players[0])).toHaveLength(heldResources(s.players[0]).length + 1);
  });

  it('the same city cannot be taxed twice in a turn', () => {
    const s = dispatch(ix, leading('suitA-2'), { type: 'action', player: 0, action: { kind: 'tax', system: 'c1-p1' } });
    expect(() => dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'tax', system: 'c1-p1' } })).toThrow(/already taxed/);
  });

  it('two cities on one planet can each be taxed once', () => {
    const s = leading('suitA-2');
    s.map['c1-p1'].buildings.push({ owner: 0, type: 'city', damaged: false });
    const after = run(ix, s, [
      { type: 'action', player: 0, action: { kind: 'tax', system: 'c1-p1' } },
      { type: 'action', player: 0, action: { kind: 'tax', system: 'c1-p1' } },
    ]);
    expect(heldResources(after.players[0])).toHaveLength(heldResources(s.players[0]).length + 2);
  });

  it('the tax limit resets on the next turn', () => {
    let s = dispatch(ix, leading('suitA-2'), { type: 'action', player: 0, action: { kind: 'tax', system: 'c1-p1' } });
    s = dispatch(ix, s, { type: 'endTurn', player: 0 });
    s = dispatch(ix, s, { type: 'follow', player: 1, card: 'suitA-4', mode: 'surpass' });
    expect(s.phase).toMatchObject({ type: 'actions', budget: { player: 1 } });
    expect((s.phase as { budget: { taxed?: string[] } }).budget.taxed).toBeUndefined();
  });
});

describe('build', () => {
  it('a building only needs a Loyal piece in the system, not a ship', () => {
    const s = leading('suitC-2');
    s.map['c1-p1'].ships = {};
    const after = dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'build', system: 'c1-p1', what: 'starport' } });
    expect(after.map['c1-p1'].buildings.map((b) => b.type)).toEqual(['city', 'starport']);
  });

  it('each starport builds only one ship per turn', () => {
    const s = dispatch(ix, leading('suitC-2'), { type: 'action', player: 0, action: { kind: 'build', system: 'c1-p2', what: 'ship' } });
    expect(() => dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'build', system: 'c1-p2', what: 'ship' } })).toThrow(RuleError);
  });

  it('a piece built where a rival controls the system arrives damaged', () => {
    const s = leading('suitC-2');
    s.map['c1-p2'].ships[1] = { fresh: 5, damaged: 0 };
    const after = run(ix, s, [
      { type: 'action', player: 0, action: { kind: 'build', system: 'c1-p2', what: 'ship' } },
      { type: 'action', player: 0, action: { kind: 'build', system: 'c1-p2', what: 'city' } },
    ]);
    expect(after.map['c1-p2'].ships[0].damaged).toBe(1);
    expect(after.map['c1-p2'].buildings.at(-1)).toEqual({ owner: 0, type: 'city', damaged: true });
  });

  it('a piece built on a tie for control arrives fresh', () => {
    const s = leading('suitC-2');
    s.map['c1-p2'].ships[1] = { fresh: s.map['c1-p2'].ships[0].fresh, damaged: 0 };
    const after = dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'build', system: 'c1-p2', what: 'ship' } });
    expect(after.map['c1-p2'].ships[0].damaged).toBe(0);
  });
});
