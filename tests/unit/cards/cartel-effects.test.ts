// Cards keeping a resource supply (design/gdd/card-effects.md, court-03 / court-06 rulings).
import { describe, expect, it } from 'vitest';
import { cartelMetric, dispatch, heldResources, markerValues } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { cardsIndex, runAll, start } from './fixture';

const ix = cardsIndex((c) => {
  c.courtCards.push({ id: 'g:court-06', kind: 'faction', resource: 'fuel', keys: 2, effect: 'court-06', set: 'test' });
});

describe('a card keeping the supply', () => {
  it('counts the kept supply toward the matching ambition', () => {
    const s = start(ix);
    s.players[0].court = ['g:court-03'];
    s.resourceSupply.material = 4;
    // The 4 kept tokens (the Guild card itself is counted by the base ambition metric).
    expect(cartelMetric(ix, s, 0, 'wealth')).toBe(4);
    expect(cartelMetric(ix, s, 0, 'relics')).toBe(0);
    expect(cartelMetric(ix, s, 1, 'wealth')).toBe(0);
  });

  it('decides Tycoon at scoring', () => {
    let s = start(ix, [['suitC-2'], ['suitC-4']]);
    s.players[0].court = ['g:court-03'];
    s.players[1].resources = ['fuel', 'fuel', 'fuel'];
    s.resourceSupply.material = 3;
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitC-2', declare: true });
    const marker = s.ambitions.declared.wealth[0];
    s = runAll(ix, s, [
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitC-4', mode: 'copy' },
      { type: 'endTurn', player: 1 },
    ]);
    // P0: 3 kept + 1 Guild card = 4 against P1's 3 Fuel.
    expect(s.players[0].power).toBe(markerValues(ix.content, marker, 1).first);
  });

  it('gaining that resource takes it from the card; the kept tokens cannot be stolen or spent', () => {
    let s = start(ix);
    s.players[0].court = ['g:court-03', 'g:court-02'];
    s.players[1].court = ['g:court-20'];
    s.resourceSupply.material = 2;
    s = runAll(ix, s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'action', player: 0, action: { kind: 'card', card: 'g:court-02', name: 'gain' } },
    ]);
    expect(heldResources(s.players[0])).toEqual(['material']);
    expect(cartelMetric(ix, s, 0, 'wealth')).toBe(1);
    // Kept tokens are not on the board: they cannot be spent in a prelude or stolen.
    let t = start(ix);
    t.players[0].court = ['g:court-03'];
    t.players[1].court = ['g:court-20'];
    t.resourceSupply.material = 2;
    t = dispatch(ix, t, { type: 'lead', player: 0, card: 'suitC-2' });
    expect(() => dispatch(ix, t, { type: 'prelude', player: 0, resource: 'material', action: { kind: 'build', system: 'c1-p1', what: 'ship' } })).toThrow(/No material to spend/);
  });

  it('the kept supply follows the card when it changes hands', () => {
    let s = start(ix, [['suitC-2'], ['suitC-4']]);
    s.players[0].court = ['g:court-20'];
    s.players[1].court = ['g:court-06'];
    s.resourceSupply.fuel = 5;
    s = runAll(ix, s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'ability', player: 0, card: 'g:court-20', ability: 'steal', args: { from: 1, card: 'g:court-06' } },
    ]);
    expect(cartelMetric(ix, s, 0, 'wealth')).toBe(5);
    expect(cartelMetric(ix, s, 1, 'wealth')).toBe(0);
  });

  it('counts as having that type for a lore guard', () => {
    let s: GameState = start(ix);
    s.players[0].court = ['g:court-20'];
    s.players[1].lore = ['l:lore-22'];
    s.players[1].court = ['g:court-03', 'g:court-02'];
    s.resourceSupply.material = 1;
    s.ambitions.declared.relics = ['m'];
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitC-2' });
    expect(() => dispatch(ix, s, { type: 'ability', player: 0, card: 'g:court-20', ability: 'steal', args: { from: 1, card: 'g:court-02' } })).toThrow(/holds material/);
  });

  it('a leader may use a kept token to change a planet type', () => {
    let s = start(ix, [['suitA-2'], ['suitA-4']]);
    s.players[0].leader = 'leader-14';
    s.players[0].court = ['g:court-06'];
    s.resourceSupply.fuel = 2;
    s.map['c1-p2'].buildings = [{ owner: 0, type: 'city', damaged: false }];
    s = runAll(ix, s, [
      { type: 'lead', player: 0, card: 'suitA-2' },
      { type: 'action', player: 0, action: { kind: 'tax', system: 'c1-p2', shape: { cartel: 'fuel' } } },
    ]);
    expect(s.planetTypes).toEqual({ 'c1-p2': 'fuel' });
    expect(s.resourceSupply.fuel).toBe(1);
  });
});
