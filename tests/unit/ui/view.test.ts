// Table view selectors (src/ui/table/view.ts) and the proposed battle
// allocation (src/ui/table/battle.ts), on the placeholder content.
import { describe, expect, it } from 'vitest';
import { activePlayer, dispatch, RESOURCES } from '../../../src/game/engine';
import { legal, othersTurn, rivalsOf, tableView } from '../../../src/ui/table/view';
import { defaultAllocation } from '../../../src/ui/table/battle';
import { game, index } from '../engine/fixture';

describe('rivalsOf', () => {
  it('lists the other seats clockwise from the local one', () => {
    expect(rivalsOf(4, 0)).toEqual([1, 2, 3]);
    expect(rivalsOf(4, 2)).toEqual([3, 0, 1]);
    expect(rivalsOf(2, 1)).toEqual([0]);
  });
});

describe('tableView', () => {
  const ix = index();

  it('shows the local hand and only counts for rivals', () => {
    const s = game(ix, 3, 7, 0);
    const v = tableView(ix, s, 1);
    expect(v.local).toBe(1);
    expect(v.rivals).toEqual([2, 0]);
    expect(v.hand.map((h) => h.card)).toEqual(s.players[1].hand);
    expect(v.players[0].handCount).toBe(s.players[0].hand.length);
    expect(JSON.stringify(v.players)).not.toContain(s.players[0].hand[0]);
  });

  it('mirrors the general supply for every resource', () => {
    const s = game(ix, 3, 7, 0);
    const v = tableView(ix, s, 0);
    expect(v.supply.map((x) => x.resource)).toEqual([...RESOURCES]);
    for (const x of v.supply) expect(x.count).toBe(s.resourceSupply[x.resource]);
  });

  it('marks board slots locked from the engine, one per printed slot', () => {
    const s = game(ix, 3, 7, 0);
    const v = tableView(ix, s, 0);
    const slots = v.players[0].slots;
    expect(slots).toHaveLength(ix.content.playerBoard.slotKeys.length);
    for (const i of ix.content.playerBoard.baseSlots) expect(slots[i].locked).toBe(false);
    expect(slots.some((x) => x.locked)).toBe(true);
  });

  it('lets only the player with initiative play cards when leading', () => {
    const s = game(ix, 3, 7, 0);
    expect(s.phase.type).toBe('lead');
    const leader = activePlayer(s)!;
    const mine = tableView(ix, s, leader);
    expect(mine.hand.some((h) => h.playable)).toBe(true);
    const other = tableView(ix, s, (leader + 1) % 3);
    expect(other.hand.every((h) => !h.playable)).toBe(true);
  });

  it('shows the lead card and the action budget after leading', () => {
    let s = game(ix, 3, 7, 0);
    const p = activePlayer(s)!;
    const card = s.players[p].hand[0];
    s = dispatch(ix, s, { type: 'lead', player: p, card });
    const v = tableView(ix, s, p);
    expect(v.lead?.card).toBe(card);
    expect(v.lead?.kinds).toEqual(ix.content.suits[ix.actionCards.get(card)!.suit]);
    expect(v.budget?.remaining).toBe(ix.actionCards.get(card)!.pips);
    expect(v.budget?.preludeOpen).toBe(true);
    expect(tableView(ix, s, (p + 1) % 3).budget).toBeNull();
  });

  it('sorts ambition tallies highest first', () => {
    const s = game(ix, 3, 7, 0);
    s.players[2].captives = [0, 1];
    s.players[1].captives = [0];
    const row = tableView(ix, s, 0).ambitions.find((a) => a.id === 'captives')!;
    expect(row.tallies.map((t) => t.player)).toEqual([2, 1, 0]);
    expect(row.tallies.map((t) => t.value)).toEqual([2, 1, 0]);
  });

  it('ranks first and second place as if the chapter ended now', () => {
    const s = game(ix, 3, 7, 0);
    s.players[2].captives = [0, 1];
    s.players[1].captives = [0];
    const row = tableView(ix, s, 0).ambitions.find((a) => a.id === 'captives')!;
    expect(row.first).toEqual([2]);
    expect(row.second).toEqual([1]);
  });

  it('lists every system with its pieces, out-of-play ones flagged', () => {
    const s = game(ix, 2, 7, 0);
    const v = tableView(ix, s, 0);
    expect(v.systems).toHaveLength(ix.content.map.systems.length);
    const withShips = v.systems.filter((x) => x.ships.length > 0);
    expect(withShips.length).toBeGreaterThan(0);
    for (const sys of v.systems) expect(sys.inPlay).toBe(s.map[sys.id].inPlay);
  });

  it('gives each system its controller and its linked neighbours', () => {
    const s = game(ix, 3, 7, 0);
    const [a, b] = ix.content.map.links.find(([x, y]) => s.map[x].inPlay && s.map[y].inPlay)!;
    s.map[a].ships = { 1: { fresh: 2, damaged: 0 }, 2: { fresh: 1, damaged: 3 } };
    const sys = tableView(ix, s, 0).systems.find((x) => x.id === a)!;
    expect(sys.controller).toBe(1);
    expect(sys.neighbors).toContain(b);
  });

  it('legal() answers from the engine without changing the state', () => {
    const s = game(ix, 3, 7, 0);
    const before = JSON.stringify(s);
    const p = activePlayer(s)!;
    expect(legal(ix, s, { type: 'lead', player: p, card: s.players[p].hand[0] })).toBe(true);
    expect(legal(ix, s, { type: 'lead', player: (p + 1) % 3, card: s.players[(p + 1) % 3].hand[0] })).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('othersTurn', () => {
  const ix = index();

  it('names the next seat while the leader chooses', () => {
    const s = game(ix, 3, 7, 0);
    const p = activePlayer(s)!;
    const o = othersTurn(s)!;
    expect(o.player).toBe(p);
    expect(o.next).toBe((p + 1) % 3);
    expect(o.remaining).toBeNull();
  });

  it('shows the actions left and only the latest lines of the acting seat', () => {
    let s = game(ix, 3, 7, 0);
    const p = activePlayer(s)!;
    s = dispatch(ix, s, { type: 'lead', player: p, card: s.players[p].hand[0] });
    const o = othersTurn(s)!;
    expect(o.remaining).toBe(ix.actionCards.get(s.round.plays[0].card!)!.pips);
    expect(o.live.length).toBeGreaterThan(0);
    for (const l of o.live) expect(l.startsWith(`P${p} `)).toBe(true);
  });

  it('says the round ends after the last follower', () => {
    let s = game(ix, 2, 7, 0);
    const p = activePlayer(s)!;
    s = dispatch(ix, s, { type: 'lead', player: p, card: s.players[p].hand[0] });
    s = dispatch(ix, s, { type: 'endTurn', player: p });
    const o = othersTurn(s)!;
    expect(o.player).toBe((p + 1) % 2);
    expect(o.next).toBeNull();
  });
});

describe('defaultAllocation', () => {
  const ix = index();

  it('puts hits on fresh defender ships first, then damaged ones', () => {
    const s = game(ix, 2, 7, 0);
    const sys = Object.keys(s.map).find((k) => s.map[k].inPlay)!;
    s.map[sys].ships = { 0: { fresh: 2, damaged: 0 }, 1: { fresh: 1, damaged: 1 } };
    s.map[sys].buildings = [];
    const al = defaultAllocation(s, {
      attacker: 0,
      target: 1,
      system: sys,
      totals: { hit: 3, selfHit: 1, buildingHit: 0, key: 0, intercept: 0 },
      interceptHits: 0,
    });
    expect(al.selfHits).toEqual(['fresh']);
    expect(al.hits).toEqual(['fresh', 'damaged', 'damaged']);
    expect(al.buildingHits).toEqual([]);
  });

  it('hits buildings once the defender has no ships', () => {
    const s = game(ix, 2, 7, 0);
    const sys = Object.keys(s.map).find((k) => s.map[k].inPlay)!;
    s.map[sys].ships = { 0: { fresh: 1, damaged: 0 } };
    s.map[sys].buildings = [{ owner: 1, type: 'city', damaged: false }];
    const al = defaultAllocation(s, {
      attacker: 0,
      target: 1,
      system: sys,
      totals: { hit: 1, selfHit: 0, buildingHit: 0, key: 0, intercept: 0 },
      interceptHits: 0,
    });
    expect(al.hits).toEqual([{ building: 0 }]);
  });
});
