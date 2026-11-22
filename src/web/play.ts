// Online game screen (docs/online-play.md): one player's view of a shared
// game. The rules run in this browser; every move is saved to Firestore and
// reaches the other screens through the live listener.

import { onAuthStateChanged } from 'firebase/auth';
import { normalizeEmail } from '../online/roles';
import { mountDebug } from '../ui/debug';
import type { GameState } from '../game/engine';
import { auth, loadContent, saveMove, watchGame } from './games';

const status = document.getElementById('play-status')!;
const root = document.getElementById('app')!;
const id = new URLSearchParams(location.search).get('id') ?? '';

function say(text: string): void {
  status.innerHTML = `${text} · <a href="./">torna all'ingresso</a>`;
}

let started = false;
onAuthStateChanged(auth, async (user) => {
  if (started) return;
  if (!user) return say('Accedi prima dalla pagina d’ingresso.');
  if (!id) return say('Nessuna partita indicata.');
  started = true;
  const email = normalizeEmail(user.email);
  try {
    const content = await loadContent();
    let version = 0;
    let shared: GameState | null = null;
    let screen: ReturnType<typeof mountDebug> | null = null;
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
          screen = mountDebug(root, {
            content,
            state: g.state,
            seat,
            names: g.players.map((p) => p.split('@')[0]),
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
