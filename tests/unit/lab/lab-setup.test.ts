// The test lab (src/ui/table/lab.ts): every leader, lore, Court card and action card
// of data/content.json gets a game ready to try it, with no piece or card made up.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { activePlayer, indexContent, newGame, pieceLedger } from '../../../src/game/engine';
import type { GameContent, GameState } from '../../../src/game/engine';
import { BASE_EFFECTS } from '../../../src/game/cards/base';
import { LAB, labGame, labItems } from '../../../src/ui/table/lab';

const content = JSON.parse(readFileSync('data/content.json', 'utf8')) as GameContent;
const ix = indexContent(content, BASE_EFFECTS);
const items = labItems(ix);

/** Every action card id held anywhere, and every Court card id anywhere. */
function cardsOf(s: GameState) {
  const action = [...s.deck, ...s.discard, ...s.players.flatMap((p) => p.hand)];
  const court = [...s.courtDeck, ...s.courtDiscard, ...s.court.map((x) => x.card), ...s.players.flatMap((p) => p.court)];
  return { action, court };
}

describe('lab setup', () => {
  it('lists every leader, lore, Court card and action card once', () => {
    const n = (content.leaders?.length ?? 0) + (content.loreCards?.length ?? 0) + content.courtCards.length + content.actionCards.length;
    expect(items.length).toBe(n);
    expect(new Set(items.map((x) => x.id)).size).toBe(n);
  });

  it.each(items.map((x) => [x.kind, x.id] as const))('%s %s: seat 0 leads holding it, a card of each suit and the rival in reach', (kind, id) => {
    const s = labGame(ix, id);
    const me = s.players[LAB.seat];
    // Seat 0 leads, or first makes its own leader's setup choice.
    if (s.phase.type === 'decide') expect([s.phase.decision.player, s.phase.resume.type]).toEqual([LAB.seat, 'lead']);
    else expect(s.phase.type).toBe('lead');
    expect(activePlayer(s)).toBe(LAB.seat);
    if (kind === 'leader') expect(me.leader).toBe(id);
    if (kind === 'lore') expect(me.lore).toContain(id);
    if (kind === 'action') expect(me.hand).toContain(id);
    if (kind === 'court') {
      const faction = ix.courtCards.get(id)!.kind === 'faction';
      if (faction) expect(me.court).toContain(id);
      else expect(s.court[0]).toEqual({ card: id, agents: { [LAB.seat]: LAB.decreeAgents } });
    }
    const suits = new Set(me.hand.map((h) => ix.actionCards.get(h)!.suit));
    expect([...suits].sort()).toEqual(Object.keys(content.suits).sort());
    expect(me.resources.filter(Boolean).length).toBeGreaterThan(0);
    const front = Object.values(s.map).find(
      (x) => (x.ships[LAB.seat]?.fresh ?? 0) > 0 && x.buildings.some((b) => b.owner !== LAB.seat),
    );
    expect(front, 'a system with my fleet and a rival building').toBeDefined();
  });

  it.each(items.map((x) => [x.kind, x.id] as const))('%s %s: the same pieces, tokens and cards as a new game', (_kind, id) => {
    const s = labGame(ix, id);
    const n = s.players.length as 3 | 4;
    const fresh = newGame(ix, {
      playerCount: n,
      seed: 1,
      firstPlayer: LAB.seat,
      variant: 'leaders',
      leaders: s.players.map((p) => p.leader!),
      lore: s.players.map((p) => p.lore),
    });
    expect(pieceLedger(s)).toEqual(pieceLedger(fresh));
    const a = cardsOf(s);
    const b = cardsOf(fresh);
    expect([...a.action].sort()).toEqual([...b.action].sort());
    // A Court card of another set (campaign) is added to the game; nothing else changes.
    const added = ix.courtCards.get(id) && !b.court.includes(id) ? [id] : [];
    expect([...a.court].sort()).toEqual([...b.court, ...added].sort());
  });
});
