# Working together on this repo

Two people, each with their own GitHub account and their own Claude Code,
work on this repository in parallel. This page is the shared ground: read it
before the first session. Claude Code reads it too (CLAUDE.md points here).

## 1. Set up a machine

- **Git**, and on Windows **Git for Windows** (its Git Bash runs the project
  hooks). `jq` is optional: the hooks use it when present.
- **Node.js** `^22.12 || ^24 || >=26` (see `package.json` `engines`).
- **Claude Code**, started **from the repository folder**: the project's
  agents, skills, hooks and permission rules in `.claude/` load only then.

```bash
git clone <repo url>
cd <repo folder>
npm ci
npx playwright install chromium-headless-shell   # only for the browser tests
npm run test:unit                                  # must pass before you start
npm run dev                                        # debug UI on http://localhost:5173
```

## 2. Owner content: what is in git

The game's data, `data/content.json` (map, setup cards, leaders, cards and
their texts, campaign data), **is committed**: owner's decision, 2026-11-23.
The repository is private and the publisher offers the card data for free
download. A clone plays with the real content and runs the content tests.

The rest of the owner's material is still **git-ignored on purpose**:

| Path | What |
|---|---|
| `data/*.local.md` | mechanics summaries of the cards |
| `assets/cards/campaign/`, `assets/cards/setup/`, `assets/map/` | other card and board images (the card faces the table shows are committed) |
| `PG/` | campaign Fate transcriptions |
| `prototypes/ui-lab/img/` | images used by the UI test table |

Without `data/content.json` everything still builds and runs on the placeholder
`data/content.example.json`, and the content tests are skipped. To play or
check the real content, get these files **privately from the owner** (never
through the repo, issues or pull requests) and copy them to the same paths.

**Rule for code, tests and docs:** no names, card texts or images of the
original game. One exception, decided by the owner (2026-11): the pictures in
`assets/ui/` (the publisher's development kit and the board picture) are
committed, and so are the card pictures the table shows (`assets/cards/court/`,
`court-campaign/`, `lore/`, `leaders/`), see `docs/ui-assets.md`. Card texts
live only in `data/content.json` (committed, see above): never in code, tests
or docs. Cards are named by neutral ids (`court-01`, `lore-01`,
`leader-01`, `court-cc-01`, `fate-a-01`); rules are summarised in our own
words. The publisher's online card library (FAQ, errata) is the reference
for rulings: https://cards.buriedgiant.com/search?q=game:arcs — its card
texts may go into `data/content.json`, nowhere else. Site numbering matches our ids
(`BCnn` = `court-nn`, `Lnn` = `lore-nn`, `LEADnn` = `leader-nn`).

**The rulebooks are in the repo** (owner's decision, 2026-11-24): the
publisher's PDFs of the base game and the campaign expansion (rulebooks, aid
booklet, aid sheets, punchboard) are committed in `docs/rules/`, each with a
plain-text copy (`pdftotext -layout`) to search. **Read the rule there before
writing or changing any game rule**; do not work from memory or from other
sites. Code, tests and other docs still summarise rules in our own words.

## 3. Project decisions to keep

- **Play mode:** multiplayer, each player on their own computer, remote.
  Also, at the owner's request (2026-11-22), a hotseat option to try the
  game on one computer: every seat played in turn, a hand-over screen
  between players, the game saved only in that browser (`src/web/hotseat.ts`).
  Online, the UI shows one player's view (own hand visible, rivals' hidden)
  and talks to an authoritative server running the rules engine.
- **Campaign:** the goal includes the campaign; the base game comes first.
  Campaign rules are summarised in `design/campaign-notes.md`.
- **Rules engine:** pure and deterministic (`src/game/engine/`): every
  change is a command through `dispatch`, state is plain JSON, randomness
  comes from the seeded RNG in the state. Card effects live in
  `src/game/cards/base.ts`, keyed by effect id. See `design/gdd/core-loop.md`
  and `design/gdd/card-effects.md`.

## 4. How we work in parallel

- `main` always passes `npm run test:unit`. Nobody commits straight to it.
- Each task on its own branch: `<your-name>/<topic>`, e.g.
  `luigi/ui-hand-panel`, `marco/campaign-edicts`.
- Start from an up-to-date `main` (`git switch main && git pull`), push the
  branch, open a **pull request**; the other person reviews and merges.
  GitHub runs the type check and unit tests on every push and pull request
  (`.github/workflows/tests.yml`); run the browser tests (`npm run test:e2e`)
  locally when you change the UI.
- Split work by area so two branches rarely touch the same files. Typical
  areas: engine rules (`src/game/engine/`), card effects
  (`src/game/cards/`), UI (`src/ui/`, `prototypes/`), design docs
  (`design/`). Say in the pull request which area you changed.
- Before pushing: `npm run test:unit` and `npx tsc --noEmit -p .`. Update
  the matching design doc when a rule changes.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `docs:`,
  `refactor:`, `test:`, `chore:`), with the design doc or task in the body.
- If both branches changed the same file, the second to merge rebases on
  `main`, fixes the conflict and reruns the tests.

## 5. What each person keeps locally

These are per person and never shared through git: Claude Code's own memory
(`~/.claude/projects/...`), `production/session-state/` and
`production/session-logs/` (session notes and logs), `.claude/settings.local.json`
and `CLAUDE.local.md` (personal settings), and the owner content above.
Anything both Claude sessions must know goes in this file, `CLAUDE.md` or the
design docs.
