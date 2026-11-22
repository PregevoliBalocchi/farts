// Battle resolution order, intercept and hit overflow (design/gdd/core-loop.md §3.5).
import { describe, expect, it } from 'vitest';
import { dispatch } from '../../../src/game/engine';
import type { DieFace, GameState } from '../../../src/game/engine';
import { content, game, index, setHands } from './fixture';

/** Index whose skirmish die always shows `face`. */
function fixed(face: DieFace) {
  const c = content();
  c.dice.skirmish = [face];
  c.maxDicePerType = 6;
  return index(c);
}

/** P0 attacks P1 at c1-p3 with the given ships; P0 has 4 fresh ships there. */
function ready(ix: ReturnType<typeof index>, defender: { fresh: number; damaged: number }, buildings = 0): GameState {
  const s = game(ix, 2, 5, 0, 'setup-2a');
  setHands(s, [['suitB-2'], ['suitA-4']]);
  s.map['c1-p3'].ships = { 0: { fresh: 4, damaged: 0 }, 1: { ...defender } };
  s.map['c1-p3'].buildings = Array.from({ length: buildings }, () => ({ owner: 1, type: 'city' as const, damaged: false }));
  return dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' });
}

function roll(ix: ReturnType<typeof index>, s: GameState, n: number) {
  return dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'battle', system: 'c1-p3', target: 1, dice: { skirmish: n } } });
}

describe('intercept', () => {
  it('deals one hit per fresh defending ship', () => {
    const ix = fixed({ intercept: 1 });
    const s = roll(ix, ready(ix, { fresh: 2, damaged: 1 }), 1);
    expect(s.phase).toMatchObject({ type: 'allocate', battle: { interceptHits: 2 } });
  });

  it('does not multiply when several intercepts are rolled', () => {
    const ix = fixed({ intercept: 1 });
    const s = roll(ix, ready(ix, { fresh: 2, damaged: 0 }), 3);
    expect(s.phase).toMatchObject({ battle: { interceptHits: 2 } });
  });

  it('deals nothing when the defender has only damaged ships', () => {
    const ix = fixed({ intercept: 1, hit: 1 });
    const s = roll(ix, ready(ix, { fresh: 0, damaged: 2 }), 1);
    expect(s.phase).toMatchObject({ battle: { interceptHits: 0 } });
  });

  it('counts defenders before the attacker hits them', () => {
    const ix = fixed({ intercept: 1, hit: 1 });
    let s = roll(ix, ready(ix, { fresh: 2, damaged: 0 }), 2);
    s = dispatch(ix, s, { type: 'allocate', player: 0, allocation: { selfHits: ['fresh', 'fresh'], hits: ['fresh', 'fresh'], buildingHits: [] } });
    expect(s.map['c1-p3'].ships[0]).toEqual({ fresh: 2, damaged: 2 });
    expect(s.map['c1-p3'].ships[1]).toEqual({ fresh: 0, damaged: 2 });
  });

  it('the attacker may concentrate intercept hits to destroy one ship', () => {
    const ix = fixed({ intercept: 1 });
    let s = roll(ix, ready(ix, { fresh: 2, damaged: 0 }), 1);
    s = dispatch(ix, s, { type: 'allocate', player: 0, allocation: { selfHits: ['fresh', 'damaged'], hits: [], buildingHits: [] } });
    expect(s.map['c1-p3'].ships[0]).toEqual({ fresh: 3, damaged: 0 });
    expect(s.players[0].supply.ships).toBe(15 - 6 + 1);
    // Attacker ships destroyed by intercept or self-hits are the defender's trophies.
    expect(s.players[1].trophies.map((t) => t.owner)).toEqual([0]);
  });
});

describe('hits overflow to buildings', () => {
  it('hits land on buildings once no defender ships remain', () => {
    const ix = fixed({ hit: 1 });
    let s = roll(ix, ready(ix, { fresh: 0, damaged: 1 }, 1), 3);
    s = dispatch(ix, s, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: ['damaged', { building: 0 }, { building: 0 }], buildingHits: [] } });
    expect(s.map['c1-p3'].buildings).toEqual([]);
    expect(s.players[0].trophies.map((t) => t.owner)).toEqual([1, 1]);
  });

  it('a hit cannot go to a building while defender ships remain', () => {
    const ix = fixed({ hit: 1 });
    const s = roll(ix, ready(ix, { fresh: 1, damaged: 0 }, 1), 1);
    expect(() => dispatch(ix, s, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: [{ building: 0 }], buildingHits: [] } })).toThrow(/ships while/);
  });
});

describe('dice limits', () => {
  it('rejects more dice of one type than the cap', () => {
    const c = content();
    c.maxDicePerType = 2;
    const ix = index(c);
    const s = ready(ix, { fresh: 1, damaged: 0 });
    expect(() => roll(ix, s, 3)).toThrow(/At most 2 dice/);
  });
});
