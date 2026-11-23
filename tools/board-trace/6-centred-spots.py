# Step F: ship places centred in each system, by how many seats have ships there. For every
# system, where 1, 2, 3 or 4 seats' ships stand: as near the middle of the free part of its zone
# as there is room, clear of the planet, the lines, the building slots, the resource icon, the ring
# symbols and the gate number; two or more seats stand in a small even figure (pair, triangle,
# square) around that middle. Adds "layouts" to each system's spots in src/ui/table/board.lines.json.
#
#   python tools/board-trace/6-centred-spots.py <folder with sectors.npy, hole.npy, ink.npy>
#
# The .npy masks are the ones step B (2-trace-and-zones.py) leaves in its working folder, at three
# times the picture's size.
import cv2, json, math, numpy as np, sys
from scipy import ndimage

SP = sys.argv[1].rstrip('/\\') + '/'
S = 3
LINES = 'src/ui/table/board.lines.json'
cal = json.load(open('src/ui/table/board.default.json'))
out = json.load(open(LINES))
ids = list(cal['systems'].keys())
ring = out['ring']

def small(a):
    """A mask at three times the picture's size, back to picture pixels (any covered pixel counts)."""
    h, w = a.shape[0] // S, a.shape[1] // S
    return a[: h * S, : w * S].reshape(h, S, w, S).max(axis=(1, 3))

full = np.load(SP + 'sectors.npy').copy()
hole = ndimage.binary_fill_holes(np.load(SP + 'hole.npy'))
ink = np.load(SP + 'ink.npy') > 0
full[hole] = 0
# Zone labels in picture pixels: the centre of each 3×3 block.
zones = full[S // 2 :: S, S // 2 :: S][: full.shape[0] // S, : full.shape[1] // S]
H, W = zones.shape

blocked = small(ink).astype(np.uint8)
for d in out.get('cracks', []):
    pts = np.array([[float(v) for v in p.split(',')] for p in d[1:-1].split('L')])
    cv2.fillPoly(blocked, [pts.astype(np.int32)], 1)
E = 38
blocked[:E] = 1; blocked[-E:] = 1; blocked[:, :E] = 1; blocked[:, -E:] = 1
for sid, p in cal['systems'].items():
    d = p.get('disc')
    if d:
        dx, dy = d['x'] - ring['cx'], d['y'] - ring['cy']
        L = math.hypot(dx, dy)
        cv2.circle(blocked, (int(d['x'] + dx / L * d['r'] * 0.9), int(d['y'] + dy / L * d['r'] * 0.9)), 28, 1, -1)  # resource icon
    for s in p.get('slots', []):
        cv2.circle(blocked, (int(s['x']), int(s['y'])), 36, 1, -1)                                             # building slot
    if d:
        cv2.circle(blocked, (int(d['x']), int(d['y'])), int(d['r'] * 1.12), 1, -1)                              # the planet
for s in out['symbols']:
    cv2.circle(blocked, (int(s['x']), int(s['y'])), 26, 1, -1)
for g in out['gates']:
    cv2.circle(blocked, (int(g['x']), int(g['y'])), 46, 1, -1)                                                 # gate number
# Seen from the tilted camera a ship stands up the screen from its place: it covers what is just
# above it in the picture, so whatever must stay in view also keeps the places below it clear.
TALL = 28
b0 = blocked.copy()
for k in range(1, TALL):
    blocked[k:] |= b0[:-k]

GAP = 86            # picture pixels between two seats' places (a ship group is about 60 wide)
ROOM = 30           # free picture pixels a place needs around it (a ship group and its count tag)

def figure(n, gap, a):
    """n places around (0, 0), `gap` apart, turned by angle a."""
    if n == 1:
        pts = [(0.0, 0.0)]
    elif n == 2:
        pts = [(-gap / 2, 0.0), (gap / 2, 0.0)]
    elif n == 3:
        r = gap / math.sqrt(3)
        pts = [(r * math.cos(t), r * math.sin(t)) for t in (math.pi / 2, math.pi / 2 + 2 * math.pi / 3, math.pi / 2 + 4 * math.pi / 3)]
    else:
        h = gap / 2
        pts = [(-h, -h), (h, -h), (h, h), (-h, h)]
    c, s = math.cos(a), math.sin(a)
    return [(x * c - y * s, x * s + y * c) for x, y in pts]

for k, sid in enumerate(ids):
    p = cal['systems'][sid]
    d = p.get('disc')
    free = (zones == k + 1) & (blocked == 0)
    clear = ndimage.distance_transform_edt(free)
    ys, xs = np.nonzero(free)
    # The middle of the room the zone leaves: the centre of its free part.
    mx, my = xs.mean(), ys.mean()

    def ok(x, y, room):
        xi, yi = int(round(x)), int(round(y))
        return 0 <= xi < W and 0 <= yi < H and clear[yi, xi] >= room

    layouts = []
    for n in (1, 2, 3, 4):
        best = None
        # Tighter figures cost a little: a roomy place far off loses to a snug one in the middle.
        for li, (room, f) in enumerate(((ROOM, 1.0), (24, 0.92), (18, 0.84), (12, 0.75))):
            gap = GAP * f
            cy, cx = np.nonzero(clear >= (room if n == 1 else 1))
            if not len(cx):
                continue
            # Candidate middles: free points, nearest to the zone's middle first.
            order = np.argsort(np.hypot(cx - mx, cy - my))
            cx, cy = cx[order][::3][:1500], cy[order][::3][:1500]
            for x0, y0 in zip(cx, cy):
                dist = math.hypot(x0 - mx, y0 - my)
                if best and dist + 35 * li - 2 > best[0]:
                    break
                for step in range(12 if n > 1 else 1):
                    pts = [(x0 + x, y0 + y) for x, y in figure(n, gap, step * math.pi / 12)]
                    if all(ok(x, y, room) for x, y in pts):
                        # Nearest the middle wins; among those, the roomiest figure.
                        roomy = min(clear[int(round(y)), int(round(x))] for x, y in pts)
                        score = dist + 35 * li - 0.05 * min(roomy, 40)
                        if not best or score < best[0]:
                            best = (score, pts)
        if not best:
            # No even figure fits: the n roomy places nearest the middle, kept apart.
            cy, cx = np.nonzero(clear >= 10)
            order = np.argsort(np.hypot(cx - mx, cy - my))
            got = []
            for i in order[::2]:
                q = (float(cx[i]), float(cy[i]))
                if all(math.hypot(q[0] - a, q[1] - b) >= GAP * 0.75 for a, b in got):
                    got.append(q)
                    if len(got) == n:
                        break
            best = (0, got if len(got) == n else [tuple(q) for q in out['spots'][sid]['ships'][:n]])
        layouts.append([[round(float(x), 1), round(float(y), 1)] for x, y in best[1]])
    out['spots'][sid]['layouts'] = layouts
    print(sid, layouts[0], layouts[1])

json.dump(out, open(LINES, 'w'))
im = cv2.imread(sys.argv[2] if len(sys.argv) > 2 else 'assets/ui/map/board.png')
if im is not None:
    im = im // 2
    colours = [(255, 255, 255), (60, 220, 255), (90, 255, 120), (255, 120, 255)]
    for sid, sp in out['spots'].items():
        for n, lay in enumerate(sp.get('layouts', [])):
            for x, y in lay:
                cv2.circle(im, (int(x), int(y)), 6 + 3 * n, colours[n], 2)
    cv2.imwrite(SP + 'layouts.png', im)
