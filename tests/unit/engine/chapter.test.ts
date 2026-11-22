import { describe, expect, it } from 'vitest';
import { dispatch, RuleError } from '../../../src/game/engine';
import { game, index, playRoundCopying, run, setHands } from './fixture';

const ix = index();

/** 3-player game, P0 to lead, with known hands. */
function known(hands: string[][]) {
  const s = game(ix, 3, 7, 0);
  setHands(s, hands);
  return s;
}

describe('rounds and initiative', () => {
  it('surpass with a higher lead-suit card takes the initiative', () => {
    const s = run(ix, known([['suitA-3', 'suitB-2'], ['suitA-5', 'suitB-3'], ['suitC-4', 'suitC-2']]), [
      { type: 'lead', player: 0, card: 'suitA-3' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitA-5', mode: 'surpass' },
      { type: 'endTurn', player: 1 },
      { type: 'follow', player: 2, card: 'suitC-4', mode: 'pivot' },
      { type: 'endTurn', player: 2 },
    ]);
    expect(s.initiative).toBe(1);
    expect(s.phase).toEqual({ type: 'lead' });
    expect(s.discard).toEqual(['suitA-3', 'suitA-5', 'suitC-4']);
  });

  it('rejects a surpass with a lower number', () => {
    const s = run(ix, known([['suitA-5', 'suitB-2'], ['suitA-3', 'suitB-3'], ['suitC-4', 'suitC-2']]), [
      { type: 'lead', player: 0, card: 'suitA-5' },
      { type: 'endTurn', player: 0 },
    ]);
    expect(() => dispatch(ix, s, { type: 'follow', player: 1, card: 'suitA-3', mode: 'surpass' })).toThrow(RuleError);
  });

  it('a pivot gives one action of its own suit', () => {
    const s = run(ix, known([['suitA-2', 'suitB-2'], ['suitB-6', 'suitB-3'], ['suitC-4', 'suitC-2']]), [
      { type: 'lead', player: 0, card: 'suitA-2' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitB-6', mode: 'pivot' },
    ]);
    expect(s.phase).toEqual({ type: 'actions', budget: { player: 1, kinds: ['battle', 'move', 'secure'], remaining: 1 } });
  });

  it('a copy gives one action of the lead suit', () => {
    const s = run(ix, known([['suitA-2', 'suitB-2'], ['suitB-6', 'suitB-3'], ['suitC-4', 'suitC-2']]), [
      { type: 'lead', player: 0, card: 'suitA-2' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitB-6', mode: 'copy' },
    ]);
    expect(s.phase).toEqual({ type: 'actions', budget: { player: 1, kinds: ['tax', 'repair', 'influence'], remaining: 1 } });
  });

  it('seizing overrides a surpass', () => {
    const s = run(ix, known([['suitA-3', 'suitB-2'], ['suitA-5', 'suitB-3'], ['suitC-4', 'suitC-2', 'suitD-2']]), [
      { type: 'lead', player: 0, card: 'suitA-3' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitA-5', mode: 'surpass' },
      { type: 'endTurn', player: 1 },
      { type: 'follow', player: 2, card: 'suitC-4', mode: 'copy', seizeWith: 'suitC-2' },
      { type: 'endTurn', player: 2 },
    ]);
    expect(s.initiative).toBe(2);
    expect(s.players[2].hand).toEqual(['suitD-2']);
  });

  it('declaring zeroes the lead card so any lead-suit card surpasses', () => {
    let s = run(ix, known([['suitA-6', 'suitB-2'], ['suitA-2', 'suitB-3'], ['suitC-4', 'suitC-2']]), [
      { type: 'lead', player: 0, card: 'suitA-6', declare: true },
    ]);
    expect(s.ambitions.declared.psionics).toEqual(['m-high']);
    expect(s.ambitions.available).toEqual(['m-mid', 'm-low']);
    s = run(ix, s, [
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitA-2', mode: 'surpass' },
      { type: 'endTurn', player: 1 },
      { type: 'follow', player: 2, card: 'suitC-4', mode: 'copy' },
      { type: 'endTurn', player: 2 },
    ]);
    expect(s.initiative).toBe(1);
  });

  it('declared lead with no surpass keeps the initiative with the leader', () => {
    const s = run(ix, known([['suitA-6', 'suitB-2'], ['suitB-5', 'suitB-3'], ['suitC-4', 'suitC-2']]), [
      { type: 'lead', player: 0, card: 'suitA-6', declare: true },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitB-5', mode: 'copy' },
      { type: 'endTurn', player: 1 },
      { type: 'follow', player: 2, card: 'suitC-4', mode: 'copy' },
      { type: 'endTurn', player: 2 },
    ]);
    expect(s.initiative).toBe(0);
  });

  it('only the active player may act', () => {
    const s = game(ix, 3, 7, 0);
    expect(() => dispatch(ix, s, { type: 'lead', player: 1, card: s.players[1].hand[0] })).toThrow(/Not P1/);
  });

  it('dispatch does not mutate the input state', () => {
    const s = game(ix, 3, 7, 0);
    const before = structuredClone(s);
    dispatch(ix, s, { type: 'lead', player: 0, card: s.players[0].hand[0] });
    expect(s).toEqual(before);
  });
});

describe('chapter end', () => {
  it('ends after six rounds when hands run out and deals a new chapter', () => {
    let s = game(ix, 3, 3, 0);
    for (let r = 0; r < 6; r++) s = playRoundCopying(ix, s);
    expect(s.chapter).toBe(2);
    for (const p of s.players) expect(p.hand).toHaveLength(6);
    expect(s.deck.length + s.players.reduce((n, p) => n + p.hand.length, 0)).toBe(20);
  });

  it('scores declared ambitions at chapter end', () => {
    let s = game(ix, 3, 3, 0);
    s.players[1].resources = ['material', 'fuel'];
    s.players[2].resources = ['material'];
    setHands(s, [['suitA-2', ...s.players[0].hand.slice(1)], s.players[1].hand, s.players[2].hand]);
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-2', declare: true });
    expect(s.ambitions.declared.wealth).toEqual(['m-high']);
    s = dispatch(ix, s, { type: 'endTurn', player: 0 });
    while (s.chapter === 1) {
      if (s.phase.type === 'follow') {
        const p = s.phase.next;
        s = run(ix, s, [
          { type: 'follow', player: p, card: s.players[p].hand[0], mode: 'copy' },
          { type: 'endTurn', player: p },
        ]);
      } else s = playRoundCopying(ix, s);
    }
    expect(s.players.map((p) => p.power)).toEqual([0, 5, 3]);
    // Chapter 2: the low marker flipped to 4/2 and now outranks the middle one (3/2).
    expect(s.ambitions.available).toEqual(['m-high', 'm-low', 'm-mid']);
  });
});

describe('actions', () => {
  it('influence then secure takes the card and captures rival agents', () => {
    let s = known([['suitA-2', 'suitA-3'], ['suitA-4', 'suitB-3'], ['suitB-6', 'suitC-2']]);
    // P0 already has 2 agents there against P1's 1: secure with a Relic in the prelude.
    s.court[0].agents = { 0: 2, 1: 1 };
    s.players[0].supply.agents = 8;
    const target = s.court[0].card;
    s.players[0].resources = ['relic'];
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-2' }); // tax/repair/influence
    s = dispatch(ix, s, { type: 'prelude', player: 0, resource: 'relic', action: { kind: 'secure', courtSlot: 0 } });
    expect(() => dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'secure', courtSlot: 0 } })).toThrow(/not allowed/);
    expect(s.players[0].court).toEqual(target.startsWith('faction') ? [target] : []);
    expect(s.players[0].captives).toEqual([1]);
    expect(s.players[0].supply.agents).toBe(10);
    expect(s.players[0].resources.filter(Boolean)).toEqual([]);
    expect(s.court).toHaveLength(4);
  });

  it('secure fails on a tie in agents', () => {
    let s = known([['suitB-2'], ['suitA-4'], ['suitB-6']]);
    s.court[0].agents = { 0: 1, 1: 1 };
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' });
    expect(() => dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'secure', courtSlot: 0 } })).toThrow(/strictly more/);
  });

  it('move respects links and closed links', () => {
    const base = known([['suitD-2'], ['suitA-4'], ['suitB-6']]);
    let s = dispatch(ix, base, { type: 'lead', player: 0, card: 'suitD-2' });
    s = dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 2 } });
    expect(s.map['c1-gate'].ships[0].fresh).toBe(3);
    expect(() => dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'move', from: 'c1-p1', to: 'c3-p1', ships: 1 } })).toThrow(/not connected/);
  });
});

describe('declaring with an any-ambition card', () => {
  const c = (() => { const x = structuredClone(ix.content); x.declareByNumber['7'] = 'any'; return x; })();
  const ix7 = index(c);
  function ready() {
    const s = game(ix7, 4, 7, 0);
    setHands(s, [['suitA-7', 'suitB-2'], ['suitA-4'], ['suitB-6'], ['suitC-2']]);
    return s;
  }

  it('declares the chosen ambition', () => {
    const s = dispatch(ix7, ready(), { type: 'lead', player: 0, card: 'suitA-7', declare: true, ambition: 'trophies' });
    expect(s.ambitions.declared.trophies).toEqual(['m-high']);
  });

  it('requires a choice', () => {
    expect(() => dispatch(ix7, ready(), { type: 'lead', player: 0, card: 'suitA-7', declare: true })).toThrow(/Choose/);
  });

  it('a fixed-number card cannot declare a different ambition', () => {
    const s = ready();
    setHands(s, [['suitB-2'], ['suitA-4'], ['suitB-6'], ['suitC-2']]);
    expect(() => dispatch(ix7, s, { type: 'lead', player: 0, card: 'suitB-2', declare: true, ambition: 'trophies' })).toThrow(/declares wealth/);
  });
});

describe('following rules from the rulebook', () => {
  it('a surpass only has to beat the lead card, not earlier surpasses', () => {
    const s = run(ix, known([['suitA-3', 'suitB-2'], ['suitA-6', 'suitB-3'], ['suitA-4', 'suitC-2']]), [
      { type: 'lead', player: 0, card: 'suitA-3' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitA-6', mode: 'surpass' },
      { type: 'endTurn', player: 1 },
      { type: 'follow', player: 2, card: 'suitA-4', mode: 'surpass' },
    ]);
    expect(s.phase).toMatchObject({ type: 'actions', budget: { player: 2, remaining: 3 } });
  });

  it('the highest surpass still takes the initiative', () => {
    const s = run(ix, known([['suitA-3', 'suitB-2'], ['suitA-6', 'suitB-3'], ['suitA-4', 'suitC-2']]), [
      { type: 'lead', player: 0, card: 'suitA-3' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitA-6', mode: 'surpass' },
      { type: 'endTurn', player: 1 },
      { type: 'follow', player: 2, card: 'suitA-4', mode: 'surpass' },
      { type: 'endTurn', player: 2 },
    ]);
    expect(s.initiative).toBe(1);
  });
});

describe('seizing by surpassing with a 7', () => {
  const ix4 = index();
  function four(hands: string[][]) {
    const s = game(ix4, 4, 7, 0);
    setHands(s, hands);
    return s;
  }

  it('a 7 surpass seizes the initiative and keeps its actions', () => {
    const s = run(ix4, four([['suitA-3', 'suitB-2'], ['suitA-7', 'suitB-3'], ['suitA-6'], ['suitC-2']]), [
      { type: 'lead', player: 0, card: 'suitA-3' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitA-7', mode: 'surpass' },
    ]);
    expect(s.round.seizedBy).toBe(1);
    expect(s.phase).toMatchObject({ budget: { player: 1, remaining: 1 } });
    const done = run(ix4, s, [
      { type: 'endTurn', player: 1 },
      { type: 'follow', player: 2, card: 'suitA-6', mode: 'surpass' },
      { type: 'endTurn', player: 2 },
      { type: 'follow', player: 3, card: 'suitC-2', mode: 'copy' },
      { type: 'endTurn', player: 3 },
    ]);
    expect(done.initiative).toBe(1);
  });

  it('a 7 surpass after someone seized does not seize again', () => {
    const s = run(ix4, four([['suitA-3', 'suitB-2'], ['suitB-3', 'suitB-4'], ['suitA-7'], ['suitC-2']]), [
      { type: 'lead', player: 0, card: 'suitA-3' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitB-3', mode: 'copy', seizeWith: 'suitB-4' },
      { type: 'endTurn', player: 1 },
      { type: 'follow', player: 2, card: 'suitA-7', mode: 'surpass' },
    ]);
    expect(s.round.seizedBy).toBe(1);
  });
});
