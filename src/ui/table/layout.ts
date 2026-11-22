// Where each region of the table sits on the fixed 1920×1080 stage (scaled to
// the window by stage.ts). Arrangement from the owner's screen drafts and the
// UI lab prototype: a header with the round state, a prompt line
// saying what to do now, three columns (rivals | map | ambitions, Court, latest
// moves), and along the bottom the local board, the hand and the selected
// card's actions. `?debug=layout` outlines these rectangles.

/** Stage size in stage pixels. */
export const STAGE = { w: 1920, h: 1080 } as const;

/** A rectangle in stage pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const G = 16; // gutter
const HEADER = 60;
const PROMPT = 90;
const BOTTOM = 236;
const SIDE_L = 316;
const SIDE_R = 352;
const MID_Y = HEADER + PROMPT + 8;
const MID_H = 1080 - MID_Y - BOTTOM - G * 2;
const BOT_Y = 1080 - BOTTOM - G;
const AMB_H = 318;
const COURT_H = 240;

/** Region ids and rectangles. */
export const REGIONS = {
  /** Chapter, lead, seize, deck counts, supply, menu buttons. */
  header: { x: 0, y: 0, w: 1920, h: HEADER },
  /** What to do now, and what the selected card would do. */
  prompt: { x: 0, y: HEADER, w: 1920, h: PROMPT },
  /** Rival seats, stacked. */
  rivals: { x: G, y: MID_Y, w: SIDE_L, h: MID_H },
  /** The map, framed. */
  map: { x: G * 2 + SIDE_L, y: MID_Y, w: 1920 - SIDE_L - SIDE_R - G * 4, h: MID_H },
  /** Ambitions "if the chapter ended now". */
  ambitions: { x: 1920 - SIDE_R - G, y: MID_Y, w: SIDE_R, h: AMB_H },
  /** Court row (compact; the picker shows the cards large). */
  court: { x: 1920 - SIDE_R - G, y: MID_Y + AMB_H + 10, w: SIDE_R, h: COURT_H },
  /** Latest moves from the log. */
  recent: { x: 1920 - SIDE_R - G, y: MID_Y + AMB_H + COURT_H + 20, w: SIDE_R, h: MID_H - AMB_H - COURT_H - 20 },
  /** Local seat board. */
  local: { x: G, y: BOT_Y, w: 520, h: BOTTOM },
  /** Local hand. */
  hand: { x: G * 2 + 520, y: BOT_Y, w: 760, h: BOTTOM },
  /** Selected card / current step: options, undo, confirm. */
  actions: { x: G * 3 + 520 + 760, y: BOT_Y, w: 1920 - G * 4 - 520 - 760, h: BOTTOM },
  /** Card picker and other dialogs. */
  modal: { x: 160, y: 90, w: 1600, h: 900 },
} satisfies Record<string, Rect>;

export type RegionId = keyof typeof REGIONS;

/** Inline style placing an element on a region. */
export function place(r: Rect): string {
  return `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
}
