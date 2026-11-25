// Chapter cleanup and 2-player mulligans (design/gdd/core-loop.md §3.8).
import { describe, expect, it } from 'vitest';
import { dispatch, heldResources } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { game, index, playRoundCopying } from './fixture';

const ix = index();

/** Ends chapter 1 of `s` with `declare` declared, by having everyone pass. */
function endChapter(s: GameState, declare?: 'trophies' | 'captives'): GameState {
  if (declare) s.ambitions.declared[declare] = ['m-high'];
  const holders = s.players.filter((p) => p.hand.length).map((p) => p.id);
  let cur = s;
  for (let i = 0; i < holders.length; i++) cur = dispatch(ix, cur, { type: 'pass', player: cur.initiative });
  return cur;
}

describe('cleanup', () => {
  it('scoring Warlord returns every trophy to its owner', () => {
    const s = game(ix, 3, 7, 0);
    s.players[0].trophies = [{ owner: 1, piece: 'ship' }, { owner: 2, piece: 'agent' }, { owner: 1, piece: 'starport' }];
    const ships = s.players[1].supply.ships, agents = s.players[2].supply.agents, ports = s.players[1].supply.starports;
    const after = endChapter(s, 'trophies');
    expect(after.players[0].trophies).toEqual([]);
    expect(after.players[1].supply.ships).toBe(ships + 1);
    expect(after.players[1].supply.starports).toBe(ports + 1);
    expect(after.players[2].supply.agents).toBe(agents + 1);
  });

  it('a returned city covers a resource slot again', () => {
    const s = game(ix, 3, 7, 0);
    // P1 has 2 cities built (slots 0-3 open) and a token on slot 3; one of its cities is a trophy of P0.
    s.players[1].supply.cities = 3;
    s.players[1].resources = ['fuel', 'fuel', 'fuel', 'relic'];
    s.players[0].trophies = [{ owner: 1, piece: 'city' }];
    const after = endChapter(s, 'trophies');
    expect(after.players[1].supply.cities).toBe(4);
    expect(heldResources(after.players[1])).toEqual(['fuel', 'fuel', 'fuel']);
  });

  it('trophies stay when Warlord was not scored', () => {
    const s = game(ix, 3, 7, 0);
    s.players[0].trophies = [{ owner: 1, piece: 'ship' }];
    expect(endChapter(s).players[0].trophies).toHaveLength(1);
  });

  it('scoring Tyrant returns every captive to its owner', () => {
    const s = game(ix, 3, 7, 0);
    s.players[0].captives = [1, 1, 2];
    const a1 = s.players[1].supply.agents, a2 = s.players[2].supply.agents;
    const after = endChapter(s, 'captives');
    expect(after.players[0].captives).toEqual([]);
    expect(after.players[1].supply.agents).toBe(a1 + 2);
    expect(after.players[2].supply.agents).toBe(a2 + 1);
  });
});

describe('2-player mulligan every chapter', () => {
  it('the player without initiative may redraw again in chapter 2', () => {
    let s = game(ix, 2, 7, 0, 'setup-2a');
    for (let r = 0; r < 6 && s.chapter === 1; r++) s = playRoundCopying(ix, s);
    expect(s.chapter).toBe(2);
    const other = (s.initiative + 1) % 2;
    expect(s.mulligan).toBe(other);
    const after = dispatch(ix, s, { type: 'mulligan', player: other });
    expect(after.players[other].hand).toHaveLength(6);
  });
});

describe('power by chapter', () => {
  it('keeps the Power totals of every seat after each chapter, for the end screen', () => {
    const s = game(ix, 3, 7, 0);
    s.players[0].trophies = [{ owner: 1, piece: 'ship' }];
    const after = endChapter(s, 'trophies');
    expect(after.powerByChapter).toEqual([after.players.map((p) => p.power)]);
    expect(after.powerByChapter![0][0]).toBeGreaterThan(0);
  });
});
