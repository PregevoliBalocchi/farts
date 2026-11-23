# Step B: traced cracks and ring edge, separators extended, sectors filled, ring symbols placed.
import cv2, json, numpy as np, sys
from scipy import ndimage
SP = sys.argv[1]
im = cv2.imread('assets/ui/map/board.png')
cal = json.load(open('src/ui/table/board.default.json'))
content = json.load(open('data/content.json', encoding='utf8'))
G = json.load(open(SP + 'geoA.json'))
H, W = im.shape[:2]
S = 3
ring = G['ring']


def ell(x, y):
    a = np.radians(ring['angle']); c, s = np.cos(a), np.sin(a)
    dx, dy = x - ring['cx'], y - ring['cy']
    u, w = dx * c + dy * s, -dx * s + dy * c
    return np.hypot(u / ring['rx'], w / ring['ry'])


def ell_point(theta):
    a = np.radians(ring['angle']); c, s = np.cos(a), np.sin(a)
    u, w = ring['rx'] * np.cos(theta), ring['ry'] * np.sin(theta)
    return ring['cx'] + u * c - w * s, ring['cy'] + u * s + w * c


def extend(sep):
    a, b = np.array(sep['a']), np.array(sep['b'])
    d = (b - a) / np.linalg.norm(b - a)
    lo, hi = -400.0, 400.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if ell(*(a + d * mid)) > 1: hi = mid
        else: lo = mid
    A = a + d * hi
    ts = [(lim - A[k]) / d[k] for k, lim in ((0, 0), (0, W), (1, 0), (1, H)) if abs(d[k]) > 1e-9 and (lim - A[k]) / d[k] > 0]
    B = A + d * min(ts)
    return [round(float(A[0]), 1), round(float(A[1]), 1)], [round(float(B[0]), 1), round(float(B[1]), 1)]


seps = []
for s in G['separators']:
    A, B = extend(s)
    seps.append(dict(cluster=s['cluster'], a=A, b=B))
discs = {k: v['disc'] for k, v in cal['systems'].items() if 'disc' in v}
# Extra planet art outside the calibrated discs (moon chains, rings): erased by hand.
EXTRA = [(440, 200, 62), (1310, 470, 45), (238, 205, 92)]

v = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)[..., 2]
big = cv2.resize(v, (W * S, H * S), interpolation=cv2.INTER_CUBIC)
th = cv2.morphologyEx(big, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9 * S, 9 * S)))
th = cv2.GaussianBlur(th, (0, 0), 1.2)
_, m = cv2.threshold(th, 45, 255, cv2.THRESH_BINARY)
yy, xx = np.mgrid[0:H * S, 0:W * S]
R = ell(xx / S, yy / S)


def clear_planets(img, k):
    for d in discs.values():
        cv2.circle(img, (int(d['x'] * S), int(d['y'] * S)), int(d['r'] * S * k), 0, -1)
    for x, y, r in EXTRA:
        cv2.circle(img, (x * S, y * S), r * S, 0, -1)


# --- drawn line art: cracks and the jagged inner edge of the ring (ring outline and separators are vectors) ---
art = m.copy()
art[np.abs(R - 1) < 0.012] = 0
for s in seps:
    cv2.line(art, (int(s['a'][0] * S), int(s['a'][1] * S)), (int(s['b'][0] * S), int(s['b'][1] * S)), 0, 7 * S)
clear_planets(art, 1.06)
# Hand clean-up: gate numbers (drawn as text), bits of planet outlines, ring ticks by the two spikes.
for sid, p in cal['systems'].items():
    if sid.endswith('gate'):
        cv2.circle(art, (int(p['x'] * S), int(p['y'] * S)), 34 * S, 0, -1)
for x, y, r in [(645, 250, 42), (560, 290, 20), (1185, 195, 32), (1115, 270, 42), (920, 300, 16), (160, 905, 55), (1000, 865, 30)]:
    cv2.circle(art, (x * S, y * S), r * S, 0, -1)
for x0, y0, x1, y1 in [(428, 440, 446, 457), (428, 497, 446, 527), (1020, 472, 1038, 522), (1020, 558, 1038, 570), (430, 520, 498, 652), (125, 950, 145, 980), (950, 335, 980, 368)]:
    art[y0 * S:y1 * S, x0 * S:x1 * S] = 0
n, lab, stats, cent = cv2.connectedComponentsWithStats(art, connectivity=8)
ys, xs = np.nonzero(lab)
labs = lab[ys, xs]
keep = np.zeros(n, bool)
for i in range(1, n):
    x, y, w, h, a = stats[i]
    if max(w, h) < 40 * S: continue
    if 590 * S < x and x + w < 880 * S and 440 * S < y and y + h < 590 * S: continue
    sel = labs == i
    px, py = xs[sel] / S, ys[sel] / S
    near = np.zeros(px.shape, bool)
    for d in discs.values():
        near |= np.hypot(px - d['x'], py - d['y']) < d['r'] * 1.3
    if near.mean() > 0.5: continue                       # a planet's outline
    if (np.abs(ell(px, py) - 1) < 0.05).mean() > 0.6: continue   # what is left of the ring outline
    keep[i] = True
art = np.where(keep[lab], 255, 0).astype(np.uint8)
np.save(SP + 'art.npy', art)
cs, _ = cv2.findContours(art, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
paths = []
for c in cs:
    if len(c) < 12: continue
    c = cv2.approxPolyDP(c, 0.9, True).reshape(-1, 2) / S
    paths.append('M' + 'L'.join(f'{p[0]:.1f},{p[1]:.1f}' for p in c) + 'Z')
print('line art contours', len(paths), 'chars', sum(map(len, paths)))

# --- sectors: flood fill inside every line of the board ---
bar = m.copy()
clear_planets(bar, 1.15)
# Small marks (stars, gate numbers, symbols) are not borders.
nb, lb, sb, _ = cv2.connectedComponentsWithStats(bar, connectivity=8)
small = np.maximum(sb[:, 2], sb[:, 3]) < 45 * S
small[0] = False
bar[small[lb]] = 0
bar[np.abs(R - 1) < 0.014] = 255
# The six gate borders across the ring (cracks and spikes), from the ring outline to the central hole.
GATE_BORDERS = [
    [(598, 262), (612, 300), (640, 330), (652, 372)],
    [(925, 345), (895, 372), (862, 402)],
    [(1032, 532), (960, 530), (905, 530)],
    [(858, 768), (845, 715), (835, 680), (828, 652)],
    [(505, 668), (550, 640), (600, 610)],
    [(437, 470), (500, 482), (570, 490)],
]
for c in GATE_BORDERS:
    cv2.polylines(bar, [np.array(c, np.int32) * S], False, 255, 2 * S)
# The four cluster cracks fade before the border: a guide along each, from the ring out.
CRACKS = [
    [(600, 265), (560, 170), (500, 90), (470, 20), (462, 0)],
    [(915, 350), (1000, 280), (1100, 200), (1220, 100), (1330, 10), (1345, 0)],
    [(835, 660), (880, 760), (930, 870), (975, 940), (1010, 1010)],
    [(565, 640), (470, 720), (360, 800), (250, 900), (140, 1000), (130, 1010)],
]
for c in CRACKS:
    cv2.polylines(bar, [np.array(c, np.int32) * S], False, 255, 2 * S)
for s in seps:
    cv2.line(bar, (int(s['a'][0] * S), int(s['a'][1] * S)), (int(s['b'][0] * S), int(s['b'][1] * S)), 255, 2 * S)
bar = cv2.dilate(bar, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
ids = list(cal['systems'].keys())
lab = np.zeros((H * S, W * S), np.int32)
for k, sid in enumerate(ids):
    p = cal['systems'][sid]
    # The first candidate point (system point, then its ship spots) that floods a real area.
    reg = None
    for c in [p] + p.get('ships', []):
        seed = (int(c['x'] * S), int(c['y'] * S))
        if bar[seed[1], seed[0]]: continue
        ff = bar.copy()
        msk = np.zeros((H * S + 2, W * S + 2), np.uint8)
        cv2.floodFill(ff, msk, seed, 128)
        r = ff == 128
        if r.sum() > 2000 * S * S:
            reg = r
            break
    if reg is None:
        print('NO REGION', sid); continue
    clash = (lab > 0) & reg
    if clash.any():
        print('overlap', sid, 'with', sorted({ids[i - 1] for i in np.unique(lab[clash])}))
    lab[reg & (lab == 0)] = k + 1
    print(sid, int(reg.sum() / S / S))
hole_ff = bar.copy()
hmask = np.zeros((H * S + 2, W * S + 2), np.uint8)
cv2.floodFill(hole_ff, hmask, (int(ring['cx'] * S), int(ring['cy'] * S)), 77)
hole = hole_ff == 77
idx = ndimage.distance_transform_edt(lab == 0, return_distances=False, return_indices=True)
full = lab[idx[0], idx[1]]
full[hole] = 0
sectors = {}
for k, sid in enumerate(ids):
    reg = (full == k + 1).astype(np.uint8)
    c2, _ = cv2.findContours(reg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c2 = max(c2, key=cv2.contourArea)
    c2 = cv2.approxPolyDP(c2, 1.2 * S, True).reshape(-1, 2) / S
    sectors[sid] = 'M' + 'L'.join(f'{p[0]:.1f},{p[1]:.1f}' for p in c2) + 'Z'
np.save(SP + 'sectors.npy', full)
np.save(SP + 'lab.npy', lab); np.save(SP + 'bar.npy', bar); np.save(SP + 'hole.npy', hole)

# --- ring symbols: at the middle of each planet sector's stretch of the ring, just outside it ---
sysdef = {s['id']: s for s in content['map']['systems']}
th_s = np.linspace(-np.pi, np.pi, 4000, endpoint=False)
symbols = []
for k, sid in enumerate(ids):
    if not sysdef.get(sid, {}).get('idSymbol'): continue
    hits = []
    for t in th_s:
        x, y = ell_point(t)
        gx, gy = ring['cx'] + (x - ring['cx']) * 1.03, ring['cy'] + (y - ring['cy']) * 1.03
        if full[int(gy * S), int(gx * S)] == k + 1: hits.append(t)
    if not hits:
        print('no ring stretch for', sid); continue
    hits = np.array(hits)
    tm = np.arctan2(np.sin(hits).mean(), np.cos(hits).mean())
    x, y = ell_point(tm)
    x, y = ring['cx'] + (x - ring['cx']) * 1.075, ring['cy'] + (y - ring['cy']) * 1.075
    ang = float(np.degrees(np.arctan2(y - ring['cy'], x - ring['cx'])))
    symbols.append(dict(system=sid, shape=sysdef[sid]['idSymbol'], x=round(float(x), 1), y=round(float(y), 1), angle=round(ang, 1)))
print('symbols', len(symbols))
gates = []
for sid in ids:
    if not sid.endswith('gate'): continue
    p = cal['systems'][sid]
    gates.append(dict(system=sid, n=int(sid[1]), x=p['x'], y=p['y'], angle=round(float(np.degrees(np.arctan2(p['y'] - ring['cy'], p['x'] - ring['cx']))), 1)))
out = dict(width=W, height=H, ring=ring, separators=seps, lines=paths, symbols=symbols, gates=gates, sectors=sectors)
json.dump(out, open(SP + 'board.lines.json', 'w'))
print('json chars', len(json.dumps(out)))

pv = cv2.resize(im // 3, (W * 2, H * 2))
colors = np.random.RandomState(5).randint(60, 255, (len(ids) + 1, 3))
f2 = cv2.resize(full.astype(np.uint8), (W * 2, H * 2), interpolation=cv2.INTER_NEAREST).astype(np.int32)
tint = colors[f2]
pv = np.where(f2[..., None] > 0, (pv * 0.55 + tint * 0.45).astype(np.uint8), pv)
pv[cv2.resize(art, (W * 2, H * 2)) > 100] = (230, 240, 255)
cv2.ellipse(pv, (int(ring['cx'] * 2), int(ring['cy'] * 2)), (int(ring['rx'] * 2), int(ring['ry'] * 2)), ring['angle'], 0, 360, (230, 240, 255), 2)
for s in seps:
    cv2.line(pv, (int(s['a'][0] * 2), int(s['a'][1] * 2)), (int(s['b'][0] * 2), int(s['b'][1] * 2)), (230, 240, 255), 2)
for s in symbols:
    cv2.circle(pv, (int(s['x'] * 2), int(s['y'] * 2)), 10, (0, 255, 255), 2)
    cv2.putText(pv, s['shape'][:3], (int(s['x'] * 2) + 12, int(s['y'] * 2) + 5), 0, 0.7, (0, 255, 255), 2)
for sid in ids:
    p = cal['systems'][sid]
    cv2.putText(pv, sid, (int(p['x'] * 2) - 30, int(p['y'] * 2)), 0, 0.8, (255, 255, 255), 2)
cv2.imwrite(SP + 'geo_preview.png', cv2.resize(pv, (W, H), interpolation=cv2.INTER_AREA))
