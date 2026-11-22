// The page: mounts the debug UI on the rules engine (src/game/engine), or the
// table screen with ?view=table, and exposes it to automated checks as
// window.game (see hook.ts). ?view=pieces shows the 3D piece models only.

import { install } from './hook';
import { mountDebug } from './ui/debug';
import { mountPieces } from './ui/table/showcase';
import { mountTable } from './ui/table/table';

const root = document.querySelector<HTMLElement>('#app')!;
const asked = new URLSearchParams(location.search).get('view');
if (asked === 'pieces') mountPieces(root);
const view = asked === 'table' ? 'table' : 'debug';
const app = asked === 'pieces' ? null : view === 'table' ? mountTable(root) : mountDebug(root);

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
} as Parameters<typeof install>[0]);
