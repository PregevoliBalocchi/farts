// The battle's animation plan (src/ui/table/battle.ts volleyPlan, hitEvents) and
// the battle test scenario (src/ui/table/scenario.ts battleScenario).
import { describe, expect, it } from 'vitest';
import { activePlayer, dispatch } from '../../../src/game/engine';
import { hitEvents, VOLLEY, volleyPlan } from '../../../src/ui/table/battle';
import type { BattleAfter } from '../../../src/ui/table/battle';
import { BATTLE_SCENARIO, battleScenario } from '../../../src/ui/table/scenario';
import { game, index } from '../engine/fixture';

/** Whether action card `id` belongs to a suit that can battle. */
const canBattle = (ix: ReturnType<typeof index>, id: string) => (ix.content.suits[ix.actionCards.get(id)?.suit ?? ''] ?? []).includes('battle');

const after = (a: [number, number, number], d: [number, number, number], buildings: BattleAfter['buildings'] = []): BattleAfter => ({
  attacker: { fresh: a[0], damaged: a[1], destroyed: a[2] },
  defender: { fresh: d[0], damaged: d[1], destroyed: d[2] },
  buildings,
});

describe('volleyPlan', () => {
  it('fires a laser per skirmish hit and a missile per assault hit, die after die', () => {
    const shots = volleyPlan([
      { type: 'skirmish', face: { hit: 1 } },
      { type: 'assault', face: { hit: 2, selfHit: 1 } },
    ]);
    expect(shots.map((s) => [s.die, s.from, s.weapon, s.hit])).toEqual([
      [0, 'attacker', 'laser', true],
      [1, 'attacker', 'missile', true],
      [1, 'attacker', 'missile', true],
      [1, 'defender', 'laser', true],
    ]);
    expect(shots[0].delay).toBe(VOLLEY.start);
    expect(shots[1].delay).toBe(VOLLEY.start + VOLLEY.dieGap);
    expect(shots[2].delay).toBeCloseTo(VOLLEY.start + VOLLEY.dieGap + VOLLEY.shotGap);
  });

  it('fires one missed shot for a blank face', () => {
    expect(volleyPlan([{ type: 'skirmish', face: {} }])).toEqual([{ delay: VOLLEY.start, die: 0, from: 'attacker', weapon: 'laser', at: 'ship', hit: false }]);
  });

  it('sends missiles at buildings for building hits and a tractor beam for keys', () => {
    const shots = volleyPlan([{ type: 'raid', face: { buildingHit: 1, key: 1 } }]);
    expect(shots.map((s) => [s.weapon, s.at])).toEqual([
      ['missile', 'building'],
      ['tractor', 'building'],
    ]);
  });
});

describe('hitEvents', () => {
  it('reports a fresh ship damaged at the end of the damaged ships', () => {
    expect(hitEvents(after([3, 0, 0], [2, 1, 0]), after([3, 0, 0], [1, 2, 0]))).toEqual([{ piece: 'defender', index: 1, to: 'damaged' }]);
  });

  it('reports a damaged ship destroyed by its place before the hit', () => {
    expect(hitEvents(after([3, 0, 0], [2, 1, 0]), after([3, 0, 0], [2, 0, 1]))).toEqual([{ piece: 'defender', index: 0, to: 'destroyed', was: 'damaged' }]);
  });

  it('reports a fresh ship hit twice as destroyed from the fresh ships', () => {
    expect(hitEvents(after([1, 0, 0], [0, 0, 0]), after([0, 0, 1], [0, 0, 0]))).toEqual([{ piece: 'attacker', index: 0, to: 'destroyed', was: 'fresh' }]);
  });

  it('reports buildings damaged and destroyed', () => {
    expect(hitEvents(after([1, 0, 0], [0, 0, 0], ['ok', 'damaged']), after([1, 0, 0], [0, 0, 0], ['damaged', 'destroyed']))).toEqual([
      { piece: 'building', index: 0, to: 'damaged' },
      { piece: 'building', index: 1, to: 'destroyed' },
    ]);
  });

  it('reports nothing when hits were taken back', () => {
    expect(hitEvents(after([3, 0, 0], [1, 2, 0]), after([3, 0, 0], [2, 1, 0]))).toEqual([]);
  });
});

describe('battleScenario', () => {
  it('gives the leader a card that can battle and a rival fleet with buildings in one of its systems', () => {
    const ix = index();
    const s = game(ix, 3, 1);
    const me = activePlayer(s)!;
    const next = battleScenario(ix, s);
    expect(next.players[me].hand.some((c) => canBattle(ix, c))).toBe(true);
    const rival = (me + 1) % 3;
    const sys = Object.values(next.map).find((x) => (x.ships[me]?.fresh ?? 0) > 0 && x.buildings.some((b) => b.owner === rival));
    expect(sys).toBeDefined();
    expect(sys!.ships[rival]).toEqual(BATTLE_SCENARIO.defender);
    expect(sys!.buildings.filter((b) => b.owner === rival).map((b) => b.type)).toEqual(['city', 'starport']);
  });

  it('leaves a battle the engine accepts', () => {
    const ix = index();
    let s = battleScenario(ix, game(ix, 3, 1));
    const me = activePlayer(s)!;
    const rival = (me + 1) % 3;
    const card = s.players[me].hand.find((c) => canBattle(ix, c))!;
    s = dispatch(ix, s, { type: 'lead', player: me, card });
    const sys = Object.values(s.map).find((x) => (x.ships[me]?.fresh ?? 0) > 0 && x.buildings.some((b) => b.owner === rival))!;
    s = dispatch(ix, s, { type: 'action', player: me, action: { kind: 'battle', system: sys.id, target: rival, dice: { skirmish: 1 } } });
    expect(s.phase.type).toBe('allocate');
  });

  it('changes nothing outside the lead phase', () => {
    const ix = index();
    const s = game(ix, 3, 1);
    const moved = { ...s, phase: { type: 'actions' } } as unknown as typeof s;
    expect(battleScenario(ix, moved)).toBe(moved);
  });
});
