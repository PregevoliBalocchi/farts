# Card Effects — rulings to respect

> Notes for the effect system (leaders, Court, lore). Rulings come from the
> owner's FAQ/errata sheet, paraphrased; cards are named by their content ids
> only. Mechanics summary of each card: `data/effects.local.md` (owner, local).

## Effect system (implemented 2026-11-22)

- `src/game/engine/effects.ts`: `CardEffect` per effect id — `prelude`
  abilities, new `actions`, Vox `whenSecured`, and passive flags. The registry
  is injected through `indexContent(content, effects)`; the owner's cards are
  in `src/game/cards/base.ts` (`BASE_EFFECTS`).
- `src/game/engine/ops.ts`: shared operations — place ships, steal (with
  protections), Provoke/clear Outrage, seize, return a city, trophies/captives.
- Commands: `ability` (prelude ability), `decide` (answer a pending Decision),
  action payload `{ kind: 'card', card, name, args }`, `prelude` with `as`
  (spend as another type), `follow` with `declare`.

### Timing

1. **Prelude window**: opens when you play your card (lead or follow, any
   mode, including copy) and closes at your first card pip or at the end of
   your turn. Inside it, in any order and any number: spend resources, use
   "Prelude:" abilities. Not usable on other players' turns.
2. **Before any other actions** (`beforeAnyAction`): only while nothing was
   done this turn — no pip, no resource spent, no other ability. Declaring an
   ambition with the lead card is not an action, so it may come first.
3. **Secured in this prelude**: a card secured during the prelude cannot use
   its own prelude abilities until a later turn (other abilities and passives
   work at once).
4. **Once per turn** (`oncePerTurn`), **while X is declared** (`whileDeclared`:
   X holds a marker this chapter), **discard this** (`discardSelf`: paid first;
   Guild → Court discard, lore → out of the game).
5. **New actions** count as their printed kind: paid with a card pip of that
   kind, or in the prelude with a resource whose action covers that kind.
6. **Spend as** (Guild "any resource as X"): uses X's prelude action and
   ignores Outrage; for every other effect it counts as its own type.
7. **Decisions**: an effect needing a choice outside the normal flow (Vox when
   secured or ransacked) queues a Decision; the game waits for that player's
   `decide`, then resumes exactly where it was (e.g. remaining pips).
8. **Round end**: cards placed next to a played card give that card to their
   owner before the played cards are discarded.

### Battle timing (implemented 2026-11-22)

1. **Battle declared** (action `battle`: system, target, dice asked for).
2. **Before dice are collected**: the defender's automatic effects (the
   attacker takes 1 hit if a defending ship is fresh — `preHit` picks which
   attacking ship), then the defender's optional reactions (move fresh ships in
   from adjacent systems). With a reaction available the game waits: Decision
   `beforeDice` for the defender, then Decision `collectDice` for the attacker,
   who may change the dice.
3. **Collecting dice**: one per attacking ship plus card extras (+2 in gates,
   +2 always), at most 6 per type; card limits (assault ≤ skirmish, raid dice
   without defender buildings, no raid dice against a fresh starport).
4. **Roll**, then **modifiers on the roll**: +1 intercept on assault dice, ignore
   1 intercept if every attacker was fresh, intercept by Weapon icons.
5. **Rerolls** (command `reroll`, attacker, before allocating): each ability
   once per battle, all its dice together; totals and intercept recomputed.
6. **Allocation** (unchanged rule order). A defender with the "no Ransack"
   leader cannot be Ransacked when battled.
7. **After the battle**: repairs (attacker's card; leader repairing per
   starport, either side), the Weapons discard of the intercept leader, then
   the defender's optional reaction (influence if the attacker took Trophies).
8. **"Like in a battle"** (lore-02): rolled and allocated with battle rules but
   flagged `like`: no battle modifier, reroll or after-battle trigger applies,
   and Ransack is allowed.

### Tax, build, move (implemented 2026-11-22)

- **Tax** options: `emptySlot` (tax an empty building slot, leader-13),
  `resource` (type of a gate city), `shape` (leader-14: put one of your
  resources over the planet type, once per planet, for good — the token stays
  on the map), `again` (leader-10: hit the taxed city to tax it again).
- **Copy/Pivot tax bonus** (leaders 02, 03, 15): each standard tax paid with a
  pip on a turn you Copied or Pivoted also gains 1 resource of that type.
- **Rules modifiers**: tax any city / build ships and Catapult at any starport
  as if Loyal while Empath is declared (no Captives); tax again while Warlord
  is declared; own cities only where you control (leader-04); never own cities,
  Rival cities without control where you have ships (leader-13).
- **Build** options: starport or city on a gate (max 1 of each per gate),
  city outside slots (`outside`, paying `pay`, max 1 per planet), `again`
  (leader-10: hit the starport to build a second ship).
- **Gate cities** have every city type of the cluster: tax picks one; their
  destruction Provokes Outrage of all of them.
- **Move** options: `then` (lore-03: fresh ships that just arrived — at the
  destination or a drop-off — take one more step). Catapult from gates only
  (leader-14). Entering a gate controlled by a card owner with a fresh starport
  there costs the mover 1 agent, once per guard per move (lore-08).
- **Confirmed by the owner (2026-11-22)**: leader-10 repeats the action even
  if the hit destroyed the building; destroying your own building gives no Trophy.

### Declaring, Copy/Pivot, scoring, setup (implemented 2026-11-22)

- **Declaring** (`src/game/engine/declare.ts`): every declaration — lead,
  follow with a card, Vox, lore — first pays card costs (leader-07: give a
  Guild card to the Rival with the least Power, `give` on the command or in
  the effect's args; none → cannot declare), then fires triggers: mandatory
  ones at once (leader-12: secure the top Court card when the ambition was
  undeclared; its prelude waits), optional ones as Decisions `onDeclare`
  (leader-04 gain a resource, leader-08 influence each Court card once,
  court-17 look at a hand and swap). Cards gained during a declaration do not
  see that declaration.
- **Copy/Pivot options** (only on actions paid with a pip, on a turn the
  player Copied or Pivoted): influence `twice` (leader-12), secure with an
  `influence` before or after (leader-07), battle with a `tactical` move
  before or after (leader-06; the after-move runs once the hits are
  allocated). An option that leaves no legal action undoes everything.
- **Scoring**: leaders 01/06/09 on their ambition score first place at the
  second-place value with no city bonus, and second place for nothing;
  leader-12 scores only an untied first place. **After scoring**: leader-03
  discards all Fuel if Tycoon was scored; court-03/06 make every Rival discard
  all Material/Fuel (scored or not).
- **Setup** (after pieces and starting resources, in turn order from the
  initiative holder): agents on Outrage slots (leaders 02, 16), scrap ships
  and agents (leader-10), scrap the 2 leftmost cities (leader-13: their slots
  open), and leader-09 draws 5 lore and keeps 2 through a Decision
  `setupLore` before the first lead.

### Status

Done (tested in `tests/unit/cards/base-effects.test.ts`): Court 01, 02, 04,
05, 07, 08 (prelude), 09, 10, 11, 12, 13 (prelude), 14, 15, 16, 17 (prelude),
18, 19, 20, 21, 22, 23, 24, 25, Vox 26–31; lore 01, 10, 16, 18, 19 (prelude),
21, 22, 23 (prelude), 24, 25, 26, 27, 28.
Battle (tested in `tests/unit/cards/battle-effects.test.ts`): court-08 dice,
court-13 reroll; lore-02, 04, 05, 06, 07, 12, 14, 15, 17, 19 reroll; leaders
01 (battle part), 05, 11, 15 (intercept part), 16 (battle part).
Tax/build/move (tested in `tests/unit/cards/tax-build-move-effects.test.ts`):
lore-03, 08, 09, 11, 20, 23; leaders 02 (tax part), 03 (tax part), 04
(Callow), 10 (repeat), 13 (tax part), 14, 15 (tax part).

Leaders (tested in `tests/unit/cards/leader-effects.test.ts`): all 16 complete.
Declaring: leaders 04, 07, 08, 12, court-17. Copy/Pivot: leaders 06, 07, 12.
Scoring: leaders 01, 03, 06, 09, 12; court-03/06 make Rivals discard.
Setup: leaders 02, 09, 10, 13, 16.

Still to do:
- **Cartels holding the supply** (court-03, court-06): the supply kept on the card.
- **Campaign cards** (Fates, Edicts, Laws, Titles, campaign Court, events).

## General principles (rulebook "Other Actions", "Fine Print", "Glossary")

- **New actions** "Name (Standard)": usable instead of the standard action
  when paying for it with a card pip or a non-Outraged resource.
- **Modifiers** change standard actions, including standard actions inside a
  new action; they do not change new actions themselves.
- **Rules hierarchy**: cards beat the rulebook, except rules saying *cannot*,
  which only a card saying *ignore* overrides.
- **Replacement effects** must be able to remove and place every piece named;
  otherwise no part of the effect resolves.
- **Rerolls**: each reroll ability is triggered on its own; all dice rerolled
  by one ability are rerolled together.
- **"Like in a battle"** effects follow battle rules but are not a battle:
  battle modifiers and "when defending in battle" triggers do not apply.
- Vocabulary: bury (bottom of the Court deck), scrap (out of play for good),
  clear, give, take, swap, steal (distinct from take: some cards prevent
  stealing only), gain (from supply; nothing if empty), empty (no pieces).

## Rulings by card

| Card | Ruling |
|---|---|
| lore-02 | Its "like a battle" attack is not a battle for any other card. |
| lore-03 | Does not trigger itself (errata: "except when using this card"). Ships moved by it may go to different systems, including ships dropped off during a Catapult. |
| lore-08, lore-09, lore-11 | If the card changes owner or leaves play, buildings stay on the map. lore-08's extra effect applies only to its owner; lore-09's extra effect applies to all gate cities while the card is in play. |
| lore-08, lore-09, lore-11 | Buildings placed in a gate or outside a slot by other effects: starports in gates owned by lore-11's owner benefit from it; all cities covered by lore-08 are modified whoever owns it. Their "max 1" limits only stop building *through these cards*. |
| lore-10 | Its replacement cannot remove a building it cannot replace. |
| lore-14, lore-19 | Reroll rule above. |
| lore-20 | "Like they are Loyal" only for taxing/building rules, not for anything else (e.g. leader-13's restriction on taxing Loyal cities still allows taxing these). "Blockaded" (deprecated) = build ships damaged in systems controlled by Rivals, i.e. the normal Build rule. |
| lore-27 | Usable whatever resources you hold; frozen resources or those on cards are not discarded; you may declare even if nothing was discarded. |
| court-01, -07, -15, -19, -21 ("spend any resource as X") | Spending another resource as X uses X's prelude action, but for every other card effect it counts as spent as its own type. Allowed even when the original type is Outraged. |
| court-03, court-06 (Cartels holding a supply) | Resources on them count for anything that looks at the number or type of resources you have (ambitions included). Effects move resources to/from a Cartel only as if it were the supply; an effect moving "a resource you have" cannot pick one on a Cartel. Gain/lose triggers ignore Cartel resources: transferring the Cartel, or a rival taking from / returning to it, is no gain or loss for its owner. Moving a resource from your Cartel into your play area is a gain; from your play area onto your Cartel is a loss. |
| court-13 | Reroll rule above. |
| court-23 | Its Trade effect is not stealing, so court-22 does not block it. |

## Rulings from the publisher's card library (checked 2026-11-22)

Source: the publisher's online card library (FAQ and errata per card),
compared card by card with `src/game/cards/base.ts`. Applied:

| Card | Ruling | Status |
|---|---|---|
| court-03, court-06 | Supply on the card counts for ambitions and protection, cannot be stolen or discarded for court-24; Rivals discard after every scoring, Tycoon scored or not. Any "discard this to…" card may be discarded for nothing. | Rivals discard: done; supply on the card: to do |
| court-04/05/10/11 | The action card is taken after every player's turn; once placed the card is not in the play area, so it cannot be stolen. | done |
| court-17 | Cards discarded with it are shuffled before going on the discard pile; with no other card, draw 1. | done |
| court-25 | Seize and declare in either order; a 7 declares any ambition. | done (declare) |
| court-26 | Ships placed by it during a battle Ransack are not attacking ships. | note |
| court-27 | Errata: no zero marker. | done |
| court-29 | Usable when leading or already seized: return the city, no seize. | done |
| lore-02 | Battle modifiers (rerolls, extra dice) do not apply. | done |
| lore-03 | Not recursive; the extra move may be a Catapult from a starport; any group of fresh ships that just moved. | done |
| lore-06 | All Loyal ships in the system must be fresh; ignores a rolled intercept only, not one added by lore-04; checked before lore-12's hit. | done |
| lore-08/09/11 | Max 1 per gate/planet in total, whoever owns the card. | done |
| lore-09 | Outrage does not stop paying the resource. | done |
| lore-10 | Errata: Prune only for buildings in a slot. | done |
| lore-11 | A gate city alone in its cluster has no type: taxed for nothing, no Outrage. | done |
| lore-16 | Ignores move modifiers; does not trigger lore-08; no Catapult. | done |
| lore-18 | May destroy only your own ship. | done |
| lore-20 | Ships built damaged in systems controlled by anyone else. | done |
| lore-27 | Usable with no Material/Fuel; Cartel resources untouched. | done |
| leader-02/03/15 | Bonus gained even if the taxed stack is empty. | done |
| leader-04 | Errata: cannot tax any city it does not control (beats lore-20). | done |
| leader-05 | The 2 extra dice are mandatory; the 2-ship cap applies per system to lore-15; lore-16 ignores it. | done |
| leader-06 | Move and battle may use different ships; the move may be a Catapult; there must be a legal battle after. | done |
| leader-07 | The Guild card given is a mandatory cost for every declaration (none → cannot declare). Influence and secure may target different cards. | done |
| leader-08 | Up to one agent on each Court card. | done |
| leader-10 | Tax or build, not both, once per turn; the hit is extra (no pip); Outrage before the resource; allowed even when nothing is gained. | done |
| leader-12 | A drawn Vox that declares re-triggers it; a card secured this way gets no declaration trigger. | done |
| leader-14 | Cartel resources usable for Mythic; Catapult from a gate with a starport is fine. | done |
| leader-15 | Errata: "is intercepted" (so lore-04's intercept counts). | done |
| leader-16 | Starports counted after the battle. | done |

## Campaign Court cards (set `campaign`, ids `court-cc-01`…`court-cc-15`)

Used only in campaign games (`courtSets` includes `campaign`); they rely on
campaign rules not modelled yet (Crisis, Blight, Imperial Council, Free cities,
flagships). Rulings:

| Card | Ruling |
|---|---|
| court-cc-05 | Reroll rule above. |
| court-cc-10 | Its Trade effect is not stealing, so court-cc-09 does not block it. |
| court-cc-12 | The Imperial Council cannot be flipped or influenced while not in the Court: agents meant to go there go elsewhere (for its Crisis, back to their owners). |
| court-cc-14 | The control requirement applies to Loyal and Rival cities alike; only cities on the map (not on flagships) can be replaced. |

## Data already in `data/content.json`

- 16 leaders (`leader-01`…`leader-16`): resources and A/B/C pieces.
- 31 Court cards (`court-01`…`court-31`): kind, suit, keys; `effect` = card id.
- 15 campaign Court cards (`court-cc-01`…`court-cc-15`, `set: campaign`).
- 28 lore cards (`lore-01`…`lore-28`, `set`: base 1–14, pack 15–28);
  `lore-13` holds 1 resource slot with a raid cost of 4.
