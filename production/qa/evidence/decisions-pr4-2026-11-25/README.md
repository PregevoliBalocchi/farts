# Evidence: Farseers, Predictive Sensors, action card faces (PR 4 of production/piano-blindatura-tavolo-2026-11-25.md)

Checked on 2026-11-25, Windows, Chrome with the GPU, on the single-file build.

- **D1, Predictive Sensors** (`known-problems.spec.ts`, fixture `collect-dice.json`): before, the attacker saw a card choice named "battle" with Rinuncia; it failed in PR 1 and here. Now the battle window opens with the 3 dice first asked for; one fewer is chosen and Roll rolls 2. `test.fail()` removed. Screenshot: `sensors-collect-dice-1920.png`.
- **D3, Farseers** (`tests/unit/cards/leader-effects.test.ts`, `tests/integration/decisions.spec.ts`): the engine asks the Rival first, then the swap as its own question (refusable). The window shows both hands as action cards, no ids in text or screen-reader labels (the label check failed with "construction-2" before `cardName` knew action cards). Screenshots: `farseers-swap-1920.png`, `farseers-swap-1366.png`.
- Full checks: tsc, 615 unit tests, 35 e2e.
