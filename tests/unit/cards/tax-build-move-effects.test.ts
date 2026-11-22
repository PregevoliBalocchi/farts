// Tax, build and move effects (design/gdd/card-effects.md, "Tax, build, move").
import { describe, expect, it } from 'vitest';
import { dispatch, heldResources } from '../../../src/game/engine';
import type { ActionPayload, GameState } from '../../../src/game/engine';
import { cardsIndex, runAll, start } from './fixture';

// c1-p1 (weapons) has 1 building slot in these tests.
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

describe('tax', () => {
  it('a card allows taxing the same city again while Warlord is declared', () => {
    let s = lead('suitA-2', (s) => {
      s.players[0].lore = ['l:lore-23'];
      s.map['c1-p2'].buildings = [city(0)];
    });
    s = act(s, { kind: 'tax', system: 'c1-p2' });
    expect(() => act(s, { kind: 'tax', system: 'c1-p2' })).toThrow(/already taxed/);
    s.ambitions.declared.trophies = ['m'];
    s = act(s, { kind: 'tax', system: 'c1-p2' });
    expect(heldResources(s.players[0])).toEqual(['relic', 'relic']);
  });

  it('a card taxes a Rival city without control and without a Captive while Empath is declared', () => {
    const s = lead('suitA-2', (s) => {
      s.players[0].lore = ['l:lore-20'];
      s.map['c1-p2'].buildings = [city(1)];
    });
    expect(() => act(s, { kind: 'tax', system: 'c1-p2', cityOwner: 1 })).toThrow(/control the system/);
    s.ambitions.declared.psionics = ['m'];
    const t = act(s, { kind: 'tax', system: 'c1-p2', cityOwner: 1 });
    expect(heldResources(t.players[0])).toEqual(['relic']);
    expect(t.players[0].captives).toEqual([]);
  });

  it('a leader gains a bonus resource when taxing on a Copy turn, not on a lead', () => {
    let s = start(ix, [['suitA-2'], ['suitA-5']]);
    s.players[0].leader = 'leader-02';
    s.players[1].leader = 'leader-02';
    s.map['c1-p2'].buildings = [city(0), city(1)];
    s = runAll(ix, s, [
      { type: 'lead', player: 0, card: 'suitA-2' },
      { type: 'action', player: 0, action: { kind: 'tax', system: 'c1-p2' } },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitA-5', mode: 'copy' },
      { type: 'action', player: 1, action: { kind: 'tax', system: 'c1-p2' } },
    ]);
    expect(heldResources(s.players[0])).toEqual(['relic']);
    expect(heldResources(s.players[1])).toEqual(['relic', 'psionic']);
  });

  it('a leader taxes no city it does not control, even with a card that ignores control (errata)', () => {
    const s = lead('suitA-2', (s) => {
      s.players[0].leader = 'leader-04';
      s.players[0].lore = ['l:lore-20'];
      s.ambitions.declared.psionics = ['m'];
      s.map['c1-p2'].buildings = [city(0)];
      s.map['c1-p3'].buildings = [city(1)];
    });
    expect(() => act(s, { kind: 'tax', system: 'c1-p2' })).toThrow(/do not control/);
    expect(() => act(s, { kind: 'tax', system: 'c1-p3', cityOwner: 1 })).toThrow(/do not control/);
    s.map['c1-p2'].ships = { 0: { fresh: 1, damaged: 0 } };
    expect(heldResources(act(s, { kind: 'tax', system: 'c1-p2' }).players[0])).toEqual(['relic']);
  });

  it('a leader with ships there taxes Rival cities without control and empty slots, but never its own cities', () => {
    const s = lead('suitA-2', (s) => {
      s.players[0].leader = 'leader-13';
      s.map['c1-p1'].ships = { 0: { fresh: 1, damaged: 0 }, 1: { fresh: 3, damaged: 0 } };
      s.map['c1-p2'].ships = { 0: { fresh: 1, damaged: 0 }, 1: { fresh: 3, damaged: 0 } };
      s.map['c1-p2'].buildings = [city(1)];
      s.map['c1-p3'].buildings = [city(0)];
      s.map['c1-p3'].ships = { 0: { fresh: 1, damaged: 0 } };
    });
    expect(() => act(s, { kind: 'tax', system: 'c1-p3' })).toThrow(/cannot tax your own/);
    expect(heldResources(act(s, { kind: 'tax', system: 'c1-p2', cityOwner: 1 }).players[0])).toEqual(['relic']);
    const slot = act(s, { kind: 'tax', system: 'c1-p1', emptySlot: true });
    expect(heldResources(slot.players[0])).toEqual(['weapons']);
    expect(() => act(slot, { kind: 'tax', system: 'c1-p1', emptySlot: true })).toThrow(/already taxed/);
  });

  it('a leader changes a planet type for good after taxing a city there', () => {
    let s = lead('suitA-2', (s) => {
      s.players[0].leader = 'leader-14';
      s.players[0].resources = ['fuel'];
      s.map['c1-p2'].buildings = [city(0), city(0)];
    });
    s = act(s, { kind: 'tax', system: 'c1-p2', shape: 0 });
    expect(s.planetTypes).toEqual({ 'c1-p2': 'fuel' });
    expect(heldResources(s.players[0])).toEqual(['relic']);
    expect(() => act(s, { kind: 'tax', system: 'c1-p2', shape: 0 })).toThrow(/already changed/);
    s = act(s, { kind: 'tax', system: 'c1-p2' });
    expect(heldResources(s.players[0]).sort()).toEqual(['fuel', 'relic']);
  });

  it('a leader hits its taxed city to tax it again once per turn', () => {
    let s = lead('suitA-2', (s) => {
      s.players[0].leader = 'leader-10';
      s.map['c1-p2'].buildings = [city(0), city(0)];
    });
    s = act(s, { kind: 'tax', system: 'c1-p2', city: 0, again: {} });
    expect(heldResources(s.players[0])).toEqual(['relic', 'relic']);
    expect(s.map['c1-p2'].buildings[0].damaged).toBe(true);
    expect(() => act(s, { kind: 'tax', system: 'c1-p2', city: 1, again: {} })).toThrow(/once per turn/);
  });

  it('destroying its own city this way Provokes Outrage but gives no Trophy', () => {
    let s = lead('suitA-2', (s) => {
      s.players[0].leader = 'leader-10';
      s.map['c1-p2'].buildings = [city(0, true)];
    });
    s = act(s, { kind: 'tax', system: 'c1-p2', again: {} });
    expect(s.map['c1-p2'].buildings).toEqual([]);
    expect(s.players[0].outraged).toEqual(['relic']);
    expect(s.players[0].trophies).toEqual([]);
  });
});

describe('build', () => {
  it('a card builds a city on a gate; it has every city type of its cluster', () => {
    let s = lead('suitC-2', (s) => {
      s.players[0].lore = ['l:lore-11'];
      s.map['c1-gate'].ships = { 0: { fresh: 1, damaged: 0 } };
      s.map['c1-p1'].buildings = [city(1)];
      s.map['c1-p3'].buildings = [city(1)];
    });
    s = act(s, { kind: 'build', system: 'c1-gate', what: 'city' });
    expect(s.map['c1-gate'].buildings).toEqual([city(0)]);
    expect(() => act(s, { kind: 'build', system: 'c1-gate', what: 'city' })).toThrow(/At most 1 city per gate/);
    // Taxing it: choose one of the cluster's city types.
    s.phase = { type: 'actions', budget: { player: 0, kinds: ['tax'], remaining: 1 } };
    expect(() => act(s, { kind: 'tax', system: 'c1-gate', resource: 'relic' })).toThrow(/weapons or psionic/);
    expect(heldResources(act(s, { kind: 'tax', system: 'c1-gate', resource: 'psionic' }).players[0])).toEqual(['psionic']);
  });

  it('without such a card buildings stay off gates', () => {
    const s = lead('suitC-2', (s) => {
      s.map['c1-gate'].ships = { 0: { fresh: 1, damaged: 0 } };
    });
    expect(() => act(s, { kind: 'build', system: 'c1-gate', what: 'starport' })).toThrow(/Buildings go on planets/);
  });

  it('a card builds one city outside the slots, paying 1 resource of the planet type', () => {
    let s = lead('suitC-2', (s) => {
      s.players[0].lore = ['l:lore-09'];
      s.players[0].resources = ['weapons'];
      s.map['c1-p1'].ships = { 0: { fresh: 1, damaged: 0 } };
      s.map['c1-p1'].buildings = [city(1)];
    });
    expect(() => act(s, { kind: 'build', system: 'c1-p1', what: 'city' })).toThrow(/No free building slot/);
    s = act(s, { kind: 'build', system: 'c1-p1', what: 'city', outside: true });
    expect(s.map['c1-p1'].buildings[1]).toMatchObject({ owner: 0, type: 'city', outside: true });
    expect(heldResources(s.players[0])).toEqual([]);
    s.players[0].resources = ['weapons'];
    expect(() => act(s, { kind: 'build', system: 'c1-p1', what: 'city', outside: true })).toThrow(/At most 1 city outside/);
  });

  it('a card builds ships at a Rival starport while Empath is declared', () => {
    const s = lead('suitC-2', (s) => {
      s.players[0].lore = ['l:lore-20'];
      s.map['c1-p2'].buildings = [{ owner: 1, type: 'starport', damaged: false }];
    });
    expect(() => act(s, { kind: 'build', system: 'c1-p2', what: 'ship' })).toThrow(/Loyal starport/);
    s.ambitions.declared.psionics = ['m'];
    expect(act(s, { kind: 'build', system: 'c1-p2', what: 'ship' }).map['c1-p2'].ships[0]).toEqual({ fresh: 1, damaged: 0 });
  });

  it('a leader hits its starport to build a second ship there', () => {
    const s = lead('suitC-2', (s) => {
      s.players[0].leader = 'leader-10';
      s.map['c1-p2'].buildings = [{ owner: 0, type: 'starport', damaged: false }];
    });
    const t = act(s, { kind: 'build', system: 'c1-p2', what: 'ship', again: {} });
    expect(t.map['c1-p2'].ships[0]).toEqual({ fresh: 2, damaged: 0 });
    expect(t.map['c1-p2'].buildings[0].damaged).toBe(true);
  });
});

describe('move', () => {
  it('a card moves fresh ships that just arrived one step more', () => {
    let s = lead('suitB-2', (s) => {
      s.players[0].lore = ['l:lore-03'];
      s.map['c1-p1'].ships = { 0: { fresh: 2, damaged: 1 } };
    });
    expect(() => act(s, { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 0, damaged: 1, then: [{ from: 'c1-gate', to: 'c1-p3', ships: 1 }] })).toThrow(/Only fresh ships/);
    s = act(s, { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 2, then: [{ from: 'c1-gate', to: 'c1-p3', ships: 1 }] });
    expect(s.map['c1-gate'].ships[0].fresh).toBe(1);
    expect(s.map['c1-p3'].ships[0].fresh).toBe(1);
  });

  it('without the card ships do not move again', () => {
    const s = lead('suitB-2', (s) => {
      s.map['c1-p1'].ships = { 0: { fresh: 2, damaged: 0 } };
    });
    expect(() => act(s, { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 2, then: [{ from: 'c1-gate', to: 'c1-p3', ships: 1 }] })).toThrow(/No card/);
  });

  it('entering a gate guarded by a Rival fresh starport costs 1 agent as a Captive', () => {
    const s = lead('suitB-2', (s) => {
      s.players[1].lore = ['l:lore-08'];
      s.map['c1-gate'].ships = { 1: { fresh: 2, damaged: 0 } };
      s.map['c1-gate'].buildings = [{ owner: 1, type: 'starport', damaged: false }];
      s.map['c1-p1'].ships = { 0: { fresh: 1, damaged: 0 } };
    });
    const t = act(s, { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 1 });
    expect(t.players[1].captives).toEqual([0]);
    expect(t.players[0].supply.agents).toBe(s.players[0].supply.agents - 1);
  });

  it('a leader Catapults only from gates', () => {
    const s = lead('suitB-2', (s) => {
      s.players[0].leader = 'leader-14';
      s.map['c1-p1'].ships = { 0: { fresh: 1, damaged: 0 } };
      s.map['c1-p1'].buildings = [{ owner: 0, type: 'starport', damaged: false }];
      s.map['c1-gate'].ships = { 0: { fresh: 1, damaged: 0 } };
    });
    expect(() => act(s, { kind: 'move', from: 'c1-p1', via: ['c1-gate'], to: 'c1-p3', ships: 1 })).toThrow(/only from gates/);
    // From a gate, with no starport: allowed.
    s.map['c2-gate'].inPlay = true;
    s.map['c2-p1'].inPlay = true;
    const t = act(s, { kind: 'move', from: 'c1-gate', via: ['c2-gate'], to: 'c2-p1', ships: 1 });
    expect(t.map['c2-p1'].ships[0].fresh).toBe(1);
  });
});

describe('rulings from the FAQ', () => {
  it('a gate city in a cluster with no other city can be taxed for nothing', () => {
    let s = lead('suitC-2', (s) => {
      s.players[0].lore = ['l:lore-11'];
      s.map['c1-gate'].ships = { 0: { fresh: 1, damaged: 0 } };
    });
    s = act(s, { kind: 'build', system: 'c1-gate', what: 'city' });
    s.phase = { type: 'actions', budget: { player: 0, kinds: ['tax'], remaining: 1 } };
    s = act(s, { kind: 'tax', system: 'c1-gate' });
    expect(heldResources(s.players[0])).toEqual([]);
  });

  it('only a building in a slot can be swapped by the lore Prune action', () => {
    const s = lead('suitC-2', (s) => {
      s.players[0].lore = ['l:lore-10'];
      s.map['c1-p1'].buildings = [{ owner: 0, type: 'city', damaged: false, outside: true }];
    });
    expect(() => act(s, { kind: 'card', card: 'l:lore-10', name: 'prune', args: { system: 'c1-p1', index: 0 } })).toThrow(/in a slot/);
  });

  it('the lore Martyr action may destroy only your own ship', () => {
    const s = lead('suitB-2', (s) => {
      s.players[0].lore = ['l:lore-18'];
      s.map['c1-p1'].ships = { 0: { fresh: 2, damaged: 0 } };
    });
    expect(act(s, { kind: 'card', card: 'l:lore-18', name: 'martyr', args: { system: 'c1-p1' } }).map['c1-p1'].ships[0].fresh).toBe(1);
  });

  it('the extra move of the lore card can be a Catapult from a starport', () => {
    let s = lead('suitB-2', (s) => {
      s.players[0].lore = ['l:lore-03'];
      s.map['c1-p1'].ships = { 0: { fresh: 2, damaged: 0 } };
      s.map['c1-p2'].buildings = [{ owner: 0, type: 'starport', damaged: false }];
      s.map['c2-gate'].inPlay = true;
    });
    s = act(s, { kind: 'move', from: 'c1-p1', to: 'c1-p2', ships: 2, then: [{ from: 'c1-p2', via: ['c1-gate'], to: 'c2-gate', ships: 1 }] });
    expect(s.map['c2-gate'].ships[0].fresh).toBe(1);
    expect(s.map['c1-p2'].ships[0].fresh).toBe(1);
  });
});
