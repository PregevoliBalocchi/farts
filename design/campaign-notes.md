# Campaign — material received so far

> The campaign is an expansion mode. Nothing here is implemented yet; this file
> keeps what the owner has sent, summarised in our own words, until the
> campaign rules arrive. Ids only, no card text.

## Court cards
15 cards, `court-cc-01`…`court-cc-15` (10 Guild, 5 Vox with a Crisis effect).
See `design/gdd/card-effects.md`.

## Edicts (`data/content.json` → `campaign.edicts`)
- `edict-02` (order 00, two-player games only): bury every Guild card in the
  Court with no agents on it, then refill the Court.
- `edict-03` / `edict-04` / `edict-05` (order 03): the First Regent either
  enforces the current Policy or switches to another. Each Policy (war, peace,
  escalation) has a **Collect Demand** (take something from every Regent into
  the Imperial Trust, or an agent as a Favor, or make them an Outlaw) and an
  **Imperial Action** (weapons from the Trust; bonus city power for Regents;
  2 fresh Imperial ships in an Empire-controlled system).

## Event card (`campaign.eventCards`)
- Mirrors the lead card and is added to the round: players take actions like
  the lead card unless a Rival played an Event or secured the Imperial Council
  this round. It cannot be led or copied, but can be discarded to seize.
- At the end of the round, after checking initiative, the initiative holder
  may call a Summit, then must roll an event die: one face resolves Crises,
  another resolves Edicts. If the Imperial Council was secured this round,
  that is resolved instead.

## Campaign concepts the engine lacks
Regents and First Regent, Imperial Trust, Favors, Outlaws, Empire/Imperial
pieces, Policies, Edicts, Crises, Summits, event die, Blight, Free cities,
flagships, Imperial Council.

## Double-sided cards (`campaign.doubleSided`)

One card, two sides; the engine will track which side is up.

- **Imperial Council** — *In Session*: securing it flips it to *Decided* (tuck
  it under your played card as a reminder). *Decided*: cannot be influenced or
  secured; at round end it returns to the Court and its holder may call a
  Summit, becomes First Regent if a Regent, steals from the First Regent tile
  if an Outlaw, and must resolve Crises or Edicts. Calling a Summit and
  petitioning the Council flips it back to *In Session*.
- **Title** (one per player, tucked under the Fate card) — *Regent* follows
  the Regent rules of the Empire aid sheet and can become an Outlaw by calling
  a Summit; *Outlaw* follows the Outlaw rules and can become a Regent if the
  First Regent consents in a Summit, or force it by calling the Summit and
  returning one of their Favors.
- **Flagship upgrades** (damaged upgrades still work): side A = Slipstream
  Drive (prelude: once per turn Catapult move the Flagship or other ships from
  it), Tractor Beam (defending Flagship: the attacker cannot collect raid dice),
  Control Array (Flagship in a gate: tax any cities in its cluster as if Loyal,
  no captives); side B = Defense Array (defending: intercept for 1 hit per
  fresh starport on the Flagship board), Ship Crane (build up to 2 ships per
  turn there, still one build each), Hull (no benefit, can be hit).
- **Flagship board** — front: upgrade slots (pairs of building slots per
  upgrade type plus "any planet" slots) and the Flagship's own battle and build
  rules; back: Flagship setup (place the Flagship with Loyal pieces, replace
  Loyal buildings with Free ones, take the aid card) and Resettling (when the
  Flagship is scrapped: rebuild a city and starport, restore 8 Loyal ships).

## Fate cards (`campaign.fates`)

24 cards in three tiers of 8: `fate-a-01`…`fate-a-08`, `fate-b-01`…`fate-b-08`,
`fate-c-01`…`fate-c-08` (in the order of the owner's sheet). Only the fronts
were sent: their objectives, setup and rules are still needed. The title card
(Regent/Outlaw) is tucked under the player's Fate card.

### `fate-a-01` (complexity 2/3)

Theme: holding a fracturing empire together through court politics. Numbers
refer to the cards of this Fate's own deck.

- **Act I** — setup: take cards 02 and 03 and the First Regent tile.
  Objective (20 / 17 / 14 with 2 / 3 / 4 players): each time you win an
  ambition while First Regent, advance by the power that win gave, city bonus
  included (e.g. 5 + 5 bonus = 10).
  Success: 05, 06, 07 into the Court deck; 08 added to the rules; discard 09,
  10, 11. Failure: discard 05–08; 09, 10, 11 and 03 into the Court deck.
- **Act II** — setup: 12 joins the Edicts. Objective 22: at chapter end, +1
  per cluster where the Empire controls a system (only if you are First
  Regent), and +1 per resource in the First Regent's Imperial Trust (even if
  you are not). Success: 15, 16, 17 into the Court; discard 18–22. Failure:
  discard 15–17; 18–22 into the Court.
- **Act III** — setup: 23 added to the rules (Sponsored token on the First
  Regent tile); the three Policy edicts are replaced by 24–25, the First Regent
  chooses which goes on top; Outlaws become subject to the Imperial Demand when
  the Empire controls one of their cities or their Flagship. Objective = two
  grand ambitions: be a Regent while the Empire controls every Outlaw city (or
  there are none); be First Regent while the Imperial Trust holds more
  resources than the current chapter number. No resolution card.
- **Rulings**: with no Outlaw cities the Empire counts as controlling them all;
  only buildings on the map count (not on Flagships or other areas). Card 09
  empties the Imperial Trust and the First Regent loses power as if leaving the
  Empire as the last Imperial player. Card 23: leaving the Sponsored token in
  place counts as resolved, so its second part still applies. Cards 24–25
  (war policy) resolve one Regent at a time with limited supply; the Trust
  pays when the weapon or the chosen second resource is missing from the
  supply; a resource missing from both cannot be chosen. Card 15 is misprinted
  on all physical copies (front shows an Event): leave it out or use a proxy.

## Campaign rulebook — read so far

### Introduction and components (page 2)
- Recommended only after at least one base game.
- **Fate cards** (24, 8 per tier A/B/C): large cards showing each player's
  Fate, which can change over the campaign.
- **Fate sets**: each Fate has its own set of small cards and pieces, stored
  behind a numbered divider (1–24). Each divider shows the set's piece and card
  counts. Small cards carry "F<n>" (the set number) in the bottom-left corner;
  pieces sit on a punchboard area marked with that set's number.
  The `PG/` folder mirrors this: one folder per Fate set.
- **Per player** (pieces for 4): an **objective marker** (progress towards the
  Fate's objective), a **Flagship piece** and a **Flagship board** (some Fates
  turn you into a Flagship).

### Other cards and pieces (page 3)
Card ids printed with ◆ are the campaign's own numbering.
- **Court**: a new campaign Court deck — 10 Guild + 5 Vox marked "CC"
  (= `court-cc-01`…`15`), plus the **Imperial Council** (◆01), a Court card
  with two sides.
- **Event cards (3)**: two or three of them are added to the action deck at
  setup. Only one image received so far (all copies may be identical: check).
- **Edicts (4, ◆02–05)**: kept in the rules booklet, may resolve during events.
- **Regent/Outlaw titles (4, ◆06–09)**: one per player; everyone starts as an
  Imperial Regent and may become an Outlaw.
- **Flagship upgrades (4, ◆10–13)**: aid cards with the Flagship upgrade rules.
- **Rules aids (2)**: rules for play, ending games and setting up later games.
- **Log sheet pad**: records each player's details between games (the
  campaign is played over several sessions → the engine needs a saved
  campaign state between games).
- **Pieces**: 24 Blight tokens; Free cities (28) and Free starports (14),
  which players can act with when they control them; 15 Imperial ships
  (control systems for the Empire; Regents can act with them); a number die
  and an event die (rolled at setup and in some events); a double-sided
  chapter track tile covering the map's chapter track; the First Regent tile
  (which Regent is First Regent, holds the Imperial Trust); a rules booklet
  where added cards go; 4 overflow markers and 6 extra dividers (storage
  between sessions).

### Act I setup (page 4)
Used when starting a campaign; Acts II and III have their own setup (page 7).
Differences from the base game:
- **No setup cards**: no cluster is out of play; starting pieces are placed
  differently (later steps).
- **Court**: the campaign Guild/Vox cards ("CC") replace the base ones ("BC").
- **Lore**: the same lore deck as the base game, but the lore cards are
  shuffled into the Court deck after the Court is dealt.

1. Set up the table:
   A. Map; 18 battle dice, 25 resources, 24 Blight, 28 Free cities, 14 Free
      starports.
   B. Initiative marker to a random player.
   C–D. Action deck: cards 2–6; with 4 players also the 1s and 7s.
   E. Shuffle in **2 Event cards (2–3 players) or 3 (4 players)**.
   F. Ambition markers on their start sides.
   G. Chapter track tile on the "Act I & II" side; chapter marker on 1.
   H. Zero marker in the Ambition Declared slot.
The page's map picture shows the starting layout (Blight, Free cities,
Imperial ships, lettered markers): rules for it still to come.

### Act I setup, continued (page 5)
   I. Court deck = the 15 "CC" Guild/Vox cards; deal 3 (2 players) or 4
      (3–4 players) face up.
   J. Shuffle 1 lore card per player, at random from the base lore deck (plus
      any expansion lore), into the Court deck.
   K. Imperial Council (◆01), In Session side, as the leftmost Court card
      (beside the dealt row).
   L. 2 players only: edict ◆02 into the first rules-booklet slot.
   M. The three Policy edicts (◆03–05): shuffle face down, flip the stack, and
      slide them face up into the next booklet slot (random order, one on top).
   N. Roll the **number die** → that cluster and the next clockwise cluster are
      the 2 **Imperial clusters**: 1 Imperial ship in each of their systems
      (8 in total).
   O. Roll the **event die** → 1 **Free city** on each planet bearing the rolled
      planet **ID symbol**, outside the Imperial clusters.
   P. 1 **damaged Blight** in each system outside the Imperial clusters.
   Q. 2 players only: the 6 resources matching the planets of the Imperial
      clusters go on the ambition boxes (Material/Fuel → Tycoon, Weapons →
      Warlord, Relics → Keeper, Psionics → Empath), as in the base 2-player
      game but chosen by the Imperial clusters instead of out-of-play ones.

**Missing data**: each planet's **ID symbol** (three kinds, printed on the map;
the base rulebook said they are used in expansions) and the faces of the
**event die** (which faces name an ID symbol, which resolve Crises or Edicts).

### Act I setup — players (page 6)
   A. Each player: player board, 15 ships, 5 cities (on the board), 5
      starports, 10 agents.
   B. Each player draws 2 **A** Fate cards, secretly picks one; all reveal and
      take the matching Fate sets.
   C. Set up from the Setup side of their **objective card** (first card of
      the Fate set), then flip it to its Objective side.
   D. **Objective marker** on the Power-track space shown by the clock on the
      objective card (i.e. the objective's target, counted on the Power track).
   E. Power marker on 0.
   F. Regent/Outlaw title, Regent side up, tucked under the Fate card. If no
      Fate setup gave someone the First Regent tile, the initiative holder
      takes it.
   G. In turn order, each player places 3 ships and 1 building in an empty
      slot of a planet **with an Imperial ship** (Rival pieces may be there)
      and gains 1 resource of that planet's type.
   H. Repeat G in **reverse** turn order.
   I. Free cities in every empty building slot of planets with Imperial ships
      (with 4 players maybe none).
   J. 6 action cards each. 2 players: the player without initiative may
      discard any cards **except Events** and draw that many (a partial
      mulligan, unlike the base game's whole-hand redraw).
   K. Undealt action cards to the action discard pile.
Open: which building at G (city or starport, player's choice?).

### Act II & III setup (page 7)
The board carries over from the previous Act **as it is, Power included**, with
these changes:
   A. Ambition markers: in Act II the lowest marker starts flipped; in Act III
      the two lowest start flipped (engine: marker flipping must depend on the
      Act as well as the chapter).
   B. Reshuffle the Court deck and deal 3 (2 players) or 4 cards; the Imperial
      Council goes back to In Session.
   C. 1 damaged Blight on each gate with no Blight and no ships.
   D. Roll the event die: in each cluster, 1 damaged Blight on the planet with
      the rolled ID symbol if it has none; if it already has Blight, 1 damaged
      Blight on every planet of that cluster with none.
   E. 2 players: roll the number die twice; the 6 resources matching the
      planets of the 2 rolled clusters go on the ambition boxes (as far as the
      supply allows).
   F. Set up from the Setup side of the new objective card, then flip it;
      players may rearrange their resource tokens. Setup choices in turn order
      (or simultaneously).
   G. Objective marker on the Power-track space shown at the top of the
      objective card; in Act III only players with a C Fate do this.
   H. Chapter track tile on the side for the current Act, chapter marker on 1;
      draw and discard action cards as in player setup J–K.

### The campaign, objectives, intermission (page 8)
- A campaign is **three games (Acts)**. Acts I and II end after **3 chapters**,
  Act III after **4**. Power thresholds do **not** end an Act early.
- Act I: choose an A Fate. Keep it for all three Acts or switch: switching
  after Act I means choosing a **B** Fate, after Act II a **C** Fate.
- Winner at the end of Act III: most Power **accumulated over all three Acts**.
  Ties: an A Fate beats B, B beats C; then turn order. A player can also win by
  completing a **final objective** (page 9).
- Power can exceed the track: a second Power marker on the "+50"/"+100" space.
- **Objective** (Acts I and II): the objective marker starts on the Power-track
  space shown at the top of the objective card (sometimes per player count,
  shown by player icons) and moves **down towards 0**; reaching 0 completes it.
  "Win an ambition" = untied first place.
  Example: an Outlaw winning 2 ambitions (+3 each) and controlling 3 systems
  (+1 each) advances 9 at chapter end.
- **Intermission** after Acts I and II (page 28): bonus for a completed
  objective, maybe a new Fate, most damaged pieces destroyed. A failed
  objective **loses Power equal to the space the objective marker is on**.

### Grand ambitions, final objective, rules booklet (page 9)
- **Grand ambitions** (Act III, A and B Fates): two of them, shown by gold
  crosshairs; they replace the objective marker. Scored at chapter end with the
  declared ambitions, always active (no declaration), only their owner gains.
  One fulfilled → the lower value under the current chapter on the Act III
  chapter track; both → the higher value. Read from the track picture:
  chapter 1: 2/4, 2: 3/8, 3: 4/14, 4: 5/20 (example: one fulfilled at the end
  of chapter 3 → 4 Power). **To confirm.**
- **Final objective** (Act III, C Fates): at chapter end, after ambitions, the
  player **wins the game** if the objective marker is on 0 **and** they have at
  least 1 Power. This beats winning on Power; several such players → most
  Power among them wins. Failing it has no penalty; at the end of chapter 4 the
  most Power still wins.
- **Rules booklet**: cards added by Fates go in it (one side Edicts, the other
  Laws and Summit cards; either side if one is full). Every added card is a
  rule for everyone and must be explained aloud.

### The Empire: control, command, movement (page 10)
- Everyone starts as a **Regent**. One Regent is the **First Regent**: governs
  the Empire (page 20) and holds the **Imperial Trust** (page 21), resources
  collected from Regents as tribute. A Regent becomes an **Outlaw** by calling
  a Summit (page 16). Outlaws can be attacked by the Empire, can battle Regents
  freely and pay nothing into the Trust.
- **Empire control**: the Empire controls every system with **at least one
  fresh Imperial ship**, ignoring all Loyal ships. (Changes the base control
  rule: an Imperial presence overrides player majorities.)
- The First Regent counts as controlling all Empire-controlled systems **for
  ambitions, objectives and events**.
- **Presence Law** — Commanding the Imperial Fleet: on a Regent's turn, in
  systems **with Loyal pieces of theirs**, the Regent controls an
  Empire-controlled system and may act with the Imperial ships there: move and
  repair them, battle with them, build at them, tax cities they control. A
  rule may let them ignore the Presence Law (command everywhere).
  Example: Outlaw 4 fresh ships, Regent 2, 1 fresh Imperial ship → the Empire
  controls it; on the Regent's turn the Regent controls it; on the Outlaw's
  turn it is Empire-controlled, so the Outlaw builds damaged there.
- **Movement Law**: a Regent moves at most 1 Imperial ship per Loyal ship
  moving with it, to the same system.
- **Catapult stops** at gates by controller:
  - Empire control stops Outlaw pieces, not Regent or Imperial ones;
  - Regent control stops Outlaw pieces and Rival Regent pieces moving alone,
    not Imperial pieces or mixed Regent+Imperial groups;
  - Outlaw control stops Regent and Imperial ships alike.
=> In the campaign, "control" depends on **who is asking** (Regent, Outlaw,
   Empire) and on whose turn it is: the engine's `controls()` needs a
   viewpoint.

### Battle, harm and taxing; Outlaw battles (page 11)
- Movement Law example: a Catapult move may drop off Loyal or Imperial ships
  along the way, as long as each leg keeps at most one Imperial ship per Loyal
  ship moving with it.
- **Truce Law**: Regents cannot **harm** Imperial ships (except the hits they
  take as their own attacking ships), and cannot harm or tax Rival Regents in
  systems with Imperial ships. "Harm" = battle, hit, damage or destroy
  (page 27). It does not limit Crises (page 18).
- A Regent **attacking** may add the Imperial ships of the battle system to its
  attacking ships; a Regent **defending must** add them to its defending ships.
  (To hit a Regent's buildings with plain hits, an Outlaw must first destroy
  all defending ships, Imperial ones included.)
- **Outlaw battles**: an Outlaw chooses a Regent or **the Empire** as
  defender. Against the Empire the defenders are the Imperial ships in the
  system; the First Regent takes the Outlaw's destroyed pieces as trophies (no
  First Regent: they return to the Outlaw).
  Example: Outlaw vs Regent with 2 ships + 1 Imperial → 3 defenders; Outlaw vs
  Empire → 1 defender; Regent vs Outlaw → the Regent may add the Imperial ship.
=> The engine's battle needs: a defender that can be "the Empire", Imperial
   ships joining either side, and trophies going to a third party.

### Events and Event cards (page 12)
- Three kinds of events: **Summits** (free-form deals exchanging pieces and
  favors), **Crises** (the Blight attacks ships; some Guild/Vox cards cause
  chaos), **Edicts** (the First Regent governs the Empire; more Edicts are
  added over time).
- Events are triggered by playing an **Event card** or securing the
  **Imperial Council** (page 14).
- **Event cards** are a new kind of action card (cannot be scrapped). On your
  turn you may play one: it **cannot lead, be used to Copy, or be discarded to
  seize**. Played, it gives actions **exactly like the lead card** (its suit
  and pips) — unless a Rival played another Event earlier this round or secured
  the Imperial Council earlier this round: then no actions (prelude actions
  still allowed).
  Example: lead Construction 2 (4 pips) → the next player's Event gives 4
  Construction actions; a later Event the same round gives none.
- A player with initiative holding only Event cards must pass the initiative.
- 2-player mulligan: Event cards stay in hand; draw only as many as discarded.
=> Engine: a fourth way to follow (besides surpass, pivot, copy): "event".

### Resolving the event (page 13)
- At the end of a round in which any Event card was played, right after
  checking initiative: the **initiative holder** may call the **Summit**
  (page 16), then rolls the **event die and number die**:
  Crisis symbol → resolve Crises (page 18); Edict symbol → resolve Edicts
  (page 20). Dice are rolled even without a Summit.
- Several Event cards in one round → resolve only one event.
- If the Imperial Council is secured in the same round as Event cards are
  played, resolve the Council (page 14) instead of the Event.
- The planet **ID symbols** are three: **arrowhead (Λ), hexagon (⬢),
  crescent (☾)**; they also appear on the event die and are used by Crises.
  The pictured face shows the Crisis symbol with an arrowhead inside → likely
  each event-die face = Crisis or Edict + one ID symbol (to confirm).

### Imperial Council (page 14)
- A Court card with two sides; each Act it starts **In Session**. In Session
  it can be influenced and secured. It can never be buried, scrapped or
  discarded. Cards can be attached to it (page 27), even when Decided, and
  cards that affect Court cards affect it.
- **Securing it**: flip it to Decided and tuck it under your played card. At
  the end of that round it returns to the Court (Decided side) and the
  securing player resolves, in order:
  1. may call a Summit (page 16) — the securer chooses, not the initiative
     holder;
  2. a **Regent** takes the First Regent tile, with all the Imperial Trust's
     resources;
  3. an **Outlaw** steals resources from the Imperial Trust, up to their number
     of empty resource slots; the First Regent loses 1 Power per resource stolen;
  4. must choose Crises (page 18) **or** Edicts (page 20) — chosen, not rolled.
- Secured in the same round as Event cards are played: resolve the Council,
  ignore the Event cards.
  Example: the First Regent secures it, calls a Summit and becomes an Outlaw
  (giving First Regent away), then steals 3 from the Trust: the new First
  Regent loses 3 Power.
- **Decided**: cannot be influenced or secured; flips back to In Session at the
  start of an Act, or when a player calls a Summit and Petitions the Council
  (page 16).

### The Free States (page 15)
- **Free buildings** (cities and starports) belong to no player. You may act
  with those **in systems you control**: tax Free cities, build ships at Free
  starports and Catapult move from them, repair Free cities and starports.
  Taxing a Free city captures no agents.
- They can be harmed like players' buildings; destroyed Free buildings become
  the destroyer's trophies. Destroying a Free city still Provokes Outrage.
- **Battle**: the Free States can be chosen as defender; all Free buildings in
  the system are the defending pieces and take hits like buildings.
- **Raid**: spending keys against the Free States gains exactly 1 resource of
  the planet's type, never more than one per battle (key cost not stated:
  to confirm).
- Supply of Free pieces empty: use a proxy piece.
=> Engine: buildings need an owner that can be "free" (not a player), and
   building ownership checks must go through a "can act with" rule.

### Summits: Call to Order (page 16)
- Called through Event cards or the Imperial Council. Two parts: **Call to
  Order**, then **Negotiations**.
- **Favors** = Rival agents held on your Fate card. Obtained mostly through
  Negotiations (page 17) and the Imperial Demand (page 20).
- **Call to Order** — only the player who called the Summit, any number of:
  - **Return Favors**: give a Rival's Favors back to their supply to force them
    to take Negotiation actions you choose, targeting you; by default 1 Favor
    per forced action. Example: return 2 Favors to force a Transfer Asset of a
    Relic whose raid cost is 2 (so the cost may scale with the item: page 17).
  - **Petition the Council**: flip the Imperial Council to In Session (allowed
    even if you called the Summit by securing it).
  - **Leave the Empire**: flip your title to Outlaw. If you were First Regent,
    the tile goes to the Regent with the most Power (the Trust stays on it).
    If no Regents remain: the Trust's resources go back to the supply, the
    leaver loses 1 Power per resource, and the tile goes to the supply.
  - **Revive the Empire**: if there are no Regents, flip your Outlaw title to
    Regent and take the First Regent tile.
=> Engine: Favors (agents on Fate cards), forced actions, and a free-form
   negotiation step that needs UI support between players.

### Summits: Negotiations (page 17)
- After the Call to Order **all players** may take any number of Negotiation
  actions, free-form. Each affects one Rival and needs **that Rival's
  consent**:
  - **Cede Control**: replace 1 of your Loyal pieces on the map with a Rival
    piece of the same type. A Loyal building only if you have no Loyal ships in
    its system; never your last city, starport or ship on the map. Replacing
    keeps damage.
  - **Delegate Authority**: replace 1 of your agents on a Court card with a
    Rival's agent.
  - **Promise Favor**: give 1 of your agents from supply to a Rival, onto their
    Fate card (a Favor).
  - **Transfer Asset**: give 1 captive, trophy, Favor or resource to a Rival
    (a piece of theirs returns to their supply). Not cards (some Fates allow
    it). When forced through Return Favors, giving a **resource costs Favors
    equal to its raid cost**.
  - **Invite to Empire**: the First Regent flips an Outlaw's title to Regent.
- **Multipart negotiations**: several players may agree to take any number of
  actions simultaneously, if they resolve immediately (e.g. one swaps an agent
  on a Court card while the other swaps 2 ships on the map).
- **Ending**: if no one is negotiating, the caller may prompt, wait, and count
  down from five; if still no one negotiates, the Summit ends.
=> UI: a negotiation screen where players propose and accept bundles of
   these actions (a proposal applies only when every affected Rival accepts).

### Crises (page 18)
Order: **Blight Crises**, then **Fate Crises**, then **Court Crises**.
- **Blight Crisis** in every system with Blight: each fresh Blight deals
  **3 hits**, each damaged Blight **1 hit** (the token shows the number).
  Hits go to **Imperial ships first**; when none remain, **each** remaining hit
  is dealt to the Loyal ships of **every player** in the system. Fresh ships
  are hit before damaged ones (no choice). Blight hits buildings only during
  the Intermission (page 28); Flagships: page 24.
  Example: a fresh Blight (3 hits): 2 destroy the fresh Imperial ship, the
  third hits 1 Loyal ship of each player there.
- **Fate Crises**: cards with Crisis text held by players (added by Fates),
  in turn order.
- **Court Crises**: roll the event and number dice (unless just rolled for an
  Event card), then resolve the Crisis text of each **Vox** card in the Court,
  left to right; a Vox attached to another Vox (page 27) resolves first.
  Dice phrases: *rolled cluster* = number die; *planets of the rolled symbol* =
  planets with the event die's ID symbol; *rolled planet* = the planet of the
  rolled cluster with the rolled symbol; *if <symbol> was rolled*. The Crisis
  or Edict symbol on the die is irrelevant for these checks (confirms that
  each event-die face combines Crisis/Edict with an ID symbol).
- A Crisis removing a card from the Court returns all agents on it and refills
  the Court. Many cards bury themselves (bottom of the Court deck).
- Crises ignore the Truce Law (page 11).

### The Blight (page 19)
- In Crises it hits ships; in the Intermission (page 28) it destroys buildings
  in systems with no ships.
- Can be harmed (battled, hit, damaged, destroyed) but is **Tough**: it takes
  **2 hits** to damage, 2 more to destroy; a single leftover hit does nothing.
  Destroyed Blight becomes the destroyer's trophy.
- **Battle**: the Blight can be chosen as defender; all Blight in the system
  defends. It is hit by plain hits only (not building hits) and **never
  intercepts**. Example: rolling intercept + 2 hits against a fresh Blight →
  no hits taken, the Blight is damaged (fresh → damaged).
- **Catapult**: ends on entering a gate with Blight (fresh or damaged), as if a
  Rival controlled it.
- Supply empty: take Blight from the player with the most Blight trophies.

### Edicts: governing the Reach, Imperial Demand (page 20)
- Edicts resolve in order of their printed number, lowest first. The game
  starts with the Policy edict (number 03) and, with 2 players, the Guild
  envoys edict (number 00 = card ◆02).
- **Policy edict**: the First Regent either **enforces** the current Policy
  (collect its Imperial Demand, then take its Imperial Action) or **changes**
  it (puts another Policy edict on top of the other two).
- **Imperial Demand**: the First Regent takes 1 piece **from each Regent**:
  - Peace: a Relic or a Psionic;
  - Escalation: a Material, Fuel or Weapon;
  - War: a trophy or a captive, **but not** of Regent or Imperial pieces.
  Resources go into the Imperial Trust; the First Regent must **also** add one
  such resource of their own if they have it. Trophies and captives go into the
  First Regent's boxes; they do not take one from themselves.
  A Rival Regent with nothing demanded gives 1 agent from supply as a **Favor**;
  with no agents, the First Regent may make them an Outlaw.
  Example (Peace): Relic from one Regent, Psionic from another, an agent Favor
  from the third; the First Regent has neither, so adds nothing.

### Imperial Action, Guild envoys, Imperial Trust (page 21)
- After the Demand the First Regent **must** take the Imperial Action:
  - **Peace — Celebrate Regency**: each Regent gains the bonus city Power of
    all uncovered city slots on their board (+2, +3, i.e. +5 with all 5 cities
    built; 0 with 3 or fewer).
  - **Escalation — Requisition Ships**: 2 fresh Imperial ships in an
    Empire-controlled system (none: at a Loyal starport instead).
  - **War — Distribute Arms**: 1 Weapon from the supply to each Regent (supply
    empty: from the Imperial Trust; not enough: the First Regent chooses who).
- **Guild envoys edict** (2 players only): bury every **Guild** card in the
  Court with no agents on it (not Vox), then refill the Court.
- **Imperial Trust**: resources on the First Regent tile are **frozen**
  (page 27): cannot be spent, discarded or given away, even when Provoking
  Outrage, but they **count for the holder's ambitions**. No raid cost: they
  cannot be stolen in battle, only by cards (e.g. court-cc-08 style "steal a
  resource") or by an Outlaw securing the Imperial Council. They return to the
  supply in the Intermission.

### Flagships (page 22)
- Some Fates give a Flagship board, piece and aid card. Getting one: replace
  all your Loyal buildings on the map with **Free** buildings of the same type
  (setup on the back of the Flagship board).
- The Flagship is a **fresh Loyal ship that cannot be removed** from the map.
  - You **cannot build Loyal cities or starports on the map**; instead you
    build them on the Flagship board as **Upgrades** and **Armor**.
  - At most 1 ship built at the Flagship per turn, whatever its starports.
    (Ships may also be built at Free starports you control.)
  - In battle the Flagship collects a variable number of dice and does not
    intercept by default (page 24).
- **Upgrades & Armor**: 6 Upgrade slots, each with an Armor slot above.
  To build one the Flagship must be at a planet of the type shown on that slot;
  Armor only if its Upgrade exists and is fresh. Armor takes hits before its
  Upgrade. Upgrades work fresh or damaged. Repairing the Flagship repairs one
  Upgrade or Armor. Built where a Rival controls the system → placed damaged.
  These buildings are not map buildings: no taxing these cities, no building
  ships or Catapult from these starports; destroying them neither Provokes
  Outrage nor Ransacks the Court. Some lore lets you build on the map again
  (page 25).
  Example: at a Material planet → a Ship Crane Upgrade; its Armor needs a Fuel
  planet.

### Flagship battles: attacking (page 23)
- Attacking with a Flagship: its Armor and Upgrades are hit **like ships**;
  defending: hit **like buildings**. Armor is always hit before its Upgrade.
- **Attacking**: the Flagship collects dice up to its number of **fresh
  starports** among Upgrades and Armor (none → no dice for it), in addition to
  the other attacking ships' dice.
- Self-hits and intercept hits must go to Upgrades/Armor only when no other
  attacking ships remain, but the attacker may choose to put them there
  anyway. Example: 2 fresh starports → 2 assault dice; a self-hit may be put
  on the Ship Crane even with other ships available.
=> Engine: the Flagship is a ship whose "hit points" are its Armor/Upgrade
   buildings, with dice from its fresh starports.

### Flagship battles: defending; Flagships in events (page 24)
- Against a player with a Flagship, raid dice need defending buildings **or a
  defending Flagship**.
- A defending Flagship **does not intercept** (unless it has a Defense Array,
  page 25); other defending ships still do.
- Defending, Upgrades and Armor are hit like **buildings**: by building hits;
  and by plain hits once the Flagship is the only defending ship left.
  Example: intercept + 3 hits + 1 building hit vs 1 fresh ship + Flagship (no
  Defense Array): 1 intercept hit; 2 hits destroy the fresh ship; the third hit
  and the building hit destroy the Hull Armor.
- **Crises**: the Flagship takes Blight hits only if no other fresh Loyal ships
  remain in the system. Each hit goes to the **rightmost Armor**, then (no
  Armor left) the rightmost Upgrade: top row right to left, then bottom row
  right to left (no choice).
- **Summits**: Cede Control cannot replace buildings on the Flagship board.

### Lore & Flagships; Upgrade benefits; Resettling (page 25)
- **Lore with Flagships**: lore checking for Loyal buildings in a system counts
  Upgrades/Armor as being in the Flagship's system unless it says "on the map";
  lore that builds Loyal buildings outside slots (gate building lore) does let
  the player build on the map again (and those can be raided normally); lore
  improving Loyal ships improves the Flagship; lore collecting dice for Loyal
  ships "like in battle" gives the Flagship 1 die per fresh starport on its
  board.
- **Upgrades** (Upgrade planet → Armor planet):
  - Ship Crane (Material → Fuel): build up to 2 ships per turn in the
    Flagship's system (still one build action each);
  - Defense Array (Weapons → Psionic): defending, intercept hits = fresh
    starports on the Flagship board;
  - Slipstream Drive (Fuel → Relic): once per turn in the prelude, Catapult move
    the Flagship alone or other ships from it (Free starports already allow
    Catapult without it);
  - Control Array (Psionic → Material): Flagship in a gate → tax any city in its
    cluster as if Loyal (no captives);
  - Tractor Beam (Relic → Weapons): defending, the attacker cannot collect raid
    dice;
  - Hull (any planet → any planet): no benefit, but cities open resource slots
    and starports give battle dice.
- **Resettling** (C Fates, with a Flagship): clear the Flagship board (its
  cities and starports back to supply) and replace the Flagship piece with a
  Loyal ship; place 1 city and 1 starport in empty slots on the map (none
  free: replace Free buildings); if fewer than 8 Loyal ships on the map, place
  ships in systems with Loyal pieces up to 8.

### New rules & terms (page 27; page 26 is artwork only)
- **Protected Guild cards** ("X" instead of a raid cost): cannot be removed
  from the holder's play area **unless the holder Provokes Outrage** of their
  suit (then discarded as usual).
- **Attaching cards**: an attached card sits above a Court card that has no
  attached card. Securing a card also secures its attached card (resolve both
  When Secured, any order). Forced attach that cannot meet every requirement:
  attach anyway, ignoring the fewest requirements. If a Court card with an
  attached card is removed, the attached card slides down into its place and
  receives the removed card's agents; removing the attached card itself
  affects nothing.
- **Frozen resources**: cannot be spent, given or discarded (not even by
  Provoking Outrage) except as the freezing piece says; Rivals can still steal
  and take them (Imperial Demand included). They count for ambitions.
- **Counting resources** means everything in your play area, including on
  cards and tiles (e.g. the First Regent tile).
- **Harm** = choosing as defender in battle, damaging, destroying or hitting.
- **Fate tokens**: by default cannot be harmed and are not Loyal; some say
  otherwise. Loyal tokens count as your pieces: build at them, repair them,
  they satisfy "Loyal piece" requirements such as the Presence Law.
=> Engine (also useful for the base game): a generic "play area" with
   resources on cards and tiles, a "frozen" flag on resources, protected
   cards, and Court cards with an attached slot.

### Intermission, steps A–D (page 28)
After Acts I and II, in order:
- **A. Resolve Fate**: each player resolves their Fate set's Resolution card
  for the Act (success/failure: gain or discard cards, add cards to the Court
  deck or the rules booklet). A failed objective **loses Power** equal to the
  objective marker's space. **Power can go negative** (the extra Power marker
  on the "(−)" space): e.g. 2 Power, marker on 5 → −3. With less than 1 Power
  a final objective cannot win in Act III.
- **B. Clear Court**: all Court cards except the Imperial Council (and attached
  cards) back into the Court deck; agents back to their players; **scrap** the
  Court discard pile (removed for good).
- **C. Clear pieces**: all trophies and captives back to their players; all
  frozen resources (Imperial Trust included) back to the supply; 2 players:
  resources on the ambition boxes back to the supply.
- **D. Repair & destroy**: repair all damaged Blight; **destroy** all damaged
  ships, buildings and Flagship Upgrades/Armor; destroy all buildings in
  systems with Blight and no ships. A player left with no ships or starports
  places 3 fresh ships in any gate (base Elimination rule).

### Intermission, steps E–F; next Act (page 29)
- **E. Shift initiative & Power**: the initiative marker goes to the player
  with the **most Power**; each player with more than 1 Power **loses half**,
  rounding so they lose less (7 → 4; −3 stays −3). 2 players: concede is
  recommended when the Rival leads by 15 or more after halving.
- **F. Choose Fate**: a player who **completed** the objective draws 1 Fate
  card; one who **failed** returns their Fate card to the box and draws 2.
  After Act I draw from the **B** Fates, after Act II from the **C** Fates.
  Each secretly chooses one of the 2 cards (the current Fate counts as one of
  them for a player who succeeded) and all reveal together. Choosing a new
  Fate: return the current Fate card; **scrap** the rest of its Fate set not in
  play (keep what is in play, e.g. the Flagship); return all Favors to their
  owners; take the new Fate set.
- **Next Act?** Play the next Act (setup page 7) or pack up (page 30). While a
  campaign is in progress the box cannot be used for single-session games.
=> Engine: a **campaign save** holding the board, Power, Fates, rules booklet,
   Court deck and scrapped cards between Acts and sessions.

### Packing up (page 30)
Physical storage only. What it tells the engine: the campaign save must keep
**everything** on the map, in the general supply and in every play area
(cards in play, Fate set cards still unused, resources — order not needed),
the rules booklet, and per player: name, colour, Fate, Power per Act, Outrage,
Flagship Upgrades and Armor, plus Fate-specific notes.

## Still missing — to review at the end of the campaign rulebook

Answered by the owner (2026-11-22): planet ID symbols confirmed (p1 arrowhead,
p2 crescent, p3 hexagon in every cluster); the 3 Event cards are identical;
event dice: the number die is a plain D6 (1–6), the event die has 3 Crisis
faces and 3 Edict faces, one per ID symbol (`campaign.eventDice`); setup step G: the player freely chooses city or starport; raiding the Free
States: 1 key gains the 1 resource; Act III grand-ambition values 2/4, 3/8,
4/14, 5/20 confirmed.

Still open:
- ~~Fate texts~~: all 24 sets transcribed into `campaign.fateCards` (one entry per physical card; Setup/Objective is one two-sided card) (2026-11-24,
  `tools/cards/install-fates.py`; see `design/campaign-plan.md` M0).
- Owner's modified game board and player board: to be worked out with trials.
- Action card art: the owner sent angled photos (12 of 28 cards); the UI will
  draw action cards from data instead (number, suit, pips, ambition icon).
