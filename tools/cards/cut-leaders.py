"""Cuts each leader's character out of its card picture, as the players' avatar.

    python tools/cards/cut-leaders.py            (needs opencv-python and numpy)

Reads assets/cards/leaders/leader-nn.* (the whole card: the character on dark,
scribbled space over a white text panel) and writes the character alone, on a
clear background, to assets/cards/avatar/leader-nn.webp. The table draws it
rising out of the seat boards (key avatar.<card id>).

How: colour or light in large blobs is surely the character; GrabCut grows
that into the dark ink around it; flat black shapes touching it (weapons,
shadows: the space behind is scribbled, never flat) are added; holes are filled.
"""
import glob, os, sys
import cv2
import numpy as np

SRC = 'assets/cards/leaders'
OUT = 'assets/cards/avatar'

def cut(path):
    im = cv2.imread(path)
    H, W = im.shape[:2]
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    # The art: inside the white border, above the white text panel.
    rows = (gray[:, int(W * 0.1):int(W * 0.9)] > 235).mean(axis=1)
    panel = next(y for y in range(int(H * 0.3), H) if rows[y] > 0.85)
    side = int(W * 0.03)
    art = im[int(H * 0.012):panel, side:W - side].copy()
    h, w = art.shape[:2]
    b, g, r = [art[..., i].astype(np.int16) for i in range(3)]
    val = np.maximum(np.maximum(b, g), r)
    chroma = val - np.minimum(np.minimum(b, g), r)
    # The dripping white edge at the top: white joined to the first rows.
    white = (val > 170).astype(np.uint8)
    n, lab = cv2.connectedComponents(white, connectivity=8)
    drip = np.isin(lab, np.unique(lab[:3][lab[:3] > 0]))
    drip = cv2.dilate(drip.astype(np.uint8), np.ones((9, 9), np.uint8)) == 1
    # Surely the character: colour, or light, in large blobs (stars are small).
    strong = (((chroma > 30) & (val > 45)) | (val > 150)) & ~drip
    strong = cv2.morphologyEx(strong.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(strong, 8)
    keep = np.zeros_like(strong)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 0.0015 * h * w:
            keep[lab == i] = 1
    mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    mask[cv2.dilate(keep, np.ones((45, 45), np.uint8)) == 1] = cv2.GC_PR_FGD
    mask[cv2.erode(keep, np.ones((5, 5), np.uint8)) == 1] = cv2.GC_FGD
    mask[cv2.dilate(keep, np.ones((131, 131), np.uint8)) == 0] = cv2.GC_BGD
    mask[drip] = cv2.GC_BGD
    mask[:4] = cv2.GC_BGD
    mask[:, :4] = cv2.GC_BGD
    mask[:, -4:] = cv2.GC_BGD
    cv2.grabCut(art, mask, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    m = (((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)) | (keep == 1)).astype(np.uint8)
    # Flat black shapes touching the character: the space behind is scribbled, so it is never flat.
    g8 = cv2.cvtColor(art, cv2.COLOR_BGR2GRAY).astype(np.float32)
    mean = cv2.blur(g8, (9, 9))
    std = np.sqrt(np.maximum(cv2.blur(g8 * g8, (9, 9)) - mean * mean, 0))
    flat = ((mean < 26) & (std < 7) & ~drip).astype(np.uint8)
    flat = cv2.morphologyEx(flat, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(flat, 8)
    touch = cv2.dilate(m, np.ones((7, 7), np.uint8))
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 60 and (touch[lab == i]).any():
            m[lab == i] = 1
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    # The large pieces only, their holes filled.
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    big = max(st[1:, cv2.CC_STAT_AREA])
    m2 = np.zeros_like(m)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 0.03 * big:
            m2[lab == i] = 1
    ff = np.pad(m2, 1).copy()
    cv2.floodFill(ff, None, (0, 0), 2)
    m2[ff[1:-1, 1:-1] == 0] = 1
    alpha = cv2.GaussianBlur((m2 * 255).astype(np.uint8), (0, 0), 1.0)
    ys, xs = np.where(m2 > 0)
    x0, x1, y0 = max(0, xs.min() - 3), min(w, xs.max() + 4), max(0, ys.min() - 3)
    return np.dstack([art, alpha])[y0:h, x0:x1]

def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(f for f in glob.glob(os.path.join(SRC, 'leader-*.*')))
    for f in files:
        cid = os.path.splitext(os.path.basename(f))[0]
        rgba = cut(f)
        cv2.imwrite(os.path.join(OUT, cid + '.webp'), rgba, [cv2.IMWRITE_WEBP_QUALITY, 92])
        print(cid, rgba.shape[1], 'x', rgba.shape[0])
    print(len(files), 'avatars ->', OUT)

if __name__ == '__main__':
    main()
