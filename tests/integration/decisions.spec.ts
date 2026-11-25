// Playwright: card choices drawn as the things they are about (production/piano-blindatura-tavolo-2026-11-25.md,
// PR 4: D3 Farseers in two steps, action cards drawn as cards, not ids).
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;
const RAW_ID = /\b(administration|aggression|construction|mobilization)-\d+\b/;

/** Opens a 2-player table at seat 0 and puts the game on Farseers' second step: the swap with seat 1. */
async function farseersSwap(page: Page): Promise<{ mine: string[]; theirs: string[] }> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(build('view=table&lang=it&motion=off&players=2&seed=3&seat=0'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
  return page.evaluate(() => {
    const s = structuredClone(window.game!.state) as unknown as { phase: unknown; players: { hand: string[] }[] };
    s.phase = { type: 'decide', decision: { player: 0, card: 'court-17', effect: 'swap', data: { rival: 1 } }, resume: s.phase };
    window.game!.load(s as never);
    return { mine: [...s.players[0].hand], theirs: [...s.players[1].hand] };
  });
}

test.describe('Farseers (court-17) in two steps', () => {
  test('the swap shows both hands as cards, and swaps the two picked', async ({ page }) => {
    const { mine, theirs } = await farseersSwap(page);
    await expect(page.locator('.hd.prompt')).toContainText('Veggenti: guarda la mano');
    await expect(page.locator('.cmd-bar [data-act="decline"]')).toHaveText('Non scambiare');
    await page.locator('.cmd-bar [data-act="decide-open"]').click();
    const take = page.locator('.modal [data-act="swap-take"]');
    const give = page.locator('.modal [data-act="swap-give"]');
    await expect(take).toHaveCount(theirs.length);
    await expect(give).toHaveCount(mine.length);
    // Cards, named as cards for a screen reader: no ids anywhere in the window.
    await expect(page.locator('.modal .acard')).toHaveCount(theirs.length + mine.length);
    expect(await page.locator('.modal').innerText()).not.toMatch(RAW_ID);
    for (const l of await page.locator('.modal [aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))) expect(l).not.toMatch(RAW_ID);
    await expect(page.locator('.modal [data-act="swap-confirm"]')).toBeDisabled();
    await take.first().click();
    await give.first().click();
    await page.locator('.modal [data-act="swap-confirm"]').click();
    await expect.poll(() => page.evaluate(() => (window.game!.state as unknown as { players: { hand: string[] }[] }).players[0].hand)).toContain(theirs[0]);
    expect(await page.evaluate(() => (window.game!.state as unknown as { players: { hand: string[] }[] }).players[1].hand)).toContain(mine[0]);
  });

  test('"Non scambiare" keeps both hands', async ({ page }) => {
    const { mine } = await farseersSwap(page);
    await page.locator('.cmd-bar [data-act="decline"]').click();
    await expect.poll(() => page.evaluate(() => window.game!.state.phase.type)).not.toBe('decide');
    expect(await page.evaluate(() => (window.game!.state as unknown as { players: { hand: string[] }[] }).players[0].hand)).toEqual(mine);
  });
});
