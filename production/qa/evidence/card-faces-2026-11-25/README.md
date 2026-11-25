# Evidence: lit systems framed, Ancient Holdings, Vox cuts, card faces, glossary (PR 5 of production/piano-blindatura-tavolo-2026-11-25.md)

Checked on 2026-11-25, Windows, Chrome with the GPU, on the single-file build.

- **Lit systems framed** (2.3): when a choice lights systems, the map pans (and zooms out if needed) so all of them sit
  in the part the panels leave free, above the command bar. `lit-systems-framed-1366.png`: "Muovi" at 1366×768, the
  three starting systems all clear. The 4 seeded games no longer report off-screen targets (`known.json` is `[]`).
- **Ancient Holdings (lore-13, decision D)**: the slot the card adds, and its token, are drawn on the card in the own
  Court, no longer as a loose slot on the board. E2e: `tests/integration/decisions.spec.ts`.
  `ancient-holdings-on-card-1920.png` (a Relic on the card, bottom right).
- **Vox cuts**: Song of Freedom's sketch was cut with the printed English note in it. Cuts can now start lower per card
  (`tools/cards/extract-art.mjs`, `CARD_REGIONS`), the top edge fades, and the face draws the sketch whole at the box's
  bottom instead of stretching it. `vox-cuts-before-after.png`: printed card, then the new cut, for court-26..31
  (only court-29 changes in content).
- **Card faces test** (`tests/integration/card-faces.spec.ts`): all 90 Court, Lore and Leader faces in Italian and in
  English (`?view=cards` now shows them): no title or text outside its box, a Vox text ending above its sketch, and a
  picture of every face kept with the run's results. It failed first on Canto di Libertà in Italian (text 8 px into
  the sketch), passes after the cut and placement above. `faces-it.jpg`, `faces-en.jpg`: the whole sheet.
- **One glossary**: "Casella ambizione" and "Riquadro Ambizione" are now "riquadro ambizione" everywhere (the
  rulebook's "ambition box"). Unit test `tests/unit/i18n/glossary.test.ts`, seen failing on the old texts.
