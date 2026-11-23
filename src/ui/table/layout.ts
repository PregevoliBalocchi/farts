// Where each region of the table sits on the stage: at least 1920x1080 stage
// pixels, stretched to the window's shape (setStage, called by the table on
// every resize) and scaled to fit it; copied from the official digital table the owner
// sent: the 3D map fills the window behind everything; along the top, the
// chapter and the general supply (left), the prompt (centre) and the menu
// buttons (right); rivals down the left, each with the card they played
// beside it; down the right, the ambitions and then the Court; along the
// bottom, the local board, the action box, the hand, and undo/confirm in the
// corner. `?debug=layout` outlines these rectangles.

/** Smallest stage, in stage pixels: the layout was drawn for it. */
export const MIN_STAGE = { w: 1920, h: 1080 } as const;

/** Current stage size in stage pixels (MIN_STAGE stretched to the window's shape). */
export const STAGE = { w: 1920, h: 1080 };

/** Stretches the stage to a window of `w`x`h` pixels; returns the scale from stage to window pixels. */
export function setStage(w: number, h: number): number {
  const s = Math.min(w / MIN_STAGE.w, h / MIN_STAGE.h) || 1;
  STAGE.w = Math.max(MIN_STAGE.w, Math.round(w / s));
  STAGE.h = Math.max(MIN_STAGE.h, Math.round(h / s));
  return s;
}

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
const LOCAL_W = 600;
const LOCAL_H = 292;
const RIVAL_H = 206;
const bot = () => STAGE.h - G; // bottom edge of the bottom row

/** How far the hand slides right to make room for the action box (its width plus a gutter). */
export const HAND_AWAY = 450 + G;

/** Region ids and rectangles, read from the current STAGE (left column on the left edge, right column on the right edge, bottom row on the bottom edge). */
export const REGIONS = {
  /** Chapter and supply, the prompt, the menu buttons (the gaps let clicks through to the map). */
  get header(): Rect { return { x: 0, y: 0, w: STAGE.w, h: TOP }; },
  /** Rival seats, stacked, each with its played card. */
  get rivals(): Rect { return { x: G, y: TOP + 8, w: 470, h: RIVAL_H * 3 + 16 }; },
  /** The ambitions (declared markers on top, then one row per ambition) and the Court below them. */
  get side(): Rect { return { x: STAGE.w - SIDE_R - G, y: TOP - 6, w: SIDE_R, h: STAGE.h - TOP - 80 }; },
  /** The free middle of the screen: the 2D map and the 3D map's keyboard stand-ins. */
  get map(): Rect { return { x: 490, y: TOP + 8, w: STAGE.w - 490 - SIDE_R - G * 3, h: STAGE.h - TOP - LOCAL_H - 40 }; },
  /** Local seat board. */
  get local(): Rect { return { x: G, y: bot() - LOCAL_H, w: LOCAL_W, h: LOCAL_H }; },
  /** Local hand, fanned, beside the local board; it slides right by HAND_AWAY while the action box is open. */
  get hand(): Rect { return { x: LOCAL_W + G * 3, y: bot() - 226, w: 640, h: 226 }; },
  /** Undo and confirm, bottom right. */
  get confirm(): Rect { return { x: STAGE.w - 140 - G, y: bot() - 64, w: 140, h: 64 }; },
  /** The action box: anchored at the bottom between the local board and the hand, grows upwards up to h. */
  get actions(): Rect { return { x: LOCAL_W + G * 3, y: bot() - 440, w: 450, h: 440 }; },
  /** Card picker and other dialogs, centred. */
  get modal(): Rect { return { x: (STAGE.w - 1600) / 2, y: (STAGE.h - 900) / 2, w: 1600, h: 900 }; },
  /** Detail windows (height grows with the content, up to h), centred. */
  get detail(): Rect { return { x: (STAGE.w - 1000) / 2, y: (STAGE.h - 780) / 2, w: 1000, h: 780 }; },
};

export type RegionId = keyof typeof REGIONS;

/** Inline style placing an element on a region. */
export function place(r: Rect): string {
  return `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
}

/** Inline style anchoring an element to a region's bottom-left corner, at most as wide and as tall as it (it shrinks to its content). */
export function placeUp(r: Rect): string {
  return `left:${r.x}px;bottom:${STAGE.h - r.y - r.h}px;max-width:${r.w}px;max-height:${r.h}px`;
}
