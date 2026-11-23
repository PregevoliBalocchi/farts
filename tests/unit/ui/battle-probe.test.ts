// The table offers Battle only where a battle is legal. A leader with mandatory
// extra dice (leader-05) needs more than one die, so a one-die check hid every battle.
import { describe, expect, it } from 'vitest';
import { dispatch } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { actionCommand, battleProbe } from '../../../src/ui/table/intent';
import { legal } from '../../../src/ui/table/view';
import { cardsIndex, start } from '../cards/fixture';

const ix = cardsIndex();

/** P0 (with `leader`) leads Aggression and faces one P1 ship with one ship of its own in c1-p1. */
function facing(leader: string): GameState {
  const s = start(ix, [['suitB-2', 'suitA-3'], ['suitA-5', 'suitA-6']]);
  s.players[0].leader = leader;
  s.map['c1-p1'].ships = { 0: { fresh: 1, damaged: 0 }, 1: { fresh: 1, damaged: 0 } };
  return dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' });
}

const probe = (s: GameState) =>
  battleProbe((dice) => legal(ix, s, actionCommand(0, { kind: 'battle', system: 'c1-p1', target: 1, dice })));

describe('battleProbe', () => {
  it('finds a legal battle for a leader that must roll two extra dice', () => {
    // Arrange
    const s = facing('leader-05');
    // Act
    const pool = probe(s);
    // Assert: the old one-die check fails; one ship plus the two mandatory dice works.
    expect(legal(ix, s, actionCommand(0, { kind: 'battle', system: 'c1-p1', target: 1, dice: { skirmish: 1 } }))).toBe(false);
    expect(pool).toEqual({ skirmish: 2 });
  });

  it('keeps the one-die check for an ordinary leader', () => {
    expect(probe(facing('leader-01'))).toEqual({ skirmish: 1 });
  });

  it('gives null when no pool makes the battle legal', () => {
    expect(battleProbe(() => false)).toBeNull();
  });
});
