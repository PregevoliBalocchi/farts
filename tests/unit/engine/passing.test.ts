// Passing the initiative and chapter end (design/gdd/core-loop.md §3.3).
import { describe, expect, it } from 'vitest';
import { dispatch } from '../../../src/game/engine';
import { game, index, run, setHands } from './fixture';

const ix = index();

describe('passing the initiative', () => {
  it('a holder with cards may pass: the next player with cards leads a new round', () => {
    const s = game(ix, 3, 7, 0);
    setHands(s, [['suitA-2'], [], ['suitB-3']]);
    const after = dispatch(ix, s, { type: 'pass', player: 0 });
    expect(after.initiative).toBe(2); // P1 has no cards
    expect(after.phase).toEqual({ type: 'lead' });
    expect(after.chapter).toBe(1);
  });

  it('only the initiative holder can pass, and only before leading', () => {
    const s = game(ix, 3, 7, 0);
    expect(() => dispatch(ix, s, { type: 'pass', player: 1 })).toThrow(/Not P1/);
    const led = dispatch(ix, s, { type: 'lead', player: 0, card: s.players[0].hand[0] });
    expect(() => dispatch(ix, led, { type: 'pass', player: 0 })).toThrow(/Only the initiative holder/);
  });

  it('everyone with cards passing in a row ends the chapter', () => {
    const s = game(ix, 3, 7, 0);
    setHands(s, [['suitA-2'], ['suitA-4'], ['suitB-3']]);
    const after = run(ix, s, [
      { type: 'pass', player: 0 },
      { type: 'pass', player: 1 },
      { type: 'pass', player: 2 },
    ]);
    expect(after.chapter).toBe(2);
  });

  it('a lead in between resets the pass count', () => {
    const s = game(ix, 3, 7, 0);
    setHands(s, [['suitA-2'], ['suitA-4', 'suitA-5'], ['suitB-3']]);
    const after = run(ix, s, [
      { type: 'pass', player: 0 },
      { type: 'lead', player: 1, card: 'suitA-4' },
      { type: 'endTurn', player: 1 },
      { type: 'follow', player: 2, card: 'suitB-3', mode: 'copy' },
      { type: 'endTurn', player: 2 },
      { type: 'follow', player: 0, card: 'suitA-2', mode: 'copy' },
      { type: 'endTurn', player: 0 },
    ]);
    // P1 led and won; only P1 still has cards, so the chapter goes on.
    expect(after.chapter).toBe(1);
    expect(after.initiative).toBe(1);
    expect(after.consecutivePasses).toBe(0);
  });

  it('a round winner with no cards hands the initiative on instead of ending the chapter', () => {
    const s = game(ix, 3, 7, 0);
    setHands(s, [['suitA-3', 'suitC-2'], ['suitA-5'], ['suitB-3', 'suitB-4']]);
    const after = run(ix, s, [
      { type: 'lead', player: 0, card: 'suitA-3' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitA-5', mode: 'surpass' },
      { type: 'endTurn', player: 1 },
      { type: 'follow', player: 2, card: 'suitB-3', mode: 'copy' },
      { type: 'endTurn', player: 2 },
    ]);
    // P1 won the round but has no cards left: initiative goes clockwise to P2.
    expect(after.chapter).toBe(1);
    expect(after.initiative).toBe(2);
  });

  it('the chapter ends when nobody has cards', () => {
    const s = game(ix, 3, 7, 0);
    setHands(s, [['suitA-3'], ['suitA-5'], ['suitB-3']]);
    const after = run(ix, s, [
      { type: 'lead', player: 0, card: 'suitA-3' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitA-5', mode: 'surpass' },
      { type: 'endTurn', player: 1 },
      { type: 'follow', player: 2, card: 'suitB-3', mode: 'copy' },
      { type: 'endTurn', player: 2 },
    ]);
    expect(after.chapter).toBe(2);
  });
});
