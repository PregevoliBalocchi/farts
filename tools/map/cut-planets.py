"""Cuts every planet out of the board picture as a whole flat disc, for the
table's 2D planet view (docs/ui-assets.md, "2D planets").

What covers a planet on the board is rebuilt:
- the building triangles, fitted to their white outline: filled in with the
  planet's own drawing (with "keepUnder" for a planet, the see-through dark
  fill is brightened back instead and only the outline is filled in);
- the part of the disc that lies in a neighbouring sector (the planet is cut by
  the sector's edge there) and the edge line itself: filled with the planet's
  own drawing, patch by patch (exemplar inpainting);
- the cracks and rift lines drawn across it (traced in board.lines.json);
- the resource icon printed by it (found by matching the kit's icon picture);
- anything listed for a planet in tools/map/planets2d.json ("holes").

Reads assets/ui/map/board.png, the calibration (assets/ui/map/board.json, else
src/ui/table/board.default.json) and the traced sectors
(src/ui/table/board.lines.json). Writes assets/ui/map/planets/<system>.png
(square, transparent outside the disc) and, with --sheet, a contact sheet of
all of them, before and after, for review.

    python tools/map/cut-planets.py [--only c1-p1,c2-p3] [--sheet out.png]

Needs opencv-python and numpy.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / 'assets/ui/map/board.png'
CALIB = [ROOT / 'assets/ui/map/board.json', ROOT / 'src/ui/table/board.default.json']
LINES = ROOT / 'src/ui/table/board.lines.json'
TUNING = Path(__file__).with_name('planets2d.json')
OUT = ROOT / 'assets/ui/map/planets'

UP = 3  # the cut is worked on this many times larger than the board picture
OUT_PX = 384  # side of each saved picture
PATCH = 9  # exemplar patch side (pixels, at UP scale)
TRI_SIDE = 65  # a building triangle's side on the board picture (pixels), with its rounded outline
EDGE = 5  # how far the sector's edge line reaches into the planet (board pixels)
CRACK = 9  # width of a crack or rift line drawn across a planet (board pixels)


def path_points(d: str) -> np.ndarray:
    """Points of an "M x,y L x,y … Z" path."""
    return np.array([[float(a), float(b)] for a, b in re.findall(r'(-?[\d.]+),(-?[\d.]+)', d)], dtype=np.float32)


def triangle(cx: float, cy: float, side: float) -> np.ndarray:
    """An upright equilateral triangle centred on its centroid."""
    h = side * np.sqrt(3) / 2
    return np.array([[cx, cy - 2 * h / 3], [cx - side / 2, cy + h / 3], [cx + side / 2, cy + h / 3]], dtype=np.float32)


def exemplar_fill(img: np.ndarray, hole: np.ndarray, source: np.ndarray, patch: int = PATCH, stride: int = 3) -> np.ndarray:
    """Fills `hole` patch by patch with the best matching patch taken from `source` (Criminisi-style, by confidence)."""
    img = img.astype(np.float32).copy()
    hole = hole.copy()
    half = patch // 2
    H, W = hole.shape
    # Candidate source patches: wholly inside the source area.
    ok = cv2.erode(source.astype(np.uint8), np.ones((patch, patch), np.uint8)).astype(bool)
    ys, xs = np.nonzero(ok[half:H - half:stride, half:W - half:stride])
    ys = ys * stride + half
    xs = xs * stride + half
    if len(ys) == 0:
        return img
    offs = np.arange(-half, half + 1)
    oy, ox = np.meshgrid(offs, offs, indexing='ij')
    src = img[ys[:, None, None] + oy, xs[:, None, None] + ox].reshape(len(ys), -1)
    conf = (~hole).astype(np.float32)
    kernel = np.ones((3, 3), np.uint8)
    while hole.any():
        front = hole & cv2.dilate((~hole).astype(np.uint8), kernel).astype(bool)
        fy, fx = np.nonzero(front)
        if len(fy) == 0:
            break
        # The front pixel whose patch is most known goes first.
        c = cv2.boxFilter(conf, -1, (patch, patch), normalize=True, borderType=cv2.BORDER_CONSTANT)
        i = int(np.argmax(c[fy, fx]))
        py = int(np.clip(fy[i], half, H - half - 1))
        px = int(np.clip(fx[i], half, W - half - 1))
        tgt = img[py - half:py + half + 1, px - half:px + half + 1].reshape(-1)
        known = np.repeat((~hole[py - half:py + half + 1, px - half:px + half + 1]).reshape(-1), 3).astype(np.float32)
        ssd = ((src - tgt) ** 2 * known).sum(axis=1)
        best = src[int(np.argmin(ssd))].reshape(patch, patch, 3)
        win = hole[py - half:py + half + 1, px - half:px + half + 1].copy()
        region = img[py - half:py + half + 1, px - half:px + half + 1]
        region[win] = best[win]
        conf[py - half:py + half + 1, px - half:px + half + 1][win] = c[py, px]
        hole[py - half:py + half + 1, px - half:px + half + 1] = False
    return img


ICONS = ROOT / 'assets/ui/icon'
ICON_PX = range(16, 30, 2)  # sizes tried for the resource icon on the board picture (pixels)
ICON_MATCH = 0.62  # the least match score that counts as the icon


def find_icon(crop: np.ndarray, resource: str) -> tuple[tuple[int, int], float] | None:
    """Where the kit's icon for `resource` is printed in `crop` (centre and radius, crop pixels), if it is."""
    pic = cv2.imread(str(ICONS / f'{resource}.png'), cv2.IMREAD_UNCHANGED)
    if pic is None:
        return None
    best = None
    for px in ICON_PX:
        side = px * UP
        t = cv2.resize(pic, (side, side), interpolation=cv2.INTER_AREA)
        if t.shape[2] == 4:
            mask = (t[:, :, 3] > 40).astype(np.uint8)
            t = t[:, :, :3]
        else:
            mask = np.ones(t.shape[:2], np.uint8)
        res = cv2.matchTemplate(crop, t, cv2.TM_CCORR_NORMED, mask=mask)
        res = np.nan_to_num(res, nan=0.0, posinf=0.0, neginf=0.0)
        _, score, _, at = cv2.minMaxLoc(res)
        if best is None or score > best[0]:
            best = (score, (at[0] + side // 2, at[1] + side // 2), side / 2)
    return (best[1], best[2]) if best and best[0] >= ICON_MATCH else None


def outline_hull(whiteish: np.ndarray, to_crop, sx: float, sy: float, size: int) -> np.ndarray | None:
    """The convex hull of the largest white piece near slot (sx, sy), if its area is a building triangle's."""
    c = to_crop([[sx, sy]])[0]
    near = np.zeros((size, size), np.uint8)
    cv2.circle(near, (int(c[0]), int(c[1])), int(TRI_SIDE * 0.75 * UP), 1, -1)
    n, lab, stats, _ = cv2.connectedComponentsWithStats((whiteish.astype(np.uint8) & near), 8)
    if n <= 1:
        return None
    big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    hull = cv2.convexHull(cv2.findNonZero((lab == big).astype(np.uint8)))
    # Triangle-sized only: as wide as a side, a little less tall (a piece joined to other white lines is not).
    _, _, w, h = cv2.boundingRect(hull)
    side = TRI_SIDE * UP
    return hull if 0.85 * side < w < 1.12 * side and 0.78 * side < h < 1.0 * side else None


def fit_triangle(whiteish: np.ndarray, to_crop, sx: float, sy: float, size: int) -> np.ndarray:
    """The upright triangle near slot (sx, sy) whose edges lie most on white outline pixels (crop pixels)."""
    best = (-1.0, None)
    for side in range(TRI_SIDE - 10, TRI_SIDE + 9, 2):
        for dy in range(-14, 15, 2):
            for dx in range(-14, 15, 2):
                tri = to_crop(triangle(sx + dx, sy + dy, side))
                band = np.zeros((size, size), np.uint8)
                cv2.polylines(band, [tri], True, 1, 2 * UP)
                n = band.sum()
                score = float((whiteish * band).sum() / n) if n else 0.0
                if score > best[0]:
                    best = (score, tri)
    return best[1]


def cut_planet(board: np.ndarray, sid: str, sys: dict, sector: str | None, tune: dict, resource: str | None = None, crossing: list[str] = ()) -> tuple[np.ndarray, np.ndarray]:
    """The planet `sid` as a square BGRA picture (rebuilt), and the raw crop (for the contact sheet)."""
    disc = sys['disc']
    cx = disc['x'] + tune.get('dx', 0)
    cy = disc['y'] + tune.get('dy', 0)
    r = disc['r'] * tune.get('r', 1.0)
    pad = r * 1.08
    x0, y0 = cx - pad, cy - pad
    size = int(round(2 * pad * UP))
    # The crop, enlarged: the board picture moved so that (x0, y0) is the corner.
    m = np.float32([[UP, 0, -x0 * UP], [0, UP, -y0 * UP]])
    crop = cv2.warpAffine(board, m, (size, size), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    raw = crop.copy()

    def to_crop(pts):
        return ((np.asarray(pts, np.float32) - [x0, y0]) * UP).astype(np.int32)

    yy, xx = np.mgrid[0:size, 0:size]
    centre = size / 2
    inside = (xx - centre) ** 2 + (yy - centre) ** 2 <= (r * UP) ** 2

    # 1. The building triangles: a triangle fitted to the white outline around each slot
    #    (position and size), rebuilt whole with the planet's drawing (or, with keepUnder,
    #    its see-through dark fill brightened back and only the outline rebuilt).
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    whiteish = ((hsv[:, :, 2] > 150) & (hsv[:, :, 1] < 90)).astype(np.float32)
    outline = np.zeros((size, size), np.uint8)
    for s in sys.get('slots', []):
        tri = fit_triangle(whiteish, to_crop, s['x'], s['y'] + tune.get('triDy', 0), size)
        fill = np.zeros((size, size), np.uint8)
        cv2.fillPoly(fill, [tri], 255)
        # Also the outline as found (its largest white piece near the slot), when it is triangle-sized:
        # it follows the rounded corners and any shift the fit missed.
        hull = outline_hull(whiteish, to_crop, s['x'], s['y'] + tune.get('triDy', 0), size)
        if hull is not None:
            cv2.fillPoly(fill, [hull], 255)
        if tune.get('keepUnder', False):
            inner = cv2.erode(fill, np.ones((5 * UP, 5 * UP), np.uint8)).astype(bool)
            ring = cv2.dilate(fill, np.ones((9 * UP, 9 * UP), np.uint8)).astype(bool) & ~cv2.dilate(fill, np.ones((3 * UP, 3 * UP), np.uint8)).astype(bool)
            if inner.any() and ring.any():
                gain = (crop[ring].reshape(-1, 3).mean(0) + 1) / (crop[inner].reshape(-1, 3).mean(0) + 1)
                crop[inner] = np.clip(crop[inner].astype(np.float32) * np.clip(gain, 1, 6), 0, 255).astype(np.uint8)
            cv2.polylines(outline, [tri], True, 255, 5 * UP)
        else:
            outline |= cv2.dilate(fill, np.ones((6 * UP + 1, 6 * UP + 1), np.uint8))

    extra = np.zeros((size, size), np.uint8)

    # 2. The part of the disc in another sector, and the sector's edge line.
    other = np.zeros((size, size), bool)
    if sector:
        own = np.zeros((size, size), np.uint8)
        cv2.fillPoly(own, [to_crop(path_points(sector))], 255)
        other = ~cv2.erode(own, np.ones((EDGE * UP * 2 + 1, EDGE * UP * 2 + 1), np.uint8)).astype(bool)

    # 2b. The cracks and rift lines drawn across the board (traced in board.lines.json).
    for d in crossing:
        pts = to_crop(path_points(d))
        if len(pts) > 1:
            cv2.polylines(extra, [pts], False, 255, int(CRACK * UP))

    # 3. The resource icon printed by the planet: found by matching the kit's icon picture.
    icon_hole = np.zeros((size, size), np.uint8)
    if resource:
        found = find_icon(crop, resource)
        if found:
            (ix, iy), ir = found
            cv2.circle(icon_hole, (ix, iy), int(ir * 1.25), 255, -1)

    # 4. Holes listed by hand: circles {x, y, r} in board pixels.
    for h in tune.get('holes', []):
        p = to_crop([[h['x'], h['y']]])[0]
        cv2.circle(extra, (int(p[0]), int(p[1])), int(h['r'] * UP), 255, -1)

    hole = (outline.astype(bool) | other | extra.astype(bool) | icon_hole.astype(bool)) & inside
    source = inside & ~hole
    rebuilt = exemplar_fill(crop, hole, source).clip(0, 255).astype(np.uint8)

    # Square picture, transparent outside the disc (a soft edge).
    dist = np.sqrt((xx - centre) ** 2 + (yy - centre) ** 2)
    alpha = np.clip((r * UP - dist) / (1.5 * UP), 0, 1)
    out = np.dstack([rebuilt, (alpha * 255).astype(np.uint8)])
    out = cv2.resize(out, (OUT_PX, OUT_PX), interpolation=cv2.INTER_AREA)
    raw = cv2.resize(raw, (OUT_PX, OUT_PX), interpolation=cv2.INTER_AREA)
    return out, raw


def sheet(items: list[tuple[str, np.ndarray, np.ndarray]], cell: int = 220) -> np.ndarray:
    """Before (left) and after (right) for every planet, four pairs to a row, on a dark ground."""
    cols = 4
    rows = (len(items) + cols - 1) // cols
    W = cols * (2 * cell + 30)
    img = np.full((rows * (cell + 34), W, 3), 24, np.uint8)
    for k, (sid, out, raw) in enumerate(items):
        x = (k % cols) * (2 * cell + 30)
        y = (k // cols) * (cell + 34)
        a = cv2.resize(raw, (cell, cell))
        b = cv2.resize(out, (cell, cell))
        bg = np.full((cell, cell, 3), 24, np.float32)
        al = b[:, :, 3:4].astype(np.float32) / 255
        b = (b[:, :, :3] * al + bg * (1 - al)).astype(np.uint8)
        img[y + 26:y + 26 + cell, x:x + cell] = a
        img[y + 26:y + 26 + cell, x + cell + 6:x + 2 * cell + 6] = b
        cv2.putText(img, sid, (x + 4, y + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (220, 220, 220), 1, cv2.LINE_AA)
    return img


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--only', help='comma-separated system ids')
    ap.add_argument('--sheet', help='also write a before/after contact sheet here')
    args = ap.parse_args()

    board = cv2.imread(str(BOARD))
    if board is None:
        raise SystemExit(f'No board picture at {BOARD}')
    calib = json.loads(next(p for p in CALIB if p.exists()).read_text(encoding='utf8'))
    # The calibration is in the picture's own pixels.
    if board.shape[1] != calib['width']:
        board = cv2.resize(board, (calib['width'], calib['height']), interpolation=cv2.INTER_AREA)
    lines = json.loads(LINES.read_text(encoding='utf8'))
    tuning = json.loads(TUNING.read_text(encoding='utf8')) if TUNING.exists() else {}
    only = set(args.only.split(',')) if args.only else None
    content = json.loads((ROOT / 'data/content.json').read_text(encoding='utf8'))
    resources = {x['id']: x.get('resource') for x in content['map']['systems']}

    OUT.mkdir(parents=True, exist_ok=True)
    items = []
    for sid, sys in sorted(calib['systems'].items()):
        if 'disc' not in sys or (only and sid not in only):
            continue
        out, raw = cut_planet(board, sid, sys, lines['sectors'].get(sid), tuning.get(sid, {}), resources.get(sid), lines.get('cracks', []) + lines.get('lines', []))
        cv2.imwrite(str(OUT / f'{sid}.png'), out)
        items.append((sid, out, raw))
        print(sid)
    if args.sheet and items:
        cv2.imwrite(args.sheet, sheet(items))
        print('sheet', args.sheet)


if __name__ == '__main__':
    main()
