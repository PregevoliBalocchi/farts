// Shared game operations used by the rules and by card effects
// (design/gdd/card-effects.md). Each one applies the rulebook vocabulary:
// place, steal, Provoke Outrage, seize, return a city, discard a card.

import { RuleError } from './errors';
import { gainResource, heldResources, onCityReturned, returnToSupply, takeResourceAt } from './board';
import { hasPassive, isDeclared, ownedEffects } from './effects';
import { declareAmbition } from './ambitions';
import type { ContentIndex } from './setup';
import type { AmbitionId, GameState, PlayerId, Resource, ShipStack, SystemState } from './types';

/** Places up to `n` fresh ships from the player's supply in a system. Returns how many were placed. */
export function placeShips(s: GameState, p: PlayerId, system: string, n: number): number {
  const sys = s.map[system] ?? fail(`Unknown system ${system}`);
  if (!sys.inPlay) fail(`System ${system} is out of play`);
  const pl = s.players[p];
  const k = Math.min(n, pl.supply.ships);
  pl.supply.ships -= k;
  stackOf(sys, p).fresh += k;
  return k;
}

/** Strictly more fresh ships in the system than every other player. */
export function controlsSystem(sys: SystemState, p: PlayerId): boolean {
  const mine = sys.ships[p]?.fresh ?? 0;
  if (mine < 1) return false;
  return Object.entries(sys.ships).every(([k, v]) => Number(k) === p || v.fresh < mine);
}

export function stackOf(sys: SystemState, p: PlayerId): ShipStack {
  return (sys.ships[p] ??= { fresh: 0, damaged: 0 });
}

/**
 * Why `thief` cannot steal this from `victim`, or null if allowed.
 * Raiding with keys is stealing; Trade-like swaps are not (they never call this).
 */
export function stealBlocked(ix: ContentIndex, s: GameState, thief: PlayerId, victim: PlayerId, what: { resource: Resource } | { card: string }): string | null {
  if (thief === victim) return null;
  const guards = ownedEffects(ix, s, victim);
  if ('resource' in what) {
    if (guards.some((g) => g.effect.guardsSteals)) return `P${victim}'s resources are protected from stealing`;
    const w = guards.find((g) => g.effect.guardResourcesWhile && isDeclared(s, g.effect.guardResourcesWhile));
    if (w && heldResources(s.players[thief]).includes(what.resource)) return `P${victim} is protected: you already hold ${what.resource}`;
    return null;
  }
  // Guild cards: the guard card itself may be stolen (then it is buried), the others may not.
  const guard = guards.find((g) => g.effect.guardsSteals);
  if (guard && guard.card !== what.card) return `P${victim}'s Guild cards are protected from stealing`;
  const type = ix.courtCards.get(what.card)?.resource;
  const w = guards.find((g) => g.effect.guardGuildWhile && isDeclared(s, g.effect.guardGuildWhile));
  if (w && type && heldResources(s.players[victim]).includes(type)) return `P${victim} holds ${type}: that Guild card cannot be stolen`;
  return null;
}

/** Steals the resource on `slot` from a Rival. A token the thief cannot hold goes back to the supply. */
export function stealResource(ix: ContentIndex, s: GameState, thief: PlayerId, victim: PlayerId, slot: number): Resource {
  const r = s.players[victim].resources[slot] ?? fail(`P${victim} has no resource on slot ${slot}`);
  const why = stealBlocked(ix, s, thief, victim, { resource: r });
  if (why) fail(why);
  takeResourceAt(s.players[victim], slot);
  if (!gainResource(ix.content, s.players[thief], r)) returnToSupply(s, r);
  return r;
}

/** Steals the first resource of a type from a Rival; false if they have none. */
export function stealResourceOfType(ix: ContentIndex, s: GameState, thief: PlayerId, victim: PlayerId, r: Resource): boolean {
  const slot = s.players[victim].resources.indexOf(r);
  if (slot < 0) return false;
  stealResource(ix, s, thief, victim, slot);
  return true;
}

/** Steals a Guild card from a Rival. A guard card that gets stolen is buried instead. */
export function stealGuild(ix: ContentIndex, s: GameState, thief: PlayerId, victim: PlayerId, card: string): void {
  const v = s.players[victim];
  if (!v.court.includes(card)) fail(`P${victim} has no ${card}`);
  const why = stealBlocked(ix, s, thief, victim, { card });
  if (why) fail(why);
  v.court.splice(v.court.indexOf(card), 1);
  if (isGuard(ix, card)) s.courtDeck.push(card);
  else s.players[thief].court.push(card);
}

function isGuard(ix: ContentIndex, card: string): boolean {
  const id = ix.courtCards.get(card)?.effect;
  return !!(id && ix.effects[id]?.guardsSteals);
}

/**
 * Provoke Outrage of a type (design/gdd/core-loop.md §3.10): discard all
 * resources and Guild cards of that type (cards with `keepOnOutrage` stay),
 * then cover the Outrage icon with an agent (already Outraged: no new agent).
 */
export function provokeOutrage(ix: ContentIndex, s: GameState, p: PlayerId, type: Resource): void {
  const d = s.players[p];
  d.resources.forEach((r, i) => {
    if (r === type) returnToSupply(s, takeResourceAt(d, i));
  });
  const lost = d.court.filter((id) => {
    const def = ix.courtCards.get(id);
    if (def?.resource !== type) return false;
    return !(def.effect && ix.effects[def.effect]?.keepOnOutrage);
  });
  d.court = d.court.filter((id) => !lost.includes(id));
  s.courtDiscard.push(...lost);
  if (!d.outraged.includes(type)) {
    // Cover the icon with an agent (a placeholder if none is left: still Outraged).
    if (d.supply.agents > 0) d.supply.agents -= 1;
    d.outraged.push(type);
  }
}

/** Clears an Outrage: the covering agent returns to its owner. */
export function clearOutrage(s: GameState, p: PlayerId, type: Resource): void {
  const pl = s.players[p];
  if (!pl.outraged.includes(type)) fail(`${type} is not Outraged`);
  pl.outraged = pl.outraged.filter((x) => x !== type);
  pl.supply.agents += 1;
}

/** Seizes the initiative, unless the player holds it or it is already seized this round. */
export function seize(s: GameState, p: PlayerId): void {
  if (s.initiative === p) fail('You already hold the initiative');
  if (s.round.seizedBy !== null) fail('The initiative is already seized this round');
  s.round.seizedBy = p;
}

/** Returns a city on the map to its owner's player board (covering slots again). */
export function returnCity(ix: ContentIndex, s: GameState, system: string, index: number): PlayerId {
  const sys = s.map[system] ?? fail(`Unknown system ${system}`);
  const b = sys.buildings[index];
  if (!b || b.type !== 'city') fail(`No city at ${system}#${index}`);
  sys.buildings.splice(index, 1);
  const owner = s.players[b.owner];
  owner.supply.cities += 1;
  returnToSupply(s, ...onCityReturned(ix.content, owner));
  return b.owner;
}

/** A planet's resource type, after any card that changed it for good. */
export function planetType(ix: ContentIndex, s: GameState, system: string): Resource | undefined {
  return s.planetTypes?.[system] ?? ix.content.map.systems.find((x) => x.id === system)?.resource;
}

/**
 * The resource types of a city in this system: the planet type, or for a city
 * on a gate (card effect) every type of the cities in its cluster.
 */
export function cityTypes(ix: ContentIndex, s: GameState, system: string): Resource[] {
  const def = ix.content.map.systems.find((x) => x.id === system);
  if (!def) return [];
  if (def.kind === 'planet') {
    const t = planetType(ix, s, system);
    return t ? [t] : [];
  }
  const types = new Set<Resource>();
  for (const x of ix.content.map.systems) {
    if (x.cluster !== def.cluster || x.kind !== 'planet') continue;
    const t = planetType(ix, s, x.id);
    if (t && s.map[x.id].buildings.some((b) => b.type === 'city')) types.add(t);
  }
  return [...types];
}

/** True if the player holds a card with this passive (re-exported for rules code). */
export { hasPassive };

export function fail(msg: string): never {
  throw new RuleError(msg);
}

/** Returns a trophy (by index) to its owner's supply; a city covers its board slots again. */
export function returnTrophy(ix: ContentIndex, s: GameState, holder: PlayerId, index: number): void {
  const h = s.players[holder];
  const t = h.trophies[index] ?? fail(`No trophy #${index}`);
  h.trophies.splice(index, 1);
  const owner = s.players[t.owner];
  if (t.piece === 'ship') owner.supply.ships += 1;
  else if (t.piece === 'starport') owner.supply.starports += 1;
  else if (t.piece === 'agent') owner.supply.agents += 1;
  else {
    owner.supply.cities += 1;
    returnToSupply(s, ...onCityReturned(ix.content, owner));
  }
}

/** Returns a captive (by index) to its owner's supply. */
export function returnCaptive(s: GameState, holder: PlayerId, index: number): PlayerId {
  const h = s.players[holder];
  if (index < 0 || index >= h.captives.length) fail(`No captive #${index}`);
  const [owner] = h.captives.splice(index, 1);
  s.players[owner].supply.agents += 1;
  return owner;
}

/** Weapon icons: held Weapons tokens plus Guild cards of the Weapons type. */
export function weaponIcons(ix: ContentIndex, s: GameState, p: PlayerId, weapons: Resource = 'weapons'): number {
  const pl = s.players[p];
  return heldResources(pl).filter((r) => r === weapons).length + pl.court.filter((id) => ix.courtCards.get(id)?.resource === weapons).length;
}

/** Declares an ambition outside a lead (card effects): takes the best available marker; nothing is zeroed. */
export function declareAmbitionMarker(s: GameState, a: AmbitionId): string {
  if (!s.ambitions.available.length) fail('No ambition markers left');
  if (!(a in s.ambitions.declared)) fail(`Unknown ambition ${a}`);
  return declareAmbition(s, a);
}
