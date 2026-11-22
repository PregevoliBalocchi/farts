// Checks the owner's data/content.json (skipped until the file exists).
// Run alone with: npm run check:content
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { activePlayer, indexContent, newGame } from '../../../src/game/engine';
import type { GameContent, PlayerCount } from '../../../src/game/engine';

const PATH = 'data/content.json';
const present = existsSync(PATH);

describe.skipIf(!present)('data/content.json', () => {
  const load = () => JSON.parse(readFileSync(PATH, 'utf8')) as GameContent;

  it('passes every cross-reference check', () => {
    const ix = indexContent(load());
    for (const w of ix.warnings) console.warn('WARN', w);
  });

  it('every leader fits every seat of every setup card', () => {
    const c = load();
    const ix = indexContent(c);
    const ids = (c.leaders ?? []).map((l) => l.id);
    for (const sc of c.setupCards) {
      const n = sc.playerCount;
      // Rotate so each leader sits in each seat at least once.
      for (let r = 0; r < ids.length; r++) {
        const leaders = Array.from({ length: n }, (_, i) => ids[(r + i) % ids.length]);
        expect(() => newGame(ix, { playerCount: n, seed: 1, variant: 'leaders', setupCardId: sc.id, leaders }), `${sc.id} with ${leaders}`).not.toThrow();
      }
    }
  });

  for (const n of [2, 3, 4] as PlayerCount[]) {
    it(`sets up every ${n}-player setup card`, () => {
      const c = load();
      const ix = indexContent(c);
      for (const sc of c.setupCards.filter((s) => s.playerCount === n)) {
        const s = newGame(ix, { playerCount: n, seed: 1, setupCardId: sc.id });
        expect(activePlayer(s)).not.toBeNull();
        for (const p of s.players) expect(p.hand).toHaveLength(c.handSize);
      }
    });
  }
});
