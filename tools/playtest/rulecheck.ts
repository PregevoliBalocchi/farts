// Rule checks between two states (production/piano-blindatura-tavolo-2026-11-25.md, Fase 0.5): what the
// rulebook (docs/rules/arcs-rules-library.txt) keeps true from one command to the next. Each check names
// its rule and works it out on its own, not with the engine's functions, so it can catch the engine.
// They only observe: the playtest simulator records what they say and a test gives the verdict.
// Campaign games follow their own rulebook and are not checked here.

import { emptyAmbitionBoard } from '../../src/game/engine/ambitions';
import type { ContentIndex } from '../../src/game/engine/setup';
import { AMBITIONS, type GameState, type PlayerId } from '../../src/game/engine/types';

/** One broken rule: a short key (for grouping) and what was seen. */
export interface RuleBreak {
  rule: string;
  detail: string;
}

/** Action cards in play: hands, deck, discard and the cards played this round. */
function actionCardCount(s: GameState): number {
  return s.players.reduce((n, p) => n + p.hand.length, 0) + s.deck.length + s.discard.length + s.round.plays.filter((p) => p.card).length;
}

/** Ambition markers on the board, declared or still available. */
function markerCount(s: GameState): number {
  return s.ambitions.available.length + AMBITIONS.reduce((n, a) => n + s.ambitions.declared[a].length, 0);
}

/** The first seat clockwise from `from` (itself included) with cards in hand, or null. */
function nextWithCards(s: GameState, from: PlayerId): PlayerId | null {
  for (let i = 0; i < s.playerCount; i++) {
    const p = (from + i) % s.playerCount;
    if (s.players[p].hand.length > 0) return p;
  }
  return null;
}

/** 5.3.1–5.3.2: the seizer keeps the initiative; else the highest Surpass takes it; else the holder keeps it. */
function initiativeAfter(ix: ContentIndex, s: GameState): PlayerId {
  if (s.round.seizedBy !== null) return s.round.seizedBy;
  let best = -1;
  let who = s.round.leader;
  for (const pl of s.round.plays) {
    if (pl.mode !== 'surpass' || !pl.card) continue;
    const n = ix.actionCards.get(pl.card)?.number ?? -1;
    if (n > best) {
      best = n;
      who = pl.player;
    }
  }
  return who;
}

/**
 * The rules `next` breaks, given the state `prev` it came from with one command. Empty when every
 * checked rule holds. Pure: reads both states, changes neither.
 */
export function ruleChecks(ix: ContentIndex, prev: GameState, next: GameState): RuleBreak[] {
  if (prev.campaign || next.campaign) return [];
  const c = ix.content;
  const n = next.playerCount;
  const out: RuleBreak[] = [];
  const sameChapter = prev.chapter === next.chapter;
  const over = next.phase.type === 'gameOver';
  const newChapter = next.chapter > prev.chapter;
  const chapterEnded = newChapter || (over && prev.phase.type !== 'gameOver');

  // 5.2.1 Turn order: the lead first, then clockwise from the leader (players without cards skip).
  let lastOffset = -1;
  next.round.plays.forEach((pl, i) => {
    const offset = (pl.player - next.round.leader + n) % n;
    if (offset <= lastOffset) out.push({ rule: 'turn-order', detail: `play ${i + 1} of the round by P${pl.player} after P${(next.round.leader + lastOffset) % n} (leader P${next.round.leader})` });
    lastOffset = offset;
    if (i > 0 && pl.mode === 'lead') out.push({ rule: 'turn-order', detail: `play ${i + 1} of the round is a second lead` });
  });

  // 5.2.2 Surpass: the lead suit and a higher number than the lead card (0 once an ambition is declared on it).
  // Pivot: a different suit.
  const lead = next.round.plays.find((pl) => pl.mode === 'lead');
  const leadDef = lead?.card ? ix.actionCards.get(lead.card) : undefined;
  if (lead && leadDef) {
    const leadNumber = lead.zeroed ? 0 : leadDef.number;
    for (const pl of next.round.plays) {
      if (!pl.card || (pl.mode !== 'surpass' && pl.mode !== 'pivot')) continue;
      const def = ix.actionCards.get(pl.card);
      if (!def) continue;
      if (pl.mode === 'surpass' && (def.suit !== leadDef.suit || def.number <= leadNumber)) out.push({ rule: 'surpass', detail: `P${pl.player} surpassed ${leadDef.id} (${leadNumber}) with ${def.id}` });
      if (pl.mode === 'pivot' && def.suit === leadDef.suit) out.push({ rule: 'pivot', detail: `P${pl.player} pivoted with ${def.id}, of the lead suit` });
    }
  }

  // 5.3 Initiative at the round's end; a holder without cards passes it clockwise (5.2.1: they skip).
  const roundOver = sameChapter && !over && prev.round.plays[0]?.mode === 'lead' && next.round.plays.length < prev.round.plays.length;
  if (roundOver) {
    const want = nextWithCards(next, initiativeAfter(ix, prev));
    if (want !== null && next.initiative !== want) out.push({ rule: 'initiative', detail: `P${next.initiative} has the initiative, the round gave it to P${want}` });
  }

  // 5.4.1 and 6.2.4: action cards move between hands, the deck, the discard and the table; none appear or vanish.
  const cardsBefore = actionCardCount(prev);
  const cardsAfter = actionCardCount(next);
  if (cardsBefore !== cardsAfter) out.push({ rule: 'card-count', detail: `${cardsBefore} action cards before, ${cardsAfter} after` });

  // 6.2.4 Each player draws a full hand when a chapter begins.
  if (newChapter && !over) {
    for (const p of next.players) if (p.hand.length !== c.handSize) out.push({ rule: 'hand-size', detail: `P${p.id} starts chapter ${next.chapter} with ${p.hand.length} cards, not ${c.handSize}` });
  }

  // 5.1.3 Ambition markers: the chapter's set stays on the board; a declaration takes the highest one left.
  if (sameChapter) {
    const all = emptyAmbitionBoard(c, next.chapter).available.length;
    if (markerCount(next) !== all) out.push({ rule: 'ambition-markers', detail: `${markerCount(next)} markers on the board, not ${all}` });
    const placed = (s: GameState) => AMBITIONS.flatMap((a) => s.ambitions.declared[a]);
    const fresh = placed(next).filter((m) => !placed(prev).includes(m));
    if (fresh.length === 1 && fresh[0] !== prev.ambitions.available[0]) out.push({ rule: 'ambition-markers', detail: `declared marker ${fresh[0]}, the highest left was ${prev.ambitions.available[0]}` });
  }

  // 6.2.1 Scoring: the Power after scoring is the Power before it plus what the ambitions gave.
  const sc = next.lastScoring;
  if (chapterEnded && sc && sc.chapter === prev.chapter) {
    for (const p of prev.players) {
      const want = p.power + (sc.gains[p.id] ?? 0);
      if (sc.power[p.id] !== want) out.push({ rule: 'scoring', detail: `P${p.id} scored to ${sc.power[p.id]}; ${p.power} + ${sc.gains[p.id]} is ${want}` });
    }
  }

  // 6.2.2 Clean up: if Warlord was scored, all trophies return; if Tyrant was scored, all captives.
  if (chapterEnded) {
    for (const kind of ['trophies', 'captives'] as const) {
      const scored = AMBITIONS.some((a) => c.ambitionMetrics[a].kind === kind && prev.ambitions.declared[a].length > 0);
      if (scored) for (const p of next.players) if (p[kind].length) out.push({ rule: 'clean-up', detail: `P${p.id} keeps ${p[kind].length} ${kind} after a chapter that scored them` });
    }
  }

  // 6.2.3 The game ends when a chapter ends with someone at the Power to win, or after the last chapter.
  if (chapterEnded) {
    const target = c.powerToWin[n];
    const reached = next.players.some((p) => p.power >= target);
    const last = prev.chapter >= c.chapters;
    if (over && !reached && !last) out.push({ rule: 'game-end', detail: `the game ended after chapter ${prev.chapter} with nobody at ${target} Power` });
    if (!over && (reached || last)) out.push({ rule: 'game-end', detail: `chapter ${next.chapter} began although ${reached ? `someone has ${target} Power` : 'the last chapter ended'}` });
  }

  // Secure, step 3: a card leaving the Court is replaced from the Court deck while it has cards.
  const size = c.courtSize[n];
  if (next.court.length < size && next.courtDeck.length > 0) out.push({ rule: 'court', detail: `${next.court.length} Court cards with ${next.courtDeck.length} in the Court deck` });

  return out;
}
