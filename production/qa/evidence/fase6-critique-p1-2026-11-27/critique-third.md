# Critique: game table (src/ui/table), third Fase 6 run, 2026-11-27

Build: dist-single/index.html (commit 123390f, before the disabled-primary fix). Operate mode. Assessment A (design review) plus Assessment B (detector, rendered on localhost).

Design-specificity verdict: specific, not generic. The gilt plates, state-only glow, command bar, instruction line and Pass confirm match DESIGN.md.

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of status | 3 |
| 2 | Match real world | 2 |
| 3 | User control | 3 |
| 4 | Consistency | 3 |
| 5 | Error prevention | 2 |
| 6 | Recognition | 3 |
| 7 | Flexibility | 2 |
| 8 | Minimalism | 2 |
| 9 | Error recovery | 2 |
| 10 | Help | 2 |
| | Total | 24/40 |

## Priority issues
- P1 "Fine turno" read as enabled during a pick. Checked: it was disabled, but drawn in a dimmed gold. Fixed after this run (c19bf12): off, it is drawn like the other buttons.
- P1 Unexplained action words and suit pips (Guida, Influenza, Muovi, Annettere (Costruire), "Mobilitazione 5 ✦✦"). Fix: a first-use hint or a one-line tooltip per action.
- P2 1366×768 legibility at 71% stage scale. A layout question, not a size bump.
- P2 The map re-frames when Move starts (#55 frames the lit systems).
- P3 Six cards plus five command items exceed the four-item rule.

## Persona red flags
- First-timer: action words with no meaning; the "?" is small; a red toast gives no next step.
- Accessibility: about 9 px effective text at 1366; keyboard path not tested (NOT ASSESSED).
- Stress tester: the map re-frames mid-action.

## Detector (B)
Dark glow gold, seat teal #1ba3bd, side-tab seat stripes, live-dot pulse (no-motion handled), small card-face text: intentional (official look) or false positives.

## Not reached
Tax and Build menus, the destination pick, battle, chapter scoring, the help menu, keyboard navigation, English at 1366.
