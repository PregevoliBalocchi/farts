// The piece ledger (production/piano-blindatura-tavolo-2026-11-25.md, Fase 0) and the Outrage
// placeholder rule it exposed (rulebook "Pieces & Piece Limits": with no agent in supply, a
// placeholder covers the Outrage icon until an agent enters the supply).
import { describe, expect, it } from 'vitest';
import { clearOutrage, dispatch, newGame, pieceLedger, provokeOutrage } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { cardsIndex } from '../cards/fixture';
import { game, index, setHands } from './fixture';

const ix = index();
const PIECES = { ships: ix.content.shipsPerPlayer, agents: ix.content.agentsPerPlayer, cities: ix.content.citiesPerPlayer, starports: ix.content.starportsPerPlayer };

/** The resource tokens in the box, all types together. */
const TOKENS = Object.values(ix.content.resourceSupply).reduce((a, b) => a + b, 0);

describe('pieceLedger', () => {
  it('counts every piece of every player in a new game, wherever it is', () => {
    for (const n of [2, 3, 4] as const) {
      const s = game(ix, n, 3, 0);
      const l = pieceLedger(s);
      expect(l.pieces).toEqual(Array.from({ length: n }, () => PIECES));
      expect(l.resources).toBe(TOKENS);
    }
  });

  it('keeps the counts when pieces move to the map, the Court, captives and trophies', () => {
    const s = game(ix, 3, 3, 0);
    s.players[0].supply.ships -= 2;
    const st = (s.map['c1-p1'].ships[0] ??= { fresh: 0, damaged: 0 });
    st.fresh += 1;
    st.damaged += 1;
    s.players[1].supply.agents -= 2;
    s.court[0].agents[1] = 1;
    s.players[2].captives.push(1);
    s.players[2].supply.cities -= 1;
    s.players[0].trophies.push({ owner: 2, piece: 'city' });
    expect(pieceLedger(s).pieces).toEqual([PIECES, PIECES, PIECES]);
  });

  it('counts the pieces a leader scraps at setup as removed from the game', () => {
    const cix = cardsIndex();
    const s = newGame(cix, { playerCount: 2, seed: 3, variant: 'leaders', setupCardId: 'setup-2a', firstPlayer: 0, leaders: ['leader-13', 'leader-10'], lore: [[], []] });
    const all = { ships: cix.content.shipsPerPlayer, agents: cix.content.agentsPerPlayer, cities: cix.content.citiesPerPlayer, starports: cix.content.starportsPerPlayer };
    expect(pieceLedger(s).pieces).toEqual([all, all]);
    expect(s.players[1].removed).toEqual({ ships: 2, agents: 3 });
  });
});

describe('Outrage with no agent in supply', () => {
  /** P0 has every agent out of its supply (on the Court), then is Outraged. */
  function outragedWithoutAgents(): GameState {
    const s = game(ix, 2, 3, 0);
    setHands(s, [['suitA-2'], ['suitA-3']]);
    s.court[0].agents[0] = s.players[0].supply.agents;
    s.players[0].supply.agents = 0;
    provokeOutrage(ix, s, 0, 'fuel');
    return s;
  }

  it('covers the icon with a placeholder and keeps the agent count', () => {
    const s = outragedWithoutAgents();
    expect(s.players[0].outraged).toEqual(['fuel']);
    expect(s.players[0].outragePlaceholders).toEqual(['fuel']);
    expect(pieceLedger(s).pieces[0].agents).toBe(PIECES.agents);
  });

  it('clearing a placeholder gives back no agent', () => {
    const s = outragedWithoutAgents();
    clearOutrage(s, 0, 'fuel');
    expect(s.players[0].supply.agents).toBe(0);
    expect(pieceLedger(s).pieces[0].agents).toBe(PIECES.agents);
  });

  it('an agent entering the supply replaces the placeholder', () => {
    let s = outragedWithoutAgents();
    s.court[0].agents[0] -= 1;
    s.players[0].supply.agents = 1;
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-2' });
    expect(s.players[0].outragePlaceholders ?? []).toEqual([]);
    expect(s.players[0].supply.agents).toBe(0);
    expect(pieceLedger(s).pieces[0].agents).toBe(PIECES.agents);
  });
});
