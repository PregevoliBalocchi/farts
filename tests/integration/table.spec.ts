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
  for (const r of ['header', 'rivals', 'map', 'side', 'ambitions', 'court', 'recent', 'local', 'hand', 'confirm']) {
    await expect(page.locator(`[data-region="${r}"]`)).toBeVisible();
  }
  // The context box shows only when there is something to choose: not before a card is picked.
  await expect(page.locator('[data-region="actions"]')).toHaveCount(0);
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
  // Picking a card opens the box with the ways to play it.
  await expect(page.locator('[data-region="actions"]')).toBeVisible();
  await page.getByRole('button', { name: 'Lead', exact: true }).click();
  expect(await phase(page)).toBe('actions');
  // Then the actions of the led card, as buttons with their icons.
  await expect(page.locator('[data-region="actions"] [data-act="kind"]').first()).toBeVisible();
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

test('hotseat covers the screen between players until the next one is ready', async ({ page }) => {
  const errors = await open(page, '&hotseat=1');
  // The first player is asked to take the computer before seeing their hand.
  await expect(page.locator('.hs-curtain')).toBeVisible();
  await page.locator('[data-act="hs-ready"]').click();
  await expect(page.locator('.hs-curtain')).toHaveCount(0);
  const first = await page.evaluate(() => (window.game!.state as { phase: { type: string } }).phase.type);
  expect(first).toBe('lead');
  await page.locator('.hand-card:not(.unplayable)').first().click();
  await page.getByRole('button', { name: 'Lead', exact: true }).click();
  await page.getByRole('button', { name: 'End turn' }).click();
  // Play passes to the next seat: the screen is covered again.
  await expect(page.locator('.hs-curtain')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Leaders and Lore draft gives every player a leader and a lore card', async ({ page }) => {
  const errors = await open(page, '&players=3&variant=leaders');
  // The game opens on the draft window, not on the hand.
  await expect(page.locator('.draft-win')).toBeVisible();
  expect(await phase(page)).toBe('draft');
  // Each seat takes one card per turn until everyone has a leader and a lore card.
  for (let i = 0; i < 6; i++) await page.locator('[data-act="draft-pick"]').first().click();
  await expect(page.locator('.draft-win')).toHaveCount(0);
  expect(await phase(page)).toBe('lead');
  const players = await page.evaluate(() => (window.game!.state as { players: { leader?: string; lore: string[] }[] }).players);
  expect(players.every((p) => !!p.leader && p.lore.length === 1)).toBe(true);
  expect(errors).toEqual([]);
});
