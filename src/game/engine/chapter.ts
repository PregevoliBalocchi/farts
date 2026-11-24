// Chapter flow state machine (design/gdd/core-loop.md §3.3).
//
// Transition table:
//   lead     --lead(card)-->              actions(leader)
//   actions  --action(battle)-->          allocate(attacker)
//   allocate --allocate(hits)-->          actions(same budget)
//   actions  --endTurn-->                 follow(next) | [round end]
//   follow   --follow(card, mode)-->      actions(player)
//   lead     --pass-->                    lead (next clockwise player with cards) | [chapter end]
//   [round end] -> lead (new initiative; passed on if that player has no cards) | [chapter end]
//   [chapter end] -> score -> lead (next chapter) | gameOver
//   any      --[card effect queues a Decision]--> decide --decide--> (the phase it interrupted)
// Followers without cards are passed automatically.

import { ambitionForNumber, declareAmbition, emptyAmbitionBoard, scoreAmbitions } from './ambitions';
import { actionKindOf, applyAllocation, collectAndRoll, performAction, rerollDice, resolveWhenSecured, RuleError } from './actions';
import type { DicePool } from './dice';
import { afterDeclare, payDeclareCost } from './declare';
import type { DeclareGift } from './declare';
import { HANDLERS } from './actions';
import type { MovePayload } from './actions';
import { effectOf, hasPassive, isDeclared, ownedEffects } from './effects';
import { cartelSupply, returnPiece, toDiscard } from './ops';
import { returnCouncil } from './campaign';
import { decideEvent, isEventDecision, runEvent, startEvent } from './events';
import { isEventCard, placeStartingPieces } from './campaign-setup';
import type { ActionPayload, ActionResult, Allocation } from './actions';
import { shuffle } from './rng';
import { arrangeResources, endArranging, gainFromSupply, onCityReturned, returnToSupply, takeResourceAt } from './board';
import { finishSetup } from './setup';
import type { ContentIndex } from './setup';
import { AMBITIONS } from './types';
import type { ActionKind, AmbitionId, GameState, Play, PlayerId, Resource, TurnBudget } from './types';

/** Everything a player (or AI, or network peer) can do. */
export type Command =
  /** `ambition` is required when the card's number declares 'any', and must match otherwise. */
  /** `give`: the Guild card a declaring cost asks for (see declare.ts). */
  | { type: 'lead'; player: PlayerId; card: string; declare?: boolean; ambition?: AmbitionId; give?: DeclareGift }
  /** `declare`: with a card allowing it, a Surpass or Pivot may declare the played card's ambition. */
  /** `event`: a campaign Event card, taking actions like the lead card (campaign rulebook p. 12). */
  | { type: 'follow'; player: PlayerId; card: string; mode: 'surpass' | 'pivot' | 'copy' | 'event'; seizeWith?: string; declare?: boolean; ambition?: AmbitionId; give?: DeclareGift }
  | { type: 'action'; player: PlayerId; action: ActionPayload }
  /**
   * Spend one resource in the prelude; `action` is required unless the resource only grants a kind for this turn.
   * `as`: spend it as another type (needs a card that allows spending any resource as that type).
   */
  | { type: 'prelude'; player: PlayerId; resource: Resource; as?: Resource; action?: ActionPayload }
  /** Use a card's "Prelude:" ability (`card`: content id, `ability`: its name in the effect registry). */
  | { type: 'ability'; player: PlayerId; card: string; ability: string; args?: Record<string, unknown> }
  /**
   * Answer the Decision the game is waiting for (empty args = decline an optional effect).
   * For 'collectDice' (a battle paused for the defender's reactions): `args.dice` (default: the dice first asked for).
   */
  | { type: 'decide'; player: PlayerId; args?: Record<string, unknown> }
  /** Before allocating, the attacker rerolls dice (indices into the battle's faces) with one card's reroll ability. */
  | { type: 'reroll'; player: PlayerId; card: string; dice: number[] }
  | { type: 'allocate'; player: PlayerId; allocation: Allocation }
  /** `rescueGate`: required when the player ends the turn with no ships and no starports on the map (3 fresh ships go there). */
  | { type: 'endTurn'; player: PlayerId; rescueGate?: string }
  /** The initiative holder skips the turn: initiative goes to the next clockwise player with cards and the round ends. */
  | { type: 'pass'; player: PlayerId }
  /**
   * Rearrange the player's resource tokens (`slots[i]`: the token for slot i, or null), in any phase and on
   * anyone's turn, but only after taking or being given a resource or after a returning city covered a slot,
   * and before the player's next other command.
   */
  | { type: 'arrange'; player: PlayerId; slots: (Resource | null)[] }
  /** Leaders & Lore draft: take one face-up leader or lore card. */
  | { type: 'draft'; player: PlayerId; card: string }
  /**
   * 2 players, before the first lead: the player without initiative redraws the first hand once.
   * Campaign (p. 6 step J, p. 12): `cards` are the cards discarded (never Event cards); as many are drawn.
   */
  | { type: 'mulligan'; player: PlayerId; cards?: string[] }
  /** Campaign Act I setup steps G-H (p. 6): 3 ships and a building at a planet with an Imperial ship. */
  | { type: 'place'; player: PlayerId; system: string; building: 'city' | 'starport' };

/**
 * Applies a command and returns the new state. Pure: the input is not mutated;
 * an illegal command throws RuleError and nothing changes.
 */
export function dispatch(ix: ContentIndex, state: GameState, cmd: Command): GameState {
  const s = structuredClone(state);
  apply(ix, s, cmd);
  promoteDecision(s);
  return s;
}

/** Whose input the game is waiting for, or null when over. */
export function activePlayer(s: GameState): PlayerId | null {
  switch (s.phase.type) {
    case 'draft':
      return s.draft!.order[0];
    case 'campaignSetup':
      return s.campaign!.placements[0];
    case 'lead':
      return s.initiative;
    case 'follow':
      return s.phase.next;
    case 'actions':
    case 'allocate':
      return s.phase.budget.player;
    case 'decide':
      return s.phase.decision.player;
    case 'gameOver':
      return null;
  }
}

/** Interrupts the current phase with the next queued Decision, if any. */
function promoteDecision(s: GameState): void {
  if (s.phase.type === 'decide' || s.phase.type === 'gameOver') return;
  const d = s.pendingDecisions?.shift();
  if (d) s.phase = { type: 'decide', decision: d, resume: s.phase };
}

function apply(ix: ContentIndex, s: GameState, cmd: Command): void {
  if (s.phase.type === 'gameOver') err('Game is over');
  if (cmd.type === 'arrange') {
    const p = s.players[cmd.player];
    if (!p) err(`No player ${cmd.player}`);
    const why = arrangeResources(ix.content, p, cmd.slots);
    if (why) err(why);
    return;
  }
  // Any other command ends the player's chance to rearrange what they gained before it.
  if (s.players[cmd.player]) endArranging(s, s.players[cmd.player]);
  if (cmd.type === 'mulligan') {
    if (s.mulligan !== cmd.player) err(`P${cmd.player} cannot redraw`);
    const p = s.players[cmd.player];
    if (s.campaign) {
      // p. 12: "you must keep any Event cards in your hand and only draw the number of action cards you discarded".
      const out = cmd.cards ?? p.hand.filter((c) => !isEventCard(ix, c));
      for (const c of out) {
        if (!p.hand.includes(c)) err(`Card ${c} not in hand`);
        if (isEventCard(ix, c)) err('Event cards stay in hand in a mulligan');
      }
      for (const c of out) removeFromHand(p.hand, c);
      toDiscard(s, out, p.id);
      p.hand.push(...s.deck.splice(0, out.length));
      s.mulligan = null;
      log(s, `P${cmd.player} discards ${out.length} cards and draws as many`);
      return;
    }
    toDiscard(s, p.hand, p.id);
    p.hand = s.deck.splice(0, ix.content.handSize);
    s.mulligan = null;
    log(s, `P${cmd.player} discards the starting hand and draws a new one`);
    return;
  }
  if (cmd.player !== activePlayer(s)) err(`Not P${cmd.player}'s turn`);
  const c = ix.content;
  const p = s.players[cmd.player];

  if (s.phase.type === 'draft' && cmd.type !== 'draft') err('Finish the Leaders & Lore draft first');
  if (s.phase.type === 'campaignSetup' && cmd.type !== 'place') err('Place your starting pieces first');
  if (s.phase.type === 'decide' && cmd.type !== 'decide') err('A card effect is waiting for a choice');
  switch (cmd.type) {
    case 'draft': {
      if (s.phase.type !== 'draft') err('No draft in progress');
      const d = s.draft!;
      if (d.leaders.includes(cmd.card)) {
        if (p.leader) err('You already have a leader');
        p.leader = cmd.card;
        d.leaders = d.leaders.filter((x) => x !== cmd.card);
      } else if (d.lore.includes(cmd.card)) {
        if (p.lore.length >= d.lorePerPlayer) err('You already have your lore cards');
        p.lore.push(cmd.card);
        d.lore = d.lore.filter((x) => x !== cmd.card);
      } else err(`Card ${cmd.card} is not in the draft rows`);
      d.order.shift();
      log(s, `P${p.id} drafts ${cmd.card}`);
      if (!d.order.length) finishSetup(ix, s);
      return;
    }

    case 'place': {
      log(s, placeStartingPieces(ix, s, p.id, cmd.system, cmd.building, () => startChapter(ix, s)));
      return;
    }

    case 'pass': {
      if (s.phase.type !== 'lead') err('Only the initiative holder can pass, before leading');
      discardUndealt(s);
      s.consecutivePasses += 1;
      const holders = s.players.filter((x) => x.hand.length > 0).length;
      log(s, `P${p.id} passes the initiative`);
      if (s.consecutivePasses >= holders) {
        log(s, 'Everyone with cards passed');
        endChapter(ix, s);
        return;
      }
      passInitiative(ix, s, p.id);
      return;
    }

    case 'lead': {
      if (s.phase.type !== 'lead') err('Not the lead step');
      s.mulligan = null;
      discardUndealt(s);
      s.consecutivePasses = 0;
      if (isEventCard(ix, cmd.card)) err('An Event card cannot lead');
      const def = card(ix, p.hand, cmd.card);
      const play: Play = { player: p.id, card: def.id, mode: 'lead', faceUp: true };
      let declared: { amb: AmbitionId; was: boolean } | null = null;
      if (cmd.declare) {
        const fixed = ambitionForNumber(c, def.number) ?? err(`Card number ${def.number} cannot declare`);
        if (fixed === 'any' && !cmd.ambition) err('Choose which ambition to declare');
        if (fixed !== 'any' && cmd.ambition && cmd.ambition !== fixed) err(`Card number ${def.number} declares ${fixed}`);
        const amb: AmbitionId = fixed === 'any' ? cmd.ambition! : fixed;
        if (s.round.declarations >= c.maxDeclarationsPerRound) err('Declaration limit reached this round');
        if (!s.ambitions.available.length) err('No ambition markers left');
        const paid = payDeclareCost(ix, s, p.id, cmd.give);
        if (paid) log(s, paid);
        declared = { amb, was: s.ambitions.declared[amb].length === 0 };
        const marker = declareAmbition(s, amb);
        s.round.declarations += 1;
        play.zeroed = !hasPassive(ix, s, p.id, 'noZeroOn', (l) => l.includes(amb));
        log(s, `P${p.id} declares ${amb} (${marker})`, { ambition: amb, marker });
      }
      removeFromHand(p.hand, def.id);
      s.round.plays.push(play);
      s.round.leadSuit = def.suit;
      log(s, `P${p.id} leads ${def.id}`);
      s.phase = { type: 'actions', budget: { player: p.id, kinds: c.suits[def.suit], remaining: def.pips } };
      if (declared) for (const t of afterDeclare(ix, s, p.id, declared.amb, declared.was)) log(s, t);
      return;
    }

    case 'follow': {
      if (s.phase.type !== 'follow') err('Not the follow step');
      const leadSuit = s.round.leadSuit!;
      if (cmd.mode === 'event') {
        followWithEvent(ix, s, p.id, cmd.card, cmd.seizeWith, cmd.declare);
        return;
      }
      if (isEventCard(ix, cmd.card)) err('An Event card cannot Surpass, Pivot or Copy');
      if (cmd.seizeWith !== undefined && isEventCard(ix, cmd.seizeWith)) err('An Event card cannot be discarded to seize the initiative');
      const def = card(ix, p.hand, cmd.card);
      if (cmd.seizeWith !== undefined) {
        if (s.round.seizedBy !== null) err('Initiative already seized this round');
        if (cmd.seizeWith === cmd.card) err('Seize with a different card');
        card(ix, p.hand, cmd.seizeWith);
        removeFromHand(p.hand, cmd.seizeWith);
        toDiscard(s, [cmd.seizeWith], p.id);
        s.round.seizedBy = p.id;
        log(s, `P${p.id} seizes the initiative`);
      }
      let kinds: ActionKind[];
      let pips: number;
      if (cmd.mode === 'surpass') {
        if (def.suit !== leadSuit) err('Surpass needs the lead suit');
        if (def.number <= leadNumber(ix, s)) err('Surpass needs a number higher than the lead card');
        kinds = c.suits[leadSuit];
        pips = def.pips;
        // Surpassing with the seize number (the 7s) also seizes, unless already seized this round.
        if (c.seizeOnSurpassNumber === def.number && s.round.seizedBy === null) {
          s.round.seizedBy = p.id;
          log(s, `P${p.id} seizes the initiative by surpassing with a ${def.number}`);
        }
      } else if (cmd.mode === 'pivot') {
        if (def.suit === leadSuit) err('Pivot needs a different suit');
        // Pivot: one action of the played card's own suit.
        kinds = c.suits[def.suit];
        pips = 1;
      } else {
        kinds = c.suits[leadSuit];
        pips = 1;
      }
      let followDeclared: { amb: AmbitionId; was: boolean } | null = null;
      if (cmd.declare) {
        // A card may allow declaring on a Surpass or Pivot, before any action; the played card is not zeroed.
        if (cmd.mode === 'copy') err('Only a Surpass or Pivot can declare');
        if (!hasPassive(ix, s, p.id, 'declareOnFollow')) err('No card lets you declare when following');
        if (s.round.declarations > 0) err('An ambition was already declared this round');
        const fixed = ambitionForNumber(c, def.number) ?? err(`Card number ${def.number} cannot declare`);
        if (fixed === 'any' && !cmd.ambition) err('Choose which ambition to declare');
        if (fixed !== 'any' && cmd.ambition && cmd.ambition !== fixed) err(`Card number ${def.number} declares ${fixed}`);
        if (!s.ambitions.available.length) err('No ambition markers left');
        const amb: AmbitionId = fixed === 'any' ? cmd.ambition! : fixed;
        const paid = payDeclareCost(ix, s, p.id, cmd.give);
        if (paid) log(s, paid);
        followDeclared = { amb, was: s.ambitions.declared[amb].length === 0 };
        const marker = declareAmbition(s, amb);
        s.round.declarations += 1;
        log(s, `P${p.id} declares ${amb} (${marker}) while following`, { ambition: amb, marker });
      }
      removeFromHand(p.hand, def.id);
      s.round.plays.push({ player: p.id, card: def.id, mode: cmd.mode, faceUp: cmd.mode !== 'copy', seized: cmd.seizeWith !== undefined });
      log(s, cmd.mode === 'copy' ? `P${p.id} copies with a card face down` : cmd.mode === 'pivot' ? `P${p.id} pivots with ${def.id}` : `P${p.id} surpasses with ${def.id}`);
      s.phase = { type: 'actions', budget: { player: p.id, kinds, remaining: pips } };
      if (followDeclared) for (const t of afterDeclare(ix, s, p.id, followDeclared.amb, followDeclared.was)) log(s, t);
      return;
    }

    case 'action': {
      if (s.phase.type !== 'actions') err('Not the action step');
      const b = s.phase.budget;
      if (b.remaining < 1) err('No actions left');
      const kind = actionKindOf(ix, cmd.action);
      if (!b.kinds.includes(kind)) err(`Action ${kind} not allowed by this card`);
      endPrelude(s, b);
      b.acted = true;
      const a = cmd.action;
      // Leaders' Copy/Pivot options (only on actions paid with a pip).
      const cp = copiedOrPivoted(s, p.id);
      const allow = (flag: 'influenceTwiceOnCopyPivot' | 'influenceWithSecureOnCopyPivot' | 'moveWithBattleOnCopyPivot', what: string) => {
        if (!cp || !hasPassive(ix, s, p.id, flag)) err(`Only a card lets you ${what}, on a turn you Copy or Pivot`);
      };
      let pre = '';
      if (a.kind === 'influence' && a.twice !== undefined) allow('influenceTwiceOnCopyPivot', 'influence twice');
      if (a.kind === 'secure' && a.influence) {
        allow('influenceWithSecureOnCopyPivot', 'influence with a secure');
        if (a.influence.when === 'before') pre = HANDLERS.influence(ix, s, p.id, { kind: 'influence', courtSlot: a.influence.courtSlot }).text + '; ';
      }
      if (a.kind === 'battle' && a.tactical) {
        allow('moveWithBattleOnCopyPivot', 'move with a battle');
        if (a.tactical.move.kind !== 'move') err('The extra action is a move');
        if (a.tactical.when === 'before') pre = performAction(ix, s, p.id, a.tactical.move).text + '; ';
        else b.afterBattleMove = a.tactical.move as unknown as Record<string, unknown>;
      }
      const r = performAction(ix, s, p.id, a);
      r.text = pre + r.text;
      if (a.kind === 'influence' && a.twice !== undefined) r.text += '; ' + HANDLERS.influence(ix, s, p.id, { kind: 'influence', courtSlot: a.twice }).text;
      if (a.kind === 'secure' && a.influence?.when === 'after') r.text += '; ' + HANDLERS.influence(ix, s, p.id, { kind: 'influence', courtSlot: a.influence.courtSlot }).text;
      b.remaining -= 1;
      if (cmd.action.kind === 'tax') r.text += taxBonus(ix, s, p.id);
      log(s, r.text, r.roll);
      awaitAllocation(s, r);
      return;
    }

    case 'prelude': {
      if (s.phase.type !== 'actions') err('Not the action step');
      if (s.phase.budget.preludeOver) err('The prelude is over: resources are spent before using any pip of the card');
      const idx = p.resources.indexOf(cmd.resource);
      if (idx < 0) err(`No ${cmd.resource} to spend`);
      // Spent as another type: that type's prelude action (court rulings, card-effects.md).
      const as = cmd.as ?? cmd.resource;
      const spendAsCard = hasPassive(ix, s, p.id, 'spendAs', (t) => t === as);
      if (as !== cmd.resource && !spendAsCard) err(`No card lets you spend resources as ${as}`);
      if (!spendAsCard && p.outraged.includes(cmd.resource)) err(`${cmd.resource} is Outraged: it cannot be spent in the prelude`);
      s.phase.budget.acted = true;
      const rule = c.resourceActions[as];
      if ('grantKind' in rule) {
        if (cmd.action) err(`${as} takes no action now: it lets this turn's card ${rule.grantKind}`);
        if (!s.phase.budget.kinds.includes(rule.grantKind)) s.phase.budget.kinds = [...s.phase.budget.kinds, rule.grantKind];
        (s.phase.budget.spentInPrelude ??= []).push(takeResourceAt(p, idx));
        log(s, `P${p.id} spends ${cmd.resource}: this turn the card also allows ${rule.grantKind}`);
        return;
      }
      if (!cmd.action) err(`Choose the action ${as} pays for`);
      const allowed = 'leadSuit' in rule ? c.suits[s.round.leadSuit!] : rule.actions;
      const kind = actionKindOf(ix, cmd.action);
      if (!allowed.includes(kind)) err(`${as} cannot pay for ${kind}`);
      const r = performAction(ix, s, p.id, cmd.action);
      (s.phase.budget.spentInPrelude ??= []).push(takeResourceAt(p, idx));
      log(s, `${r.text} (spending ${cmd.resource})`, r.roll);
      awaitAllocation(s, r);
      return;
    }

    case 'ability': {
      if (s.phase.type !== 'actions') err('Prelude abilities are used on your turn, after playing your card');
      const b = s.phase.budget;
      if (b.preludeOver) err('The prelude is over: prelude abilities come before using any pip of the card');
      if (!ownedEffects(ix, s, p.id).some((o) => o.card === cmd.card)) err(`You do not have ${cmd.card}`);
      const ab = effectOf(ix, cmd.card)?.prelude?.[cmd.ability] ?? err(`${cmd.card} has no prelude ability '${cmd.ability}'`);
      if (b.securedInPrelude?.includes(cmd.card)) err(`${cmd.card} was secured in this prelude: its prelude abilities wait for a later turn`);
      if (ab.beforeAnyAction && b.acted) err(`${cmd.card}: only before any other actions this turn`);
      if (ab.whileDeclared && !isDeclared(s, ab.whileDeclared)) err(`${cmd.card}: only while ${ab.whileDeclared} is declared`);
      const key = `${cmd.card}:${cmd.ability}`;
      if (ab.oncePerTurn && b.usedOnce?.includes(key)) err(`${cmd.card}: once per turn`);
      if (ab.discardSelf) discardOwnCard(s, p.id, cmd.card);
      const text = ab.run({ ix, state: s, player: p.id, card: cmd.card, args: cmd.args ?? {} });
      if (ab.oncePerTurn) (b.usedOnce ??= []).push(key);
      b.acted = true;
      log(s, `P${p.id} uses ${cmd.card} (${cmd.ability}): ${text}`);
      awaitAllocation(s, { text });
      return;
    }

    case 'decide': {
      if (s.phase.type !== 'decide') err('No choice is pending');
      const { decision, resume } = s.phase;
      s.phase = resume;
      if (decision.effect === 'collectDice') {
        const setup = s.battleSetup ?? err('No battle is waiting for dice');
        const dice = (cmd.args?.dice as DicePool | undefined) ?? setup.dice;
        const r = collectAndRoll(ix, s, setup, dice, setup.attackerAllFresh, `P${p.id} collects dice against P${setup.target} at ${setup.system}`);
        s.battleSetup = null;
        log(s, r.text, r.roll);
        awaitAllocation(s, r);
        return;
      }
      if (isEventDecision(decision)) {
        log(s, `P${p.id} ${decideEvent(ix, s, p.id, decision, cmd.args ?? {})}`);
        runEvent(ix, s, () => afterRound(ix, s));
        return;
      }
      let text: string;
      if (decision.effect === 'whenSecured') text = resolveWhenSecured(ix, s, p.id, decision.card, cmd.args ?? {});
      else {
        const h = effectOf(ix, decision.card)?.triggers?.[decision.effect] ?? err(`Unknown decision ${decision.effect}`);
        text = h({ ix, state: s, player: p.id, card: decision.card, args: cmd.args ?? {}, data: decision.data });
      }
      log(s, `P${p.id} resolves ${decision.card}: ${text}`);
      return;
    }

    case 'reroll': {
      if (s.phase.type !== 'allocate') err('Rerolls come after rolling, before allocating');
      log(s, rerollDice(ix, s, s.phase.battle, p.id, cmd.card, cmd.dice), s.phase.battle.faces);
      return;
    }

    case 'allocate': {
      if (s.phase.type !== 'allocate') err('No battle to allocate');
      const { battle, budget } = s.phase;
      log(s, applyAllocation(ix, s, battle, cmd.allocation), cmd.allocation);
      s.phase = { type: 'actions', budget };
      if (budget.afterBattleMove) {
        const move = budget.afterBattleMove as unknown as MovePayload;
        budget.afterBattleMove = undefined;
        log(s, performAction(ix, s, p.id, move).text + ' (after the battle)');
      }
      return;
    }

    case 'endTurn': {
      if (s.phase.type !== 'actions') err('Not the action step');
      endPrelude(s, s.phase.budget);
      rescueIfEliminated(ix, s, p.id, cmd.rescueGate);
      advanceAfterTurn(ix, s, p.id);
      return;
    }
  }
}

/**
 * Elimination (rulebook "Fine Print"): a player ending the turn with no ships
 * and no starports on the map places 3 fresh ships (or as many as they have)
 * in a gate of their choice.
 */
function rescueIfEliminated(ix: ContentIndex, s: GameState, p: PlayerId, gate: string | undefined): void {
  const present = Object.values(s.map).some((x) => (x.ships[p] && x.ships[p].fresh + x.ships[p].damaged > 0) || x.buildings.some((b) => b.owner === p && b.type === 'starport'));
  if (present) {
    if (gate !== undefined) err('Only a player with no ships and no starports on the map places rescue ships');
    return;
  }
  if (gate === undefined) err('No ships or starports left: choose a gate for 3 fresh ships');
  const def = ix.content.map.systems.find((x) => x.id === gate);
  if (!def || def.kind !== 'gate' || !s.map[gate].inPlay) err(`${gate} is not an in-play gate`);
  const pl = s.players[p];
  const n = Math.min(ix.content.rescueShips ?? 3, pl.supply.ships);
  pl.supply.ships -= n;
  const st = (s.map[gate].ships[p] ??= { fresh: 0, damaged: 0 });
  st.fresh += n;
  log(s, `P${p} has no ships or starports: places ${n} ships at ${gate}`);
}

/** Ends the prelude (first pip spent or turn over): resources spent in it go back to the supply now. */
function endPrelude(s: GameState, b: TurnBudget): void {
  if (b.preludeOver) return;
  b.preludeOver = true;
  returnToSupply(s, ...(b.spentInPrelude ?? []));
  b.spentInPrelude = [];
}

function awaitAllocation(s: GameState, r: ActionResult): void {
  if (r.pendingBattle && s.phase.type === 'actions') s.phase = { type: 'allocate', battle: r.pendingBattle, budget: s.phase.budget };
}

/** Act setup step K (p. 6): the cards left after dealing (and the mulligan) go to the action discard. */
function discardUndealt(s: GameState): void {
  if (!s.campaign?.discardUndealt) return;
  delete s.campaign.discardUndealt;
  toDiscard(s, s.deck.splice(0));
}

/**
 * Following with an Event card (campaign rulebook p. 12): "you may take
 * actions exactly like you played the lead card" (its suit and pips).
 * "However, your Event card gives you no actions if another Event card was
 * played earlier this round or if the Imperial Council was secured earlier
 * this round" (Prelude actions still allowed). It cannot be discarded to
 * seize, nor declare an ambition.
 */
function followWithEvent(ix: ContentIndex, s: GameState, p: PlayerId, cardId: string, seizeWith: string | undefined, declare: boolean | undefined): void {
  const pl = s.players[p];
  if (!isEventCard(ix, cardId)) err(`${cardId} is not an Event card`);
  if (!pl.hand.includes(cardId)) err(`Card ${cardId} not in hand`);
  if (declare) err('An Event card cannot declare an ambition');
  if (seizeWith !== undefined) {
    if (isEventCard(ix, seizeWith)) err('An Event card cannot be discarded to seize the initiative');
    if (s.round.seizedBy !== null) err('Initiative already seized this round');
    card(ix, pl.hand, seizeWith);
    removeFromHand(pl.hand, seizeWith);
    toDiscard(s, [seizeWith], p);
    s.round.seizedBy = p;
    log(s, `P${p} seizes the initiative`);
  }
  const lead = ix.actionCards.get(s.round.plays.find((x) => x.mode === 'lead')!.card!)!;
  const none = s.round.eventBy !== undefined || s.campaign?.councilTucked !== undefined;
  removeFromHand(pl.hand, cardId);
  s.round.eventBy ??= p;
  s.round.plays.push({ player: p, card: cardId, mode: 'event', faceUp: true, seized: seizeWith !== undefined });
  log(s, none ? `P${p} plays an Event card: no actions (an Event or the Imperial Council came first this round)` : `P${p} plays an Event card like the lead card`);
  s.phase = { type: 'actions', budget: { player: p, kinds: ix.content.suits[s.round.leadSuit!], remaining: none ? 0 : lead.pips } };
}

/** The lead card's number: what a Surpass must beat (0 once an ambition is declared on it). */
function leadNumber(ix: ContentIndex, s: GameState): number {
  const lead = s.round.plays.find((pl) => pl.mode === 'lead')!;
  return lead.zeroed ? 0 : ix.actionCards.get(lead.card!)!.number;
}

function advanceAfterTurn(ix: ContentIndex, s: GameState, current: PlayerId): void {
  const n = s.playerCount;
  let next = (current + 1) % n;
  while (next !== s.round.leader) {
    if (s.players[next].hand.length > 0) {
      s.phase = { type: 'follow', next };
      return;
    }
    s.round.plays.push({ player: next, card: null, mode: 'pass', faceUp: false });
    log(s, `P${next} has no cards and passes`);
    next = (next + 1) % n;
  }
  endRound(ix, s);
}

/** Initiative after a round: seizer, else highest face-up lead-suit card. */
export function roundWinner(ix: ContentIndex, s: GameState): PlayerId {
  if (s.round.seizedBy !== null) return s.round.seizedBy;
  let winner = s.round.leader;
  let best = -Infinity;
  for (const pl of s.round.plays) {
    if (!pl.card || !pl.faceUp || pl.mode === 'pivot' || pl.mode === 'event') continue;
    const def = ix.actionCards.get(pl.card)!;
    if (def.suit !== s.round.leadSuit) continue;
    const v = pl.zeroed ? 0 : def.number;
    if (v > best) {
      best = v;
      winner = pl.player;
    }
  }
  return winner;
}

function endRound(ix: ContentIndex, s: GameState): void {
  s.initiative = roundWinner(ix, s);
  // Guild cards placed next to a played card: the owner takes that card into hand, the Guild card is discarded.
  const taken = new Set<string>();
  for (const a of s.round.attached ?? []) {
    s.players[a.owner].hand.push(a.actionCard);
    s.courtDiscard.push(a.guild);
    taken.add(a.actionCard);
    log(s, `P${a.owner} takes ${a.actionCard} into hand (${a.guild})`);
  }
  for (const pl of s.round.plays) if (pl.card && !taken.has(pl.card)) toDiscard(s, [pl.card], pl.faceUp ? undefined : pl.player);
  // Campaign p. 14: the secured Imperial Council goes back to the Court, Decided (its four steps resolve from M2).
  const council = returnCouncil(s);
  if (council !== null) log(s, `The Imperial Council returns to the Court, Decided; P${council} resolves it`);
  // p. 13: "If the Imperial Council is secured during the same round as any Event cards are played, resolve the Council".
  if (s.campaign && council !== null) s.campaign.pendingEvent = { kind: 'council', player: council };
  else if (s.campaign && s.round.eventBy !== undefined) s.campaign.pendingEvent = { kind: 'event', player: s.initiative };
  log(s, `Round ends; initiative to P${s.initiative}`);
  resetRound(s);
  // Campaign p. 13: the event resolves "just after checking whether initiative changes", before the next lead.
  s.phase = { type: 'lead' };
  startEvent(s);
  runEvent(ix, s, () => afterRound(ix, s));
}

/** After the round (and its event, if any): the initiative holder leads, or passes when out of cards. */
function afterRound(ix: ContentIndex, s: GameState): void {
  if (s.players[s.initiative].hand.length === 0) passInitiative(ix, s, s.initiative);
  else s.phase = { type: 'lead' };
}

/**
 * Gives the initiative to the next clockwise player with cards and starts a
 * new round; ends the chapter when nobody has cards left.
 */
function passInitiative(ix: ContentIndex, s: GameState, from: PlayerId): void {
  for (let i = 1; i <= s.playerCount; i++) {
    const next = (from + i) % s.playerCount;
    if (s.players[next].hand.length > 0) {
      s.initiative = next;
      resetRound(s);
      s.phase = { type: 'lead' };
      log(s, `Initiative passes to P${next}`);
      return;
    }
  }
  endChapter(ix, s);
}

/** Highest power; ties per `tieBreak` (turn order starts at the initiative holder). */
export function gameWinners(tieBreak: 'shared' | 'turnOrder', s: GameState): PlayerId[] {
  const top = Math.max(...s.players.map((p) => p.power));
  const tied = s.players.filter((p) => p.power === top).map((p) => p.id);
  if (tieBreak === 'shared' || tied.length === 1) return tied;
  for (let i = 0; i < s.playerCount; i++) {
    const seat = (s.initiative + i) % s.playerCount;
    if (tied.includes(seat)) return [seat];
  }
  return tied;
}

function resetRound(s: GameState): void {
  s.round = { leader: s.initiative, leadSuit: null, plays: [], declarations: 0, seizedBy: null };
}

/** Scores ambitions, checks game end, otherwise starts the next chapter. */
export function endChapter(ix: ContentIndex, s: GameState): void {
  const c = ix.content;
  const { rankings, gains } = scoreAmbitions(c, s, (p, a) => {
    const fx = ownedEffects(ix, s, p).map((f) => f.effect);
    return { secondOnFirst: fx.some((e) => e.scoringSecondOnFirst?.includes(a)), firstOnly: fx.some((e) => e.scoringFirstOnly) };
  }, (p, a) => cartelMetric(ix, s, p, a));
  log(s, `Chapter ${s.chapter} ends; power gained ${gains.join('/')}`, rankings);
  afterScoring(ix, s);
  cleanUp(ix, s);
  for (const p of s.players) {
    toDiscard(s, p.hand, p.id);
    p.hand = [];
  }
  s.ambitions = emptyAmbitionBoard(c, s.chapter + 1);

  const target = c.powerToWin[s.playerCount];
  // Campaign p. 8: an Act lasts its chapters; "Power thresholds do not end an Act early". (The Intermission comes with M4.)
  const acts = s.campaign ? c.campaign?.acts : undefined;
  const reached = !acts && s.players.some((p) => p.power >= target);
  const chapters = acts ? acts[(['I', 'II', 'III'] as const)[s.campaign!.act - 1]].chapters : c.chapters;
  if (reached || s.chapter >= chapters) {
    s.phase = { type: 'gameOver', winners: gameWinners(c.gameEndTieBreak, s) };
    log(s, `Game over; winners ${s.phase.winners.map((w) => 'P' + w).join(', ')}`);
    return;
  }
  startChapter(ix, s);
}

/**
 * Resources kept off the player board that count toward an ambition: on the
 * player's cards, and in the campaign the Imperial Trust on the First Regent
 * tile (campaign rulebook p. 27: "count everything in your play area,
 * including on cards and on tiles such as the First Regent tile"; "Frozen
 * resources still add to your ambitions!").
 */
export function cartelMetric(ix: ContentIndex, s: GameState, p: PlayerId, a: AmbitionId): number {
  const m = ix.content.ambitionMetrics[a];
  if (m.kind !== 'resources') return 0;
  const kept = cartelSupply(ix, s, p);
  const wanted = m.resources ?? [];
  const trust = s.campaign?.firstRegent === p ? s.campaign.trust.filter((r) => wanted.includes(r)).length : 0;
  return wanted.reduce((n, r) => n + (kept[r] ?? 0), 0) + trust;
}

/** Card effects right after scoring: discarding resources (design/gdd/card-effects.md "Scoring"). */
function afterScoring(ix: ContentIndex, s: GameState): void {
  const discardAll = (p: PlayerId, r: Resource) => {
    const pl = s.players[p];
    let n = 0;
    pl.resources.forEach((x, i) => {
      if (x === r) {
        returnToSupply(s, takeResourceAt(pl, i));
        n++;
      }
    });
    if (n) log(s, `P${p} discards ${n} ${r}`);
  };
  for (const pl of s.players) {
    for (const { effect } of ownedEffects(ix, s, pl.id)) {
      const d = effect.afterScoringDiscard;
      if (d && (!d.ifScored || s.ambitions.declared[d.ifScored].length > 0)) discardAll(pl.id, d.resource);
      const r = effect.afterScoringRivalsDiscard;
      if (r) for (const other of s.players) if (other.id !== pl.id) discardAll(other.id, r);
    }
  }
}

/**
 * Cleanup (design/gdd/core-loop.md §3.8): if the trophy ambition was scored,
 * every trophy returns to its owner; if the captive ambition was scored, every
 * captive does. Cities go back on the board (covering a slot again).
 */
function cleanUp(ix: ContentIndex, s: GameState): void {
  const c = ix.content;
  const scored = (kind: 'trophies' | 'captives') =>
    AMBITIONS.some((a) => c.ambitionMetrics[a].kind === kind && s.ambitions.declared[a].length > 0);
  if (scored('trophies')) {
    for (const p of s.players) {
      for (const t of p.trophies) returnPiece(ix, s, t.owner, t.piece);
      p.trophies = [];
    }
    log(s, 'Trophies return to their owners');
  }
  if (scored('captives')) {
    for (const p of s.players) {
      for (const owner of p.captives) s.players[owner].supply.agents += 1;
      p.captives = [];
    }
    log(s, 'Captives return to their owners');
  }
}

/** Next chapter: gather and shuffle all action cards, deal hands, reset round. */
export function startChapter(ix: ContentIndex, s: GameState): void {
  const c = ix.content;
  s.chapter += 1;
  s.ambitions = emptyAmbitionBoard(c, s.chapter);
  s.deck = shuffle(s, [...s.deck, ...s.discard]);
  s.discard = [];
  delete s.discardHidden;
  for (const p of s.players) {
    if (s.deck.length < c.handSize) throw new Error('Deck too small to deal');
    p.hand = s.deck.splice(0, c.handSize);
  }
  resetRound(s);
  s.consecutivePasses = 0;
  // 2 players: after each draw, the player without initiative may redraw once.
  s.mulligan = s.playerCount === 2 ? (s.initiative + 1) % 2 : null;
  s.phase = { type: 'lead' };
  log(s, `Chapter ${s.chapter} begins; P${s.initiative} has initiative`);
}

/** True if the player's card this turn was played as a Copy or a Pivot. */
function copiedOrPivoted(s: GameState, p: PlayerId): boolean {
  const mine = [...s.round.plays].reverse().find((x) => x.player === p);
  return mine?.mode === 'copy' || mine?.mode === 'pivot';
}

/** A card granting a resource with each tax on a turn the player Copied or Pivoted. */
function taxBonus(ix: ContentIndex, s: GameState, p: PlayerId): string {
  if (!copiedOrPivoted(s, p)) return '';
  let text = '';
  for (const { card, effect } of ownedEffects(ix, s, p)) {
    const r = effect.taxBonusOnCopyPivot;
    if (r && gainFromSupply(ix.content, s, s.players[p], r)) text += `; also gains 1 ${r} (${card})`;
  }
  return text;
}

/** Discards a card from the player's play area: Guild cards to the Court discard, lore out of the game. */
export function discardOwnCard(s: GameState, p: PlayerId, card: string): void {
  const pl = s.players[p];
  if (pl.court.includes(card)) {
    pl.court.splice(pl.court.indexOf(card), 1);
    s.courtDiscard.push(card);
  } else if (pl.lore.includes(card)) {
    pl.lore.splice(pl.lore.indexOf(card), 1);
    (s.loreDiscard ??= []).push(card);
  } else err(`${card} cannot be discarded`);
}

function card(ix: ContentIndex, hand: string[], id: string) {
  if (!hand.includes(id)) err(`Card ${id} not in hand`);
  return ix.actionCards.get(id)!;
}

function removeFromHand(hand: string[], id: string): void {
  hand.splice(hand.indexOf(id), 1);
}

function log(s: GameState, text: string, data?: unknown): void {
  s.log.push({ chapter: s.chapter, text, data });
}

function err(msg: string): never {
  throw new RuleError(msg);
}
