---
name: Arcs Table
description: Gilt frames over the void, the table of the official digital edition rebuilt for the web.
colors:
  gilt-gold: "#d6a344"
  gilt-highlight: "#f3c463"
  gilt-deep: "#c8892a"
  gilt-pale: "#ffd27a"
  bronze-dim: "#7d5d27"
  bronze-edge: "#6b4a14"
  ember-orange: "#e0711f"
  void-black: "#0b0806"
  frame-umber: "#16110b"
  frame-brown: "#2b2015"
  table-soot: "#15100b"
  parchment-text: "#ece4d2"
  vellum-title: "#efe3c4"
  vellum-muted: "#c7b896"
  card-ink: "#1d150d"
  card-cream: "#fbf7ee"
  seat-gold: "#f8b010"
  seat-teal: "#1ba3bd"
  seat-red: "#e8573f"
  seat-white: "#f1f0ea"
  suit-construction: "#e0773c"
  suit-administration: "#3a8fd8"
  suit-mobilization: "#3fae6a"
  suit-aggression: "#b05ad0"
  res-material: "#c9a27a"
  res-fuel: "#f0c24b"
  res-weapons: "#ff7a5c"
  res-relic: "#59d0a8"
  res-psionic: "#c38bff"
  state-ok: "#6fe3a5"
  state-warn: "#ffcc66"
  state-danger: "#ff6b6b"
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.08em"
  headline:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.05em"
  title:
    fontFamily: "'Segoe UI', Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "'Segoe UI', Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.2
  label:
    fontFamily: "'Segoe UI', Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "0.06em"
  numeral:
    fontFamily: "'Cascadia Mono', Consolas, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1
  card-title:
    fontFamily: "'Arcs Card Title', Cinzel, Georgia, serif"
    fontWeight: 900
    lineHeight: 1.15
    letterSpacing: "0.01em"
  card-text:
    fontFamily: "'Arcs Card Text', Jost, Futura, 'Century Gothic', sans-serif"
    fontWeight: 400
    lineHeight: 1.2
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "999px"
spacing:
  hair: "4px"
  tight: "6px"
  gutter: "10px"
  band: "16px"
components:
  button-primary:
    backgroundColor: "{colors.gilt-highlight}"
    textColor: "{colors.card-ink}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.gilt-pale}"
    textColor: "{colors.card-ink}"
  button-secondary:
    backgroundColor: "{colors.frame-umber}"
    textColor: "{colors.parchment-text}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "48px"
  button-menu-square:
    backgroundColor: "{colors.void-black}"
    textColor: "{colors.gilt-gold}"
    rounded: "{rounded.sm}"
    size: "52px"
  panel-frame:
    backgroundColor: "{colors.frame-umber}"
    textColor: "{colors.parchment-text}"
    rounded: "{rounded.md}"
  chip-tag:
    backgroundColor: "{colors.gilt-highlight}"
    textColor: "{colors.card-ink}"
    rounded: "{rounded.xs}"
    padding: "1px 6px"
  action-card:
    backgroundColor: "{colors.card-cream}"
    textColor: "{colors.card-ink}"
    rounded: "{rounded.md}"
    width: "100px"
    height: "140px"
---

# Design System: Arcs Table

## Overview

**Creative North Star: "Gilt in the Void"**

The table is a set of precious objects hung over deep space. Every panel, board and window is a dark, warm-brown plate in a bevelled gold frame with small corner ornaments. The 3D map shows through the space between them. The look follows the official digital edition of the game: player boards, cards, card backs and pieces come from the official material and are never redrawn or invented. Interface chrome exists only to hold them.

The system is dense and stays still. A full four-player table shows on one 1920×1080 stage, scaled to the window, so every millimetre is spoken for and nothing scrolls. Gold carries authority: frames, titles, the primary action. Full colour is reserved for game information that the physical game also colours: the seats, the resources, the card suits. Light is a signal: a glow means "you can use this now" or "this is active", never decoration.

The old blue-teal interface (blue panels, cyan selection ring, `--panel`, `--rule-hi`, `--select`) is superseded. It survives in early rules of `src/ui/table/table.css` and is to be removed, not extended.

**Key Characteristics:**
- Warm umber plates in bevelled gold frames with corner ornaments, floating over the starfield and the 3D map.
- Official art only: boards, cards, backs and pieces from the game's material; the interface never invents imagery.
- Gold for structure and the primary action; saturated colour only for seats, resources and suits.
- Glow is a state, not an ornament.
- One fixed 1920×1080 stage, scaled to fit: dense, no scrolling, regions computed in one place (`src/ui/table/layout.ts`).

## Colors

A narrow metallic range of gold and bronze over near-black browns, with the game's own colours as the only saturated accents.

### Primary
- **Gilt Gold** (#d6a344): frame strokes, icon colour on dark buttons, the border of the menu squares. The everyday gold of the system.
- **Gilt Highlight** (#f3c463): the top of the primary button's gradient, active text and tags, selected outlines. The brightest gold that carries meaning.
- **Gilt Deep** (#c8892a): the bottom of the primary button's gradient; gold in shadow.
- **Gilt Pale** (#ffd27a): the hover and "on" state of gold elements, the ring of a toggled command.

### Secondary
- **Bronze Dim** (#7d5d27): the resting border of secondary buttons and divider rules; gold at rest.
- **Bronze Edge** (#6b4a14): the dark outline around primary buttons and card thumbnails, separating gold from gold.

### Tertiary
- **Ember Orange** (#e0711f): the lead card's mark and urgent turn highlights. Use sparingly.

### Neutral
- **Void Black** (#0b0806): the deepest plate, behind the menu squares and empty card slots.
- **Frame Umber** (#16110b) and **Frame Brown** (#2b2015): the two ends of the panel plate's radial gradient (lit from the top centre).
- **Table Soot** (#15100b): the base background of the table stage.
- **Parchment Text** (#ece4d2): body text on dark plates.
- **Vellum Title** (#efe3c4): serif titles and names on dark plates.
- **Vellum Muted** (#c7b896): secondary text, pile labels, notes.
- **Card Ink** (#1d150d): text on gold and on cream cards.
- **Card Cream** (#fbf7ee): the face of action cards.

### Game colours (information, not decoration)
- **Seats:** Seat Gold (#f8b010), Seat Teal (#1ba3bd), Seat Red (#e8573f), Seat White (#f1f0ea). The colour of each player's pieces; used on name bars, agents and markers only.
- **Suits:** Construction (#e0773c), Administration (#3a8fd8), Mobilization (#3fae6a), Aggression (#b05ad0). The border and number of each action card.
- **Resources:** Material (#c9a27a), Fuel (#f0c24b), Weapons (#ff7a5c), Relic (#59d0a8), Psionic (#c38bff).
- **States:** OK (#6fe3a5), Warning (#ffcc66), Danger (#ff6b6b), for messages and validation only.
- **Blighted Reach factions** (Empire, Blight, Free States, Regent and Outlaw titles): [to be resolved during implementation, from the campaign's official components; add them as tokens here before first use].

### In the code
The colours are CSS variables on `.tbl-stage` in `src/ui/table/table.css`, and new rules use them instead of hex values:
- Gilt Gold is `--dg-gold`, Bronze Dim is `--dg-gold-dim`, Card Ink is `--dg-ink`, Parchment Text is `--dg-text`, Ember Orange is `--dg-orange` and Table Soot is `--dg-bg`.
- The others carry their token name: `--gilt-highlight`, `--gilt-deep`, `--gilt-pale`, `--bronze-edge`, `--void-black`, `--frame-umber`, `--frame-brown`, `--vellum-title`, `--vellum-muted` and `--card-cream`.
- Three support tones without a frontmatter entry: `--bronze-rule` (#4a3a22, thin dividers), `--vellum-faint` (#8a7a58, the faintest caption) and `--frame-raise` (#2a2016, a raised plate inside a frame).
- The retired teal names (`--text`, `--text-dim`, `--text-faint`, `--rule`, `--rule-hi`, `--select`, `--panel`, `--panel-solid`, `--panel-raise`) now resolve to these gold tones, so old rules read gold; new rules still use the token names.
- Font sizes use the `--fs-*` scale and radii are 4, 6 or 8 px; card faces keep their own sizes.

### Named Rules
**The Gold-Is-Structure Rule.** Gold draws frames, titles and the single primary action of a group. It never fills a large area, and a group never has two gold-filled buttons.

**The Game-Colour Rule.** Saturated colour on the table always means something in the game: a seat, a resource, a suit, a state. If it means nothing, it is gold, bronze or neutral.

**The No-Teal Rule.** The old blue-teal palette is retired. New rules never use `--panel`, `--rule`, `--rule-hi`, `--select` or the `#0d1326`-family blues; existing uses are migrated to the gold tokens.

## Typography

**Display Font:** Georgia (with "Times New Roman", serif)
**Body Font:** Segoe UI (with Inter, system-ui, sans-serif)
**Numeral Font:** Cascadia Mono (with Consolas, ui-monospace)
**Card Fonts:** Arcs Card Title (with Cinzel, Georgia) and Arcs Card Text (with Jost, Futura), for card faces only

**Character:** an engraved serif in uppercase for names and titles, as on the official boards, over a plain, sturdy sans for everything the player reads to act. Numbers are tabular and bold so counts line up.

### Hierarchy
- **Display** (700, 24px, letter-spacing 0.08em, uppercase): column titles such as "Ambitions".
- **Headline** (700, 17–18px, 0.05em, uppercase): ambition names, card and section names.
- **Title** (600, 22px): the turn instruction under the hand (centred, underlined in gold, glowing).
- **Body** (600, 16px, line-height 1.2): button labels and window text.
- **Label** (600, 13px, 0.04em, uppercase): pile names, small captions, rule notes. The floor for any functional text.
- **Card** (800, 11px, uppercase): action names on card faces only; a whole card shows large on hover.
- **Numeral** (700, 14px and up, monospace): counts, pips, scores.

The roles are CSS tokens on `.tbl-stage` in `src/ui/table/table.css`: `--fs-card` 11, `--fs-caption` 13, `--fs-label` 14, `--fs-body` 16, `--fs-headline` 18, `--fs-title` 22, `--fs-display` 24 (stage px). New rules use the tokens, never a literal size. The stage is scaled to the window, so at 1366×768 these show at 71%: the 13px caption floor is about 9px on screen there. Making the laptop size comfortable is a layout question (how the stage scales), not a reason to raise every size.

### Named Rules
**The Engraved-Name Rule.** Names of things (ambitions, cards, players, columns) are serif and uppercase; instructions and buttons are sans in sentence case.

**The Caption-Floor Rule.** No functional text below the caption token (13 stage px); only card faces go lower, because the whole card shows large on hover. Check every size at 1366×768 too, where the stage shows at 71%.

## Layout

One fixed stage of at least 1920×1080 stage pixels, scaled uniformly to the window (`setStage` in `src/ui/table/layout.ts`). Regions are computed there and nowhere else, with a 10px gutter:
- the top strip (70px) holds the chapter, the supply, the Court row and the menu squares;
- the rival bands are on the left;
- the ambitions column is on the right, foldable to a 40px tab;
- the 3D map fills the centre;
- the bottom band holds the local player board, the played card, the hand and the own Court;
- the command bar sits right above the bottom band and appears only once a card is picked.

Nothing scrolls on the table. Lists that grow (the own Court, rival cards) fan or overlap inside their frame.

The band above the local board (about 570×368 stage px, left of the command bar) is kept free on purpose. It is reserved for the Blighted Reach flagship board and Fate card. The place of every campaign element on the table is set in `design/ux/campaign-table-layout.md`.

### Named Rules
**The One-Source Rule.** A region's position and size are set only in `layout.ts`. CSS sizes the contents of a region, never the region itself.

**The Reserved-Band Rule.** Keep the band above the local board free in the base game; it belongs to the campaign's flagship board and Fate card.

## Elevation & Depth

Depth comes from the frame, not from floating cards.
- Every plate is inset: a dark hairline inside the gold bevel, a faint warm light from the top, a black outer line and one deep drop shadow (0 10px 26px) that lifts it off the map.
- Buttons are flat plates inside that.
- The hand fans in a gentle arc, and a hovered or picked card rises a little.
- Glow is light, not shadow. It appears only on state: playable, targetable, ready, active, or the turn's instruction.

### Shadow Vocabulary
- **Plate** (`box-shadow: inset 0 0 0 1px #000d, inset 0 0 0 3px rgba(226,178,92,.22), inset 0 14px 28px rgba(255,205,130,.06), 0 0 0 1px #000, 0 10px 26px #000d`): every framed panel and board.
- **Card lift** (`box-shadow: 0 4px 12px #000c`): cards in the hand and on the table.
- **State glow** (`box-shadow: 0 0 12px rgba(255,196,100,.45)`): hover on a command, a lit target, a toggled switch.
- **Ready pulse** (`0 0 0 2px #ffd27a, 0 0 22px rgba(255,196,100,.8)` at mid-cycle): End turn when no action is left.

### Named Rules
**The Glow-Means-Now Rule.** A glow says "usable now" or "active". Nothing glows at rest, and a glow never stays on after its state ends.

## Shapes

Gently softened rectangles: 6px corners on buttons and small plates, 8px on boards and windows, 4px on tags, round only for counters, seats and tokens. Frames are 2–3px gold bevels drawn as a gradient border, with a 28px ornament in each corner of the major plates (boards, the ambitions column, the command bar). Cards keep the official 372:519 proportion everywhere: hand, table, piles and rival bands.

## Components

### Buttons
Tactile gold-and-umber plates, all one height in a group.
- **Shape:** gently softened corners (6px), 48px tall in the command bar; equal widths within a group.
- **Primary:** a gold gradient from Gilt Highlight to Gilt Deep, Card Ink text, a Bronze Edge outline, 700 weight. One per group.
- **Secondary:** an umber gradient plate (#2a2016 to #120d08) with a 2px Bronze Dim border and Parchment Text.
- **Hover / Focus:** the border turns Gilt Gold and a state glow appears; keyboard focus adds a visible outline.
- **On / toggled:** a Gilt Pale ring with a state glow.
- **Disabled:** 45% opacity, no glow, plain cursor.
- **Menu squares:** 52px Void Black squares with a 2px Gilt Gold border and a gold glyph (menu, objectives, map layers, help, settings). They glow on hover; when pressed they fill with gold.

### Chips
- **Style:** small gold tags with Card Ink text and 4px corners (for example "Declare" on an ambition), or a dark plate with a gold glyph for card powers in the command bar.
- **State:** a power chip appears only while its power is usable now.

### Cards / Containers
- **Corner Style:** 8px on boards and windows.
- **Background:** the radial Frame Brown to Frame Umber plate, lit from the top centre.
- **Shadow Strategy:** the Plate shadow (see Elevation & Depth).
- **Border:** a 3px bevelled gold gradient border with corner ornaments.
- **Internal Padding:** 10px gutter, 6px between tightly related items.

### Navigation
The menu squares in the top-right corner are the only navigation. Settings, the log and help open as framed drop-downs or windows over the table and close with Escape. There are no tabs and no sub-menus on the table: everything the player can do now is a visible button or a lit object.

### Action Card (signature)
- Official suit colours as a 4px border and the large number.
- A cream face with the action names, pips and ambition symbol.
- Always 372:519.
- In the hand: 100×140 stage px, fanned. Picked: raised. Unplayable: greyed.
- In the discard pile the top card is drawn at hand size and scaled down, so its text never reflows.

### Command Bar (signature)
- A framed plate above the hand, shown only after a card is picked.
- **Head line:** the card's name and pips, plus an X that puts the card back.
- **One row:** the card's actions, the card powers usable now, and the turn's two buttons (Undo, End turn or Pass), always in the same places.
- **Before a card is picked:** only Undo and Pass show, frameless, in those same places.
- **The instruction:** it sits under the hand, not in the bar.

### Ambitions Column (signature)
- A tall framed column on the right: a serif title, the declared markers, then one row per ambition spread over the height.
- A gold drawer handle on the middle of its left edge folds it to a 40px tab with a vertical title. The choice is remembered.

## Do's and Don'ts

### Do:
- **Do** use the official boards, cards, card backs and pieces; when one is missing, ask for it instead of drawing a stand-in.
- **Do** keep one gold primary button per group, at 48px, with every button of the group the same height.
- **Do** keep every button inside its window; `tests/integration/command-bar.spec.ts` checks it.
- **Do** use a glow only for "usable now" or "active", and remove it when the state ends.
- **Do** set region geometry in `src/ui/table/layout.ts` and keep the band above the local board free for the campaign.
- **Do** keep cards at 372:519 everywhere.
- **Do** add new colours as tokens in this file first, Blighted Reach factions included.

### Don't:
- **Don't** invent art, icons or card faces that imitate the game's material.
- **Don't** use the retired blue-teal palette (`--panel`, `--rule`, `--rule-hi`, `--select`).
- **Don't** add sub-menus, hidden information or duplicate controls on the table.
- **Don't** fix a style by appending a more specific override (`.tbl-stage.tbl-stage …`, `!important`); change the component's own rule.
- **Don't** put a glow on a frame, a title or anything at rest.
- **Don't** use bounce or elastic easing; motion settles.
