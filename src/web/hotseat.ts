// Hotseat games: every seat played in turn on one computer. The game lives
// only in this browser (localStorage), never in the shared database; the
// game content still comes from the database, so the player must be signed in.

import { BASE_EFFECTS } from '../game/cards/base';
import { indexContent, newGame } from '../game/engine';
import type { GameContent, GameState, PlayerCount } from '../game/engine';

const KEY = 'farts.hotseat';

/** A hotseat game as saved in this browser. */
export interface HotseatGame {
  players: number;
  variant: 'base' | 'leaders';
  /** Seat names (blank: default) and colour indexes, as chosen; absent in games saved before they existed. */
  names?: string[];
  colors?: number[];
  startedAt: number;
  state: GameState;
}

/** The hotseat game saved in this browser, or null (none, or storage unavailable). */
export function loadHotseat(): HotseatGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HotseatGame) : null;
  } catch {
    return null;
  }
}

/** Saves the hotseat game's new state; throws when the browser refuses to store it. */
export function saveHotseat(g: HotseatGame): void {
  localStorage.setItem(KEY, JSON.stringify(g));
}

/** Forgets the hotseat game saved in this browser. */
export function clearHotseat(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored, nothing to forget.
  }
}

/** Starts a new hotseat game (replacing any saved one) with one seat per name, and saves it. */
export function startHotseat(
  content: GameContent,
  names: string[],
  variant: 'base' | 'leaders',
  opts: { colors?: number[]; firstPlayer?: number } = {},
): HotseatGame {
  const players = names.length;
  if (players < 2 || players > 4) throw new Error('Servono da 2 a 4 giocatori');
  const ix = indexContent(content, BASE_EFFECTS);
  const state = newGame(ix, { playerCount: players as PlayerCount, seed: 1 + Math.floor(Math.random() * 2_000_000_000), variant, firstPlayer: opts.firstPlayer });
  const g: HotseatGame = { players, variant, names, colors: opts.colors, startedAt: Date.now(), state };
  saveHotseat(g);
  return g;
}
