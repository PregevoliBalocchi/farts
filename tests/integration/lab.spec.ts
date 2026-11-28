// Playwright: the test lab (?lab=<id>, src/ui/table/lab.ts and labpanel.ts) lists every leader, lore,
// Court card and action card, sets up the game for the one picked, keeps the checklist marks and its
// note in this browser, and makes room for its panel on the right.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;
const content = JSON.parse(readFileSync('data/content.json', 'utf8')) as {
  leaders: unknown[];
  loreCards: unknown[];
  courtCards: unknown[];
  actionCards: unknown[];
};
const ITEMS = content.leaders.length + content.loreCards.length + content.courtCards.length + content.actionCards.length;

async function open(page: Page, id: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(build(`view=table&lang=it&motion=off&lab=${id}`));
  await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
  return errors;
}

test('the lab lists every item and sets up the one picked', async ({ page }) => {
  const errors = await open(page, 'court-26');
  const panel = page.locator('.lab-panel');
  await expect(panel.locator('.lab-item')).toHaveCount(ITEMS);
  await expect(panel.locator('.lab-cur-name')).toHaveText('Rivolta di Massa');
  // The decree is first in the Court row with the lab seat's agents.
  expect(await page.evaluate(() => window.game!.state.court[0])).toEqual({ card: 'court-26', agents: { 0: 3 } });

  // Picking a lore card sets up its game and keeps the choice in the address.
  await panel.locator('.lab-search').fill('Sacerdoti');
  await panel.locator('.lab-item', { hasText: 'Sacerdoti degli Utensili' }).click();
  await expect.poll(() => page.evaluate(() => window.game!.state.players[0].lore)).toEqual(['lore-01']);
  expect(new URL(page.url()).searchParams.get('lab')).toBe('lore-01');
  expect(errors).toEqual([]);
});

test('the checklist keeps its marks and notes after a reload', async ({ page }) => {
  await open(page, 'leader-03');
  const panel = page.locator('.lab-panel');
  await panel.getByRole('button', { name: 'Problema', exact: true }).click();
  await panel.locator('.lab-note').fill('Il dado non si ritira');
  await page.reload();
  await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
  await expect(panel.getByRole('button', { name: 'Problema', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.lab-note')).toHaveValue('Il dado non si ritira');
  await expect(panel.locator('.lab-count')).toHaveText(`1 di ${ITEMS} provati`);
});

test('the open panel keeps the table clear, and closes to a tab', async ({ page }) => {
  await open(page, 'construction-2');
  const stageRight = () => page.evaluate(() => document.querySelector('.tbl-stage')!.getBoundingClientRect().right);
  const panelLeft = await page.locator('.lab-panel').evaluate((el) => el.getBoundingClientRect().left);
  expect(await stageRight()).toBeLessThanOrEqual(panelLeft + 1);
  await page.locator('.lab-tab').click();
  await expect(page.locator('.lab-panel')).toBeHidden();
  await expect.poll(stageRight).toBeGreaterThan(panelLeft + 100);
});

test('outside the lab there is no panel', async ({ page }) => {
  await page.goto(build('view=table&lang=it&motion=off&players=3&seed=1'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
  await expect(page.locator('.lab-panel, .lab-tab')).toHaveCount(0);
});
