// Card effects and their timing (design/gdd/card-effects.md, "Effect system").
import { describe, expect, it } from 'vitest';
import { dispatch, heldResources } from '../../../src/game/engine';
import type { Command, GameState } from '../../../src/game/engine';
import { cardsIndex, runAll, start as startWith } from './fixture';

const ix = cardsIndex();
const run = (s: GameState, cmds: Command[]) => runAll(ix, s, cmds);
const start = (hands?: string[][]) => startWith(ix, hands);

describe('prelude window', () => {
  it('a prelude ability works after playing the card and before the first pip', () => {
    let s = start();
    s.players[0].court = ['g:court-23'];
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'ability', player: 0, card: 'g:court-23', ability: 'supplies' },
    ]);
    expect(heldResources(s.players[0]).sort()).toEqual(['fuel', 'material', 'weapons']);
    expect(s.courtDiscard).toContain('g:court-23');
  });

  it('a prelude ability is refused once a card pip was used', () => {
    let s = start();
    s.players[0].court = ['g:court-23'];
    s.map['c1-p1'].buildings.push({ owner: 0, type: 'starport', damaged: false });
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'action', player: 0, action: { kind: 'build', system: 'c1-p1', what: 'ship' } },
    ]);
    expect(() => dispatch(ix, s, { type: 'ability', player: 0, card: 'g:court-23', ability: 'supplies' })).toThrow(/prelude is over/);
  });

  it('prelude abilities cannot be used outside your own turn', () => {
    let s = start();
    s.players[1].court = ['g:court-23'];
    s = run(s, [{ type: 'lead', player: 0, card: 'suitC-2' }]);
    expect(() => dispatch(ix, s, { type: 'ability', player: 1, card: 'g:court-23', ability: 'supplies' })).toThrow(/Not P1's turn/);
  });

  it('resources and abilities mix in any order inside the prelude', () => {
    let s = start();
    s.players[0].court = ['g:court-24'];
    s.players[0].resources = ['fuel', 'fuel'];
    s.map['c1-p1'].ships = { 0: { fresh: 1, damaged: 0 } };
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'prelude', player: 0, resource: 'fuel', action: { kind: 'move', from: 'c1-p1', to: 'c1-gate', ships: 1 } },
      { type: 'ability', player: 0, card: 'g:court-24', ability: 'exchange', args: { slot: 1 } },
    ]);
    expect(heldResources(s.players[0])).toEqual(['relic']);
  });

  it('"before any other actions" is refused after spending a resource', () => {
    let s = start([['suitC-2'], ['suitC-4']]);
    s.players[1].court = ['g:court-16'];
    s.players[1].resources = ['material'];
    s.map['c1-p2'].buildings.push({ owner: 1, type: 'starport', damaged: false });
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitC-4', mode: 'copy' },
    ]);
    const spent = dispatch(ix, s, { type: 'prelude', player: 1, resource: 'material', action: { kind: 'build', system: 'c1-p2', what: 'ship' } });
    expect(() => dispatch(ix, spent, { type: 'ability', player: 1, card: 'g:court-16', ability: 'seize' })).toThrow(/before any other actions/);
    const seized = dispatch(ix, s, { type: 'ability', player: 1, card: 'g:court-16', ability: 'seize' });
    expect(seized.round.seizedBy).toBe(1);
    expect(dispatch(ix, seized, { type: 'endTurn', player: 1 }).initiative).toBe(1);
  });

  it('the initiative holder cannot seize', () => {
    let s = start();
    s.players[0].court = ['g:court-16'];
    s = run(s, [{ type: 'lead', player: 0, card: 'suitC-2' }]);
    expect(() => dispatch(ix, s, { type: 'ability', player: 0, card: 'g:court-16', ability: 'seize' })).toThrow(/already hold the initiative/);
  });

  it('a Guild card secured in this prelude waits for a later turn to use its prelude ability', () => {
    let s = start();
    s.players[0].resources = ['relic'];
    s.court[0] = { card: 'g:court-23', agents: { 0: 1 } };
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'prelude', player: 0, resource: 'relic', action: { kind: 'secure', courtSlot: 0 } },
    ]);
    expect(s.players[0].court).toContain('g:court-23');
    expect(() => dispatch(ix, s, { type: 'ability', player: 0, card: 'g:court-23', ability: 'supplies' })).toThrow(/secured in this prelude/);
  });

  it('a once-per-turn prelude ability is refused the second time', () => {
    let s = start();
    s.players[0].court = ['g:court-24'];
    s.players[0].resources = ['fuel', 'fuel'];
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'ability', player: 0, card: 'g:court-24', ability: 'exchange', args: { slot: 0 } },
    ]);
    expect(() => dispatch(ix, s, { type: 'ability', player: 0, card: 'g:court-24', ability: 'exchange', args: { slot: 1 } })).toThrow(/once per turn/);
  });

  it('a prelude ability needing a declared ambition is refused otherwise', () => {
    let s = start();
    s.players[0].lore = ['l:lore-28'];
    s.players[0].resources = ['fuel'];
    s = run(s, [{ type: 'lead', player: 0, card: 'suitC-2' }]);
    const use: Command = { type: 'ability', player: 0, card: 'l:lore-28', ability: 'exchange', args: { slots: [0], gain: ['relic'] } };
    expect(() => dispatch(ix, s, use)).toThrow(/only while wealth is declared/);
    s.ambitions.declared.wealth = ['m'];
    expect(heldResources(dispatch(ix, s, use).players[0])).toEqual(['relic']);
  });
});

describe('spending resources as another type', () => {
  it('a card lets any resource be spent as its type, even an Outraged one', () => {
    let s = start();
    s.players[0].court = ['g:court-01'];
    s.players[0].resources = ['fuel'];
    s.players[0].outraged = ['fuel', 'material'];
    s.map['c1-p1'].buildings.push({ owner: 0, type: 'starport', damaged: false });
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'prelude', player: 0, resource: 'fuel', as: 'material', action: { kind: 'build', system: 'c1-p1', what: 'ship' } },
    ]);
    expect(s.map['c1-p1'].ships[0].fresh).toBe(1);
  });

  it('without such a card a resource cannot be spent as another type', () => {
    let s = start();
    s.players[0].resources = ['fuel'];
    s = run(s, [{ type: 'lead', player: 0, card: 'suitC-2' }]);
    expect(() => dispatch(ix, s, { type: 'prelude', player: 0, resource: 'fuel', as: 'material', action: { kind: 'build', system: 'c1-p1', what: 'ship' } })).toThrow(/No card lets you/);
  });

  it('a card with keep-on-Outrage stays when its owner Provokes that Outrage', () => {
    let s = start();
    s.players[0].court = ['g:court-01', 'g:court-02'];
    s.court[0] = { card: 'v:court-28', agents: { 0: 1 } };
    s.players[0].resources = ['relic'];
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'prelude', player: 0, resource: 'relic', action: { kind: 'secure', courtSlot: 0 } },
      { type: 'decide', player: 0, args: { type: 'material' } },
    ]);
    expect(s.players[0].court).toEqual(['g:court-01']);
    expect(s.players[0].outraged).toContain('material');
    expect(s.players[1].outraged).toContain('material');
  });
});

describe('new card actions', () => {
  it('a card action is paid with a pip of its kind', () => {
    let s = start();
    s.players[0].court = ['g:court-02'];
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'action', player: 0, action: { kind: 'card', card: 'g:court-02', name: 'gain' } },
    ]);
    expect(heldResources(s.players[0])).toEqual(['material']);
    expect(s.phase).toMatchObject({ budget: { remaining: 3 } });
  });

  it('a card action of a kind the played card lacks is refused', () => {
    let s = start();
    s.players[0].court = ['g:court-02'];
    s = run(s, [{ type: 'lead', player: 0, card: 'suitA-3' }]);
    expect(() => dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'card', card: 'g:court-02', name: 'gain' } })).toThrow(/build not allowed/);
  });

  it('a card action can be paid in the prelude with a resource of that kind', () => {
    let s = start();
    s.players[0].court = ['g:court-02'];
    s.players[0].resources = ['material'];
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitA-3' },
      { type: 'prelude', player: 0, resource: 'material', action: { kind: 'card', card: 'g:court-02', name: 'gain' } },
    ]);
    // The spent Material waits for the end of the prelude; the gained one is held.
    expect(heldResources(s.players[0])).toEqual(['material']);
  });

  it('a card the player does not have cannot be used', () => {
    let s = start();
    s = run(s, [{ type: 'lead', player: 0, card: 'suitC-2' }]);
    expect(() => dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'card', card: 'g:court-02', name: 'gain' } })).toThrow(/do not have/);
  });
});

describe('Vox cards wait for a choice', () => {
  it('securing a Vox with a choice pauses the turn until the owner decides, then the turn resumes', () => {
    let s = start([['suitB-2'], ['suitB-4']]);
    s.court[0] = { card: 'v:court-26', agents: { 0: 1 } };
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitB-2' },
      { type: 'action', player: 0, action: { kind: 'secure', courtSlot: 0 } },
    ]);
    expect(s.phase.type).toBe('decide');
    expect(() => dispatch(ix, s, { type: 'endTurn', player: 0 })).toThrow(/waiting for a choice/);
    s = dispatch(ix, s, { type: 'decide', player: 0, args: { cluster: 'c1' } });
    expect(s.phase.type).toBe('actions');
    expect(s.map['c1-gate'].ships[0].fresh).toBe(1);
    expect(s.map['c1-p3'].ships[0].fresh).toBe(1);
  });

  it('a Vox that shuffles itself back goes into the Court deck', () => {
    let s = start([['suitB-2'], ['suitB-4']]);
    s.court[0] = { card: 'v:court-29', agents: { 0: 1 } };
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitB-2' },
      { type: 'action', player: 0, action: { kind: 'secure', courtSlot: 0 } },
      { type: 'decide', player: 0, args: {} },
    ]);
    expect(s.courtDeck).toContain('v:court-29');
    expect(s.courtDiscard).not.toContain('v:court-29');
  });

  it('a Vox without a choice resolves at once', () => {
    let s = start([['suitB-2'], ['suitB-4']]);
    s.discard = ['suitA-1', 'suitD-6'];
    s.court[0] = { card: 'v:court-31', agents: { 0: 1 } };
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitB-2' },
      { type: 'action', player: 0, action: { kind: 'secure', courtSlot: 0 } },
    ]);
    expect(s.phase.type).toBe('actions');
    expect(s.players[0].hand).toEqual(['suitA-1']);
  });
});

describe('cards placed next to a played card', () => {
  it('at round end the owner takes the played card into hand and the Guild card is discarded', () => {
    let s = start([['suitC-2', 'suitA-3'], ['suitC-4', 'suitA-5']]);
    s.players[1].court = ['g:court-05'];
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitC-4', mode: 'surpass' },
      { type: 'ability', player: 1, card: 'g:court-05', ability: 'attach', args: { player: 0 } },
      { type: 'endTurn', player: 1 },
    ]);
    expect(s.players[1].hand).toContain('suitC-2');
    expect(s.discard).not.toContain('suitC-2');
    expect(s.courtDiscard).toContain('g:court-05');
  });

  it('a card of another suit cannot be chosen', () => {
    let s = start();
    s.players[0].court = ['g:court-04'];
    s = run(s, [{ type: 'lead', player: 0, card: 'suitC-2' }]);
    expect(() => dispatch(ix, s, { type: 'ability', player: 0, card: 'g:court-04', ability: 'attach', args: { player: 0 } })).toThrow(/no face-up administration/);
  });
});

describe('stealing and its protections', () => {
  it('a guard card stops a Rival stealing resources', () => {
    let s = start();
    s.players[0].court = ['g:court-20'];
    s.players[1].court = ['g:court-22'];
    s.players[1].resources = ['fuel'];
    s = run(s, [{ type: 'lead', player: 0, card: 'suitC-2' }]);
    expect(() => dispatch(ix, s, { type: 'ability', player: 0, card: 'g:court-20', ability: 'steal', args: { from: 1, slot: 0 } })).toThrow(/protected/);
  });

  it('the guard card itself can be stolen, and is then buried', () => {
    let s = start();
    s.players[0].court = ['g:court-20'];
    s.players[1].court = ['g:court-22'];
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'ability', player: 0, card: 'g:court-20', ability: 'steal', args: { from: 1, card: 'g:court-22' } },
    ]);
    expect(s.players[0].court).not.toContain('g:court-22');
    expect(s.courtDeck.at(-1)).toBe('g:court-22');
  });

  it('a lore guard stops stealing a type the thief already holds while its ambition is declared', () => {
    let s = start();
    s.players[0].court = ['g:court-20'];
    s.players[0].resources = ['fuel'];
    s.players[1].lore = ['l:lore-21'];
    s.players[1].resources = ['fuel'];
    s.ambitions.declared.relics = ['m'];
    s = run(s, [{ type: 'lead', player: 0, card: 'suitC-2' }]);
    expect(() => dispatch(ix, s, { type: 'ability', player: 0, card: 'g:court-20', ability: 'steal', args: { from: 1, slot: 0 } })).toThrow(/already hold fuel/);
  });
});

describe('declaring with cards', () => {
  it('a card lets a Surpass declare the played card ambition without zeroing it', () => {
    let s = start([['suitC-2'], ['suitC-4']]);
    s.players[1].court = ['g:court-25'];
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'endTurn', player: 0 },
      { type: 'follow', player: 1, card: 'suitC-4', mode: 'surpass', declare: true },
    ]);
    expect(s.ambitions.declared.trophies.length).toBe(1);
    expect(s.round.plays.at(-1)!.zeroed).toBeFalsy();
  });

  it('declaring an ambition a card names does not zero the lead card', () => {
    let s = start([['suitC-5'], ['suitC-4']]);
    s.players[0].court = ['g:court-18'];
    s = run(s, [{ type: 'lead', player: 0, card: 'suitC-5', declare: true }]);
    expect(s.round.plays[0].zeroed).toBe(false);
  });

  it('a lore card declares a second ambition before any action while Tycoon is declared', () => {
    let s = start([['suitC-2'], ['suitC-4']]);
    s.players[0].lore = ['l:lore-27'];
    s.players[0].resources = ['material', 'relic'];
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2', declare: true },
      { type: 'ability', player: 0, card: 'l:lore-27', ability: 'declare', args: { ambition: 'captives' } },
    ]);
    expect(s.ambitions.declared.captives.length).toBe(1);
    expect(heldResources(s.players[0])).toEqual(['relic']);
  });
});

describe('lore abilities', () => {
  it('Captives are spent in the prelude to secure while Tyrant is declared', () => {
    let s = start();
    s.players[0].lore = ['l:lore-25'];
    s.players[0].captives = [1];
    s.ambitions.declared.captives = ['m'];
    s.court[1] = { card: 'g:court-02', agents: { 0: 1 } };
    const rivalAgents = s.players[1].supply.agents;
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'ability', player: 0, card: 'l:lore-25', ability: 'captives', args: { courtSlots: [1] } },
    ]);
    expect(s.players[0].court).toContain('g:court-02');
    expect(s.players[0].captives).toEqual([]);
    expect(s.players[1].supply.agents).toBe(rivalAgents + 1);
  });

  it('clearing an Outrage discards the lore card and returns the agent', () => {
    let s = start();
    s.players[0].lore = ['l:lore-19'];
    s.players[0].outraged = ['psionic'];
    const agents = s.players[0].supply.agents;
    s = run(s, [
      { type: 'lead', player: 0, card: 'suitC-2' },
      { type: 'ability', player: 0, card: 'l:lore-19', ability: 'clear' },
    ]);
    expect(s.players[0].outraged).toEqual([]);
    expect(s.players[0].supply.agents).toBe(agents + 1);
    expect(s.loreDiscard).toEqual(['l:lore-19']);
  });
});
