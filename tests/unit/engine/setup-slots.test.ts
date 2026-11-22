import { describe, expect, it } from 'vitest';
import { indexContent, newGame } from '../../../src/game/engine';
import type { GameContent } from '../../../src/game/engine';
import { content } from './fixture';

/** Example content plus one A/B/C setup card, two leaders and an open link. */
function slotContent(): GameContent {
  const c = content();
  c.leaders = [
    { id: 'leader-x', setup: { A: { ships: 3, buildings: ['city'] }, B: { ships: 2, buildings: ['starport'] }, C: { ships: 2 } }, resources: ['fuel'] },
    { id: 'leader-y', setup: { A: { ships: 1, buildings: ['city', 'starport'] }, B: { ships: 4 }, C: { ships: 1 } } },
  ];
  c.setupCards.push({
    id: 'slots-2',
    playerCount: 2,
    seats: [
      [{ system: 'c1-p1', slot: 'A' }, { system: 'c1-p2', slot: 'B' }, { system: 'c1-gate', slot: 'C' }],
      [{ system: 'c3-p1', slot: 'A' }, { system: 'c3-p2', slot: 'B' }, { system: 'c3-gate', slot: 'C' }],
    ],
    exclusions: { clusters: ['c2'] },
    openLinks: [['c1-gate', 'c3-gate']],
  });
  return c;
}

describe('setup slots from leaders', () => {
  it('places each seat leader pieces on its A B C slots', () => {
    const ix = indexContent(slotContent());
    const s = newGame(ix, { playerCount: 2, seed: 1, variant: 'leaders', setupCardId: 'slots-2', firstPlayer: 0, leaders: ['leader-x', 'leader-y'] });
    expect(s.map['c1-p1'].ships[0]).toEqual({ fresh: 3, damaged: 0 });
    expect(s.map['c1-p1'].buildings).toEqual([{ owner: 0, type: 'city', damaged: false }]);
    expect(s.map['c1-gate'].ships[0].fresh).toBe(2);
    expect(s.map['c3-p1'].buildings.map((b) => b.type)).toEqual(['city', 'starport']);
    expect(s.map['c3-p2'].ships[1].fresh).toBe(4);
    expect(s.players[0].resources).toEqual(['fuel']);
    expect(s.players.map((p) => p.leader)).toEqual(['leader-x', 'leader-y']);
  });

  it('the base game places the standard pieces and ignores leaders', () => {
    const c = slotContent();
    c.baseSetupPieces = { A: { ships: 1 }, B: { ships: 1 }, C: { ships: 5 } };
    const s = newGame(indexContent(c), { playerCount: 2, seed: 1, setupCardId: 'slots-2', firstPlayer: 0 });
    expect(s.map['c3-gate'].ships[1].fresh).toBe(5);
    expect(s.players.map((p) => p.leader)).toEqual([null, null]);
  });

  it('rejects slot setup cards when the content has no base pieces', () => {
    const c = slotContent();
    delete c.baseSetupPieces;
    expect(() => indexContent(c)).toThrow(/no baseSetupPieces/);
  });

  it('records the gate link the setup card opens', () => {
    const ix = indexContent(slotContent());
    const s = newGame(ix, { playerCount: 2, seed: 1, variant: 'leaders', setupCardId: 'slots-2', firstPlayer: 0, leaders: ['leader-x', 'leader-y'] });
    expect(s.openLinks).toEqual([['c1-gate', 'c3-gate']]);
    expect(s.map['c2-p1'].inPlay).toBe(false);
  });
});
