# Core Loop — Chapter Flow, Ambitions, Court

> Personal digital prototype of a board game the owner owns physically.
> **This repo contains only mechanics.** No names, card texts, art or map layout
> of the original work are stored here: every piece of content (cards, map,
> setup cards, dice faces, marker values) is loaded from a content file the
> owner writes (`data/content.json`, see `data/content.example.json`).

## 1. Overview

A 2–4 player trick-taking strategy game on a clustered space map. Each chapter
players play action cards in rounds; the card played determines how many
actions a player gets and which kinds. During the chapter players declare
*ambitions* (scoring categories); at chapter end each declared ambition pays
power to the leaders in that category. After N chapters (or on reaching a power
threshold) the most powerful player wins.

## 2. Player Fantasy

Reading the table: when to lead strong, when to declare an ambition you can win,
when to give up a card to seize initiative.

## 3. Detailed Rules

### 3.1 Content model (all data-driven)

| Concept | Engine id | Notes |
|---|---|---|
| Resources | `material`, `fuel`, `weapons`, `relic`, `psionic` | Each resource maps to an action it can pay for (prelude). |
| Action kinds | `tax`, `build`, `repair`, `move`, `battle`, `secure`, `influence` | Suits list which kinds they allow. |
| Suits | from content | Each suit = list of allowed action kinds. |
| Action cards | `{id, suit, number, pips, minPlayers}` | Numbers 1 and 7 have `minPlayers: 4`. |
| Court cards | `{id, kind: 'faction' \| 'decree', ...}` | `faction` cards are kept when secured; `decree` cards resolve an effect and are discarded. |
| Ambitions | `wealth`, `captives`, `trophies`, `relics`, `psionics` | Each has a metric (what is counted) and a card number that declares it. |
| Ambition markers | `[{chapterRange → (first, second)}]` | Values per side, side chosen by chapter. |
| Map | systems (gates + planets) in clusters, links | Exclusions per player count (systems out of play, links blocked). |
| Setup cards | per player count, per-seat placements | Picked at random among those matching the player count. |
| Dice | three dice types, each a list of faces | Face = counts of symbols (hits, self-hits, building-hits, keys, intercepts). |

### 3.2 Setup

Two variants (game option `variant`): **base** (default) and **leaders**
(character cards). They differ only in what goes on A/B/C and the starting
resources.

1. Initiative marker → a random player (seeded).
2. Draw a random setup card for the player count; its out-of-play clusters
   leave the map and the gates on either side of each out-of-play run link up.
3. Setup-card player 1 is the initiative holder, then clockwise.
   **Leaders & Lore** (rulebook, 2026-11-21): face-up rows of players+1
   leader cards and players+1 lore cards; in reverse turn order (starting with
   the player to the right of the initiative holder, counterclockwise) each
   player takes one leader or one lore card until everyone has 1 leader and 1
   lore (never 2 of a kind). Option: 2 lore each (1 extra lore per player in
   the row). Lore cards are persistent powers: no suit, no raid cost, they add
   to no ambition and cannot be stolen. Leaders' extra setup steps run in turn
   order after placement (with card effects).
4. Place pieces on each player's A, B, C systems:
   base = A city + 3 ships, B starport + 3 ships, C 2 ships (2 C systems with
   2 players); leaders = what the character card shows. Cities are taken from
   the left of the player board.
5. Starting resources, taken from the general supply (25 tokens, 5 per type):
   base = the A planet's resource then the B planet's, into the leftmost
   slots; leaders = the two on the character card.
6. 2 players: the resources of the out-of-play planets go on the ambition
   boxes (Material/Fuel → Tycoon, Weapons → Warlord, Relics → Keeper,
   Psionics → Empath). **Their effect on scoring is still to read.**
7. Action deck: cards 2–6, plus 1 and 7 with 4 players; deal 6 each.
   2 players: the player without initiative may discard the hand and draw 6
   new cards once, before the first lead.
8. Court deck: 25 Guild + 6 Vox shuffled; 3 face up (2 players) or 4.
9. Ambition markers on their start side; start chapter 1.

A token can only be gained if the supply has one; spent and discarded tokens
go back to the supply; stolen ones move between players.

### 3.3 Chapter

1. **Deal**: shuffle all action cards into the deck, deal `handSize` to each player.
2. **Rounds** until the chapter ends:
   - The initiative holder may instead **pass** (and must if they have no
     cards): the initiative goes to the next clockwise player with cards and
     the round ends at once. If everyone with cards passes in a row, all action
     cards are discarded and the chapter ends. When nobody has cards left, the
     chapter ends (confirmed by the rulebook, 2026-11-21).
   - **Lead**: initiative holder plays a card face up. Optionally *declares* an
     ambition (card number ∈ declarable numbers, a marker is available, at most
     one declaration per round): the highest available marker is placed on the
     ambition mapped to that number and the lead card is **zeroed** (counts as 0
     for initiative).
   - **Follow**, clockwise from the leader. A player without cards skips.
     Otherwise one of (confirmed by the rulebook, 2026-11-21):
     - *Surpass*: same suit, number higher than the **lead card** (0 if an
       ambition was declared on it) — not higher than earlier surpasses →
       actions = pips, kinds of the lead suit.
     - *Copy*: any card face down → 1 action of the lead suit.
     - *Pivot*: a card of another suit, face up, any number → **1 action** of
       its own suit. Pivoting does not change the lead suit.
     - Before taking actions a follower may **seize** the initiative (once per
       round, not the initiative holder): play an extra card face down (no
       actions for it), or surpass with a **7**, which seizes and keeps its
       actions. A 7 surpass after a seize does not seize again.
   - Each player, right after playing, may spend resources (prelude: 1 resource =
     1 action of the mapped kind) and then takes their actions.
   - **Round end**: initiative goes to the seizer if any; otherwise to whoever
     played the highest face-up lead-suit card (zeroed lead counts 0; if nobody
     surpassed, the leader keeps it).
3. **Chapter end — scoring**, for every ambition holding ≥ 1 marker: rank
   players by the ambition metric; for each marker on it, 1st place gains the
   marker's first value, 2nd place the second value.
4. **Cleanup**: markers return; check game end.

### 3.4 Court & agents

- *Influence*: place one agent from supply on a face-up court card.
- *Secure*: take a court card if you have strictly more agents on it than every
  other player. The new Court card is drawn into the same spot. Your agents return to supply; rival agents become your
  **captives**. A `faction` card goes to your tableau, a `decree` card resolves
  and is discarded. The court refills from the deck.

### 3.5 Map actions (confirmed by the owner, 2026-11-20)

- *Control* of a system: strictly more fresh ships there than every other player.
- *Tax* (rulebook, 2026-11-21): choose a Loyal city (damaged or not) or a
  Rival city in a system you control; gain 1 resource of the planet type from
  the supply. Each city at most once per turn. A rival's city may be
  taxed if you control the system (`rivalTax.allowed`); one agent from the
  rival's supply becomes your captive (`rivalTax.effect: takeCaptive`).
- *Build* (rulebook, 2026-11-21): a starport or city in an empty slot of a
  planet where you have any Loyal piece (cities from the left of the board),
  or a ship at a Loyal starport, one ship per starport per turn. Anything built
  where someone else controls the system arrives damaged.
- *Move*: any number of Loyal ships, fresh and damaged, from one system to an
  adjacent in-play system. **Catapult** (rulebook, 2026-11-21): from a system
  with a Loyal starport (not a Rival one you control) the ships may keep
  moving, dropping some off on the way, until they enter any planet or a gate
  someone else controls (control checked before moving in).
- *Battle*: up to one die per own ship in the system, any mix of types, at most
  `maxDicePerType` (6) of one type. The attacker rolls, then the game enters the
  `allocate` phase and the **attacker allocates every hit**, in this order:
  1. **Self-hits and intercept** on its own ships. Intercept fires **once** if
     any intercept symbol is rolled: hits = the defender's **fresh** ships in
     the system, counted at roll time (damaged ships and buildings count 0).
  2. **Hits** on defender ships; once no defender ships remain, further hits
     land on defender buildings.
  3. **Building hits** on defender buildings (ships do not protect them).
  4. **Keys** (confirmed 2026-11-21): only if at least one attacker ship
     survived steps 1–3; otherwise the keys are lost. Steal one at a time from
     the defender: a resource costs the keys printed on its player-board slot
     (`resourceSlotKeys`), a Guild card costs its printed `keys`. Unspent keys
     are lost. Buildings cannot be stolen. Raid dice may be rolled only if the
     defender has buildings in the system, or no buildings anywhere.
     Not modelled yet: resources sitting on cards (taken with their card;
     not stealable on their own), the exact board slot each token occupies.
  Each ship hit damages a fresh ship or destroys a damaged one. Each hit must be
  allocated while a valid target remains. Destroying a rival piece gives a
  trophy; the defender takes as trophies **every** attacker ship destroyed in
  battle, including those lost to self-hits or intercept (confirmed
  2026-11-21). Self-hits and intercept hits go only to the attacker's ships,
  never to its buildings.

- *Dice limit*: at most one die per own ship in the system, fresh or damaged,
  any mix of the three types.

### 3.6 Decree effects and game end (confirmed 2026-11-20)

- `decree` cards resolve through an **effect registry** injected into
  `indexContent(content, effects)`: the card's `effect` id maps to a handler.
  An id with no handler is logged "resolve manually" and play continues.
  Handlers get written card by card as the owner supplies the cards.
- Game-end tie (`gameEndTieBreak: turnOrder`): among tied players, the first in
  turn order starting from the initiative holder wins. `shared` keeps a shared win.

### 3.7 Player board (confirmed 2026-11-21)

- 6 resource slots; keys printed above them, left to right: 3, 1, 1, 2, 1, 3
  (the raid cost of the token on that slot).
- Unbuilt cities sit on the board and cover slots. Cities are built from the
  left: 1st frees slot 3, 2nd slot 4, 3rd slots 5 and 6, 4th uncovers a +2
  bonus, 5th a +3 bonus. At the start only slots 1 and 2 are open.
- A gained token goes on the leftmost free open slot; no free slot = not gained.
- Bonus power: only for an untied first place, once per ambition however many
  markers it holds; +2 and +3 add up to +5 when both are uncovered (confirmed).
  A tie for first gets second-place value and no city bonus.
- A city returning to the board covers its slot(s) again: the player
  rearranges tokens into the still-open slots and discards what no longer fits
  (`cityReturnResource: move`). Cities that cover no resource slot (the +2/+3
  spaces) cause no rearrangement. Simplification: the engine keeps the tokens
  already on open slots and moves the displaced ones leftmost; the player
  cannot yet choose a different token to discard.
- Prelude: from playing the card until the first card pip is spent, spend any
  number and mix of resources (not Outraged ones): Material = build or repair;
  Fuel = move; Weapons = this turn the card's pips may also battle (resources
  never become battles); Relics = secure; Psionics = one action of the lead
  card's suit.
- Resources spent in the prelude reach the supply only when the prelude ends
  (first card pip, or end of turn), so they cannot be regained within it.
  Prelude actions of a Court card secured in the same prelude cannot be used
  (cards secured in the prelude are recorded for when card effects exist).
- Cards can grant **new actions** ("Name (Standard)": usable instead of the
  standard action when paying for it with a pip or a non-Outraged resource) and
  **modifiers** (change standard actions, including those inside new actions,
  and steps like setup, scoring, declaring, seizing) — to design with the
  card-effect system.
- Gaining a token with no free slot: the player keeps what they hold and the
  new token is discarded to the supply (simplification: the rulebook lets
  them rearrange and discard any token; needs a choice in the UI).
- Guild cards add to ambitions like a resource of their suit (Material and
  Fuel → Tycoon, Relics → Keeper, Psionics → Empath; Weapons → none).

### 3.8 Ambition markers and game end (confirmed 2026-11-21)

- Three markers, start side → flipped side (1st/2nd place): low 2/0 → 4/2,
  mid 3/2 → 6/3, high 5/3 → 9/4. In each chapter's cleanup the lowest marker
  still on its start side flips: low after chapter 1, mid after 2, high after 3.
- Several markers on one ambition add their values.
- Declaring must take the available marker worth most in that chapter: highest
  first-place value, ties broken by second-place value (confirmed). With 3
  markers there are at most 3 declarations per chapter.
- Game end: after any chapter's scoring, if someone has at least 33 / 30 / 27
  power (2 / 3 / 4 players), or after chapter 5. Highest power wins; a tie goes
  to the first tied player in turn order from the initiative holder.

### 3.10 Destroying cities (rulebook, 2026-11-21)

Whenever a player destroys a city, in or out of battle:

1. **Provoke Outrage** of the city's planet type: the destroyer discards all
   their resources of that type (back to the supply) and their Guild cards of
   that type (Court discard), then covers that Outrage icon on their board with
   one of their agents (a placeholder if none is left). An Outraged resource
   cannot be spent for its prelude action, but can still be taxed and counts
   for ambitions. Already Outraged of that type: discard again, no new agent.
2. **Ransack the Court**: the destroyer takes one Court card holding any of
   the city owner's agents (their choice). Their own agents on it return; all
   Rival agents on it become **trophies**, not captives. The card is kept
   (Guild) or resolved and discarded (Vox); the Court refills in that spot.
   No such card: no Ransack.

In battle the attacker names the Ransack card(s) in the allocation, one per
city destroyed, in order.

### 3.11 End of chapter (rulebook, 2026-11-21)

1. **Score ambitions** (§4). 2 players: the tokens placed on the ambition
   boxes at setup count as a third player for ranking (they can take first or
   second place, gaining nothing); Weapons on the Warlord box count as trophies.
2. **Clean up**: if Warlord was scored, every trophy returns to its owner
   (ships, starports, agents to supply; cities back on the board, which may
   cover a resource slot again); if Tyrant was scored, every captive returns.
   Ambition markers return; the lowest unflipped one flips.
3. **End or advance** (§3.8).
4. **Draw**: shuffle all action cards, 6 each. 2 players: the player without
   initiative may redraw once, every chapter.

### 3.12 Fine print (rulebook, 2026-11-21)

- Unspecified ties and unclear choice order: turn order from the initiative
  holder; simultaneous effects: the player taking the turn orders them (else
  the initiative holder) — the UI asks.
- Elimination: ending the turn with no ships and no starports on the map, the
  player places 3 fresh ships (or as many as they have) in a gate of choice.
- Pieces placed are fresh and Loyal; cities come from / return to the right of
  the board; place or return as many as possible.
- Later, with card effects: replacing pieces (keeps damage), rules hierarchy
  (cards beat the rulebook except "cannot", which only "ignore" overrides),
  optional split action discard piles (draws take from the face-down pile).

### 3.9 Open against the rulebook (read 2026-11-21)


## 4. Formulas

- `metric(wealth) = material + fuel` (configurable list of resources)
- `metric(relics) = relic`, `metric(psionics) = psionic`
- `metric(captives) = |captives|`, `metric(trophies) = |trophies|`
- First place: strictly highest metric, metric > 0. Tie for first → all tied
  players take **second** place and no first is awarded (`ties.firstTieDropsToSecond`).
- Second place: strictly highest among the rest, > 0; tie → nobody
  (`ties.secondTieAwardsNone`). With 2 players the ambition box competes as a
  third player (§3.11).
- `power += Σ marker.first` (1st) or `Σ marker.second` (2nd) over the markers on that ambition.
- Game ends after `chapters` chapters or when someone reaches `powerToWin[playerCount]`.

## 5. Edge Cases

- Leader with no cards at round start → chapter end.
- Follower with no cards → passes (no actions).
- Seizing with only one card in hand is not allowed (needs a card to follow with).
- Declared lead + nobody surpasses → leader keeps initiative.
- Ambition with markers but nobody scores > 0 → nobody scores.
- Court deck empty → court stays smaller.

## 6. Dependencies

Map (pieces, control) → actions → resources/captives/trophies → ambitions.

## 7. Tuning Knobs

Everything in `data/content.json`: hand size, chapters, court size, marker
values, power thresholds, resource cap, tie rules, dice faces, card pips.

## 8. Acceptance Criteria

- Setup with 2/3/4 players filters cards and map per content, deterministic per seed.
- A full chapter can be played via commands; illegal commands are rejected with a reason.
- Initiative transfers per §3.3; seizing overrides surpass.
- Ambition scoring matches §4 including ties and 2-player rule.
- Dice rolls are reproducible from the seed.
