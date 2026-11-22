// Leaders & Lore draft (design/gdd/core-loop.md §3.2).
import { describe, expect, it } from 'vitest';
import { activePlayer, dispatch, heldResources, indexContent, newGame } from '../../../src/game/engine';
import type { GameContent, GameState } from '../../../src/game/engine';
import { content, run } from './fixture';

/** Example content with 6 leaders (standard pieces, distinct resources) and 6 lore cards. */
function leadersContent(): GameContent {
  const c = content();
  c.map.exclusions = {};
  const res = ['fuel', 'material', 'weapons', 'relic', 'psionic', 'fuel'] as const;
  c.leaders = res.map((r, i) => ({ id: `ld-${i}`, setup: c.baseSetupPieces!, resources: [r, 'material'] }));
  c.loreCards = Array.from({ length: 6 }, (_, i) => ({ id: `lore-${i}` }));
  c.setupCards.push({
    id: 'slots-3',
    playerCount: 3,
    seats: [
      [{ system: 'c1-p1', slot: 'A' }, { system: 'c1-p2', slot: 'B' }, { system: 'c1-gate', slot: 'C' }],
      [{ system: 'c3-p1', slot: 'A' }, { system: 'c3-p2', slot: 'B' }, { system: 'c3-gate', slot: 'C' }],
      [{ system: 'c5-p1', slot: 'A' }, { system: 'c5-p2', slot: 'B' }, { system: 'c5-gate', slot: 'C' }],
    ],
  });
  return c;
}

function draftGame(): [ReturnType<typeof indexContent>, GameState] {
  const ix = indexContent(leadersContent());
  return [ix, newGame(ix, { playerCount: 3, seed: 4, variant: 'leaders', setupCardId: 'slots-3', firstPlayer: 0 })];
}

describe('Leaders & Lore draft', () => {
  it('lays out players+1 leaders and lore cards and waits in the draft phase', () => {
    const [, s] = draftGame();
    expect(s.phase).toEqual({ type: 'draft' });
    expect(s.draft!.leaders).toHaveLength(4);
    expect(s.draft!.lore).toHaveLength(4);
    expect(s.chapter).toBe(0);
  });

  it('picks go counterclockwise from the player to the right of the initiative holder', () => {
    const [, s] = draftGame();
    // initiative P0, 3 players: P2, P1, P0, then again P2, P1, P0
    expect(s.draft!.order).toEqual([2, 1, 0, 2, 1, 0]);
    expect(activePlayer(s)).toBe(2);
  });

  it('a player cannot take a second leader or a second lore card', () => {
    const [ix, s] = draftGame();
    const d = s.draft!;
    let st = dispatch(ix, s, { type: 'draft', player: 2, card: d.leaders[0] });
    st = run(ix, st, [
      { type: 'draft', player: 1, card: st.draft!.lore[0] },
      { type: 'draft', player: 0, card: st.draft!.leaders[0] },
    ]);
    expect(() => dispatch(ix, st, { type: 'draft', player: 2, card: st.draft!.leaders[0] })).toThrow(/already have a leader/);
  });

  it('other actions wait for the draft to finish', () => {
    const [ix, s] = draftGame();
    expect(() => dispatch(ix, s, { type: 'pass', player: 2 })).toThrow(/draft/);
  });

  it('when everyone has a leader and a lore card, pieces and resources are placed and chapter 1 starts', () => {
    const [ix, s] = draftGame();
    let st = s;
    for (const player of [2, 1, 0]) st = dispatch(ix, st, { type: 'draft', player, card: st.draft!.leaders[0] });
    for (const player of [2, 1, 0]) st = dispatch(ix, st, { type: 'draft', player, card: st.draft!.lore[0] });
    expect(st.chapter).toBe(1);
    expect(st.phase).toEqual({ type: 'lead' });
    for (const p of st.players) {
      expect(p.leader).not.toBeNull();
      expect(p.lore).toHaveLength(1);
      const def = ix.content.leaders!.find((l) => l.id === p.leader)!;
      expect(heldResources(p)).toEqual(def.resources);
      expect(p.hand).toHaveLength(6);
    }
    expect(st.map['c1-p1'].buildings).toEqual([{ owner: 0, type: 'city', damaged: false }]);
  });

  it('the two-lore option drafts one more lore per player', () => {
    const ix = indexContent(leadersContent());
    const s = newGame(ix, { playerCount: 3, seed: 4, variant: 'leaders', setupCardId: 'slots-3', firstPlayer: 0, lorePerPlayer: 2 });
    expect(s.draft!.lore).toHaveLength(6);
    expect(s.draft!.order).toHaveLength(9);
  });
});
