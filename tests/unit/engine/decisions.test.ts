// How each Decision is answered (src/game/engine/decisions.ts; production/piano-blindatura-tavolo-2026-11-25.md
// decision A "D0", and D2: a choice that may be declined with no legal answer is not asked).
import { describe, expect, it } from 'vitest';
import { decisionAsk, decisionCandidates } from '../../../src/game/engine';
import type { Command, Decision, GameState } from '../../../src/game/engine';
import { decisionOptions } from '../../../src/ui/table/decide';
import { cardsIndex, runAll, start } from '../cards/fixture';

const ix = cardsIndex();

/** P0 leads and secures the Vox card put on the first Court slot. */
function secureVox(s: GameState, vox: string): GameState {
  s.court[0] = { card: vox, agents: { 0: 1 } };
  const cmds: Command[] = [
    { type: 'lead', player: 0, card: 'suitB-2' },
    { type: 'action', player: 0, action: { kind: 'secure', courtSlot: 0 } },
  ];
  return runAll(ix, s, cmds);
}

describe('every Decision declares how it is answered', () => {
  it('each card effect that asks a Decision declares its answers', () => {
    const missing: string[] = [];
    for (const [id, e] of Object.entries(ix.effects)) {
      const asked = [...(e.whenSecured?.choice ? ['whenSecured'] : []), ...Object.keys(e.triggers ?? {}), ...(e.setup?.extraLore ? ['setupLore'] : [])];
      for (const name of asked) if (!e.asks?.[name]) missing.push(`${id}.${name}`);
    }
    expect(missing).toEqual([]);
  });

  it('the dice of a battle and the campaign events are declared too', () => {
    const effects = ['collectDice', 'event:steal', 'event:choice', 'event:govern', 'event:demand', 'event:escalation', 'event:weapons', 'event:fiasco', 'event:freedom'];
    const missing = effects.filter((effect) => !decisionAsk(ix, { player: 0, card: 'x', effect } as Decision));
    expect(missing).toEqual([]);
  });

  it('a campaign event takes the rules\' default on the empty answer, a card\'s "may" declines', () => {
    expect(decisionAsk(ix, { player: 0, card: 'x', effect: 'event:choice' })?.empty).toBe('default');
    expect(decisionAsk(ix, { player: 0, card: 'v:court-30', effect: 'whenSecured' })?.empty).toBe('decline');
    expect(decisionAsk(ix, { player: 0, card: 'v:court-26', effect: 'whenSecured' })?.empty).toBe('none');
  });
});

describe('a choice with no possible answer is not asked (piano D2)', () => {
  it('Guild Struggle with no Guild card to steal resolves at once and still shuffles the Guild discard into the deck', () => {
    const s0 = start(ix, [['suitB-2'], ['suitB-4']]);
    s0.courtDiscard = ['g:court-01'];
    const s = secureVox(s0, 'v:court-30');
    expect(s.phase.type).toBe('actions');
    expect(s.courtDeck).toContain('g:court-01');
    expect(s.log.some((l) => l.text.includes('steals nothing') && l.text.includes('(no possible choice)'))).toBe(true);
  });

  it('Guild Struggle asks when a Rival holds a Guild card, and offers stealing it', () => {
    const s0 = start(ix, [['suitB-2'], ['suitB-4']]);
    s0.players[1].court = ['g:court-01'];
    const s = secureVox(s0, 'v:court-30');
    expect(s.phase.type).toBe('decide');
    const options = decisionOptions(ix, s, 0);
    expect(options[0].parts).toEqual([]);
    expect(options.some((o) => o.args.card === 'g:court-01' && o.args.from === 1)).toBe(true);
  });

  it('Song of Freedom asks when the player controls a system with a city in it', () => {
    const s0 = start(ix, [['suitB-2'], ['suitB-4']]);
    const sys = Object.values(s0.map).find((x) => x.inPlay && x.id.endsWith('-p1'))!;
    sys.ships = { 0: { fresh: 2, damaged: 0 } };
    sys.buildings = [{ owner: 1, type: 'city', damaged: false }];
    const s = secureVox(s0, 'v:court-29');
    expect(s.phase.type).toBe('decide');
    expect(decisionOptions(ix, s, 0).some((o) => o.args.system === sys.id && o.args.index === 0)).toBe(true);
  });
});

describe('the answers the engine declares', () => {
  it('Outrage Spreads offers each resource type', () => {
    const s = secureVox(start(ix, [['suitB-2'], ['suitB-4']]), 'v:court-28');
    expect(s.phase.type).toBe('decide');
    if (s.phase.type !== 'decide') return;
    const types = decisionCandidates(ix, s, s.phase.decision).map((p) => p[0].value);
    expect(types).toEqual(['material', 'fuel', 'weapons', 'relic', 'psionic']);
  });
});
