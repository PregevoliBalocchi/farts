// Online game screen (docs/online-play.md): one player's view of a shared
// game, on the table screen (src/ui/table). The rules run in this browser;
// every move is saved to Firestore and reaches the other screens through the
// live listener.

import { onAuthStateChanged } from 'firebase/auth';
import { seatLabel } from '../online/newgame';
import { isAdmin, normalizeEmail } from '../online/roles';
import { mountTable } from '../ui/table/table';
import type { GameState } from '../game/engine';
import { accessOf, auth, loadContent, saveMove, watchGame } from './games';
import { loadHotseat, saveHotseat } from './hotseat';

const status = document.getElementById('play-status')!;
const root = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const id = params.get('id') ?? '';
/** ?hotseat=1: the game saved in this browser, every seat played here in turn. */
const hotseat = params.get('hotseat') === '1';
/** ?lab=1 or ?lab=<id>: the test lab (admins only), a local game on the database's content. */
const lab = params.get('lab') !== null;

/** The latest line about this game: shown on the page before the table, then in the table's settings window. */
let about = '';
function say(text: string): void {
  about = text;
  status.innerHTML = `${text} · <a href="./">torna all'ingresso</a>`;
  // Once the table is up, the line and the way out live in its settings window (gear).
  status.hidden = root.childElementCount > 0;
}
const exit = { href: './', about: () => about };

let started = false;
onAuthStateChanged(auth, async (user) => {
  if (started) return;
  if (!user) return say('Accedi prima dalla pagina d’ingresso.');
  if (lab) {
    started = true;
    return void playLab(normalizeEmail(user.email));
  }
  if (hotseat) {
    started = true;
    return void playHotseat();
  }
  if (!id) return say('Nessuna partita indicata.');
  started = true;
  const email = normalizeEmail(user.email);
  try {
    const content = await loadContent();
    let version = 0;
    let shared: GameState | null = null;
    let screen: ReturnType<typeof mountTable> | null = null;
    watchGame(
      id,
      (g) => {
        const seat = g.players.indexOf(email);
        if (seat < 0) return say('Non sei seduto a questa partita.');
        if (g.version <= version) return;
        version = g.version;
        shared = g.state;
        say(`Partita ${id.slice(0, 6)} · ${g.status === 'over' ? 'finita' : 'in corso'} · mossa ${g.version}`);
        if (!screen)
          screen = mountTable(root, {
            content,
            state: g.state,
            seat,
            seats: { names: g.players.map((p, i) => seatLabel(p, i)), colors: g.colors },
            exit,
            commit: async (next) => {
              try {
                version = await saveMove(id, version, next, email);
                shared = next;
              } catch (e) {
                // Back to the last shared state: the move was not saved.
                if (shared) screen?.load(shared);
                throw e;
              }
            },
          });
        else screen.load(g.state);
      },
      (e) => say(`Errore: ${e.message}`),
    );
  } catch (e) {
    say(`Errore: ${(e as Error).message}`);
  }
});

/**
 * The test lab (src/ui/table/lab.ts) for an admin: a local table on the database's content, where each
 * leader, lore and card can be tried; nothing is saved or shared. Others are told it is for admins.
 */
async function playLab(email: string): Promise<void> {
  try {
    const { role } = await accessOf(email);
    if (!isAdmin(role)) return say('Il laboratorio è riservato agli amministratori.');
    const content = await loadContent();
    mountTable(root, undefined, { content, exit: { href: './' } });
    status.hidden = true;
  } catch (e) {
    say(`Errore: ${(e as Error).message}`);
  }
}

/** Plays the hotseat game saved in this browser: every move is saved here, nothing is shared. */
async function playHotseat(): Promise<void> {
  const game = loadHotseat();
  if (!game) return say('Nessuna partita hotseat salvata in questo browser.');
  try {
    const content = await loadContent();
    mountTable(root, {
      content,
      state: game.state,
      seat: null,
      seats: { names: game.names, colors: game.colors },
      exit,
      commit: async (next) => {
        game.state = next;
        saveHotseat(game);
      },
    });
    // After mounting, so the line sits over the table.
    say(`Partita hotseat · ${game.players} giocatori su questo computer`);
  } catch (e) {
    say(`Errore: ${(e as Error).message}`);
  }
}
