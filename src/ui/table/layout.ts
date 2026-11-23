// Where each region of the table sits on the stage: at least 1920x1080 stage
// pixels, stretched to the window's shape (setStage, called by the table on
// every resize) and scaled to fit it. The 3D map fills the window behind
// everything; along the top, the chapter and the general supply (left), the
// Court in a row with the agents on each card under it (centre) and the menu
// buttons (right), the prompt under the Court; rivals down the left, each with
// the card they played beside it; the ambitions down the right; along the
// bottom, the local board, then one bar to the right edge: the card played
// this turn, the hand held in a fan (the action box rises over it), the
// turn's buttons, and the local player's own Court cards.
// `?debug=layout` outlines these rectangles.

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
const COURT_W = 780; // the Court row, top centre
const COURT_H = 128; // its banners, with the agents on each card under it
const SIDE_R = 180; // the right column: the ambitions
const LOCAL_W = 560;
const LOCAL_H = 236;
const RIVAL_H = 206;
const bot = () => STAGE.h - G; // bottom edge of the bottom row

const BAR_H = 236; // the bottom bar beside the local board
const PLAY_W = 96; // the card played this turn, at its left end
const MINE_W = 430; // the local player's own Court cards, at its right end
const BTN_W = 140; // the turn's buttons, left of those
const ACT_W = 520; // the action box, over the hand (grows upwards when it needs more room)

/** Region ids and rectangles, read from the current STAGE (left column on the left edge, right column on the right edge, bottom row on the bottom edge). */
export const REGIONS = {
  /** Chapter and supply, the prompt, the menu buttons (the gaps let clicks through to the map). */
  get header(): Rect { return { x: 0, y: 0, w: STAGE.w, h: TOP }; },
  /** The Court: its cards in a row, top centre, the agents on each under it. */
  get court(): Rect { return { x: Math.round((STAGE.w - COURT_W) / 2), y: 4, w: COURT_W, h: COURT_H }; },
  /** Rival seats, stacked, each with its played card. */
  get rivals(): Rect { return { x: G, y: TOP + 8, w: 470, h: RIVAL_H * 3 + 16 }; },
  /** The ambitions: declared markers on top, then one row per ambition. */
  get side(): Rect { return { x: STAGE.w - SIDE_R - G, y: TOP - 6, w: SIDE_R, h: STAGE.h - TOP - BAR_H - 30 }; },
  /** The free middle of the screen: the 2D map and the 3D map's keyboard stand-ins. */
  get map(): Rect { return { x: 490, y: COURT_H + 44, w: STAGE.w - 490 - SIDE_R - G * 3, h: STAGE.h - COURT_H - 44 - BAR_H - 40 }; },
  /** Local seat board. */
  get local(): Rect { return { x: G, y: bot() - LOCAL_H, w: LOCAL_W, h: LOCAL_H }; },
  /** The bottom bar: from the local board to the right edge. */
  get bar(): Rect { const x = LOCAL_W + G * 2; return { x, y: bot() - BAR_H, w: STAGE.w - G - x, h: BAR_H }; },
  /** The card the local player played this turn, at the left end of the bar. */
  get played(): Rect { const b = REGIONS.bar; return { x: b.x + G, y: b.y, w: PLAY_W, h: b.h }; },
  /** The local hand, held in a fan in the middle of the bar. */
  get hand(): Rect { const b = REGIONS.bar; const x = b.x + PLAY_W + G * 2; return { x, y: b.y, w: b.x + b.w - MINE_W - BTN_W - G - x, h: b.h }; },
  /** The turn's buttons (undo, end turn, pass), right of the hand. */
  get confirm(): Rect { const b = REGIONS.bar; return { x: b.x + b.w - MINE_W - BTN_W, y: b.y, w: BTN_W, h: b.h }; },
  /** The local player's own Court: guild and lore cards, at the right end of the bar. */
  get mine(): Rect { const b = REGIONS.bar; return { x: b.x + b.w - MINE_W, y: b.y, w: MINE_W, h: b.h }; },
  /** The action box, centred over the hand: anchored at its bottom, grows upwards up to h. */
  get actions(): Rect { const h = REGIONS.hand; return { x: Math.round(h.x + h.w / 2 - ACT_W / 2), y: h.y - 10 - 440, w: ACT_W, h: 440 }; },
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
