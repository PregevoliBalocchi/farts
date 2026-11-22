// Where each region of the table sits on the fixed 1920x1080 stage (scaled to
// the window by stage.ts), copied from the official digital table the owner
// sent: the 3D map fills the window behind everything; along the top, the
// chapter and the general supply (left), the prompt (centre) and the menu
// buttons (right); rivals down the left, each with the card they played
// beside it; down the right, the ambitions and then the Court; along the
// bottom, the local board, the action box, the hand, and undo/confirm in the
// corner. `?debug=layout` outlines these rectangles.

/** Stage size in stage pixels. */
export const STAGE = { w: 1920, h: 1080 } as const;

/** A rectangle in stage pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const G = 10; // gutter
const TOP = 70; // height of the top strip
const SIDE_R = 180; // the right column: ambitions, then the Court
const LOCAL_W = 470;
const LOCAL_H = 236;
const RIVAL_H = 206;
const BOT = 1080 - G; // bottom edge of the bottom row

/** How far the hand slides right to make room for the action box (its width plus a gutter). */
export const HAND_AWAY = 450 + G;

/** Region ids and rectangles. */
export const REGIONS = {
  /** Chapter and supply, the prompt, the menu buttons (the gaps let clicks through to the map). */
  header: { x: 0, y: 0, w: 1920, h: TOP },
  /** Rival seats, stacked, each with its played card. */
  rivals: { x: G, y: TOP + 8, w: 470, h: RIVAL_H * 3 + 16 },
  /** The ambitions (declared markers on top, then one row per ambition) and the Court below them. */
  side: { x: 1920 - SIDE_R - G, y: TOP - 6, w: SIDE_R, h: 1080 - TOP - 80 },
  /** The free middle of the screen: the 2D map and the 3D map's keyboard stand-ins. */
  map: { x: 490, y: TOP + 8, w: 1920 - 490 - SIDE_R - G * 3, h: 1080 - TOP - LOCAL_H - 40 },
  /** Local seat board. */
  local: { x: G, y: BOT - LOCAL_H, w: LOCAL_W, h: LOCAL_H },
  /** Local hand, fanned, beside the local board; it slides right by HAND_AWAY while the action box is open. */
  hand: { x: LOCAL_W + G * 3, y: BOT - 226, w: 640, h: 226 },
  /** Undo and confirm, bottom right. */
  confirm: { x: 1920 - 140 - G, y: BOT - 64, w: 140, h: 64 },
  /** The action box: anchored at the bottom between the local board and the hand, grows upwards up to h. */
  actions: { x: LOCAL_W + G * 3, y: BOT - 440, w: 450, h: 440 },
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
