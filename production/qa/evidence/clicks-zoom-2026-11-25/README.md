# Evidence: clicks, card zoom and hit areas (PR 2 of production/piano-blindatura-tavolo-2026-11-25.md)

Checked on 2026-11-25, Windows, Chrome with the GPU (`PW_GPU=1`), on the single-file build.

## Checks that failed before and pass now

`tests/integration/known-problems.spec.ts`, `test.fail()` marks removed for 2.1, 2.4, A1 and 2.7; new check 2.8.

| Check | Before | After |
|---|---|---|
| 2.1 rivals region at 2 players lets clicks reach the map | `DIV` | `CANVAS` |
| 2.4 Court zoom leaves the next Court card clickable | `false` | `true` |
| A1 zoom names the card | `"court-16"` | card name |
| 2.7 controls at least 24 px at 1366×768 (with own Court cards) | `mine-open 17×165` | none under 24 |
| 2.8 an ambition's hover card stays off the command bar | `amb:relics: 445-537 over 513` | none |

## Wider interface font

The CI runner (Linux, no Segoe UI) found "Annulla mossa" and "Assegna in automatico" cut. Reproduced on Windows with the interface font set to Verdana: the same findings, plus the Empath row under the Court panel at 1366×768. After the fix, with Verdana, the command-bar and seeded-game tests pass (7 of 7); with Segoe UI the full e2e passes (33 of 33).

## Seeded games

With an empty `known.json` the 4 games show no covered Court card, no off-screen and no tiny target; what is left is the map's lit systems under panels (PR 5), cards named by id (PR 3, A1), empty choices and the stuck decision (PR 3).

## Screenshots

- `court-zoom-1920.png`, `court-zoom-1366.png`: a Court card's zoom under the row, the next cards visible.
- `own-court-zoom-*.png`: the own Court's zoom above the bar.
- `hand-zoom-*.png`: hand cards rise; they have no separate zoom (by design).
- `rivals-2p-1920.png`: 2 players, the empty part of the rivals' column.
- `amb-tip-off-bar-1366.png`: an ambition's hover card above the command bar.
- `wide-font-1366.png`: the table with Verdana: bar and ambitions whole, notes smaller.
