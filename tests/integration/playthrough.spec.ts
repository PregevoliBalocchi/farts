// Playwright: short seeded games played mouse-only by every seat (tools/playtest/lib.mjs), as a
// build gate (production/piano-blindatura-tavolo-2026-11-25.md, Fase 0). The simulator only
// observes; the verdict is here. A finding fails the build unless playthrough/known.json lists it
// with the plan step that fixes it, and that list only shrinks: a fix removes its entries.
// Long runs for a person to read: node tools/playtest/sim.mjs.
import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BASE_EFFECTS } from '../../src/game/cards/base';
import { indexContent, type GameContent, type GameState } from '../../src/game/engine';
import { pieceLedger } from '../../src/game/engine/ledger';
import { ruleChecks } from '../../src/game/engine/rulecheck';
import { runGame } from '../../tools/playtest/lib.mjs';

interface Config {
  name: string;
  players: 2 | 3 | 4;
  variant: 'base' | 'leaders';
  seed: number;
  steps: number;
  w: number;
  h: number;
  lang: 'it' | 'en';
}
interface Known {
  category: string;
  match: string;
  fix: string;
}
interface Finding {
  category: string;
  key: string;
  detail: string;
  count: number;
}

const read = <T>(f: string): T => JSON.parse(readFileSync(resolve('tests/integration/playthrough', f), 'utf8')) as T;
const configs = read<Config[]>('seeds.json');
const known = read<Known[]>('known.json').map((k) => ({ ...k, re: new RegExp(k.match) }));
// The content the build plays with (src/ui/content.ts): the owner's data when present, else the example.
const contentFile = ['data/content.json', 'data/content.example.json'].find((f) => existsSync(resolve(f)))!;
const ix = indexContent(JSON.parse(readFileSync(resolve(contentFile), 'utf8')) as GameContent, BASE_EFFECTS);
/** The rulebook's checks after every move (production/piano-blindatura-tavolo-2026-11-25.md, Fase 0.5). */
const rules = (prev: GameState, next: GameState) => ruleChecks(ix, prev, next);

/** Observations that are not faults by themselves (a fanned hand overlaps by design). */
const OBSERVE_ONLY = new Set(['partly']);

for (const c of configs) {
  test(`${c.name}: a seeded game shows no new problem`, async ({ browser }) => {
    // CI draws the 3D map in software on slow cores: a game there takes several times longer.
    test.setTimeout((process.env.CI ? 30 : 8) * 60_000);
    const run = await runGame({ ...c, browser, ledger: pieceLedger, rules });
    const findings = run.findings as Finding[];
    const fresh = findings.filter((f) => !OBSERVE_ONLY.has(f.category) && !known.some((k) => k.category === f.category && k.re.test(f.key)));
    // What the run covered, and the known problems it still met, for whoever reads the report.
    const phases = new Set((run.moves as { phase: string }[]).map((m) => m.phase));
    test.info().annotations.push({ type: 'covered', description: [...phases].sort().join(', ') });
    for (const k of known) {
      const hits = findings.filter((f) => f.category === k.category && k.re.test(f.key));
      if (hits.length) test.info().annotations.push({ type: 'known', description: `${k.fix}: ${hits.length}` });
    }
    expect(fresh.map((f) => `${f.key}${f.detail ? ` (${f.detail})` : ''}`)).toEqual([]);
    expect(run.moves.length).toBeGreaterThan(c.steps / 2);
  });
}
