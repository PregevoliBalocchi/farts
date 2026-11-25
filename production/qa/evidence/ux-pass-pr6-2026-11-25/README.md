# Evidence: previews, scoring, end screen, battle, turn banner, "while you were waiting", "?" reminders (PR 6 of production/piano-blindatura-tavolo-2026-11-25.md)

Checked on 2026-11-25, Windows, Chrome with the GPU, on the single-file build. E2e tests:
`tests/integration/previews.spec.ts` (previews, battle window, "while you were waiting", reminders) and
`tests/integration/scoring.spec.ts` (chapter scoring, end screen); unit test `tests/unit/engine/cleanup.test.ts`
(Power by chapter, seen failing without the engine change).

- **Previews** (Fase 4.5): `follow-previews-1366.png`: Administration 2 against a Construction 5 lead: "Supera:
  serve Costruzione", "Copia: 1 azione della guida", "Cambia: 1 azione della carta", seizing "scarti 1 carta in più";
  the full rule in each tooltip. `declare-stake-1366.png`: Construction 5 lights Keeper with "Dichiara · 1° 5 · 2° 3";
  its tooltip says who would place if the chapter ended now.
- **Chapter scoring** (4.7): `scoring-3p-1366.png`: "1°: 5 Potere · 2°: 3" per ambition, and the seat with +0 is told
  why (tie for 2nd, none of it). `scoring-2p-1366.png`: the 2-player note at reading size.
- **End screen** (4.8, decision G): `end-screen-1366.png`: winner, why the game ended, the tie at 30 broken by turn
  order, the Power after every chapter.
- **Battle** (4.6): `battle-attacker-1920.png`: the dice grouped by symbol in the order they resolve;
  `battle-defender-1920.png`: the defender's view ("Giocatore 2 ti attacca: 2 colpi alle tue navi"). Destroying a
  city: the attacker is told it provokes Outrage of that planet's type before confirming.
- **Turn banner** (4.3): `turn-banner-1366.png`: "Giocatore 3 · risponde · guida: Costruzione 5" in the seat's
  colour and symbol, before the instruction.
- **While you were waiting** (4.4): `while-waiting-1366.png`: a resource taken and an agent captured since the last
  turn.
- **"?" reminders** (4.10): `rule-reminder-follow-1366.png`, `rule-reminder-scoring-1366.png`.
- **Small fixes** (4.9): the Court prompt says "nella fila in alto"; the last teal glows are gold. Kept as it is: a
  rival's board opens on a click, not on hover (the owner's choice, base-fixes #37).
