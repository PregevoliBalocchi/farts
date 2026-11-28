// Test lab sweep (src/ui/table/lab.ts): for every leader, lore, Court card and action card, opens
// the lab game ready to try it (?lab=<id>), plays a few simulated steps with the playtest simulator
// (./lib.mjs: every seat in its own window, clicks as a person) and writes what it saw.
//
// It reports observations, not verdicts: errors on the page, refused or stuck moves, pieces that
// appear or vanish, controls hidden or off screen, and whether the log names the item (it was played,
// secured or used) within the steps. "Not seen" means the log did not name it: the play did not use it,
// or it is a passive power the log does not name. Either way the sweep could not assess it, and the
// item is left for the manual check in the lab.
//
// Usage: node tools/playtest/lab-sweep.mjs [--steps 30] [--only id,id] [--kind leader|lore|court|action]
//        [--lang it] [--w 1920 --h 1080] [--out <dir>]
// Needs `npm run build:single` first; SHOT_EXE is the browser (bash .claude/scripts/page-shot.sh --which).

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pieceLedger } from '../../src/game/engine/ledger.ts';
import { runGame } from './lib.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const steps = Number(arg('steps', 30));
const lang = arg('lang', 'it');
const w = Number(arg('w', 1920));
const h = Number(arg('h', 1080));
const only = arg('only', '').split(',').filter(Boolean);
const kind = arg('kind', '');
const date = new Date().toISOString().slice(0, 10);
const OUT = resolve(arg('out', `production/qa/evidence/lab-sweep-${date}`));
mkdirSync(OUT, { recursive: true });

// The lab's list, in its order (labItems in src/ui/table/lab.ts), with the seats its game has.
const c = JSON.parse(readFileSync('data/content.json', 'utf8'));
const it = (x) => x.i18n?.[lang]?.name ?? x.name ?? x.id;
const items = [
  ...(c.leaders ?? []).map((x) => ({ kind: 'leader', id: x.id, name: it(x), players: 3 })),
  ...(c.loreCards ?? []).map((x) => ({ kind: 'lore', id: x.id, name: it(x), set: x.set ?? 'base', players: 3 })),
  ...c.courtCards.map((x) => ({ kind: 'court', id: x.id, name: it(x), set: x.set ?? 'base', players: 3 })),
  ...c.actionCards.map((x) => ({ kind: 'action', id: x.id, name: `${x.suit} ${x.number}`, players: Math.max(3, x.minPlayers ?? 0) })),
].filter((x) => (!only.length || only.includes(x.id)) && (!kind || x.kind === kind));

const browser = await chromium.launch({ executablePath: process.env.SHOT_EXE });
const results = [];
for (const [n, item] of items.entries()) {
  const t0 = Date.now();
  let shots = 0;
  let run;
  try {
    run = await runGame({
      browser,
      players: item.players,
      seed: 1,
      steps,
      w,
      h,
      lang,
      query: `&lab=${item.id}`,
      // The item's own power chip or hand card, when in sight and no window is open, is clicked most of the time.
      prefer: (cs, _s, rand) => {
        if (cs.some((x) => x.foot)) return null;
        // A hand card already picked is left alone (a second click puts it back): the play goes on to Lead or Follow.
        const own = cs.filter((x) => x.data?.card === item.id && !x.covered && x.data?.pressed !== 'true' && ['power-card', 'hand'].includes(x.act));
        return own.length && rand() < 0.8 ? own[Math.floor(rand() * own.length)] : null;
      },
      ledger: pieceLedger,
      onFinding: async (page, f) => {
        if (!page || shots >= 3 || f.category === 'partly') return;
        const file = `${item.id}-f${++shots}.png`;
        await page.screenshot({ path: join(OUT, file) }).catch(() => {});
        f.shot = file;
      },
    });
  } catch (e) {
    results.push({ ...item, error: String(e?.message ?? e).slice(0, 300) });
    console.log(`${n + 1}/${items.length} ${item.id} NOT ASSESSED: ${String(e?.message ?? e).slice(0, 120)}`);
    continue;
  }
  const log = (run.final.log ?? []).map((l) => l.text ?? '');
  const named = log.filter((l) => l.includes(item.id));
  const manual = log.filter((l) => l.includes('not implemented'));
  // The leader acts through its passives and setup: the log rarely names it, so "named" is not asked of it.
  const used = item.kind === 'leader' ? 'n/a' : named.length ? 'seen' : 'not seen';
  const r = {
    ...item,
    steps: run.steps,
    moves: run.moves.length,
    used,
    named: named.slice(0, 3),
    manual: manual.slice(0, 3),
    // Hand cards partly under the next one are how the hand fans out (observe-only in ./lib.mjs): counted, not listed.
    fanned: run.findings.filter((f) => f.category === 'partly').length,
    findings: run.findings.filter((f) => f.category !== 'partly').map((f) => ({ category: f.category, key: f.key, detail: f.detail, count: f.count, shot: f.shot })),
    seconds: Math.round((Date.now() - t0) / 1000),
  };
  results.push(r);
  // The end screen of seat 0, only for an item with something to look at (the folder stays small).
  if (r.findings.length || r.manual.length) await run.pages[0]?.screenshot({ path: join(OUT, `${item.id}-end.png`) }).catch(() => {});
  for (const p of run.pages) await p.context().close().catch(() => {});
  console.log(`${n + 1}/${items.length} ${item.id} moves ${r.moves} used ${used} findings ${r.findings.length} (${r.seconds}s)`);
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ date, steps, lang, w, h, results }, null, 1));
}
await browser.close();

// The report for a person: the items with something to look at first.
const flag = (r) => r.error || r.findings?.length || r.manual?.length;
const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ');
const lines = [
  `# Lab sweep ${date}`,
  '',
  `${results.length} items, ${steps} simulated steps each, ${w}×${h}, ${lang}. Observations, not verdicts. "Seen": the log names the`,
  'item (played, secured or its power used). "Not seen": the play did not use it, or it is a passive the log does not name; it is',
  'NOT ASSESSED here and stays for the manual check in the lab (play.html?lab=<id>). Leaders act through passives: not asked.',
  '',
  `- With observations: ${results.filter(flag).length}`,
  `- Could not run (NOT ASSESSED): ${results.filter((r) => r.error).length}`,
  `- Seen in the log: ${results.filter((r) => r.used === 'seen').length}; not seen (NOT ASSESSED): ${results.filter((r) => r.used === 'not seen').length}; leaders (not asked): ${results.filter((r) => r.used === 'n/a').length}`,
  '',
  '| Kind | id | Name | Moves | In the log | Observations |',
  '|---|---|---|---|---|---|',
  ...[...results]
    .sort((a, b) => Number(!!flag(b)) - Number(!!flag(a)))
    .map((r) => {
      const obs = r.error
        ? `NOT ASSESSED: ${cell(r.error)}`
        : [...(r.manual ?? []).map((m) => `manual: ${cell(m)}`), ...(r.findings ?? []).map((f) => `${f.category} ${cell(f.key)}${f.shot ? ` (${f.shot})` : ''}`)].join('; ') || '—';
      return `| ${r.kind} | ${r.id} | ${cell(r.name)} | ${r.moves ?? '—'} | ${r.used ?? '—'} | ${obs} |`;
    }),
  '',
];
writeFileSync(join(OUT, 'summary.md'), lines.join('\n'));
console.log(`written ${join(OUT, 'summary.md')}`);
