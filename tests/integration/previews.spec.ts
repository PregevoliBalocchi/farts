// Playwright: the command bar says what each choice gives before it is made, and why one is not possible
// (production/piano-blindatura-tavolo-2026-11-25.md, PR 6 "Anteprime").
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
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

test.describe('battle window', () => {
  test('the rolled dice are grouped in the order they resolve, and the defender is told what is coming', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const url = build('view=table&lang=it&motion=off&players=2&variant=leaders&seat=1');
    await page.goto(url);
    await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
    // Seat 1 attacks seat 0 at the 4th gate (the D1 fixture) and rolls.
    await page.evaluate((s) => window.game!.load(s as never), JSON.parse(readFileSync(resolve('tests/integration/fixtures/collect-dice.json'), 'utf8')));
    const summary = page.locator('.modal button.primary');
    if (await summary.count()) await summary.first().click();
    await page.locator('[data-act="do-battle"]').click();
    await expect.poll(() => page.evaluate(() => window.game!.state.phase.type)).toBe('allocate');
    const order = page.locator('.battle-win .b-order li');
    await expect(order.first()).toContainText('colpi alle navi di Giocatore 1');
    await expect(page.locator('.battle-win .b-defend')).toHaveCount(0);
    // The same battle at the defender's seat: what is coming, no controls.
    const state = await page.evaluate(() => structuredClone(window.game!.state));
    await page.goto(url.replace('seat=1', 'seat=0'));
    await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
    await page.evaluate((s) => window.game!.load(s as never), state);
    if (await summary.count()) await summary.first().click();
    await expect(page.locator('.battle-win .b-defend')).toContainText(/^Giocatore 2 ti attacca: \d+ colpi alle tue navi/);
    await expect(page.locator('.battle-win [data-act="allocate"]')).toHaveCount(0);
  });
});

test.describe('while you were waiting', () => {
  test('when the turn comes back, a note says what rivals took meanwhile', async ({ page }) => {
    await open(page, 2);
    /** Loads the current state with the initiative at `seat`; `take` also removes a resource of seat 2 and captures one of its agents. */
    const load = (seat: number, take = false) =>
      page.evaluate(({ seat, take }) => {
        const s = structuredClone(window.game!.state) as unknown as { initiative: number; players: { resources: (string | null)[]; captives: number[] }[] };
        s.initiative = seat;
        if (take) {
          s.players[2].resources[s.players[2].resources.findIndex((r) => r)] = null;
          s.players[0].captives.push(2);
        }
        window.game!.load(s as never);
      }, { seat, take });
    // Seat 2 leads (its turn), then the turn passes (its pieces are counted), then a rival takes a resource and
    // captures an agent of seat 2, then seat 2 leads again.
    await load(2);
    await expect(page.locator('.away-note')).toHaveCount(0);
    await load(0);
    await load(0, true);
    await load(2);
    const note = page.locator('.away-note');
    await expect(note).toContainText('Mentre aspettavi');
    await expect(note.locator('li')).toHaveCount(2);
    await expect(note.locator('li').nth(0)).toHaveText(/^Ti hanno preso 1 /);
    await expect(note.locator('li').nth(1)).toHaveText('Agenti catturati: 1');
    await note.locator('[data-act="away-close"]').click();
    await expect(note).toHaveCount(0);
  });
});

test.describe('rule reminders', () => {
  test('the "?" of a moment opens its rules in view, and closes on a second press', async ({ page }) => {
    await open(page, 2);
    await page.evaluate(() => {
      const s = window.game!.state as unknown as { players: { hand: string[] }[] };
      window.game!.send({ type: 'lead', player: 1, card: s.players[1].hand[0] } as never);
      window.game!.send({ type: 'endTurn', player: 1 } as never);
    });
    await page.locator('.hand-card').first().click();
    const q = page.locator('.cmd-bar [data-act="rule-help"]');
    await q.click();
    const box = page.locator('#rule-pop');
    await expect(box.locator('p')).toHaveCount(3);
    await expect(box.locator('p').first()).toContainText('Seguire: Supera con il seme della guida');
    // Whole on screen and on top: the bar does not clip it.
    const seen = await box.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.top >= 0 && r.bottom <= innerHeight && !!top && el.contains(top);
    });
    expect(seen).toBe(true);
    await q.click();
    await expect(box).toHaveCount(0);
  });
});
