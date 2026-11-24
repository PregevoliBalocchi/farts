// The decks and discard piles a seat may inspect (src/ui/table/view.ts pilesView)
// and the face-down discards behind them (src/game/engine/ops.ts toDiscard).
import { describe, expect, it } from 'vitest';
import { toDiscard } from '../../../src/game/engine';
import { pilesView } from '../../../src/ui/table/view';
import { game, index, run, setHands } from '../engine/fixture';

const ix = index();

/** A round where P1 copies face down and P2 seizes with a second card: P0 leads face up. */
function roundWithSecrets() {
  const s = game(ix, 3, 7, 0);
  setHands(s, [['suitA-3', 'suitB-2'], ['suitB-6', 'suitB-3'], ['suitC-4', 'suitC-2', 'suitC-5']]);
  return run(ix, s, [
    { type: 'lead', player: 0, card: 'suitA-3' },
    { type: 'endTurn', player: 0 },
    { type: 'follow', player: 1, card: 'suitB-6', mode: 'copy' },
    { type: 'endTurn', player: 1 },
    { type: 'follow', player: 2, card: 'suitC-4', mode: 'copy', seizeWith: 'suitC-2' },
    { type: 'endTurn', player: 2 },
  ]);
}

describe('action discard', () => {
  it('keeps the order of discarding and marks face-down cards with who discarded them', () => {
    const s = roundWithSecrets();
    expect(s.discard).toEqual(['suitC-2', 'suitA-3', 'suitB-6', 'suitC-4']);
    expect(s.discardHidden).toEqual({ 'suitC-2': 2, 'suitB-6': 1, 'suitC-4': 2 });
  });

  it('shows the pile top first, face-down cards only to whoever discarded them', () => {
    const s = roundWithSecrets();
    const forP0 = pilesView(ix, s, 0).discard;
    expect(forP0.map((d) => d.card?.card ?? null)).toEqual([null, null, 'suitA-3', null]);
    expect(forP0.map((d) => d.faceDown)).toEqual([true, true, false, true]);
    const forP2 = pilesView(ix, s, 2).discard;
    expect(forP2.map((d) => d.card?.card ?? null)).toEqual(['suitC-4', null, 'suitA-3', 'suitC-2']);
  });

  it('a secret card drawn back and later discarded face up shows to everyone', () => {
    const s = roundWithSecrets();
    const drawn = s.discard.splice(s.discard.indexOf('suitB-6'), 1);
    toDiscard(s, drawn);
    expect(s.discardHidden?.['suitB-6']).toBeUndefined();
    expect(pilesView(ix, s, 0).discard[0]).toEqual({ card: expect.objectContaining({ card: 'suitB-6' }), faceDown: false });
  });
});

describe('Court piles', () => {
  it('shows the Court discard top first', () => {
    const s = game(ix, 3, 7, 0);
    s.courtDiscard = ['a', 'b', 'c'];
    expect(pilesView(ix, s, 0).courtDiscard).toEqual(['c', 'b', 'a']);
  });

  it('lists the Court deck in a fixed order, never its real one, and hides cards put in it in secret', () => {
    const s = game(ix, 3, 7, 0);
    const deck = [...s.courtDeck];
    const secret = deck[deck.length - 1];
    s.courtDeckSecret = [secret];
    const v = pilesView(ix, s, 0);
    expect(v.courtDeckSecret).toBe(1);
    expect(v.courtDeck).not.toContain(secret);
    expect([...v.courtDeck].sort()).toEqual(deck.filter((c) => c !== secret).sort());
    // Same listing whatever the deck's real order.
    s.courtDeck.reverse();
    expect(pilesView(ix, s, 0).courtDeck).toEqual(v.courtDeck);
  });
});
