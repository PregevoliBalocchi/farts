// Online game screen (docs/online-play.md): one player's view of a shared
// game, on the table screen (src/ui/table). The rules run in this browser;
// every move is saved to Firestore and reaches the other screens through the
// live listener.

import { onAuthStateChanged } from 'firebase/auth';
import { normalizeEmail } from '../online/roles';
import { mountTable } from '../ui/table/table';
import type { GameState } from '../game/engine';
import { auth, loadContent, saveMove, watchGame } from './games';
import { loadHotseat, saveHotseat } from './hotseat';

const status = document.getElementById('play-status')!;
const root = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const id = params.get('id') ?? '';
/** ?hotseat=1: the game saved in this browser, every seat played here in turn. */
const hotseat = params.get('hotseat') === '1';

function say(text: string): void {
  status.innerHTML = `${text} · <a href="./">torna all'ingresso</a>`;
  // Over the table (a fixed full-screen layer) once it is mounted.
  status.classList.toggle('over-table', root.childElementCount > 0);
}

let started = false;
onAuthStateChanged(auth, async (user) => {
  if (started) return;
  if (!user) return say('Accedi prima dalla pagina d’ingresso.');
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
