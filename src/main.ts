// The page: mounts the debug UI on the rules engine (src/game/engine), or the
// table screen with ?view=table, and exposes it to automated checks as
// window.game (see hook.ts). ?view=pieces shows the 3D piece models only,
// ?view=planets the map's planets next to the board's,
// ?view=cards every action card, ?view=lobby the entrance page's lobby (sample games).

import { install } from './hook';
import { mountDebug } from './ui/debug';
import { mountCards } from './ui/table/cardsheet';
import { mountPlanets } from './ui/table/planetshow';
import { mountPieces } from './ui/table/showcase';
import { mountTable } from './ui/table/table';
import { mountLobbyPreview } from './web/lobby-preview';

const root = document.querySelector<HTMLElement>('#app')!;
const asked = new URLSearchParams(location.search).get('view');
if (asked === 'pieces') mountPieces(root);
if (asked === 'planets') mountPlanets(root);
if (asked === 'cards') mountCards(root);
if (asked === 'lobby') mountLobbyPreview(root);
const view = asked === 'table' ? 'table' : 'debug';
const app = asked === 'pieces' || asked === 'planets' || asked === 'cards' || asked === 'lobby' ? null : view === 'table' ? mountTable(root) : mountDebug(root);

if (app) install({
  scene: view,
  get state() {
    return app!.state;
  },
  // A turn-based page has no keys to press or frames to step: these are no-ops.
  press() {},
  hold() {},
  step() {},
  send: app!.send,
  newGame: app!.newGame,
  ...('load' in app! ? { load: (s: unknown) => (app as { load(next: unknown): void }).load(s) } : {}),
} as Parameters<typeof install>[0]);
