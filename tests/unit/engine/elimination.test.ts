// Elimination rescue (rulebook "Fine Print").
import { describe, expect, it } from 'vitest';
import { dispatch } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { game, index, setHands } from './fixture';

const ix = index();

/** P0 leads and has nothing left on the map but cities. */
function wiped(): GameState {
  const s = game(ix, 2, 5, 0, 'setup-2a');
  setHands(s, [['suitA-2'], ['suitA-4']]);
  for (const sys of Object.values(s.map)) {
    delete sys.ships[0];
    sys.buildings = sys.buildings.filter((b) => b.owner !== 0 || b.type === 'city');
  }
  return dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-2' });
}

describe('elimination', () => {
  it('a player with no ships and no starports must choose a gate at end of turn', () => {
    expect(() => dispatch(ix, wiped(), { type: 'endTurn', player: 0 })).toThrow(/choose a gate/);
  });

  it('places 3 fresh ships in the chosen gate', () => {
    const s = dispatch(ix, wiped(), { type: 'endTurn', player: 0, rescueGate: 'c2-gate' });
    expect(s.map['c2-gate'].ships[0]).toEqual({ fresh: 3, damaged: 0 });
  });

  it('places only the ships left in supply when fewer than 3', () => {
    const s0 = wiped();
    s0.players[0].supply.ships = 2;
    const s = dispatch(ix, s0, { type: 'endTurn', player: 0, rescueGate: 'c2-gate' });
    expect(s.map['c2-gate'].ships[0]).toEqual({ fresh: 2, damaged: 0 });
  });

  it('the gate must be an in-play gate', () => {
    expect(() => dispatch(ix, wiped(), { type: 'endTurn', player: 0, rescueGate: 'c2-p1' })).toThrow(/in-play gate/);
  });

  it('a player with ships or a starport places nothing', () => {
    const s = game(ix, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitA-2'], ['suitA-4']]);
    const led = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-2' });
    expect(() => dispatch(ix, led, { type: 'endTurn', player: 0, rescueGate: 'c2-gate' })).toThrow(/Only a player/);
    expect(() => dispatch(ix, led, { type: 'endTurn', player: 0 })).not.toThrow();
  });
});
