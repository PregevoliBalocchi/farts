# Online access: invite-only, Google sign-in, roles

The game is reachable from the internet on Firebase, but only by invited
Google accounts. This page explains how access works and how to deploy.

## How access works

- **Sign-in**: Google only (Firebase Authentication). Anyone can sign in with
  Google, but a signed-in address that is not invited gets **no access**: the
  page says so and the server refuses every request.
- **Roles** (`functions/src/roles.ts`, tested in `tests/unit/online/roles.test.ts`):

  | Role | Who | Can |
  |---|---|---|
  | master | one address, set at deploy time (`MASTER_ADMIN_EMAIL`) | everything; appoints, demotes and removes admins; cannot be changed or removed |
  | admin | invited by the master | invites and removes players |
  | player | invited by an admin | plays |

  Nobody changes their own role or removes their own access.
- **Where roles live**: Firestore `members/{email}` (email lower-case), one
  document per invited address: `role`, `invitedBy`, `invitedAt`. Only the
  callable functions write it (Admin SDK); clients may read only their own
  document (`firestore.rules`). The master is not a document: it comes from
  the `MASTER_ADMIN_EMAIL` parameter, so it cannot be removed from the page.
- **Server functions** (`functions/src/index.ts`, region `europe-west1`):
  `whoAmI`, `listMembers`, `setMember`, `removeMember`. Each checks the
  Google token (provider, verified email) and the caller's role.
- **The page** (`online/index.html`, `src/web/online.ts`): sign in, see your
  role; admins see the administration panel (invite by address, change role,
  remove access). The game itself will be added behind this access.

**Owner content is not deployed.** `npm run build:online` builds only the
access page into `dist-online/`; it imports no game data. Anything Hosting
serves is public, so the game's content will be served later by a function
that checks the caller's role, never bundled into the page.

## One-time setup (the project owner, in the Firebase console)

1. https://console.firebase.google.com → **Add project** (Google Analytics not
   needed).
2. **Upgrade to the Blaze plan** (pay as you go; needed for Cloud Functions).
   Small private use normally stays within the free quota; set a budget
   alert in Google Cloud Billing.
3. **Build → Authentication → Get started → Sign-in method → Google →
   Enable** (choose the support email), save.
4. **Build → Firestore Database → Create database**: production mode,
   location in Europe (e.g. `eur3` or `europe-west1`).

## Deploy (from the repository folder)

```bash
npm ci
npm --prefix functions ci
npx firebase login                      # once per computer, opens the browser
npx firebase use --add                  # pick the project, alias "default"
npx firebase apps:create web farts      # once per project
npx firebase apps:sdkconfig web         # copy apiKey, authDomain, projectId, appId
                                        # into src/web/firebase-config.ts
echo MASTER_ADMIN_EMAIL=you@gmail.com > functions/.env   # git-ignored
npm run deploy:online                   # builds and deploys hosting, rules, functions
```

The site is then at `https://<project-id>.web.app`. Google sign-in works
there out of the box (Hosting domains are authorized automatically).

`functions/.env` is git-ignored: whoever deploys sets the master address
there (or answers the prompt the deploy shows when it is missing).
