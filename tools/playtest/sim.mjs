// Simulated online playtest, long run for a person to read (production/piano-blindatura-tavolo-2026-11-25.md).
// The play and the checks are in ./lib.mjs; this writes what it saw to disk: findings.json, moves.json,
// a screenshot the first time each finding is seen, the state of every stuck moment, and the end screens.
//
// Usage: node tools/playtest/sim.mjs --players 3 --variant base|leaders --seed 7 --steps 500 --w 1920 --h 1080 --lang it --out <dir>
// Needs `npm run build:single` first; SHOT_EXE is the browser (bash .claude/scripts/page-shot.sh --which).

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pieceLedger } from '../../src/game/engine/ledger.ts';
import { runGame } from './lib.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const opts = {
  players: Number(arg('players', 3)),
  variant: arg('variant', 'base'),
  seed: Number(arg('seed', 7)),
  steps: Number(arg('steps', 500)),
  w: Number(arg('w', 1920)),
  h: Number(arg('h', 1080)),
  lang: arg('lang', 'it'),
};
const OUT = resolve(arg('out', `production/qa/playtest/${opts.players}p-${opts.variant}-${opts.seed}`));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.SHOT_EXE });
let shots = 0;
const run = await runGame({
  ...opts,
  browser,
  ledger: pieceLedger,
  log: (line) => console.log(line),
  onFinding: async (page, f) => {
    if (!page || shots >= 60) return;
    const file = `f${String(++shots).padStart(2, '0')}-${f.key.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)}.png`;
    try {
      await page.screenshot({ path: join(OUT, file) });
      f.shot = file;
    } catch {
      /* the page may be gone */
    }
  },
});
for (const { step, state } of run.stuckStates) writeFileSync(join(OUT, `stuck-${step}.json`), state);
const summary = { ...opts, steps: run.steps, moves: run.moves.length, chapter: run.final.chapter, phase: run.final.phase.type, power: run.final.players.map((p) => p.power), findings: run.findings };
writeFileSync(join(OUT, 'findings.json'), JSON.stringify(summary, null, 2));
writeFileSync(join(OUT, 'moves.json'), JSON.stringify(run.moves, null, 1));
for (const [i, p] of run.pages.entries()) await p.screenshot({ path: join(OUT, `end-seat${i}.png`) }).catch(() => {});
console.log(JSON.stringify({ steps: run.steps, moves: run.moves.length, chapter: run.final.chapter, phase: run.final.phase.type, findings: run.findings.length }));
await browser.close();
