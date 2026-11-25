// The rule checks the playtest simulator runs after every move (tools/playtest/rulecheck.ts): quiet on
// legal play, and each one speaks up when its rule is broken (rulebook: docs/rules/arcs-rules-library.txt).
import { describe, expect, it } from 'vitest';
import { dispatch } from '../../../src/game/engine';
import type { Command, GameState } from '../../../src/game/engine';
import { ruleChecks } from '../../../tools/playtest/rulecheck';
import { game, index, setHands } from './fixture';

const ix = index();

/** 3-player game, P0 to lead, with known hands. */
function known(hands: string[][]): GameState {
  const s = game(ix, 3, 7, 0);
  setHands(s, hands);
  return s;
}

/** Plays `cmds` one by one and returns every (before, after) pair. */
function steps(s: GameState, cmds: Command[]): [GameState, GameState][] {
  const out: [GameState, GameState][] = [];
  for (const c of cmds) {
    const next = dispatch(ix, s, c);
    out.push([s, next]);
    s = next;
  }
  return out;
}

/** A legal round: P0 leads A3, P1 surpasses with A5, P2 copies; P1 takes the initiative (5.3.1). */
function legalRound(): [GameState, GameState][] {
  const s = known([['suitA-3', 'suitB-2'], ['suitA-5', 'suitB-3'], ['suitC-4', 'suitC-2']]);
  return steps(s, [
    { type: 'lead', player: 0, card: 'suitA-3' },
    { type: 'endTurn', player: 0 },
    { type: 'follow', player: 1, card: 'suitA-5', mode: 'surpass' },
    { type: 'endTurn', player: 1 },
    { type: 'follow', player: 2, card: 'suitC-4', mode: 'copy' },
    { type: 'endTurn', player: 2 },
  ]);
}

const rules = (prev: GameState, next: GameState) => ruleChecks(ix, prev, next).map((b) => b.rule);

describe('rule checks after each move', () => {
  it('a legal round breaks no checked rule, and the round gives the initiative to the highest Surpass', () => {
    const pairs = legalRound();
    for (const [prev, next] of pairs) expect(ruleChecks(ix, prev, next)).toEqual([]);
    expect(pairs.at(-1)![1].initiative).toBe(1);
  });

  it('a round that ends with the initiative at the wrong seat is reported (5.3.1)', () => {
    const [prev, next] = legalRound().at(-1)!;
    const wrong = structuredClone(next);
    wrong.initiative = 0;
    expect(rules(prev, wrong)).toContain('initiative');
  });

  it('a Surpass with a lower number than the lead card is reported (5.2.2)', () => {
    const [prev, next] = legalRound()[2];
    const bad = structuredClone(next);
    bad.round.plays[1].card = 'suitA-2';
    expect(rules(prev, bad)).toContain('surpass');
  });

  it('a Pivot of the lead suit is reported (5.2.2)', () => {
    const [prev, next] = legalRound()[2];
    const bad = structuredClone(next);
    bad.round.plays[1].mode = 'pivot';
    expect(rules(prev, bad)).toContain('pivot');
  });

  it('plays out of clockwise order are reported (5.2.1)', () => {
    const [prev, next] = legalRound()[4];
    const bad = structuredClone(next);
    [bad.round.plays[1].player, bad.round.plays[2].player] = [bad.round.plays[2].player, bad.round.plays[1].player];
    expect(rules(prev, bad)).toContain('turn-order');
  });

  it('an action card that vanishes is reported (5.4.1, 6.2.4)', () => {
    const [prev, next] = legalRound()[0];
    const bad = structuredClone(next);
    bad.players[1].hand.pop();
    expect(rules(prev, bad)).toContain('card-count');
  });

  it('a declaration that does not take the highest marker left is reported (5.1.3)', () => {
    const s = known([['suitA-3'], ['suitA-5'], ['suitC-4']]);
    const next = structuredClone(s);
    const [, second] = next.ambitions.available;
    next.ambitions.available = next.ambitions.available.filter((m) => m !== second);
    next.ambitions.declared.wealth.push(second);
    expect(rules(s, next)).toContain('ambition-markers');
  });

  it('a Court left short while the Court deck has cards is reported (Secure, step 3)', () => {
    const s = known([['suitA-3'], ['suitA-5'], ['suitC-4']]);
    const next = structuredClone(s);
    next.courtDiscard.push(next.court.pop()!.card);
    expect(next.courtDeck.length).toBeGreaterThan(0);
    expect(rules(s, next)).toContain('court');
  });

  it('a chapter that begins although someone reached the Power to win is reported (6.2.3)', () => {
    const s = known([['suitA-3'], ['suitA-5'], ['suitC-4']]);
    const next = structuredClone(s);
    next.chapter += 1;
    next.players[0].power = ix.content.powerToWin[3];
    expect(rules(s, next)).toContain('game-end');
  });

  it('a chapter that begins with a short hand is reported (6.2.4)', () => {
    const s = known([['suitA-3'], ['suitA-5'], ['suitC-4']]);
    const next = structuredClone(s);
    next.chapter += 1;
    expect(rules(s, next)).toContain('hand-size');
  });
});
