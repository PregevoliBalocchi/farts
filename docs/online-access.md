# Online access: invite-only, Google sign-in, roles

The game is reachable from the internet on Firebase's **free Spark plan**
(no credit card), but only by invited Google accounts. This page explains how
access works and how to deploy.

## How access works

- **Sign-in**: Google only (Firebase Authentication). Anyone can sign in with
  Google, but an address that is not invited gets **no access**: the page says
  so and the database refuses every read and write.
- **Roles** (`src/online/roles.ts`, tested in `tests/unit/online/roles.test.ts`):

  | Role | Who | Can |
  |---|---|---|
  | master | one address, stored by the owner in Firestore `config/access` | everything; appoints, demotes and removes admins; cannot be changed or removed |
  | admin | appointed by the master | invites and removes players; replaces the game content |
  | player | invited by an admin | plays |

  Nobody changes their own role or removes their own access.
- **Where roles live** (Firestore):
  - `config/access` → `{ master: "<google address>" }`, created once by the
    owner in the Firebase console; the app cannot write it.
  - `members/{email}` (email lower-case) → `role`, `invitedBy`, `invitedAt`,
    `updatedAt`, one document per invited address.
- **Enforcement**: `firestore.rules` is the access control (the free plan has
  no server functions). It allows only Google-verified sign-ins, lets each
  person read their own invitation, lets admins read the list and write only
  what their role allows, and denies everything else. The page checks the
  same rules first (`src/online/roles.ts`) only to explain refusals; **keep
  the two in step**. The rules are not covered by automated tests (the
  Firestore emulator needs Java): check them by hand after changing them.
- **The page** (`online/index.html`, `src/web/online.ts`): sign in, see your
  role; admins see the administration panel (invite by address, change role,
  remove access). The game itself will be added behind this access.

**Owner content is not deployed.** `npm run build:online` builds only the
access page into `dist-online/`; it imports no game data. Anything Hosting
serves is public, so the game's content will be loaded from Firestore
(readable by members only), never bundled into the page.

**For the game later**: the free plan has no server code. A shared game can
run its rules in the players' browsers with the state in Firestore
(`/games`, members only); hidden information (other players' hands) will need
either trust among friends or a free server elsewhere. Decide before building
the online game.

## One-time setup (the project owner, in the Firebase console)

1. https://console.firebase.google.com → **Add project** (Google Analytics not
   needed). New projects are on the free **Spark** plan: keep it.
2. **Build → Authentication → Get started → Sign-in method → Google →
   Enable** (choose the support email), save.
3. **Build → Firestore Database → Create database**: production mode,
   location in Europe (e.g. `eur3`).
4. In Firestore, **Start collection** `config`, document id `access`, one
   field `master` (string) = the master's Google address.

## Deploy (from the repository folder)

```bash
npm ci
npx firebase login                      # once per computer, opens the browser
npx firebase use --add                  # pick the project, alias "default"
npx firebase apps:create web farts      # once per project
npx firebase apps:sdkconfig web         # copy apiKey, authDomain, projectId, appId
                                        # into src/web/firebase-config.ts
npm run deploy:online                   # builds and deploys hosting and rules
```

The site is then at `https://<project-id>.web.app`. Google sign-in works
there out of the box (Hosting domains are authorized automatically).

## Automatic deploy (GitHub Actions)

`.github/workflows/deploy.yml` publishes the site by itself:

- **Merge into `main`** → the live site is rebuilt and published.
- **Pull request** → a preview site with its own address; the link appears
  as a comment on the pull request. Test there before merging. The preview is
  deleted when the pull request is merged or closed (and expires after 2 days
  anyway). A pull request that changes only `.claude/`, `.github/`, `docs/`,
  `design/`, `tools/`, `production/`, `tests/` or Markdown files gets none.
- **Firebase refuses a preview with "channel quota reached"** → too many
  previews are open. In GitHub, Actions → deploy → *Run workflow* deletes every
  preview channel (the live site stays).

Nobody needs to run `git pull`, `npm` or `deploy:online` for the site any
more. Firestore rules are not deployed automatically: after changing
`firestore.rules`, run `npm run deploy:online` by hand.

**One-time setup, by the Firebase project owner** (on a computer where
`npx firebase login` was done with the owner's account), from the repository
folder:

```bash
npx firebase init hosting:github
```

Answer: repository `PregevoliBalocchi/farts`; **No** to setting up the build
script and to overwriting files it offers to create (the workflow already
exists). The command creates a Google service account allowed to deploy and
saves its key in the GitHub repository as the secret
`FIREBASE_SERVICE_ACCOUNT_FARTS_9435D`. Until that secret exists, the
workflow runs the tests and skips the deploy with a warning.
