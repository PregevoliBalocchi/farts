// Declaring an ambition with card effects (design/gdd/card-effects.md, "Declaring").
// Every way to declare — leading, following with a card, Vox and lore effects —
// pays the same costs first and fires the same triggers afterwards.

import { RuleError } from './errors';
import { effectOf, ownedEffects } from './effects';
import type { ContentIndex } from './setup';
import type { AmbitionId, GameState, PlayerId } from './types';

/** A Guild card given as the cost of declaring (to a Rival with the least Power; `to` picks among tied ones). */
export interface DeclareGift {
  card: string;
  to?: PlayerId;
}

/**
 * Pays the costs cards put on declaring, before the marker is placed.
 * Throws RuleError when a mandatory cost cannot be paid (then nobody may declare).
 */
export function payDeclareCost(ix: ContentIndex, s: GameState, p: PlayerId, give: DeclareGift | undefined): string {
  if (!ownedEffects(ix, s, p).some((f) => f.effect.declareCostGuildToWeakest)) return '';
  const pl = s.players[p];
  if (!give) fail('To declare you must give 1 Guild card to the Rival with the least Power');
  if (!pl.court.includes(give.card) || ix.courtCards.get(give.card)?.kind !== 'faction') fail(`${give.card} is not one of your Guild cards`);
  const rivals = s.players.filter((x) => x.id !== p);
  const least = Math.min(...rivals.map((x) => x.power));
  const weakest = rivals.filter((x) => x.power === least).map((x) => x.id);
  const to = give.to ?? (weakest.length === 1 ? weakest[0] : fail('Several Rivals have the least Power: choose one'));
  if (!weakest.includes(to)) fail(`P${to} does not have the least Power`);
  pl.court.splice(pl.court.indexOf(give.card), 1);
  s.players[to].court.push(give.card);
  return `P${p} gives ${give.card} to P${to} to declare`;
}

/**
 * After an ambition is declared: mandatory triggers resolve at once, optional
 * ones queue a Decision for the declaring player. Returns log lines.
 */
export function afterDeclare(ix: ContentIndex, s: GameState, p: PlayerId, ambition: AmbitionId, wasUndeclared: boolean): string[] {
  const out: string[] = [];
  const declared = { ambition, wasUndeclared };
  for (const { card, effect } of ownedEffects(ix, s, p)) {
    const auto = effect.autoTriggers?.onDeclare;
    if (auto) out.push(`${card}: ${auto({ ix, state: s, player: p, card, args: declared })}`);
    if (effect.triggers?.onDeclare && (effect.triggerWhen?.onDeclare?.({ ix, state: s, player: p, card, declared }) ?? true))
      (s.pendingDecisions ??= []).push({ player: p, card, effect: 'onDeclare', data: declared });
  }
  return out;
}

/** True if a card answers this trigger (used by the UI to label a Decision). */
export function hasTrigger(ix: ContentIndex, card: string, name: string): boolean {
  return !!effectOf(ix, card)?.triggers?.[name];
}

function fail(msg: string): never {
  throw new RuleError(msg);
}
