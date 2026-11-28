# Test lab, 2026-11-28

Story: production/base-fixes.md #63. The owner asked for a test mode for every leader, lore and card,
to check how each works in the rules and on screen.

## What it is

`play.html?lab=1` (or `?lab=<id>`, e.g. `?lab=lore-01`), local games only:

- A panel on the right lists the 118 items: 16 leaders, 28 lore (14 base, 14 expansion),
  46 Court cards (31 base, 15 campaign, tried outside a campaign) and 28 action cards. It has a search.
- Picking one sets up a 3-player game (4 for the 4-player action cards) where seat 0 leads:
  - a leader becomes seat 0's leader, with its starting pieces;
  - a lore card becomes seat 0's lore;
  - a faction card is in seat 0's Court;
  - a decree is first in the Court row, with 3 of seat 0's agents on it;
  - an action card is in seat 0's hand.
- To use the item at once, seat 0 also gets:
  - a card of each suit;
  - a token of each resource that fits;
  - 3 more ships;
  - a rival fleet with a city and a starport in one of its systems.
- Every piece and token comes out of a supply, so the piece ledger matches a new game's. The unit test
  checks this for every item, and was watched failing when the ships were not taken from the supply.
- The Archivist starts with its setup choice (keep 2 of 5 lore); the lab game leads after it.
- Each item is marked To try, OK or Problem, with a note. The marks stay in this browser (localStorage);
  "Esporta" downloads them as `lab-<date>.md`.
- The panel takes the right 340 px and the table fits in what is left. The tab at the top right closes it.

## Shots

- `lab-decree-1920.png`: Rivolta di Massa (court-26) first in the Court row with seat 0's 3 agents; the panel on the right.
- `lab-archivist-1366.png`: the Archivist at 1366×768, before its setup choice.
- `lab-archivist-choice-1920.png`: "Scegli" opens the Archivist's window, keeping 2 of 5 lore.

## Automated pass

`node tools/playtest/lab-sweep.mjs` opens each item's lab game and plays 30 simulated steps. It clicks the
item's own power or card most of the time. It writes `production/qa/evidence/lab-sweep-<date>/summary.md`.
The pass reports observations, not verdicts. An item the log never names is NOT ASSESSED and stays for the
manual check.

## Tests

- `tests/unit/lab/lab-setup.test.ts`: 237 checks. Every item's game is set up as described, and holds the
  same pieces, tokens and cards as a new game.
- `tests/integration/lab.spec.ts`: 4 browser tests.
  - The list and a pick.
  - Marks and note kept after a reload.
  - The panel makes room and closes.
  - No panel outside the lab.

## Result of the pass (lab-sweep-2026-11-28/summary.md)

- All 118 games ran: no page errors, no stuck or refused moves, no piece appearing or vanishing, no
  control hidden or off screen.
- 54 items were named in the log (played, secured or their power used). These include all 28 action
  cards, the 6 base decrees and the 5 campaign decrees.
- 48 were not seen, so they are NOT ASSESSED by the pass:
  - all 28 lore cards;
  - 10 base faction cards;
  - 10 campaign faction cards.
  Many are passives the log does not name. Others are powers the random play did not reach: Tool-Priests'
  Summon (Build), for example, is on only with a Build action, and is rightly off when leading
  Administration. These, and the 16 leaders, are for the manual check in the lab.
- Two earlier runs found stuck games with the 7 cards. Both were faults of the pass itself, not of the
  game, and both are fixed:
  - it clicked the item's card behind the Pass window;
  - it clicked the item's picked card again, which put it back.

## The admins' way in (base-fixes #64)

- The entrance page (online/index.html) has a "Laboratorio" section with "Apri il laboratorio". It is shown
  only to the master and the admins.
- `play.html?lab=1` on the site now works:
  - It checks the role again and tells everyone else the lab is for admins.
  - It reads the cards from the database, as online games do.
  - It opens the lab as a local game: nothing is saved or shared.
  - The panel has an "Esci" link back to the entrance.
- Before this, the lab ran only in the local build: online, `play.html?lab=1` answered "Nessuna partita indicata".
- `home-lab-admin-1366.png`: the entrance with the admin sections shown. The shot was taken without
  signing in, by showing the sections in the page; signed out, the section stays hidden, as checked.
- Not checked here: the signed-in admin's way into the lab on the site. Signing in with Google is for the
  owner to do once it is published.
