// Act I setup and Event cards (campaign rulebook pages 4-6 and 12-13), on the
// real content (data/content.json: the campaign data, the map's planet ID
// symbols). Fates come with M4: no Fate is dealt here.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dispatch, endChapter, eventCardIds, IMPERIAL_COUNCIL, indexContent, isEventCard, newCampaignGame } from '../../../src/game/engine';
import type { ContentIndex, GameContent, GameState, PlayerCount } from '../../../src/game/engine';

const PATH = 'data/content.json';

describe.skipIf(!existsSync(PATH))('campaign Act I', () => {
  const ix: ContentIndex = indexContent(JSON.parse(readFileSync(PATH, 'utf8')) as GameContent);
  const systems = ix.content.map.systems;
  const cc = ix.content.campaign!;

  const start = (n: PlayerCount, seed = 3) => newCampaignGame(ix, { playerCount: n, seed, firstPlayer: 0 });
  const imperialPlanets = (s: GameState) => systems.filter((d) => d.kind === 'planet' && s.map[d.id].imperial);
  /** Every placement on the first Imperial planet with an empty slot; cities first, then starports. */
  function placeAll(s: GameState): GameState {
    while (s.phase.type === 'campaignSetup') {
      const p = s.campaign!.placements[0];
      const d = imperialPlanets(s).find((x) => s.map[x.id].buildings.length < (x.slots ?? 0))!;
      s = dispatch(ix, s, { type: 'place', player: p, system: d.id, building: s.players[p].supply.cities > 3 ? 'city' : 'starport' });
    }
    return s;
  }

  describe('table setup (p. 4-5)', () => {
    it('puts every cluster in play, with 1 Imperial ship in each system of two neighbouring clusters', () => {
      const s = start(3);
      const [a, b] = s.campaign!.imperialClusters;
      const clusters = [...new Set(systems.map((x) => x.cluster))];
      expect(clusters.indexOf(b)).toBe((clusters.indexOf(a) + 1) % clusters.length);
      expect(Object.values(s.map).every((x) => x.inPlay)).toBe(true);
      const imperial = systems.filter((x) => s.map[x.id].imperial);
      expect(imperial).toHaveLength(8);
      expect(imperial.every((x) => x.cluster === a || x.cluster === b)).toBe(true);
      expect(s.campaign!.supply.imperialShips).toBe(cc.pieces.imperialShips - 8);
    });

    it('places damaged Blight in each system outside the Imperial clusters, and Free cities on one ID symbol there', () => {
      const s = start(3);
      const imperial = new Set(s.campaign!.imperialClusters);
      const outside = systems.filter((x) => !imperial.has(x.cluster));
      expect(outside.every((x) => s.map[x.id].blight?.damaged === 1 && s.map[x.id].blight?.fresh === 0)).toBe(true);
      expect(systems.filter((x) => imperial.has(x.cluster)).some((x) => s.map[x.id].blight)).toBe(false);
      const free = outside.filter((x) => s.map[x.id].buildings.some((b) => b.owner === 'free'));
      expect(free).toHaveLength(4);
      expect(new Set(free.map((x) => x.idSymbol)).size).toBe(1);
    });

    it('deals the campaign Court with the Imperial Council leftmost and lore cards shuffled into the deck', () => {
      const s = start(3);
      expect(s.court[0]).toEqual({ card: IMPERIAL_COUNCIL, agents: {} });
      expect(s.court.slice(1)).toHaveLength(4);
      expect(s.court.slice(1).every((c) => ix.courtCards.get(c.card)?.set === 'campaign')).toBe(true);
      const lore = new Set((ix.content.loreCards ?? []).map((l) => l.id));
      expect(s.courtDeck.filter((c) => lore.has(c))).toHaveLength(3);
      expect(s.courtDeck).toHaveLength(15 - 4 + 3);
    });

    it('shuffles 2 Event cards into the action deck with 2-3 players and 3 with 4', () => {
      const count = (s: GameState) => [...s.deck, ...s.players.flatMap((p) => p.hand)].filter((c) => isEventCard(ix, c)).length;
      expect(count(start(2))).toBe(2);
      expect(count(start(3))).toBe(2);
      expect(count(start(4))).toBe(3);
      expect(eventCardIds(cc)).toHaveLength(3);
    });

    it('fills the rules booklet: Guild Envoys Depart first with 2 players, then the 3 Govern edicts in one slot', () => {
      const two = start(2).campaign!.booklet.edicts;
      expect(two[0]).toEqual(['edict-02']);
      expect([...two[1]].sort()).toEqual(['edict-03', 'edict-04', 'edict-05']);
      expect(start(3).campaign!.booklet.edicts).toHaveLength(1);
    });

    it('makes the initiative holder the First Regent and everyone a Regent', () => {
      const s = newCampaignGame(ix, { playerCount: 3, seed: 3, firstPlayer: 2 });
      expect(s.campaign!.firstRegent).toBe(2);
      expect(s.campaign!.titles).toEqual(['regent', 'regent', 'regent']);
      expect(s.campaign!.placements).toEqual([2, 0, 1, 1, 0, 2]);
    });
  });

  describe('player setup (p. 6)', () => {
    it('places 3 ships and a building at a planet with an Imperial ship, gaining its resource', () => {
      const s0 = start(3);
      const d = imperialPlanets(s0)[0];
      const s = dispatch(ix, s0, { type: 'place', player: 0, system: d.id, building: 'starport' });
      expect(s.map[d.id].ships[0]).toEqual({ fresh: 3, damaged: 0 });
      expect(s.map[d.id].buildings).toContainEqual({ owner: 0, type: 'starport', damaged: false });
      expect(s.players[0].resources.filter(Boolean)).toEqual([d.resource]);
      expect(s.campaign!.placements[0]).toBe(1);
    });

    it('refuses a planet without an Imperial ship, a full planet, and the wrong player', () => {
      const s = start(3);
      const bare = systems.find((x) => x.kind === 'planet' && !s.map[x.id].imperial)!;
      expect(() => dispatch(ix, s, { type: 'place', player: 0, system: bare.id, building: 'city' })).toThrow(/Imperial ship/);
      expect(() => dispatch(ix, s, { type: 'place', player: 1, system: imperialPlanets(s)[0].id, building: 'city' })).toThrow(/Not P1's turn/);
      const small = imperialPlanets(s).find((x) => x.slots === 1)!;
      const s1 = dispatch(ix, s, { type: 'place', player: 0, system: small.id, building: 'city' });
      expect(() => dispatch(ix, s1, { type: 'place', player: 1, system: small.id, building: 'city' })).toThrow(/no empty building slot/);
    });

    it('fills the empty slots of Imperial planets with Free cities, then deals 6 cards each', () => {
      const s = placeAll(start(3));
      for (const d of imperialPlanets(s)) expect(s.map[d.id].buildings).toHaveLength(d.slots ?? 0);
      expect(s.phase.type).toBe('lead');
      expect(s.chapter).toBe(1);
      expect(s.players.every((p) => p.hand.length === ix.content.handSize)).toBe(true);
    });

    it('discards the undealt action cards at the first lead (step K)', () => {
      let s = placeAll(start(3));
      const left = s.deck.length;
      const card = s.players[0].hand.find((c) => !isEventCard(ix, c))!;
      s = dispatch(ix, s, { type: 'lead', player: 0, card });
      expect(s.deck).toEqual([]);
      expect(s.discard).toHaveLength(left);
    });

    it('keeps Event cards in a 2-player mulligan and draws only as many as discarded', () => {
      let s = placeAll(start(2));
      const event = eventCardIds(cc)[0];
      s.players[1].hand[0] = event;
      expect(() => dispatch(ix, s, { type: 'mulligan', player: 1, cards: [event] })).toThrow(/Event cards stay in hand/);
      s = dispatch(ix, s, { type: 'mulligan', player: 1 });
      expect(s.players[1].hand).toContain(event);
      expect(s.players[1].hand).toHaveLength(ix.content.handSize);
    });
  });

  describe('Event cards (p. 12-13)', () => {
    /** Chapter 1 of a 3-player game, P0 to lead with Construction 2, P1 and P2 holding an Event each. */
    function round(): GameState {
      const s = placeAll(start(3));
      const [e1, e2] = eventCardIds(cc);
      const pool = ix.content.actionCards.map((a) => a.id).filter((c) => c !== 'construction-2');
      s.players[0].hand = ['construction-2', pool[0], pool[1]];
      s.players[1].hand = [e1, pool[2], pool[3]];
      s.players[2].hand = [e2, pool[4], pool[5]];
      return s;
    }
    const lead = (s: GameState) => dispatch(ix, dispatch(ix, s, { type: 'lead', player: 0, card: 'construction-2' }), { type: 'endTurn', player: 0 });

    it('cannot lead', () => {
      const s = round();
      s.players[0].hand[0] = eventCardIds(cc)[2];
      expect(() => dispatch(ix, s, { type: 'lead', player: 0, card: s.players[0].hand[0] })).toThrow(/cannot lead/);
    });

    it("gives the lead card's actions to the first Event of the round, and none to a later one", () => {
      let s = lead(round());
      s = dispatch(ix, s, { type: 'follow', player: 1, card: s.players[1].hand[0], mode: 'event' });
      expect(s.phase.type === 'actions' && s.phase.budget).toMatchObject({ remaining: 4, kinds: ix.content.suits.construction });
      s = dispatch(ix, s, { type: 'endTurn', player: 1 });
      s = dispatch(ix, s, { type: 'follow', player: 2, card: s.players[2].hand[0], mode: 'event' });
      expect(s.phase.type === 'actions' && s.phase.budget.remaining).toBe(0);
    });

    it('gives no actions after the Imperial Council was secured this round', () => {
      let s = lead(round());
      s.campaign!.councilTucked = 0;
      s = dispatch(ix, s, { type: 'follow', player: 1, card: s.players[1].hand[0], mode: 'event' });
      expect(s.phase.type === 'actions' && s.phase.budget.remaining).toBe(0);
    });

    it('cannot Copy, nor be discarded to seize the initiative', () => {
      const s = lead(round());
      const [event, other] = s.players[1].hand;
      expect(() => dispatch(ix, s, { type: 'follow', player: 1, card: event, mode: 'copy' })).toThrow(/cannot Surpass, Pivot or Copy/);
      expect(() => dispatch(ix, s, { type: 'follow', player: 1, card: other, mode: 'copy', seizeWith: event })).toThrow(/cannot be discarded to seize/);
    });

    it('leaves the event to the initiative holder at the end of the round, or the Council to its securer', () => {
      let s = lead(round());
      s = dispatch(ix, dispatch(ix, s, { type: 'follow', player: 1, card: s.players[1].hand[0], mode: 'event' }), { type: 'endTurn', player: 1 });
      const s2 = structuredClone(s);
      s = dispatch(ix, dispatch(ix, s, { type: 'follow', player: 2, card: s.players[2].hand[1], mode: 'copy' }), { type: 'endTurn', player: 2 });
      // The event phase starts at once (events.ts): the initiative holder resolves the Event.
      expect(s.log.some((l) => l.text === `P${s.initiative} resolves the Event`)).toBe(true);
      expect(s.campaign!.pendingEvent).toBeUndefined();
      s2.campaign!.councilTucked = 2;
      s2.court.shift();
      const s3 = dispatch(ix, dispatch(ix, s2, { type: 'follow', player: 2, card: s2.players[2].hand[1], mode: 'copy' }), { type: 'endTurn', player: 2 });
      expect(s3.log.some((l) => l.text === 'P2 resolves the Imperial Council')).toBe(true);
      expect(s3.phase.type === 'decide' && s3.phase.decision).toMatchObject({ player: 2, effect: 'event:choice' });
      expect(s3.court[0].card).toBe(IMPERIAL_COUNCIL);
    });
  });

  it('ends Act I after its 3 chapters, whatever the Power (p. 8)', () => {
    const s = placeAll(start(3));
    s.players[0].power = 99;
    endChapter(ix, s);
    expect(s.phase.type).not.toBe('gameOver');
    s.chapter = cc.acts.I.chapters;
    endChapter(ix, s);
    expect(s.phase.type).toBe('gameOver');
  });
});
