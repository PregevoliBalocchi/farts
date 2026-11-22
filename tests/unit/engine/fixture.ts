// Test fixtures: the placeholder content, plus helpers to drive a game.
import raw from '../../../data/content.example.json';
import { activePlayer, dispatch, indexContent, newGame } from '../../../src/game/engine';
import type { Command, ContentIndex, GameContent, GameState, PlayerCount } from '../../../src/game/engine';

/** Fresh deep copy of the placeholder content. */
export function content(): GameContent {
  return structuredClone(raw) as unknown as GameContent;
}

export function index(c: GameContent = content()): ContentIndex {
  return indexContent(c);
}

export function game(ix: ContentIndex, playerCount: PlayerCount, seed = 1, firstPlayer = 0, setupCardId?: string): GameState {
  return newGame(ix, { playerCount, seed, firstPlayer, setupCardId });
}

/** Replaces hands with exact cards (moving the old hands to the deck). */
export function setHands(s: GameState, hands: string[][]): void {
  for (const p of s.players) s.deck.push(...p.hand);
  hands.forEach((h, i) => {
    for (const id of h) s.deck.splice(s.deck.indexOf(id), 1);
    s.players[i].hand = [...h];
  });
}

export function run(ix: ContentIndex, s: GameState, cmds: Command[]): GameState {
  return cmds.reduce((st, c) => dispatch(ix, st, c), s);
}

/** Plays a whole round with simple choices: lead first card, others copy, no actions. */
export function playRoundCopying(ix: ContentIndex, s: GameState): GameState {
  const startChapter = s.chapter;
  const leader = activePlayer(s)!;
  s = dispatch(ix, s, { type: 'lead', player: leader, card: s.players[leader].hand[0] });
  s = dispatch(ix, s, { type: 'endTurn', player: leader });
  while (s.phase.type === 'follow' && s.chapter === startChapter) {
    const p = s.phase.next;
    s = dispatch(ix, s, { type: 'follow', player: p, card: s.players[p].hand[0], mode: 'copy' });
    s = dispatch(ix, s, { type: 'endTurn', player: p });
  }
  return s;
}
