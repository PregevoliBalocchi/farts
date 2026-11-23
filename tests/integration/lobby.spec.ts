// Playwright: the entrance page's new-game screen, through its local preview
// (?view=lobby of the single-file build, sample games, no sign-in).
import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const url = `${pathToFileURL(resolve('dist-single/index.html')).href}?view=lobby`;

test('the new game screen builds a hotseat game with names, colours and a starter', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  // Your games are listed, the one waiting for you first.
  await expect(page.locator('#games .game').first()).toHaveClass(/mine/);
  await page.locator('[data-mode="hotseat"]').click();
  await page.locator('[data-variant="leaders"]').click();
  await page.locator('[data-add]').click();
  await page.locator('[data-who="0"]').fill('Anna');
  await page.locator('[data-who="1"]').fill('anna');
  await page.locator('[data-who="2"]').click();
  // A repeated name blocks the start and says why.
  await expect(page.locator('[data-err="1"]')).toHaveText('Nome già usato');
  await expect(page.locator('[data-start]')).toBeDisabled();
  await page.locator('[data-who="1"]').fill('Bruno');
  // Taking a colour in use swaps it with that seat.
  await page.locator('[data-seat="0"][data-color="2"]').click();
  await page.locator('[data-first="1"]').click();
  await page.locator('[data-start]').click();
  const made = await page.evaluate(() => (window as unknown as { lobbyCreated: unknown }).lobbyCreated);
  expect(made).toEqual({ mode: 'hotseat', variant: 'leaders', players: ['Anna', 'Bruno', ''], colors: [2, 1, 0], firstPlayer: 1 });
  expect(errors).toEqual([]);
});
