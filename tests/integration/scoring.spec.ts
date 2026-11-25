// Playwright: the end-of-chapter scoring in plain words (production/piano-blindatura-tavolo-2026-11-25.md,
// PR 6 "Punteggio di fine capitolo"): what each ambition was worth, why a seat gained nothing, and the 2-player
// note at reading size.
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

/** Opens a table and loads a chapter's scoring, which opens the scoring window. */
async function scored(page: Page, players: number, scoring: unknown): Promise<void> {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(build(`view=table&lang=it&motion=off&players=${players}&seed=11&seat=0`));
  await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
  await page.evaluate((sc) => {
    const s = structuredClone(window.game!.state) as unknown as { lastScoring: unknown };
    s.lastScoring = sc;
    window.game!.load(s as never);
  }, scoring);
  await expect(page.locator('.modal .sc-totals')).toBeVisible();
}

test.describe('chapter scoring', () => {
  test('says what each ambition was worth and why a seat gained nothing', async ({ page }) => {
    await scored(page, 3, {
      chapter: 1,
      ambitions: [
        // Tycoon: seat 1 first, seats 0 and 2 tied for second, so nobody takes it.
        { ambition: 'wealth', markers: [{ first: 5, second: 3 }], first: [1], second: [], counts: [2, 4, 2] },
        // Keeper: two markers; seat 2 has no Relics.
        { ambition: 'relics', markers: [{ first: 3, second: 2 }, { first: 2, second: 0 }], first: [0], second: [], counts: [3, 0, 0] },
      ],
      gains: [5, 5, 0],
      power: [5, 5, 0],
    });
    await expect(page.locator('.modal .sc-mk').nth(0)).toHaveText('1°: 5 Potere · 2°: 3');
    await expect(page.locator('.modal .sc-mk').nth(1)).toHaveText('1°: 5 Potere · 2°: 2');
    await expect(page.locator('.modal .sc-why')).toHaveCount(1);
    await expect(page.locator('.modal .sc-total').nth(2).locator('.sc-why')).toHaveText('Magnate: pari per il 2°, nessuno lo prendeCustode: non ne hai');
  });

  test('2 players: the ambition box note is at reading size', async ({ page }) => {
    await scored(page, 2, {
      chapter: 1,
      ambitions: [{ ambition: 'trophies', markers: [{ first: 5, second: 3 }], first: [2], second: [0], counts: [1, 0, 3] }],
      gains: [3, 0],
      power: [3, 0],
    });
    const note = page.locator('.modal .sc-note');
    await expect(note).toContainText('il riquadro ambizione conta come un terzo giocatore');
    expect(await note.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
    await expect(page.locator('.modal .sc-total').nth(1).locator('.sc-why')).toHaveText('Generale: non ne hai');
  });
});

test.describe("end screen (decision G)", () => {
  test("shows the winner, the Power after every chapter and how a tie was broken", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(build("view=table&lang=it&motion=off&players=3&seed=11&seat=0"));
    await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe("function");
    await page.evaluate(() => {
      const s = structuredClone(window.game!.state) as unknown as { players: { power: number }[]; initiative: number; chapter: number; powerByChapter: number[][]; phase: unknown };
      // Seats 0 and 1 tie at 30; seat 1 has the initiative, so it is earlier in turn order and wins (rulebook 6.2.3).
      [30, 30, 22].forEach((n, i) => (s.players[i].power = n));
      s.initiative = 1;
      s.chapter = 2;
      s.powerByChapter = [[12, 15, 9], [30, 30, 22]];
      s.phase = { type: "gameOver", winners: [1] };
      window.game!.load(s as never);
    });
    const end = page.locator(".modal");
    await expect(end.locator("#modal-title")).toHaveText("Vince Giocatore 2");
    await expect(end.locator(".end-why")).toContainText("Pari a 30 Potere: vince Giocatore 2, che viene prima nell'ordine di turno.");
    const rows = end.locator(".end-table tr");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(1)).toHaveText(/^Vince\s*Giocatore 2\s*15\s*30\s*30$/);
    await expect(rows.nth(3)).toHaveText(/^3\s*Giocatore 3\s*9\s*22\s*22$/);
  });
});
