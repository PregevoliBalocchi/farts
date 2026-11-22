// The page: mounts the debug UI on the rules engine (src/game/engine) and
// exposes it to automated checks as window.game (see hook.ts).

import { install } from './hook';
import { mountDebug } from './ui/debug';

const app = mountDebug(document.querySelector<HTMLElement>('#app')!);

install({
  scene: 'debug',
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
