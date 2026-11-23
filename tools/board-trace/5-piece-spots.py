# Step E: where pieces go, from the zones of the information layer. For every system: four ship
# spots (one per seat) and four token spots (campaign markers and the like), inside its zone, clear
# of the planet, the lines, the building slots, the resource icon, the ring symbols and the gate
# number. Adds "spots" to board.lines.new.json and writes a preview.
import cv2, json, numpy as np, sys
from scipy import ndimage
SP = sys.argv[1]
S = 3
cal = json.load(open('src/ui/table/board.default.json'))
out = json.load(open(SP + 'board.lines.new.json'))
full = np.load(SP + 'sectors.npy'); hole = np.load(SP + 'hole.npy'); ink = np.load(SP + 'ink.npy')
H, W = full.shape
ids = list(cal['systems'].keys())
ring = out['ring']
hole = ndimage.binary_fill_holes(hole)
full = full.copy(); full[hole] = 0

# Everything a piece must not cover, in picture pixels (x, y, radius).
blocked = np.zeros((H, W), np.uint8)
blocked[ink > 0] = 1
cracks = np.zeros((H, W), np.uint8)
for d in out.get('cracks', []):
    pts = np.array([[float(v) for v in p.split(',')] for p in d[1:-1].split('L')]) * S
    cv2.fillPoly(cracks, [pts.astype(np.int32)], 1)
blocked |= cracks
E = 38 * S                           # keep off the picture's edge
blocked[:E] = 1; blocked[-E:] = 1; blocked[:, :E] = 1; blocked[:, -E:] = 1
for sid, p in cal['systems'].items():
    d = p.get('disc')
    if d:
        dx, dy = d['x'] - ring['cx'], d['y'] - ring['cy']
        L = np.hypot(dx, dy)
        ix, iy = d['x'] + dx / L * d['r'] * 0.9, d['y'] + dy / L * d['r'] * 0.9
        cv2.circle(blocked, (int(ix * S), int(iy * S)), 26 * S, 1, -1)              # resource icon
    for s in p.get('slots', []):
        cv2.circle(blocked, (int(s['x'] * S), int(s['y'] * S)), 34 * S, 1, -1)      # building slot
for s in out['symbols']:
    cv2.circle(blocked, (int(s['x'] * S), int(s['y'] * S)), 20 * S, 1, -1)
for g in out['gates']:
    cv2.circle(blocked, (int(g['x'] * S), int(g['y'] * S)), 36 * S, 1, -1)          # gate number

spots = {}
SHIP_GAP, TOKEN_GAP = 62, 46        # picture pixels between spots
MARGIN = 20                          # from the zone's edge and anything blocked
for k, sid in enumerate(ids):
    zone = full == k + 1
    p = cal['systems'][sid]
    d = p.get('disc')
    free = zone.astype(np.uint8)
    if d:
        cv2.circle(free, (int(d['x'] * S), int(d['y'] * S)), int(d['r'] * 1.04 * S), 0, -1)
    free = (free > 0) & ~(blocked > 0)
    clear = ndimage.distance_transform_edt(free) / S
    cx, cy = (d['x'], d['y']) if d else (p['x'], p['y'])

    def cands(margin):
        ys, xs = np.nonzero(clear >= margin)
        px, py = xs / S, ys / S
        return px, py, np.hypot(px - cx, py - cy) - (d['r'] if d else 0), clear[ys, xs]

    def pick(n, gap, taken, score_of):
        """n spots at least gap apart (and from taken), best score first; tighter margins when room runs out."""
        got = []
        for margin, f in ((MARGIN, 1.0), (14, 0.85), (9, 0.7)):
            px, py, near, roomy = cands(margin)
            score = score_of(near, roomy)
            while len(got) < n and len(px):
                dist = np.full(px.shape, np.inf)
                for q in taken + got:
                    dist = np.minimum(dist, np.hypot(px - q[0], py - q[1]))
                cand = dist >= gap * f
                if not cand.any():
                    break
                i = np.argmax(np.where(cand, score, -np.inf))
                got.append((round(float(px[i]), 1), round(float(py[i]), 1)))
            if len(got) == n:
                break
        return got

    # Ships: close to the planet (or the gate number), where there is room.
    ships = pick(4, SHIP_GAP, [], lambda near, roomy: -near + np.minimum(roomy, 40) * 1.5)
    # Tokens: roomy places near the planet, away from the ships.
    tokens = pick(4, TOKEN_GAP, ships, lambda near, roomy: np.minimum(roomy, 45) - 0.45 * np.maximum(near, 0))
    spots[sid] = dict(ships=[list(s) for s in ships], tokens=[list(t) for t in tokens])
    print(sid, len(ships), len(tokens))
out['spots'] = spots
json.dump(out, open(SP + 'board.lines.new.json', 'w'))
im = cv2.imread('assets/ui/map/board.png') // 2
for sid, sp in spots.items():
    for i, (x, y) in enumerate(sp['ships']):
        cv2.circle(im, (int(x), int(y)), 12, (60, 220, 255), 2)
        cv2.putText(im, str(i), (int(x) - 4, int(y) + 4), 0, 0.4, (60, 220, 255), 1)
    for x, y in sp['tokens']:
        cv2.rectangle(im, (int(x) - 9, int(y) - 9), (int(x) + 9, int(y) + 9), (255, 120, 255), 2)
cv2.imwrite(SP + 'spots.png', im)
