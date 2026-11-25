# Evidence: safety net (PR 1 of production/piano-blindatura-tavolo-2026-11-25.md)

Commit base: `00f2e85` (main). Checked on 2026-11-25, Windows, Chrome with SwiftShader WebGL.

## Piece ledger and the Outrage placeholder

`tests/unit/engine/ledger.test.ts`, written before the code:

- **Before:** 6 of 6 failed. `pieceLedger` did not exist, and `clearOutrage` gave back an agent for a placeholder.
- **After:** 6 passed. The full unit suite passes: 604 tests.

## Known problems, as checks that must fail until fixed

`tests/integration/known-problems.spec.ts`. Run once without the `test.fail()` marks, on the code of this PR, each check failed for the reason it names:

| Check | Failure seen |
|---|---|
| D1 collect dice after Predictive Sensors (fixture `collect-dice.json`) | `[data-act="decline"]`: expected 0, received 1 |
| D2 empty choice, Song of Freedom (fixture `empty-choice.json`) | `[data-act="decide-open"]`: expected 0, received 1 |
| 2.1 rivals region at 2 players | `elementFromPoint` below the band: expected `CANVAS`, received `DIV` |
| 2.4 Court zoom over the next card | next card's centre not reachable: `false` |
| A1 zoom's accessible name | received `"court-16"` |
| 2.7 targets at 1366×768 | 6 controls under 24 px |

With the marks, all 6 report as expected failures and the suite passes. A fix turns its check green; Playwright then fails the check ("expected to fail but passed") until the fix's PR removes the mark.

## Seeded games

- **Repeatable:** the same seed twice gives the same `moves.json` (md5 `4899234c…` both runs, 2 players, base game, seed 3, 80 steps).
- **The gate:** `tests/integration/playthrough.spec.ts` played the 4 configurations of `playthrough/seeds.json` (80 steps each). They passed, with every finding listed in `playthrough/known.json`. Run time: 11.6 min in one process. CI runs each game on its own runner.
- **Coverage:** together the seeds reached:
  - lead, follow and actions;
  - a battle (allocate);
  - card choices (decide);
  - the Leaders and Lore draft;
  - Court acquisitions.

## Findings new to this pass

The seed probes (2 seeds × 4 configurations) found:

- `empty:court-30:whenSecured`: Guild Struggle offers "Scegli" with nothing to choose. It came up 24 times, and the 4-player game got stuck on it.
- `empty:leader-09:setupLore`: the same problem in the lore kept at setup.
- `rawlabel:recent: log`: the log's accessible label names cards by id ("sceglie leader-01").
- `rawlabel:dr-card: draft-pick`: the draft cards' labels are ids ("Prendi lore-13").

All four are in `known.json`, each with the plan step that fixes it.
