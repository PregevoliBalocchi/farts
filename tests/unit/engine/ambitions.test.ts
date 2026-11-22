import { describe, expect, it } from 'vitest';
import { boxMetric, emptyAmbitionBoard, markerValues, rankAmbition, rollDice, scoreAmbitions, totalFaces } from '../../../src/game/engine';
import { content, game, index } from './fixture';

const c = content();
const ix = index(c);

function withWealth(n: 2 | 3 | 4, wealth: number[]) {
  const s = game(ix, n);
  s.players.forEach((p, i) => (p.resources = Array(wealth[i]).fill('fuel')));
  return s;
}

describe('ambition ranking', () => {
  it('awards first and second by metric', () => {
    expect(rankAmbition(c, withWealth(3, [1, 3, 2]), 'wealth')).toMatchObject({ first: [1], second: [2] });
  });

  it('tie for first drops tied players to second', () => {
    expect(rankAmbition(c, withWealth(3, [3, 3, 1]), 'wealth')).toMatchObject({ first: [], second: [0, 1] });
  });

  it('tie for second awards nobody second', () => {
    expect(rankAmbition(c, withWealth(4, [4, 2, 2, 0]), 'wealth')).toMatchObject({ first: [0], second: [] });
  });

  it('a zero metric never places', () => {
    expect(rankAmbition(c, withWealth(3, [2, 0, 0]), 'wealth')).toMatchObject({ first: [0], second: [] });
  });

  it('two players: the ambition box counts as a third player', () => {
    const s = withWealth(2, [3, 1]);
    s.ambitionBoxes = { wealth: ['material', 'fuel'] };
    // Box (id 2) has 2 and takes second place; it gains nothing.
    expect(rankAmbition(c, s, 'wealth')).toMatchObject({ first: [0], second: [2], metrics: [3, 1, 2] });
    s.ambitionBoxes = {};
    expect(rankAmbition(c, s, 'wealth')).toMatchObject({ first: [0], second: [1] });
  });

  it('two players: the box can take first place, leaving the players second at best', () => {
    const s = withWealth(2, [1, 0]);
    s.ambitionBoxes = { wealth: ['fuel', 'fuel'] };
    s.ambitions.declared.wealth = ['m-high'];
    s.chapter = 1;
    expect(scoreAmbitions(c, s).gains).toEqual([3, 0]);
  });

  it('two players: Weapons on the Warlord box count as trophies', () => {
    const s = withWealth(2, [0, 0]);
    s.ambitionBoxes = { trophies: ['weapons'] };
    expect(boxMetric(c, s, 'trophies')).toBe(1);
  });

  it('sums every marker on an ambition using the chapter side', () => {
    const s = withWealth(3, [1, 3, 2]);
    s.ambitions.declared.wealth = ['m-high', 'm-low'];
    s.chapter = 4; // side 1: high 9/4, low 4/2
    const { gains } = scoreAmbitions(c, s);
    expect(gains).toEqual([0, 13, 6]);
    expect(s.players[1].power).toBe(13);
  });
});

describe('dice', () => {
  it('rolls are reproducible from the rng state', () => {
    const a = rollDice(c, { rngState: 99 }, { skirmish: 3, assault: 2, raid: 1 });
    const b = rollDice(c, { rngState: 99 }, { skirmish: 3, assault: 2, raid: 1 });
    expect(a).toEqual(b);
    expect(a.faces).toHaveLength(6);
  });

  it('totals add every symbol', () => {
    expect(totalFaces([{ hit: 2, selfHit: 1 }, { key: 1 }, {}])).toEqual({ hit: 2, selfHit: 1, buildingHit: 0, key: 1, intercept: 0 });
  });
});

describe('ambition markers by chapter', () => {
  const table: [number, [number, number][]][] = [
    [1, [[2, 0], [3, 2], [5, 3]]],
    [2, [[4, 2], [3, 2], [5, 3]]],
    [3, [[4, 2], [6, 3], [5, 3]]],
    [4, [[4, 2], [6, 3], [9, 4]]],
    [5, [[4, 2], [6, 3], [9, 4]]],
  ];
  for (const [chapter, values] of table) {
    it(`chapter ${chapter} markers show low/mid/high ${values.map((v) => v.join('/')).join(', ')}`, () => {
      const got = ['m-low', 'm-mid', 'm-high'].map((id) => markerValues(c, id, chapter)).map((v) => [v.first, v.second]);
      expect(got).toEqual(values);
    });
  }

  it('declaring takes the marker worth most this chapter', () => {
    expect(emptyAmbitionBoard(c, 1).available).toEqual(['m-high', 'm-mid', 'm-low']);
    expect(emptyAmbitionBoard(c, 3).available).toEqual(['m-mid', 'm-high', 'm-low']);
    expect(emptyAmbitionBoard(c, 4).available).toEqual(['m-high', 'm-mid', 'm-low']);
  });
});
