# Evidence: card choices described by the engine (PR 3 of production/piano-blindatura-tavolo-2026-11-25.md)

Checked on 2026-11-25, Windows, Chrome with the GPU, on the single-file build.

- `tests/unit/engine/decisions.test.ts` (7 tests): every card effect that asks a Decision, the battle dice and the 8 campaign events declare their answers; Guild Struggle with no Guild card to steal is not asked (seen failing with the rule switched off: the game stopped on the choice), and still shuffles the Guild discard into the deck; Guild Struggle and Song of Freedom ask when there is something to choose.
- Two older card tests now expect the new rule: Song of Freedom with no city is not asked; the Feastbringer's declaring cost is checked with a Guild card to give.
- `known-problems.spec.ts` D2 (fixture `empty-choice.json`, a saved game stopped on Song of Freedom with no city): before, "Scegli" opened an empty list; now no "Scegli", one "Continua". `test.fail()` removed.
- Seeded games: `known.json` no longer lists empty choices or the stuck decision; the 4 games pass. The simulator now counts a "keep N cards" window as a choice with options (it reported leader-09's lore choice as empty).
- Full checks: tsc, 613 unit tests, 33 e2e.

Screenshot: `no-possible-choice-1366.png`, the bar on that saved game ("Canto di Libertà · Nessuna scelta possibile." and Continua).
