// Player board: slots freed by cities, keys, city bonus, prelude rules (design/gdd/core-loop.md §3.7).
import { describe, expect, it } from 'vitest';
import { arrangeResources, cityBonusPower, dispatch, endArranging, gainResource, heldResources, onCityReturned, openSlots, scoreAmbitions } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { content, game, index, setHands } from './fixture';

const c = content();
const ix = index(c);

/** 2-player game (setup-2a); P0 built 1 city at setup. */
function fresh(): GameState {
  return game(ix, 2, 5, 0, 'setup-2a');
}

describe('resource slots', () => {
  it('opens slots as cities leave the board, leftmost first', () => {
    const s = fresh();
    const p = s.players[0];
    expect(openSlots(c, p)).toEqual([0, 1, 2]);
    p.supply.cities = 2; // 3 built
    expect(openSlots(c, p)).toEqual([0, 1, 2, 3, 4, 5]);
    p.supply.cities = 5; // none built
    expect(openSlots(c, p)).toEqual([0, 1]);
  });

  it('fills the leftmost free open slot and sets aside what finds none', () => {
    const p = fresh().players[1];
    p.resources = [];
    gainResource(c, p, 'fuel');
    gainResource(c, p, 'relic');
    gainResource(c, p, 'weapons');
    gainResource(c, p, 'material');
    expect(p.resources).toEqual(['fuel', 'relic', 'weapons']);
    expect(p.overflow).toEqual(['material']);
    expect(p.arranging).toBe(true);
  });

  it('lets a player who gained a token move tokens between open slots, gaps allowed', () => {
    const p = fresh().players[1];
    p.resources = ['fuel'];
    gainResource(c, p, 'relic');
    expect(arrangeResources(c, p, [null, 'fuel', 'relic'])).toBeNull();
    expect(p.resources.slice(0, 3)).toEqual([null, 'fuel', 'relic']);
  });

  it('keeps the new token in place of an old one when the slots are full', () => {
    const s = fresh();
    const p = s.players[1];
    p.resources = ['fuel', 'fuel', 'fuel'];
    gainResource(c, p, 'relic');
    expect(arrangeResources(c, p, ['relic', 'fuel', 'fuel'])).toBeNull();
    expect(p.overflow).toEqual(['fuel']);
    const before = s.resourceSupply.fuel;
    endArranging(s, p);
    expect(s.resourceSupply.fuel).toBe(before + 1);
    expect(p.overflow).toBeUndefined();
    expect(p.arranging).toBeUndefined();
  });

  it('refuses to rearrange without a gain, onto a covered slot, with a token not held, or leaving one aside with room', () => {
    const p = fresh().players[1];
    p.resources = ['fuel'];
    expect(arrangeResources(c, p, [null, 'fuel'])).toMatch(/only when you gain/);
    gainResource(c, p, 'relic');
    expect(arrangeResources(c, p, ['fuel', null, null, 'relic'])).toMatch(/open slot/);
    expect(arrangeResources(c, p, ['fuel', 'weapons'])).toMatch(/resources you hold/);
    expect(arrangeResources(c, p, ['fuel'])).toMatch(/while one is free/);
    expect(p.resources.slice(0, 2)).toEqual(['fuel', 'relic']);
  });

  it('a returning city moves the covered token to a free open slot', () => {
    const cc = content();
    cc.playerBoard.cityReturnResource = 'move';
    const p = fresh().players[1];
    p.supply.cities = 3; // 2 built: slots 0-3 open
    p.resources = ['fuel', null, 'relic', 'weapons'];
    p.supply.cities = 4; // one comes back: slot 3 covered again
    expect(onCityReturned(cc, p)).toEqual([]);
    expect(heldResources(p)).toEqual(['fuel', 'weapons', 'relic']);
  });

  it('a returning city sets aside the covered token when no open slot is free', () => {
    const cc = content();
    cc.playerBoard.cityReturnResource = 'move';
    const p = fresh().players[1];
    p.resources = ['fuel', 'material', 'relic', 'weapons'];
    p.supply.cities = 4; // 1 built: slots 0-2 open
    expect(onCityReturned(cc, p)).toEqual([]);
    expect(heldResources(p)).toEqual(['fuel', 'material', 'relic']);
    // The displaced token waits aside: the player may keep it in place of another.
    expect(p.overflow).toEqual(['weapons']);
    expect(p.arranging).toBe(true);
  });

  it('a tie for first gets second-place power but no city bonus', () => {
    const s = fresh();
    s.players.forEach((p) => { p.supply.cities = 0; p.resources = ['fuel']; });
    s.ambitions.declared.wealth = ['m-high'];
    s.chapter = 1;
    // Both players and the 2-player box tie at 1: everyone gets second place (3), no +5 bonus.
    expect(scoreAmbitions(c, s).gains).toEqual([3, 3]);
  });

  it('a destroyed city covers its slot again and the token there is lost', () => {
    let s = fresh();
    setHands(s, [['suitB-2'], ['suitA-4']]);
    s.map['c3-p1'].ships = { 0: { fresh: 3, damaged: 0 } };
    s.map['c3-p1'].buildings = [{ owner: 1, type: 'city', damaged: true }];
    s.players[1].resources = ['fuel', 'material', 'relic'];
    const cc = content();
    cc.dice.raid = [{ buildingHit: 1 }];
    const ix2 = index(cc);
    s = dispatch(ix2, s, { type: 'lead', player: 0, card: 'suitB-2' });
    s = dispatch(ix2, s, { type: 'action', player: 0, action: { kind: 'battle', system: 'c3-p1', target: 1, dice: { raid: 1 } } });
    s = dispatch(ix2, s, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: [], buildingHits: [0] } });
    expect(s.players[1].supply.cities).toBe(5);
    expect(heldResources(s.players[1])).toEqual(['fuel', 'material']);
  });
});

describe('city bonus power', () => {
  it('adds the uncovered bonuses to each ambition won', () => {
    const s = fresh();
    s.players[0].supply.cities = 0; // all 5 built: +2 and +3 uncovered
    expect(cityBonusPower(c, s.players[0])).toBe(5);
    s.players[0].resources = ['fuel', 'fuel'];
    s.players[1].resources = ['fuel'];
    s.ambitions.declared.wealth = ['m-high'];
    s.chapter = 1;
    expect(scoreAmbitions(c, s).gains).toEqual([5 + 5, 0]);
  });

  it('uses only the highest bonus in highest mode', () => {
    const cc = content();
    cc.playerBoard.bonusMode = 'highest';
    const p = fresh().players[0];
    p.supply.cities = 0;
    expect(cityBonusPower(cc, p)).toBe(3);
  });
});

describe('prelude rules', () => {
  it('the grant-kind resource lets this turn\u2019s card battle', () => {
    const cc = content();
    cc.resourceActions.weapons = { grantKind: 'battle' };
    const ix2 = index(cc);
    let s = game(ix2, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitA-2'], ['suitA-4']]);
    s.players[0].resources = ['weapons'];
    s = dispatch(ix2, s, { type: 'lead', player: 0, card: 'suitA-2' });
    s = dispatch(ix2, s, { type: 'prelude', player: 0, resource: 'weapons' });
    expect(s.phase).toMatchObject({ type: 'actions', budget: { kinds: ['tax', 'repair', 'influence', 'battle'] } });
  });

  it('the lead-suit resource takes an action of the lead card', () => {
    const cc = content();
    cc.resourceActions.psionic = { leadSuit: true };
    const ix2 = index(cc);
    let s = game(ix2, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitA-2'], ['suitA-4']]);
    s.players[0].resources = ['psionic'];
    s = dispatch(ix2, s, { type: 'lead', player: 0, card: 'suitA-2' });
    expect(() => dispatch(ix2, s, { type: 'prelude', player: 0, resource: 'psionic', action: { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 1 } })).toThrow(/cannot pay/);
    s = dispatch(ix2, s, { type: 'prelude', player: 0, resource: 'psionic', action: { kind: 'influence', courtSlot: 0 } });
    expect(heldResources(s.players[0])).toEqual([]);
  });
});
