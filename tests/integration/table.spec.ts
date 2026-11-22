// Playwright: the table screen (?view=table) of the single-file build, opened
// from disk and played through clicks; the rules come from the engine.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

async function open(page: Page, extra = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(build(`view=table&lang=en&motion=off${extra}`));
  await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
  return errors;
}

const phase = (page: Page) => page.evaluate(() => (window.game!.state as { phase: { type: string } }).phase.type);

test('boots the table with every region and no errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.game!.scene)).toBe('table');
  for (const r of ['header', 'prompt', 'rivals', 'map', 'ambitions', 'court', 'recent', 'local', 'hand', 'actions']) {
    await expect(page.locator(`[data-region="${r}"]`)).toBeVisible();
  }
  // The 3D map (a canvas plus keyboard stand-ins for its systems), or the 2D map without WebGL.
  await expect(page.locator('[data-region="map"] [data-sys]').first()).toBeAttached();
  expect(errors).toEqual([]);
});

test('the 2D map stays available with ?map=2d', async ({ page }) => {
  const errors = await open(page, '&map=2d');
  await expect(page.locator('.m-sys').first()).toBeAttached();
  await expect(page.locator('canvas.map3d')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('leading a card and ending the turn passes play to the next seat', async ({ page }) => {
  const errors = await open(page);
  await page.locator('.hand-card:not(.unplayable)').first().click();
  await page.getByRole('button', { name: 'Lead', exact: true }).click();
  expect(await phase(page)).toBe('actions');
  await page.getByRole('button', { name: 'End turn' }).click();
  expect(await phase(page)).toBe('follow');
  expect(errors).toEqual([]);
});

test('the court picker opens and closes with Escape', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Court cards' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
