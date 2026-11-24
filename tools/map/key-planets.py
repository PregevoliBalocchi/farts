"""Gemini's planet pictures back into the game: magenta background to transparency, without the fringe.

Gemini returns each planet on flat magenta (#FF00FF). Its edge pixels blend the planet with the magenta,
so a plain colour key leaves a purple/pink rim. Here:
  1. background = the magenta-like pixels connected to the picture's border, plus any clearly magenta
     pocket inside (gaps between fragments);
  2. the planet's own colour is carried from the sure interior out over the edge band (inpainting);
  3. each edge pixel's alpha is how far it lies from magenta towards that colour, and its colour is
     unmixed from the magenta (c = a*F + (1-a)*M  ->  F).
Writes a BGRA PNG per planet and, with --sheet, a contact sheet (input | keyed, over a checker board).

  python tools/map/key-planets.py <in dir with <id>.png> <out dir> [--sheet sheet.png]
"""
import argparse
import os

import cv2
import numpy as np

MAGENTA = np.array([255, 0, 255], np.float32)  # BGR and RGB alike
NEAR = 120     # colour distance to magenta that may still be background, from the border
POCKET = 55    # colour distance for an enclosed magenta pocket (gaps inside the planet)
BAND = 3       # edge band width (pixels) where alpha is solved


def key(img: np.ndarray) -> np.ndarray:
    f = img.astype(np.float32)
    dist = np.linalg.norm(f - MAGENTA, axis=2)
    # 1. Background: magenta-like regions touching the border, and strong magenta pockets anywhere.
    _, lab = cv2.connectedComponents((dist < NEAR).astype(np.uint8), connectivity=4)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, edge[edge > 0])
    n2, lab2, st, _ = cv2.connectedComponentsWithStats((dist < POCKET).astype(np.uint8), connectivity=4)
    for i in range(1, n2):
        if st[i, cv2.CC_STAT_AREA] > 40:
            bg |= lab2 == i
    fg = ~bg
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * BAND + 1, 2 * BAND + 1))
    sure = cv2.erode(fg.astype(np.uint8), k).astype(bool)
    band = fg & ~sure
    # 2. The planet's colour carried over the band and the background.
    carried = cv2.inpaint(img, (~sure).astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA).astype(np.float32)
    # 3. Alpha by projection on magenta -> planet colour, then unmix.
    d = carried - MAGENTA
    a = np.einsum('ijk,ijk->ij', f - MAGENTA, d) / np.maximum(np.einsum('ijk,ijk->ij', d, d), 1.0)
    a = np.clip(a, 0, 1)
    alpha = np.where(sure, 1.0, np.where(band, a, 0.0))
    al = alpha[..., None]
    unmixed = (f - (1 - al) * MAGENTA) / np.maximum(al, 1e-3)
    col = np.where(band[..., None], np.where(al > 0.04, np.clip(unmixed, 0, 255), carried), f)
    return np.dstack([np.clip(col, 0, 255).astype(np.uint8), (alpha * 255).round().astype(np.uint8)])


def checker(h: int, w: int, s: int = 16) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w]
    c = ((yy // s + xx // s) % 2).astype(np.float32)
    return np.dstack([42 + 14 * c] * 3)


def sheet(pairs, path, cell=360):
    rows = []
    for sid, src, out in pairs:
        a = cv2.resize(src, (cell, cell), interpolation=cv2.INTER_AREA)
        b = cv2.resize(out, (cell, cell), interpolation=cv2.INTER_AREA).astype(np.float32)
        al = b[..., 3:] / 255
        comp = (b[..., :3] * al + checker(cell, cell) * (1 - al)).astype(np.uint8)
        row = np.hstack([a, comp])
        cv2.putText(row, sid, (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (90, 200, 240), 2)
        rows.append(row)
    cols = 2
    while len(rows) % cols:
        rows.append(np.zeros_like(rows[0]))
    grid = np.vstack([np.hstack(rows[i:i + cols]) for i in range(0, len(rows), cols)])
    cv2.imwrite(path, grid)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--sheet')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    pairs = []
    for name in sorted(os.listdir(args.src)):
        if not name.endswith('.png'):
            continue
        img = cv2.imread(os.path.join(args.src, name), cv2.IMREAD_COLOR)
        out = key(img)
        cv2.imwrite(os.path.join(args.out, name), out)
        pairs.append((name[:-4], img, out))
        print(name)
    if args.sheet:
        sheet(pairs, args.sheet)


if __name__ == '__main__':
    main()
