// Playwright: the seat boards keep their layout with full boards, at the
// smallest and the usual screen size (single-file build, from disk). Nothing
// leaves a board's frame, no two city triangles or cities overlap, and a
// leader avatar never covers the slots, the trophies and captives, the
// Prelude row, the reserve or the name bar.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

/** Every seat full: a leader, all tokens, trophies and captives, Court cards; cities on the board when `cities` is 5, all built at 0. */
async function fill(page: Page, round: number, cities: number): Promise<void> {
  await page.evaluate(
    ({ round, cities }) => {
      const g = window.game!;
      const s = structuredClone(g.state) as {
        courtDeck: string[];
        players: { id: number; leader: string | null; supply: { cities: number }; trophies: unknown[]; captives: number[]; resources: (string | null)[]; outraged: string[]; court: string[] }[];
      };
      const n = s.players.length;
      s.players.forEach((pl, i) => {
        pl.leader = `leader-${String(((round * n + i) % 16) + 1).padStart(2, '0')}`;
        pl.supply.cities = cities;
        pl.trophies = [{ owner: (i + 1) % n, piece: 'ship' }];
        pl.captives = [(i + 2) % n];
        pl.resources = ['fuel', 'material', 'relic', 'weapons', 'psionic', 'fuel'];
        pl.outraged = ['fuel'];
        if (!pl.court.length) pl.court.push(...s.courtDeck.splice(0, 3));
      });
      g.load!(s as never);
    },
    { round, cities },
  );
}

/** What is out of place on every visible board: overflow of the frame, overlapping triangles or cities, an avatar over the board's contents. */
function problems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const hit = (a: DOMRect, c: DOMRect, m: number) => a.left < c.right - m && c.left < a.right - m && a.top < c.bottom - m && c.top < a.bottom - m;
    const vis = (el: Element) => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ').filter(Boolean).slice(0, 2).join('.')}`;
    for (const board of document.querySelectorAll('.board')) {
      if (!vis(board)) continue;
      const r = board.getBoundingClientRect();
      const tag = String((board as HTMLElement).className).split(' ').slice(0, 4).join('.');
      for (const el of board.querySelectorAll('*')) {
        // The avatar may rise out of the board, and the strip for rearranging sits over it, on purpose.
        if (!vis(el) || el.closest('.portrait.leader, .pb-arrange')) continue;
        const e = el.getBoundingClientRect();
        if (!e.width || !e.height) continue;
        const d = Math.max(r.left - e.left, e.right - r.right, r.top - e.top, e.bottom - r.bottom);
        if (d > 1) out.push(`${tag}: ${name(el)} leaves the frame by ${Math.round(d)}px`);
      }
      for (const sel of ['.cover > .tri, .cover .tri-cell > .tri', '.on-city .pc']) {
        const els = [...board.querySelectorAll(sel)].filter(vis).map((x) => x.getBoundingClientRect());
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) if (hit(els[i], els[j], 1)) out.push(`${tag}: ${sel} ${i} and ${j} overlap`);
      }
      const av = board.querySelector('.portrait.leader.bust img');
      if (av && vis(av)) {
        const a = av.getBoundingClientRect();
        for (const sel of ['.slots', '.spoils', '.pl-legend', '.pb-low', '.name-bar']) for (const x of board.querySelectorAll(sel)) if (vis(x) && hit(a, x.getBoundingClientRect(), 2)) out.push(`${tag}: the avatar covers ${sel}`);
      }
    }
    return [...new Set(out)];
  });
}

for (const [w, h] of [
  [1920, 1080],
  [1366, 768],
] as const) {
  test(`keeps every seat board in its frame at ${w}x${h}, cities apart and avatars off the board's contents`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(build('view=table&lang=it&motion=off&players=4'));
    await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
    // Every leader once (4 seats × 4 rounds), with the cities on the board and all built.
    for (let round = 0; round < 4; round++) {
      await fill(page, round, round % 2 ? 0 : 5);
      expect(await problems(page), `round ${round}`).toEqual([]);
      // A rival's whole board, opened by a click on its band (closed by a second click).
      await page.locator(".board.rband").first().click({ position: { x: 20, y: 10 } });
      await expect(page.locator('.hover-tip:not(.hover-sub)')).toBeVisible();
      expect(await problems(page), `round ${round}, rival card`).toEqual([]);
      await page.locator(".board.rband").first().click({ position: { x: 20, y: 10 } });
    }
  });
}
