// Where each region of the table sits on the fixed 1920x1080 stage (scaled to
// the window by stage.ts). The 3D map fills the window behind everything; the
// interface floats in front of it, from the owner's sketch: chapter, Court,
// ambitions and round state along the top, rivals down the left (each with the
// card they played beside it), and along the bottom the local board, the hand
// and the local player's Court cards. A context box with the choices of the
// current step (how to play the picked card, the actions, a battle) appears
// above the hand only when there is something to choose.
// `?debug=layout` outlines these rectangles.

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
const TOP = 100; // height of the top strip
const BOTTOM = 236;
const BOT_Y = 1080 - BOTTOM - G;
const SIDE_L = 404; // a rival's box plus the card played beside it
const LOCAL_W = 496;
const HAND_W = 620;
const RIVAL_H = 158;

/** Region ids and rectangles. */
export const REGIONS = {
  /** Chapter, Court row, ambitions, round state, supply, latest move, menu buttons (the gaps let clicks through to the map). */
  header: { x: 0, y: 0, w: 1920, h: TOP },
  /** Rival seats, stacked, each with its played card. */
  rivals: { x: G, y: TOP + 4, w: SIDE_L, h: RIVAL_H * 3 + 20 },
  /** The free middle of the screen: the 2D map and the 3D map's keyboard stand-ins. */
  map: { x: G * 2 + SIDE_L, y: TOP + 4, w: 1920 - SIDE_L - G * 3, h: BOT_Y - TOP - 80 },
  /** Local seat board. */
  local: { x: G, y: BOT_Y, w: LOCAL_W, h: BOTTOM },
  /** Local hand. */
  hand: { x: G * 2 + LOCAL_W, y: BOT_Y, w: HAND_W, h: BOTTOM },
  /** The local player's Court cards. */
  owned: { x: G * 3 + LOCAL_W + HAND_W, y: BOT_Y, w: 1920 - G * 4 - LOCAL_W - HAND_W, h: BOTTOM },
  /** Context box with the current step's choices: anchored above the hand, as wide as its content up to w, grows upwards up to h. */
  actions: { x: G * 2 + LOCAL_W, y: BOT_Y - 10 - 440, w: 1920 - G * 3 - LOCAL_W, h: 440 },
  /** Card picker and other dialogs. */
  modal: { x: 160, y: 90, w: 1600, h: 900 },
  /** Detail windows (height grows with the content, up to h). */
  detail: { x: 460, y: 150, w: 1000, h: 780 },
} satisfies Record<string, Rect>;

export type RegionId = keyof typeof REGIONS;

/** Inline style placing an element on a region. */
export function place(r: Rect): string {
  return `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
}

/** Inline style anchoring an element to a region's bottom-left corner, at most as wide and as tall as it (it shrinks to its content). */
export function placeUp(r: Rect): string {
  return `left:${r.x}px;bottom:${STAGE.h - r.y - r.h}px;max-width:${r.w}px;max-height:${r.h}px`;
}
