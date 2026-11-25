// Playwright: accessibility of the table (production/piano-blindatura-tavolo-2026-11-25.md, PR 7, Fase 5).
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;
const RAW_SYSTEM = /\bc\d+-(gate|p\d)\b/;

/** A 3-player table at seat 0, which leads its first card and starts a Move (systems to pick light up). */
async function moving(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(build('view=table&lang=it&motion=off&players=3&seed=11&seat=0'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
  await page.evaluate(() => {
    const s = structuredClone(window.game!.state) as unknown as { initiative: number };
    s.initiative = 0;
    window.game!.load(s as never);
  });
  await page.locator('.hand-card:not(.unplayable)').first().click();
  await page.locator('.cmd-bar [data-act="lead"]').click();
  await page.locator('.cmd-bar [data-act="kind"][data-kind="move"]').click();
  await expect(page.locator('.sys-key.valid').first()).toBeAttached();
}

test.describe('accessibility', () => {
  test('the map names its systems, says which can be picked and the arrows move between those (A3, A12)', async ({ page }) => {
    await moving(page);
    const lit = page.locator('.sys-key.valid');
    const n = await lit.count();
    expect(n).toBeGreaterThan(1);
    // The one tab stop is a system that can be picked, named and said to be pickable; no raw id anywhere.
    const stop = page.locator('.sys-key[tabindex="0"]');
    await expect(stop).toHaveClass(/valid/);
    await expect(stop).toHaveAttribute('aria-label', /, selezionabile$/);
    for (const el of await page.locator('.sys-key').all()) {
      expect(await el.getAttribute('aria-label')).not.toMatch(RAW_SYSTEM);
      expect(await el.textContent()).not.toMatch(RAW_SYSTEM);
    }
    // The live status announces how many can be picked.
    await expect(page.locator('[role="status"][aria-live="polite"].sr-only')).toContainText(`${n} sistemi selezionabili`);
    // ArrowRight goes to the next system that can be picked, not to any system.
    await stop.focus();
    await page.keyboard.press('ArrowRight');
    const focused = page.locator('.sys-key:focus');
    await expect(focused).toHaveClass(/valid/);
    await expect(focused).not.toHaveAttribute('data-sys', (await lit.first().getAttribute('data-sys'))!);
  });

  test('the system setting "reduce motion" stops the table\'s motion like ?motion=off (A7)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(build('view=table&lang=it&players=3&seed=11&seat=0'));
    await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
    await expect(page.locator('.tbl.no-motion')).toHaveCount(1);
  });
});

test.describe('accessibility: zoom, Escape and focus', () => {
  test('focus never pops the card zoom; Z shows it and Esc closes it first (A2, A5)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(build('view=table&lang=it&motion=off&players=3&seed=3&seat=0'));
    await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
    const zoom = page.locator('.card-zoom');
    const card = page.locator('[data-region="court"] [data-act="court"]').first();
    await card.focus();
    await expect(zoom).toBeHidden();
    await expect(card).toHaveAttribute('aria-keyshortcuts', 'Z');
    await page.keyboard.press('z');
    await expect(zoom).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(zoom).toBeHidden();
    await expect(card).toBeFocused();
  });

  test('a window closed with Esc gives the focus back to the button that opened it (A5)', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(build('view=table&lang=it&motion=off&players=3&seed=3&seat=0'));
    await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
    const opener = page.locator('[data-act="settings"]');
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test.describe('accessibility: windows', () => {
  test('a window is modal and Tab goes round its controls without leaving it (A6)', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(build('view=table&lang=it&motion=off&players=3&seed=3&seat=0'));
    await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
    await page.locator('[data-act="settings"]').focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('.modal[role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible();
    const n = await dialog.evaluate((d) => [...d.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled)')].filter((x) => x.getClientRects().length).length);
    // Starts inside, and after a full round of Tab (and one more) it is still inside.
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    for (let i = 0; i <= n; i++) await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    for (let i = 0; i <= n; i++) await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  });
});

test.describe('accessibility: colours', () => {
  test('the colour-blind seat colours apply at once and the local game goes on after the reload (A9)', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(build('view=table&lang=it&motion=off&players=3&seed=3&seat=0'));
    await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
    // A move first, so the game to keep is not the new one.
    const hand = await page.evaluate(() => {
      const s = window.game!.state as unknown as { players: { hand: string[] }[]; initiative: number };
      window.game!.send({ type: 'lead', player: s.initiative, card: s.players[s.initiative].hand[0] } as never);
      return (window.game!.state as unknown as { players: { hand: string[] }[] }).players.map((p) => p.hand.length);
    });
    await page.locator('[data-act="settings"]').click();
    await Promise.all([page.waitForEvent('load'), page.locator('#set-palette').selectOption('clear')]);
    await expect.poll(() => page.evaluate(() => document.querySelector('.tbl')?.classList.contains('pal-clear'))).toBe(true);
    await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
    const seat2 = await page.evaluate(() => getComputedStyle(document.querySelector('.tbl')!).getPropertyValue('--seat-2').trim());
    expect(seat2).toBe('#cc79a7');
    const after = await page.evaluate(() => (window.game!.state as unknown as { players: { hand: string[] }[] }).players.map((p) => p.hand.length));
    expect(after).toEqual(hand);
  });
});
