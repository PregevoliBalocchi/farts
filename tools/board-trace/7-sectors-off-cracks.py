# Step G: the sectors stop at the cracks' traced edges. Step B filled each sector up to the middle of
# the cracks between clusters (and of the two spikes), so a sector's colour ran across half of the
# crack, past the jagged edge drawn on top. Here every sector loses whatever the cracks cover and is
# traced again finely, so its outline follows the jagged edge. Rewrites "sectors" in
# src/ui/table/board.lines.json; run it once after step D (4-crack-edges.py) has written the cracks.
#
#   python tools/board-trace/7-sectors-off-cracks.py
import cv2, json, numpy as np, re

S = 4                  # work at four times the picture's size
EPS = 0.5              # how far the traced outline may stray from the mask (picture pixels)
LINES = 'src/ui/table/board.lines.json'
out = json.load(open(LINES))
W, H = out['width'], out['height']


def polys(d):
    """The closed outlines of an SVG path made of M/L/Z, at work scale."""
    return [(np.array(re.findall(r'(-?[\d.]+),(-?[\d.]+)', sub), float) * S).round().astype(np.int32) for sub in re.findall(r'M[^M]*', d)]


cracks = np.zeros((H * S, W * S), np.uint8)
for d in out.get('cracks', []):
    cv2.fillPoly(cracks, polys(d), 1)

sectors = {}
for sid, d in out['sectors'].items():
    reg = np.zeros_like(cracks)
    cv2.fillPoly(reg, polys(d), 1)
    reg[cracks > 0] = 0
    cs, _ = cv2.findContours(reg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)          # a crumb cut off by a crack is not the sector
    c = cv2.approxPolyDP(c, EPS * S, True).reshape(-1, 2) / S
    sectors[sid] = 'M' + 'L'.join(f'{p[0]:.1f},{p[1]:.1f}' for p in c) + 'Z'
    print(sid, len(d), '->', len(sectors[sid]))
out['sectors'] = sectors
with open(LINES, 'w') as f:
    json.dump(out, f)
print('written', LINES)
