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

/**
 * The raid cost of every slot the player has: the board's, then those on the lore cards they hold
 * (Ancient Holdings, lore-13: "one resource slot with a raid cost of 4"; content `holds`), in card order.
 * Card slots come after the board's, so `resources[i]` past the board is a token on a card.
 */
export function allSlotKeys(c: GameContent, p: PlayerState): number[] {
  const onCards = (p.lore ?? []).flatMap((id) => {
    const h = c.loreCards?.find((l) => l.id === id)?.holds;
    return h ? Array.from({ length: h.resourceSlots }, () => h.keys) : [];
  });
  return [...c.playerBoard.slotKeys, ...onCards];
}

/** Slot indices currently usable: the base ones, those freed by built cities, and those on held cards. */
export function openSlots(c: GameContent, p: PlayerState): number[] {
  const b = c.playerBoard;
  const open = new Set(b.baseSlots);
  b.cityUnlocks.slice(0, citiesBuilt(c, p)).forEach((slots) => slots.forEach((i) => open.add(i)));
  for (let i = b.slotKeys.length; i < allSlotKeys(c, p).length; i++) open.add(i);
  return [...open].sort((x, y) => x - y);
}

/** Tokens held, in slot order. */
export function heldResources(p: PlayerState): Resource[] {
  return p.resources.filter((r): r is Resource => !!r);
}

/**
 * The player takes or is given a token: it goes on the leftmost free open
 * slot, or aside (`overflow`) when none is free. Either way the player may
 * then rearrange their tokens (`arrangeResources`) until their next other
 * command, when what is still aside is discarded (`endArranging`). Always true:
 * the token is the player's until then.
 */
export function gainResource(c: GameContent, p: PlayerState, r: Resource): boolean {
  p.arranging = true;
  const free = openSlots(c, p).find((i) => !p.resources[i]);
  if (free === undefined) (p.overflow ??= []).push(r);
  else p.resources[free] = r;
  return true;
}

/**
 * Rearranges the player's tokens: `slots[i]` is the token to put on slot i
 * (null: empty). Allowed only while `arranging`; tokens go on open slots only,
 * they are the ones held (on slots or aside), and none stays aside while an
 * open slot is free. What is not placed stays aside. Returns why it is refused,
 * or null when done.
 */
export function arrangeResources(c: GameContent, p: PlayerState, slots: readonly (Resource | null | undefined)[]): string | null {
  if (!p.arranging) return 'Resources can be rearranged only when you gain one or a returning city covers a slot';
  const open = new Set(openSlots(c, p));
  const pool = [...heldResources(p), ...(p.overflow ?? [])];
  const left = [...pool];
  let placed = 0;
  for (let i = 0; i < slots.length; i++) {
    const r = slots[i];
    if (!r) continue;
    if (!open.has(i)) return 'A resource can only go on an open slot';
    const at = left.indexOf(r);
    if (at < 0) return 'You can only rearrange the resources you hold';
    left.splice(at, 1);
    placed++;
  }
  if (placed < Math.min(pool.length, open.size)) return 'Every resource must be on a slot while one is free';
  p.resources = allSlotKeys(c, p).map((_, i) => slots[i] ?? null);
  if (left.length) p.overflow = left;
  else delete p.overflow;
  return null;
}

/** The player's chance to rearrange ends: tokens still aside go back to the supply. */
export function endArranging(s: GameState, p: PlayerState): void {
  if (p.overflow?.length) returnToSupply(s, ...p.overflow);
  delete p.overflow;
  delete p.arranging;
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

/** Keys a raider pays for the token on slot `i` (of player `p`, for a slot on a card they hold). */
export function slotKeys(c: GameContent, i: number, p?: PlayerState): number {
  return (p ? allSlotKeys(c, p) : c.playerBoard.slotKeys)[i] ?? 1;
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
  // The covered slot (even an empty one) lets the player rearrange; displaced tokens that find no slot wait aside.
  p.arranging = true;
  if (c.playerBoard.cityReturnResource === 'move') {
    return displaced.filter((r) => !gainResource(c, p, r));
  }
  return displaced;
}
