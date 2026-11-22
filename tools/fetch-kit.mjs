// Downloads the publisher's development kit (free for non-commercial fan use)
// and copies the pictures the table screen uses into assets/ui/, under the
// names src/ui/table/assets.ts reads. assets/ui/ is committed (docs/ui-assets.md):
// run this only to refresh the pictures when the kit changes.
//
//   node tools/fetch-kit.mjs            download and install
//   node tools/fetch-kit.mjs <kit.zip>  install from a zip already downloaded
//
// The board picture is not in the kit: put it at assets/ui/map/board.png
// (see docs/ui-assets.md).

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_URL = 'https://www.dropbox.com/scl/fo/s4fgnkq4ehsrvrqza7n75/AOenVbS1fADoDZBoVPRIcKY?rlkey=7hdtgq7fyg4e96gx64ovugufg&dl=1';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets', 'ui');

/** Seat order → kit colour (the table's --seat-N colours follow the same order). */
const SEAT_COLOURS = ['yellow', 'blue', 'red', 'white'];
/** Our resource ids → the kit's names. */
const RESOURCES = { material: 'material', fuel: 'fuel', weapons: 'weapon', relic: 'relic', psionic: 'psionic' };

/** [kit file (without its prefix and ".png"), destination under assets/ui (without ".png")] */
function plan() {
  const p = [];
  for (const [id, kit] of Object.entries(RESOURCES)) {
    p.push([`icon resource ${kit}`, `icon/${id}`], [`punchboard resource ${kit}`, `token/resource-${id}`]);
  }
  p.push(
    ['icon dice key white', 'icon/key'],
    ['icon dice hit white', 'icon/hit'],
    ['icon dice self hit white', 'icon/selfhit'],
    ['icon dice building hit white', 'icon/buildinghit'],
    ['icon dice intercept white', 'icon/intercept'],
    ['icon players', 'icon/players'],
    ['initiative marker', 'token/initiative'],
    ['free city', 'piece/city-free'],
    ['free city back', 'piece/city-free-back'],
    ['free starport', 'piece/starport-free'],
    ['free starport back', 'piece/starport-free-back'],
    ['imperial ship', 'piece/ship-imperial'],
  );
  SEAT_COLOURS.forEach((colour, seat) => {
    for (const piece of ['ship', 'agent', 'flagship', 'city', 'starport']) p.push([`player piece ${colour} ${piece}`, `piece/${piece}-${seat}`]);
    for (const piece of ['city', 'starport']) p.push([`player piece ${colour} ${piece} back`, `piece/${piece}-back-${seat}`]);
  });
  for (const m of ['front 2-0', 'front 3-2', 'front 5-3', 'back 4-2', 'back 6-3', 'back 9-4']) p.push([`punchboard ambition ${m}`, `token/ambition-${m.replace(' ', '-')}`]);
  for (const f of ['assault 1', 'assault 2 5', 'assault 3', 'assault 4', 'assault 6', 'raid 1', 'raid 2', 'raid 3-4', 'raid 5', 'raid 6', 'skirmish 1-3', 'skirmish 4-5']) {
    p.push([`dice ${f}`, `dice/${f.replace(/ /g, '-')}`]);
  }
  return p;
}

async function download(to) {
  console.log('Downloading the kit…');
  const res = await fetch(KIT_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  writeFileSync(to, Buffer.from(await res.arrayBuffer()));
}

function unzip(zip, dir) {
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dir}' -Force`], { stdio: 'inherit' });
  } else execFileSync('unzip', ['-q', '-o', zip, '-d', dir], { stdio: 'inherit' });
}

const work = mkdtempSync(join(tmpdir(), 'kit-'));
const zip = process.argv[2] ? resolve(process.argv[2]) : join(work, 'kit.zip');
if (!process.argv[2]) await download(zip);
const dir = join(work, 'kit');
mkdirSync(dir);
unzip(zip, dir);
const src = join(dir, 'icon and punchboard');
if (!existsSync(src)) throw new Error(`The kit has no "icon and punchboard" folder (found: ${readdirSync(dir).join(', ')})`);

// The kit's files are named "<prefix>_<name>.png": match on the name, whatever the prefix.
const byName = new Map(readdirSync(src).map((f) => [f.replace(/^[^_]*_/, '').replace(/\.png$/i, ''), f]));
let copied = 0;
const missing = [];
for (const [from, to] of plan()) {
  const found = byName.get(from);
  if (!found) {
    missing.push(from);
    continue;
  }
  const file = join(src, found);
  const dest = join(out, `${to}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(file, dest);
  copied++;
}
console.log(`Copied ${copied} pictures into assets/ui/.`);
if (missing.length) console.log(`Not found in the kit: ${missing.join(', ')}`);
if (!existsSync(join(out, 'map', 'board.png'))) console.log('Reminder: the board picture goes in assets/ui/map/board.png (not part of the kit).');
