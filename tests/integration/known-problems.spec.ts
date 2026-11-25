// Playwright: the problems the 2026-11-25 simulated playtest found, each as the check its fix must
// turn green (production/piano-blindatura-tavolo-2026-11-25.md, Fase 0 step 7). A test still open is marked
// `test.fail()`: it fails today, so the suite passes; when a fix lands, the test passes, Playwright
// reports "expected to fail but passed", and the fix's PR removes the mark. A check that has never
// been seen failing is not known to test anything (.claude/rules/test-standards.md).
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;
const fixture = (name: string): unknown => JSON.parse(readFileSync(resolve('tests/integration/fixtures', name), 'utf8'));
const RAW_ID = /\b(court|lore|leader|administration|aggression|construction|mobilization)-\d+\b/;

/** Opens the table pinned to `seat`; with a fixture, loads that saved game state. */
async function open(page: Page, query: string, state?: unknown): Promise<void> {
  await page.goto(build(`view=table&lang=it&motion=off&debug=perf&${query}`));
  await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
  if (state) await page.evaluate((s) => window.game!.load(s as never), state);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test.describe('known problems (playtest 2026-11-25)', () => {
  test('after the defender reacts, the attacker gets the dice, not a card choice (piano D1)', async ({ page }) => {
    test.fail();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await open(page, 'players=2&variant=leaders&seat=1', fixture('collect-dice.json'));
    await expect(page.locator('.cmd-bar')).not.toContainText(/\bbattle\b/);
    await expect(page.locator('[data-act="decline"]')).toHaveCount(0);
    await expect(page.locator('[data-act="do-battle"]')).toBeVisible();
  });

  test('a card choice with no possible answer offers no "Scegli" (piano D2)', async ({ page }) => {
    test.fail();
    await page.setViewportSize({ width: 1366, height: 768 });
    await open(page, 'players=4&variant=leaders&seat=3', fixture('empty-choice.json'));
    await expect(page.locator('[data-act="decide-open"]')).toHaveCount(0);
  });

  test('in a 2-player game the empty part of the rivals region lets clicks reach the map (piano 2.1)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await open(page, 'players=2&seed=3&seat=0');
    const hit = await page.evaluate(() => {
      const region = document.querySelector('[data-region="rivals"]');
      if (!region) return 'no rivals region';
      const r = region.getBoundingClientRect();
      const used = Math.max(r.top, ...[...region.querySelectorAll('*')].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0).map((b) => b.bottom));
      if (used >= r.bottom - 4) return 'region full';
      return document.elementFromPoint(r.left + r.width / 2, (used + r.bottom) / 2)?.tagName ?? 'none';
    });
    expect(hit).toBe('CANVAS');
  });

  test('the zoom of a Court card leaves the next Court card clickable (piano 2.4)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await open(page, 'players=3&seed=3&seat=0');
    const cards = page.locator('[data-region="court"] [data-act="court"]');
    await cards.nth(0).hover();
    const next = await cards.nth(1).boundingBox();
    expect(next).not.toBeNull();
    const ok = await page.evaluate(({ x, y }) => {
      const top = document.elementFromPoint(x, y);
      const el = document.querySelectorAll('[data-region="court"] [data-act="court"]')[1];
      return !!top && (top === el || el.contains(top));
    }, { x: next!.x + next!.width / 2, y: next!.y + next!.height / 2 });
    expect(ok).toBe(true);
  });

  test('the zoomed card names the card, not its id, for a screen reader (piano A1)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await open(page, 'players=3&seed=3&seat=0');
    await page.locator('[data-region="court"] [data-act="court"]').nth(0).hover();
    const labels = await page.locator('.card-zoom [aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(l).not.toMatch(RAW_ID);
  });

  test('an ambition card opened by hovering stays off the command bar (piano 2.8)', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await open(page, 'players=2&seed=11&seat=0');
    // Into the actions, where the bar is widest (its buttons reach the ambitions' column).
    await page.evaluate(() => {
      const s = structuredClone(window.game!.state) as unknown as { initiative: number };
      s.initiative = 0;
      window.game!.load(s as never);
    });
    await page.locator('.hand-card:not(.unplayable)').first().click();
    await page.locator('.cmd-bar [data-act="lead"]').click();
    await expect(page.locator('.cmd-bar [data-act="end-turn"]')).toBeVisible();
    const rows = page.locator('[data-tip^="amb:"]');
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    const overlaps: string[] = [];
    for (let i = 0; i < n; i++) {
      if (!(await rows.nth(i).isVisible())) continue;
      await rows.nth(i).hover();
      const hit = await page.evaluate(() => {
        const tip = document.querySelector('.hover-tip:not(.hover-sub):not([hidden])')?.getBoundingClientRect();
        const bar = document.querySelector('.cmd-bar')?.getBoundingClientRect();
        if (!tip || !bar || !bar.width) return '';
        const over = tip.left < bar.right && tip.right > bar.left && tip.top < bar.bottom && tip.bottom > bar.top;
        return over ? `${Math.round(tip.top)}-${Math.round(tip.bottom)} over ${Math.round(bar.top)}` : '';
      });
      if (hit) overlaps.push(`${await rows.nth(i).getAttribute('data-tip')}: ${hit}`);
    }
    expect(overlaps).toEqual([]);
  });

  test('table controls are at least 24 px on a 1366×768 screen (piano 2.7)', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await open(page, 'players=3&seed=3&seat=0');
    // Seat 0 holds Court cards (the own Court's side tab shows only then) and is about to lead.
    await page.evaluate(() => {
      const s = structuredClone(window.game!.state) as unknown as { courtDeck: string[]; players: { court: string[] }[] };
      s.players[0].court = s.courtDeck.splice(0, 4);
      window.game!.load(s as never);
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect(page.locator('[data-act="mine-open"]')).toHaveCount(1);
    // Measured as a press reaches it: the box, grown by its invisible ::after hit area (base-fixes #42).
    const small = await page.evaluate(() => {
      const hit = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const a = getComputedStyle(el, '::after');
        if (a.content === 'none' || a.position !== 'absolute') return { w: r.width, h: r.height };
        const k = el.offsetWidth ? r.width / el.offsetWidth : 1;
        const px = (v: string) => (v.endsWith('px') ? parseFloat(v) * k : 0);
        return {
          w: Math.max(r.right, r.right - px(a.right)) - Math.min(r.left, r.left + px(a.left)),
          h: Math.max(r.bottom, r.bottom - px(a.bottom)) - Math.min(r.top, r.top + px(a.top)),
        };
      };
      return [...document.querySelectorAll<HTMLElement>('[data-act="amb-toggle"], [data-act="find-mine"], [data-act="court-sort"], [data-act="mine-open"]')]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => ({ act: e.dataset.act, b: hit(e) }))
        .filter(({ b }) => b.w < 24 || b.h < 24)
        .map(({ act, b }) => `${act} ${Math.round(b.w)}×${Math.round(b.h)}`);
    });
    expect(small).toEqual([]);
  });
});
