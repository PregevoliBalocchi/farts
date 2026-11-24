// The campaign's foundations (design/campaign-plan.md §2.1, milestone M1):
// its state, and who controls a system once the Empire is on the map.
// Rules: docs/rules/Arcs_Campaign_Rulebook_for_web.txt, quoted by page.

import { RuleError } from './errors';
import type { BookletSide, CampaignState, CourtSlot, GameState, PlayerId, ShipStack, SystemState, Title } from './types';

/** The campaign's general supply at the start of a campaign (campaign rulebook p. 3). */
export const CAMPAIGN_SUPPLY: CampaignState['supply'] = { imperialShips: 15, blight: 24, freeCities: 28, freeStarports: 14 };

/**
 * A new campaign's state: Act I, everyone a Regent with no First Regent yet,
 * an empty Imperial Trust, no Favors, the Imperial Council In Session
 * (p. 5-6: "Each player ... Regent side up"; the Council "In Session side").
 */
export function newCampaign(playerCount: number, supply: CampaignState['supply'] = CAMPAIGN_SUPPLY): CampaignState {
  return {
    act: 1,
    imperialClusters: [],
    placements: [],
    titles: Array.from({ length: playerCount }, (): Title => 'regent'),
    firstRegent: null,
    trust: [],
    favors: Array.from({ length: playerCount }, () => []),
    fates: Array.from({ length: playerCount }, () => null),
    objective: Array.from({ length: playerCount }, () => null),
    booklet: { edicts: [], laws: [] },
    council: 'in-session',
    scrapped: [],
    supply: { imperialShips: supply.imperialShips, blight: supply.blight, freeCities: supply.freeCities, freeStarports: supply.freeStarports },
  };
}

/** Fresh pieces in a stack (0 when there is none). */
const fresh = (st: ShipStack | undefined): number => st?.fresh ?? 0;

/** p. 10: "The Empire controls all systems that have any number of fresh Imperial ships, ignoring all players' Loyal ships." */
export function empireControls(sys: SystemState): boolean {
  return fresh(sys.imperial) > 0;
}

/** A player's Loyal pieces in the system: ships or buildings of their colour (p. 10, Presence Law). */
export function hasLoyalPresence(sys: SystemState, p: PlayerId): boolean {
  const st = sys.ships[p];
  return (st ? st.fresh + st.damaged : 0) > 0 || sys.buildings.some((b) => b.owner === p);
}

/** Base game: strictly more fresh ships than every other player. */
function playerController(sys: SystemState): PlayerId | null {
  let best: PlayerId | null = null;
  let top = 0;
  let tie = false;
  for (const [k, v] of Object.entries(sys.ships)) {
    if (v.fresh > top) {
      top = v.fresh;
      best = Number(k);
      tie = false;
    } else if (v.fresh === top && top > 0) tie = true;
  }
  return tie ? null : best;
}

/**
 * Why control is asked: 'turn' for what the player whose turn it is may do
 * there (actions, taxing, building fresh or damaged); 'scoring' for ambitions,
 * objectives and events.
 */
export type ControlPurpose = 'turn' | 'scoring';

/**
 * Who controls a system: a player, 'empire', or null (nobody).
 *
 * Base game (no campaign, or no fresh Imperial ship here): the player with
 * strictly the most fresh ships. With the Empire present (p. 10):
 * - for ambitions, objectives and events the First Regent controls it ("The
 *   First Regent controls all Empire-controlled systems for the purpose of
 *   ambitions, objectives, and events"), or the Empire if there is none;
 * - on a Regent's turn, that Regent controls it if they have Loyal pieces
 *   there (Presence Law: "In systems with Loyal pieces, they control the
 *   system if it is Empire-controlled"), or everywhere when a rule lets them
 *   ignore the Presence Law (`ignorePresence`);
 * - otherwise the Empire controls it (an Outlaw there builds damaged).
 */
export function controllerOf(
  s: GameState,
  sys: SystemState,
  ask: { purpose: ControlPurpose; turnOf?: PlayerId; ignorePresence?: boolean },
): PlayerId | 'empire' | null {
  const c = s.campaign;
  if (!c || !empireControls(sys)) return playerController(sys);
  if (ask.purpose === 'scoring') return c.firstRegent ?? 'empire';
  const p = ask.turnOf;
  if (p !== undefined && c.titles[p] === 'regent' && (ask.ignorePresence || hasLoyalPresence(sys, p))) return p;
  return 'empire';
}

/**
 * Whether `p` controls the system on their own turn: the campaign's
 * viewpoint control (controllerOf), or the base rule without a campaign.
 */
export function controlsOnTurn(s: GameState, sys: SystemState, p: PlayerId, ignorePresence = false): boolean {
  return controllerOf(s, sys, { purpose: 'turn', turnOf: p, ignorePresence }) === p;
}

/**
 * Whether a piece built there by `p` arrives damaged: someone else controls
 * the system on `p`'s turn (a Rival, or the Empire: p. 10, "On the Outlaw's
 * turn, the system is controlled by the Empire, so they build pieces damaged").
 */
export function buildsDamaged(s: GameState, sys: SystemState, p: PlayerId): boolean {
  const c = controllerOf(s, sys, { purpose: 'turn', turnOf: p });
  return c !== null && c !== p;
}

/**
 * Presence Law (p. 10): on a Regent's turn, in an Empire-controlled system
 * with their Loyal pieces, they Command the Imperial Fleet: "move and repair
 * them, battle with them, build at them, and tax cities they control".
 * Outlaws never do.
 */
export function commandsImperial(s: GameState, sys: SystemState, p: PlayerId, ignorePresence = false): boolean {
  const c = s.campaign;
  if (!c || c.titles[p] !== 'regent' || !empireControls(sys)) return false;
  return ignorePresence || hasLoyalPresence(sys, p);
}

/** Imperial ships in a system, fresh and damaged (Truce Law: "in systems with Imperial ships", p. 11). */
export function imperialCount(sys: SystemState): number {
  return (sys.imperial?.fresh ?? 0) + (sys.imperial?.damaged ?? 0);
}

/**
 * Truce Law (p. 11): "Regents cannot harm Imperial ships except for hits they
 * take as attacking ships in battle, and they cannot harm or tax Rival
 * Regents in systems with Imperial ships."
 */
export function truceForbids(s: GameState, sys: SystemState, actor: PlayerId, other: PlayerId): boolean {
  const c = s.campaign;
  return !!c && actor !== other && c.titles[actor] === 'regent' && c.titles[other] === 'regent' && imperialCount(sys) > 0;
}

/** True if `p` controls the system for that purpose (see controllerOf). */
export function controlsFor(s: GameState, sys: SystemState, p: PlayerId, ask: { purpose: ControlPurpose; ignorePresence?: boolean }): boolean {
  return controllerOf(s, sys, { ...ask, turnOf: ask.purpose === 'turn' ? p : undefined }) === p;
}

/**
 * Whether a gate stops a Catapult move here (p. 10, and Blight p. 19):
 * - Blight in the gate ends every Catapult move ("as if a Rival controlled it");
 * - Empire control ends Outlaws' moves, not Regents' or Imperial pieces';
 * - a Regent's control ends Outlaws' moves and Rival Regents' pieces moving
 *   alone, not Imperial pieces or mixed Regent and Imperial groups;
 * - an Outlaw's control ends Regents' and Imperial pieces' moves alike;
 * - base game: a Rival's control ends the move.
 * `mover` is the moving player; `withImperial` whether Imperial ships move with them.
 */
export function catapultStops(s: GameState, sys: SystemState, mover: PlayerId, withImperial: boolean): boolean {
  if ((sys.blight?.fresh ?? 0) + (sys.blight?.damaged ?? 0) > 0) return true;
  const c = s.campaign;
  const ctrl = controllerOf(s, sys, { purpose: 'turn', turnOf: mover });
  if (ctrl === null || ctrl === mover) return false;
  if (!c) return true;
  const outlaw = c.titles[mover] === 'outlaw';
  if (ctrl === 'empire') return outlaw;
  if (c.titles[ctrl] === 'outlaw') return true;
  return outlaw || !withImperial;
}

// ---------------------------------------------------------------------------
// The Court in the campaign: the Imperial Council (p. 14) and attached cards (p. 27).

/** The Imperial Council's Court card id (campaign.doubleSided `imperial-council`). */
export const IMPERIAL_COUNCIL = 'imperial-council';

/** True for the Imperial Council card. */
export const isCouncil = (card: string): boolean => card === IMPERIAL_COUNCIL;

/**
 * Whether a Court card can be influenced and secured (Ransack included: base
 * rulebook p. 16, "Ransack the Court. Secure any card ..."). p. 14: "While it
 * is Decided, players cannot influence or secure it."
 */
export function securable(s: GameState, slot: CourtSlot): boolean {
  return !(isCouncil(slot.card) && s.campaign?.council === 'decided');
}

/**
 * Attaches a card above a Court card (p. 27): "place above a card in the
 * Court that does not have an attached card". The Imperial Council takes
 * attached cards too, "even if it's flipped to Decided" (p. 14).
 */
export function attachToCourt(s: GameState, slotIndex: number, card: string): void {
  const slot = s.court[slotIndex] ?? fail('No such Court slot');
  if (slot.attached) fail(`${slot.card} already has an attached card`);
  slot.attached = card;
}

/**
 * Removes a Court card other than by securing it (buried, scrapped,
 * discarded, returned to the deck) and returns its id. p. 27: "If a card is
 * removed from the Court in any way and it has an attached card, refill the
 * Court by sliding down the attached card. Place all agents from the removed
 * card onto the previously attached card." Without an attached card, the
 * Court refills from the deck in the same spot. The Imperial Council "cannot
 * be buried, scrapped, or discarded" (p. 14).
 */
export function removeFromCourt(s: GameState, slotIndex: number): string {
  const slot = s.court[slotIndex] ?? fail('No such Court slot');
  if (isCouncil(slot.card)) fail('The Imperial Council cannot be buried, scrapped or discarded');
  if (slot.attached) {
    s.court[slotIndex] = { card: slot.attached, agents: slot.agents };
    return slot.card;
  }
  s.court.splice(slotIndex, 1);
  const refill = s.courtDeck.shift();
  if (refill) s.court.splice(Math.min(slotIndex, s.court.length), 0, { card: refill, agents: {} });
  return slot.card;
}

/** Removes the card attached above a Court card (p. 27: "nothing happens to the card it was attached to"). */
export function detachFromCourt(s: GameState, slotIndex: number): string {
  const slot = s.court[slotIndex] ?? fail('No such Court slot');
  const card = slot.attached ?? fail(`${slot.card} has no attached card`);
  delete slot.attached;
  return card;
}

/**
 * Securing the Imperial Council (p. 14): "flip it to Decided and tuck it
 * under your played card as a reminder to resolve it later". It is out of
 * the Court until the round ends; the Court does not refill for it (it is
 * not one of the Court row's cards: setup deals the row, then places the
 * Council as the leftmost card, p. 5 steps I and K).
 */
export function secureCouncil(s: GameState, p: PlayerId): string {
  const c = s.campaign ?? fail('The Imperial Council is a campaign card');
  c.council = 'decided';
  c.councilTucked = p;
  return '; the Imperial Council is Decided, tucked under the played card until the round ends';
}

/**
 * At the end of the round the Imperial Council goes back to the Court as its
 * leftmost card, Decided side up (p. 14: "return the Imperial Council card to
 * the Court on its Decided side, then resolve the following"). Returns who
 * secured it (they resolve its four steps), or null if it was not tucked.
 */
export function returnCouncil(s: GameState): PlayerId | null {
  const c = s.campaign;
  if (c?.councilTucked === undefined) return null;
  const p = c.councilTucked;
  delete c.councilTucked;
  s.court.unshift({ card: IMPERIAL_COUNCIL, agents: {} });
  return p;
}

/**
 * Petition the Council (p. 16): flip it to In Session. p. 14: "If it flips
 * while tucked under a card, return it to the Court" — and then it does not
 * resolve at the end of the round ("Flipping the Council stops it from
 * resolving at the end of the round!").
 */
export function petitionCouncil(s: GameState): void {
  const c = s.campaign ?? fail('The Imperial Council is a campaign card');
  c.council = 'in-session';
  returnCouncil(s);
}

// ---------------------------------------------------------------------------
// The rules booklet (p. 9, 20).

/**
 * Adds cards to the rules booklet, in a new slot at the end of that side, or
 * on top of the stack in `slot` (top card first). p. 9: "As you add cards to
 * this booklet, make sure to explain them aloud, since these rules affect
 * everyone": the log entry carries `announce` so every seat is shown them.
 */
export function addToBooklet(s: GameState, side: BookletSide, cards: string[], slot?: number): void {
  const c = s.campaign ?? fail('The rules booklet is a campaign component');
  if (!cards.length) return;
  const pages = c.booklet[side];
  if (slot === undefined) pages.push([...cards]);
  else (pages[slot] ?? fail('No such slot in the rules booklet')).unshift(...cards);
  s.log.push({ chapter: s.chapter, text: `Rules booklet: ${cards.join(', ')} added; explain it to everyone`, data: { announce: cards } });
}

/** Takes a card out of the rules booklet (scrapped, or replaced); an emptied slot is dropped. */
export function removeFromBooklet(s: GameState, card: string): void {
  const c = s.campaign ?? fail('The rules booklet is a campaign component');
  for (const side of ['edicts', 'laws'] as const) {
    const pages = c.booklet[side];
    const i = pages.findIndex((stack) => stack.includes(card));
    if (i < 0) continue;
    pages[i] = pages[i].filter((x) => x !== card);
    if (!pages[i].length) pages.splice(i, 1);
    return;
  }
  fail(`${card} is not in the rules booklet`);
}

/**
 * The Edicts in force, in the order they resolve (p. 20: "Resolve all Edicts
 * in order from lowest number to highest"): the top card of each Edict slot,
 * sorted by its printed number (`orderOf`: campaign.edicts / fateCards `order`).
 */
export function edictsInOrder(s: GameState, orderOf: (card: string) => number): string[] {
  const tops = (s.campaign?.booklet.edicts ?? []).map((stack) => stack[0]);
  return tops.map((card, i) => ({ card, i })).sort((a, b) => orderOf(a.card) - orderOf(b.card) || a.i - b.i).map((x) => x.card);
}

function fail(msg: string): never {
  throw new RuleError(msg);
}
