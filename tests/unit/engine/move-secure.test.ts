// Catapult moves and Court refill (design/gdd/core-loop.md §3.4–3.5).
import { describe, expect, it } from 'vitest';
import { dispatch } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { game, index, setHands } from './fixture';

const ix = index();

/** 2 players (setup-2a): P0 has a starport at c1-p2 with 2 ships; P1 holds c3-gate with 1 ship. P0 leads a move card. */
function ready(): GameState {
  const s = game(ix, 2, 5, 0, 'setup-2a');
  setHands(s, [['suitD-2'], ['suitA-4']]);
  return dispatch(ix, s, { type: 'lead', player: 0, card: 'suitD-2' });
}

describe('catapult moves', () => {
  it('ships from a Loyal starport keep moving through gates, dropping some off', () => {
    const s = dispatch(ix, ready(), {
      type: 'action',
      player: 0,
      action: { kind: 'move', from: 'c1-p2', via: ['c1-gate', 'c2-gate'], to: 'c3-gate', ships: 2, drop: [{ at: 'c1-gate', ships: 1 }] },
    });
    expect(s.map['c1-p2'].ships[0]).toEqual({ fresh: 0, damaged: 0 });
    expect(s.map['c1-gate'].ships[0].fresh).toBe(2); // 1 from setup + 1 dropped
    expect(s.map['c3-gate'].ships[0].fresh).toBe(1); // stops at the rival-controlled gate
  });

  it('catapulting ships stop on entering a planet', () => {
    const s = ready();
    expect(() =>
      dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'move', from: 'c1-p2', via: ['c1-gate', 'c1-p3'], to: 'c1-p2', ships: 1 } }),
    ).toThrow(/stop at planet/);
  });

  it('catapulting ships stop at a gate a rival controls, checked before moving in', () => {
    const s = ready();
    expect(() =>
      dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'move', from: 'c1-p2', via: ['c1-gate', 'c2-gate', 'c3-gate'], to: 'c4-gate', ships: 2 } }),
    ).toThrow(/rival controls/);
  });

  it('only a system with a Loyal starport allows catapulting', () => {
    const s = ready();
    expect(() =>
      dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'move', from: 'c1-p1', via: ['c1-gate'], to: 'c2-gate', ships: 1 } }),
    ).toThrow(/Loyal starport/);
  });

  it('a plain move still goes to one adjacent system', () => {
    const s = ready();
    expect(() => dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'move', from: 'c1-p1', to: 'c2-gate', ships: 1 } })).toThrow(/not connected/);
  });
});

describe('secure', () => {
  it('the new Court card goes in the spot of the secured one', () => {
    const s = game(ix, 3, 7, 0);
    setHands(s, [['suitB-2'], ['suitA-4'], ['suitB-6']]);
    s.court[1].agents = { 0: 1 };
    const next = s.courtDeck[0];
    const others = [s.court[0].card, s.court[2].card, s.court[3].card];
    let after = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' });
    after = dispatch(ix, after, { type: 'action', player: 0, action: { kind: 'secure', courtSlot: 1 } });
    expect(after.court.map((x) => x.card)).toEqual([others[0], next, others[1], others[2]]);
  });
});
