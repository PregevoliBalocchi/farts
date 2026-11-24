// Raid: keys spent after hits (design/gdd/core-loop.md §3.5, step 4).
import { describe, expect, it } from 'vitest';
import { dispatch, heldResources } from '../../../src/game/engine';
import type { DieFace, GameState, RaidTake } from '../../../src/game/engine';
import { content, game, index, setHands } from './fixture';

/** Index whose raid die always shows `face`; slot keys 1,1,2,2,3,3; faction-1 costs 2 keys. */
function fixed(face: DieFace) {
  const c = content();
  c.dice.raid = [face];
  c.playerBoard.slotKeys = [1, 1, 2, 2, 3, 3];
  c.courtCards.find((x) => x.id === 'faction-1')!.keys = 2;
  return index(c);
}

/** P0 (2 fresh ships) raids P1's city at c1-p3; P1 holds 4 resources and faction-1. */
function ready(ix: ReturnType<typeof index>, attackerShips = 2): GameState {
  const s = game(ix, 2, 5, 0, 'setup-2a');
  setHands(s, [['suitB-2'], ['suitA-4']]);
  s.map['c1-p3'].ships = { 0: { fresh: attackerShips, damaged: 0 } };
  s.map['c1-p3'].buildings = [{ owner: 1, type: 'city', damaged: false }];
  s.players[1].resources = ['fuel', 'material', 'relic', 'weapons'];
  s.players[1].court = ['faction-1'];
  return dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' });
}

function raidWith(ix: ReturnType<typeof index>, s: GameState, dice: number, raid: RaidTake[], selfHits: ('fresh' | 'damaged')[] = []) {
  s = dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'battle', system: 'c1-p3', target: 1, dice: { raid: dice } } });
  return dispatch(ix, s, { type: 'allocate', player: 0, allocation: { selfHits, hits: [], buildingHits: [], raid } });
}

describe('raid', () => {
  it('steals resources paying the slot cost', () => {
    const ix = fixed({ key: 2 });
    const s = raidWith(ix, ready(ix), 1, [{ resource: 0 }, { resource: 1 }]);
    expect(heldResources(s.players[0])).toEqual(['fuel', 'material']);
    expect(heldResources(s.players[1])).toEqual(['relic', 'weapons']);
  });

  it('steals a Guild card paying its printed keys', () => {
    const ix = fixed({ key: 2 });
    const s = raidWith(ix, ready(ix), 1, [{ card: 'faction-1' }]);
    expect(s.players[0].court).toEqual(['faction-1']);
    expect(s.players[1].court).toEqual([]);
  });

  it('adds a printed key cost written as text, as data/content.json has it, as a number', () => {
    const ix = fixed({ key: 2 });
    (ix.courtCards.get('faction-1') as { keys?: unknown }).keys = '2';
    const s = raidWith(ix, ready(ix), 2, [{ resource: 0 }, { card: 'faction-1' }]);
    expect(s.players[0].court).toEqual(['faction-1']);
    expect(heldResources(s.players[0])).toEqual(['fuel']);
  });

  it('rejects a raid costing more keys than rolled', () => {
    const ix = fixed({ key: 2 });
    const s = ready(ix);
    expect(() => raidWith(ix, s, 1, [{ resource: 2 }, { resource: 0 }])).toThrow(/costs 3 keys, only 2/);
  });

  it('loses the keys when no attacker ship survives', () => {
    const ix = fixed({ key: 2, selfHit: 1 });
    const s = ready(ix, 1);
    expect(() => raidWith(ix, s, 1, [{ resource: 0 }], ['fresh'])).not.toThrow();
    const c = content();
    c.dice.raid = [{ key: 2, selfHit: 2 }];
    const ix2 = index(c);
    expect(() => raidWith(ix2, ready(ix2, 1), 1, [{ resource: 0 }], ['fresh', 'damaged'])).toThrow(/keys are lost/);
  });

  it('raid dice need defender buildings in the system when it has buildings elsewhere', () => {
    const ix = fixed({ key: 1 });
    const s = ready(ix);
    s.map['c1-p3'].buildings = [];
    s.map['c1-p3'].ships[1] = { fresh: 1, damaged: 0 };
    // P1 still has its setup buildings in cluster 3.
    expect(() => dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'battle', system: 'c1-p3', target: 1, dice: { raid: 1 } } })).toThrow(/Raid dice need/);
  });
});
