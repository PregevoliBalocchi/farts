// The Empire, the Free States and the Blight in actions and battle
// (campaign rulebook p. 10-11, 15, 19; design/campaign-plan.md §2.1 item 3, §2.3).
import { describe, expect, it } from 'vitest';
import { dispatch, HANDLERS, newCampaign } from '../../../src/game/engine';
import type { DieFace, GameContent, GameState, Title } from '../../../src/game/engine';
import { content, game, index, setHands } from './fixture';

/** Index with fixed skirmish and raid faces, and the campaign's Free States raid cost. */
function fixed(skirmish: DieFace, raid: DieFace = { key: 1 }) {
  const c = content();
  c.dice.skirmish = [skirmish];
  c.dice.raid = [raid];
  c.maxDicePerType = 6;
  c.campaign = { freeStatesRaid: { keys: 1, resources: 1 } } as unknown as GameContent['campaign'];
  return index(c);
}
type Ix = ReturnType<typeof fixed>;

/** A 2-player campaign game at c1-p3, P0 to act (lead suitB-2: battle, move, secure); P1 is the First Regent. */
function ready(ix: Ix, titles: Title[] = ['outlaw', 'regent']): GameState {
  const s = game(ix, 2, 5, 0, 'setup-2a');
  setHands(s, [['suitB-2'], ['suitA-4']]);
  s.campaign = newCampaign(2);
  s.campaign.titles = titles;
  s.campaign.firstRegent = 1;
  s.map['c1-p3'].ships = { 0: { fresh: 4, damaged: 0 } };
  s.map['c1-p3'].buildings = [];
  return dispatch(ix, s, { type: 'lead', player: 0, card: 'suitB-2' });
}
const battle = (ix: Ix, s: GameState, target: number | 'empire' | 'free' | 'blight', dice: Record<string, number>, withImperial?: boolean) =>
  dispatch(ix, s, { type: 'action', player: 0, action: { kind: 'battle', system: 'c1-p3', target, dice, ...(withImperial ? { withImperial } : {}) } });

describe('battles with the Empire (p. 11)', () => {
  it('makes a Regent defend with the Imperial ships there: they intercept and take hits before buildings', () => {
    const ix = fixed({ intercept: 1 });
    const s0 = ready(ix);
    s0.map['c1-p3'].ships[1] = { fresh: 1, damaged: 0 };
    s0.map['c1-p3'].imperial = { fresh: 1, damaged: 0 };
    expect(battle(ix, s0, 1, { skirmish: 1 }).phase).toMatchObject({ battle: { interceptHits: 2 } });

    const ix2 = fixed({ hit: 1 });
    const s1 = ready(ix2);
    s1.map['c1-p3'].ships[1] = { fresh: 1, damaged: 0 };
    s1.map['c1-p3'].imperial = { fresh: 1, damaged: 0 };
    s1.map['c1-p3'].buildings = [{ owner: 1, type: 'city', damaged: false }];
    const r = battle(ix2, s1, 1, { skirmish: 4 });
    const alloc = (hits: unknown[]) => dispatch(ix2, r, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: hits as never, buildingHits: [] } });
    expect(() => alloc(['fresh', 'damaged', { building: 0 }, { building: 0 }])).toThrow(/Hits go to ships/);
    const s = alloc(['fresh', 'damaged', { imperial: 'fresh' }, { imperial: 'damaged' }]);
    expect(s.map['c1-p3'].imperial).toEqual({ fresh: 0, damaged: 0 });
    expect(s.players[0].trophies).toEqual([
      { owner: 1, piece: 'ship' },
      { owner: 'empire', piece: 'ship' },
    ]);
  });

  it("lets only an Outlaw choose the Empire, whose ships defend and whose First Regent takes the Outlaw's losses", () => {
    const ix = fixed({ intercept: 1 });
    const s0 = ready(ix);
    s0.map['c1-p3'].imperial = { fresh: 2, damaged: 0 };
    const r = battle(ix, s0, 'empire', { skirmish: 1 });
    expect(r.phase).toMatchObject({ battle: { target: 'empire', interceptHits: 2 } });
    const s = dispatch(ix, r, { type: 'allocate', player: 0, allocation: { selfHits: ['fresh', 'damaged'], hits: [], buildingHits: [] } });
    expect(s.players[1].trophies).toEqual([{ owner: 0, piece: 'ship' }]);

    const regent = ready(ix, ['regent', 'regent']);
    regent.map['c1-p3'].imperial = { fresh: 2, damaged: 0 };
    expect(() => battle(ix, regent, 'empire', { skirmish: 1 })).toThrow(/Only Outlaws/);
  });

  it('forbids Regents to battle or tax Rival Regents in systems with Imperial ships (Truce Law)', () => {
    const ix = fixed({ hit: 1 });
    const s = ready(ix, ['regent', 'regent']);
    s.map['c1-p3'].ships[1] = { fresh: 1, damaged: 0 };
    s.map['c1-p3'].buildings = [{ owner: 1, type: 'city', damaged: false }];
    s.map['c1-p3'].imperial = { fresh: 0, damaged: 1 };
    expect(() => battle(ix, s, 1, { skirmish: 1 })).toThrow(/Truce Law/);
    expect(() => HANDLERS.tax(ix, s, 0, { kind: 'tax', system: 'c1-p3', cityOwner: 1 })).toThrow(/Truce Law/);
  });

  it('lets a Regent Commanding the Imperial Fleet add its ships to the attack, taking self-hits on them', () => {
    const ix = fixed({ selfHit: 1 });
    const s0 = ready(ix, ['regent', 'outlaw']);
    s0.map['c1-p3'].ships[1] = { fresh: 1, damaged: 0 };
    s0.map['c1-p3'].imperial = { fresh: 2, damaged: 0 };
    expect(() => battle(ix, s0, 1, { skirmish: 6 })).toThrow(/At most one die/);
    const r = battle(ix, s0, 1, { skirmish: 6 }, true);
    const s = dispatch(ix, r, { type: 'allocate', player: 0, allocation: { selfHits: ['fresh', 'fresh', 'fresh', 'fresh', { imperial: 'fresh' }, { imperial: 'fresh' }], hits: [], buildingHits: [] } });
    expect(s.map['c1-p3'].imperial).toEqual({ fresh: 0, damaged: 2 });

    const outlaw = ready(ix);
    outlaw.map['c1-p3'].ships[1] = { fresh: 1, damaged: 0 };
    outlaw.map['c1-p3'].imperial = { fresh: 2, damaged: 0 };
    expect(() => battle(ix, outlaw, 1, { skirmish: 1 }, true)).toThrow(/Command Imperial ships/);
  });
});

describe('battles with the Free States (p. 15)', () => {
  it('hits Free buildings like buildings, takes them as trophies, Provokes Outrage and raids 1 resource of the planet type', () => {
    const ix = fixed({ hit: 1 }, { buildingHit: 1, key: 1 });
    const s0 = ready(ix);
    s0.map['c1-p3'].buildings = [{ owner: 'free', type: 'city', damaged: false }];
    const r = battle(ix, s0, 'free', { raid: 2 });
    expect(r.phase).toMatchObject({ battle: { interceptHits: 0 } });
    expect(() => dispatch(ix, r, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: [], buildingHits: [0, 0], raid: [{ free: true }, { free: true }] } })).toThrow(/exactly 1 resource/);
    const s = dispatch(ix, r, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: [], buildingHits: [0, 0], raid: [{ free: true }] } });
    expect(s.map['c1-p3'].buildings).toEqual([]);
    expect(s.players[0].trophies).toEqual([{ owner: 'free', piece: 'city' }]);
    expect(s.players[0].outraged).toEqual(['psionic']);
    // The raid comes after Provoking Outrage, so the psionic it gains stays.
    expect(s.players[0].resources).toContain('psionic');
  });
});

describe('battles with the Blight (p. 19)', () => {
  it('takes 2 hits to damage a Blight, a lone hit does nothing, and it never intercepts', () => {
    const ix = fixed({ hit: 1, intercept: 1 });
    const s0 = ready(ix);
    s0.map['c1-p3'].blight = { fresh: 1, damaged: 0 };
    const r = battle(ix, s0, 'blight', { skirmish: 3 });
    expect(r.phase).toMatchObject({ battle: { interceptHits: 0 } });
    expect(() => dispatch(ix, r, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: [], buildingHits: [] } })).toThrow(/every hit/);
    const s = dispatch(ix, r, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: [{ blight: 'fresh' }], buildingHits: [] } });
    expect(s.map['c1-p3'].blight).toEqual({ fresh: 0, damaged: 1 });
  });

  it('destroys a Blight with 4 hits and keeps it as a trophy', () => {
    const ix = fixed({ hit: 1 });
    const s0 = ready(ix);
    s0.map['c1-p3'].blight = { fresh: 1, damaged: 0 };
    const r = battle(ix, s0, 'blight', { skirmish: 4 });
    const s = dispatch(ix, r, { type: 'allocate', player: 0, allocation: { selfHits: [], hits: [{ blight: 'fresh' }, { blight: 'damaged' }], buildingHits: [] } });
    expect(s.map['c1-p3'].blight).toEqual({ fresh: 0, damaged: 0 });
    expect(s.players[0].trophies).toEqual([{ owner: 'blight', piece: 'blight' }]);
  });
});

describe('acting with Imperial ships and Free buildings (p. 10, 15)', () => {
  it('makes an Outlaw build damaged where the Empire controls, and a Regent with Loyal pieces there build fresh', () => {
    const ix = fixed({ hit: 1 });
    for (const [title, damaged] of [['outlaw', true], ['regent', false]] as const) {
      const s = ready(ix, [title, 'regent']);
      s.map['c1-p3'].buildings = [{ owner: 0, type: 'starport', damaged: false }];
      s.map['c1-p3'].imperial = { fresh: 1, damaged: 0 };
      HANDLERS.build(ix, s, 0, { kind: 'build', system: 'c1-p3', what: 'ship' });
      expect(s.map['c1-p3'].ships[0]).toEqual({ fresh: damaged ? 4 : 5, damaged: damaged ? 1 : 0 });
    }
  });

  it('taxes a Free city in a system you control, capturing no agent', () => {
    const ix = fixed({ hit: 1 });
    const s = ready(ix);
    s.map['c1-p3'].buildings = [{ owner: 'free', type: 'city', damaged: false }];
    HANDLERS.tax(ix, s, 0, { kind: 'tax', system: 'c1-p3', cityOwner: 'free' });
    expect(s.players[0].resources).toContain('psionic');
    expect(s.players[0].captives).toEqual([]);
    const rival = ready(ix);
    rival.map['c1-p3'].buildings = [{ owner: 'free', type: 'city', damaged: false }];
    rival.map['c1-p3'].ships[1] = { fresh: 5, damaged: 0 };
    expect(() => HANDLERS.tax(ix, rival, 0, { kind: 'tax', system: 'c1-p3', cityOwner: 'free' })).toThrow(/system you control/);
  });

  it('builds ships at a Free starport in a system you control', () => {
    const ix = fixed({ hit: 1 });
    const s = ready(ix);
    s.map['c1-p3'].buildings = [{ owner: 'free', type: 'starport', damaged: false }];
    HANDLERS.build(ix, s, 0, { kind: 'build', system: 'c1-p3', what: 'ship' });
    expect(s.map['c1-p3'].ships[0]).toEqual({ fresh: 5, damaged: 0 });
  });

  it('repairs Imperial ships only for a Regent Commanding them, and Free buildings where you control', () => {
    const ix = fixed({ hit: 1 });
    const s = ready(ix, ['regent', 'regent']);
    s.map['c1-p3'].imperial = { fresh: 1, damaged: 1 };
    s.map['c1-p3'].buildings = [{ owner: 'free', type: 'city', damaged: true }];
    HANDLERS.repair(ix, s, 0, { kind: 'repair', system: 'c1-p3', target: 'ship', whose: 'imperial' });
    expect(s.map['c1-p3'].imperial).toEqual({ fresh: 2, damaged: 0 });
    // The Empire controls this system: on P0's turn P0 does, by the Presence Law, so the Free city can be repaired.
    HANDLERS.repair(ix, s, 0, { kind: 'repair', system: 'c1-p3', target: 'building', whose: 'free' });
    expect(s.map['c1-p3'].buildings[0].damaged).toBe(false);
    const o = ready(ix);
    o.map['c1-p3'].imperial = { fresh: 1, damaged: 1 };
    expect(() => HANDLERS.repair(ix, o, 0, { kind: 'repair', system: 'c1-p3', target: 'ship', whose: 'imperial' })).toThrow(/Command Imperial ships/);
  });

  it('moves Imperial ships with Loyal ones, at most one each (Movement Law)', () => {
    const ix = fixed({ hit: 1 });
    const s = ready(ix, ['regent', 'regent']);
    s.map['c1-p3'].ships[0] = { fresh: 1, damaged: 0 };
    s.map['c1-p3'].imperial = { fresh: 2, damaged: 0 };
    expect(() => HANDLERS.move(ix, structuredClone(s), 0, { kind: 'move', from: 'c1-p3', to: 'c1-gate', ships: 1, imperial: 2 })).toThrow(/Movement Law/);
    HANDLERS.move(ix, s, 0, { kind: 'move', from: 'c1-p3', to: 'c1-gate', ships: 1, imperial: 1 });
    expect(s.map['c1-gate'].imperial).toEqual({ fresh: 1, damaged: 0 });
    expect(s.map['c1-p3'].imperial).toEqual({ fresh: 1, damaged: 0 });
  });

  it('ends a Catapult move at a gate with Blight', () => {
    const ix = fixed({ hit: 1 });
    const s = ready(ix, ['regent', 'regent']);
    s.map['c1-p3'].buildings = [{ owner: 0, type: 'starport', damaged: false }];
    s.map['c1-gate'].blight = { fresh: 0, damaged: 1 };
    expect(() => HANDLERS.move(ix, s, 0, { kind: 'move', from: 'c1-p3', via: ['c1-gate'], to: 'c2-gate', ships: 1 })).toThrow(/stop at c1-gate/);
  });

  it('keeps the base game free of campaign defenders', () => {
    const ix = fixed({ hit: 1 });
    const s = ready(ix);
    delete s.campaign;
    expect(() => battle(ix, s, 'blight', { skirmish: 1 })).toThrow(/campaign defenders/);
  });
});
