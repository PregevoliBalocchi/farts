// Playwright: card powers used through the table, as a player would (production/base-fixes.md #46).
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(build('view=table&lang=en&motion=off&players=4&seed=3'));
  await expect.poll(() => page.evaluate(() => typeof window.game?.send)).toBe('function');
  return errors;
}

interface Seat {
  leader: string | null;
  resources: (string | null)[];
  hand: string[];
}
interface Shape {
  initiative: number;
  players: Seat[];
  map: Record<string, { buildings: { type: string; owner: number | string; damaged?: boolean }[] }>;
}

test('the Overseer taxes the same city twice by hitting it, from the map menu', async ({ page }) => {
  const errors = await open(page);
  // The seat about to lead gets the Overseer and empty resource slots; the system with its city.
  const system = await page.evaluate(() => {
    const g = window.game!;
    const s = structuredClone(g.state) as Shape;
    const me = s.initiative;
    s.players[me].leader = 'leader-10';
    s.players[me].resources = s.players[me].resources.map(() => null);
    g.load(s as never);
    return Object.entries(s.map).find(([, x]) => x.buildings.some((b) => b.type === 'city' && b.owner === me))?.[0] ?? '';
  });
  expect(system).not.toBe('');
  // Lead with a card that can tax.
  await page.locator('.hand-card:has-text("Tax")').first().click();
  await page.locator('.cmd-bar [data-act="lead"]').click();
  // The city's system, picked from the keyboard (the 3D map has no DOM pieces): the menu offers "Tax twice".
  await page.locator(`[data-sys="${system}"]`).focus();
  await page.keyboard.press('Enter');
  const twice = page.locator('.sys-menu .menu-opt[data-again="1"]');
  await expect(twice).toHaveCount(1);
  await expect(twice).toContainText('Tax twice');
  await twice.click();
  const after = await page.evaluate((id) => {
    const s = window.game!.state as unknown as Shape;
    const me = s.initiative;
    return {
      held: s.players[me].resources.filter(Boolean).length,
      damaged: s.map[id].buildings.some((b) => b.type === 'city' && b.owner === me && b.damaged),
    };
  }, system);
  expect(after).toEqual({ held: 2, damaged: true });
  expect(errors).toEqual([]);
});

// ---- Card powers reached from the table (production/base-fixes.md #47–#51) ----

interface Full extends Shape {
  phase: { type: string };
  court: { card: string; agents: Record<string, number> }[];
  ambitions: { declared: Record<string, string[]> };
  players: (Seat & { id: number; power: number; court: string[]; lore: string[] })[];
}

/** The seat about to lead, given `edit` (on a copy of the state), then loaded. Returns that seat. */
async function arrange(page: Page, edit: string): Promise<number> {
  return page.evaluate((code) => {
    const g = window.game!;
    const s = structuredClone(g.state) as Full;
    const me = s.initiative;
    new Function('s', 'me', code)(s, me);
    g.load(s as never);
    return me;
  }, edit);
}

test('the Feastbringer gives a chosen Guild card to the weakest Rival to declare', async ({ page }) => {
  const errors = await open(page);
  const me = await arrange(
    page,
    `s.players[me].leader = 'leader-07';
     s.players[me].court = ['court-02', 'court-05'];
     s.players[me].hand = ['administration-2', ...s.players[me].hand.filter((c) => c !== 'administration-2')].slice(0, s.players[me].hand.length);
     s.players.forEach((p, i) => { p.power = i === me ? 9 : 2 + ((i - me + 4) % 4); });`,
  );
  await page.locator('[data-act="hand"][data-card="administration-2"]').click();
  await page.locator('[data-act="lead-declare"]').first().click();
  const picks = page.locator('[data-act="gift-pick"]');
  await expect(picks).toHaveCount(2);
  await picks.first().click();
  const after = await page.evaluate((seat) => {
    const s = window.game!.state as unknown as Full;
    const weakest = s.players.filter((p) => p.id !== seat).sort((a, b) => a.power - b.power)[0];
    return { declared: s.ambitions.declared.wealth.length, mine: s.players[seat].court, theirs: weakest.court.includes('court-02') };
  }, me);
  expect(after).toEqual({ declared: 1, mine: ['court-05'], theirs: true });
  expect(errors).toEqual([]);
});

test('a Loyal Guild card spends Fuel as Material, chosen in the bar', async ({ page }) => {
  const errors = await open(page);
  await arrange(
    page,
    `s.players[me].court = ['court-01'];
     s.players[me].resources = s.players[me].resources.map((_, i) => (i === 0 ? 'fuel' : null));
     s.players[me].hand = ['administration-2', ...s.players[me].hand.filter((c) => c !== 'administration-2')].slice(0, s.players[me].hand.length);`,
  );
  await page.locator('[data-act="hand"][data-card="administration-2"]').click();
  await page.locator('.cmd-bar [data-act="lead"]').click();
  await page.locator('[data-act="spend"][data-slot="0"]').click();
  const asMaterial = page.locator('.cmd-bar [data-act="spend-as"][data-as="material"]');
  await expect(asMaterial).toHaveCount(1);
  await asMaterial.click();
  // Spent as Material it pays for a Build or a Repair (Fuel alone pays only for a Move).
  await expect(page.locator('.cmd-bar [data-act="kind"][data-kind="build"]')).toHaveCount(1);
  await expect(page.locator('.cmd-bar [data-act="kind"][data-kind="move"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the Noble influences twice when copying, from the Court menu', async ({ page }) => {
  const errors = await open(page);
  const me = await arrange(page, `s.players[me].hand = ['administration-2', ...s.players[me].hand.filter((c) => c !== 'administration-2')].slice(0, s.players[me].hand.length);`);
  // The seat leads and ends its turn; the next one, with the Noble, copies with an Administration card.
  const next = await page.evaluate((seat) => {
    const g = window.game!;
    g.send({ type: 'lead', player: seat, card: 'administration-2' } as never);
    g.send({ type: 'endTurn', player: seat } as never);
    const s = structuredClone(g.state) as Full;
    const n = (s.phase as unknown as { next?: number }).next ?? (seat + 1) % s.players.length;
    s.players[n].leader = 'leader-12';
    s.players[n].hand = ['administration-4', ...s.players[n].hand.filter((c) => c !== 'administration-4')].slice(0, s.players[n].hand.length);
    g.load(s as never);
    g.send({ type: 'follow', player: n, card: 'administration-4', mode: 'copy' } as never);
    return n;
  }, me);
  await page.locator('[data-act="court"][data-slot="0"]').click();
  const twice = page.locator('.court-menu [data-act="court-do"][data-x*="twice"]');
  await expect(twice.first()).toBeVisible();
  await twice.first().click();
  const placed = await page.evaluate((n) => (window.game!.state as unknown as Full).court.reduce((k, c) => k + (c.agents[n] ?? 0), 0), next);
  expect(placed).toBe(2);
  expect(errors).toEqual([]);
});
