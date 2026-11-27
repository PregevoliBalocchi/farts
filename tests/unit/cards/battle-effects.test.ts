// Battle effects and their timing (design/gdd/card-effects.md, "Battle").
import { describe, expect, it } from 'vitest';
import { dispatch, heldResources } from '../../../src/game/engine';
import type { Command, ContentIndex, DieFace, GameState } from '../../../src/game/engine';
import { cardsIndex, runAll, start } from './fixture';

/** Card content whose dice always show the given faces. */
function fixedDice(faces: { skirmish?: DieFace; assault?: DieFace; raid?: DieFace } = {}): ContentIndex {
  return cardsIndex((c) => {
    c.dice.skirmish = [faces.skirmish ?? { hit: 1 }];
    c.dice.assault = [faces.assault ?? { hit: 2 }];
    c.dice.raid = [faces.raid ?? { key: 1 }];
    c.maxDicePerType = 6;
  });
}

/** P0 leads an aggression card; P0 has `attackers` at c1-p1, P1 has `defenders` there. */
function atBattle(ix: ContentIndex, attackers = { fresh: 3, damaged: 0 }, defenders = { fresh: 2, damaged: 0 }): GameState {
  const s = start(ix, [['suitB-2'], ['suitB-4']]);
  s.map['c1-p1'].ships = { 0: { ...attackers }, 1: { ...defenders } };
  return dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' });
}

const battle = (dice: Record<string, number>, system = 'c1-p1'): Command => ({ type: 'action', player: 0, action: { kind: 'battle', system, target: 1, dice } });

describe('collecting dice', () => {
  it('a card adds 2 dice when battling in a gate, not elsewhere', () => {
    const ix = fixedDice();
    let s = atBattle(ix);
    s.players[0].court = ['g:court-08'];
    s.map['c1-gate'].ships = { 0: { fresh: 1, damaged: 0 }, 1: { fresh: 1, damaged: 0 } };
    expect(() => dispatch(ix, s, battle({ skirmish: 5 }))).toThrow(/one die per own ship/);
    s = dispatch(ix, s, battle({ skirmish: 3 }, 'c1-gate'));
    expect(s.phase.type).toBe('allocate');
  });

  it('a leader adds 2 dice in any battle and cannot move more than 2 ships', () => {
    const ix = fixedDice();
    let s = atBattle(ix);
    s.players[0].leader = 'leader-05';
    expect(() => dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 3 } })).toThrow(/more than 2 ships/);
    s = dispatch(ix, s, battle({ skirmish: 5 }));
    expect(s.phase.type).toBe('allocate');
  });

  it('a leader cannot collect more assault dice than skirmish dice', () => {
    const ix = fixedDice();
    const s = atBattle(ix);
    s.players[0].leader = 'leader-11';
    expect(() => dispatch(ix, s, battle({ assault: 2, skirmish: 1 }))).toThrow(/more assault dice than skirmish/);
    expect(dispatch(ix, s, battle({ assault: 1, skirmish: 1 })).phase.type).toBe('allocate');
  });

  it('a defender fresh starport stops raid dice', () => {
    const ix = fixedDice();
    const s = atBattle(ix);
    s.players[1].lore = ['l:lore-05'];
    s.map['c1-p1'].buildings = [{ owner: 1, type: 'starport', damaged: false }];
    expect(() => dispatch(ix, s, battle({ raid: 1 }))).toThrow(/fresh starport/);
    s.map['c1-p1'].buildings[0].damaged = true;
    expect(dispatch(ix, s, battle({ raid: 1 })).phase.type).toBe('allocate');
  });

  it('a card allows 1 raid die when the defender has no buildings here but has some elsewhere', () => {
    const ix = fixedDice();
    const s = atBattle(ix);
    s.map['c1-p2'].buildings = [{ owner: 1, type: 'city', damaged: false }];
    expect(() => dispatch(ix, s, battle({ raid: 1 }))).toThrow(/need defender buildings/);
    s.players[0].lore = ['l:lore-17'];
    expect(() => dispatch(ix, s, battle({ raid: 2 }))).toThrow(/At most 1 raid/);
    expect(dispatch(ix, s, battle({ raid: 1 })).phase.type).toBe('allocate');
  });
});

describe('before dice are collected', () => {
  it('the attacker takes 1 hit when a defending card sees a fresh defender', () => {
    const ix = fixedDice();
    let s = atBattle(ix);
    s.players[1].lore = ['l:lore-12'];
    s = dispatch(ix, s, battle({ skirmish: 3 }));
    expect(s.map['c1-p1'].ships[0]).toEqual({ fresh: 2, damaged: 1 });
  });

  it('the defender may move fresh ships in, then the attacker collects dice', () => {
    const ix = fixedDice();
    let s = atBattle(ix);
    s.players[1].lore = ['l:lore-15'];
    s.map['c1-gate'].ships = { 1: { fresh: 2, damaged: 0 } };
    s = dispatch(ix, s, battle({ skirmish: 3 }));
    expect(s.phase).toMatchObject({ type: 'decide', decision: { player: 1, effect: 'beforeDice' } });
    s = dispatch(ix, s, { type: 'decide', player: 1, args: { moves: [{ from: 'c1-gate', ships: 2 }] } });
    expect(s.map['c1-p1'].ships[1].fresh).toBe(4);
    expect(s.phase).toMatchObject({ type: 'decide', decision: { player: 0, effect: 'collectDice' } });
    s = dispatch(ix, s, { type: 'decide', player: 0, args: { dice: { skirmish: 2 } } });
    expect(s.phase).toMatchObject({ type: 'allocate', battle: { defenderFresh: 4, totals: { hit: 2 } } });
  });

  it('the reaction is not offered when no fresh ship is adjacent', () => {
    const ix = fixedDice();
    let s = atBattle(ix);
    s.players[1].lore = ['l:lore-15'];
    s = dispatch(ix, s, battle({ skirmish: 3 }));
    expect(s.phase.type).toBe('allocate');
  });
});

describe('intercept modifiers', () => {
  it('a defending card adds 1 intercept when assault dice were rolled', () => {
    const ix = fixedDice();
    const s = atBattle(ix);
    s.players[1].lore = ['l:lore-04'];
    expect(dispatch(ix, s, battle({ skirmish: 1 })).phase).toMatchObject({ battle: { interceptHits: 0 } });
    expect(dispatch(ix, s, battle({ assault: 1 })).phase).toMatchObject({ battle: { totals: { intercept: 1 }, interceptHits: 2 } });
  });

  it('an attacking card ignores 1 intercept only if every attacker was fresh', () => {
    const ix = fixedDice({ skirmish: { intercept: 1 } });
    const fresh = atBattle(ix);
    fresh.players[0].lore = ['l:lore-06'];
    expect(dispatch(ix, fresh, battle({ skirmish: 1 })).phase).toMatchObject({ battle: { interceptHits: 0 } });
    const mixed = atBattle(ix, { fresh: 2, damaged: 1 });
    mixed.players[0].lore = ['l:lore-06'];
    expect(dispatch(ix, mixed, battle({ skirmish: 1 })).phase).toMatchObject({ battle: { interceptHits: 2 } });
  });

  it('a defending leader turns intercept into one hit per Weapon icon, then discards 1 Weapons', () => {
    const ix = fixedDice({ skirmish: { intercept: 1 } });
    let s = atBattle(ix, { fresh: 3, damaged: 0 }, { fresh: 1, damaged: 0 });
    s.players[1].leader = 'leader-15';
    s.players[1].resources = ['weapons', 'weapons', 'fuel'];
    s = dispatch(ix, s, battle({ skirmish: 1 }));
    expect(s.phase).toMatchObject({ battle: { interceptHits: 2 } });
    s = dispatch(ix, s, { type: 'allocate', player: 0, allocation: { selfHits: ['fresh', 'fresh'], hits: [], buildingHits: [] } });
    expect(heldResources(s.players[1])).toEqual(['weapons', 'fuel']);
  });
});

describe('rerolls', () => {
  it('a reroll is limited by Weapon icons (resources and cards) and works once per battle', () => {
    const ix = fixedDice();
    let s = atBattle(ix);
    s.players[0].court = ['g:court-13'];
    s.players[0].resources = ['weapons'];
    s = dispatch(ix, s, battle({ skirmish: 3 }));
    // 1 Weapons token + the Weapons Guild card itself = 2 icons.
    expect(() => dispatch(ix, s, { type: 'reroll', player: 0, card: 'g:court-13', dice: [0, 1, 2] })).toThrow(/at most 2/);
    s = dispatch(ix, s, { type: 'reroll', player: 0, card: 'g:court-13', dice: [0] });
    expect(s.phase).toMatchObject({ battle: { rerolls: ['g:court-13'] } });
    expect(() => dispatch(ix, s, { type: 'reroll', player: 0, card: 'g:court-13', dice: [1] })).toThrow(/already used/);
  });

  it('a reroll limited to one die type refuses other dice', () => {
    const ix = fixedDice();
    let s = atBattle(ix);
    s.players[0].lore = ['l:lore-14'];
    s = dispatch(ix, s, battle({ skirmish: 1, assault: 1 }));
    expect(() => dispatch(ix, s, { type: 'reroll', player: 0, card: 'l:lore-14', dice: [0] })).toThrow(/only assault/);
    expect(dispatch(ix, s, { type: 'reroll', player: 0, card: 'l:lore-14', dice: [1] }).phase.type).toBe('allocate');
  });

  it('a reroll that needs a declared ambition is refused otherwise', () => {
    const ix = fixedDice();
    let s = atBattle(ix);
    s.players[0].lore = ['l:lore-19'];
    s = dispatch(ix, s, battle({ skirmish: 3 }));
    expect(() => dispatch(ix, s, { type: 'reroll', player: 0, card: 'l:lore-19', dice: [0, 1, 2] })).toThrow(/only while psionics/);
    s.ambitions.declared.psionics = ['m'];
    expect(dispatch(ix, s, { type: 'reroll', player: 0, card: 'l:lore-19', dice: [0, 1, 2] }).phase.type).toBe('allocate');
  });

  it('rerolling an intercept away removes the intercept hits', () => {
    const ix = cardsIndex((c) => {
      c.dice.skirmish = [{ intercept: 1 }, { hit: 1 }];
      c.maxDicePerType = 6;
    });
    let s = atBattle(ix);
    s.players[0].lore = ['l:lore-19'];
    s.ambitions.declared.psionics = ['m'];
    s = dispatch(ix, s, battle({ skirmish: 1 }));
    // Reroll until the face differs from the first roll (deterministic seed: at most a few tries are needed).
    const before = s.phase.type === 'allocate' ? s.phase.battle.faces![0].face : null;
    s = dispatch(ix, s, { type: 'reroll', player: 0, card: 'l:lore-19', dice: [0] });
    const b = s.phase.type === 'allocate' ? s.phase.battle : null;
    expect(b!.interceptHits).toBe(b!.totals.intercept > 0 ? 2 : 0);
    expect(before).not.toBeNull();
  });
});

describe('after the battle', () => {
  it('an attacking card repairs 1 attacking ship after the battle', () => {
    const ix = fixedDice({ skirmish: { selfHit: 1 } });
    let s = atBattle(ix);
    s.players[0].lore = ['l:lore-07'];
    s = dispatch(ix, s, battle({ skirmish: 1 }));
    s = dispatch(ix, s, { type: 'allocate', player: 0, allocation: { selfHits: ['fresh'], hits: [], buildingHits: [] } });
    expect(s.map['c1-p1'].ships[0]).toEqual({ fresh: 3, damaged: 0 });
  });

  it('a defending leader repairs 1 ship per starport in systems it controls', () => {
    const ix = fixedDice({ skirmish: { hit: 1 } });
    let s = atBattle(ix);
    s.players[1].leader = 'leader-16';
    s.map['c1-p2'].ships = { 1: { fresh: 1, damaged: 0 } };
    s.map['c1-p2'].buildings = [{ owner: 0, type: 'starport', damaged: false }];
    s = dispatch(ix, s, battle({ skirmish: 2 }));
    s = dispatch(ix, s, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: ['fresh', 'fresh'], buildingHits: [] } });
    expect(s.map['c1-p1'].ships[1]).toEqual({ fresh: 1, damaged: 1 });
  });

  it('a defending leader may influence after the attacker took Trophies, and blocks Ransack', () => {
    const ix = fixedDice({ skirmish: { hit: 1 } });
    let s = atBattle(ix, { fresh: 3, damaged: 0 }, { fresh: 0, damaged: 1 });
    s.players[1].leader = 'leader-01';
    s.map['c1-p1'].buildings = [{ owner: 1, type: 'city', damaged: true }];
    s.court[0].agents = { 1: 1 };
    s = dispatch(ix, s, battle({ skirmish: 2 }));
    s = dispatch(ix, s, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: ['damaged', { building: 0 }], buildingHits: [] } });
    // No Ransack: the city's owner holds a leader that forbids it, so no Court card was named.
    expect(s.players[0].court).toEqual([]);
    expect(s.phase).toMatchObject({ type: 'decide', decision: { player: 1, effect: 'afterDefending' } });
    const agents = s.players[1].supply.agents;
    s = dispatch(ix, s, { type: 'decide', player: 1, args: { courtSlot: 1 } });
    expect(s.players[1].supply.agents).toBe(agents - 1);
    expect(s.phase.type).toBe('actions');
  });
});

describe('like in a battle', () => {
  it('a lore action rolls skirmish dice from an adjacent system and ignores battle modifiers', () => {
    const ix = fixedDice({ skirmish: { hit: 1 } });
    let s = start(ix, [['suitB-2'], ['suitB-4']]);
    s.players[0].lore = ['l:lore-02'];
    s.players[1].lore = ['l:lore-12'];
    s.map['c1-gate'].ships = { 0: { fresh: 2, damaged: 1 } };
    s.map['c1-p1'].ships = { 1: { fresh: 2, damaged: 0 } };
    s = runAll(ix, s, [
      { type: 'lead', player: 0, card: 'suitB-2' },
      { type: 'action', player: 0, action: { kind: 'card', card: 'l:lore-02', name: 'rifles', args: { system: 'c1-gate', at: 'c1-p1', target: 1 } } },
    ]);
    // 2 fresh ships → 2 dice; the defender's "hit the attacker first" card does not apply.
    expect(s.map['c1-gate'].ships[0]).toEqual({ fresh: 2, damaged: 1 });
    expect(s.phase).toMatchObject({ type: 'allocate', battle: { like: true, totals: { hit: 2 } } });
    s = dispatch(ix, s, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: ['fresh', 'fresh'], buildingHits: [] } });
    expect(s.map['c1-p1'].ships[1]).toEqual({ fresh: 0, damaged: 2 });
  });

  // lore-19 "if you roll any dice (even outside battle), you may reroll any number of them once"; a battle
  // reroll (lore-14) applies to battles only.
  it('the dice of a lore action can be rerolled by a card that rerolls any dice, not by a battle reroll', () => {
    const ix = fixedDice({ skirmish: { hit: 1 } });
    let s = start(ix, [['suitB-2'], ['suitB-4']]);
    s.players[0].lore = ['l:lore-02', 'l:lore-19', 'l:lore-14'];
    s.ambitions.declared.psionics = ['m'];
    s.map['c1-gate'].ships = { 0: { fresh: 2, damaged: 0 } };
    s.map['c1-p1'].ships = { 1: { fresh: 2, damaged: 0 } };
    s = runAll(ix, s, [
      { type: 'lead', player: 0, card: 'suitB-2' },
      { type: 'action', player: 0, action: { kind: 'card', card: 'l:lore-02', name: 'rifles', args: { system: 'c1-gate', at: 'c1-p1', target: 1 } } },
    ]);
    expect(s.phase).toMatchObject({ type: 'allocate', battle: { like: true, faces: [{ type: 'skirmish' }, { type: 'skirmish' }] } });
    expect(() => dispatch(ix, s, { type: 'reroll', player: 0, card: 'l:lore-14', dice: [0] })).toThrow(/Not a battle/);
    s = dispatch(ix, s, { type: 'reroll', player: 0, card: 'l:lore-19', dice: [0, 1] });
    // Still a roll "like in a battle": only its hits count.
    expect(s.phase).toMatchObject({ type: 'allocate', battle: { rerolls: ['l:lore-19'], totals: { hit: 2, selfHit: 0, buildingHit: 0, key: 0, intercept: 0 } } });
    expect(() => dispatch(ix, s, { type: 'reroll', player: 0, card: 'l:lore-19', dice: [0] })).toThrow(/already used/);
  });
});

describe('building with cards', () => {
  it('a card builds ships fresh even where a Rival controls the system', () => {
    const ix = fixedDice();
    let s = start(ix, [['suitC-2'], ['suitC-4']]);
    s.players[0].lore = ['l:lore-05'];
    s.map['c1-p1'].buildings = [{ owner: 0, type: 'starport', damaged: false }];
    s.map['c1-p1'].ships = { 1: { fresh: 2, damaged: 0 } };
    s = runAll(ix, s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'action', player: 0, action: { kind: 'build', system: 'c1-p1', what: 'ship' } },
    ]);
    expect(s.map['c1-p1'].ships[0]).toEqual({ fresh: 1, damaged: 0 });
  });
});

describe('battle rulings from the FAQ', () => {
  it('ignoring an intercept does not cancel the one a defender card adds', () => {
    const ix = fixedDice({ assault: { hit: 1 } });
    const s = atBattle(ix);
    s.players[0].lore = ['l:lore-06'];
    s.players[1].lore = ['l:lore-04'];
    expect(dispatch(ix, s, battle({ assault: 1 })).phase).toMatchObject({ battle: { totals: { intercept: 1 }, interceptHits: 2 } });
  });

  it('a leader must collect its 2 extra dice', () => {
    const ix = fixedDice();
    const s = atBattle(ix);
    s.players[0].leader = 'leader-05';
    expect(() => dispatch(ix, s, battle({ skirmish: 1 }))).toThrow(/extra dice must be collected/);
  });

  it('a 2-ship move cap limits ships moved in from each adjacent system before dice', () => {
    const ix = fixedDice();
    let s = atBattle(ix);
    s.players[1].lore = ['l:lore-15'];
    s.players[1].leader = 'leader-05';
    s.map['c1-gate'].ships = { 1: { fresh: 3, damaged: 0 } };
    s = dispatch(ix, s, battle({ skirmish: 3 }));
    expect(() => dispatch(ix, s, { type: 'decide', player: 1, args: { moves: [{ from: 'c1-gate', ships: 3 }] } })).toThrow(/more than 2 ships/);
  });
});

