// The page: mounts the debug UI on the rules engine (src/game/engine), or the
// table screen with ?view=table, and exposes it to automated checks as
// window.game (see hook.ts).

import { install } from './hook';
import { mountDebug } from './ui/debug';
import { mountTable } from './ui/table/table';

const root = document.querySelector<HTMLElement>('#app')!;
const view = new URLSearchParams(location.search).get('view') === 'table' ? 'table' : 'debug';
const app = view === 'table' ? mountTable(root) : mountDebug(root);

install({
  scene: view,
  get state() {
    return app.state;
  },
  // A turn-based page has no keys to press or frames to step: these are no-ops.
  press() {},
  hold() {},
  step() {},
  send: app.send,
  newGame: app.newGame,
} as Parameters<typeof install>[0]);
