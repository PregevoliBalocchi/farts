// Rules confirmed by the owner on 2026-11-20 (design/gdd/core-loop.md §3.4–3.6).
import { describe, expect, it } from 'vitest';
import { dispatch, gameWinners, indexContent } from '../../../src/game/engine';
import type { EffectRegistry, GameState } from '../../../src/game/engine';
import { content, game, index, setHands } from './fixture';

describe('battle dice limit', () => {
  function ready(): [ReturnType<typeof index>, GameState] {
    const c = content();
    c.dice.skirmish = [{}];
    const ix = index(c);
    const s = game(ix, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitB-2'], ['suitA-4']]);
    s.map['c1-p3'].ships = { 0: { fresh: 1, damaged: 2 }, 1: { fresh: 1, damaged: 0 } };
    return [ix, dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' })];
  }

  it('damaged ships count toward the dice limit', () => {
    const [ix, s] = ready();
    const after = dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'battle', system: 'c1-p3', target: 1, dice: { skirmish: 3 } } });
    expect(after.phase.type).toBe('allocate');
  });

  it('rolling more dice than own ships is rejected', () => {
    const [ix, s] = ready();
    expect(() => dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'battle', system: 'c1-p3', target: 1, dice: { skirmish: 4 } } })).toThrow(/one die per own ship/);
  });
});

describe('game end tie-break', () => {
  function tied(initiative: number): GameState {
    const s = game(index(), 4, 1, 0);
    s.players.forEach((p, i) => (p.power = [10, 20, 5, 20][i]));
    s.initiative = initiative;
    return s;
  }

  it('turn order from the initiative holder picks the first tied player', () => {
    expect(gameWinners('turnOrder', tied(0))).toEqual([1]);
    expect(gameWinners('turnOrder', tied(2))).toEqual([3]);
  });

  it('shared tie-break returns every tied player', () => {
    expect(gameWinners('shared', tied(0))).toEqual([1, 3]);
  });
});

describe('decree effect registry', () => {
  function secureDecree(effects: EffectRegistry): GameState {
    const ix = indexContent(content(), effects);
    const s = game(ix, 3, 7, 0);
    setHands(s, [['suitB-2'], ['suitA-4'], ['suitB-6']]);
    s.court[0] = { card: 'decree-1', agents: { 0: 1 } };
    return dispatch(ix, dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' }), {
      type: 'action',
      player: 0,
      action: { kind: 'secure', courtSlot: 0 },
    });
  }

  it('a registered effect runs when the decree is secured', () => {
    const s = secureDecree({ 'decree-1': { whenSecured: { run: ({ state, player }) => ((state.players[player].power += 2), 'gain 2 power') } } });
    expect(s.players[0].power).toBe(2);
    expect(s.courtDiscard).toContain('decree-1');
    expect(s.players[0].court).not.toContain('decree-1');
  });

  it('a missing effect is logged for manual resolution', () => {
    const s = secureDecree({});
    expect(s.log.at(-1)!.text).toMatch(/resolve manually/);
  });
});
