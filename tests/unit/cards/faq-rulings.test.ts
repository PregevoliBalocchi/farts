// Rulings from the community FAQ of the public card reference (checked 2026-11-23,
// design/gdd/card-effects.md "Rulings checked against the card reference FAQ"):
// one test per ruling the other card tests did not already pin down.
import { describe, expect, it } from 'vitest';
import { currentBudget, dispatch, heldResources } from '../../../src/game/engine';
import type { ActionPayload, GameState } from '../../../src/game/engine';
import { cardsIndex, runAll, start } from './fixture';

const ix = cardsIndex((c) => {
  c.map.systems.find((x) => x.id === 'c1-p1')!.slots = 1;
});

/** P0 leads `card`; extra setup before the lead. */
function lead(card: string, setup: (s: GameState) => void = () => {}): GameState {
  const s = start(ix, [[card, 'suitA-3'], ['suitA-5', 'suitA-6']]);
  setup(s);
  return dispatch(ix, s, { type: 'lead', player: 0, card });
}

const act = (s: GameState, action: ActionPayload, player = 0) => dispatch(ix, s, { type: 'action', player, action });
const city = (owner: number, damaged = false) => ({ owner, type: 'city' as const, damaged });

describe('leaders', () => {
  it('a Copy tax bonus is gained even when the taxed resource ran out', () => {
    // Arrange: P1 copies to tax a relic city while the relic supply is empty.
    let s = start(ix, [['suitA-2'], ['suitA-5']]);
    s.players[1].leader = 'leader-02';
    s.map['c1-p2'].buildings = [city(1)];
    s.resourceSupply.relic = 0;
    // Act
    s = runAll(ix, s, [
      { type: 'lead', player: 0, card: 'suitA-2' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitA-5', mode: 'copy' },
      { type: 'action', player: 1, action: { kind: 'tax', system: 'c1-p2' } },
    ]);
    // Assert: no relic, but the leader's psionic all the same.
    expect(heldResources(s.players[1])).toEqual(['psionic']);
  });

  it('a leader that cannot tax its own cities may tax a Rival city taxed like it is Loyal', () => {
    // Arrange: no ships there, Empath declared, the lore card that taxes any city like Loyal.
    const s = lead('suitA-2', (s) => {
      s.players[0].leader = 'leader-13';
      s.players[0].lore = ['l:lore-20'];
      s.ambitions.declared.psionics = ['m'];
      s.map['c1-p2'].buildings = [city(1)];
      s.map['c1-p3'].buildings = [city(0)];
      s.map['c1-p3'].ships = { 0: { fresh: 1, damaged: 0 } };
    });
    // Act and assert: the Rival city treated as Loyal is fine, a really Loyal city is not.
    expect(heldResources(act(s, { kind: 'tax', system: 'c1-p2', cityOwner: 1 }).players[0])).toEqual(['relic']);
    expect(() => act(s, { kind: 'tax', system: 'c1-p3' })).toThrow(/cannot tax your own/);
  });

  it('hitting a building to repeat an action spends no extra action', () => {
    // Arrange
    const s = lead('suitA-2', (s) => {
      s.players[0].leader = 'leader-10';
      s.map['c1-p2'].buildings = [city(0), city(0)];
    });
    const before = currentBudget(s)!.remaining;
    // Act
    const t = act(s, { kind: 'tax', system: 'c1-p2', city: 0, again: {} });
    // Assert: two taxes for one pip.
    expect(heldResources(t.players[0])).toEqual(['relic', 'relic']);
    expect(currentBudget(t)!.remaining).toBe(before - 1);
  });

  describe('the extra action of a Copy or Pivot', () => {
    const ixd = cardsIndex((c) => {
      c.dice.skirmish = [{ hit: 1 }];
      c.maxDicePerType = 6;
    });

    /** P0 leads Aggression, P1 (leader-06, with `lore`) copies it; P0 has 1 ship in c1-p1. */
    function copying(lore: string[], ships: Record<string, number>): GameState {
      let s = start(ixd, [['suitB-2'], ['suitB-4']]);
      s.players[1].leader = 'leader-06';
      s.players[1].lore = lore;
      for (const [id, n] of Object.entries(ships)) s.map[id].ships = { 1: { fresh: n, damaged: 0 } };
      s.map['c1-p1'].ships = { 0: { fresh: 1, damaged: 0 } };
      return runAll(ixd, s, [
        { type: 'lead', player: 0, card: 'suitB-2' },
        { type: 'endTurn', player: 0 },
        { type: 'follow', player: 1, card: 'suitB-4', mode: 'copy' },
      ]);
    }

    it('cannot be a new action from a lore card', () => {
      const s = copying(['l:lore-16'], { 'c1-gate': 2 });
      const tactical = { when: 'before' as const, move: { kind: 'card', card: 'l:lore-16', name: 'x', args: {} } as unknown as ActionPayload & { kind: 'move' } };
      expect(() => dispatch(ixd, s, { type: 'action', player: 1, action: { kind: 'battle', system: 'c1-p1', target: 0, dice: { skirmish: 2 }, tactical } })).toThrow(/extra action is a move/);
    });

    it('is still changed by a move modifier such as the extra step of a lore card', () => {
      // Arrange: P1's ships start two steps away; only the lore card's extra step brings them to the battle.
      const s = copying(['l:lore-03'], { 'c1-p3': 2 });
      // Act
      const t = dispatch(ixd, s, {
        type: 'action',
        player: 1,
        action: {
          kind: 'battle',
          system: 'c1-p1',
          target: 0,
          dice: { skirmish: 2 },
          tactical: { when: 'before', move: { kind: 'move', from: 'c1-p3', to: 'c1-gate', ships: 2, then: [{ from: 'c1-gate', to: 'c1-p1', ships: 2 }] } },
        },
      });
      // Assert
      expect(t.phase).toMatchObject({ type: 'allocate', battle: { system: 'c1-p1', totals: { hit: 2 } } });
    });
  });
});

describe('lore', () => {
  it('ships taking the extra step may go to different systems', () => {
    // Arrange
    const s = lead('suitB-2', (s) => {
      s.players[0].lore = ['l:lore-03'];
      s.map['c1-p1'].ships = { 0: { fresh: 2, damaged: 0 } };
    });
    // Act
    const t = act(s, { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 2, then: [{ from: 'c1-gate', to: 'c1-p2', ships: 1 }, { from: 'c1-gate', to: 'c1-p3', ships: 1 }] });
    // Assert
    expect([t.map['c1-p2'].ships[0]?.fresh, t.map['c1-p3'].ships[0]?.fresh]).toEqual([1, 1]);
  });

  it('the extra step does not trigger itself', () => {
    const s = lead('suitB-2', (s) => {
      s.players[0].lore = ['l:lore-03'];
      s.map['c1-p1'].ships = { 0: { fresh: 1, damaged: 0 } };
    });
    // A ship that arrived with the extra step cannot take another one.
    expect(() => act(s, { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 1, then: [{ from: 'c1-gate', to: 'c1-p3', ships: 1 }, { from: 'c1-p3', to: 'c1-gate', ships: 1 }] })).toThrow(/Only fresh ships that just arrived/);
  });

  it('Prune cannot remove a building it cannot replace', () => {
    // Arrange: a Loyal starport, no city left in supply.
    const s = lead('suitC-2', (s) => {
      s.players[0].lore = ['l:lore-10'];
      s.players[0].supply.cities = 0;
      s.map['c1-p1'].buildings = [{ owner: 0, type: 'starport', damaged: false }];
    });
    // Act and assert: refused, and the starport stays.
    expect(() => act(s, { kind: 'card', card: 'l:lore-10', name: 'prune', args: { system: 'c1-p1', index: 0 } })).toThrow(/No city in supply/);
    expect(s.map['c1-p1'].buildings).toEqual([{ owner: 0, type: 'starport', damaged: false }]);
  });

  it('a second ambition can be declared with no Material or Fuel to discard', () => {
    // Arrange: Tycoon declared with the lead, nothing to discard.
    let s = start(ix, [['suitC-2'], ['suitC-4']]);
    s.players[0].lore = ['l:lore-27'];
    s.players[0].resources = ['relic'];
    // Act
    s = runAll(ix, s, [
      { type: 'lead', player: 0, card: 'suitC-2', declare: true },
      { type: 'ability', player: 0, card: 'l:lore-27', ability: 'declare', args: { ambition: 'captives' } },
    ]);
    // Assert
    expect(s.ambitions.declared.captives.length).toBe(1);
    expect(heldResources(s.players[0])).toEqual(['relic']);
  });

  it('only the owner of the gate card captures agents entering its guarded gate', () => {
    // Arrange: P1 has the fresh starport in the gate, P0 holds the card.
    const s = lead('suitB-2', (s) => {
      s.players[0].lore = ['l:lore-08'];
      s.map['c1-gate'].ships = { 1: { fresh: 2, damaged: 0 } };
      s.map['c1-gate'].buildings = [{ owner: 1, type: 'starport', damaged: false }];
      s.map['c1-p1'].ships = { 0: { fresh: 1, damaged: 0 } };
    });
    // Act
    const t = act(s, { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 1 });
    // Assert: nobody captures (the starport's owner lacks the card; the card's owner is the mover).
    expect([t.players[0].captives, t.players[1].captives]).toEqual([[], []]);
  });
});
