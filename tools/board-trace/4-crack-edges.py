# Step C, third try: each edge of the four big cracks followed as a least-cost path along the
# bright line art, from the central hole to the board's edge, kept on its own side of the crack
# (the zones of its cluster) and out of the planets' discs. Spikes and the hole's edge come from
# the cream mask of geo5 (complete there). Writes board.lines.new.json and previews.
import cv2, json, numpy as np, sys
from scipy import ndimage, sparse
from scipy.sparse import csgraph
SP = sys.argv[1]
S = 3
cal = json.load(open('src/ui/table/board.default.json'))
out = json.load(open(SP + 'board.lines.json'))
im = cv2.imread('assets/ui/map/board.png')
lab = np.load(SP + 'lab.npy'); full = np.load(SP + 'sectors.npy'); hole = np.load(SP + 'hole.npy')
white = np.load(SP + 'white.npy') > 0
H, W = full.shape
ring = out['ring']
ids = list(cal['systems'].keys())
clu = np.array([0] + [int(s[1]) for s in ids])
yy, xx = np.mgrid[0:H, 0:W]


def ell(x, y):
    a = np.radians(ring['angle']); c, s = np.cos(a), np.sin(a)
    dx, dy = x - ring['cx'], y - ring['cy']
    u, w = dx * c + dy * s, -dx * s + dy * c
    return np.hypot(u / ring['rx'], w / ring['ry'])


R = ell(xx / S, yy / S)
hole = ndimage.binary_fill_holes(hole)
full = full.copy(); full[hole] = 0
C = clu[full]                                            # cluster of each pixel (0: hole)

# Cost: low on bright thin lines (any colour: the crack edges take their neighbours' tint).
big = cv2.resize(im, (W, H), interpolation=cv2.INTER_CUBIC)
v = big.max(axis=2)
th = cv2.morphologyEx(v, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9 * S, 9 * S)))
th = cv2.GaussianBlur(th, (0, 0), 1.0).astype(np.float32)
r = np.clip(th / 50.0, 0, 1)
cost = 0.03 + 4.0 * (1 - r) ** 3
cost[white] = np.minimum(cost[white], 0.02)
disc = np.zeros((H, W), np.uint8)
for p in cal['systems'].values():
    d = p.get('disc')
    if d: cv2.circle(disc, (int(d['x'] * S), int(d['y'] * S)), int(d['r'] * S * 0.93), 1, -1)
cost[disc > 0] += 6.0
cost[np.abs(R - 1) < 0.012] += 0.5                       # do not run along the ring's outline


def pair_border(a, b):
    m = np.zeros((H, W), bool)
    for dy, dx in ((0, 1), (1, 0)):
        p = C[:H - dy, :W - dx]; q = C[dy:, dx:]
        d = ((p == a) & (q == b)) | ((p == b) & (q == a))
        m[:H - dy, :W - dx] |= d; m[dy:, dx:] |= d
    return m


def path(mask, start, targets):
    """Least-cost 8-connected path inside mask from start (y, x) to the cheapest of targets (bool mask)."""
    idx = -np.ones((H, W), np.int64)
    ys, xs = np.nonzero(mask)
    idx[ys, xs] = np.arange(len(ys))
    rows, cols, wts = [], [], []
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        y2, x2 = ys + dy, xs + dx
        ok = (y2 < H) & (x2 >= 0) & (x2 < W)
        y1, x1, y2, x2 = ys[ok], xs[ok], y2[ok], x2[ok]
        j = idx[y2, x2]
        k = j >= 0
        i = idx[y1[k], x1[k]]
        w = (cost[y1[k], x1[k]] + cost[y2[k], x2[k]]) / 2 * (1.4142 if dx and dy else 1.0)
        rows += [i]; cols += [j[k]]; wts += [w]
    g = sparse.csr_matrix((np.concatenate(wts), (np.concatenate(rows), np.concatenate(cols))), shape=(len(ys),) * 2)
    s = idx[start]
    dist, pred = csgraph.dijkstra(g, directed=False, indices=s, return_predecessors=True)
    t = np.nonzero(targets[ys, xs])[0]
    t = t[np.isfinite(dist[t])]
    end = t[np.argmin(dist[t])]
    seq = [end]
    while seq[-1] != s:
        seq.append(pred[seq[-1]])
    return np.stack([ys[seq], xs[seq]], 1)[::-1]


edge = np.zeros((H, W), bool)
edge[:3] = edge[-3:] = True; edge[:, :3] = edge[:, -3:] = True
ink = np.zeros((H, W), np.uint8)
cracks_fill = np.zeros((H, W), np.uint8)
CRACKS = [(6, 1), (1, 2), (3, 4), (4, 5)]
for a, b in CRACKS:
    pb = pair_border(a, b) & ~hole
    corr = ndimage.distance_transform_edt(~pb) < 75 * S
    # start: the centre line's point nearest the hole
    dh = ndimage.distance_transform_edt(~hole)
    ys, xs = np.nonzero(pb)
    k = np.argmin(dh[ys, xs])
    start = (ys[k], xs[k])
    first = {}
    for side in (a, b):                                  # first pass: each edge on its own side
        m = corr & ((C == side) | pb) & ~hole
        m[start] = True
        first[side] = path(m, start, edge & m)
    tracks = []
    for side, other in ((a, b), (b, a)):                 # second pass: also into the unclaimed strip,
        block = np.zeros((H, W), np.uint8)               # short of the other edge
        cv2.polylines(block, [first[other][:, ::-1].astype(np.int32).reshape(-1, 1, 2)], False, 1, 5 * S)
        cv2.circle(block, (int(start[1]), int(start[0])), 4 * S, 0, -1)
        cv2.polylines(block, [first[side][:, ::-1].astype(np.int32).reshape(-1, 1, 2)], False, 0, 3 * S)   # a stretch both share stays open
        m = corr & ((C == side) | pb | ((lab == 0) & (R > 1.03))) & ~hole & (block == 0)
        m[start] = True
        p = path(m, start, edge & m)
        tracks.append(p)
        cv2.polylines(ink, [p[:, ::-1].astype(np.int32).reshape(-1, 1, 2)], False, 255, 2 * S + 1)
    # the dark between the two edges
    poly = np.concatenate([tracks[0], tracks[1][::-1]])[:, ::-1].astype(np.int32)
    fill = np.zeros((H, W), np.uint8)
    cv2.fillPoly(fill, [poly], 255)
    cracks_fill |= fill
    print('crack', a, b, 'edges', len(tracks[0]), len(tracks[1]))

# Spikes (the two lenses between clusters 5/6 and 2/3) and the hole's edge, from the cream mask.
for a, b in [(5, 6), (2, 3)]:
    pb = pair_border(a, b) & ~hole
    near = ndimage.distance_transform_edt(~pb) < 30 * S
    sp = white & near & (R > 0.8) & (R < 1.45)
    ys, xs = np.nonzero(sp)
    d = np.array([xs.mean() - ring['cx'] * S, ys.mean() - ring['cy'] * S]); d /= np.linalg.norm(d)
    t = xs * d[0] + ys * d[1]
    tin, tout = np.argmin(t), np.argmax(t)
    p1 = (ys[tout], xs[tout])
    dh = ndimage.distance_transform_edt(~hole)
    qy, qx = np.nonzero(pb)
    k = np.argmin(dh[qy, qx])
    p0 = (qy[k], qx[k])
    tgt = np.zeros((H, W), bool)
    cv2.circle(tgt.view(np.uint8), (int(p1[1]), int(p1[0])), 2 * S, 1, -1)
    print('spike tips', a, b, p0[1] // S, p0[0] // S, p1[1] // S, p1[0] // S)
    tracks = []
    for side in (a, b):
        m = near & ((C == side) | pb | (lab == 0)) & ~hole
        if tracks:                                       # the second edge keeps off the first
            blk = np.zeros((H, W), np.uint8)
            cv2.polylines(blk, [tracks[0][:, ::-1].astype(np.int32).reshape(-1, 1, 2)], False, 1, 3 * S)
            cv2.circle(blk, (int(p0[1]), int(p0[0])), 5 * S, 0, -1)
            cv2.circle(blk, (int(p1[1]), int(p1[0])), 5 * S, 0, -1)
            m &= blk == 0
        m[p0] = True; m |= tgt
        cv2.circle(m.view(np.uint8), (int(p0[1]), int(p0[0])), 3 * S, 1, -1)
        p = path(m, p0, tgt)
        tracks.append(p)
        cv2.polylines(ink, [p[:, ::-1].astype(np.int32).reshape(-1, 1, 2)], False, 255, 2 * S + 1)
    poly = np.concatenate([tracks[0], tracks[1][::-1]])[:, ::-1].astype(np.int32)
    fill = np.zeros((H, W), np.uint8)
    cv2.fillPoly(fill, [poly], 255)
    cracks_fill |= fill
    tip = np.array([p1[1], p1[0]]) / S
    for sep_ in out['separators']:                       # the separator past the spike starts at its tip
        A, B = np.array(sep_['a']), np.array(sep_['b'])
        u = (B - A) / np.linalg.norm(B - A)
        off = tip - A
        if abs(off[0] * u[1] - off[1] * u[0]) < 10 and 0 < off @ u < np.linalg.norm(B - A):
            sep_['a'] = [round(float(tip[0]), 1), round(float(tip[1]), 1)]
            print('separator trimmed to the tip of spike', a, b)
    print('spike', a, b, 'tips', p0[1] // S, p0[0] // S, p1[1] // S, p1[0] // S)
holeb = hole & ~cv2.erode(hole.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * S + 1, 2 * S + 1))).astype(bool)
ink |= holeb.astype(np.uint8) * 255
ink = cv2.GaussianBlur(ink, (0, 0), 1.0)
ink = (ink > 110).astype(np.uint8) * 255
cracks_fill[ink > 0] = 0
cracks_fill[hole] = 0


def paths(mask, eps):
    cs, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    res = []
    for c in cs:
        if len(c) < 8: continue
        c = cv2.approxPolyDP(c, eps, True).reshape(-1, 2) / S
        res.append('M' + 'L'.join(f'{p[0]:.1f},{p[1]:.1f}' for p in c) + 'Z')
    return res


out['lines'] = paths(ink, 0.8)
out['cracks'] = paths(cracks_fill, 1.0)
sectors = {}
for k, sid in enumerate(ids):
    reg = (full == k + 1).astype(np.uint8)
    c2, _ = cv2.findContours(reg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c2 = max(c2, key=cv2.contourArea)
    c2 = cv2.approxPolyDP(c2, 1.2 * S, True).reshape(-1, 2) / S
    sectors[sid] = 'M' + 'L'.join(f'{p[0]:.1f},{p[1]:.1f}' for p in c2) + 'Z'
out['sectors'] = sectors
json.dump(out, open(SP + 'board.lines.new.json', 'w'))
print('lines', len(out['lines']), 'cracks', len(out['cracks']), 'chars', len(json.dumps(out)))
np.save(SP + 'ink.npy', ink)
pv = cv2.resize(im, (W, H)) // 3
pv[cracks_fill > 0] = (90, 40, 40)
pv[ink > 0] = (0, 255, 255)
cv2.imwrite(SP + 'geo6.png', cv2.resize(pv, (W // S, H // S), interpolation=cv2.INTER_AREA))
for name, (x0, y0, x1, y1) in dict(cTL=(440, 0, 700, 400), cTR=(880, 0, 1380, 400), cBR=(780, 620, 1060, 1010), cBL=(100, 590, 640, 1010)).items():
    o = cv2.resize(im, (W, H))
    o[ink > 0] = (0, 255, 255)
    cr = o[y0 * S:y1 * S, x0 * S:x1 * S]
    f = 1400 / cr.shape[1] if cr.shape[1] > cr.shape[0] else 1100 / cr.shape[0]
    cv2.imwrite(SP + name + '.png', cv2.resize(cr, None, fx=f, fy=f, interpolation=cv2.INTER_AREA))
