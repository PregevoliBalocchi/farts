# Card fixes, 2026-11-27 (production/base-fixes.md #59)

Built with `npm run build:single`, 1920×1080, Italian, 3 players, seed 3, P0 holding the initiative.

- `empath-reroll-rifles-1920.png`: P0 holds Galactic Rifles (lore-02) and Empath's Vision (lore-19)
  with Psionics declared, and fires the rifles at a rival outside battle. The roll's window offers
  Empath's Vision ("ritira fino a 3 dadi") before the hits are assigned. Before the fix the engine
  refused any reroll of a roll made outside battle.
- `overseer-starports-1920.png`: P0 is the Overseer (leader-10) with a fresh and a damaged starport on
  the same planet, leading Construction. The planet's menu offers a plain ship and two second ships,
  one hitting the fresh starport, one the damaged one (destroyed). Before the fix there was one option
  and it always hit the first starport.

The campaign event-dice reroll is covered by the unit test in tests/unit/engine/campaign-events.test.ts.
