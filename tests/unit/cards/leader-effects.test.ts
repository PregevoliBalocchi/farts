// Leader abilities: declaring, Copy/Pivot, scoring and setup (design/gdd/card-effects.md).
import { describe, expect, it } from 'vitest';
import { dispatch, heldResources, markerValues, newGame } from '../../../src/game/engine';
import type { GameState } from '../../../src/game/engine';
import { cardsIndex, runAll, start } from './fixture';

const ix = cardsIndex();
const guild = (r: string) => ix.content.courtCards.find((x) => x.kind === 'faction' && x.resource === r && !x.set)!.id;

describe('declaring', () => {
  it('a leader may gain any resource after declaring, before any action', () => {
    let s = start(ix, [['suitC-2'], ['suitC-4']]);
    s.players[0].leader = 'leader-04';
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitC-2', declare: true });
    expect(s.phase).toMatchObject({ type: 'decide', decision: { player: 0, card: 'leader-04', effect: 'onDeclare' } });
    s = dispatch(ix, s, { type: 'decide', player: 0, args: { resource: 'relic' } });
    expect(heldResources(s.players[0])).toEqual(['relic']);
    expect(s.phase.type).toBe('actions');
  });

  it('a leader must give a Guild card to the weakest Rival to declare', () => {
    const s = start(ix, [['suitC-2'], ['suitC-4']]);
    s.players[0].leader = 'leader-07';
    expect(() => dispatch(ix, s, { type: 'lead', player: 0, card: 'suitC-2', declare: true })).toThrow(/must give 1 Guild card/);
    s.players[0].court = [guild('fuel')];
    const t = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitC-2', declare: true, give: { card: guild('fuel') } });
    expect(t.players[1].court).toEqual([guild('fuel')]);
    expect(t.ambitions.declared.wealth.length).toBe(1);
  });

  it('the declaring cost also applies to declarations made by card effects', () => {
    let s = start(ix, [['suitB-2'], ['suitB-4']]);
    s.players[0].leader = 'leader-07';
    s.court[0] = { card: 'v:court-27', agents: { 0: 1 } };
    s = runAll(ix, s, [
      { type: 'lead', player: 0, card: 'suitB-2' },
      { type: 'action', player: 0, action: { kind: 'secure', courtSlot: 0 } },
    ]);
    expect(() => dispatch(ix, s, { type: 'decide', player: 0, args: { ambition: 'relics' } })).toThrow(/must give 1 Guild card/);
  });

  it('a leader influences several Court cards once each when declaring', () => {
    let s = start(ix, [['suitC-2'], ['suitC-4']]);
    s.players[0].leader = 'leader-08';
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitC-2', declare: true });
    expect(() => dispatch(ix, s, { type: 'decide', player: 0, args: { courtSlots: [0, 0] } })).toThrow(/one agent on each/);
    s = dispatch(ix, s, { type: 'decide', player: 0, args: { courtSlots: [0, 1, 2] } });
    expect([0, 1, 2].map((i) => s.court[i].agents[0])).toEqual([1, 1, 1]);
  });

  it('a leader cannot secure a Guild card with only 1 of its agents, but can secure a Vox card', () => {
    const s = start(ix, [['suitB-2'], ['suitB-4']]);
    s.players[0].leader = 'leader-08';
    s.court[0] = { card: guild('fuel'), agents: { 0: 1 } };
    s.court[1] = { card: 'v:court-31', agents: { 0: 1 } };
    const led = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' });
    expect(() => dispatch(ix, led, { type: 'action', player: 0, action: { kind: 'secure', courtSlot: 0 } })).toThrow(/only 1 of your agents/);
    expect(dispatch(ix, led, { type: 'action', player: 0, action: { kind: 'secure', courtSlot: 1 } }).courtDiscard).toContain('v:court-31');
  });

  it('declaring an undeclared ambition secures the top Court card, whose prelude waits', () => {
    let s = start(ix, [['suitC-2'], ['suitC-4']]);
    s.players[0].leader = 'leader-12';
    s.courtDeck.unshift('g:court-23');
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitC-2', declare: true });
    expect(s.players[0].court).toContain('g:court-23');
    expect(() => dispatch(ix, s, { type: 'ability', player: 0, card: 'g:court-23', ability: 'supplies' })).toThrow(/secured in this prelude/);
  });

  it('a card looks at a Rival hand when declaring and may swap one card', () => {
    let s = start(ix, [['suitC-2', 'suitA-3'], ['suitC-4', 'suitA-5']]);
    s.players[0].court = ['g:court-17'];
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitC-2', declare: true });
    s = dispatch(ix, s, { type: 'decide', player: 0, args: { rival: 1, give: 'suitA-3', take: 'suitA-5' } });
    expect(s.players[0].hand).toEqual(['suitA-5']);
    expect(s.players[1].hand).toEqual(['suitC-4', 'suitA-3']);
  });
});

describe('Copy and Pivot options', () => {
  /** P0 leads, P1 copies with an Aggression or Administration card. */
  function copying(leader: string, setup: (s: GameState) => void = () => {}, lead = 'suitB-2', copy = 'suitB-4'): GameState {
    let s = start(ix, [[lead], [copy]]);
    s.players[1].leader = leader;
    setup(s);
    s = runAll(ix, s, [
      { type: 'lead', player: 0, card: lead },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: copy, mode: 'copy' },
    ]);
    return s;
  }

  it('a leader influences twice when copying to influence, not when leading', () => {
    const s = copying('leader-12', () => {}, 'suitA-2', 'suitA-4');
    const t = dispatch(ix, s, { type: 'action', player: 1, action: { kind: 'influence', courtSlot: 0, twice: 1 } });
    expect([t.court[0].agents[1], t.court[1].agents[1]]).toEqual([1, 1]);
    let u = start(ix, [['suitA-2'], ['suitA-4']]);
    u.players[0].leader = 'leader-12';
    u = dispatch(ix, u, { type: 'lead', player: 0, card: 'suitA-2' });
    expect(() => dispatch(ix, u, { type: 'action', player: 0, action: { kind: 'influence', courtSlot: 0, twice: 1 } })).toThrow(/Copy or Pivot/);
  });

  it('a leader influences before securing when copying to secure', () => {
    const s = copying('leader-07', (s) => {
      s.court[0] = { card: guild('relic'), agents: { 0: 1, 1: 1 } };
    });
    const t = dispatch(ix, s, { type: 'action', player: 1, action: { kind: 'secure', courtSlot: 0, influence: { courtSlot: 0, when: 'before' } } });
    expect(t.players[1].court).toContain(guild('relic'));
    expect(() => dispatch(ix, s, { type: 'action', player: 1, action: { kind: 'secure', courtSlot: 0, influence: { courtSlot: 1, when: 'after' } } })).toThrow(/strictly more/);
  });

  it('a leader moves before the battle when copying to battle', () => {
    const ixd = cardsIndex((c) => {
      c.dice.skirmish = [{ hit: 1 }];
      c.maxDicePerType = 6;
    });
    let s = start(ixd, [['suitB-2'], ['suitB-4']]);
    s.players[1].leader = 'leader-06';
    s.map['c1-gate'].ships = { 1: { fresh: 2, damaged: 0 } };
    s.map['c1-p1'].ships = { 0: { fresh: 1, damaged: 0 } };
    s = runAll(ixd, s, [
      { type: 'lead', player: 0, card: 'suitB-2' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitB-4', mode: 'copy' },
      {
        type: 'action',
        player: 1,
        action: { kind: 'battle', system: 'c1-p1', target: 0, dice: { skirmish: 2 }, tactical: { when: 'before', move: { kind: 'move', from: 'c1-gate', to: 'c1-p1', ships: 2 } } },
      },
    ]);
    expect(s.phase).toMatchObject({ type: 'allocate', battle: { system: 'c1-p1', totals: { hit: 2 } } });
  });

  it('a move after the battle happens once the hits are allocated', () => {
    const ixd = cardsIndex((c) => {
      c.dice.skirmish = [{}];
      c.maxDicePerType = 6;
    });
    let s = start(ixd, [['suitB-2'], ['suitB-4']]);
    s.players[1].leader = 'leader-06';
    s.map['c1-p1'].ships = { 0: { fresh: 1, damaged: 0 }, 1: { fresh: 2, damaged: 0 } };
    s = runAll(ixd, s, [
      { type: 'lead', player: 0, card: 'suitB-2' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitB-4', mode: 'copy' },
      {
        type: 'action',
        player: 1,
        action: { kind: 'battle', system: 'c1-p1', target: 0, dice: { skirmish: 1 }, tactical: { when: 'after', move: { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 2 } } },
      },
    ]);
    expect(s.map['c1-gate'].ships[1]).toBeUndefined();
    s = dispatch(ixd, s, { type: 'allocate', player: 1, allocation: { selfHits: [], hits: [], buildingHits: [] } });
    expect(s.map['c1-gate'].ships[1].fresh).toBe(2);
  });
});

describe('scoring', () => {
  /** P0 leads a 3 (declares captives), P1 copies; the chapter ends with everyone out of cards. */
  function scoreCaptives(leader: string, captives: [number[], number[]]): { s: GameState; values: { first: number; second: number } } {
    let s = start(ix, [['suitC-3'], ['suitC-4']]);
    s.players[0].leader = leader;
    s.players[1].leader = leader;
    s.players[0].captives = captives[0];
    s.players[1].captives = captives[1];
    s = dispatch(ix, s, { type: 'lead', player: 0, card: 'suitC-3', declare: true });
    const marker = s.ambitions.declared.captives[0];
    s = runAll(ix, s, [
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitC-4', mode: 'copy' },
      { type: 'endTurn', player: 1 },
    ]);
    return { s, values: markerValues(ix.content, marker, 1) };
  }

  it('a leader scoring its ambition gains the second-place value for first and nothing for second', () => {
    const { s, values } = scoreCaptives('leader-01', [[1, 1], [0]]);
    expect(s.players[0].power).toBe(values.second);
    expect(s.players[1].power).toBe(0);
  });

  it('a leader gains Power only for an untied first place', () => {
    const { s, values } = scoreCaptives('leader-12', [[1, 1], [0]]);
    expect(s.players[0].power).toBe(values.first);
    expect(s.players[1].power).toBe(0);
  });

  it('after scoring, a leader discards all Fuel if Tycoon was scored, and a Cartel makes Rivals discard', () => {
    let s = start(ix, [['suitC-2'], ['suitC-4']]);
    s.players[0].leader = 'leader-03';
    s.players[0].resources = ['fuel', 'relic'];
    s.players[1].court = ['g:court-03'];
    s.players[0].resources.push('material');
    s = runAll(ix, s, [
      { type: 'lead', player: 0, card: 'suitC-2', declare: true },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitC-4', mode: 'copy' },
      { type: 'endTurn', player: 1 },
    ]);
    expect(heldResources(s.players[0])).toEqual(['relic']);
  });
});

describe('setup', () => {
  const setupGame = (leaders: [string, string]) =>
    newGame(ix, { playerCount: 2, seed: 3, variant: 'leaders', setupCardId: 'setup-2a', firstPlayer: 0, leaders, lore: [[], []] });

  it('leaders place agents on Outrage slots and scrap pieces', () => {
    const s = setupGame(['leader-02', 'leader-10']);
    const base = newGame(ix, { playerCount: 2, seed: 3, variant: 'leaders', setupCardId: 'setup-2a', firstPlayer: 0, leaders: ['leader-05', 'leader-05'], lore: [[], []] });
    expect(s.players[0].outraged).toEqual(['material', 'fuel']);
    expect(s.players[0].supply.agents).toBe(base.players[0].supply.agents - 2);
    expect(s.players[1].supply.ships).toBe(base.players[1].supply.ships - 2);
    expect(s.players[1].supply.agents).toBe(base.players[1].supply.agents - 3);
  });

  it('a leader scraps its 2 leftmost cities, opening their slots', () => {
    const s = setupGame(['leader-13', 'leader-05']);
    const base = setupGame(['leader-05', 'leader-05']);
    expect(s.players[0].supply.cities).toBe(base.players[0].supply.cities - 2);
  });

  it('a leader draws 5 lore after setup and keeps 2 before the first lead', () => {
    let s = setupGame(['leader-09', 'leader-05']);
    expect(s.phase).toMatchObject({ type: 'decide', decision: { player: 0, effect: 'setupLore' } });
    const offer = (s.phase.type === 'decide' ? s.phase.decision.data!.cards : []) as string[];
    expect(offer.length).toBe(5);
    expect(() => dispatch(ix, s, { type: 'decide', player: 0, args: { keep: offer.slice(0, 3) } })).toThrow(/Keep exactly 2/);
    s = dispatch(ix, s, { type: 'decide', player: 0, args: { keep: offer.slice(0, 2) } });
    expect(s.players[0].lore).toEqual(offer.slice(0, 2));
    expect(s.loreDiscard).toEqual(offer.slice(2));
    expect(s.phase.type).toBe('lead');
  });
});
