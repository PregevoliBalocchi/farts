import { describe, expect, it } from 'vitest';
import { dispatch, RuleError } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { content, game, index, run, setHands } from './fixture';

/** Content whose skirmish die always shows 1 hit and raid die always 1 building hit. */
function fixedDiceIndex(rivalEffect: 'none' | 'takeCaptive' = 'none') {
  const c = content();
  c.dice.skirmish = [{ hit: 1 }];
  c.dice.raid = [{ buildingHit: 1 }];
  c.dice.assault = [{ selfHit: 1 }];
  c.rivalTax = { allowed: true, effect: rivalEffect };
  return index(c);
}

/** 2 players (setup-2a: P0 home c1, P1 home c3); P0 leads an aggression card. */
function battleReady(ix: ReturnType<typeof index>): GameState {
  const s = game(ix, 2, 5, 0, 'setup-2a');
  setHands(s, [['suitB-2'], ['suitA-4']]);
  // P1 brings 2 fresh ships and a city into c1-p3, P0 has 3 fresh there.
  s.map['c1-p3'].ships = { 0: { fresh: 3, damaged: 0 }, 1: { fresh: 2, damaged: 0 } };
  s.map['c1-p3'].buildings = [{ owner: 1, type: 'city', damaged: false }];
  return dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' });
}

describe('battle allocation', () => {
  it('a battle waits for the attacker to allocate hits', () => {
    const ix = fixedDiceIndex();
    const s = dispatch(ix, battleReady(ix), { type: 'action', player: 0, action: { kind: 'battle', system: 'c1-p3', target: 1, dice: { skirmish: 2 } } });
    expect(s.phase.type).toBe('allocate');
    expect(() => dispatch(ix, s, { type: 'endTurn', player: 0 })).toThrow(RuleError);
  });

  it('the attacker may destroy a damaged ship and earns a trophy', () => {
    const ix = fixedDiceIndex();
    let s = battleReady(ix);
    s = run(ix, s, [
      { type: 'action', player: 0, action: { kind: 'battle', system: 'c1-p3', target: 1, dice: { skirmish: 2 } } },
      { type: 'allocate', player: 0, allocation: { hits: ['fresh', 'damaged'], selfHits: [], buildingHits: [] } },
    ]);
    expect(s.map['c1-p3'].ships[1]).toEqual({ fresh: 1, damaged: 0 });
    expect(s.players[0].trophies.map((t) => t.owner)).toEqual([1]);
    expect(s.phase).toMatchObject({ type: 'actions', budget: { player: 0, remaining: 3 } });
  });

  it('every hit must be allocated while targets remain', () => {
    const ix = fixedDiceIndex();
    const s = dispatch(ix, battleReady(ix), { type: 'action', player: 0, action: { kind: 'battle', system: 'c1-p3', target: 1, dice: { skirmish: 2 } } });
    expect(() => dispatch(ix, s, { type: 'allocate', player: 0, allocation: { hits: ['fresh'], selfHits: [], buildingHits: [] } })).toThrow(/every/);
  });

  it('building hits land even while the defender has ships', () => {
    const ix = fixedDiceIndex();
    const s = run(ix, battleReady(ix), [
      { type: 'action', player: 0, action: { kind: 'battle', system: 'c1-p3', target: 1, dice: { raid: 2 } } },
      { type: 'allocate', player: 0, allocation: { hits: [], selfHits: [], buildingHits: [0, 0] } },
    ]);
    expect(s.map['c1-p3'].buildings).toEqual([]);
    // The destroyed city waits in the attacker's Trophies box (base rulebook p. 7, 15), not in its owner's supply.
    expect(s.players[1].supply.cities).toBe(5 - 1);
    expect(s.players[0].trophies.map((t) => t.owner)).toEqual([1]);
  });

  it('self-hits are allocated by the attacker to its own ships without trophies', () => {
    const ix = fixedDiceIndex();
    const s = run(ix, battleReady(ix), [
      { type: 'action', player: 0, action: { kind: 'battle', system: 'c1-p3', target: 1, dice: { assault: 1 } } },
      { type: 'allocate', player: 0, allocation: { hits: [], selfHits: ['fresh'], buildingHits: [] } },
    ]);
    expect(s.map['c1-p3'].ships[0]).toEqual({ fresh: 2, damaged: 1 });
    expect(s.players[1].trophies.map((t) => t.owner)).toEqual([]);
  });
});

describe('tax and movement', () => {
  function taxReady(ix: ReturnType<typeof index>, p0Fresh: number): GameState {
    const s = game(ix, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitA-2'], ['suitA-4']]);
    s.map['c3-p1'].ships[0] = { fresh: p0Fresh, damaged: 0 }; // P1 has 3 fresh there (setup)
    return dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-2' });
  }

  it('taxing a rival city needs control of the system', () => {
    const ix = fixedDiceIndex();
    const s = taxReady(ix, 3);
    expect(() => dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'tax', system: 'c3-p1', cityOwner: 1 } })).toThrow(/control/);
  });

  it('taxing a controlled rival city gains its resource', () => {
    const ix = fixedDiceIndex();
    const s = dispatch(ix, taxReady(ix, 4), { type: 'action', player: 0, action: { kind: 'tax', system: 'c3-p1', cityOwner: 1 } });
    expect(s.players[0].resources).toHaveLength(1);
    expect(s.players[0].captives).toEqual([]);
  });

  it('the takeCaptive rival-tax effect captures an agent', () => {
    const ix = fixedDiceIndex('takeCaptive');
    const s = dispatch(ix, taxReady(ix, 4), { type: 'action', player: 0, action: { kind: 'tax', system: 'c3-p1', cityOwner: 1 } });
    expect(s.players[0].captives).toEqual([1]);
    expect(s.players[1].supply.agents).toBe(9);
  });

  it('damaged ships can move with fresh ones', () => {
    const ix = fixedDiceIndex();
    const s = game(ix, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitD-2'], ['suitA-4']]);
    s.map['c1-p1'].ships[0] = { fresh: 1, damaged: 2 };
    const after = run(ix, s, [
      { type: 'lead', player: 0, card: 'suitD-2' },
      { type: 'action', player: 0, action: { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 0, damaged: 2 } },
    ]);
    expect(after.map['c1-p1'].ships[0]).toEqual({ fresh: 1, damaged: 0 });
    expect(after.map['c1-gate'].ships[0]).toEqual({ fresh: 1, damaged: 2 });
  });
});

describe('building slots', () => {
  it('building on a full planet is rejected', () => {
    const c = content();
    c.map.systems.find((x) => x.id === 'c1-p3')!.slots = 1;
    const ix = index(c);
    const s = game(ix, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitC-2'], ['suitA-4']]);
    s.map['c1-p3'].ships[0] = { fresh: 1, damaged: 0 };
    let after = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitC-2' });
    after = dispatch(ix, after, { type: 'action', player: 0, action: { kind: 'build', system: 'c1-p3', what: 'city' } });
    expect(() => dispatch(ix, after, { type: 'action', player: 0, action: { kind: 'build', system: 'c1-p3', what: 'starport' } })).toThrow(/slot/);
  });
});
