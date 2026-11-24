// Resources and Guild cards per the rulebook (design/gdd/core-loop.md §3.7).
import { describe, expect, it } from 'vitest';
import { ambitionMetric, dispatch, heldResources } from '../../../src/game/engine';
import { content, game, index, setHands } from './fixture';

const c = content();
const ix = index(c);

describe('prelude timing', () => {
  it('resources can be spent before the first pip, not after', () => {
    let s = game(ix, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitD-2'], ['suitA-4']]);
    s.players[0].resources = ['fuel', 'fuel'];
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitD-2' });
    const move = { kind: 'move' as const, from: 'c1-p1', to: 'c1-gate', ships: 1 };
    s = dispatch(ix, s, { type: 'prelude', player: 0, resource: 'fuel', action: move });
    s = dispatch(ix, s, { type: 'action', player: 0, action: move });
    expect(() => dispatch(ix, s, { type: 'prelude', player: 0, resource: 'fuel', action: move })).toThrow(/prelude is over/);
  });
});

describe('Guild cards add to ambitions', () => {
  const guild = (r: string) => c.courtCards.find((x) => x.kind === 'faction' && x.resource === r)!.id;

  it('Material and Fuel cards add to Tycoon, Relic to Keeper, Psionic to Empath', () => {
    const p = game(ix, 2, 5, 0, 'setup-2a').players[0];
    p.resources = ['fuel'];
    p.court = [guild('material'), guild('fuel'), guild('relic'), guild('psionic'), guild('weapons')];
    expect(ambitionMetric(c, p, 'wealth')).toBe(3);
    expect(ambitionMetric(c, p, 'relics')).toBe(1);
    expect(ambitionMetric(c, p, 'psionics')).toBe(1);
  });

  it('Weapon cards add to no ambition', () => {
    const p = game(ix, 2, 5, 0, 'setup-2a').players[0];
    p.resources = [];
    p.court = [guild('weapons')];
    for (const a of ['wealth', 'captives', 'trophies', 'relics', 'psionics'] as const) expect(ambitionMetric(c, p, a)).toBe(0);
  });
});

describe('holding limits', () => {
  it('a stolen token the attacker cannot hold waits aside, then goes back to the supply at their next move unless they make room', () => {
    const cc = content();
    cc.dice.raid = [{ key: 1 }];
    cc.playerBoard.slotKeys = [1, 1, 1, 1, 1, 1];
    const ix2 = index(cc);
    let s = game(ix2, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitB-2'], ['suitA-4']]);
    s.map['c3-p2'].ships = { 0: { fresh: 1, damaged: 0 } };
    s.players[1].resources = ['relic'];
    s.players[0].resources = ['fuel', 'fuel', 'fuel']; // 3 open slots, all full
    const before = s.resourceSupply.relic;
    s = dispatch(ix2, s, { type: 'lead', player: 0, card: 'suitB-2' });
    s = dispatch(ix2, s, { type: 'action', player: 0, action: { kind: 'battle', system: 'c3-p2', target: 1, dice: { raid: 1 } } });
    s = dispatch(ix2, s, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: [], buildingHits: [], raid: [{ resource: 0 }] } });
    expect(heldResources(s.players[1])).toEqual([]);
    expect(heldResources(s.players[0])).toEqual(['fuel', 'fuel', 'fuel']);
    expect(s.players[0].overflow).toEqual(['relic']);
    expect(s.resourceSupply.relic).toBe(before);
    // Keeping it: the relic takes a fuel's slot, and the fuel is what the next move discards.
    const fuelBefore = s.resourceSupply.fuel;
    const kept = dispatch(ix2, s, { type: 'arrange', player: 0, slots: ['relic', 'fuel', 'fuel'] });
    expect(heldResources(kept.players[0])).toEqual(['relic', 'fuel', 'fuel']);
    expect(dispatch(ix2, kept, { type: 'endTurn', player: 0 }).resourceSupply.fuel).toBe(fuelBefore + 1);
    // Not rearranging: the next move discards the relic.
    const left = dispatch(ix2, s, { type: 'endTurn', player: 0 });
    expect(left.resourceSupply.relic).toBe(before + 1);
    expect(left.players[0].overflow).toBeUndefined();
  });
});

describe('end of the prelude', () => {
  it('a spent resource cannot be regained in the same prelude, but returns before the first pip', () => {
    const cc = content();
    const ix2 = index(cc);
    let s = game(ix2, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitA-2'], ['suitA-4']]);
    const r = cc.map.systems.find((x) => x.id === 'c1-p1')!.resource!;
    // Only one token of the city's type exists: it is in P0's slot.
    s.resourceSupply[r] = 0;
    s.players[0].resources = [r];
    s.players[0].outraged = [];
    cc.resourceActions[r] = { actions: ['tax'] };
    s = dispatch(ix2, s, { type: 'lead', player: 0, card: 'suitA-2' });
    // Spending it to tax in the prelude: the supply is still empty, so the tax gains nothing.
    s = dispatch(ix2, s, { type: 'prelude', player: 0, resource: r, action: { kind: 'tax', system: 'c1-p1' } });
    expect(heldResources(s.players[0])).toEqual([]);
    expect(s.resourceSupply[r]).toBe(0);
    // The first pip ends the prelude: the token is back in the supply before that action.
    // A second city on the planet: the first one was already taxed this turn.
    s.map['c1-p1'].buildings.push({ owner: 0, type: 'city', damaged: false });
    s = dispatch(ix2, s, { type: 'action', player: 0, action: { kind: 'tax', system: 'c1-p1' } });
    expect(heldResources(s.players[0])).toEqual([r]);
  });

  it('cards secured in the prelude are recorded for the prelude-action limit', () => {
    let s = game(ix, 3, 7, 0);
    setHands(s, [['suitA-2'], ['suitA-4'], ['suitB-3']]);
    s.court[0].agents = { 0: 1 };
    s.players[0].resources = ['relic'];
    const card = s.court[0].card;
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-2' });
    s = dispatch(ix, s, { type: 'prelude', player: 0, resource: 'relic', action: { kind: 'secure', courtSlot: 0 } });
    expect(s.phase).toMatchObject({ budget: { securedInPrelude: [card] } });
  });
});
