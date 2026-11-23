// Local preview of the entrance page's lobby (?view=lobby on the debug page):
// the same games list and new-game screen as online/index.html, with sample
// games and no sign-in, so the screen can be checked and tested offline.
// "Start" records the setup it would create instead of creating anything.

import { BASE_EFFECTS } from '../game/cards/base';
import { indexContent, newGame } from '../game/engine';
import { loadContent } from '../ui/content';
import { mountNewGame, renderGames } from './lobby';
import type { GameItem } from './lobby';

const ME = 'tu@example.com';

/** Mounts the preview into `root`; window.lobbyCreated holds the last setup "created". */
export function mountLobbyPreview(root: HTMLElement): void {
  document.body.classList.add('lobby-page', 'lobby');
  const ix = indexContent(loadContent().content, BASE_EFFECTS);
  const leaders = newGame(ix, { playerCount: 3, seed: 7, variant: 'leaders' });
  const mine = newGame(ix, { playerCount: 4, seed: 3, firstPlayer: 2 });
  const theirs = newGame(ix, { playerCount: 2, seed: 5, firstPlayer: 1 });
  const now = Date.UTC(2026, 10, 23, 9, 30);
  const items: GameItem[] = [
    { key: 'h', href: '#', seats: [{ name: 'Anna', color: 3 }, { name: 'Bruno', color: 1 }, { name: 'Carla', color: 0 }], variant: 'leaders', state: leaders, startedAt: now - 3_600_000, mySeat: null, local: true, canDelete: true },
    { key: 'a', href: '#', seats: [{ name: 'marco', color: 0 }, { name: 'giulia', color: 1 }, { name: 'luca', color: 2 }, { name: 'paolo', color: 3 }], variant: 'base', state: mine, startedAt: now - 86_400_000, mySeat: 2, local: false, canDelete: false },
    { key: 'b', href: '#', seats: [{ name: 'luca', color: 1 }, { name: 'sara', color: 2 }], variant: 'base', state: theirs, startedAt: now - 2 * 86_400_000, mySeat: 0, local: false, canDelete: true },
  ];
  root.innerHTML = `<main>
    <header class="lb-title"><h1>Accesso al gioco</h1><div class="row"><span>${ME} · <b>giocatore</b></span><button class="btn small" type="button">Esci</button></div></header>
    <section id="lobby">
      <div class="frame" style="margin-bottom:22px"><h2>Le tue partite</h2><ul id="games" class="games"></ul></div>
      <div class="frame"><h2>Nuova partita</h2><div id="new-game"></div></div>
    </section></main>`;
  renderGames(root.querySelector('#games')!, items, () => {});
  mountNewGame(root.querySelector('#new-game')!, {
    me: ME,
    create: async (setup) => {
      (window as unknown as { lobbyCreated: unknown }).lobbyCreated = setup;
    },
  });
}
