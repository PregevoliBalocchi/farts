// The Court in the campaign: attached cards (campaign rulebook p. 27) and the
// Imperial Council (p. 14). Rules: docs/rules/Arcs_Campaign_Rulebook_for_web.txt.
import { describe, expect, it } from 'vitest';
import {
  HANDLERS,
  IMPERIAL_COUNCIL,
  attachToCourt,
  destroyCityConsequences,
  detachFromCourt,
  newCampaign,
  petitionCouncil,
  ransackable,
  removeFromCourt,
  returnCouncil,
  takeCourtCard,
} from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { content, game, index } from './fixture';

const ix = index(content());

/** A 3-player campaign game whose Court row holds three Guild cards, with the Council leftmost (setup step K, p. 5). */
function campaign(): { s: GameState; guilds: string[] } {
  const s = game(ix, 3, 7, 0);
  s.campaign = newCampaign(3);
  const guilds = [...s.court.map((c) => c.card), ...s.courtDeck].filter((c) => ix.courtCards.get(c)?.kind === 'faction');
  s.court = guilds.slice(0, 3).map((card) => ({ card, agents: {} }));
  s.courtDeck = guilds.slice(3, 6);
  s.court.unshift({ card: IMPERIAL_COUNCIL, agents: {} });
  return { s, guilds };
}

describe('attached cards (p. 27)', () => {
  it('secures the attached card together with the card under it, and refills the slot from the deck', () => {
    const { s, guilds } = campaign();
    const extra = guilds[6];
    attachToCourt(s, 1, extra);
    s.court[1].agents = { 0: 2, 1: 1 };
    takeCourtCard(ix, s, 0, 1, 'captives');
    expect(s.players[0].court).toEqual([guilds[0], extra]);
    expect(s.players[0].captives).toEqual([1]);
    expect(s.court[1]).toEqual({ card: guilds[3], agents: {} });
  });

  it('resolves the attached card first when the player asks for it', () => {
    const { s, guilds } = campaign();
    attachToCourt(s, 2, guilds[6]);
    takeCourtCard(ix, s, 1, 2, 'captives', true);
    expect(s.players[1].court).toEqual([guilds[6], guilds[1]]);
  });

  it('allows one attached card per Court card', () => {
    const { s, guilds } = campaign();
    attachToCourt(s, 1, guilds[6]);
    expect(() => attachToCourt(s, 1, guilds[7])).toThrow(/already has an attached card/);
  });

  it('slides the attached card down with the agents when the card under it leaves another way', () => {
    const { s, guilds } = campaign();
    attachToCourt(s, 1, guilds[6]);
    s.court[1].agents = { 2: 3 };
    const deck = [...s.courtDeck];
    expect(removeFromCourt(s, 1)).toBe(guilds[0]);
    expect(s.court[1]).toEqual({ card: guilds[6], agents: { 2: 3 } });
    expect(s.courtDeck).toEqual(deck);
  });

  it('refills from the deck when a card with nothing attached leaves', () => {
    const { s, guilds } = campaign();
    removeFromCourt(s, 2);
    expect(s.court.map((c) => c.card)).toEqual([IMPERIAL_COUNCIL, guilds[0], guilds[3], guilds[2]]);
  });

  it('leaves the card under it alone when the attached card is removed', () => {
    const { s, guilds } = campaign();
    attachToCourt(s, 3, guilds[6]);
    s.court[3].agents = { 0: 1 };
    expect(detachFromCourt(s, 3)).toBe(guilds[6]);
    expect(s.court[3]).toEqual({ card: guilds[2], agents: { 0: 1 } });
  });

  it('ransacks the attached card too, since Ransack secures', () => {
    const { s, guilds } = campaign();
    attachToCourt(s, 2, guilds[6]);
    s.court[2].agents = { 1: 1, 2: 1 };
    destroyCityConsequences(ix, s, 0, 1, undefined, [2]);
    expect(s.players[0].court).toEqual([guilds[1], guilds[6]]);
    expect(s.players[0].trophies).toEqual([
      { owner: 1, piece: 'agent' },
      { owner: 2, piece: 'agent' },
    ]);
  });
});

describe('the Imperial Council (p. 14)', () => {
  it('flips to Decided and is tucked when secured, with no refill, taking its attached card along', () => {
    const { s, guilds } = campaign();
    attachToCourt(s, 0, guilds[6]);
    s.court[0].agents = { 1: 2 };
    const deck = [...s.courtDeck];
    takeCourtCard(ix, s, 1, 0, 'captives');
    expect(s.campaign!.council).toBe('decided');
    expect(s.campaign!.councilTucked).toBe(1);
    expect(s.court.map((c) => c.card)).toEqual(guilds.slice(0, 3));
    expect(s.courtDeck).toEqual(deck);
    expect(s.players[1].court).toEqual([guilds[6]]);
  });

  it('returns to the Court as its leftmost card at the end of the round, Decided', () => {
    const { s } = campaign();
    takeCourtCard(ix, s, 2, 0, 'captives');
    expect(returnCouncil(s)).toBe(2);
    expect(s.court[0]).toEqual({ card: IMPERIAL_COUNCIL, agents: {} });
    expect(s.campaign!.council).toBe('decided');
    expect(returnCouncil(s)).toBe(null);
  });

  it('cannot be influenced, secured or ransacked while Decided', () => {
    const { s } = campaign();
    s.campaign!.council = 'decided';
    s.court[0].agents = { 1: 2 };
    expect(() => HANDLERS.influence(ix, s, 0, { kind: 'influence', courtSlot: 0 })).toThrow(/cannot be influenced/);
    expect(() => HANDLERS.secure(ix, s, 1, { kind: 'secure', courtSlot: 0 })).toThrow(/cannot be secured/);
    expect(ransackable(s, 1)).toEqual([]);
  });

  it('still takes attached cards while Decided', () => {
    const { s, guilds } = campaign();
    s.campaign!.council = 'decided';
    attachToCourt(s, 0, guilds[6]);
    expect(s.court[0].attached).toBe(guilds[6]);
  });

  it('cannot be buried, scrapped or discarded', () => {
    const { s } = campaign();
    expect(() => removeFromCourt(s, 0)).toThrow(/cannot be buried/);
  });

  it('goes back to the Court In Session, not resolving, when the Council is petitioned while tucked', () => {
    const { s } = campaign();
    takeCourtCard(ix, s, 0, 0, 'captives');
    petitionCouncil(s);
    expect(s.campaign!.council).toBe('in-session');
    expect(s.campaign!.councilTucked).toBeUndefined();
    expect(s.court[0].card).toBe(IMPERIAL_COUNCIL);
    expect(returnCouncil(s)).toBe(null);
  });
});
