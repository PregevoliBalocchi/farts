"""The 2D planets for the game, from Gemini's pictures (see docs/ui-assets.md, "2D planets").

Steps:
  crops   cut each planet from the owner's board picture (assets/ui/map/board.png): a 1024 px square
          centred on its disc, `pad` disc radii from the centre to each side (wider for planets with
          parts that stick out). These go to Gemini with the prompts of the "Pianeti per Gemini" page.
  import  for each Gemini picture <id>.png (planet on flat magenta):
          1. magenta to transparency without a fringe (key-planets.py);
          2. aligned to its crop (Gemini sometimes zooms or moves the planet): a similarity transform
             from matched details (ORB + RANSAC), kept only when the match is solid;
          3. resampled into the game's frame: OUT_PAD disc radii each side, OUT_PX square;
          4. written to assets/ui/map/planets/<id>.png, plus a check sheet (crop | result over it).
          A planet without a good Gemini picture yet can use <gemini dir>/legacy/<id>.png instead:
          a transparent picture made by the earlier cutter (LEGACY_PAD framing), only reframed.

  python tools/map/import-planets.py crops <out dir>
  python tools/map/import-planets.py import <gemini dir> <crops dir> [--sheet sheet.png]
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / 'assets/ui/map/board.png'
CALIB = ROOT / 'src/ui/table/board.default.json'
OUT_DIR = ROOT / 'assets/ui/map/planets'
CROP_PX = 1024
# Planets whose drawing reaches well past the disc: cropped wider.
WIDE = {'c1-p1', 'c1-p3', 'c2-p1', 'c2-p3', 'c3-p1', 'c4-p1', 'c5-p3', 'c6-p1', 'c6-p3'}
PAD = {'wide': 1.7, 'round': 1.3}
# The game's frame (src/ui/table/board3d.ts FLAT_MARGIN must match OUT_PAD).
OUT_PAD = 1.7
OUT_PX = 768
# Framing of the pictures made by the earlier cutter (cut-planets.py).
LEGACY_PAD = 1.08


def pad_of(sid: str) -> float:
    return PAD['wide'] if sid in WIDE else PAD['round']


def discs() -> dict:
    cal = json.loads(CALIB.read_text())
    return {sid: s['disc'] for sid, s in cal['systems'].items() if s.get('disc')}


def cut_crops(out: str) -> None:
    os.makedirs(out, exist_ok=True)
    board = cv2.imread(str(BOARD))
    for sid, d in discs().items():
        pad = d['r'] * pad_of(sid)
        k = CROP_PX / (2 * pad)
        m = np.float32([[k, 0, -(d['x'] - pad) * k], [0, k, -(d['y'] - pad) * k]])
        cv2.imwrite(os.path.join(out, sid + '.png'), cv2.warpAffine(board, m, (CROP_PX, CROP_PX), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE))
        print(sid)


def load_key():
    spec = importlib.util.spec_from_file_location('key_planets', Path(__file__).with_name('key-planets.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.key


def align(gem_bgra: np.ndarray, crop: np.ndarray) -> tuple[np.ndarray, str]:
    """The 2x3 similarity taking Gemini's picture onto its crop, and how it was found."""
    ident = np.float32([[1, 0, 0], [0, 1, 0]])
    a = gem_bgra[..., 3:].astype(np.float32) / 255
    g1 = cv2.cvtColor((gem_bgra[..., :3] * a).astype(np.uint8), cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(4000)
    k1, d1 = orb.detectAndCompute(g1, (gem_bgra[..., 3] > 200).astype(np.uint8))
    k2, d2 = orb.detectAndCompute(g2, None)
    if d1 is None or d2 is None:
        return ident, 'no features'
    matches = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d1, d2)
    if len(matches) < 20:
        return ident, f'{len(matches)} matches'
    p1 = np.float32([k1[m.queryIdx].pt for m in matches])
    p2 = np.float32([k2[m.trainIdx].pt for m in matches])
    m, inl = cv2.estimateAffinePartial2D(p1, p2, method=cv2.RANSAC, ransacReprojThreshold=4.0, maxIters=5000)
    n = int(inl.sum()) if inl is not None else 0
    if m is None or n < 25:
        return ident, f'weak match ({n} inliers), kept as is'
    s = float(np.hypot(m[0, 0], m[1, 0]))
    if not 0.55 < s < 1.6:
        return ident, f'implausible scale {s:.2f}, kept as is'
    if abs(s - 1) < 0.015 and np.hypot(m[0, 2], m[1, 2]) < 4:
        return ident, f'already aligned ({n} inliers)'
    return m.astype(np.float32), f'aligned: scale {s:.3f}, shift {m[0, 2]:.0f},{m[1, 2]:.0f} ({n} inliers)'


def to_frame(pad: float, size: int) -> np.ndarray:
    """2x3 taking a picture framed `pad` radii each side at `size` px into the game's frame."""
    k = (OUT_PX / (2 * OUT_PAD)) / (size / (2 * pad))
    c = OUT_PX / 2 - k * size / 2
    return np.float32([[k, 0, c], [0, k, c]])


def chain(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """b after a, both 2x3."""
    return (np.vstack([b, [0, 0, 1]]) @ np.vstack([a, [0, 0, 1]]))[:2].astype(np.float32)


def warp(bgra: np.ndarray, m: np.ndarray) -> np.ndarray:
    # Premultiplied, so no colour bleeds in from transparent pixels.
    f = bgra.astype(np.float32)
    f[..., :3] *= f[..., 3:] / 255
    w = cv2.warpAffine(f, m, (OUT_PX, OUT_PX), flags=cv2.INTER_AREA if m[0, 0] < 1 else cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    a = np.maximum(w[..., 3:], 1e-3)
    w[..., :3] = np.where(w[..., 3:] > 0, w[..., :3] * 255 / a, 0)
    return np.clip(w, 0, 255).round().astype(np.uint8)


def import_all(gem_dir: str, crop_dir: str, sheet_path: str | None) -> None:
    key = load_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    for sid in sorted(discs()):
        crop = cv2.imread(os.path.join(crop_dir, sid + '.png'))
        legacy = os.path.join(gem_dir, 'legacy', sid + '.png')
        path = os.path.join(gem_dir, sid + '.png')
        if os.path.exists(legacy):
            src = cv2.imread(legacy, cv2.IMREAD_UNCHANGED)
            out = warp(src, to_frame(LEGACY_PAD, src.shape[0]))
            how = 'earlier picture, reframed'
        elif os.path.exists(path):
            gem = key(cv2.resize(cv2.imread(path), (CROP_PX, CROP_PX), interpolation=cv2.INTER_AREA))
            m, how = align(gem, crop)
            out = warp(gem, chain(m, to_frame(pad_of(sid), CROP_PX)))
        else:
            print(sid, 'no picture, skipped')
            continue
        cv2.imwrite(str(OUT_DIR / (sid + '.png')), out)
        print(sid, how)
        if sheet_path:
            base = cv2.warpAffine(crop, to_frame(pad_of(sid), CROP_PX), (OUT_PX, OUT_PX)).astype(np.float32)
            al = out[..., 3:].astype(np.float32) / 255
            over = base * (1 - 0.85 * al) + out[..., :3] * 0.85 * al
            row = cv2.resize(np.hstack([base, over]).astype(np.uint8), (720, 360), interpolation=cv2.INTER_AREA)
            cv2.putText(row, sid, (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (90, 200, 240), 2)
            rows.append(row)
    if sheet_path and rows:
        while len(rows) % 2:
            rows.append(np.zeros_like(rows[0]))
        cv2.imwrite(sheet_path, np.vstack([np.hstack(rows[i:i + 2]) for i in range(0, len(rows), 2)]))


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('crops')
    c.add_argument('out')
    i = sub.add_parser('import')
    i.add_argument('gemini')
    i.add_argument('crops')
    i.add_argument('--sheet')
    args = ap.parse_args()
    if args.cmd == 'crops':
        cut_crops(args.out)
    else:
        import_all(args.gemini, args.crops, args.sheet)


if __name__ == '__main__':
    main()
