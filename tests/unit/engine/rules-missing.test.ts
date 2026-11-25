// Rules that no other engine test asserts precisely (rulebook: docs/rules/arcs-rules-library.txt).
// Each test cites the rulebook section it checks. Rules already covered elsewhere are not repeated here.
import { describe, expect, it } from 'vitest';
import { cityBonusPower, destroyCityConsequences, dispatch, endChapter, heldResources, RuleError } from '../../../src/game/engine';
import type { GameState, Resource } from '../../../src/game/engine';
import { content, game, index, setHands } from './fixture';

const ix = index();

/** 3-player game, P0 to lead, with known hands (same shape as chapter.test.ts). */
function known(hands: string[][]): GameState {
  const s = game(ix, 3, 7, 0);
  setHands(s, hands);
  return s;
}

describe('seizing the initiative (5.2.3, 5.4.1)', () => {
  // 5.2.3 "No Self Seize. The player with initiative cannot seize the initiative."
  it('the player who already has the initiative cannot seize it on a follow, and keeps the card in hand', () => {
    const s = known([['suitA-3', 'suitB-2'], ['suitA-5', 'suitB-3'], ['suitC-4', 'suitC-2', 'suitD-2']]);
    let led = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-3' });
    led = dispatch(ix, led, { type: 'endTurn', player: 0 });
    // Now it is P1's follow step; the holder P0 trying to play (and seize) in it is refused.
    expect(led.phase).toMatchObject({ type: 'follow', next: 1 });
    expect(() => dispatch(ix, led, { type: 'follow', player: 0, card: 'suitB-2', mode: 'copy', seizeWith: 'suitA-3' })).toThrow(/Not P0/);
    expect(led.players[0].hand).toEqual(['suitB-2']);
    expect(led.initiative).toBe(0);
  });

  // 5.4.1 "Discard all played action cards, and any action card used to seize the initiative, into the action discard pile."
  it('the card used to seize is discarded at round end, together with the card played', () => {
    const s = known([['suitA-3', 'suitB-2'], ['suitA-5', 'suitB-3'], ['suitC-4', 'suitC-2', 'suitD-2']]);
    let t = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-3' });
    t = dispatch(ix, t, { type: 'endTurn', player: 0 });
    t = dispatch(ix, t, { type: 'follow', player: 1, card: 'suitA-5', mode: 'surpass' });
    t = dispatch(ix, t, { type: 'endTurn', player: 1 });
    t = dispatch(ix, t, { type: 'follow', player: 2, card: 'suitC-4', mode: 'copy', seizeWith: 'suitC-2' });
    t = dispatch(ix, t, { type: 'endTurn', player: 2 });
    expect(t.initiative).toBe(2);
    expect(t.players[2].hand).toEqual(['suitD-2']);
    expect(t.discard).toEqual(expect.arrayContaining(['suitC-2', 'suitC-4', 'suitA-3', 'suitA-5']));
  });
});

describe('ambitions are limited (5.1.3)', () => {
  // 5.1.3 "Ambitions are Limited. You cannot declare an ambition if all ambitions markers are already placed."
  it('a lead cannot declare an ambition when every ambition marker is already placed, but can still be played', () => {
    const s = known([['suitB-2'], ['suitA-4'], ['suitB-6']]);
    s.ambitions.available = []; // all 3 markers are in ambition boxes
    expect(() => dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2', declare: true })).toThrow(/No ambition markers/);
    const played = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' });
    expect(played.ambitions.declared.wealth).toEqual([]);
  });
});

describe('card numbers and declaring (5.1.3 "Ambitions by Card")', () => {
  // 5.1.3 "The “1” cards have no ambition. (Four players only.)"
  it('a 1 card can be led but cannot declare an ambition', () => {
    const s = game(ix, 4, 7, 0);
    setHands(s, [['suitA-1', 'suitB-2'], ['suitA-4'], ['suitB-6'], ['suitC-2']]);
    expect(() => dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-1', declare: true })).toThrow(/cannot declare/);
    const led = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitA-1' });
    expect(led.round.leadSuit).toBe('suitA');
    expect(led.ambitions.declared.wealth).toEqual([]);
  });
});

describe('city power bonus at scoring (6.2.1 "Bonus City Power")', () => {
  // 6.2.1 "gain 2 extra Power if the “+2 to won ambitions” city slot on your player board is uncovered"
  it('with 4 cities built only the +2 slot is uncovered, so each ambition won gives 2 extra Power', () => {
    const c = content();
    const p = game(index(c), 3, 3, 0).players[0];
    p.supply.cities = c.citiesPerPlayer - 3; // 3 built: no bonus yet
    expect(cityBonusPower(c, p)).toBe(0);
    p.supply.cities = c.citiesPerPlayer - 4; // 4 built: the +2 slot is uncovered
    expect(cityBonusPower(c, p)).toBe(2);
  });
});

describe('game end (6.2.3 "Step 3: End Game or Advance Chapter")', () => {
  // The game ends when any player has at least 27 (4 players), 30 (3 players) or 33 (2 players) Power.
  const cases: [number, number, string | undefined][] = [
    [4, 27, undefined],
    [3, 30, undefined],
    [2, 33, 'setup-2a'],
  ];
  for (const [players, target, setup] of cases) {
    it(`a ${players}-player game ends at ${target} Power and not one point before`, () => {
      const below = game(ix, players as 2 | 3 | 4, 7, 0, setup);
      below.players[0].power = target - 1;
      endChapter(ix, below);
      expect(below.phase.type).not.toBe('gameOver');
      expect(below.chapter).toBe(2);

      const at = game(ix, players as 2 | 3 | 4, 7, 0, setup);
      at.players[0].power = target;
      endChapter(ix, at);
      expect(at.phase.type).toBe('gameOver');
      expect(at.phase.type === 'gameOver' && at.phase.winners).toEqual([0]);
    });
  }

  // 6.2.3 "...or if the chapter marker is currently on Chapter 5." The game ends after chapter 5 with no one at the threshold.
  it('the game ends when chapter 5 ends, even with no one at the Power threshold', () => {
    const s = game(ix, 3, 3, 0);
    s.chapter = 5;
    endChapter(ix, s);
    expect(s.phase.type).toBe('gameOver');
  });

  it('chapter 4 ending with no one at the threshold advances to chapter 5', () => {
    const s = game(ix, 3, 3, 0);
    s.chapter = 4;
    endChapter(ix, s);
    expect(s.phase.type).not.toBe('gameOver');
    expect(s.chapter).toBe(5);
  });
});

describe('destroying a city outside battle (7.7.4)', () => {
  // 7.7.4 "If you destroy a city—even outside battle—do the following: Step 1: Provoke Outrage."
  it('destroying a city by a card effect provokes Outrage for the planet type, discarding that type', () => {
    const c = content();
    const cx = index(c);
    const FUEL: Resource = 'fuel';
    const guildOfFuel = c.courtCards.find((x) => x.kind === 'faction' && x.resource === FUEL)!.id;
    const s = game(cx, 3, 5, 0);
    s.players[0].resources = [FUEL, 'material'];
    s.players[0].court = [guildOfFuel];
    const agents = s.players[0].supply.agents;
    destroyCityConsequences(cx, s, 0, 1, FUEL, []);
    const p = s.players[0];
    expect(p.outraged).toEqual([FUEL]);
    expect(heldResources(p)).toEqual(['material']);
    expect(p.court).toEqual([]);
    expect(s.courtDiscard).toContain(guildOfFuel);
    expect(p.supply.agents).toBe(agents - 1);
  });
});

describe('destroyed attacking ships are the defender’s trophies (7.7.3)', () => {
  /** Content where the skirmish die always shows 1 hit, the assault die 1 self-hit. */
  function fixedDiceIndex() {
    const c = content();
    c.dice.skirmish = [{ hit: 1 }];
    c.dice.raid = [{ buildingHit: 1 }];
    c.dice.assault = [{ selfHit: 1 }];
    return index(c);
  }

  // 7.7.3 "The defender takes destroyed attacking pieces as Trophies."
  it('an attacking ship destroyed by the attacker’s own hit becomes a trophy of the defender', () => {
    const cx = fixedDiceIndex();
    const s = game(cx, 2, 5, 0, 'setup-2a');
    setHands(s, [['suitB-2'], ['suitA-4']]);
    s.map['c1-p3'].ships = { 0: { fresh: 2, damaged: 1 }, 1: { fresh: 2, damaged: 0 } };
    s.map['c1-p3'].buildings = [{ owner: 1, type: 'city', damaged: false }];
    let t = dispatch(cx, s, { type: 'lead', player: 0, card: 'suitB-2' });
    t = dispatch(cx, t, { type: 'action', player: 0, action: { kind: 'battle', system: 'c1-p3', target: 1, dice: { assault: 1 } } });
    t = dispatch(cx, t, { type: 'allocate', player: 0, allocation: { hits: [], selfHits: ['damaged'], buildingHits: [] } });
    expect(t.map['c1-p3'].ships[0]).toEqual({ fresh: 2, damaged: 0 });
    expect(t.players[1].trophies).toEqual([{ owner: 0, piece: 'ship' }]);
    expect(t.players[0].trophies).toEqual([]);
  });
});

describe('two-player mulligan is single per chapter (6.2.4)', () => {
  // 6.2.4 "...the player without initiative may discard their hand of 6 action cards to draw a new hand of 6 action cards. They must accept this new hand."
  it('after the chapter-end mulligan is used, a second one in the same chapter is refused', () => {
    let s = game(ix, 2, 7, 0, 'setup-2a');
    for (let r = 0; r < 6 && s.chapter === 1; r++) {
      const leader = s.initiative;
      s = dispatch(ix, s, { type: 'lead', player: leader, card: s.players[leader].hand[0] });
      s = dispatch(ix, s, { type: 'endTurn', player: leader });
      while (s.phase.type === 'follow' && s.chapter === 1) {
        const p = s.phase.next;
        s = dispatch(ix, s, { type: 'follow', player: p, card: s.players[p].hand[0], mode: 'copy' });
        s = dispatch(ix, s, { type: 'endTurn', player: p });
      }
    }
    expect(s.chapter).toBe(2);
    const other = (s.initiative + 1) % 2;
    const after = dispatch(ix, s, { type: 'mulligan', player: other });
    expect(() => dispatch(ix, after, { type: 'mulligan', player: other })).toThrow(RuleError);
  });
});
