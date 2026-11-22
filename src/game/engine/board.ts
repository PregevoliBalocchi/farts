// Player board: resource slots, the keys printed above them, and the unbuilt
// cities that cover slots until built (design/gdd/core-loop.md §3.7).
//
// `PlayerState.resources` is indexed by slot: `resources[i]` is the token on
// slot i, or null/undefined when empty.

import type { GameContent, GameState, PlayerState, Resource } from './types';

/** Cities this player has on the map (taken from the board, leftmost first). */
export function citiesBuilt(c: GameContent, p: PlayerState): number {
  return c.citiesPerPlayer - p.supply.cities;
}

/** Slot indices currently usable: the base ones plus those freed by built cities. */
export function openSlots(c: GameContent, p: PlayerState): number[] {
  const b = c.playerBoard;
  const open = new Set(b.baseSlots);
  b.cityUnlocks.slice(0, citiesBuilt(c, p)).forEach((slots) => slots.forEach((i) => open.add(i)));
  return [...open].sort((x, y) => x - y);
}

/** Tokens held, in slot order. */
export function heldResources(p: PlayerState): Resource[] {
  return p.resources.filter((r): r is Resource => !!r);
}

/** Puts a token in the leftmost free open slot. Returns false when there is no room. */
export function gainResource(c: GameContent, p: PlayerState, r: Resource): boolean {
  const free = openSlots(c, p).find((i) => !p.resources[i]);
  if (free === undefined) return false;
  p.resources[free] = r;
  return true;
}

/** Takes a token from the general supply into the player's board. False if the supply is out or no slot is free. */
export function gainFromSupply(c: GameContent, s: GameState, p: PlayerState, r: Resource): boolean {
  if ((s.resourceSupply[r] ?? 0) < 1) return false;
  if (!gainResource(c, p, r)) return false;
  s.resourceSupply[r] -= 1;
  return true;
}

/** Puts tokens back into the general supply. */
export function returnToSupply(s: GameState, ...rs: Resource[]): void {
  for (const r of rs) s.resourceSupply[r] = (s.resourceSupply[r] ?? 0) + 1;
}

/** Removes the token on slot `i` and returns it. */
export function takeResourceAt(p: PlayerState, i: number): Resource {
  const r = p.resources[i];
  if (!r) throw new Error(`No resource on slot ${i}`);
  p.resources[i] = null;
  return r;
}

/** Keys a raider pays for the token on slot `i`. */
export function slotKeys(c: GameContent, i: number): number {
  return c.playerBoard.slotKeys[i] ?? 1;
}

/** Power bonus per won ambition from the bonus spaces this player's built cities uncovered. */
export function cityBonusPower(c: GameContent, p: PlayerState): number {
  const b = c.playerBoard;
  const uncovered = b.cityBonusPower.slice(0, citiesBuilt(c, p)).filter((v) => v > 0);
  if (!uncovered.length) return 0;
  return b.bonusMode === 'highest' ? Math.max(...uncovered) : uncovered.reduce((x, y) => x + y, 0);
}

/**
 * A city came back to the board: slots it covers again lose or move their token
 * (`cityReturnResource`). Call after `supply.cities` was incremented.
 */
export function onCityReturned(c: GameContent, p: PlayerState): Resource[] {
  const open = new Set(openSlots(c, p));
  const displaced: Resource[] = [];
  p.resources.forEach((r, i) => {
    if (r && !open.has(i)) {
      p.resources[i] = null;
      displaced.push(r);
    }
  });
  if (c.playerBoard.cityReturnResource === 'move') {
    return displaced.filter((r) => !gainResource(c, p, r));
  }
  return displaced;
}
