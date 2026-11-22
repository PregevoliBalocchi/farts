// Card effect system (design/gdd/card-effects.md, "Effect system").
//
// Content names an effect id on a Court, leader or lore card; code registers
// what that id does in an EffectRegistry injected through indexContent (never
// a global). The engine asks the registry at fixed timing points:
//
//   prelude      — "Prelude:" abilities, usable on your turn from playing your
//                  card until the first card pip (command 'ability')
//   actions      — new actions "Name (Kind)", paid like a standard action of
//                  that kind (action payload { kind: 'card' })
//   whenSecured  — Vox cards: resolved when secured or ransacked, through a
//                  Decision when the effect needs a choice
//   passives     — flags and modifiers read by the rules (spend-as, keep on
//                  Outrage, steal protection, declaration rules)
//
// A card without a registered effect is logged for manual resolution, so
// missing effects never block play.

import type { ContentIndex } from './setup';
import type { ActionResult } from './actions';
import type { ActionKind, AmbitionId, DieType, GameState, PlayerId, Resource } from './types';

/** What an effect handler receives. `args` comes from the player's command. */
export interface EffectContext {
  ix: ContentIndex;
  state: GameState;
  /** Player using or owning the card. */
  player: PlayerId;
  /** Content id of the card. */
  card: string;
  /** The player's choices, shaped by each effect (validated by the handler). */
  args: Record<string, unknown>;
  /** What a Decision offered (e.g. cards drawn to choose from). */
  data?: Record<string, unknown>;
}

/** What happened, for triggers deciding whether they apply. */
export interface TriggerEvent {
  battle?: { attacker: PlayerId; target: PlayerId; system: string; attackerTookTrophies?: boolean };
  declared?: { ambition: AmbitionId; wasUndeclared: boolean };
}

/** Mutates the state and returns a log line. Throw RuleError to reject (the state is rolled back). */
export type EffectHandler = (ctx: EffectContext) => string;

/** A "Prelude:" ability. */
export interface PreludeAbility {
  /** "Before any other actions": only while nothing else was done this turn. */
  beforeAnyAction?: boolean;
  /** Usable once per turn. */
  oncePerTurn?: boolean;
  /** The card is discarded to use it (Guild → Court discard, lore → out of the game). */
  discardSelf?: boolean;
  /** Ambition that must be declared this chapter ("While X is declared"). */
  whileDeclared?: AmbitionId;
  run: EffectHandler;
}

/** A new action "Name (Kind)": usable instead of a standard action of `as`, paid the same way. */
export interface CardAction {
  as: ActionKind;
  oncePerTurn?: boolean;
  whileDeclared?: AmbitionId;
  /** Returns a log line, or a full result (e.g. a "like in a battle" roll waiting for allocation). */
  run: (ctx: EffectContext) => string | ActionResult;
}

/** A reroll ability: after rolling in battle, reroll some dice once per battle (all together). */
export interface RerollAbility {
  /** Only dice of this type (any type when omitted). */
  die?: DieType;
  /** How many dice at most. */
  limit: 'weaponIcons' | 'freshAttackers' | 'resourceTypes' | 'any';
  whileDeclared?: AmbitionId;
}

/** Everything a card can do. Every field is optional. */
export interface CardEffect {
  prelude?: Record<string, PreludeAbility>;
  actions?: Record<string, CardAction>;
  /** Vox: resolved when secured or ransacked. `choice: true` waits for a Decision (args may be empty = decline). */
  whenSecured?: { choice?: boolean; run: EffectHandler };
  /** Vox: where the card goes after resolving (default: Court discard). */
  afterSecured?: 'discard' | 'shuffleIntoDeck';
  // ---- passives ----
  /** Any resource may be spent as this type; Outrage is ignored when spending this type in the prelude. */
  spendAs?: Resource;
  /** Not discarded when its owner Provokes Outrage of its type. */
  keepOnOutrage?: boolean;
  /** Rivals cannot steal the owner's resources and other Guild cards; if this card is stolen it is buried. */
  guardsSteals?: boolean;
  /** While this ambition is declared, Rivals cannot steal from the owner resources of types they already hold. */
  guardResourcesWhile?: AmbitionId;
  /** While this ambition is declared, Rivals cannot steal the owner's Guild cards of a type the owner holds as a resource. */
  guardGuildWhile?: AmbitionId;
  /** Declaring these ambitions does not zero the played card. */
  noZeroOn?: AmbitionId[];
  /** When surpassing or pivoting, may declare the played card's ambition if none was declared this round; no zero. */
  declareOnFollow?: boolean;

  // ---- battle (not for "like in a battle" effects) ----
  /** Attacking: extra dice beyond one per ship (only when battling in a gate, if `inGate`). */
  extraDice?: { count: number; inGate?: boolean; mandatory?: boolean };
  /** Attacking: up to this many raid dice even when the defender has no buildings in the system. */
  raidDiceWithoutBuildings?: number;
  /** Attacking: cannot collect more assault dice than skirmish dice. */
  assaultCappedBySkirmish?: boolean;
  /** Defending: the attacker cannot collect raid dice while you have a fresh starport there. */
  freshStarportStopsRaid?: boolean;
  /** Defending: before dice are collected, the attacker takes 1 hit if any of your defending ships is fresh. */
  hitAttackerIfFresh?: boolean;
  /** Defending: add 1 intercept to the attacker's roll if they rolled any assault dice. */
  interceptOnAssault?: boolean;
  /** Attacking: ignore 1 rolled intercept if every attacking ship was fresh at the start of the battle. */
  ignoreInterceptIfAllFresh?: boolean;
  /** Defending: intercept deals 1 hit per Weapon icon you have instead of per fresh ship; then you discard 1 Weapons. */
  interceptByWeapons?: boolean;
  /** Attacking: a reroll ability. */
  reroll?: RerollAbility;
  /** After battling as the attacker: repair this many Loyal attacking ships. */
  repairAfterAttack?: number;
  /** After any battle with you: repair 1 Loyal ship there per starport on the map in systems you control. */
  repairPerStarport?: boolean;
  /** Rivals battling you cannot Ransack the Court. */
  noRansackWhenBattled?: boolean;
  /** Ships you build are always fresh. */
  buildShipsFresh?: boolean;
  /** You cannot move more than this many ships at a time. */
  maxShipsPerMove?: number;

  // ---- tax / build / move ----
  /** While this ambition is declared: tax any cities, build ships and Catapult with any starports, as if Loyal (no Captives). */
  actAsLoyalWhile?: AmbitionId;
  /** While this ambition is declared: cities already taxed this turn may be taxed again. */
  retaxWhile?: AmbitionId;
  /** On a turn you Copy or Pivot, each standard tax also gains 1 of this resource. */
  taxBonusOnCopyPivot?: Resource;
  /** You cannot tax any city in a system you do not control (overrides cards that ignore control). */
  taxNeedsControl?: boolean;
  /** You cannot tax your own cities. */
  cannotTaxLoyal?: boolean;
  /** Where you have ships: tax Rival cities ignoring control, and tax empty building slots like your cities. */
  taxWithShips?: boolean;
  /** Once per turn: hit the city you taxed, or the starport that built your ship, to take that action again with it. */
  hitToRepeat?: boolean;
  /** After taxing a city on a planet: may place one of your resources over its type, changing it for good (once per planet). */
  reshapePlanets?: boolean;
  /** Catapult moves start only from gates, never from starports. */
  catapultFromGatesOnly?: boolean;
  /** Fresh ships you move may each move one step more, after any Catapult (move payload `then`). */
  extraStep?: boolean;
  /** You may build starports on gates, max 1 per gate. */
  gateStarports?: boolean;
  /** Rivals moving ships into a gate you control with your fresh starport there lose 1 agent to you as a Captive. */
  captureOnGateEntry?: boolean;
  /** You may build cities on gates, max 1 per gate; such a city has every city type of its cluster. */
  gateCities?: boolean;
  /** You may build cities on planets outside their slots, max 1 per planet, paying 1 resource of the planet type. */
  citiesOutsideSlots?: boolean;
  /**
   * Optional reactions answered through a Decision, by trigger name:
   * 'beforeDice' (defending, before the attacker collects dice),
   * 'afterDefending' (after a battle in which you defended).
   * Each returns a log line; empty args = decline.
   */
  triggers?: Record<string, EffectHandler>;
  /** Whether a trigger applies now (defaults to always); used before queuing its Decision. */
  triggerWhen?: Record<string, (ctx: Omit<EffectContext, 'args'> & TriggerEvent) => boolean>;
  /** Mandatory effects resolved at once on a trigger ('onDeclare': args = { ambition, wasUndeclared }). */
  autoTriggers?: Record<string, EffectHandler>;

  // ---- declaring ----
  /** To declare, you must give 1 Guild card to the Rival with the least Power (`give` on the declaring command). */
  declareCostGuildToWeakest?: boolean;

  // ---- Copy / Pivot (actions paid with a pip on a turn you Copied or Pivoted) ----
  /** Influencing: may influence a second time (`twice`). */
  influenceTwiceOnCopyPivot?: boolean;
  /** Securing: may influence before or after (`influence`). */
  influenceWithSecureOnCopyPivot?: boolean;
  /** Battling: may move before or after the battle (`tactical`). */
  moveWithBattleOnCopyPivot?: boolean;
  /** You cannot secure Guild cards with only 1 of your agents on them (Ransack is unaffected). */
  noSecureGuildWithOneAgent?: boolean;

  // ---- scoring ----
  /** Scoring these ambitions: no Power for second place; first place gains the second-place value, no city bonus. */
  scoringSecondOnFirst?: AmbitionId[];
  /** Scoring: Power only for an untied first place. */
  scoringFirstOnly?: boolean;
  /** After scoring: discard all of a resource (only if `ifScored` was declared this chapter, when given). */
  afterScoringDiscard?: { resource: Resource; ifScored?: AmbitionId };
  /** After scoring: every Rival discards all of this resource. */
  afterScoringRivalsDiscard?: Resource;
  /**
   * The general supply of this resource is kept on the card: its owner has
   * those tokens for ambitions and anything counting what they have, but
   * cannot spend, discard or lose them, and nobody can steal them. Gaining
   * that resource from the supply takes it from the card.
   */
  keepsSupply?: Resource;

  // ---- setup (leaders) ----
  setup?: {
    /** Agents placed on these Outrage slots. */
    outrage?: Resource[];
    /** Pieces scrapped from your supply (cities from the left of your board). */
    scrapShips?: number;
    scrapAgents?: number;
    scrapCities?: number;
    /** After setup: draw this many lore cards, keep some, scrap the rest (Decision 'setupLore'). */
    extraLore?: { draw: number; keep: number };
  };
}

/** effect id -> effect. */
export type EffectRegistry = Record<string, CardEffect>;

/** Effect ids of every card a player has: leader, lore, Guild cards in play area. */
export function ownedEffects(ix: ContentIndex, s: GameState, p: PlayerId): { card: string; effect: CardEffect }[] {
  const pl = s.players[p];
  const out: { card: string; effect: CardEffect }[] = [];
  const add = (card: string, id: string | undefined) => {
    const e = id ? ix.effects[id] : undefined;
    if (e) out.push({ card, effect: e });
  };
  if (pl.leader) add(pl.leader, ix.content.leaders?.find((l) => l.id === pl.leader)?.effect ?? pl.leader);
  for (const id of pl.lore) add(id, ix.content.loreCards?.find((l) => l.id === id)?.effect ?? id);
  for (const id of pl.court) add(id, ix.courtCards.get(id)?.effect);
  return out;
}

/** The effect registered for a card id (Court, leader or lore), if any. */
export function effectOf(ix: ContentIndex, card: string): CardEffect | undefined {
  const id =
    ix.courtCards.get(card)?.effect ??
    ix.content.loreCards?.find((l) => l.id === card)?.effect ??
    ix.content.leaders?.find((l) => l.id === card)?.effect ??
    card;
  return ix.effects[id];
}

/** True if any card the player has sets this passive. */
export function hasPassive<K extends keyof CardEffect>(ix: ContentIndex, s: GameState, p: PlayerId, key: K, match?: (v: NonNullable<CardEffect[K]>) => boolean): boolean {
  return ownedEffects(ix, s, p).some(({ effect }) => effect[key] !== undefined && (!match || match(effect[key] as NonNullable<CardEffect[K]>)));
}

/** "While X is declared": the ambition holds a marker this chapter. */
export function isDeclared(s: GameState, a: AmbitionId): boolean {
  return s.ambitions.declared[a].length > 0;
}
