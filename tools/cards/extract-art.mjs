// Cuts the illustrations out of the owner's card pictures (assets/cards/court,
// lore, leaders) so the table can draw every card from the publisher's
// development kit (src/ui/table/cardface.ts):
//
//   Guild cards  the picture inside the arch          → assets/cards/art/court-nn.webp
//   Vox cards    the sketch, its paper made clear     → assets/cards/art/court-nn.webp
//   Lore cards   the picture above the gold band      → assets/cards/art/lore-nn.webp
//   Leaders      the character on its space, edges
//                faded into the kit background         → assets/cards/art/leader-nn.webp
//
// and trims the kit's Tarot leader background to the card (assets/ui/cardkit/leader.png).
// Run after adding card pictures:
//
//   npm run assets:art            (the kit folder is found in %TEMP%/kit-*/kit, or pass it)
//
// The pictures are processed in a headless browser's canvas (Playwright), so no image
// library is needed. Regions are fractions of each picture (see REGIONS below).
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = 'assets/cards/art';
const content = JSON.parse(readFileSync(existsSync('data/content.json') ? 'data/content.json' : 'data/content.example.json', 'utf8'));
const kinds = new Map(content.courtCards.map((c) => [c.id, c.kind]));

/** Where the illustration is on each kind of printed card: [left, top, right, bottom] as fractions. */
const REGIONS = {
  guild: [0.035, 0.03, 0.965, 0.565],
  vox: [0.02, 0.33, 0.98, 0.915],
  lore: [0, 0, 1, 0.435],
  leader: [0, 0.075, 1, 0.48],
  // A large leader picture shows the whole card: its white border and the dripping top edge stay out.
  leaderLarge: [0.03, 0.097, 0.97, 0.507],
};

function kitDir() {
  if (process.argv[2]) return process.argv[2];
  const hit = readdirSync(tmpdir()).filter((d) => d.startsWith('kit-')).map((d) => join(tmpdir(), d, 'kit')).find((d) => existsSync(join(d, 'CardAssets-Tarot-Leader.png')));
  return hit ?? null;
}

const jobs = [];
for (const group of ['court', 'lore', 'leaders']) {
  const dir = join('assets/cards', group);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => /\.(png|jpe?g|webp)$/i.test(x))) {
    const id = f.replace(/\.[a-z]+$/i, '');
    const kind = group === 'lore' ? 'lore' : group === 'leaders' ? 'leader' : kinds.get(id) === 'decree' ? 'vox' : 'guild';
    const mime = /\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg';
    jobs.push({ id, kind, data: `data:${mime};base64,${readFileSync(join(dir, f)).toString('base64')}` });
  }
}

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

/** Runs in the page: crops, upscales twice, clears the vox paper and fades the leader art's edges. */
const results = await page.evaluate(
  async ({ jobs, REGIONS }) => {
    const load = (b64) =>
      new Promise((ok, fail) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = fail;
        im.src = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
      });
    const out = {};
    for (const j of jobs) {
      const im = await load(j.data);
      const [l, t, r, b] = REGIONS[j.kind === 'leader' && im.width >= 400 ? 'leaderLarge' : j.kind];
      const sx = Math.round(l * im.width), sy = Math.round(t * im.height);
      const sw = Math.round((r - l) * im.width), sh = Math.round((b - t) * im.height);
      // Small scans are doubled; large pictures keep their own pixels.
      const k = im.width < 400 ? 2 : 1;
      const cv = document.createElement('canvas');
      cv.width = sw * k;
      cv.height = sh * k;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingQuality = 'high';
      g.drawImage(im, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
      const img = g.getImageData(0, 0, cv.width, cv.height);
      const d = img.data;
      const W = cv.width, H = cv.height;
      if (j.kind === 'vox') {
        // The sketch is brown ink on cream paper: ink stays, paper becomes clear (alpha from how much darker than the paper).
        const lum = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const ls = [];
        for (let i = 0; i < d.length; i += 4 * 7) ls.push(lum(i));
        ls.sort((a, c) => a - c);
        const paper = ls[Math.floor(ls.length * 0.9)];
        for (let i = 0; i < d.length; i += 4) {
          const a = Math.max(0, Math.min(1, (paper - lum(i)) / (paper * 0.55)));
          d[i + 3] = Math.round(255 * Math.pow(a, 0.85));
        }
      }
      if (j.kind === 'leader') {
        // The character keeps its own dark space around it (an automatic cut would eat the ink and shadows,
        // which are as dark as the space): its edges fade out so it melts into the kit's Tarot background.
        const fade = (v, edge) => Math.max(0, Math.min(1, v / edge));
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const a = Math.min(fade(x, W * 0.08), fade(W - 1 - x, W * 0.08), fade(y, H * 0.12), fade(H - 1 - y, H * 0.1));
            d[(y * W + x) * 4 + 3] = Math.round(255 * a * a * (3 - 2 * a));
          }
      }
      g.putImageData(img, 0, 0);
      // WebP keeps the folder small (the pictures are large); it carries the alpha of the Vox and Leader cuts.
      out[j.id] = cv.toDataURL('image/webp', 0.9).split(',')[1];
    }
    return out;
  },
  { jobs, REGIONS },
);

mkdirSync(OUT, { recursive: true });
for (const [id, b64] of Object.entries(results)) {
  writeFileSync(join(OUT, `${id}.webp`), Buffer.from(b64, 'base64'));
  // An older cut of the same card, as PNG, would win or linger: remove it.
  rmSync(join(OUT, `${id}.png`), { force: true });
}
console.log(`${Object.keys(results).length} illustrations → ${OUT}`);

// The kit's Tarot leader background, trimmed to the card (its dark area, without the white bleed).
const kit = kitDir();
if (kit) {
  const b64 = readFileSync(join(kit, 'CardAssets-Tarot-Leader.png')).toString('base64');
  const trimmed = await page.evaluate(async (b64) => {
    const im = await new Promise((ok) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.src = `data:image/png;base64,${b64}`;
    });
    const cv = document.createElement('canvas');
    cv.width = im.width;
    cv.height = im.height;
    const g = cv.getContext('2d');
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, im.width, im.height).data;
    let x0 = im.width, x1 = 0, y0 = im.height, y1 = 0;
    for (let y = 0; y < im.height; y++)
      for (let x = 0; x < im.width; x++) {
        const i = (y * im.width + x) * 4;
        if (d[i + 3] > 200 && d[i] < 90 && d[i + 1] < 90) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      }
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1;
    out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return { png: out.toDataURL('image/png').split(',')[1], box: [x0, y0, x1, y1] };
  }, b64);
  writeFileSync('assets/ui/cardkit/leader.png', Buffer.from(trimmed.png, 'base64'));
  console.log(`Tarot leader background trimmed to ${trimmed.box.join(',')} → assets/ui/cardkit/leader.png`);
} else console.log('Kit not found: pass its folder to trim the leader background.');
await browser.close();
