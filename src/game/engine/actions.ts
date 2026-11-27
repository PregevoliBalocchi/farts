// Individual actions taken with card pips or prelude resources.
// Rules confirmed by the owner: design/gdd/core-loop.md §3.4–3.5.

import { rollDice, totalFaces } from './dice';
import { nextInt } from './rng';
import { shuffle } from './rng';
import { RuleError } from './errors';
import { buildsDamaged, catapultStops, commandsImperial, controlsOnTurn, imperialCount, isCouncil, securable, secureCouncil, truceForbids } from './campaign';
import { effectOf, isDeclared, ownedEffects } from './effects';
import { cartelSupply, cityTypes, isPlayer, planetType, provokeOutrage, returnPiece, stealBlocked, weaponIcons } from './ops';
import type { CardEffect, RerollAbility } from './effects';
import { gainFromSupply, gainResource, onCityReturned, returnToSupply, slotKeys, takeResourceAt } from './board';
import type { DicePool, DiceTotals, RollResult } from './dice';
import type { ContentIndex } from './setup';
import type { ActionKind, BattleRef, Building, Defender, GameState, Owner, PlayerId, Resource, ShipStack, SystemState, TurnBudget } from './types';

/** Parameters of one action. */
export type ActionPayload =
  /** `twice`: a second Court slot to influence (a leader's Copy/Pivot option). */
  | { kind: 'influence'; courtSlot: number; twice?: number }
  /** `influence`: also influence a Court slot before or after securing (a leader's Copy/Pivot option). */
  /** `attachedFirst`: with an attached card, resolve it before the card under it (campaign p. 27: "in either order"). */
  | { kind: 'secure'; courtSlot: number; influence?: { courtSlot: number; when: 'before' | 'after' }; attachedFirst?: boolean }
  /** `cityOwner` defaults to the acting player; a rival needs `content.rivalTax.allowed` and control. `city`: which of that owner's cities there (default: the first not taxed this turn). */
  /**
   * Card options: `emptySlot` taxes an empty building slot; `resource` picks the type of a gate city;
   * `shape` puts the resource on that own slot over the planet's type; `again` hits the city to tax again
   * (`ransack`: Court slot if that destroys a Rival city).
   */
  /** Campaign: `cityOwner` 'free' taxes a Free city in a system you control (p. 15), capturing no agent. */
  | { kind: 'tax'; system: string; cityOwner?: Owner; city?: number; emptySlot?: boolean; resource?: Resource; shape?: number | { cartel: Resource }; again?: { ransack?: number } }
  /** Card options: `outside` builds a city outside the slots paying the resource on slot `pay`; `again` hits a starport to build another ship, the one at index `port` of the Loyal starports there (the first by default). */
  | { kind: 'build'; system: string; what: 'ship' | 'city' | 'starport'; outside?: boolean; pay?: number; again?: { ransack?: number }; port?: number }
  /** Campaign: `whose` repairs an Imperial ship you Command (p. 10) or a Free building you control (p. 15). */
  | { kind: 'repair'; system: string; target: 'ship' | 'building'; whose?: 'imperial' | 'free' }
  /**
   * `ships` fresh and `damaged` damaged ships move together to an adjacent system.
   * Catapult (from a system with a Loyal starport): `via` lists the systems passed
   * through before `to`, and `drop` leaves some ships in those systems on the way.
   */
  | {
      kind: 'move';
      from: string;
      to: string;
      ships: number;
      damaged?: number;
      via?: string[];
      drop?: { at: string; ships: number; damaged?: number; imperial?: number; imperialDamaged?: number }[];
      /**
       * Campaign: Imperial ships moving with them (a Regent Commanding the Imperial Fleet, p. 10).
       * Movement Law: at most 1 Imperial ship for each Loyal ship moving with it to the same system.
       */
      imperial?: number;
      imperialDamaged?: number;
      /** Card option: fresh ships that just arrived move once more (`from` is the destination or a drop-off; `via` for a Catapult). */
      then?: { from: string; via?: string[]; to: string; ships: number }[];
    }
  /**
   * `preHit`: which own ship takes a hit the defender deals before dice are collected (default: a fresh one).
   * `tactical`: a move before or after the battle (a leader's Copy/Pivot option).
   */
  /** Campaign: `target` may be the Empire, the Free States or the Blight; `withImperial` adds the Imperial ships there to a Regent's attack (p. 11). */
  | { kind: 'battle'; system: string; target: Defender; dice: DicePool; preHit?: ShipHit; tactical?: { when: 'before' | 'after'; move: MovePayload }; withImperial?: boolean }
  /** A card's new action "Name (Kind)": `card` is the card's content id, `name` the action, `args` its choices. */
  | { kind: 'card'; card: string; name: string; args?: Record<string, unknown> };

/** A move action's parameters. */
export type MovePayload = Extract<ActionPayload, { kind: 'move' }>;

/** The standard action kind an action counts as (a card action counts as its printed kind). */
export function actionKindOf(ix: ContentIndex, a: ActionPayload): ActionKind {
  if (a.kind !== 'card') return a.kind;
  return cardAction(ix, a.card, a.name).as;
}

function cardAction(ix: ContentIndex, card: string, name: string) {
  return effectOf(ix, card)?.actions?.[name] ?? err(`${card} has no action '${name}'`);
}

/** What an action produced, for the log and the UI. */
export interface ActionResult {
  text: string;
  roll?: RollResult;
  /** Set by battle: the game waits for the attacker's allocation. */
  pendingBattle?: PendingBattle;
}

export { RuleError } from './errors';

/** Validates and applies one action. Callers clone state first if they need rollback. */
export function performAction(ix: ContentIndex, s: GameState, player: PlayerId, a: ActionPayload): ActionResult {
  if (a.kind === 'card') {
    const def = cardAction(ix, a.card, a.name);
    if (!ownedEffects(ix, s, player).some((o) => o.card === a.card)) err(`You do not have ${a.card}`);
    if (def.whileDeclared && !isDeclared(s, def.whileDeclared)) err(`${a.card}: only while ${def.whileDeclared} is declared`);
    const turn = currentBudget(s);
    const key = `${a.card}:${a.name}`;
    if (def.oncePerTurn) {
      if (turn?.usedOnce?.includes(key)) err(`${a.card}: once per turn`);
      if (turn) (turn.usedOnce ??= []).push(key);
    }
    const r = def.run({ ix, state: s, player, card: a.card, args: a.args ?? {} });
    return typeof r === 'string' ? { text: r } : r;
  }
  const handler = HANDLERS[a.kind] as (ix: ContentIndex, s: GameState, p: PlayerId, a: ActionPayload) => ActionResult;
  return handler(ix, s, player, a);
}

/** Standard actions, callable by card effects ("tax a Loyal city", "secure once"). */
export const HANDLERS: { [K in ActionKind]: (ix: ContentIndex, s: GameState, p: PlayerId, a: Extract<ActionPayload, { kind: K }>) => ActionResult } = {
  influence(_ix, s, p, a) {
    const slot = s.court[a.courtSlot] ?? err('No such court slot');
    const pl = s.players[p];
    if (!securable(s, slot)) err('The Imperial Council is Decided: it cannot be influenced');
    if (pl.supply.agents < 1) err('No agents in supply');
    pl.supply.agents -= 1;
    slot.agents[p] = (slot.agents[p] ?? 0) + 1;
    return { text: `P${p} influences ${slot.card}` };
  },

  secure(ix, s, p, a) {
    const slot = s.court[a.courtSlot] ?? err('No such court slot');
    if (!securable(s, slot)) err('The Imperial Council is Decided: it cannot be secured');
    const mine = slot.agents[p] ?? 0;
    const rivalsMax = Math.max(0, ...Object.entries(slot.agents).filter(([k]) => Number(k) !== p).map(([, v]) => v));
    if (mine === 0 || mine <= rivalsMax) err('Need strictly more agents than every rival');
    if (mine === 1 && ix.courtCards.get(slot.card)?.kind === 'faction' && ownedEffects(ix, s, p).some((f) => f.effect.noSecureGuildWithOneAgent)) err('You cannot secure a Guild card with only 1 of your agents on it');
    return { text: `P${p} secures ${takeCourtCard(ix, s, p, a.courtSlot, 'captives', a.attachedFirst)}` };
  },

  tax(ix, s, p, a) {
    const sys = inPlay(s, a.system);
    const def = ix.content.map.systems.find((x) => x.id === a.system)!;
    const fx = ownedEffects(ix, s, p).map((f) => f.effect);
    const asLoyal = fx.some((e) => e.actAsLoyalWhile && isDeclared(s, e.actAsLoyalWhile));
    const withShips = fx.some((e) => e.taxWithShips) && shipCount(sys, p) > 0;
    const retax = fx.some((e) => e.retaxWhile && isDeclared(s, e.retaxWhile));
    const turn = currentBudget(s);
    const pl = s.players[p];
    let owner = a.cityOwner ?? p;
    let key: string;
    let city: Building | undefined;
    if (a.emptySlot) {
      // A card lets an empty building slot be taxed like your own city, where you have ships.
      if (!withShips) err('Only a card lets you tax empty building slots, in systems with your ships');
      if (def.kind !== 'planet' || def.slots === undefined) err('Empty building slots are on planets');
      const free = def.slots - sys.buildings.filter((b) => !b.outside).length;
      const used = turn?.taxed?.filter((k) => k.startsWith(`${a.system}:slot:`)).length ?? 0;
      if (free < 1) err('No empty building slot there');
      if (used >= free && !retax) err('Every empty slot there was already taxed this turn');
      key = `${a.system}:slot:${used}`;
      owner = p;
    } else {
      const cities = sys.buildings.filter((b) => b.owner === owner && b.type === 'city');
      if (!cities.length) err(owner === 'free' ? 'Need a Free city there' : `Need a city of P${owner} there`);
      // Tax limit: each city at most once per turn (unless a card allows taxing again).
      const keyOf = (n: number) => `${a.system}:${owner}:${n}`;
      const n = a.city ?? (retax ? 0 : cities.findIndex((_, i) => !turn?.taxed?.includes(keyOf(i))));
      if (n < 0 || n >= cities.length) err('Every such city there was already taxed this turn');
      if (turn?.taxed?.includes(keyOf(n)) && !retax) err('That city was already taxed this turn');
      key = keyOf(n);
      city = cities[n];
      if (owner === p) {
        if (fx.some((e) => e.cannotTaxLoyal)) err('You cannot tax your own cities');
      } else if (owner === 'free') {
        // Campaign p. 15: "You may take actions with Free buildings that you control—tax Free cities".
        if (!s.campaign) err('Free cities belong to the campaign');
        if (!controlsOnTurn(s, sys, p)) err('You tax a Free city only in a system you control');
      } else {
        if (!ix.content.rivalTax.allowed) err('Taxing rival cities is not allowed');
        if (truceForbids(s, sys, p, owner)) err('Truce Law: Regents cannot tax Rival Regents in systems with Imperial ships');
        if (!asLoyal && !withShips && !controlsOnTurn(s, sys, p)) err('Need to control the system to tax a rival city');
      }
      if (fx.some((e) => e.taxNeedsControl) && !controlsOnTurn(s, sys, p)) err('You cannot tax cities you do not control');
    }
    if (turn) (turn.taxed ??= []).push(key);
    // A gate city in a cluster with no other city has no type: it can be taxed, for nothing.
    const types = cityTypes(ix, s, a.system);
    if (!types.length && def.kind === 'planet') err('System has no resource');
    const r = a.resource ?? types[0];
    if (r !== undefined && !types.includes(r)) err(`That city gives ${types.join(' or ')}`);
    const once = () => {
      let extra = '';
      // Taxing a Rival city captures one of its owner's agents (not when taxing "as if Loyal"; never a Free city, p. 15).
      if (owner !== p && isPlayer(owner) && !asLoyal && ix.content.rivalTax.effect === 'takeCaptive' && s.players[owner].supply.agents > 0) {
        s.players[owner].supply.agents -= 1;
        pl.captives.push(owner);
        extra = `, captures an agent of P${owner}`;
      }
      if (r === undefined) return ` (a city with no type: nothing gained)${extra}`;
      return gainFromSupply(ix.content, s, pl, r) ? ` (+${r})${extra}` : ` but gains nothing (no room or supply empty)${extra}`;
    };
    let text = `P${p} taxes ${a.system}${once()}`;
    if (a.shape !== undefined) {
      // A card puts one of your resources over the planet's icon: its type changes for good.
      if (!fx.some((e) => e.reshapePlanets)) err('No card lets you change a planet type');
      if (def.kind !== 'planet' || !city) err('Only after taxing a city on a planet');
      if (s.planetTypes?.[a.system]) err('That planet type was already changed');
      let t: Resource;
      if (typeof a.shape === 'number') t = takeResourceAt(pl, a.shape);
      else {
        // A resource kept on a card counts as one you have.
        t = a.shape.cartel;
        if ((cartelSupply(ix, s, p)[t] ?? 0) < 1) err(`You have no ${t} on a card`);
        s.resourceSupply[t] -= 1;
      }
      (s.planetTypes ??= {})[a.system] = t;
      text += `; ${a.system} becomes ${t}`;
    }
    if (a.again) {
      text += hitAndRepeat(ix, s, p, sys, city ?? err('Only a taxed city can be hit to tax again'), a.again.ransack, fx);
      text += `; taxes again${once()}`;
    }
    return { text };
  },

  build(ix, s, p, a) {
    const sys = inPlay(s, a.system);
    const pl = s.players[p];
    const def = ix.content.map.systems.find((x) => x.id === a.system)!;
    const fx = ownedEffects(ix, s, p).map((f) => f.effect);
    const asLoyal = fx.some((e) => e.actAsLoyalWhile && isDeclared(s, e.actAsLoyalWhile));
    // Built in a system someone else controls (campaign: on this player's turn, the Empire included): the piece arrives damaged.
    const rivalControls = s.campaign ? buildsDamaged(s, sys, p) : Object.keys(sys.ships).some((k) => Number(k) !== p && controls(sys, Number(k)));
    const damaged = rivalControls && !(a.what === 'ship' && fx.some((e) => e.buildShipsFresh));
    let text = '';
    if (a.what === 'ship') {
      // Campaign p. 15: ships may also be built at Free starports in a system you control.
      const freeOk = !!s.campaign && controlsOnTurn(s, sys, p);
      const ports = sys.buildings.filter((b) => b.type === 'starport' && (b.owner === p || asLoyal || (b.owner === 'free' && freeOk)));
      if (!ports.length) err('Ships are built at a Loyal starport');
      const turn = currentBudget(s);
      const built = turn?.shipBuilds?.[a.system] ?? 0;
      if (built >= ports.length) err('Each starport builds only one ship per turn');
      const place = () => {
        if (pl.supply.ships < 1) err('No ships in supply');
        pl.supply.ships -= 1;
        if (damaged) stack(sys, p).damaged += 1;
        else stack(sys, p).fresh += 1;
      };
      place();
      if (turn) (turn.shipBuilds ??= {})[a.system] = built + 1;
      if (a.again) {
        // "Hit the building to take that action again with it": the starport the player picks (first by default).
        const port = ports[a.port ?? 0] ?? err('No such starport of yours there');
        text = hitAndRepeat(ix, s, p, sys, port, a.again.ransack, fx);
        place();
        text += '; builds again';
      }
    } else {
      // Campaign p. 10: a Regent Commanding the Imperial Fleet may also "build at them".
      if (shipCount(sys, p) < 1 && !sys.buildings.some((b) => b.owner === p) && !commandsImperial(s, sys, p)) err('Need a Loyal piece there to build');
      let outside = false;
      if (def.kind === 'gate') {
        if (!fx.some((e) => (a.what === 'city' ? e.gateCities : e.gateStarports))) err('Buildings go on planets');
        if (sys.buildings.some((b) => b.type === a.what)) err(`At most 1 ${a.what} per gate`);
      } else if (a.outside) {
        if (a.what !== 'city' || !fx.some((e) => e.citiesOutsideSlots)) err('No card lets you build outside the slots');
        if (sys.buildings.some((b) => b.outside)) err('At most 1 city outside the slots per planet');
        // Costs 1 resource of the planet type.
        const t = planetType(ix, s, a.system) ?? err('That planet has no type');
        const slot = a.pay ?? pl.resources.indexOf(t);
        if (slot < 0 || pl.resources[slot] !== t) err(`Pay 1 ${t}`);
        returnToSupply(s, takeResourceAt(pl, slot));
        outside = true;
      } else if (def.slots !== undefined && sys.buildings.filter((b) => !b.outside).length >= def.slots) err('No free building slot');
      const key = a.what === 'city' ? 'cities' : 'starports';
      if (pl.supply[key] < 1) err(`No ${key} in supply`);
      pl.supply[key] -= 1;
      sys.buildings.push(outside ? { owner: p, type: a.what, damaged, outside } : { owner: p, type: a.what, damaged });
    }
    return { text: `P${p} builds ${a.what} at ${a.system}${damaged ? ' (damaged: system controlled by a rival)' : ''}${text}` };
  },

  repair(_ix, s, p, a) {
    const sys = inPlay(s, a.system);
    if (a.whose === 'imperial') {
      if (a.target !== 'ship') err('Imperial pieces are ships');
      if (!commandsImperial(s, sys, p)) err('You Command Imperial ships only in Empire-controlled systems with your Loyal pieces');
      const st = sys.imperial ?? err('No Imperial ship there');
      if (st.damaged < 1) err('No damaged Imperial ship there');
      st.damaged -= 1;
      st.fresh += 1;
      return { text: `P${p} repairs an Imperial ship at ${a.system}` };
    }
    if (a.whose === 'free') {
      if (a.target !== 'building') err('Free pieces are buildings');
      if (!s.campaign || !controlsOnTurn(s, sys, p)) err('You repair Free buildings only in a system you control');
      const b = sys.buildings.find((x) => x.owner === 'free' && x.damaged) ?? err('No damaged Free building there');
      b.damaged = false;
      return { text: `P${p} repairs a Free ${b.type} at ${a.system}` };
    }
    if (a.target === 'ship') {
      const st = stack(sys, p);
      if (st.damaged < 1) err('No damaged ship there');
      st.damaged -= 1;
      st.fresh += 1;
    } else {
      const b = sys.buildings.find((x) => x.owner === p && x.damaged) ?? err('No damaged building there');
      b.damaged = false;
    }
    return { text: `P${p} repairs ${a.target} at ${a.system}` };
  },

  move(ix, s, p, a) {
    const from = inPlay(s, a.from);
    const via = a.via ?? [];
    const fx = ownedEffects(ix, s, p).map((f) => f.effect);
    const imp = moveImperial(s, from, p, a);
    checkPath(ix, s, p, fx, a.from, via, a.to, imp.alongTheWay);
    // Gates guarded against Rival entry, as they stand before the ships arrive.
    const guards = new Map<PlayerId, Set<string>>();
    const noteGuards = (ids: string[]) => {
      for (const id of ids) for (const q of gateGuards(ix, s, id, p)) (guards.get(q) ?? guards.set(q, new Set()).get(q)!).add(id);
    };
    noteGuards([...via, a.to]);
    const st = stack(from, p);
    let fresh = a.ships;
    let dmg = a.damaged ?? 0;
    if (fresh < 0 || dmg < 0 || fresh + dmg < 1) err('Move at least one ship');
    const cap = Math.min(...fx.map((e) => e.maxShipsPerMove ?? Infinity));
    if (fresh + dmg > cap) err(`You cannot move more than ${cap} ships at a time`);
    if (st.fresh < fresh || st.damaged < dmg) err('Not enough ships there');
    st.fresh -= fresh;
    st.damaged -= dmg;
    for (const d of a.drop ?? []) {
      if (!via.includes(d.at)) err(`Ships can only be dropped off along the way (${d.at})`);
      const df = d.ships, dd = d.damaged ?? 0;
      if (df < 0 || dd < 0 || df > fresh || dd > dmg) err('Cannot drop more ships than are moving');
      fresh -= df;
      dmg -= dd;
      const at = stack(s.map[d.at], p);
      at.fresh += df;
      at.damaged += dd;
    }
    const dest = stack(s.map[a.to], p);
    dest.fresh += fresh;
    dest.damaged += dmg;
    imp.apply();
    let text = `P${p} moves ${a.ships}+${a.damaged ?? 0}d ${[a.from, ...via, a.to].join('→')}${imp.text}`;
    if (a.then?.length) {
      // A card lets fresh ships that just moved take one more step, after any Catapult.
      if (!fx.some((e) => e.extraStep)) err('No card lets your ships move one more time');
      const arrived: Record<string, number> = { [a.to]: fresh };
      for (const d of a.drop ?? []) arrived[d.at] = (arrived[d.at] ?? 0) + d.ships;
      for (const t of a.then) {
        if (t.ships < 1 || (arrived[t.from] ?? 0) < t.ships) err(`Only fresh ships that just arrived at ${t.from} move again`);
        // FAQ: the extra move may itself be a Catapult when it starts from a starport.
        checkPath(ix, s, p, fx, t.from, t.via ?? [], t.to);
        noteGuards([...(t.via ?? []), t.to]);
        arrived[t.from] -= t.ships;
        stack(s.map[t.from], p).fresh -= t.ships;
        stack(s.map[t.to], p).fresh += t.ships;
        text += `; ${t.ships} move on ${t.from}→${t.to}`;
      }
    }
    text += captureAtGates(s, p, [...guards.keys()]);
    return { text };
  },

  battle(ix, s, p, a) {
    const sys = inPlay(s, a.system);
    if (a.target === p) err('Cannot battle yourself');
    if (shipCount(sys, p) === 0) err('No ships of yours there');
    checkDefender(s, sys, p, a.target, a.withImperial);
    const allFresh = (sys.ships[p]?.damaged ?? 0) === 0 && (!a.withImperial || (sys.imperial?.damaged ?? 0) === 0);
    const defFx = isPlayer(a.target) ? ownedEffects(ix, s, a.target) : [];
    let text = `P${p} battles ${defenderName(a.target)} at ${a.system}${a.withImperial ? ' with the Imperial ships there' : ''}`;
    // Before the attacker collects dice: the defender's automatic effects, then optional reactions.
    const t0 = a.target;
    if (isPlayer(t0) && defFx.some((f) => f.effect.hitAttackerIfFresh) && (sys.ships[t0]?.fresh ?? 0) > 0) {
      const st = stack(sys, p);
      damageShipOnce(s, sys, p, t0, a.preHit ?? (st.fresh > 0 ? 'fresh' : 'damaged'));
      text += '; the attacker takes 1 hit before collecting dice';
      if (shipCount(sys, p) === 0) return { text: `${text}; no attacking ship is left` };
    }
    const battle = { attacker: p, target: a.target, system: a.system, ...(a.withImperial ? { withImperial: true } : {}) };
    const target = a.target;
    const reactions = isPlayer(target) ? defFx.filter((f) => f.effect.triggers?.beforeDice && (f.effect.triggerWhen?.beforeDice?.({ ix, state: s, player: target, card: f.card, battle: { ...battle, target } }) ?? true)) : [];
    if (isPlayer(target) && reactions.length) {
      s.battleSetup = { ...battle, dice: a.dice, attackerAllFresh: allFresh };
      for (const r of reactions) (s.pendingDecisions ??= []).push({ player: target, card: r.card, effect: 'beforeDice' });
      (s.pendingDecisions ??= []).push({ player: p, card: 'battle', effect: 'collectDice' });
      return { text: `${text}; the defender may react before dice are collected` };
    }
    return collectAndRoll(ix, s, battle, a.dice, allFresh, text);
  },
};

/**
 * Validates a move path: every step adjacent and in play; with `via`, a
 * Catapult — from a system with a Loyal starport (cards: any starport, or
 * gates only), stopping at any planet or a gate a Rival controls.
 */
function checkPath(ix: ContentIndex, s: GameState, p: PlayerId, fx: CardEffect[], fromId: string, via: string[], to: string, imperialAt: (id: string) => number = () => 0): void {
  const path = [fromId, ...via, to];
  for (const id of path) inPlay(s, id);
  for (let i = 0; i + 1 < path.length; i++) if (!adjacent(ix, s, path[i], path[i + 1])) err(`${path[i]} and ${path[i + 1]} are not connected`);
  if (!via.length) return;
  const from = s.map[fromId];
  const asLoyal = fx.some((e) => e.actAsLoyalWhile && isDeclared(s, e.actAsLoyalWhile));
  const fromGate = ix.content.map.systems.find((x) => x.id === fromId)!.kind === 'gate';
  if (fx.some((e) => e.catapultFromGatesOnly)) {
    if (!fromGate) err('You Catapult only from gates');
  } else if (!from.buildings.some((b) => b.type === 'starport' && (b.owner === p || asLoyal || (b.owner === 'free' && !!s.campaign && controlsOnTurn(s, from, p))))) err('Catapult moves start from a system with a Loyal starport');
  // Ships must stop on entering any planet or a gate someone else controls (checked before moving in).
  for (const id of via) {
    const def = ix.content.map.systems.find((x) => x.id === id)!;
    if (def.kind === 'planet') err(`Catapulting ships stop at planet ${id}`);
    const sys = s.map[id];
    // Campaign p. 10 and 19: who controls the gate, Imperial ships moving along, and Blight decide.
    if (s.campaign) {
      if (catapultStops(s, sys, p, imperialAt(id) > 0)) err(`Catapulting ships stop at ${id}`);
    } else if (Object.keys(sys.ships).some((k) => Number(k) !== p && controls(sys, Number(k)))) err(`Catapulting ships stop at ${id}: a rival controls it`);
  }
}

/**
 * Rivals of `mover` guarding any of the gates `ids` (Gate Ports, lore-08), worked out before the ships
 * move in: card owners who control the gate with a fresh starport of theirs there.
 */
export function gateGuardsAt(ix: ContentIndex, s: GameState, ids: readonly string[], mover: PlayerId): PlayerId[] {
  return [...new Set(ids.flatMap((id) => gateGuards(ix, s, id, mover)))];
}

/** Ships of `mover` entered gates guarded by `guards`: each captures 1 agent of the mover, once per move. Log text. */
export function captureAtGates(s: GameState, mover: PlayerId, guards: readonly PlayerId[]): string {
  let text = '';
  for (const q of guards) {
    if (s.players[mover].supply.agents < 1) break;
    s.players[mover].supply.agents -= 1;
    s.players[q].captives.push(mover);
    text += `; P${q} captures an agent of P${mover} at the gate`;
  }
  return text;
}

/** Rivals of `mover` guarding this gate: card owners who control it with a fresh starport of theirs there. */
function gateGuards(ix: ContentIndex, s: GameState, id: string, mover: PlayerId): PlayerId[] {
  const def = ix.content.map.systems.find((x) => x.id === id);
  if (def?.kind !== 'gate') return [];
  const sys = s.map[id];
  return s.players
    .map((pl) => pl.id)
    .filter((q) => q !== mover && controls(sys, q) && sys.buildings.some((b) => b.owner === q && b.type === 'starport' && !b.damaged))
    .filter((q) => ownedEffects(ix, s, q).some((f) => f.effect.captureOnGateEntry));
}

/**
 * A card's "hit the building to take that action again" (once per turn): one
 * hit on that building — damaged, or destroyed if already damaged. A destroyed
 * city Provokes Outrage; a Rival's also Ransacks the Court (`ransack` slot) and
 * gives a Trophy. The caller then repeats the action, even if the building is gone.
 */
function hitAndRepeat(ix: ContentIndex, s: GameState, p: PlayerId, sys: SystemState, b: Building, ransack: number | undefined, fx: CardEffect[]): string {
  if (!fx.some((e) => e.hitToRepeat)) err('No card lets you hit a building to repeat the action');
  const turn = currentBudget(s);
  if (turn?.usedOnce?.includes('hitToRepeat')) err('Only once per turn');
  if (turn) (turn.usedOnce ??= []).push('hitToRepeat');
  const ransacks = ransack === undefined ? [] : [ransack];
  damageBuildingOnce(ix, s, sys, b, p, (owner, types) => destroyCityConsequences(ix, s, p, owner, types, ransacks, owner !== p));
  return `; hits its ${b.type} at ${sys.id}`;
}

/** Where one ship hit goes: damage a fresh ship, or destroy a damaged one. */
export type ShipHit = 'fresh' | 'damaged';

/**
 * Where a normal hit goes: a defender ship, or (once no defender ships remain)
 * a building by index. Campaign: `imperial`, an Imperial ship defending (p.
 * 11); `blight`, a Blight token, which is Tough: that entry takes 2 hits (p. 19).
 */
export type HitTarget = ShipHit | { building: number } | { imperial: ShipHit } | { blight: ShipHit };

/** Where a self-hit or intercept hit goes: an own ship, or (campaign) an Imperial ship attacking with you. */
export type SelfHit = ShipHit | { imperial: ShipHit };

/** A battle waiting for the attacker to allocate its hits (see BattleRef). */
export type PendingBattle = BattleRef;

/**
 * Collects and rolls the attacker's dice, with the card modifiers on what may
 * be collected (design/gdd/card-effects.md "Battle"), and returns the battle
 * waiting for allocation.
 */
export function collectAndRoll(ix: ContentIndex, s: GameState, bt: { attacker: PlayerId; target: Defender; system: string; withImperial?: boolean }, pool: DicePool, allFresh: boolean, text: string): ActionResult {
  const { attacker: p, target, system } = bt;
  const sys = s.map[system];
  const counts = Object.values(pool).map((y) => y ?? 0);
  const dice = counts.reduce((x, y) => x + y, 0);
  if (dice < 1) err('Roll at least one die');
  const atk = ownedEffects(ix, s, p).map((f) => f.effect);
  const def = isPlayer(target) ? ownedEffects(ix, s, target).map((f) => f.effect) : [];
  const isGate = ix.content.map.systems.find((x) => x.id === system)?.kind === 'gate';
  const extra = atk.reduce((n, e) => n + (e.extraDice && (!e.extraDice.inGate || isGate) ? e.extraDice.count : 0), 0);
  // Campaign p. 11: Imperial ships added to a Regent's attack roll like attacking ships.
  const ships = shipCount(sys, p) + (bt.withImperial ? imperialCount(sys) : 0);
  if (dice > ships + extra) err(`At most one die per own ship there (fresh or damaged)${extra ? ` plus ${extra}` : ''}`);
  const mandatory = atk.reduce((n, e) => n + (e.extraDice?.mandatory ? e.extraDice.count : 0), 0);
  if (dice < mandatory) err(`Your ${mandatory} extra dice must be collected`);
  const cap = ix.content.maxDicePerType;
  if (cap !== undefined && counts.some((n) => n > cap)) err(`At most ${cap} dice of one type`);
  if (atk.some((e) => e.assaultCappedBySkirmish) && (pool.assault ?? 0) > (pool.skirmish ?? 0)) err('You cannot collect more assault dice than skirmish dice');
  const raidDice = pool.raid ?? 0;
  if (raidDice > 0) {
    if (def.some((e) => e.freshStarportStopsRaid) && sys.buildings.some((b) => b.owner === target && b.type === 'starport' && !b.damaged)) err('The defender has a fresh starport here: no raid dice');
    // Raid dice need defender buildings here, or a defender with no buildings anywhere.
    const here = sys.buildings.some((b) => b.owner === target);
    const anywhere = Object.values(s.map).some((x) => x.buildings.some((b) => b.owner === target));
    const without = Math.max(0, ...atk.map((e) => e.raidDiceWithoutBuildings ?? 0));
    if (!here && anywhere && raidDice > without) err(without ? `At most ${without} raid dice without defender buildings here` : 'Raid dice need defender buildings in this system');
  }
  const roll = rollDice(ix.content, s, pool);
  const b: PendingBattle = {
    attacker: p,
    target,
    ...(bt.withImperial ? { withImperial: true } : {}),
    system,
    faces: roll.faces,
    defenderFresh: defendingFresh(s, sys, target),
    attackerAllFresh: allFresh,
    rerolls: [],
    totals: roll.totals,
    interceptHits: 0,
  };
  finalizeBattle(ix, s, b);
  // The attacker allocates every hit afterwards (Command 'allocate'), after any rerolls.
  return { text, roll, pendingBattle: b };
}

/**
 * Recomputes totals and intercept hits from the faces and card modifiers.
 * Intercept fires once however many were rolled: one hit per fresh defending
 * ship counted at roll time.
 */
export function finalizeBattle(ix: ContentIndex, s: GameState, b: PendingBattle): void {
  if (b.faces) b.totals = totalFaces(b.faces.map((f) => f.face));
  if (b.like) {
    // "Like in a battle": only the hits are dealt, with no battle modifiers (base.ts lore-02).
    b.totals = { hit: b.totals.hit, selfHit: 0, buildingHit: 0, key: 0, intercept: 0 };
    b.interceptHits = 0;
    return;
  }
  const t = b.totals;
  const atk = b.like ? [] : ownedEffects(ix, s, b.attacker).map((f) => f.effect);
  const target = b.target;
  const def = b.like || !isPlayer(target) ? [] : ownedEffects(ix, s, target).map((f) => f.effect);
  // Ignoring applies to a rolled intercept only; one added by a defender's card stays.
  if (t.intercept > 0 && b.attackerAllFresh && atk.some((e) => e.ignoreInterceptIfAllFresh)) t.intercept -= 1;
  if (def.some((e) => e.interceptOnAssault) && b.faces?.some((f) => f.type === 'assault')) t.intercept += 1;
  if (t.intercept <= 0) b.interceptHits = 0;
  else if (isPlayer(target) && def.some((e) => e.interceptByWeapons)) b.interceptHits = weaponIcons(ix, s, target);
  else b.interceptHits = b.defenderFresh ?? 0;
}

/** How many dice a reroll ability may reroll right now. */
function rerollLimit(ix: ContentIndex, s: GameState, b: PendingBattle, limit: RerollAbility['limit']): number {
  switch (limit) {
    case 'weaponIcons':
      return weaponIcons(ix, s, b.attacker);
    case 'freshAttackers':
      return s.map[b.system].ships[b.attacker]?.fresh ?? 0;
    case 'resourceTypes':
      return new Set(s.players[b.attacker].resources.filter(Boolean)).size;
    case 'any':
      return Infinity;
  }
}

/**
 * Rerolls dice of a pending battle with one card's reroll ability: each
 * ability once per battle, all its dice together (card-effects.md rulings).
 */
export function rerollDice(ix: ContentIndex, s: GameState, b: PendingBattle, player: PlayerId, card: string, dice: number[]): string {
  if (player !== b.attacker) err('Only the attacker rerolls');
  if (!ownedEffects(ix, s, player).some((o) => o.card === card)) err(`You do not have ${card}`);
  const ab = effectOf(ix, card)?.reroll ?? err(`${card} has no reroll`);
  if (b.like && !ab.anyRoll) err('Not a battle: battle rerolls do not apply');
  if (ab.whileDeclared && !isDeclared(s, ab.whileDeclared)) err(`${card}: only while ${ab.whileDeclared} is declared`);
  if (b.rerolls?.includes(card)) err(`${card} was already used in this battle`);
  const faces = b.faces ?? err('No dice to reroll');
  if (!dice.length) err('Choose dice to reroll');
  if (new Set(dice).size !== dice.length) err('Each die once');
  for (const i of dice) {
    const f = faces[i] ?? err(`No die #${i}`);
    if (ab.die && f.type !== ab.die) err(`${card} rerolls only ${ab.die} dice`);
  }
  if (dice.length > rerollLimit(ix, s, b, ab.limit)) err(`${card} rerolls at most ${rerollLimit(ix, s, b, ab.limit)} dice now`);
  for (const i of dice) {
    const defs = ix.content.dice[faces[i].type];
    faces[i] = { type: faces[i].type, face: defs[nextInt(s, defs.length)] };
  }
  (b.rerolls ??= []).push(card);
  finalizeBattle(ix, s, b);
  return `P${player} rerolls ${dice.length} dice with ${card}`;
}

/**
 * The cards of `player` that may reroll a roll made outside a battle now (lore-19: "if you roll any dice
 * (even outside battle)"), in the order they are held. Every roll that is not a battle's offers these
 * before its dice resolve: a roll "like in a battle" (through `rerollDice`), the campaign's event dice
 * (events.ts), and any later roll of the campaign.
 */
export function anyRollRerolls(ix: ContentIndex, s: GameState, player: PlayerId): string[] {
  return ownedEffects(ix, s, player)
    .filter((o) => o.effect.reroll?.anyRoll && (!o.effect.reroll.whileDeclared || isDeclared(s, o.effect.reroll.whileDeclared)))
    .map((o) => o.card);
}

/** After the allocation of a real battle: repairs, intercept costs, reactions (card-effects.md "Battle"). */
function afterBattle(ix: ContentIndex, s: GameState, b: PendingBattle, attackerTookTrophies: boolean): string[] {
  const out: string[] = [];
  const sys = s.map[b.system];
  const repair = (p: PlayerId, n: number, why: string) => {
    const st = stack(sys, p);
    const k = Math.min(n, st.damaged);
    if (k > 0) {
      st.damaged -= k;
      st.fresh += k;
      out.push(`P${p} repairs ${k} ships (${why})`);
    }
  };
  for (const f of ownedEffects(ix, s, b.attacker)) if (f.effect.repairAfterAttack) repair(b.attacker, f.effect.repairAfterAttack, f.card);
  const target = b.target;
  for (const p of [b.attacker, target].filter(isPlayer)) {
    for (const f of ownedEffects(ix, s, p)) {
      if (!f.effect.repairPerStarport) continue;
      const ports = Object.values(s.map).filter((x) => x.inPlay && controls(x, p)).reduce((n, x) => n + x.buildings.filter((y) => y.type === 'starport').length, 0);
      repair(p, ports, f.card);
    }
  }
  if (!isPlayer(target)) return out;
  if (b.interceptHits > 0 && ownedEffects(ix, s, target).some((f) => f.effect.interceptByWeapons)) {
    const d = s.players[target];
    const i = d.resources.indexOf('weapons');
    if (i >= 0) {
      returnToSupply(s, takeResourceAt(d, i));
      out.push(`P${b.target} discards 1 weapons`);
    }
  }
  const battle = { attacker: b.attacker, target, system: b.system, attackerTookTrophies };
  for (const f of ownedEffects(ix, s, target)) {
    if (!f.effect.triggers?.afterDefending) continue;
    if (!(f.effect.triggerWhen?.afterDefending?.({ ix, state: s, player: target, card: f.card, battle }) ?? true)) continue;
    (s.pendingDecisions ??= []).push({ player: target, card: f.card, effect: 'afterDefending' });
  }
  return out;
}

/** The attacker's choices for every rolled hit. Building indices refer to the system's buildings before allocation. */
export interface Allocation {
  /** Self-hits plus intercept hits, applied to the attacker's own ships in order (and the Imperial ships attacking with them). */
  selfHits: SelfHit[];
  /** One entry per hit: defender ships first, buildings only once no defender ships remain. */
  hits: HitTarget[];
  /** One entry per building hit, on defender buildings (ships do not protect them). */
  buildingHits: number[];
  /** What the rolled keys buy, in order: a defender resource (index into its resources) or a defender Guild card. */
  raid?: RaidTake[];
  /** One Court slot per city destroyed, in order: the card to Ransack (must hold the defender's agents). */
  ransack?: number[];
}

/** One thing stolen with keys; campaign: `free`, the one resource of the planet's type a raid on the Free States gains (p. 15). */
export type RaidTake = { resource: number } | { card: string } | { free: true };

/**
 * Applies the attacker's allocation in rule order (design/gdd/core-loop.md §3.5):
 * 1. self-hits and intercept hits on the attacker's ships;
 * 2. hits on defender ships, then on defender buildings once no ships remain;
 * 3. building hits on defender buildings.
 * Every hit needs an entry while a valid target remains; hits beyond what the
 * targets can absorb are lost and may be omitted.
 */
export function applyAllocation(ix: ContentIndex, s: GameState, b: PendingBattle, al: Allocation): string {
  const sys = s.map[b.system];
  const original = [...sys.buildings];
  const ransacks = [...(al.ransack ?? [])];
  const target = b.target;
  const noRansack = !b.like && isPlayer(target) && ownedEffects(ix, s, target).some((f) => f.effect.noRansackWhenBattled);
  const onCity: CityDestroyed = (cityOwner, types) => destroyCityConsequences(ix, s, b.attacker, cityOwner, types, ransacks, !noRansack);
  const trophiesBefore = s.players[b.attacker].trophies.length;
  const bAt = (i: number) => {
    const t = original[i] ?? err(`No building at index ${i}`);
    if (t.owner !== b.target) err('Building hits must target the defender');
    return t;
  };
  const bldCap = () => sys.buildings.filter((x) => x.owner === target).reduce((n, x) => n + (x.damaged ? 1 : 2), 0);
  // Campaign p. 11: the Imperial ships defending with a Regent, or as the Empire.
  const impDefends = defendsWithImperial(s, target);
  const imp = () => (impDefends ? (sys.imperial ??= { fresh: 0, damaged: 0 }) : { fresh: 0, damaged: 0 });
  const blight = () => (target === 'blight' ? (sys.blight ??= { fresh: 0, damaged: 0 }) : { fresh: 0, damaged: 0 });
  const st = isPlayer(target) ? stack(sys, target) : { fresh: 0, damaged: 0 };
  const shipsLeft = () => st.fresh + st.damaged + imp().fresh + imp().damaged;

  // 1. Attacker's own ships (and the Imperial ships attacking with them); destroyed ones are the defender's trophies.
  applyShipHits(s, sys, b.attacker, trophyTaker(s, target), b.totals.selfHit + b.interceptHits, al.selfHits, 'self-hits and intercept hits', !!b.withImperial);

  // 2. Normal hits. A Blight entry takes 2 hits (Tough); a single hit left over does nothing (p. 19).
  const weight = (h: HitTarget) => (typeof h === 'object' && 'blight' in h ? 2 : 1);
  const used = al.hits.reduce((n, h) => n + weight(h), 0);
  if (used > b.totals.hit) err('More hit entries than hits rolled');
  const bl = blight();
  const hitCap = st.fresh * 2 + st.damaged + imp().fresh * 2 + imp().damaged + bldCap() + (bl.fresh * 2 + bl.damaged) * 2;
  if (Math.min(b.totals.hit, hitCap) - used > (target === 'blight' ? 1 : 0)) err('Allocate every hit');
  for (const h of al.hits) {
    if (typeof h === 'string') {
      if (!isPlayer(target)) err('Those defenders have no ships of a player');
      damageShipOnce(s, sys, target, b.attacker, h);
    } else if ('imperial' in h) {
      if (!impDefends) err('No Imperial ship defends here');
      damageImperialOnce(s, sys, b.attacker, h.imperial);
    } else if ('blight' in h) {
      if (target !== 'blight') err('The Blight is not the defender');
      damageBlightOnce(s, sys, b.attacker, h.blight);
    } else {
      if (target === 'blight') err('The Blight is hit with hits only, and has no buildings');
      if (shipsLeft() > 0) err('Hits go to ships while the defender has ships there');
      damageBuildingOnce(ix, s, sys, bAt(h.building), b.attacker, onCity);
    }
  }

  // 3. Building hits.
  if (al.buildingHits.length > b.totals.buildingHit) err('More building-hit entries than building hits rolled');
  if (al.buildingHits.length < Math.min(b.totals.buildingHit, bldCap())) err('Allocate every building hit');
  for (const i of al.buildingHits) damageBuildingOnce(ix, s, sys, bAt(i), b.attacker, onCity);
  if (ransacks.length) err('More Ransack choices than destroyed cities');

  // 4. Keys: steal resources and Guild cards, only with a surviving attacker ship.
  const stolen = target === 'free' ? raidFreeStates(ix, s, sys, b, al.raid ?? []) : !isPlayer(target) ? noRaid(al.raid ?? []) : raid(ix, s, sys, b, target, al.raid ?? []);
  const after = b.like ? [] : afterBattle(ix, s, b, s.players[b.attacker].trophies.length > trophiesBefore);

  return `P${b.attacker} allocates ${b.totals.hit} hits, ${b.totals.selfHit}+${b.interceptHits} self/intercept hits, ${b.totals.buildingHit} building hits${stolen}${after.map((x) => '; ' + x).join('')}`;
}

/**
 * Spends rolled keys. Each take costs the keys printed on the defender's
 * resource slot (`playerBoard.slotKeys`, or a lore card's `holds`) or on the Guild card (`keys`). Unspent
 * keys are lost. Resource indices refer to the defender's resources before the raid.
 */
function raid(ix: ContentIndex, s: GameState, sys: SystemState, b: PendingBattle, target: PlayerId, takes: RaidTake[]): string {
  if (!takes.length) return '';
  if (shipCount(sys, b.attacker) === 0) err('No attacker ship survived: the keys are lost');
  const att = s.players[b.attacker];
  const def = s.players[target];
  let keysNeeded = 0;
  const resIdx: number[] = [];
  const cards: string[] = [];
  for (const t of takes) {
    if ('free' in t) err('Only the Free States give a resource of the planet type');
    if ('resource' in t) {
      if (!def.resources[t.resource]) err(`Defender has no resource at slot ${t.resource}`);
      const why = stealBlocked(ix, s, b.attacker, target, { resource: def.resources[t.resource]! });
      if (why) err(why);
      if (resIdx.includes(t.resource)) err(`Resource slot ${t.resource} taken twice`);
      resIdx.push(t.resource);
      keysNeeded += slotKeys(ix.content, t.resource, def);
    } else {
      if (!def.court.includes(t.card)) err(`Defender has no card ${t.card}`);
      const why = stealBlocked(ix, s, b.attacker, target, { card: t.card });
      if (why) err(why);
      if (cards.includes(t.card)) err(`Card ${t.card} taken twice`);
      cards.push(t.card);
      keysNeeded += Number(ix.courtCards.get(t.card)?.keys ?? 1);
    }
  }
  if (keysNeeded > b.totals.key) err(`Raid costs ${keysNeeded} keys, only ${b.totals.key} rolled`);
  const gained = resIdx.map((i) => takeResourceAt(def, i));
  // Stolen tokens the attacker cannot hold are discarded to the supply.
  for (const r of gained) if (!gainResource(ix.content, att, r)) returnToSupply(s, r);
  for (const card of cards) {
    def.court.splice(def.court.indexOf(card), 1);
    // A card that guards against stealing is buried when stolen.
    if (effectOf(ix, card)?.guardsSteals) s.courtDeck.push(card);
    else att.court.push(card);
  }
  return `; steals ${[...gained, ...cards].join(', ')} for ${keysNeeded} keys`;
}

function applyShipHits(s: GameState, sys: SystemState, owner: PlayerId, by: PlayerId | null, rolled: number, entries: SelfHit[], label: string, withImperial = false): void {
  if (entries.length > rolled) err(`More ${label} entries than rolled`);
  const st = stack(sys, owner);
  const imp = withImperial ? (sys.imperial ?? { fresh: 0, damaged: 0 }) : { fresh: 0, damaged: 0 };
  // A ship absorbs 2 hits (damage, then destroy): that bounds how many can land.
  if (entries.length < Math.min(rolled, st.fresh * 2 + st.damaged + imp.fresh * 2 + imp.damaged)) err(`Allocate every one of the ${label}`);
  for (const e of entries) {
    if (typeof e === 'string') damageShipOnce(s, sys, owner, by, e);
    else {
      if (!withImperial) err('No Imperial ship attacks with you');
      damageImperialOnce(s, sys, by, e.imperial);
    }
  }
}

/**
 * One hit on a ship: fresh to damaged, or damaged to destroyed. A Rival's
 * destroyed ship goes to `by`'s Trophies box (base rulebook: "put them in the
 * Trophies box") and back to its owner only when trophies return; with no
 * one to take it (`by` null, or the owner itself), it returns to the supply.
 */
function damageShipOnce(s: GameState, sys: SystemState, owner: PlayerId, by: PlayerId | null, e: ShipHit): void {
  const st = stack(sys, owner);
  if (e === 'fresh') {
    if (st.fresh < 1) err('No fresh ship left to hit');
    st.fresh -= 1;
    st.damaged += 1;
  } else {
    if (st.damaged < 1) err('No damaged ship left to hit');
    st.damaged -= 1;
    if (by !== null && owner !== by) s.players[by].trophies.push({ owner, piece: 'ship' });
    else s.players[owner].supply.ships += 1;
  }
}

/** One hit on an Imperial ship (campaign p. 11): destroyed, it is `by`'s trophy, or back in the campaign supply. */
function damageImperialOnce(s: GameState, sys: SystemState, by: PlayerId | null, e: ShipHit): void {
  const st = (sys.imperial ??= { fresh: 0, damaged: 0 });
  if (e === 'fresh') {
    if (st.fresh < 1) err('No fresh Imperial ship left to hit');
    st.fresh -= 1;
    st.damaged += 1;
  } else {
    if (st.damaged < 1) err('No damaged Imperial ship left to hit');
    st.damaged -= 1;
    if (by !== null) s.players[by].trophies.push({ owner: 'empire', piece: 'ship' });
    else if (s.campaign) s.campaign.supply.imperialShips += 1;
  }
}

/** Two hits on a Blight token (p. 19, Tough): fresh to damaged, or damaged to destroyed, `by`'s trophy. */
function damageBlightOnce(s: GameState, sys: SystemState, by: PlayerId, e: ShipHit): void {
  const st = (sys.blight ??= { fresh: 0, damaged: 0 });
  if (e === 'fresh') {
    if (st.fresh < 1) err('No fresh Blight left to hit');
    st.fresh -= 1;
    st.damaged += 1;
  } else {
    if (st.damaged < 1) err('No damaged Blight left to hit');
    st.damaged -= 1;
    s.players[by].trophies.push({ owner: 'blight', piece: 'blight' });
  }
}

/**
 * Raiding the Free States (campaign p. 15): "You may gain exactly 1 resource
 * matching its planet type by spending [keys]. This counts as stealing. You
 * cannot gain multiple resources from the Free States in the same battle."
 * The key cost is campaign.freeStatesRaid.keys.
 */
function raidFreeStates(ix: ContentIndex, s: GameState, sys: SystemState, b: PendingBattle, takes: RaidTake[]): string {
  if (!takes.length) return '';
  if (takes.length > 1 || !('free' in takes[0])) err('A raid on the Free States gains exactly 1 resource of the planet type');
  if (shipCount(sys, b.attacker) === 0) err('No attacker ship survived: the keys are lost');
  const cost = ix.content.campaign?.freeStatesRaid.keys ?? 1;
  if (cost > b.totals.key) err(`Raid costs ${cost} keys, only ${b.totals.key} rolled`);
  const r = planetType(ix, s, sys.id) ?? err('That system has no planet type');
  return gainFromSupply(ix.content, s, s.players[b.attacker], r) ? `; gains ${r} from the Free States for ${cost} keys` : '; gains nothing from the Free States (no room or supply empty)';
}

/** The Empire and the Blight hold nothing to raid. */
function noRaid(takes: RaidTake[]): string {
  if (takes.length) err('There is nothing to raid');
  return '';
}

/** Who takes the attacker's destroyed pieces as trophies: the defending player; the First Regent for the Empire (none: back to the Outlaw, p. 11); nobody for the Free States or the Blight. */
function trophyTaker(s: GameState, target: Defender): PlayerId | null {
  if (isPlayer(target)) return target;
  if (target === 'empire') return s.campaign?.firstRegent ?? null;
  return null;
}

/** Imperial ships defend with a Regent ("must add", p. 11) and as the Empire. */
function defendsWithImperial(s: GameState, target: Defender): boolean {
  if (!s.campaign) return false;
  return target === 'empire' || (isPlayer(target) && s.campaign.titles[target] === 'regent');
}

/** Fresh defending ships when the dice are rolled (intercept: one hit each). The Free States have none; the Blight "does not intercept" (p. 19). */
function defendingFresh(s: GameState, sys: SystemState, target: Defender): number {
  const imp = defendsWithImperial(s, target) ? (sys.imperial?.fresh ?? 0) : 0;
  return (isPlayer(target) ? (sys.ships[target]?.fresh ?? 0) : 0) + imp;
}

/** A defender as the log names it. */
function defenderName(t: Defender): string {
  return isPlayer(t) ? `P${t}` : t === 'empire' ? 'the Empire' : t === 'free' ? 'the Free States' : 'the Blight';
}

/**
 * Campaign battle rules on the defender (p. 11, 15, 19): only an Outlaw may
 * choose the Empire, with Imperial ships there; the Free States need Free
 * buildings there, the Blight some Blight; a Regent cannot battle a Rival
 * Regent in a system with Imperial ships (Truce Law); only a Regent
 * Commanding the Imperial Fleet there adds Imperial ships to the attack.
 */
function checkDefender(s: GameState, sys: SystemState, p: PlayerId, t: Defender, withImperial?: boolean): void {
  const c = s.campaign;
  if (withImperial && !commandsImperial(s, sys, p)) err('You Command Imperial ships only in Empire-controlled systems with your Loyal pieces');
  if (isPlayer(t)) {
    if (shipCount(sys, t) === 0 && !sys.buildings.some((b) => b.owner === t)) err('Target has nothing there');
    if (truceForbids(s, sys, p, t)) err('Truce Law: Regents cannot harm Rival Regents in systems with Imperial ships');
    return;
  }
  if (!c) err('The Empire, the Free States and the Blight are campaign defenders');
  if (t === 'empire') {
    if (c.titles[p] !== 'outlaw') err('Only Outlaws may choose the Empire as defender');
    if (imperialCount(sys) < 1) err('No Imperial ship there');
  } else if (t === 'free') {
    if (!sys.buildings.some((b) => b.owner === 'free')) err('No Free building there');
  } else if ((sys.blight?.fresh ?? 0) + (sys.blight?.damaged ?? 0) < 1) err('No Blight there');
}

/**
 * The Imperial ships of a move (campaign p. 10): only a Regent Commanding the
 * Imperial Fleet where they start, and Movement Law — "Regents can only move 1
 * Imperial ship for each Loyal ship they are moving along with them at the
 * same time to the same system" — checked on every leg of a Catapult move
 * (drop-offs included, p. 11 example).
 */
function moveImperial(s: GameState, from: SystemState, p: PlayerId, a: MovePayload): { alongTheWay: (id: string) => number; apply: () => void; text: string } {
  const fresh = a.imperial ?? 0;
  const dmg = a.imperialDamaged ?? 0;
  const drops = a.drop ?? [];
  const dropped = drops.reduce((n, d) => n + (d.imperial ?? 0) + (d.imperialDamaged ?? 0), 0);
  if (fresh + dmg === 0) {
    if (dropped) err('No Imperial ship moves with you');
    return { alongTheWay: () => 0, apply: () => {}, text: '' };
  }
  if (fresh < 0 || dmg < 0) err('Move a whole number of Imperial ships');
  if (!commandsImperial(s, from, p)) err('You Command Imperial ships only in Empire-controlled systems with your Loyal pieces');
  const st = from.imperial ?? err('No Imperial ship there');
  if (st.fresh < fresh || st.damaged < dmg) err('Not enough Imperial ships there');
  const via = a.via ?? [];
  // Ships moving into each system of the path, Loyal and Imperial, after the drop-offs before it.
  let loyal = a.ships + (a.damaged ?? 0);
  let imperial = fresh + dmg;
  const into: Record<string, number> = {};
  for (const id of [...via, a.to]) {
    if (imperial > loyal) err('Movement Law: at most 1 Imperial ship for each Loyal ship moving with it');
    into[id] = imperial;
    for (const d of drops.filter((x) => x.at === id)) {
      loyal -= d.ships + (d.damaged ?? 0);
      imperial -= (d.imperial ?? 0) + (d.imperialDamaged ?? 0);
    }
  }
  return {
    alongTheWay: (id) => into[id] ?? 0,
    apply: () => {
      st.fresh -= fresh;
      st.damaged -= dmg;
      let f = fresh;
      let d = dmg;
      for (const x of drops) {
        if ((x.imperial ?? 0) > f || (x.imperialDamaged ?? 0) > d) err('Cannot drop more Imperial ships than are moving');
        f -= x.imperial ?? 0;
        d -= x.imperialDamaged ?? 0;
        const at = (s.map[x.at].imperial ??= { fresh: 0, damaged: 0 });
        at.fresh += x.imperial ?? 0;
        at.damaged += x.imperialDamaged ?? 0;
      }
      const dest = (s.map[a.to].imperial ??= { fresh: 0, damaged: 0 });
      dest.fresh += f;
      dest.damaged += d;
    },
    text: ` with ${fresh}+${dmg}d Imperial ships`,
  };
}

/** One hit on a building: damage it, or destroy it if already damaged (trophy to `by`). */
function damageBuildingOnce(ix: ContentIndex, s: GameState, sys: SystemState, t: Building, by: PlayerId, onCity?: CityDestroyed): void {
  if (!sys.buildings.includes(t)) err('Building already destroyed');
  if (!t.damaged) t.damaged = true;
  else {
    sys.buildings.splice(sys.buildings.indexOf(t), 1);
    // A Rival's (or a Free) destroyed building goes to the destroyer's Trophies box, back to its owner when trophies return.
    if (t.owner !== by) s.players[by].trophies.push({ owner: t.owner, piece: t.type });
    else returnPiece(ix, s, t.owner, t.type);
    // "Destroying a Free city still Provokes Outrage" (campaign p. 15).
    if (t.type === 'city') onCity?.(t.owner, cityTypes(ix, s, sys.id));
  }
}

/** Called when a city is destroyed: its owner (a player, or 'free') and its planet type. */
type CityDestroyed = (cityOwner: Owner, types: Resource[]) => void;

/**
 * Destroying a city (design/gdd/core-loop.md §3.10):
 * 1. Provoke Outrage of the planet type: the destroyer discards resources and
 *    Guild cards of that type and covers that Outrage icon with an agent.
 * 2. Ransack the Court: take a card holding any of the city owner's agents;
 *    Rival agents on it become Trophies. `ransacks` supplies the chosen slots.
 */
export function destroyCityConsequences(ix: ContentIndex, s: GameState, destroyer: PlayerId, cityOwner: Owner, types: Resource | Resource[] | undefined, ransacks: number[], allowRansack = true): void {
  // A gate city (card effect) has several types: each one is Provoked.
  for (const t of types === undefined ? [] : Array.isArray(types) ? types : [types]) provokeOutrage(ix, s, destroyer, t);
  // A Free city has no agents in the Court: nothing to Ransack.
  if (!allowRansack || !isPlayer(cityOwner)) return;
  const eligible = ransackable(s, cityOwner);
  if (!eligible.length) return;
  const slot = ransacks.shift();
  if (slot === undefined) err('Choose a Court card to Ransack');
  if (!eligible.includes(slot)) err(`Court slot ${slot} holds none of P${cityOwner}'s agents`);
  takeCourtCard(ix, s, destroyer, slot, 'trophies');
}

/**
 * Court slots a Ransack may take: cards holding any of the city owner's
 * agents that can be secured (base rulebook p. 16: "Secure any card that has
 * any number of the defender's agents"; a Decided Imperial Council cannot be
 * secured, campaign p. 14).
 */
export function ransackable(s: GameState, cityOwner: PlayerId): number[] {
  return s.court.map((c, i) => ((c.agents[cityOwner] ?? 0) > 0 && securable(s, c) ? i : -1)).filter((i) => i >= 0);
}

/**
 * Takes a Court card (Secure or Ransack): own agents return to supply, Rival
 * agents become captives (Secure) or trophies (Ransack). A faction card is
 * kept; a decree resolves and is discarded. The Court refills in the same spot.
 *
 * Campaign: a card attached above it is secured too (p. 27: "When you secure
 * a card, also secure its attached card. If both have When Secured actions,
 * resolve them in either order": `attachedFirst`). The Imperial Council is
 * flipped and tucked instead, and the Court does not refill for it (p. 14).
 */
export function takeCourtCard(ix: ContentIndex, s: GameState, p: PlayerId, slotIndex: number, rivalAgents: 'captives' | 'trophies', attachedFirst = false): string {
  const slot = s.court[slotIndex] ?? err('No such court slot');
  if (!securable(s, slot)) err('The Imperial Council is Decided: it cannot be secured');
  const pl = s.players[p];
  const cards = slot.attached ? (attachedFirst ? [slot.attached, slot.card] : [slot.card, slot.attached]) : [slot.card];
  const turn = currentBudget(s);
  if (turn && !turn.preludeOver) (turn.securedInPrelude ??= []).push(...cards);
  for (const [k, v] of Object.entries(slot.agents)) {
    const owner = Number(k);
    if (owner === p) pl.supply.agents += v;
    else
      for (let i = 0; i < v; i++) {
        if (rivalAgents === 'captives') pl.captives.push(owner);
        else pl.trophies.push({ owner, piece: 'agent' });
      }
  }
  s.court.splice(slotIndex, 1);
  let effect = '';
  for (const card of cards) effect += isCouncil(card) ? secureCouncil(s, p) : receiveCourtCard(ix, s, p, card);
  if (!isCouncil(slot.card)) {
    const refill = s.courtDeck.shift();
    if (refill) s.court.splice(Math.min(slotIndex, s.court.length), 0, { card: refill, agents: {} });
  }
  return `${cards.join(' + ')}${effect}`;
}

/**
 * A secured Court card reaches the player: a Guild card is kept; a Vox card
 * is discarded and resolved (through a Decision when it needs a choice).
 */
export function receiveCourtCard(ix: ContentIndex, s: GameState, p: PlayerId, card: string): string {
  // Campaign: lore cards are shuffled into the Court deck (campaign rulebook p. 4-5 step J); secured, they join the player's lore.
  if (ix.content.loreCards?.some((l) => l.id === card)) {
    s.players[p].lore.push(card);
    return '';
  }
  const def = ix.courtCards.get(card) ?? err(`Unknown Court card ${card}`);
  if (def.kind === 'faction') {
    s.players[p].court.push(card);
    return '';
  }
  s.courtDiscard.push(card);
  const fx = effectOf(ix, card)?.whenSecured;
  if (!fx) return `; ${card}: effect not implemented — resolve manually`;
  if (fx.choice) {
    (s.pendingDecisions ??= []).push({ player: p, card, effect: 'whenSecured' });
    return `; ${card} waits for P${p}'s choice`;
  }
  return '; ' + resolveWhenSecured(ix, s, p, card, {});
}

/** Runs a Vox card's "when secured" effect, then moves the card where the effect says. */
export function resolveWhenSecured(ix: ContentIndex, s: GameState, p: PlayerId, card: string, args: Record<string, unknown>): string {
  const fx = effectOf(ix, card)!;
  const text = fx.whenSecured!.run({ ix, state: s, player: p, card, args });
  if (fx.afterSecured === 'shuffleIntoDeck') {
    const i = s.courtDiscard.indexOf(card);
    if (i >= 0) s.courtDiscard.splice(i, 1);
    s.courtDeck.push(card);
    s.courtDeck = shuffle(s, s.courtDeck);
  }
  return text;
}

/** The budget of the turn in progress, if an action is being taken in one. */
export function currentBudget(s: GameState): TurnBudget | undefined {
  return s.phase.type === 'actions' || s.phase.type === 'allocate' ? s.phase.budget : undefined;
}

/** Strictly more fresh ships in the system than every other player. */
export function controls(sys: SystemState, p: PlayerId): boolean {
  const mine = sys.ships[p]?.fresh ?? 0;
  if (mine < 1) return false;
  return Object.entries(sys.ships).every(([k, v]) => Number(k) === p || v.fresh < mine);
}

/** True if `a` and `b` are linked and the link is not closed. */
export function adjacent(ix: ContentIndex, s: GameState, a: string, b: string): boolean {
  const same = ([x, y]: [string, string]) => (x === a && y === b) || (x === b && y === a);
  return (ix.content.map.links.some(same) && !s.closedLinks.some(same)) || s.openLinks.some(same);
}

function stack(sys: SystemState, p: PlayerId): ShipStack {
  return (sys.ships[p] ??= { fresh: 0, damaged: 0 });
}

function shipCount(sys: SystemState, p: PlayerId): number {
  const st = sys.ships[p];
  return st ? st.fresh + st.damaged : 0;
}

function inPlay(s: GameState, id: string): SystemState {
  const sys = s.map[id] ?? err(`Unknown system ${id}`);
  if (!sys.inPlay) err(`System ${id} is out of play`);
  return sys;
}

function err(msg: string): never {
  throw new RuleError(msg);
}
