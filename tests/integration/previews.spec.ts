// Playwright: the command bar says what each choice gives before it is made, and why one is not possible
// (production/piano-blindatura-tavolo-2026-11-25.md, PR 6 "Anteprime").
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

/** A 3-player table at `seat`; seed 11 gives seat 1 the initiative. */
async function open(page: Page, seat: number): Promise<void> {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(build(`view=table&lang=it&motion=off&players=3&seed=11&seat=${seat}`));
  await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
}

test.describe('previews in the command bar', () => {
  test('following: Surpass, Copy and Pivot say what they give, or why not; seizing says its cost', async ({ page }) => {
    await open(page, 2);
    // Seat 1 leads Construction 5 and ends its turn: seat 2 follows.
    await page.evaluate(() => {
      const s = window.game!.state as unknown as { players: { hand: string[] }[] };
      window.game!.send({ type: 'lead', player: 1, card: s.players[1].hand[0] } as never);
      window.game!.send({ type: 'endTurn', player: 1 } as never);
    });
    await page.locator('.hand-card').first().click();
    const sub = (mode: string) => page.locator(`.cmd-bar [data-act="follow"][data-mode="${mode}"] .cmd-sub`);
    // Administration 2 against Construction 5: no Surpass (another suit), Copy and Pivot give one action each.
    await expect(sub('surpass')).toHaveText('serve Costruzione');
    await expect(sub('copy')).toHaveText('1 azione della guida');
    await expect(sub('pivot')).toHaveText('1 azione della carta');
    await expect(page.locator('.cmd-bar [data-act="seize"] .cmd-sub')).toHaveText('scarti 1 carta in più');
    // The whole rule in the tooltip: Copy names the lead's suit.
    await expect(page.locator('.cmd-bar [data-act="follow"][data-mode="copy"]')).toHaveAttribute('title', 'Copia: 1 azione della guida (Costruzione)');
  });

  test('leading: a lit ambition shows the Power at stake and who would win it now', async ({ page }) => {
    await open(page, 1);
    // Construction 5 declares Keeper; the first marker of chapter 1 is 5 and 3.
    await page.locator('.hand-card').first().click();
    const lit = page.locator('.abox.declare');
    await expect(lit).toHaveCount(1);
    await expect(lit.locator('.ab-declare')).toHaveText('Dichiara · 1° 5 · 2° 3');
    await expect(lit).toHaveAttribute('title', '1° 5 · 2° 3. Se finisse ora: 1° Giocatore 2, 2° nessuno');
  });
});
