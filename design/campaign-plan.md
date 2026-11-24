# Blighted Reach (campaign) — implementation plan

> Draft, 2026-11-24. Sources:
> - `docs/rules/Arcs_Campaign_Rulebook_for_web.txt` (pages cited as "p. N");
> - `docs/rules/Arcs_Campaign_Aid_Sheet_1-2.txt`;
> - the page-by-page summary in `design/campaign-notes.md`;
> - `data/content.json` → `campaign`;
> - the Fate sets in `PG/`.
>
> Where this plan and the rulebook disagree, the rulebook wins.

## 1. What we have and what is missing

| Material | State | Gap |
|---|---|---|
| Campaign rulebook, aid sheets, punchboard | Full text in `docs/rules/`, summarised p. 2–30 in `campaign-notes.md` | — |
| Campaign Court (`court-cc-01…15`) | Images and texts in `content.json`; 5 Vox cards have Crisis text | Effects not coded (the only base-format cards left) |
| Imperial Council, titles, Flagship upgrades, Flagship board | 13 images in `assets/cards/campaign/`, data in `campaign.doubleSided` | — |
| Edicts ◆02–05, Event card | Images and data (`campaign.edicts`, `eventCards`) | — |
| Dice, pieces, Acts, grand-ambition values, Flagship slots, Free States raid | Data in `campaign.*` (owner-confirmed 2026-11-22) | — |
| Planet ID symbols | `SystemDef.symbol` exists on the map | Not drawn on the map yet |
| **Fate sets 1–24** | 468 images in `PG/`, plus `PG/_tutti-i-testi.md` (names, setup/success/failure steps, FAQ) | **Card texts exist only as pictures.** Only `fate-a-01` is in `content.json`; about 400 cards to transcribe |
| 3D pieces | GLB models for ship, city, starport, agent and flagship | Missing: Blight token, Imperial ship colour, Free buildings (neutral colour), First Regent tile, objective marker |

Fate set sizes:
- A sets (1–8): 27–37 images each.
- B sets (9–16): 14–22 images each.
- C sets (17–24): 5–8 images each (Act III only).

## 2. New systems and what they change in the engine

Today the engine (`src/game/engine/`, 3,239 lines) has:
- a single owner per piece, a `PlayerId`;
- control checked by `controls(sys, p)`;
- follow modes `lead | surpass | pivot | copy | pass`;
- the phases draft, lead, follow, actions, allocate, decide and gameOver.

### 2.1 Foundations (they touch the base game; every base test must still pass)

1. **Piece owners other than players.** Add `Faction = PlayerId | 'empire' | 'free' | 'blight'`.
   - `SystemState` gains Imperial ships (`ShipStack`), Blight (fresh and damaged) and Free buildings (`Building.owner: 'free'`).
   - Trophies may be Imperial, Free or Blight pieces (p. 11, 15, 19).
2. **Control from a viewpoint** (p. 10): `controls(sys, p, turnOf)`.
   - The Empire controls a system with at least one fresh Imperial ship, ignoring Loyal ships.
   - Presence Law: on their own turn, a Regent with Loyal pieces in the system controls it.
   - The First Regent controls it for ambitions, objectives and events.
   - Catapult moves stop as in the table on p. 10. Blight in a gate also ends a Catapult move (p. 19).
3. **"Can act with" rule.** It decides who may move, build, repair, tax or battle with a piece:
   - Imperial ships, under the Presence Law and the Movement Law;
   - Free buildings (p. 15).
4. **Play area, generalised** (p. 27):
   - resources on tiles and cards (the Imperial Trust), with a `frozen` flag;
   - Favors (Rival agents on your Fate card);
   - protected Guild cards;
   - Court cards with an attached card.
5. **Rules booklet.** A list of active rule cards, each with effect hooks:
   - Edicts, ordered by number;
   - Laws and Summit cards.

   When a card is added, every player sees an announcement ("explain it to everyone").
6. **Campaign state, saved between sessions** (p. 29–30). Online, one campaign document holds it, and each new Act starts from it.
   - The Act and the chapter.
   - Per player: Fate, title (Regent or Outlaw), objective marker, Power per Act, Outrage and Flagship. Power can be negative or go beyond the track.
   - The Court deck, the scrapped cards and the Fate cards not yet used.

### 2.2 Round flow

- **Event card**, a fifth way to play (p. 12).
  - It gives the lead card's actions, unless a Rival already played an Event or secured the Council this round.
  - It cannot lead, copy, or be discarded to seize.
  - A player with initiative who holds only Events must pass.
- **New `event` phase** at round end, after the initiative check (p. 13–14):
  - Council secured this round: the securer resolves it. Summit, then First Regent or steal, then Crises or Edicts by choice.
  - Otherwise, an Event played this round: the initiative holder may call a Summit. Then the event and number dice are rolled, and they pick Crises or Edicts.
- **Imperial Council**: a double-sided Court card (In Session or Decided) that never leaves the Court (p. 14).

### 2.3 Empire, Free States and Blight in battle (p. 10–11, 15, 19)

- **Truce Law**: Regents cannot harm Imperial ships. They also cannot harm or tax Rival Regents in a system with Imperial ships.
- **Imperial ships in battle**:
  - they may join a Regent's attack;
  - they must join a Regent's defence.
- **New defenders**:
  - **the Empire**: an Outlaw's destroyed pieces become the First Regent's trophies;
  - **the Free States**: a raid gains exactly 1 resource;
  - **the Blight**: Tough (2 hits per step), plain hits only, never intercepts.
- **Battle code** (`actions.ts`): `target: PlayerId` becomes `target: Faction`, with a list of defending pieces.

### 2.4 Events

- **Crises** (p. 18), in this order:
  1. **Blight Crises**: each Blight deals 3 hits (fresh) or 1 hit (damaged). Imperial ships take hits first, then every player's Loyal ships, fresh before damaged.
  2. **Fate Crises**, in turn order.
  3. **Court Crises**: the Vox cards' Crisis texts, left to right. They use dice phrases: rolled cluster, rolled symbol, rolled planet.
- **Edicts** (p. 20–21):
  - **Policy**: the First Regent enforces it or changes it.
  - **Imperial Demand**: each Regent chooses what to give, gives a Favor, or becomes an Outlaw.
  - **Imperial Action**: peace, escalation or war.
  - **Guild envoys**: 2 players only.
- **Summits** (p. 16–17):
  - **Call to Order**, the caller only: Return Favors (forced actions), Petition the Council, Leave the Empire, Revive the Empire.
  - **Negotiations**, everyone: Cede Control, Delegate Authority, Promise Favor, Transfer Asset, Invite to Empire.
  - Each action needs the affected Rival's consent. Bundles apply all at once.
  - The Summit ends after a countdown when nobody is negotiating.

### 2.5 Flagships (p. 22–25)

- **The Flagship** is a Loyal ship that is never removed. Its "hit points" are 6 Upgrade slots and 6 Armor slots.
- **Building**: cities and starports go on the Flagship board, on a planet of the slot's type. No more building on the map.
- **Battle**:
  - attacking: dice = fresh starports, hit like ships;
  - defending: hit like buildings, no intercept;
  - Crises hit the rightmost Armor first.
- **Upgrades**: 6 effects. C Fates add Resettling.
- **Getting a Flagship**: setup replaces your Loyal buildings with Free ones.

### 2.6 Acts, objectives, Intermission (p. 4–9, 28–29)

- **Act I setup**:
  1. The number die picks 2 Imperial clusters, which get 8 Imperial ships.
  2. The event die places the Free cities.
  3. Damaged Blight goes outside the Imperial clusters.
  4. With 2 players, resources go on the ambition boxes.
  5. Fate draft: each player draws 2 A Fates and secretly picks one.
  6. Snake placements on planets with Imperial ships: 3 ships, a city or starport, and 1 resource.
  7. Free cities fill the empty slots.
- **Objectives**: the marker counts down to 0. The Fate says when it advances (chapter end, winning an ambition…).
- **Intermission A–F**:
  - A. Each Fate resolves: success or failure cards; failure loses Power.
  - B. Clear the Court; scrap the discard pile.
  - C. Clear pieces, the frozen Trust included.
  - D. Repair Blight. Destroy damaged pieces, and buildings under Blight with no ships.
  - E. Initiative goes to the player with the most Power; every player loses half their Power.
  - F. Choose Fates; reveal together.
- **Act II and III setup** (p. 7): ambitions flip by Act, Blight goes on gates and planets, new objectives.
- **Act III**:
  - 4 chapters;
  - grand ambitions worth 2/4, 3/8, 4/14 and 5/20;
  - the C Fates' final objective (marker on 0 and at least 1 Power wins);
  - winner by total Power. Ties: A Fate beats B, B beats C, then turn order.

### 2.7 Fate content (the largest share of the work)

There are 24 sets. Each has its own Court, Law, Edict and Summit cards, its own tokens and its own objective triggers. For each set:

1. Transcribe the texts into `content.json` (card texts live only there).
2. Code the effects in `effects.ts`, with tests.
3. Apply the set's FAQ and errata (in `PG/_tutti-i-testi.md`).

Work set by set, A tier first.

## 3. Interface changes (official look, same table layout)

| Where | Change |
|---|---|
| **Map** | Imperial ships in a neutral imperial colour; Blight tokens (fresh or damaged side, with the hit number); Free cities and starports in grey; planet ID symbols as a small glyph by the planet number; the Imperial clusters tinted at setup |
| **Top bar / chapter track** | "Act II · Chapter 2/3" (Act III: /4); a badge when an Event is pending this round (Event card played or Council secured) |
| **Court** | Imperial Council always leftmost, with its side showing (In Session, or Decided and tucked under the securer's played card); a slot above any card for an attached card |
| **First Regent tile** | Next to the ambitions. Shows the holder, the Imperial Trust resources with a lock (frozen), and the Sponsored token when a Fate adds it |
| **Seat boards** | Title badge (Regent or Outlaw) on the name bar; a small Fate card with the objective marker as a countdown (e.g. "9 → 0"); Favors as Rival agent pips; hover opens the full Fate and objective card |
| **Own board** | Fate card, objective and Favors. With a Flagship, the Flagship board replaces the city and starport rows: 6 Upgrade + 6 Armor slots with planet icons and damage |
| **Hand / follow box** | Event cards drawn as their own kind; a fifth button "Evento" that says how many actions it gives ("4 Costruzione", or "nessuna azione: evento già giocato") |
| **Battle window** | The defender picker adds Empire, Free States and Blight. Imperial ships show as joining: a toggle when attacking, fixed when defending. A Flagship shows its slots as its hit points |
| **Rules booklet** | A drawer behind a book icon in the top bar: Edicts in order with the Policy on top, then Laws and Summit cards. A modal for everyone whenever a card is added |
| **Event panel** (new, at round end) | A step list: Summit? → dice roll (event die + number die, 3D dice as in battle) → either Crises or Edicts. Crises are shown system by system, with hits on each piece, animated. Edicts ask the First Regent to enforce or change, each Regent what to give, then apply the Imperial Action |
| **Summit screen** (new, for everyone) | The caller goes first with the Call to Order (forced actions cost Favors). Then a negotiation board: each player builds a proposal from the five actions and names the Rival(s); the affected players accept or reject; accepted bundles apply at once. Each player clicks "Ho finito"; when all are done, the caller can start the 5-second countdown |
| **Act setup screens** | Fate draft: 2 cards, a secret pick, a joint reveal. Placement rounds with the legal planets highlighted |
| **Intermission screen** | Steps A–F with a summary per player (objective ✓/✗, Power lost, halving), then the Fate choice, then the next Act's setup steps |
| **Lobby** | "Nuova campagna" and "Continua campagna" (Act, players, last save); a log sheet view per player |

## 4. Workflow of a campaign round (engine phases)

```
lead → follow (surpass | pivot | copy | event | pass) → actions … → round end
  → initiative check
  → event phase (only if an Event was played or the Council secured):
      council?  securer: [summit?] → First Regent / steal → choose Crises|Edicts
      else      initiative holder: [summit?] → roll event+number dice → Crises|Edicts
      summit:   callToOrder(caller) → negotiations(all, consent) → countdown → end
      crises:   blight → fate crises (turn order) → court Vox crises (left→right)
      edicts:   by number: [guild envoys] → policy (enforce: demand → action | change)
  → next round / chapter end (ambitions, objectives, grand ambitions, final objective)
  → Act end → intermission A–F → next Act setup | campaign end
```

Every choice a player makes inside these steps goes through the existing
`decide` phase (`Decision`). Online play and the bot keep one mechanism.

## 5. Milestones (one or more PRs each)

> **Paused 2026-11-24 (owner's decision):** campaign work stops after M2's
> event phase; the base game's open problems come first. Where M2 stands:
> engine done for Act I setup, Event cards, the Empire / Free States / Blight
> rules and the event phase (`campaign-setup.ts`, `campaign.ts`,
> `events.ts`, tests `tests/unit/engine/campaign-*.test.ts`). Left in M2:
> the CC Court cards' other effects (When Secured, Guild abilities) and the
> whole campaign table UI (setup placement, Event button, Council and
> attached cards in the Court, campaign defenders in battle, Imperial ships
> and Blight on the map, the rules booklet, the event phase's decisions).
> Nothing campaign-only is reachable from the base game's screens yet.
> Interpretations to confirm with the owner when work resumes: Court Crises
> resolve only the Vox cards present when they start (a refill does not
> resolve); Song of Freedom ties go to the first tied player in turn order;
> Requisition Ships with no Empire-controlled system may use any player's
> starport; the Council is outside the Court row count (no refill when
> secured, back leftmost); Ransack is a Secure (takes attached cards, never a
> Decided Council).

| # | Content | Playable result |
|---|---|---|
| M0 ✓ | Data: all 24 Fate sets in `content.json` (342 physical cards, 51 two-sided, counts checked against the set dividers; pieces with their sides); campaign tiles cut from the punchboard (Blight, First Regent, chapter track, Edenguard, Blightkin); Free buildings and Imperial ship from the kit; planet ID symbols already on the map | — |
| M1 ✓ | The foundations in 2.1 (`src/game/engine/campaign.ts`): owners other than players (Imperial ships, Free buildings, Blight; pieces back to the campaign supply), viewpoint control and Catapult stops, the Court's attached cards and the Imperial Council (secure, tuck, return Decided, Petition; never buried, scrapped or discarded; Ransack secures), protected Guild cards, the frozen Imperial Trust counted for ambitions, the rules booklet (two sides, stacked slots, Edicts by number, announcements), campaign state saved with the game. Moved on: the "can act with" rule (2.1 item 3) to M2, with the Empire's pieces on the map; the campaign document kept between Acts to M4, with the Intermission | Base game unchanged, tests green |
| M2 (in progress) | Act I without Fate cards: Empire, Free States, Blight, Event cards, Council, Crises, Edicts, Court CC effects. Done: Act I setup (`campaign-setup.ts`: table steps A–Q, placements G–H, Free cities I, step K, 2-player mulligan keeping Events), Event cards (follow mode `event`, pending event at round end), Act length; the Empire, Free States and Blight in actions and battle (Presence, Movement and Truce Laws, defenders `empire`/`free`/`blight`, Tough Blight, Free States raid); the event phase (`events.ts`: the Council's steps, the event and number dice, Blight Crises, the CC Vox Crises cc-11 to cc-15 with attached cards first and Bury, the Edicts in order: Guild Envoys Depart, Govern the Imperial Reach enforce or change, Demand with Favor and Outlaw fallback, Celebrate Regency, Requisition Ships, Distribute Arms). Next: the CC Court cards' other effects (When Secured, Guild abilities), the table UI | A playable Act I with generic objectives |
| M3 | Summits: engine and negotiation screen, online | Full event rounds |
| M4 | A Fates (8 sets), objectives, Intermission, campaign save, Act II setup | Act I → Intermission → Act II |
| M5 | Flagships, B Fates (8 sets) | Act II complete |
| M6 | Act III, C Fates, grand ambitions, final objective, campaign winner | Whole campaign |

Risks:
- M1 is the risky step, because it changes the base engine under the current game.
- M3 is the hardest interface work.

## 6. Owner decisions (2026-11-24)

1. Transcribe every Fate card needed into `content.json`: the material is freely available and may be implemented.
2. Summits are always implemented, hotseat included.
3. New pieces are flat tiles for now; 3D models come later.
4. The Steward set is used whole, with the corrected Navy Reprisal (15) from the card reference (FAQ 7).
5. Start from M0.
