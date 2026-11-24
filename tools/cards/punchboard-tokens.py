"""Cuts the campaign tokens the table draws as flat tiles out of the punchboard PDF.

    python tools/cards/punchboard-tokens.py

Reads docs/rules/Arcs_Campaign_Punchboard.pdf (committed, the publisher's
print file) and writes assets/ui/token/<name>.png: the fresh Blight token, the
chapter track tile (Acts I & II side), the First Regent tile and the Edenguard
and Blightkin ambition tiles. The PDF has the front sides only. Needs PyMuPDF
and Pillow. Rects are PDF points on the page (0-based page index), measured on
the 2026-11 print file.
"""
import os
import cv2
import numpy as np
import pymupdf
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
PDF = os.path.join(ROOT, 'docs', 'rules', 'Arcs_Campaign_Punchboard.pdf')
OUT = os.path.join(ROOT, 'assets', 'ui', 'token')
DPI = 220

# name: (page, rect in points around the token, shape, inset in points inside the cyan cut line)
TOKENS = {
    'blight': (0, (510, 17, 595, 102), 'disc', 1),
    'chapter-1-2': (5, (252, 585, 596, 741), 'round-rect', 1),
    'first-regent': (6, (268, 585, 611, 741), 'round-rect', 1),
    'ambition-edenguard': (5, (17, 425, 247, 584), 'round-rect', 1),
    'ambition-blightkin': (6, (17, 425, 247, 584), 'round-rect', 1),
}


def guides(rgb):
    """Where the print file's cut (cyan) and safe-area (magenta) guide lines are."""
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    cyan = (r < 90) & (g > 120) & (b > 190) & (b - r > 120)
    magenta = (r > 190) & (g < 90) & (b > 90) & (r - g > 130)
    return cyan, magenta


def cut(page, rect, shape, inset):
    x0, y0, x1, y1 = rect
    pix = page.get_pixmap(dpi=DPI, clip=pymupdf.Rect(x0 - 2, y0 - 2, x1 + 2, y1 + 2), alpha=False)
    rgb = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3).copy()
    cyan, magenta = guides(rgb)
    # Crop to the cut line, then paint the guide lines out of the art.
    # The token's own cut line: the smallest cyan outline around the clip's centre
    # (neighbouring tokens' lines also reach into the clip).
    h, w = cyan.shape
    found, _ = cv2.findContours(cv2.dilate((cyan * 255).astype(np.uint8), np.ones((3, 3), np.uint8)), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    boxes = [cv2.boundingRect(c) for c in found]
    boxes = [(x, y, bw, bh) for x, y, bw, bh in boxes if x < w / 2 < x + bw and y < h / 2 < y + bh and bw > w / 3 and bh > h / 3]
    if boxes:
        x, y, bw, bh = min(boxes, key=lambda b: b[2] * b[3])
        k = int(inset * DPI / 72)
        rgb = rgb[y + k: y + bh - k, x + k: x + bw - k]
        cyan, magenta = guides(rgb)
    lines = cyan | magenta
    if shape != 'disc':  # the tiles' teal safe-area line (the Blight disc's own art is teal)
        r, g, b = (rgb[..., i].astype(int) for i in range(3))
        lines |= (r < 90) & (g > 110) & (b > 100) & (abs(g - b) < 70)
    lines = cv2.dilate((lines * 255).astype(np.uint8), np.ones((3, 3), np.uint8))
    rgb = cv2.inpaint(rgb, lines, 3, cv2.INPAINT_TELEA)
    img = Image.fromarray(rgb).convert('RGBA')
    mask = Image.new('L', img.size, 0)
    g = ImageDraw.Draw(mask)
    if shape == 'disc':
        g.ellipse((0, 0, img.width - 1, img.height - 1), fill=255)
    else:
        g.rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=int(img.height * 0.09), fill=255)
    img.putalpha(mask)
    return img


doc = pymupdf.open(PDF)
os.makedirs(OUT, exist_ok=True)
for name, (page, rect, shape, inset) in TOKENS.items():
    img = cut(doc[page], rect, shape, inset)
    img.save(os.path.join(OUT, name + '.png'), optimize=True)
    print(name, img.size)
