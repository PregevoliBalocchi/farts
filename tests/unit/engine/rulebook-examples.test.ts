// Worked examples from the owner's rulebook, replayed through the engine.
import { describe, expect, it } from 'vitest';
import { dispatch, scoreAmbitions } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { content, game, index, setHands } from './fixture';

describe('rulebook battle example', () => {
  // P0 (attacker, 4 fresh ships) battles P1 at a planet where P1 has 1 fresh ship,
  // 2 damaged ships and 1 damaged city. P0 rolls 2 assault and 2 raid dice:
  // assault = intercept+hit and blank; raid = building hit+key and self-hit+key.
  const c = content();
  // Make each die type always show the faces of the example, in roll order.
  c.dice.assault = [{ hit: 1, intercept: 1 }];
  c.dice.raid = [{ buildingHit: 1, key: 1, selfHit: 1 }];
  // Two assault dice would double the intercept+hit face, so roll 1 assault die
  // (the blank adds nothing) and 1 raid die carrying both raid faces' symbols.
  const ix = index(c);

  function setupBattle(): GameState {
    const s = game(ix, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitB-2'], ['suitA-4']]);
    const sys = s.map['c3-p2'];
    sys.ships = { 0: { fresh: 4, damaged: 0 }, 1: { fresh: 1, damaged: 2 } };
    sys.buildings = [{ owner: 1, type: 'city', damaged: true }];
    return dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' });
  }

  it('resolves self-hit, intercept, hit and building hit as in the example', () => {
    let s = dispatch(ix, setupBattle(), {
      type: 'action',
      player: 0,
      action: { kind: 'battle', system: 'c3-p2', target: 1, dice: { assault: 1, raid: 1 } },
    });
    // The attacker takes 2 hits: 1 self-hit plus 1 intercept (the defender has 1 fresh ship).
    expect(s.phase).toMatchObject({ type: 'allocate', battle: { interceptHits: 1, totals: { selfHit: 1, hit: 1, buildingHit: 1, key: 1 } } });
    s = dispatch(ix, s, {
      type: 'allocate',
      player: 0,
      // Damage two own ships instead of destroying one; damage the last fresh defender; the building hit destroys the damaged city.
      allocation: { selfHits: ['fresh', 'fresh'], hits: ['fresh'], buildingHits: [0] },
    });
    expect(s.map['c3-p2'].ships[0]).toEqual({ fresh: 2, damaged: 2 });
    expect(s.map['c3-p2'].ships[1]).toEqual({ fresh: 0, damaged: 3 });
    expect(s.map['c3-p2'].buildings).toEqual([]);
    expect(s.players[0].trophies.map((t) => t.owner)).toEqual([1]);
    expect(s.players[1].trophies.map((t) => t.owner)).toEqual([]);
  });
});

describe('rulebook scoring example', () => {
  it('Tycoon worth 7: a tie for first gives each 3 and no city bonus', () => {
    const c = content();
    const ix = index(c);
    const s = game(ix, 3, 5, 0);
    const guild = (r: string) => c.courtCards.find((x) => x.kind === 'faction' && x.resource === r)!.id;
    // Player A: 1 Fuel token + 1 Material Guild card, with the +2 bonus uncovered (4 cities built).
    s.players[0].resources = ['fuel'];
    s.players[0].court = [guild('material')];
    s.players[0].supply.cities = 1;
    // Player B: 2 Material tokens.
    s.players[1].resources = ['material', 'material'];
    s.players[2].resources = [];
    s.chapter = 1;
    s.ambitions.declared.wealth = ['m-high', 'm-low']; // 5/3 + 2/0 = 7 for first
    const { gains } = scoreAmbitions(c, s);
    expect(gains).toEqual([3, 3, 0]);
  });
});
