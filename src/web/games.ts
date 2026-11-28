// Shared games and game content in Firestore (docs/online-play.md).
//
//   content/main  { json, updatedAt, updatedBy } — the owner's content file,
//                 readable by invited members only (never bundled in the page)
//   games/{id}    { players: [email…] (seat order), colors?: [0-3…] (seat
//                   colours), createdBy, createdAt,
//                   variant, status, version, state (GameState as JSON),
//                   updatedAt, updatedBy }
//
// Each move is a transaction: it applies only if `version` is still the one
// this screen last saw, so two screens can never overwrite each other.

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getFirestore, onSnapshot, query, runTransaction, setDoc, where, getDocs } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { BASE_EFFECTS } from '../game/cards/base';
import { indexContent, newGame } from '../game/engine';
import type { GameContent, GameState, PlayerCount } from '../game/engine';
import { firebaseConfig } from './firebase-config';
import { roleOf } from '../online/roles';
import type { Member, Role } from '../online/roles';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/** Log entries kept in the saved state (the full log would grow without end). */
const SAVED_LOG = 400;

/** A game as stored, with its state parsed. */
export interface OnlineGame {
  id: string;
  players: string[];
  createdBy: string;
  createdAt: number;
  variant: 'base' | 'leaders';
  /** Colour index of each seat (older games: none, seat i has colour i). */
  colors?: number[];
  status: 'playing' | 'over';
  version: number;
  state: GameState;
}

/**
 * The caller's role (docs/online-access.md): master by config/access, else its
 * members/{email} document, else none. Throws when config/access has no master.
 */
export async function accessOf(email: string): Promise<{ role: Role | null; master: string }> {
  const config = await getDoc(doc(db, 'config', 'access'));
  const master = String(config.data()?.master ?? '').trim().toLowerCase();
  if (!master) throw new Error('manca l’amministratore principale (config/access) nel database');
  let mine: Member | undefined;
  try {
    const snap = await getDoc(doc(db, 'members', email));
    mine = snap.exists() ? (snap.data() as Member) : undefined;
  } catch {
    mine = undefined;
  }
  return { role: roleOf(email, master, mine), master };
}

/** Loads the game content from the database (members only). */
export async function loadContent(): Promise<GameContent> {
  const snap = await getDoc(doc(db, 'content', 'main'));
  const json = snap.data()?.json;
  if (typeof json !== 'string') throw new Error('I contenuti del gioco non sono ancora caricati: l’amministratore principale deve caricarli');
  return JSON.parse(json) as GameContent;
}

/** Master only: replaces the game content after checking it builds. */
export async function uploadContent(text: string, by: string): Promise<string[]> {
  const content = JSON.parse(text) as GameContent;
  const ix = indexContent(content, BASE_EFFECTS);
  await setDoc(doc(db, 'content', 'main'), { json: JSON.stringify(content), updatedAt: Date.now(), updatedBy: by });
  return ix.warnings;
}

/** Starts a game: `players` in seat order (the creator included), `colors` one per seat, `firstPlayer` the starting seat (random if absent). */
export async function createGame(
  content: GameContent,
  players: string[],
  variant: 'base' | 'leaders',
  by: string,
  opts: { colors?: number[]; firstPlayer?: number } = {},
): Promise<string> {
  if (players.length < 2 || players.length > 4) throw new Error('Servono da 2 a 4 giocatori');
  if (new Set(players).size !== players.length) throw new Error('Un giocatore compare due volte');
  const ix = indexContent(content, BASE_EFFECTS);
  const state = newGame(ix, { playerCount: players.length as PlayerCount, seed: 1 + Math.floor(Math.random() * 2_000_000_000), variant, firstPlayer: opts.firstPlayer });
  const ref = doc(collection(db, 'games'));
  const now = Date.now();
  const colors = opts.colors ? { colors: opts.colors } : {};
  await setDoc(ref, { players, ...colors, createdBy: by, createdAt: now, variant, status: 'playing', version: 1, state: pack(state), updatedAt: now, updatedBy: by });
  return ref.id;
}

/** Deletes a game (its creator or an admin; the database rules check it). */
export async function deleteGame(id: string): Promise<void> {
  await deleteDoc(doc(db, 'games', id));
}

/** The caller's games, newest first. */
export async function myGames(email: string): Promise<OnlineGame[]> {
  const snap = await getDocs(query(collection(db, 'games'), where('players', 'array-contains', email)));
  return snap.docs.map((d) => unpack(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt);
}

/** Follows a game: `onGame` runs now and after every saved move. */
export function watchGame(id: string, onGame: (g: OnlineGame) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, 'games', id), (snap) => (snap.exists() ? onGame(unpack(snap.id, snap.data())) : onError(new Error('Partita non trovata'))), onError);
}

/** Saves the state after a move, if nobody saved another move since `version`. */
export async function saveMove(id: string, version: number, next: GameState, by: string): Promise<number> {
  const ref = doc(db, 'games', id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data()?.version;
    if (cur !== version) throw new Error('Un altro giocatore ha appena mosso: la partita si è aggiornata, riprova');
    tx.update(ref, { state: pack(next), version: version + 1, status: next.phase.type === 'gameOver' ? 'over' : 'playing', updatedAt: Date.now(), updatedBy: by });
    return version + 1;
  });
}

function pack(state: GameState): string {
  return JSON.stringify(state.log.length > SAVED_LOG ? { ...state, log: state.log.slice(-SAVED_LOG) } : state);
}

function unpack(id: string, d: Record<string, unknown>): OnlineGame {
  return {
    id,
    players: d.players as string[],
    createdBy: d.createdBy as string,
    createdAt: d.createdAt as number,
    variant: d.variant as 'base' | 'leaders',
    colors: Array.isArray(d.colors) ? (d.colors as number[]) : undefined,
    status: d.status as 'playing' | 'over',
    version: d.version as number,
    state: JSON.parse(d.state as string) as GameState,
  };
}
