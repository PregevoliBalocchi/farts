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
  for (const r of ['header', 'rivals', 'map', 'side', 'ambitions', 'court', 'recent', 'local', 'hand']) {
    await expect(page.locator(`[data-region="${r}"]`)).toBeVisible();
  }
  // Before a card is picked there is no bar, only the turn's buttons (base-fixes #37): Undo and Pass.
  await expect(page.locator('[data-region="actions"].cmd-bar.bare')).toBeAttached();
  await expect(page.locator('.cmd-bar [data-act="pass"]')).toBeVisible();
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
  // Picking a card puts its ways to play in the command bar.
  await expect(page.locator('.cmd-bar [data-act="lead"]')).toBeVisible();
  await page.getByRole('button', { name: 'Lead', exact: true }).click();
  expect(await phase(page)).toBe('actions');
  // The Prelude and the card's actions together (base-fixes #34, #35): the resources held glow on the own board,
  // the led card's actions are buttons of the bar.
  await expect(page.locator('.board .slot.spend[data-act="spend"]').first()).toBeVisible();
  await expect(page.locator('.cmd-bar .cmd-main [data-act="kind"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'End turn' }).click();
  expect(await phase(page)).toBe('follow');
  expect(errors).toEqual([]);
});

test('the settings window and the log drop-down open and close with Escape', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('[data-act="log"]').click();
  await expect(page.locator('.drop-win')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.drop-win')).toHaveCount(0);
});

test('a click on a rival band opens its board and a second click closes it; hovering does not', async ({ page }) => {
  await open(page);
  const band = page.locator('.board.rband').first();
  const tip = page.locator('.hover-tip:not(.hover-sub)');
  // Hovering the band opens nothing (base-fixes #37).
  await band.hover();
  await page.waitForTimeout(300);
  await expect(tip).toBeHidden();
  await band.click({ position: { x: 20, y: 10 } });
  await expect(tip).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // It stays while the mouse moves away, until the band is clicked again.
  await page.mouse.move(960, 600);
  await page.waitForTimeout(600);
  await expect(tip).toBeVisible();
  await band.click({ position: { x: 20, y: 10 } });
  await expect(tip).toBeHidden();
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

test('the keyboard reaches the hand first and crosses the map as one stop (base-fixes #41)', async ({ page }) => {
  const errors = await open(page, '&players=4&seed=3');
  // The table's parts are named landmarks.
  for (const name of ['Your hand', 'Map', 'Court', 'Ambitions', 'Your board', 'Rivals']) {
    await expect(page.getByRole('region', { name, exact: true })).toBeAttached();
  }
  // The first Tab lands on the skip links; "Your hand" moves the focus onto a hand card.
  await page.locator('body').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link').first()).toBeFocused();
  await expect(page.locator('.skip-nav')).toBeVisible();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-region="hand"]'))).toBe(true);
  // The 3D map's systems: one tab stop, the arrow keys move along them.
  const keys = page.locator('.sys-key');
  if (await keys.count()) {
    expect(await page.locator('.sys-key[tabindex="0"]').count()).toBe(1);
    await page.locator('.sys-key[tabindex="0"]').focus();
    const before = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.sys);
    await page.keyboard.press('ArrowRight');
    const after = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.sys);
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
    expect(await page.locator('.sys-key[tabindex="0"]').count()).toBe(1);
  }
  expect(errors).toEqual([]);
});

test('the text size setting grows the table type, automatic on a small window (base-fixes #44)', async ({ page }) => {
  const errors = await open(page, '&players=4&seed=3');
  const size = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.tbl-stage .hd.prompt .pr-text')!).fontSize));
  // 1280×720 shows the stage at 67%: automatic is large.
  await expect(page.locator('.tbl.large-text')).toHaveCount(1);
  const large = await size();
  await page.locator('[data-act="settings"]').click();
  await page.locator('#set-text').selectOption('normal');
  await expect(page.locator('.tbl.large-text')).toHaveCount(0);
  expect(await size()).toBeLessThan(large);
  await page.locator('#set-text').selectOption('large');
  await expect(page.locator('.tbl.large-text')).toHaveCount(1);
  expect(await size()).toBe(large);
  expect(errors).toEqual([]);
});
