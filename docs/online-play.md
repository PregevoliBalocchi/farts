# Online play: first playable version

A first way to play a whole game online, each player on their own computer,
behind the invite-only access (`docs/online-access.md`). The screen is the
table screen (`src/ui/table/`, spec in `docs/ui/UI_SPEC.md`); the older debug
table (`src/ui/debug.ts`) keeps its own online mode but is no longer used here.

## How it works

- **Content**: the master or an admin uploads `data/content.json` from the entrance page
  ("Contenuti del gioco"). It is stored in Firestore `content/main`, readable
  by invited members only, and never bundled into the public pages
  (`vite.online.config.ts` replaces the local content loader with a stub).
- **Starting a game**: any member, from the entrance page's "Nuova partita"
  screen (`src/web/lobby.ts`, logic in `src/online/newgame.ts`), picks online
  or "su questo computer" (hotseat), the variant, the players (2–4: invited
  addresses online, optional names in hotseat) with a colour each, their order
  around the table and who starts (or random). The seat order follows the
  list, the creator first online. Each seat's colour is saved in `colors`
  (online games) or in the browser (hotseat); the table shows each seat in its
  colour (`setSeatColors`) and by its name or address before "@"
  (`setSeatNames`). The rules engine sets up the game with a random seed.
  Locally, `?view=lobby` shows the same screen with sample games, and
  `?view=table&names=…&colors=…` a table with names and colours.
- **Playing** (`online/play.html`, `src/web/play.ts`): each player opens the
  game from "Le tue partite". The rules run in the browser of whoever acts
  (`dispatch`); the new state is saved in `games/{id}` with a transaction that
  only succeeds if nobody else moved meanwhile (`version`); every other screen
  receives it through a live listener.
- **One seat per screen**: `mountTable(root, online)` takes the fixed seat, a
  `commit` callback that saves a move, and exposes `load(state)` for states
  saved by other screens. A screen only sends commands for its own seat (any
  other is refused with a message), shows only its own hand and, during
  someone else's turn, the waiting prompt. Undo, restart, seat and player
  settings are off online; only the language can be changed. Choices asked by
  card effects (Decisions) are typed as JSON for now.
- **Firestore rules** (`firestore.rules`): only seated players read and move a
  game; a move must bump `version` by one and touch only the state fields;
  only invited addresses can be seated; `colors`, when present, has one
  colour 0–3 per seat; creators and admins can delete games (the bin button
  in "Le tue partite"). After changing the rules, deploy them by hand
  (`npm run deploy:online`).

## Limits of this version

- **Trust among friends**: the whole state, rivals' hands included, is in the
  game document, so a player who inspects the browser could see other hands,
  and the rules are checked by the mover's browser, not by a server. Fixing
  this needs a server (not available on the free plan); see the options in
  `docs/online-access.md`.
- The saved log keeps the last 400 entries.
- **Images are public**: anything bundled into `dist-online/` is visible to
  anyone with the link. `assets/ui/` is picked up by the build when present,
  and it is committed: it holds the publisher's development kit pictures and
  the board picture (owner's decision for the invite-only beta, see
  `docs/ui-assets.md`). The card faces in `assets/cards/court/`,
  `court-campaign/`, `lore/` and `leaders/` are committed and bundled too.

## Deploy

`npm run deploy:online` (see `docs/online-access.md`). Then, once, the master or an admin
uploads the content from the entrance page.
