// Destroying cities: Outrage and Ransack (design/gdd/core-loop.md §3.10), plus the rulebook raid example.
import { describe, expect, it } from 'vitest';
import { dispatch, heldResources } from '../../../src/game/engine';
import type { GameState, Resource } from '../../../src/game/engine';
import { content, game, index, setHands } from './fixture';

const c = content();
c.dice.raid = [{ buildingHit: 1 }];
const ix = index(c);
const PLANET = c.map.systems.find((x) => x.id === 'c3-p1')!.resource as Resource;
const OTHER: Resource = PLANET === 'fuel' ? 'material' : 'fuel';
const GUILD_OF = (r: Resource) => c.courtCards.find((x) => x.kind === 'faction' && x.resource === r)!.id;

/** P0 attacks P1's damaged city at c3-p1 (P1 has no ships there). */
function ready(): GameState {
  const s = game(ix, 3, 5, 0);
  setHands(s, [['suitB-2'], ['suitA-4'], ['suitC-3']]);
  const sys = s.map['c3-p1'];
  sys.ships = { 0: { fresh: 2, damaged: 0 } };
  sys.buildings = [{ owner: 1, type: 'city', damaged: true }];
  s.players[0].resources = [PLANET, OTHER, PLANET];
  s.players[0].court = [GUILD_OF(PLANET), GUILD_OF(OTHER)];
  return dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' });
}

function destroy(s: GameState, ransack?: number[]) {
  s = dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'battle', system: 'c3-p1', target: 1, dice: { raid: 1 } } });
  return dispatch(ix, s, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: [], buildingHits: [0], ransack } });
}

describe('provoking outrage', () => {
  it('the destroyer discards resources and Guild cards of the planet type and is Outraged', () => {
    const s = destroy(ready());
    const p = s.players[0];
    expect(heldResources(p)).toEqual([OTHER]);
    expect(p.court).toEqual([GUILD_OF(OTHER)]);
    expect(s.courtDiscard).toContain(GUILD_OF(PLANET));
    expect(p.outraged).toEqual([PLANET]);
    expect(p.supply.agents).toBe(9);
  });

  it('a second Outrage of the same type discards again but places no agent', () => {
    const s0 = ready();
    s0.players[0].outraged = [PLANET];
    const s = destroy(s0);
    expect(s.players[0].outraged).toEqual([PLANET]);
    expect(s.players[0].supply.agents).toBe(10);
    expect(heldResources(s.players[0])).toEqual([OTHER]);
  });

  it('an Outraged resource cannot be spent in the prelude', () => {
    const cc = content();
    const ix2 = index(cc);
    let s = game(ix2, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitA-2'], ['suitA-4']]);
    s.players[0].resources = ['fuel'];
    s.players[0].outraged = ['fuel'];
    s = dispatch(ix2, s, { type: 'lead', player: 0, card: 'suitA-2' });
    expect(() =>
      dispatch(ix2, s, { type: 'prelude', player: 0, resource: 'fuel', action: { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 1 } }),
    ).toThrow(/Outraged/);
  });
});

describe('ransacking the Court', () => {
  it('takes a card holding the defender’s agents; Rival agents become trophies', () => {
    const s0 = ready();
    s0.court[2].agents = { 1: 1, 2: 2, 0: 1 };
    const card = s0.court[2].card;
    const next = s0.courtDeck[0];
    const s = destroy(s0, [2]);
    const p = s.players[0];
    expect(p.trophies.map((t) => t.owner)).toEqual([1, 1, 2, 2]); // the city, then P1's agent and P2's two agents
    expect(p.captives).toEqual([]);
    expect(p.supply.agents).toBe(10 - 1 + 1); // Outrage agent placed, own agent returned
    expect(card.startsWith('faction') ? p.court : s.courtDiscard).toContain(card);
    expect(s.court[2].card).toBe(next);
  });

  it('a choice is required when a card holds the defender’s agents', () => {
    const s0 = ready();
    s0.court[0].agents = { 1: 1 };
    expect(() => destroy(s0)).toThrow(/Choose a Court card to Ransack/);
  });

  it('the chosen card must hold the defender’s agents', () => {
    const s0 = ready();
    s0.court[0].agents = { 1: 1 };
    s0.court[1].agents = { 2: 1 };
    expect(() => destroy(s0, [1])).toThrow(/none of P1/);
  });

  it('no Ransack when no card holds the defender’s agents', () => {
    const s = destroy(ready());
    expect(s.players[0].trophies.map((t) => t.owner)).toEqual([1]);
  });
});

describe('rulebook raid example', () => {
  it('2 keys steal the Material and the Weapon in the 1-key slots, not the Relic in the 3-key slot', () => {
    const cc = content();
    cc.dice.raid = [{ key: 2 }];
    cc.playerBoard.slotKeys = [3, 1, 1, 2, 1, 3];
    const ix2 = index(cc);
    let s = game(ix2, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitB-2'], ['suitA-4']]);
    s.map['c3-p2'].ships = { 0: { fresh: 1, damaged: 0 } };
    s.map['c3-p2'].buildings = [{ owner: 1, type: 'starport', damaged: false }];
    s.players[1].resources = ['relic', 'material', 'weapons'];
    s.players[0].resources = [];
    s.players[0].supply.cities = 3; // 2 cities built: 4 open slots for the loot
    s = dispatch(ix2, s, { type: 'lead', player: 0, card: 'suitB-2' });
    s = dispatch(ix2, s, { type: 'action', player: 0, action: { kind: 'battle', system: 'c3-p2', target: 1, dice: { raid: 1 } } });
    expect(() =>
      dispatch(ix2, s, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: [], buildingHits: [], raid: [{ resource: 0 }] } }),
    ).toThrow(/costs 3 keys, only 2/);
    s = dispatch(ix2, s, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: [], buildingHits: [], raid: [{ resource: 1 }, { resource: 2 }] } });
    expect(heldResources(s.players[0])).toEqual(['material', 'weapons']);
    expect(heldResources(s.players[1])).toEqual(['relic']);
  });
});
