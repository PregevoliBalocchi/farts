// Playwright: every Court, Lore and Leader face drawn in Italian and in English
// (production/piano-blindatura-tavolo-2026-11-25.md, PR 5 "Test delle facce"): no text spills out of its box,
// a Vox card's text ends above its sketch, and a picture of each face is kept with the test's results.
import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = (query: string): string => `${pathToFileURL(resolve('dist-single/index.html')).href}?${query}`;

for (const lang of ['it', 'en'] as const) {
  test(`every card face in ${lang} keeps its text inside its boxes and above the Vox sketch`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(build(`view=cards&lang=${lang}`));
    await expect(page.locator('.card-sheet[data-fitted="true"]')).toHaveCount(1);
    const faces = page.locator('.faces figure.face');
    expect(await faces.count()).toBeGreaterThan(80);

    const problems = await page.evaluate(() => {
      const out: string[] = [];
      for (const fig of document.querySelectorAll<HTMLElement>('.faces figure.face')) {
        const id = fig.dataset.card;
        for (const el of fig.querySelectorAll<HTMLElement>('.cface .cf-fit, .cface .cf-title')) {
          const title = el.classList.contains('cf-title');
          const over = title ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
          if (over > 1) out.push(`${id}: ${title ? 'title' : 'text'} spills by ${over}px`);
        }
        // A Vox card: the last line of text ends where the sketch's faded top edge ends: the CSS mask over its box,
        // or the picture itself (drawn whole at the box's bottom, its top 12% faded by the cutting tool).
        const sketch = fig.querySelector<HTMLImageElement>('.cface.vox .cf-sketch');
        const body = fig.querySelector<HTMLElement>('.cface.vox .cf-body');
        if (sketch && body && sketch.naturalWidth) {
          const s = sketch.getBoundingClientRect();
          const h = Math.min(s.height, (s.width * sketch.naturalHeight) / sketch.naturalWidth);
          const ink = Math.max(s.top + s.height * (fig.querySelector('.cface.with-crisis') ? 0.53 : 0.14), s.bottom - h * 0.88);
          const bottom = Math.max(...[...body.querySelectorAll('p')].map((p) => p.getBoundingClientRect().bottom));
          if (bottom > ink + 1) out.push(`${id}: text ends ${Math.round(bottom - ink)}px into the sketch`);
        }
      }
      return out;
    });

    // One picture per face, kept with the run's results.
    for (let i = 0, n = await faces.count(); i < n; i++) {
      const f = faces.nth(i);
      await f.screenshot({ path: info.outputPath(lang, `${await f.getAttribute('data-card')}.png`) });
    }
    expect(problems).toEqual([]);
  });
}
