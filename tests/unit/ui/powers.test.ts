// Card powers offered by the table (src/ui/table/decide.ts cardPowers): the
// "Prelude:" abilities and new actions of the cards a player holds, found by
// trying candidate choices against the engine, on the card test content.
import { describe, expect, it } from 'vitest';
import { dispatch } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { cardPowers } from '../../../src/ui/table/decide';
import { cardsIndex, runAll, start } from '../cards/fixture';

describe('cardPowers', () => {
  const ix = cardsIndex();

  /** P0 holds `cards` and has just led, so the prelude is open. */
  function holding(cards: string[], setup: (s: GameState) => void = () => {}): GameState {
    const s = start(ix);
    s.players[0].court = cards;
    setup(s);
    return runAll(ix, s, [{ type: 'lead', player: 0, card: 'suitC-2' }]);
  }

  it('offers a discard ability with no choice as a single use', () => {
    const s = holding(['g:court-23']);
    const opts = cardPowers(ix, s, 0).filter((o) => o.ability === 'supplies');
    expect(opts).toHaveLength(1);
    expect(opts[0].kind).toBe('prelude');
    expect(opts[0].parts).toEqual([]);
  });

  it('offers one option per legal choice, each accepted by the engine', () => {
    const s = holding(['g:court-24'], (x) => {
      x.players[0].resources = ['material', 'fuel'];
    });
    const opts = cardPowers(ix, s, 0).filter((o) => o.ability === 'exchange');
    expect(opts.map((o) => o.parts.find((p) => p.key === 'slot')?.value).sort()).toEqual([0, 1]);
    for (const o of opts) expect(() => dispatch(ix, s, o.cmd)).not.toThrow();
  });

  it('offers a steal from each Rival resource and nothing when Rivals have none', () => {
    const rich = holding(['g:court-20'], (x) => {
      x.players[1].resources = ['relic'];
    });
    expect(cardPowers(ix, rich, 0).filter((o) => o.ability === 'steal').length).toBeGreaterThan(0);
    const poor = holding(['g:court-20'], (x) => {
      x.players[1].resources = [];
      x.players[1].court = [];
    });
    expect(cardPowers(ix, poor, 0).filter((o) => o.ability === 'steal')).toEqual([]);
  });

  it('offers new card actions while the turn has pips left', () => {
    const s = holding(['g:court-12'], (x) => {
      x.players[0].captives = [1, 1];
    });
    // The led card's suit gives Build: the Build action is offered, the Influence one is not.
    const powers = cardPowers(ix, s, 0);
    const ransom = powers.filter((o) => o.ability === 'ransom');
    expect(new Set(ransom.map((o) => (o.parts.find((p) => p.key === 'resources')?.value as string[]).length))).toEqual(new Set([1, 2]));
    expect(ransom.every((o) => o.kind === 'action')).toBe(true);
    expect(powers.some((o) => o.ability === 'execute')).toBe(false);
  });

  it('offers Ransom with any mix of resources, one per Captive', () => {
    const s = holding(['g:court-12'], (x) => {
      x.players[0].captives = [1, 1];
    });
    const sets = cardPowers(ix, s, 0)
      .filter((o) => o.ability === 'ransom')
      .map((o) => [...(o.parts.find((p) => p.key === 'resources')?.value as string[])].sort().join('+'));
    expect(sets).toContain('fuel+material');
  });

  /** P0 holds `lore` and leads an Aggression card (Move, Battle); P0 ships at `a`, P1 ships at `b` (adjacent). */
  function aggression(lore: string, place: (s: GameState, a: string, b: string) => void): { s: GameState; a: string; b: string } {
    let s = start(ix, [['suitB-2'], ['suitB-4']]);
    const [a, b] = ix.content.map.links.find(([x, y]) => s.map[x]?.inPlay && s.map[y]?.inPlay)!;
    s.players[0].lore = [lore];
    place(s, a, b);
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' });
    return { s, a, b };
  }

  it('offers Galactic Rifles at a Rival in an adjacent system', () => {
    const { s, a, b } = aggression('l:lore-02', (x, a, b) => {
      x.map[a].ships = { 0: { fresh: 2, damaged: 0 } };
      x.map[b].ships = { 1: { fresh: 1, damaged: 0 } };
    });
    const opts = cardPowers(ix, s, 0).filter((o) => o.ability === 'rifles');
    expect(opts.map((o) => Object.fromEntries(o.parts.map((p) => [p.key, p.value])))).toContainEqual({ system: a, at: b, target: 1 });
  });

  it('offers Survival Overrides against a Rival ship, not only on your own', () => {
    const { s, a } = aggression('l:lore-18', (x, a) => {
      x.map[a].ships = { 0: { fresh: 1, damaged: 0 }, 1: { fresh: 0, damaged: 1 } };
    });
    const opts = cardPowers(ix, s, 0).filter((o) => o.ability === 'martyr');
    expect(opts.some((o) => o.parts.some((p) => p.key === 'target' && p.value === 1) && o.parts.some((p) => p.key === 'damaged'))).toBe(true);
  });

  it('offers Force Beams moving ships to an adjacent system from your fresh starport', () => {
    const { s, a, b } = aggression('l:lore-16', (x, a) => {
      x.map[a].buildings = [{ owner: 0, type: 'starport', damaged: false }];
      x.map[a].ships = { 1: { fresh: 2, damaged: 0 } };
    });
    const opts = cardPowers(ix, s, 0).filter((o) => o.ability === 'guide');
    expect(opts.some((o) => o.parts.some((p) => p.key === 'from' && p.value === a) && o.parts.some((p) => p.key === 'to' && p.value === b))).toBe(true);
  });

  it('offers nothing outside the holder turn', () => {
    const s = holding(['g:court-23']);
    expect(cardPowers(ix, s, 1)).toEqual([]);
  });
});
