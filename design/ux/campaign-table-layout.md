# Campaign-ready table layout (Blighted Reach)

Design brief from `/impeccable shape`, confirmed by the owner on 2026-11-25. It does not cover code or how each flow behaves step by step. It follows `DESIGN.md` (Gilt in the Void) and the region rules in `src/ui/table/layout.ts`. Sources: `design/campaign-plan.md` §3 and the campaign rulebook in `docs/rules/`.

## 1. Job and audience

- **Who:** players of the base game today and of the Blighted Reach campaign tomorrow.
- **Need:** each campaign element has a fixed, predictable place, and the base table does not change for it.
- **Mode:** Operate. Finding things comes first; expression stays in the details.

## 2. Outcome

- Every campaign element has a slot in the geometry (`layout.ts`). The slot is computed but empty and invisible in the base game.
- The base table looks exactly as it does today.
- Turning the campaign on moves no existing region.

## 3. Where everything goes

Positions are in stage px on the 1920×1080 stage.

| Element | Place | Notes |
|---|---|---|
| **Fate card + Flagship board** (local player) | The reserved band above the local board (x10-580, y466-834) | Fate card on the left: about 158×220, official ratio 620:866, with the objective countdown and the Favors (Rival agents) on it. Flagship board on the right: about 400×162, official ratio 638:258, with the 6 Upgrade and 6 Armor slots clickable and showing damage. |
| **Regent / Outlaw title** (every seat) | A badge on the seat's name bar | |
| **Objective countdown** (rivals) | A "9 → 0" chip in the rival band's stats row | The bands stay 116 px tall. |
| **Full Fate card, Favors, Flagship** (rivals) | The rival board opened by a click on its band | |
| **Imperial Council** | First on the left in the Court row | Shows its side: In Session, or Decided (tucked under the securer's played card). |
| **Attached cards** | A tab under the Court card, like the agents row | There is no room above the row, which starts at y4. The whole card shows on hover. |
| **Act and chapter** | The chapter circle at the top left becomes a pill: "II · 2/3" (Act III: /4) | |
| **Pending event** | A badge next to that pill | |
| **Rules booklet** | A sixth menu square at the top right, with a book glyph | Opens as a window: Edicts in order with the Policy on top, then Laws and Summit cards. It opens for everyone when a card is added. |
| **First Regent tile** | The foot of the ambitions column | The rows already spread over the height, so there is room. It folds away with the column. Shows the holder, the frozen Imperial Trust and the Sponsored token. |
| **"Event" follow button** | The fifth button in the command bar's main group | 5 × 132 px fits. |

## 4. The Court row

With the Council, a 4-player row grows from 932 to about 1090 px. The room between the supply and the menu squares is about 1026 px. The row cannot start left of x590, where the rival bands begin.

**Rule:** the Court card width is computed from the number of cards, from 146 down to a minimum of 128 px. The three piles stay 84 px wide.

## 5. Full-screen flows

The Event phase, the Summit, the Intermission and the Fate draft use one "phase window" pattern:
- it is built on the battle window: a framed plate over the map area (about 1050×632) with the step list on top;
- the hand, the own board and the Fate card stay visible below it.

Each flow's steps get their own shape pass.

## 6. Untouched and anti-goals

- The look of the base game stays as it is, and so do the rules in `DESIGN.md`: official art only, gold as structure, glow only for state.
- The player board stays as it is: the Flagship board does not replace the city rows.
- Avoid:
  - panels that cover the map permanently;
  - sub-menus;
  - information shown only on hover, except whole cards.

## 7. Constraints and open decisions

- **Geometry:** every slot is born in `layout.ts` (One-Source Rule). It has no content in the base game and turns on with the campaign state that the engine already has (`src/game/engine/types.ts:244-395`).
- **1366×768 check:** the stage shows at 71% there. The Fate card and the objective chip must stay readable, with at least 12 px of text on screen.
- **Open, not to be invented by a builder:**
  - the faction colours (Empire, Blight, Free States), taken from the official components and added as tokens in `DESIGN.md` first;
  - the art for the title badge, if an official piece fits;
  - the steps of each phase window.
