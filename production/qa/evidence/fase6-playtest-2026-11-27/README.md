# Fase 6 simulated games, 2026-11-27 (production/base-fixes.md #61)

The Fase 6 matrix (production/piano-blindatura-tavolo-2026-11-25.md, Fase 6 item 1): 2, 3 and 4 players, base and
Leaders & Lore, Italian and English, 1366 and 1920, plus 1536 and 1280 for 4 players with Leaders & Lore, seeds 11, 12
and 13: 78 games with `tools/playtest/sim.mjs`. 74 ended (56 in chapter 5, 18 in chapter 4); 4 stopped in chapter 3.
Raw runs stay local (production/qa/evidence/playtest-2026-11-27-fase6*, not committed).

What they found, and what was done:

| Finding | Games | Cause | Fix |
|---|---|---|---|
| Stuck on Farseers' swap (court-17), "Scegli" opening a window with no options | 3p leaders seed 13, all 4 sizes and languages | the simulator did not know the swap window (`swap-take`, `swap-give`, `swap-confirm`) and closed it; the window works (`farseers-window-1920.png`) | the simulator picks a card of each hand, then Swap, at times "Non scambiare" |
| Resource total 25 > 24 > 23 | 4p leaders seed 12, 4 sizes | the piece ledger did not count the resource the Shaper (leader-14) places over a planet's icon | `pieceLedger` counts `planetTypes`; unit test seen failing first |
| A Tractor Beams option off screen | 3p leaders seed 12, 4 sizes | the card power window grew past the screen (`tractor-beams-before-1920.png`) | the window stops above the command bar and its list scrolls (`tractor-beams-after-1920.png`); the simulator scrolls a list to an option, as a person does |
| A lit system under "Mentre aspettavi" | 4p leaders seed 11, 4 sizes | the note stayed open while the seat played (`away-note-over-map-before-1920.png`) | the note closes when the seat acts, as its doc said; e2e test in previews.spec.ts |
| A card power under the next card's art | 4p leaders seed 11 | the own Court is fanned: the middle of a card is under the next | the simulator clicks the part in view |
| Targets under 24 px at 1280×720 | 4p leaders 1280, 3 seeds | hit areas sized for 1366 (34 stage px = 22.7 px at 67%) | hit areas of at least 36 stage px: "?", the step's cancel cross, "Evidenzia", the own Court's tab |

The recheck of the 11 games with findings (playtest-2026-11-27-fase6-recheck and -recheck2) ends every game with
no finding besides the fanned hand cards ("partly", observe only).
