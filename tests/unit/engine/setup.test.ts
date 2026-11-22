import { describe, expect, it } from 'vitest';
import { indexContent, newGame } from '../../../src/game/engine';
import { content, game, index } from './fixture';

describe('setup', () => {
  it('filters 4-player-only cards out of 2 and 3 player decks', () => {
    const ix = index();
    for (const n of [2, 3] as const) {
      const s = game(ix, n);
      const all = [...s.deck, ...s.players.flatMap((p) => p.hand)];
      expect(all.some((id) => /-(1|7)$/.test(id))).toBe(false);
      expect(all).toHaveLength(20);
    }
    const s4 = game(ix, 4);
    expect([...s4.deck, ...s4.players.flatMap((p) => p.hand)]).toHaveLength(28);
  });

  it('deals hand size and reveals the court for the player count', () => {
    const ix = index();
    const s = game(ix, 3);
    for (const p of s.players) expect(p.hand).toHaveLength(6);
    expect(s.court).toHaveLength(4);
    expect(s.chapter).toBe(1);
    expect(s.phase).toEqual({ type: 'lead' });
  });

  it('applies cluster, system and link exclusions', () => {
    const ix = index();
    const s = newGameWith(ix, 3, 'setup-3a');
    expect(s.map['c6-p1'].inPlay).toBe(false);
    expect(s.map['c2-p3'].inPlay).toBe(false); // from the setup card
    expect(s.map['c5-p1'].inPlay).toBe(true);
    expect(s.closedLinks).toContainEqual(['c4-gate', 'c5-gate']);
  });

  it('places asymmetric starting pieces and takes them from supply', () => {
    const ix = index();
    const s = newGameWith(ix, 2, 'setup-2a');
    expect(s.map['c1-p1'].ships[0]).toEqual({ fresh: 3, damaged: 0 });
    expect(s.map['c3-p2'].buildings).toEqual([{ owner: 1, type: 'starport', damaged: false }]);
    expect(s.players[0].supply.ships).toBe(15 - 6);
  });

  it('is deterministic per seed', () => {
    const ix = index();
    expect(game(ix, 4, 42)).toEqual(game(ix, 4, 42));
    expect(game(ix, 4, 42).deck).not.toEqual(game(ix, 4, 43).deck);
  });

  it('rejects content with broken references', () => {
    const c = content();
    c.map.links.push(['nowhere', 'c1-gate']);
    expect(() => indexContent(c)).toThrow(/unknown system/);
  });
});

function newGameWith(ix: ReturnType<typeof index>, n: 2 | 3 | 4, setupCardId: string) {
  return newGame(ix, { playerCount: n, seed: 1, setupCardId, firstPlayer: 0 });
}

describe('court card sets', () => {
  function withCampaign() {
    const c = content();
    c.courtCards.push({ id: 'camp-1', kind: 'faction', resource: 'fuel', keys: 2, set: 'campaign' });
    return indexContent(c);
  }
  const all = (s: ReturnType<typeof newGame>) => [...s.courtDeck, ...s.court.map((x) => x.card)];

  it('a normal game leaves campaign Court cards out', () => {
    const s = newGame(withCampaign(), { playerCount: 3, seed: 1 });
    expect(all(s)).not.toContain('camp-1');
  });

  it('chosen sets add their Court cards to the deck', () => {
    const s = newGame(withCampaign(), { playerCount: 3, seed: 1, courtSets: ['base', 'campaign'] });
    expect(all(s)).toContain('camp-1');
  });
});
