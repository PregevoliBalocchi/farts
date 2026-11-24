// The campaign's play area (campaign rulebook p. 27): protected Guild cards,
// frozen resources (the Imperial Trust on the First Regent tile), and the
// rules booklet (p. 9, 20).
import { describe, expect, it } from 'vitest';
import { addToBooklet, cartelMetric, edictsInOrder, isProtected, newCampaign, provokeOutrage, removeFromBooklet, stealBlocked, stealGuild } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { content, game, index } from './fixture';

const ix = index(content());
// A protected Guild card ("X" in place of its raid cost), only in this file's index.
const PROTECTED = 'test-protected-fuel';
ix.courtCards.set(PROTECTED, { id: PROTECTED, kind: 'faction', resource: 'fuel', keys: 'X' });
const PLAIN = 'test-plain-fuel';
ix.courtCards.set(PLAIN, { id: PLAIN, kind: 'faction', resource: 'fuel', keys: 2 });

function campaign(): GameState {
  const s = game(ix, 3, 7, 0);
  s.campaign = newCampaign(3);
  s.players[1].court.push(PROTECTED);
  return s;
}

describe('protected Guild cards (p. 27)', () => {
  it('reads the X raid cost as protected', () => {
    expect(isProtected(ix, PROTECTED)).toBe(true);
    expect(isProtected(ix, PLAIN)).toBe(false);
  });

  it('cannot be stolen or raided from its holder', () => {
    const s = campaign();
    expect(stealBlocked(ix, s, 0, 1, { card: PROTECTED })).toMatch(/is protected/);
    expect(() => stealGuild(ix, s, 0, 1, PROTECTED)).toThrow(/is protected/);
    expect(s.players[1].court).toContain(PROTECTED);
  });

  it('is still discarded when its holder Provokes Outrage of its suit', () => {
    const s = campaign();
    provokeOutrage(ix, s, 1, 'fuel');
    expect(s.players[1].court).not.toContain(PROTECTED);
    expect(s.courtDiscard).toContain(PROTECTED);
  });
});

describe('the Imperial Trust, frozen on the First Regent tile (p. 21, 27)', () => {
  it("counts for the First Regent's ambitions only", () => {
    const s = campaign();
    s.campaign!.firstRegent = 2;
    s.campaign!.trust = ['material', 'fuel', 'relic'];
    expect(cartelMetric(ix, s, 2, 'wealth')).toBe(2);
    expect(cartelMetric(ix, s, 2, 'relics')).toBe(1);
    expect(cartelMetric(ix, s, 0, 'wealth')).toBe(0);
  });

  it('is not reached by Provoking Outrage', () => {
    const s = campaign();
    s.campaign!.firstRegent = 1;
    s.campaign!.trust = ['fuel'];
    provokeOutrage(ix, s, 1, 'fuel');
    expect(s.campaign!.trust).toEqual(['fuel']);
  });
});

describe('the rules booklet (p. 9, 20)', () => {
  /** Printed Edict numbers: campaign.edicts (02 is "Edict 00", the Govern cards 03) and two Fate edicts. */
  const ORDER: Record<string, number> = { 'edict-02': 0, 'edict-03': 3, 'edict-04': 3, 'edict-05': 3, 'sponsor-05': 5, 'release-85': 85 };
  const order = (card: string) => ORDER[card];

  /** 2-player setup steps L and M (p. 5): Guild Envoys Depart in the first slot, the 3 Govern cards in one slot. */
  function booklet(): GameState {
    const s = game(ix, 2, 7, 0);
    s.campaign = newCampaign(2);
    addToBooklet(s, 'edicts', ['edict-02']);
    addToBooklet(s, 'edicts', ['edict-04', 'edict-03', 'edict-05']);
    return s;
  }

  it('keeps the Govern the Imperial Reach cards stacked in one slot, the top one in force', () => {
    const s = booklet();
    expect(s.campaign!.booklet.edicts).toEqual([['edict-02'], ['edict-04', 'edict-03', 'edict-05']]);
    expect(edictsInOrder(s, order)).toEqual(['edict-02', 'edict-04']);
  });

  it('resolves the Edicts from the lowest number to the highest, whatever order they were added in', () => {
    const s = booklet();
    addToBooklet(s, 'edicts', ['release-85']);
    addToBooklet(s, 'edicts', ['sponsor-05']);
    expect(edictsInOrder(s, order)).toEqual(['edict-02', 'edict-04', 'sponsor-05', 'release-85']);
  });

  it('puts Laws and Summit cards on the other side', () => {
    const s = booklet();
    addToBooklet(s, 'laws', ['law-a']);
    expect(s.campaign!.booklet.laws).toEqual([['law-a']]);
    expect(edictsInOrder(s, order)).toEqual(['edict-02', 'edict-04']);
  });

  it('announces every card added, so it can be explained to everyone', () => {
    const s = booklet();
    addToBooklet(s, 'laws', ['law-a']);
    expect(s.log.at(-1)?.data).toEqual({ announce: ['law-a'] });
  });

  it('drops a slot once its last card is taken out, and keeps the rest of a stack', () => {
    const s = booklet();
    removeFromBooklet(s, 'edict-02');
    removeFromBooklet(s, 'edict-04');
    expect(s.campaign!.booklet.edicts).toEqual([['edict-03', 'edict-05']]);
    expect(() => removeFromBooklet(s, 'edict-02')).toThrow(/not in the rules booklet/);
  });
});

describe('campaign state in a saved game', () => {
  it('survives the JSON round trip the online and hotseat saves use', () => {
    const s = game(ix, 3, 7, 0);
    s.campaign = newCampaign(3);
    s.campaign.trust = ['fuel'];
    s.campaign.favors[0] = [1, 2];
    s.campaign.councilTucked = 1;
    s.court[0].attached = PLAIN;
    addToBooklet(s, 'laws', ['law-a']);
    const back = JSON.parse(JSON.stringify(s)) as GameState;
    expect(back.campaign).toEqual(s.campaign);
    expect(back.court[0].attached).toBe(PLAIN);
  });
});
