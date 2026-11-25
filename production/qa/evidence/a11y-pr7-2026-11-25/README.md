# Evidence: accessibility (PR 7 of production/piano-blindatura-tavolo-2026-11-25.md)

Checked on 2026-11-25, Windows, Chrome with the GPU, on the single-file build. E2e tests:
`tests/integration/a11y.spec.ts` (6 tests); the whole suite (52 tests) passes locally.

- **A7, reduce motion:** the system setting turns the idle 3D motion off, as `?motion=off` does.
- **A3, A12, systems named and announced:**
  - Every system key says its name, not its id.
  - When a choice lights systems, the screen-reader status line names them.
  - The arrows move only among the lit ones (Ctrl moves among all), and the map frames the focused one.
- **A2, A5, zoom and Esc:**
  - Z or + zooms the focused card; focus alone never zooms it.
  - Esc first closes the zoom, then the hover tips, then the "?" box, then the rest as before.
  - When a menu or window closes, focus goes back to the control that opened it.
- **A6, windows hold the keyboard:**
  - Every window is `aria-modal`: settings, scoring, end, card choices, map and Court menus, the draft.
  - It opens on its first control.
  - Tab and Shift+Tab go round its controls without leaving it.
  - `a6-settings-focus-1366.png`: the settings window opened from the keyboard, focus on its third control, with
    the new "Colori dei giocatori" row.
- **A9, not by colour alone:**
  - Seats already had their own shapes: circle, square, triangle, diamond.
  - On the map, the chosen system now has two rings and the ones to pick have one. `a9-chosen-system-1920.png`:
    the move's start, gate 2, in double gold rings; its destinations in single cyan ones.
  - On the 2D map the chosen system is dashed.
  - The settings offer seat colours easier to tell apart with colour blindness: Okabe-Ito orange, sky blue,
    reddish purple, and the white. `a9-palette-official-1366.png` and `a9-palette-clear-1366.png` show the same
    table.
  - The pieces keep their paint, so the choice reloads the page. A local game goes on where it was (test: same
    hands after the reload). `?palette=clear` forces it.
- **A8, small text:** the texts people read that were below 12 px now use the type scale, and grow with
  "Testo grande".
  - They use the new `--fs-small` (12 px) or `--fs-caption`.
  - They cover hotkey numbers, ambition boxes, menu reasons, the 1st/2nd marks, battle-type lines, the card
    sheet's captions and the Power-point names.
  - Pictures of pieces and card miniatures keep their own size, as they are drawn to scale with the object: Court
    strip placeholders, hexagon numbers, dice, card-face keywords.
- **A10, contrast:**
  - **Method:** a script measured three tables at 1366x768: 3 seats base, 4 seats Leaders, 2 seats with the clear
    palette. It reads every visible text's colour, then hides the texts and samples the screenshot under each one,
    so a text over the 3D map is measured against the map itself.
  - **Results:** on the 3-seat table, 14 of 107 texts were under WCAG AA at the median background before the
    fixes.
  - **Fixed:**
    - The building-slot bonus "+2/+3" was light text on the seat colour, 1.55:1 on yellow. It is now dark ink with
      a light halo. Bare, it measures 3.1–4.4:1 on teal and red; the halo is not in the measure.
    - The dimmed "0" supply chips were 4.4:1 and are now over 4.5:1.
  - **Left as they are:**
    - The action-card numerals (34 px, 2.6–2.8:1) are the official card faces, white on the suit colour.
    - The two skip links are hidden until focused, and the script read them while clipped. Shown, they have a dark
      ground.
    - Court titles and "LORE" in the 4-seat Leaders run were covered by the draft window when measured.
  - No text over the open 3D map fell under AA (system labels, tooltips, prompts): each sits on its own dark
    plate.
