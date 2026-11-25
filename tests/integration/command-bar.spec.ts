// Playwright: the command bar and the battle window keep every button inside their frame, at one height per
// group (production/base-fixes.md #35), and a reroll card is offered in the battle window after the roll.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

/** Court cards the local seat gets for the test: two Prelude powers (Gatekeepers, Skirmishers) and a reroll. */
const POWER_CARDS = ['court-08', 'court-13'];

async function open(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(build(`view=table&lang=it&motion=off&players=4&seed=3${extra}`));
  await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
  return errors;
}

/** The seat about to lead gets the power cards and resources to spend. */
async function givePowers(page: Page): Promise<void> {
  await page.evaluate((cards) => {
    const g = window.game!;
    const s = structuredClone(g.state) as { initiative: number; players: { court: string[]; resources: (string | null)[] }[] };
    const me = s.players[s.initiative];
    me.court.push(...cards);
    me.resources = ['weapons', 'weapons', 'material', 'fuel', null, null];
    g.load(s as never);
  }, POWER_CARDS);
}

/** Every button of the bar and the windows that leaves its frame or does not hold its own text. */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const box of document.querySelectorAll('.cmd-bar, .battle-win, .sys-menu, .power-menu')) {
      const q = box.getBoundingClientRect();
      for (const el of box.querySelectorAll<HTMLElement>('button')) {
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        const out = r.left < q.left - 0.5 || r.right > q.right + 0.5 || r.top < q.top - 0.5 || r.bottom > q.bottom + 0.5;
        const spill = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
        if (out || spill) bad.push(`${(el.textContent || el.title).trim().slice(0, 40)}${out ? ' (out of its frame)' : ' (text spills)'}`);
      }
    }
    return bad;
  });
}

/** The heights of the bar's buttons in stage pixels (the stage is scaled to the window): one value. */
async function barHeights(page: Page): Promise<number[]> {
  return page.evaluate(() => [...new Set([...document.querySelectorAll<HTMLElement>('.cmd-row button')].map((b) => b.offsetHeight))]);
}

test('the command bar keeps its buttons inside it at one height, from the lead to the actions', async ({ page }) => {
  const errors = await open(page);
  await givePowers(page);
  expect(await overflowing(page)).toEqual([]);
  await page.locator('.hand-card:not(.unplayable)').first().click();
  expect(await overflowing(page)).toEqual([]);
  await page.locator('.cmd-bar [data-act="lead"]').click();
  // The actions, the card powers (Gatekeepers, Skirmishers) and the turn's buttons, in one row.
  await expect(page.locator('.cmd-bar .cmd-pow [data-act="power-card"]')).toHaveCount(2);
  expect(await overflowing(page)).toEqual([]);
  expect(await barHeights(page)).toEqual([48]);
  expect(errors).toEqual([]);
});

test('a 7 declares by clicking a lit ambition, not a button grid', async ({ page }) => {
  await open(page);
  // Seed 3: the first seat holds a 7 (it may declare any ambition); it leads.
  await page.evaluate(() => {
    const g = window.game!;
    const s = structuredClone(g.state) as { initiative: number };
    s.initiative = 0;
    g.load(s as never);
  });
  const cards = page.locator('.hand-card:not(.unplayable)');
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    await cards.nth(i).click();
    if ((await page.locator('.abox.declare').count()) > 1) break;
  }
  await expect(page.locator('.cmd-bar [data-act="lead-declare"]')).toHaveCount(0);
  const lit = page.locator('.abox.declare');
  expect(await lit.count()).toBeGreaterThan(1);
  await lit.first().click();
  await expect.poll(() => page.evaluate(() => (window.game!.state as { phase: { type: string } }).phase.type)).toBe('actions');
});

test('the battle opens at once on a lone rival and the reroll card is offered after the roll', async ({ page }) => {
  const errors = await open(page, '&scenario=battle');
  await givePowers(page);
  await page.locator('.hand-card:not(.unplayable)').first().click();
  await page.locator('.cmd-bar [data-act="lead"]').click();
  await page.locator('.cmd-bar [data-act="kind"][data-kind="battle"]').click();
  const sys = await page.evaluate(() => document.querySelector<HTMLElement>('.sys-key.valid')?.dataset.sys);
  await page.locator(`.sys-key[data-sys="${sys}"]`).dispatchEvent('click');
  // One rival there: no menu of one line, the battle window at once.
  await expect(page.locator('.sys-menu')).toHaveCount(0);
  await expect(page.locator('.battle-win.setup')).toBeVisible();
  expect(await overflowing(page)).toEqual([]);
  await page.locator('[data-act="do-battle"]').click();
  // Skirmishers rerolls skirmish dice: the window asks, the hits wait.
  await expect(page.locator('.battle-win .rr-ask')).toBeVisible();
  await expect(page.locator('.battle-win [data-act="allocate"]')).toBeDisabled();
  expect(await overflowing(page)).toEqual([]);
  await page.locator('.battle-win .b-die.rr-can').first().click();
  await page.locator('[data-act="reroll-go"]').click();
  await expect.poll(() => page.evaluate(() => (window.game!.state as { phase: { battle?: { rerolls?: string[] } } }).phase.battle?.rerolls ?? [])).toEqual(['court-13']);
  await expect(page.locator('.battle-win .rr-ask')).toHaveCount(0);
  expect(await overflowing(page)).toEqual([]);
  expect(errors).toEqual([]);
});
