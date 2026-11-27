// The campaign event phase (campaign rulebook p. 13 Resolving the Event, 14
// Imperial Council, 18 Crises, 20-21 Edicts), on the real content
// (data/content.json). The Summit (M3) and Fate Crises (M4) are not in yet.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dispatch, eventCardIds, indexContent, newCampaignGame, openSlots, runEvent } from '../../../src/game/engine';
import type { ContentIndex, EventStep, GameContent, GameState } from '../../../src/game/engine';
import { BASE_EFFECTS } from '../../../src/game/cards/base';
import { decisionOptions } from '../../../src/ui/table/decide';

const PATH = 'data/content.json';

describe.skipIf(!existsSync(PATH))('campaign event phase', () => {
  const ix: ContentIndex = indexContent(JSON.parse(readFileSync(PATH, 'utf8')) as GameContent);
  const systems = ix.content.map.systems;

  /** A 3-player Act I game after setup, chapter 1, P0 to lead. */
  function game(seed = 3): GameState {
    let s = newCampaignGame(ix, { playerCount: 3, seed, firstPlayer: 0 });
    while (s.phase.type === 'campaignSetup') {
      const p = s.campaign!.placements[0];
      const d = systems.find((x) => x.kind === 'planet' && s.map[x.id].imperial && s.map[x.id].buildings.length < (x.slots ?? 0))!;
      s = dispatch(ix, s, { type: 'place', player: p, system: d.id, building: s.players[p].supply.cities > 3 ? 'city' : 'starport' });
    }
    return s;
  }

  /** Runs event steps on `s` (in place); true once the phase is over. */
  function run(s: GameState, steps: EventStep[]): boolean {
    let done = false;
    s.campaign!.eventSteps = steps;
    runEvent(ix, s, () => (done = true));
    return done;
  }

  /** Answers the next queued event Decision with `args` through the `decide` command. */
  function answer(s: GameState, args: Record<string, unknown> = {}): GameState {
    const decision = s.pendingDecisions!.shift()!;
    s.phase = { type: 'decide', decision, resume: { type: 'lead' } };
    return dispatch(ix, s, { type: 'decide', player: decision.player, args });
  }

  /** Clears every ship, Blight and building from the map. */
  function emptyMap(s: GameState): void {
    for (const x of Object.values(s.map)) {
      x.ships = {};
      x.buildings = [];
      delete x.imperial;
      delete x.blight;
    }
  }

  describe('resolving the event (p. 13-14)', () => {
    it('rolls the dice at the end of a round with an Event card and goes back to the lead', () => {
      let s = game();
      const event = eventCardIds(ix.content.campaign!)[0];
      const pool = ix.content.actionCards.map((a) => a.id).filter((c) => c !== 'construction-2');
      s.players[0].hand = ['construction-2', pool[0]];
      s.players[1].hand = [event, pool[1]];
      s.players[2].hand = [pool[2], pool[3]];
      s = dispatch(ix, dispatch(ix, s, { type: 'lead', player: 0, card: 'construction-2' }), { type: 'endTurn', player: 0 });
      s = dispatch(ix, dispatch(ix, s, { type: 'follow', player: 1, card: event, mode: 'event' }), { type: 'endTurn', player: 1 });
      s = dispatch(ix, dispatch(ix, s, { type: 'follow', player: 2, card: pool[2], mode: 'copy' }), { type: 'endTurn', player: 2 });
      expect(s.log.some((l) => l.text.startsWith('Event dice:'))).toBe(true);
      for (let k = 0; s.phase.type === 'decide' && k < 20; k++) s = dispatch(ix, s, { type: 'decide', player: s.phase.decision.player });
      expect(s.phase).toEqual({ type: 'lead' });
      expect(s.campaign!.eventSteps).toBeUndefined();
    });

    // lore-19 "if you roll any dice (even outside battle), you may reroll any number of them once": the event
    // and number dice, rolled by the player with initiative (p. 13).
    it('offers the roller a card that rerolls any dice before the event dice resolve, and only then', () => {
      // This test needs the cards' effects, which the other tests here leave out.
      const fx = indexContent(JSON.parse(readFileSync(PATH, 'utf8')) as GameContent, BASE_EFFECTS);
      const roll = (s: GameState, steps: EventStep[]) => {
        let done = false;
        s.campaign!.eventSteps = steps;
        runEvent(fx, s, () => (done = true));
        return done;
      };
      let s = game();
      s.pendingDecisions = [];
      s.players[s.initiative].lore = ['lore-19'];
      expect(roll(s, [{ kind: 'roll' }])).toBe(true);
      s.ambitions.declared.psionics = [s.ambitions.available.shift()!];
      expect(roll(s, [{ kind: 'roll' }, { kind: 'eventDie' }])).toBe(false);
      expect(s.pendingDecisions).toEqual([{ player: s.initiative, card: 'lore-19', effect: 'event:reroll' }]);
      const decision = s.pendingDecisions!.shift()!;
      s.phase = { type: 'decide', decision, resume: { type: 'lead' } };
      s = dispatch(fx, s, { type: 'decide', player: decision.player, args: { dice: 'both' } });
      expect(s.log.some((l) => l.text.includes('rerolls the event and number dice with lore-19'))).toBe(true);
      // The rerolled dice are the ones that resolve: the Crises or the Edicts come next.
      expect(s.log.some((l) => l.text.startsWith('Crises') || l.text.startsWith('Edicts'))).toBe(true);
    });

    it('makes a Regent who secured the Council the First Regent, then asks Crises or Edicts', () => {
      let s = game();
      s.campaign!.trust = ['relic'];
      expect(run(s, [{ kind: 'summit', player: 2 }, { kind: 'councilTitle', player: 2 }, { kind: 'councilChoice', player: 2 }])).toBe(false);
      expect(s.campaign!.firstRegent).toBe(2);
      expect(s.campaign!.trust).toEqual(['relic']);
      expect(s.pendingDecisions![0]).toMatchObject({ player: 2, effect: 'event:choice' });
      s = answer(s, { resolve: 'edicts' });
      // The Edicts start with Govern the Imperial Reach, for the new First Regent.
      expect(s.phase.type === 'decide' && s.phase.decision).toMatchObject({ player: 2, effect: 'event:govern' });
    });

    it('lets an Outlaw who secured the Council steal from the Trust, the First Regent losing 1 Power each', () => {
      let s = game();
      const c = s.campaign!;
      c.titles[1] = 'outlaw';
      c.firstRegent = 0;
      s.players[0].power = 5;
      c.trust = ['relic', 'fuel', 'fuel', 'weapons', 'material', 'material', 'fuel'];
      s.players[1].resources = s.players[1].resources.map(() => null);
      run(s, [{ kind: 'councilTitle', player: 1 }]);
      const max = s.pendingDecisions![0].data!.max as number;
      expect(s.pendingDecisions![0]).toMatchObject({ effect: 'event:steal' });
      expect(max).toBe(openSlots(ix.content, s.players[1]).length);
      expect(max).toBeGreaterThanOrEqual(2);
      s = answer(s, { resources: ['relic', 'weapons'] });
      expect(s.campaign!.trust).toEqual(['fuel', 'fuel', 'material', 'material', 'fuel']);
      expect(s.players[1].resources.filter(Boolean).sort()).toEqual(['relic', 'weapons']);
      expect(s.players[0].power).toBe(3);
      expect(s.campaign!.firstRegent).toBe(0);
    });
  });

  describe('Crises (p. 18)', () => {
    it('Blight hits the Imperial ships first, then each player’s ships, fresh before damaged', () => {
      const s = game();
      emptyMap(s);
      const sys = systems[0].id;
      s.map[sys].blight = { fresh: 1, damaged: 0 };
      s.map[sys].imperial = { fresh: 1, damaged: 0 };
      s.map[sys].ships = { 0: { fresh: 1, damaged: 0 }, 1: { fresh: 0, damaged: 1 } };
      const imperial = s.campaign!.supply.imperialShips;
      const ships1 = s.players[1].supply.ships;
      run(s, [{ kind: 'blight' }]);
      // 3 hits: the fresh Imperial ship takes 2 and is destroyed, the 3rd hits 1 ship of each player.
      expect(s.map[sys].imperial).toEqual({ fresh: 0, damaged: 0 });
      expect(s.campaign!.supply.imperialShips).toBe(imperial + 1);
      expect(s.map[sys].ships[0]).toEqual({ fresh: 0, damaged: 1 });
      expect(s.map[sys].ships[1]).toEqual({ fresh: 0, damaged: 0 });
      expect(s.players[1].supply.ships).toBe(ships1 + 1);
    });

    it('a damaged Blight deals 1 hit', () => {
      const s = game();
      emptyMap(s);
      const sys = systems[0].id;
      s.map[sys].blight = { fresh: 0, damaged: 1 };
      s.map[sys].ships = { 2: { fresh: 2, damaged: 0 } };
      run(s, [{ kind: 'blight' }]);
      expect(s.map[sys].ships[2]).toEqual({ fresh: 1, damaged: 1 });
    });

    it('rolls the dice for the Court Crises when the Council chose them', () => {
      const s = game();
      s.court = [{ card: 'imperial-council', agents: {} }];
      run(s, [{ kind: 'crises' }]);
      expect(s.log.some((l) => l.text.startsWith('Event dice:'))).toBe(true);
    });

    it('Blight Looms repairs the rolled cluster, spreads to the rolled symbol and is buried', () => {
      const s = game();
      emptyMap(s);
      const inCluster = systems.find((d) => d.cluster === 'c2' && d.idSymbol !== 'crescent')!;
      s.map[inCluster.id].blight = { fresh: 0, damaged: 1 };
      s.campaign!.rolled = { kind: 'crisis', symbol: 'crescent', number: 2 };
      s.court = [{ card: 'imperial-council', agents: {} }, { card: 'court-cc-15', agents: { 1: 2 } }];
      const agents = s.players[1].supply.agents;
      const top = s.courtDeck[0];
      run(s, [{ kind: 'crises' }]);
      expect(s.map[inCluster.id].blight).toEqual({ fresh: 1, damaged: 0 });
      const crescents = systems.filter((d) => d.kind === 'planet' && d.idSymbol === 'crescent');
      expect(crescents.length).toBeGreaterThan(0);
      expect(crescents.every((d) => s.map[d.id].blight?.damaged === 1)).toBe(true);
      // Buried: bottom of the Court deck; the agents return; the Court refills.
      expect(s.courtDeck.at(-1)).toBe('court-cc-15');
      expect(s.players[1].supply.agents).toBe(agents + 2);
      expect(s.court[1].card).toBe(top);
    });

    it('Populist Demands returns the declared marker of highest Power; an attached card resolves first', () => {
      const s = game();
      emptyMap(s);
      const [hi, mid] = s.ambitions.available;
      s.ambitions.available = s.ambitions.available.slice(2);
      const [a, b] = Object.keys(s.ambitions.declared) as (keyof typeof s.ambitions.declared)[];
      s.ambitions.declared[a] = [mid];
      s.ambitions.declared[b] = [hi];
      s.campaign!.rolled = { kind: 'crisis', symbol: 'hexagon', number: 1 };
      s.court = [{ card: 'court-cc-11', agents: {}, attached: 'court-cc-15' }];
      run(s, [{ kind: 'crises' }]);
      expect(s.ambitions.declared[b]).toEqual([]);
      expect(s.ambitions.available[0]).toBe(hi);
      const order = s.log.map((l) => l.text).filter((t) => t.startsWith('Blight Looms') || t.startsWith('Populist'));
      expect(order[0]).toMatch(/^Blight Looms/);
    });

    it('Council Intrigue flips the Council In Session and moves its agents there', () => {
      const s = game();
      s.campaign!.council = 'decided';
      s.campaign!.rolled = { kind: 'crisis', symbol: 'hexagon', number: 1 };
      s.court = [{ card: 'imperial-council', agents: { 0: 1 } }, { card: 'court-cc-12', agents: { 0: 1, 2: 2 } }];
      run(s, [{ kind: 'crises' }]);
      expect(s.campaign!.council).toBe('in-session');
      expect(s.court[0].agents).toEqual({ 0: 2, 2: 2 });
      expect(s.courtDeck.at(-1)).toBe('court-cc-12');
    });

    it('Diplomatic Fiasco: discard Guild cards down to the agents in supply', () => {
      let s = game();
      const guilds = ix.content.courtCards.filter((x) => x.kind === 'faction' && x.keys !== 'X').map((x) => x.id);
      s.players[0].court = guilds.slice(0, 3);
      s.players[0].supply.agents = 1;
      s.players[1].court = guilds.slice(3, 4);
      s.players[1].supply.agents = 0;
      s.campaign!.rolled = { kind: 'crisis', symbol: 'hexagon', number: 1 };
      s.court = [{ card: 'court-cc-13', agents: {} }];
      run(s, [{ kind: 'crises' }]);
      expect(s.players[1].court).toEqual([]); // the only choice: no Decision
      expect(s.pendingDecisions![0]).toMatchObject({ player: 0, effect: 'event:fiasco', data: { discard: 2 } });
      s = answer(s, { cards: [guilds[0], guilds[2]] });
      expect(s.players[0].court).toEqual([guilds[1]]);
      expect(s.courtDiscard).toEqual(expect.arrayContaining([guilds[0], guilds[2], guilds[3]]));
    });

    it('Song of Freedom: the player with the most Power replaces a city of theirs with a Free city', () => {
      const s = game();
      s.players[2].power = 4;
      s.campaign!.rolled = { kind: 'crisis', symbol: 'hexagon', number: 1 };
      s.court = [{ card: 'court-cc-14', agents: {} }];
      const count = (owner: 2 | 'free') => Object.values(s.map).flatMap((x) => x.buildings).filter((b) => b.owner === owner && b.type === 'city').length;
      const [mine, free] = [count(2), count('free')];
      const cities = s.players[2].supply.cities;
      run(s, [{ kind: 'crises' }]);
      while (s.pendingDecisions?.length) Object.assign(s, answer(s));
      expect(count(2)).toBe(mine - 1);
      expect(count('free')).toBe(free + 1);
      expect(s.players[2].supply.cities).toBe(cities + 1);
    });
  });

  describe('Edicts (p. 20-21)', () => {
    /** P0 First Regent, the Policy on top, everyone's resources cleared. */
    function govern(policy: 'edict-03' | 'edict-04' | 'edict-05'): GameState {
      const s = game();
      const rest = ['edict-03', 'edict-04', 'edict-05'].filter((x) => x !== policy);
      s.campaign!.booklet.edicts = [[policy, ...rest]];
      s.campaign!.firstRegent = 0;
      for (const p of s.players) p.resources = p.resources.map(() => null);
      return s;
    }

    it('the table offers keeping the Policy beside each change (the empty answer enforces it)', () => {
      let s = govern('edict-04');
      run(s, [{ kind: 'edicts' }]);
      const decision = s.pendingDecisions!.shift()!;
      s = { ...s, phase: { type: 'decide', decision, resume: { type: 'lead' } } };
      const options = decisionOptions(ix, s, decision.player);
      expect(options.filter((o) => o.args.change).map((o) => o.args.change)).toEqual(['edict-03', 'edict-05']);
      expect(options.some((o) => !o.parts.length)).toBe(true);
    });

    it('changing the Policy puts another Govern card on top', () => {
      let s = govern('edict-04');
      run(s, [{ kind: 'edicts' }]);
      s = answer(s, { change: 'edict-03' });
      expect(s.campaign!.booklet.edicts[0][0]).toBe('edict-03');
      expect(s.campaign!.booklet.edicts[0]).toHaveLength(3);
    });

    it('Peace: Relic or Psionic from each Rival Regent (else a Favor), 1 of the First Regent’s own, then city bonus Power', () => {
      let s = govern('edict-04');
      s.players[1].resources[0] = 'relic';
      s.players[0].resources[0] = 'psionic';
      s.players[0].supply.cities = ix.content.citiesPerPlayer - 4; // 4 cities built: the 4th city slot's bonus is uncovered
      const agents2 = s.players[2].supply.agents;
      const power = s.players.map((p) => p.power);
      run(s, [{ kind: 'edicts' }]);
      s = answer(s);
      expect([...s.campaign!.trust].sort()).toEqual(['psionic', 'relic']);
      expect(s.campaign!.favors[0]).toEqual([2]);
      expect(s.players[2].supply.agents).toBe(agents2 - 1);
      expect(s.players[0].power).toBe(power[0] + ix.content.playerBoard.cityBonusPower[3]);
      expect(s.phase).toEqual({ type: 'lead' });
    });

    it('Escalation: the First Regent picks the Demand, then 2 fresh Imperial ships go to an Empire-controlled system', () => {
      let s = govern('edict-05');
      s.players[1].resources[0] = 'fuel';
      s.players[1].resources[1] = 'material';
      run(s, [{ kind: 'edicts' }]);
      s = answer(s);
      expect(s.phase.type === 'decide' && s.phase.decision.effect).toBe('event:demand');
      s = dispatch(ix, s, { type: 'decide', player: 0, args: { take: { 1: 'material' } } });
      expect(s.campaign!.trust).toEqual(['material']);
      expect(s.players[1].resources.filter(Boolean)).toEqual(['fuel']);
      expect(s.phase.type === 'decide' && s.phase.decision.effect).toBe('event:escalation');
      const target = (s.phase.type === 'decide' && (s.phase.decision.data!.options as string[])[1])!;
      const before = s.map[target].imperial!.fresh;
      s = dispatch(ix, s, { type: 'decide', player: 0, args: { system: target } });
      expect(s.map[target].imperial!.fresh).toBe(before + 2);
    });

    it('War: a Weapon to each Regent from the supply, then from the Trust; the First Regent chooses when short', () => {
      let s = govern('edict-03');
      s.resourceSupply.weapons = 1;
      s.campaign!.trust = ['weapons'];
      run(s, [{ kind: 'edicts' }]);
      s = answer(s);
      expect(s.phase.type === 'decide' && s.phase.decision).toMatchObject({ effect: 'event:weapons', data: { count: 2 } });
      s = dispatch(ix, s, { type: 'decide', player: 0, args: { players: [2, 1] } });
      expect(s.players[1].resources).toContain('weapons');
      expect(s.players[2].resources).toContain('weapons');
      expect(s.players[0].resources).not.toContain('weapons');
      expect(s.resourceSupply.weapons).toBe(0);
      expect(s.campaign!.trust).toEqual([]);
    });

    it('War demands a trophy of a non-Regent piece, else a Favor', () => {
      let s = govern('edict-03');
      s.players[1].trophies = [{ owner: 2, piece: 'ship' }, { owner: 'blight', piece: 'blight' }];
      s.players[2].trophies = [{ owner: 'empire', piece: 'ship' }];
      run(s, [{ kind: 'edicts' }]);
      s = answer(s);
      expect(s.players[0].trophies).toEqual([{ owner: 'blight', piece: 'blight' }]);
      expect(s.campaign!.favors[0]).toEqual([2]);
    });

    it('Guild Envoys Depart (2 players) buries the Guild cards without agents', () => {
      const s = game();
      s.campaign!.booklet.edicts = [['edict-02']];
      s.court = [
        { card: 'imperial-council', agents: {} },
        { card: 'court-cc-01', agents: {} },
        { card: 'court-cc-02', agents: { 1: 1 } },
        { card: 'court-cc-11', agents: {} },
      ];
      run(s, [{ kind: 'edicts' }]);
      expect(s.courtDeck.at(-1)).toBe('court-cc-01');
      expect(s.court.map((x) => x.card)).toContain('court-cc-02');
      expect(s.court.map((x) => x.card)).toContain('court-cc-11');
    });
  });
});
