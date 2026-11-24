// Campaign foundations (design/campaign-plan.md M1): Empire control, the
// Presence Law, Catapult stops, and pieces of no player going back to the
// campaign's general supply. Rules: docs/rules/Arcs_Campaign_Rulebook_for_web.txt p. 3, 10, 15, 19.
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_SUPPLY, catapultStops, controllerOf, controlsFor, newCampaign, returnPiece } from '../../../src/game/engine';
import type { GameState, SystemState } from '../../../src/game/engine';
import { content, game, index } from './fixture';

const ix = index(content());

/** A 3-player game turned into a campaign: P0 Outlaw, P1 and P2 Regents, P2 First Regent. */
function campaign(): GameState {
  const s = game(ix, 3, 7, 0);
  s.campaign = newCampaign(3);
  s.campaign.titles = ['outlaw', 'regent', 'regent'];
  s.campaign.firstRegent = 2;
  return s;
}

/** An empty system; each test places its pieces. */
const sys = (): SystemState => ({ id: 't', inPlay: true, ships: {}, buildings: [] });

describe('Empire control and the Presence Law (p. 10)', () => {
  it('follows the rulebook example: Outlaw 4 fresh, Regent 2 fresh, 1 fresh Imperial ship', () => {
    const s = campaign();
    const x = sys();
    x.ships = { 0: { fresh: 4, damaged: 0 }, 1: { fresh: 2, damaged: 0 } };
    x.imperial = { fresh: 1, damaged: 0 };
    // "On the Regent's turn, they control the system."
    expect(controllerOf(s, x, { purpose: 'turn', turnOf: 1 })).toBe(1);
    // "On the Outlaw's turn, the system is controlled by the Empire."
    expect(controllerOf(s, x, { purpose: 'turn', turnOf: 0 })).toBe('empire');
    expect(controlsFor(s, x, 0, { purpose: 'turn' })).toBe(false);
    expect(controlsFor(s, x, 1, { purpose: 'turn' })).toBe(true);
  });

  it('gives a Regent without Loyal pieces there no control, unless a rule lets them ignore the Presence Law', () => {
    const s = campaign();
    const x = sys();
    x.imperial = { fresh: 1, damaged: 0 };
    expect(controllerOf(s, x, { purpose: 'turn', turnOf: 1 })).toBe('empire');
    expect(controllerOf(s, x, { purpose: 'turn', turnOf: 1, ignorePresence: true })).toBe(1);
  });

  it('counts a Loyal building as presence, and only fresh Imperial ships as Empire control', () => {
    const s = campaign();
    const x = sys();
    x.buildings = [{ owner: 1, type: 'city', damaged: false }];
    x.imperial = { fresh: 0, damaged: 2 };
    expect(controllerOf(s, x, { purpose: 'turn', turnOf: 1 })).toBe(null);
    x.imperial = { fresh: 1, damaged: 0 };
    expect(controllerOf(s, x, { purpose: 'turn', turnOf: 1 })).toBe(1);
  });

  it("gives the First Regent the Empire's systems for ambitions, objectives and events", () => {
    const s = campaign();
    const x = sys();
    x.ships = { 0: { fresh: 3, damaged: 0 } };
    x.imperial = { fresh: 1, damaged: 0 };
    expect(controllerOf(s, x, { purpose: 'scoring' })).toBe(2);
    expect(controlsFor(s, x, 2, { purpose: 'scoring' })).toBe(true);
    s.campaign!.firstRegent = null;
    expect(controllerOf(s, x, { purpose: 'scoring' })).toBe('empire');
  });

  it('keeps the base rule without a campaign: strictly the most fresh ships', () => {
    const s = game(ix, 3, 7, 0);
    const x = sys();
    x.ships = { 0: { fresh: 2, damaged: 0 }, 1: { fresh: 2, damaged: 0 }, 2: { fresh: 1, damaged: 3 } };
    x.imperial = { fresh: 5, damaged: 0 }; // ignored outside a campaign
    expect(controllerOf(s, x, { purpose: 'turn', turnOf: 0 })).toBe(null);
    x.ships[0].fresh = 3;
    expect(controllerOf(s, x, { purpose: 'turn', turnOf: 1 })).toBe(0);
  });
});

describe('Catapult stops (p. 10, 19)', () => {
  it('stops Outlaws, not Regents, at an Empire-controlled gate', () => {
    const s = campaign();
    const g = sys();
    g.imperial = { fresh: 1, damaged: 0 };
    expect(catapultStops(s, g, 0, false)).toBe(true);
    expect(catapultStops(s, g, 1, false)).toBe(false);
  });

  it("stops a Rival Regent moving alone at a Regent's gate, not one moving with Imperial ships", () => {
    const s = campaign();
    const g = sys();
    g.ships = { 2: { fresh: 2, damaged: 0 } };
    expect(catapultStops(s, g, 1, false)).toBe(true);
    expect(catapultStops(s, g, 1, true)).toBe(false);
    expect(catapultStops(s, g, 0, true)).toBe(true);
  });

  it("stops Regents and Imperial pieces alike at an Outlaw's gate", () => {
    const s = campaign();
    const g = sys();
    g.ships = { 0: { fresh: 1, damaged: 0 } };
    expect(catapultStops(s, g, 1, true)).toBe(true);
  });

  it('stops every move at a gate with Blight, fresh or damaged', () => {
    const s = campaign();
    const g = sys();
    g.blight = { fresh: 0, damaged: 1 };
    expect(catapultStops(s, g, 1, true)).toBe(true);
  });
});

describe('pieces of no player (p. 3, 15, 19)', () => {
  it('returns Imperial ships, Free buildings and Blight to the campaign supply', () => {
    const s = campaign();
    const sup = s.campaign!.supply;
    sup.imperialShips = 10;
    sup.freeCities = 20;
    sup.blight = 5;
    returnPiece(ix, s, 'empire', 'ship');
    returnPiece(ix, s, 'free', 'city');
    returnPiece(ix, s, 'blight', 'blight');
    expect(sup).toEqual({ ...CAMPAIGN_SUPPLY, imperialShips: 11, freeCities: 21, blight: 6 });
  });

  it("returns a player's ship to that player's supply", () => {
    const s = campaign();
    const before = s.players[1].supply.ships;
    returnPiece(ix, s, 1, 'ship');
    expect(s.players[1].supply.ships).toBe(before + 1);
  });
});
