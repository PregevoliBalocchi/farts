// Seeded randomness. The generator state lives in GameState.rngState so a game
// is fully reproducible from (content, seed, command list).

/** Holder of a mulberry32 state; GameState satisfies it. */
export interface RngHolder {
  rngState: number;
}

/** Next float in [0, 1). Advances `h.rngState`. */
export function nextFloat(h: RngHolder): number {
  h.rngState = (h.rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(h.rngState ^ (h.rngState >>> 15), h.rngState | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, n). */
export function nextInt(h: RngHolder, n: number): number {
  return Math.floor(nextFloat(h) * n);
}

/** Fisher–Yates shuffle in place; returns the same array. */
export function shuffle<T>(h: RngHolder, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(h, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
