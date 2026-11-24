# Base game fixes (owner's list, 2026-11-24)

The campaign is paused (design/campaign-plan.md §5). This is the owner's list
of base-game problems, in their words (translated), with status.

| # | Problem | Status |
|---|---|---|
| 1 | FPS on low-end machines: stutter, almost unplayable | done: Settings › Graphics (Automatic / Light / Minimal, remembered); Automatic goes Light by itself when slow, then stops the idle animations if still slow (measured: 58, 29 and 0 frames a second when nothing happens) |
| 2 | Game start: players place their starting resources on the slots they want (now auto, left to right) | kept as the rulebook says (owner, 2026-11-24): base rulebook p. 5 step O puts them in the leftmost and next leftmost circle slots |
| 3 | Triangular build slots differ in size and shape from the city and starport bases | done: the map's slot triangles are now exactly a building base's outline (size, rounding, centre); the boards' triangles take the same rounding |
| 4 | Card powers (e.g. Silver-Tongues) pick targets from a text list: always show the element itself, graphically | done: card powers and card Decisions show what they touch as pictures (resource tokens, Guild/Court cards, the seat as a coloured badge); systems are picked on the map |
| 5 | Selecting map elements (ship, sector, starport) is hard | done: a click anywhere in a system's area picks it, the system under the pointer is outlined, and a slightly shaky click still counts |
| 6 | Living Structures, Prune: with one building it flips at once with no selection; with several, highlight the buildings and click one | done: Prune (and every card power whose uses target a system) is picked on the map; lit systems, click one |
| 7 | Own pieces hard to find: a button on the own board that highlights them on the map | done: "My pieces" button over the own board, lights them 6 s |
| 8 | Sector summary popup: appears on unclear hover spots; must open on a click anywhere in the sector/gate and close after a few seconds or on a second click | done: opens on a click anywhere in the system's area, closes on a second click or after 4.5 s |
| 9 | 2-player games: unclear how points are scored, the minimum threshold to beat | done: the ambition box stands among the players' counts in the ambitions column, and the end-of-chapter window explains it |
| 10 | Ambitions column: show only the players in the running (not those at 0) | done |
| 11 | Ambitions column: the 3 ambition tokens are not centred; drop the "ambition markers left" caption | done |
| 12 | Trophies and Captives boxes on all boards: bigger and brighter (now less visible than cards, agents, ships, starports) | done |
| 13 | Player boards: swap line styles, circles solid and triangles dotted | done |
| 14 | Battle dice in 3D | done: each die is a cube with its six printed faces, thrown in turning and landing on the rolled face |
| 15 | End of chapter is not evident: points are scored automatically and nobody understands | done: a window at the end of each chapter shows every declared ambition, its markers, who came first and second with how much, the Power gained and the totals |
| 16 | Turn box ("Turno di …, in diretta"): too much info, drop "Mentre aspetti" and "Prossimo", move it (owner's sketch: up, towards the top) | done: no "while you wait"/"next", top right of the map while another seat plays |
| 17 | The prompt lines under the Court row ("Lead with a card…"): move them under the own hand of action cards | done |
| 18 | Undo not visible (online); also Ctrl+Z | done: always shown; online it undoes own moves until another seat moves or something hidden/random is revealed; Ctrl+Z / Cmd+Z |
| 19 | Action cards greyed out when it is not your turn: always fully visible | done |
| 20 | Battle: assigning the dice/hits is clumsy, find a simpler, more elegant way | done: dice picked with one tile per type (die, what it does, - n +); hits start already placed in the usual order, Confirm or change them |
| 21 | Battle raid with keys: the things to steal are text, show them as pictures | done: resource tokens and Guild cards, key cost and pick order on them |
| 22 | Hover cards must work perfectly | done: checked rival boards, nested cards, ambitions, trophies/captives, resources, Court zoom; fixed hover cards staying open once the pointer reached the 3D map |
| 23 | Seize the initiative "does not work" | done: the seize worked in the engine, but the marker stayed with the leader until the round ended; it now moves at once to the seizer, laid down (base rulebook p. 10) |
| 24 | Hover cards closed by themselves when the table redrew while the pointer rested on them | done: an open hover card survives the redraw, its contents updated |
| 25 | Ships, planets and gates: ships stand in odd places, unclear which system they are in (planets and gates alike) | done: at a planet they orbit it just past its rim (below it first, inside its sector), a dashed orbit and a halo under each group in the planet's colour; at a gate they stand along the ring beside its number; pointing at a system or a ship lights its orbit. Evidence: production/qa/evidence/piece-placement/ |
| 26 | Too many ships on screen: every fleet (one seat's ships in a system or gate) as a single ship, its count beside it in the seat's colour, fresh in white and damaged in black (first red; changed so it is not taken for the red seat) | done: one model per fleet (fresh if any ship is fresh, else damaged), the tag is a splat in the seat's colour with the numbers in its middle: fresh large in white outlined in black, damaged smaller in black outlined in white beside it (the splat widens to hold both); black alone when all are damaged |
