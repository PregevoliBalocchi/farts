// Setup per the rulebook: seats from initiative, starting resources, supply, 2-player rules (design/gdd/core-loop.md §3.2).
import { describe, expect, it } from 'vitest';
import { dispatch, heldResources, indexContent, newGame, RuleError } from '../../../src/game/engine';
import type { GameContent } from '../../../src/game/engine';
import { content } from './fixture';

/** Example content plus an A/B/C setup card for 2 players with cluster c2 out of play. */
function slotContent(): GameContent {
  const c = content();
  c.map.exclusions = {}; // only the setup card excludes, as in the real content
  c.setupCards.push({
    id: 'slots-2',
    playerCount: 2,
    seats: [
      [{ system: 'c1-p1', slot: 'A' }, { system: 'c1-p2', slot: 'B' }, { system: 'c1-gate', slot: 'C' }],
      [{ system: 'c3-p1', slot: 'A' }, { system: 'c3-p2', slot: 'B' }, { system: 'c3-gate', slot: 'C' }],
    ],
    exclusions: { clusters: ['c2'] },
  });
  return c;
}

describe('setup seats', () => {
  it('setup-card player 1 is the initiative holder, then clockwise', () => {
    const ix = indexContent(slotContent());
    const s = newGame(ix, { playerCount: 2, seed: 1, setupCardId: 'slots-2', firstPlayer: 1 });
    expect(s.map['c1-p1'].buildings).toEqual([{ owner: 1, type: 'city', damaged: false }]);
    expect(s.map['c3-p1'].buildings).toEqual([{ owner: 0, type: 'city', damaged: false }]);
  });
});

describe('starting resources', () => {
  it('base game: the A planet resource, then the B planet resource', () => {
    const c = slotContent();
    const ix = indexContent(c);
    const s = newGame(ix, { playerCount: 2, seed: 1, setupCardId: 'slots-2', firstPlayer: 0 });
    const res = (id: string) => c.map.systems.find((x) => x.id === id)!.resource;
    expect(s.players[0].resources).toEqual([res('c1-p1'), res('c1-p2')]);
    expect(s.players[1].resources).toEqual([res('c3-p1'), res('c3-p2')]);
  });

  it('leaders variant: the character card resources', () => {
    const c = slotContent();
    c.leaders = [
      { id: 'lx', setup: c.baseSetupPieces!, resources: ['relic', 'relic'] },
      { id: 'ly', setup: c.baseSetupPieces!, resources: ['fuel', 'weapons'] },
    ];
    const s = newGame(indexContent(c), { playerCount: 2, seed: 1, variant: 'leaders', setupCardId: 'slots-2', firstPlayer: 0, leaders: ['lx', 'ly'] });
    expect(heldResources(s.players[0])).toEqual(['relic', 'relic']);
    expect(heldResources(s.players[1])).toEqual(['fuel', 'weapons']);
  });

  it('the leaders variant needs character cards', () => {
    const c = slotContent();
    delete c.leaders;
    expect(() => newGame(indexContent(c), { playerCount: 2, seed: 1, variant: 'leaders', setupCardId: 'slots-2' })).toThrow(/Not enough leaders/);
  });
});

describe('resource supply', () => {
  it('starting resources and 2-player ambition boxes come out of the 5-per-type supply', () => {
    const c = slotContent();
    const s = newGame(indexContent(c), { playerCount: 2, seed: 1, setupCardId: 'slots-2', firstPlayer: 0 });
    const onBoards = s.players.flatMap(heldResources).length;
    const onBoxes = Object.values(s.ambitionBoxes).flat().length;
    const left = Object.values(s.resourceSupply).reduce((x, y) => x + y, 0);
    expect(onBoxes).toBe(3); // the 3 planets of out-of-play cluster c2
    expect(left + onBoards + onBoxes).toBe(25);
  });

  it('taxing with an empty supply gains nothing', () => {
    const c = slotContent();
    const ix = indexContent(c);
    let s = newGame(ix, { playerCount: 2, seed: 1, setupCardId: 'slots-2', firstPlayer: 0 });
    const r = c.map.systems.find((x) => x.id === 'c1-p1')!.resource!;
    s.resourceSupply[r] = 0;
    s.players[0].hand = ['suitA-2'];
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-2' });
    const before = heldResources(s.players[0]).length;
    s = dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'tax', system: 'c1-p1' } });
    expect(heldResources(s.players[0]).length).toBe(before);
    expect(s.log.at(-1)!.text).toMatch(/gains nothing/);
  });

  it('a token spent in the prelude returns to the supply when the prelude ends', () => {
    const c = slotContent();
    const ix = indexContent(c);
    let s = newGame(ix, { playerCount: 2, seed: 1, setupCardId: 'slots-2', firstPlayer: 0 });
    s.players[0].resources = ['fuel'];
    s.players[0].hand = ['suitA-2'];
    const before = s.resourceSupply.fuel;
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-2' });
    s = dispatch(ix, s, { type: 'prelude', player: 0, resource: 'fuel', action: { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 1 } });
    // Not yet: spent resources reach the supply when the prelude ends.
    expect(s.resourceSupply.fuel).toBe(before);
    s = dispatch(ix, s, { type: 'endTurn', player: 0 });
    expect(s.resourceSupply.fuel).toBe(before + 1);
  });
});

describe('2-player mulligan', () => {
  it('the player without initiative may redraw the first hand once', () => {
    const ix = indexContent(slotContent());
    const s = newGame(ix, { playerCount: 2, seed: 1, setupCardId: 'slots-2', firstPlayer: 0 });
    const old = [...s.players[1].hand];
    const after = dispatch(ix, s, { type: 'mulligan', player: 1 });
    expect(after.players[1].hand).toHaveLength(6);
    expect(after.players[1].hand.some((id) => old.includes(id))).toBe(false);
    expect(after.discard).toEqual(old);
    expect(() => dispatch(ix, after, { type: 'mulligan', player: 1 })).toThrow(RuleError);
  });

  it('the initiative holder cannot redraw, and nobody can after the first lead', () => {
    const ix = indexContent(slotContent());
    const s = newGame(ix, { playerCount: 2, seed: 1, setupCardId: 'slots-2', firstPlayer: 0 });
    expect(() => dispatch(ix, s, { type: 'mulligan', player: 0 })).toThrow(/cannot redraw/);
    const led = dispatch(ix, s, { type: 'lead', player: 0, card: s.players[0].hand[0] });
    expect(() => dispatch(ix, led, { type: 'mulligan', player: 1 })).toThrow(/cannot redraw/);
  });

  it('there is no redraw with more than 2 players', () => {
    const ix = indexContent(content());
    const s = newGame(ix, { playerCount: 3, seed: 1, firstPlayer: 0 });
    expect(s.mulligan).toBeNull();
  });
});
