// Collects the English sentences the rules engine writes (log lines, rule
// errors, effect results) into src/i18n/messages.json, gettext style: the
// English sentence is the key, `${…}` parts become {0}, {1}…. The Italian
// catalogue (src/i18n/messages.it.json) translates each one; a unit test
// checks that none is missing. Run after changing engine messages:
//
//   node tools/i18n/extract-messages.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collect } from './messages-lib.mjs';

const ROOT = 'src/game';
const OUT = 'src/i18n/messages.json';

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const list = collect(files(ROOT).map((f) => readFileSync(f, 'utf8')));
writeFileSync(OUT, JSON.stringify(list, null, 2) + '\n');
console.log(`${list.length} messages → ${OUT}`);
