# Online play: first playable version

A first way to play a whole game online, each player on their own computer,
behind the invite-only access (`docs/online-access.md`). The screen is the
debug table for now; the real interface replaces it later.

## How it works

- **Content**: the master uploads `data/content.json` from the entrance page
  ("Contenuti del gioco"). It is stored in Firestore `content/main`, readable
  by invited members only, and never bundled into the public pages
  (`vite.online.config.ts` replaces the local content loader with a stub).
- **Starting a game**: any member, from the entrance page, lists the other
  players' addresses (2–4 players in all, all invited) and the variant. The
  seat order follows the list, the creator first. The rules engine sets up
  the game with a random seed.
- **Playing** (`online/play.html`, `src/web/play.ts`): each player opens the
  game from "Le tue partite". The rules run in the browser of whoever acts
  (`dispatch`); the new state is saved in `games/{id}` with a transaction that
  only succeeds if nobody else moved meanwhile (`version`); every other screen
  receives it through a live listener.
- **One seat per screen**: a screen only sends commands for its own seat and
  shows only its own hand; during someone else's turn it shows "In attesa di…".
  Choices asked by card effects (Decisions) are typed as JSON for now.
- **Firestore rules** (`firestore.rules`): only seated players read and move a
  game; a move must bump `version` by one and touch only the state fields;
  only invited addresses can be seated; creators and admins can delete games.

## Limits of this version

- **Trust among friends**: the whole state, rivals' hands included, is in the
  game document, so a player who inspects the browser could see other hands,
  and the rules are checked by the mover's browser, not by a server. Fixing
  this needs a server (not available on the free plan); see the options in
  `docs/online-access.md`.
- The saved log keeps the last 400 entries.
- The screen is the debug table (forms and JSON), not the final interface.

## Deploy

`npm run deploy:online` (see `docs/online-access.md`). Then, once, the master
uploads the content from the entrance page.
