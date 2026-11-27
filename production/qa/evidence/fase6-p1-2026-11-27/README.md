# Fase 6 P1 fixes, 2026-11-27 (production/base-fixes.md #60)

From the Fase 6 critique (`production/qa/evidence/audit-fase6-2026-11-27/critique.md`) and audit, the two P1s.
Built with `npm run build:single`, 3 players, seed 3, P0 leading Administration.

- `prompt-before-it-1920.png`: before. The turn instruction shared its line with the turn banner and was cut
  ("4 azioni: scegline una o cl…").
- `prompt-after-it-1920.png`: after. The banner sits above the instruction, which has the hand's whole width
  and shows whole at full size.
- `prompt-after-it-1366.png`, `prompt-after-en-1366.png`: 1366×768 with the automatic large text. The
  instruction shrinks to 82% (it) and 93% (en) to stay on one line; past 75% it would wrap to a second line.
- `draft-labels-1366.png`: the draft at 1366×768, its "Leader"/"Lore" and "nessuna carta" on the type scale.

Measured at 1366×768 (stage at 71%, large text): functional texts under 11 screen px went from 21 to 0 (the 4
left are Court card titles, card faces). The rival bands' Power and building bonus, the Court pile counts, the
draft labels and "Nessuna carta" now use `--fs-label`.
