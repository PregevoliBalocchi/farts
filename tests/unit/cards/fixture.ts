// Fixtures for card effect tests: placeholder content with test cards (set
// 'test') pointing at the owner's effect ids, suits renamed to the ids the
// effects expect, and a cleared 2-player map.
import { BASE_EFFECTS } from '../../../src/game/cards/base';
import { dispatch, indexContent } from '../../../src/game/engine';
import type { Command, ContentIndex, GameContent, GameState, Resource } from '../../../src/game/engine';
import { content, game, setHands } from '../engine/fixture';

export const SUITS: Record<string, string> = { suitA: 'administration', suitB: 'aggression', suitC: 'construction', suitD: 'mobilization' };

/** Placeholder content + one test card per effect id: Guild `g:<effect>`, Vox `v:<effect>`, lore `l:<effect>`. */
export function cardsContent(): GameContent {
  const c = content();
  c.suits = Object.fromEntries(Object.entries(c.suits).map(([k, v]) => [SUITS[k], v]));
  for (const a of c.actionCards) a.suit = SUITS[a.suit];
  const guild: Record<string, Resource> = {
    'court-01': 'material', 'court-02': 'material', 'court-03': 'material', 'court-04': 'material', 'court-05': 'material',
    'court-08': 'fuel', 'court-12': 'weapons', 'court-14': 'weapons', 'court-16': 'psionic', 'court-17': 'psionic',
    'court-13': 'weapons', 'court-15': 'weapons', 'court-18': 'relic', 'court-20': 'relic', 'court-22': 'relic', 'court-23': 'relic', 'court-24': 'relic', 'court-25': 'psionic',
  };
  for (const [e, r] of Object.entries(guild)) c.courtCards.push({ id: `g:${e}`, kind: 'faction', resource: r, keys: 2, effect: e, set: 'test' });
  for (const e of ['court-26', 'court-27', 'court-28', 'court-29', 'court-30', 'court-31'])
    c.courtCards.push({ id: `v:${e}`, kind: 'decree', effect: e, set: 'test' });
  c.leaders = Array.from({ length: 16 }, (_, i) => ({ id: `leader-${String(i + 1).padStart(2, '0')}`, setup: c.baseSetupPieces!, resources: [] }));
  c.loreCards = Array.from({ length: 28 }, (_, i) => `lore-${String(i + 1).padStart(2, '0')}`).map((e) => ({ id: `l:${e}`, effect: e, set: 'test' }));
  return c;
}


/** 2 players, P0 to lead; hands fixed; an empty map so pieces are placed by each test. */
export function start(ix: ContentIndex, hands: string[][] = [['suitC-2', 'suitA-3'], ['suitC-4', 'suitA-5']]): GameState {
  const s = game(ix, 2, 5, 0, 'setup-2a');
  setHands(s, hands);
  s.mulligan = null;
  for (const sys of Object.values(s.map)) {
    sys.ships = {};
    sys.buildings = [];
  }
  for (const p of s.players) {
    p.resources = [];
    p.court = [];
    p.outraged = [];
  }
  // One ship each far away, so nobody counts as eliminated.
  const far = Object.values(s.map).filter((x) => x.inPlay && !x.id.startsWith('c1')).at(-1)!;
  far.ships = { 0: { fresh: 1, damaged: 0 }, 1: { fresh: 1, damaged: 0 } };
  return s;
}


/** Index over the card content (optionally adjusted) with the owner's effects. */
export function cardsIndex(adjust?: (c: GameContent) => void): ContentIndex {
  const c = cardsContent();
  adjust?.(c);
  return indexContent(c, BASE_EFFECTS);
}

/** Applies commands in order. */
export function runAll(ix: ContentIndex, s: GameState, cmds: Command[]): GameState {
  return cmds.reduce((st, cmd) => dispatch(ix, st, cmd), s);
}
