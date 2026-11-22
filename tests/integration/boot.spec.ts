// Playwright: the single-file build opened from disk, driven through the
// window.game hook (src/hook.ts). npm run smoke runs only the @boot test.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query = ''): string => `${pathToFileURL(resolve('dist-single/index.html')).href}${query ? '?' + query : ''}`;

/** Opens the build and collects every page error and console error. */
async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(build());
  await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
  return errors;
}

test('boots the debug UI with a game in chapter 1 and no errors @boot', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.game!.scene)).toBe('debug');
  await expect(page.locator('#map .sys').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Comandi' })).toBeVisible();
  const chapter = await page.evaluate(() => (window.game!.state as { chapter: number }).chapter);
  expect(chapter).toBe(1);
  expect(errors).toEqual([]);
});

test('the lead button plays a card through the engine', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Guida il round' }).click();
  const phase = await page.evaluate(() => (window.game!.state as { phase: { type: string } }).phase.type);
  expect(phase).toBe('actions');
  await page.getByRole('button', { name: 'Fine turno' }).click();
  expect(await page.evaluate(() => (window.game!.state as { phase: { type: string } }).phase.type)).toBe('follow');
  expect(errors).toEqual([]);
});

test('a refused command shows the rule and changes nothing', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => JSON.stringify(window.game!.state));
  const ok = await page.evaluate(() => window.game!.send!({ type: 'pass', player: 99 }));
  expect(ok).toBe(false);
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(window.game!.state))).toBe(before);
});
