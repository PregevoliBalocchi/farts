# Step C, second try: the cream line art (low saturation, brighter than around it) kept only
# in a corridor along the borders between clusters and around the central hole, so planets do not count.
import cv2, json, numpy as np, sys
from scipy import ndimage
SP = sys.argv[1]
S = 3
cal = json.load(open('src/ui/table/board.default.json'))
out = json.load(open(SP + 'board.lines.json'))
im = cv2.imread('assets/ui/map/board.png')
lab = np.load(SP + 'lab.npy'); full = np.load(SP + 'sectors.npy'); hole = np.load(SP + 'hole.npy')
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


def borders(lbl, other=None):
    b = np.zeros(lbl.shape, bool)
    for dy, dx in ((0, 1), (1, 0)):
        a = lbl[:H - dy, :W - dx]; c = lbl[dy:, dx:]
        d = a != c
        if other is not None: d &= other(a, c)
        b[:H - dy, :W - dx] |= d; b[dy:, dx:] |= d
    return b


cross = borders(full, lambda a, c: (clu[a] != clu[c]) & (a > 0) & (c > 0))
holeb = borders(hole.astype(np.int32))
corr = (ndimage.distance_transform_edt(~cross) < 34 * S) | (ndimage.distance_transform_edt(~holeb) < 14 * S)

big = cv2.resize(im, (W, H), interpolation=cv2.INTER_CUBIC)
hsv = cv2.cvtColor(big, cv2.COLOR_BGR2HSV)
v = hsv[..., 2]
th = cv2.morphologyEx(v, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9 * S, 9 * S)))
th = cv2.GaussianBlur(th, (0, 0), 1.2)
white = (th > 22) & (hsv[..., 1] < 95) & (v > 90)
white &= corr
white[np.abs(R - 1) < 0.014] = False                    # the ring outline is a vector
sepm = np.zeros((H, W), np.uint8)
for sp in out['separators']:
    cv2.line(sepm, (int(sp['a'][0] * S), int(sp['a'][1] * S)), (int(sp['b'][0] * S), int(sp['b'][1] * S)), 1, 40 * S)
white[(sepm > 0) & (R > 1.42)] = False                  # past the two spikes, a separator is a vector
w8 = white.astype(np.uint8)
for sid, p in cal['systems'].items():                  # gate numbers
    if sid.endswith('gate'):
        cv2.circle(w8, (int(p['x'] * S), int(p['y'] * S)), 30 * S, 0, -1)
for sid, p in cal['systems'].items():                  # planets: nothing inside the disc
    d = p.get('disc')
    if d: cv2.circle(w8, (int(d['x'] * S), int(d['y'] * S)), int(d['r'] * S * 0.92), 0, -1)
for s in out['symbols']:                                # ring tabs
    cv2.circle(w8, (int(s['x'] * S), int(s['y'] * S)), 15 * S, 0, -1)
w8 = cv2.morphologyEx(w8, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
n, cl, st, _ = cv2.connectedComponentsWithStats(w8, connectivity=8)
keep = np.zeros(n, bool)
keep[1:] = np.maximum(st[1:, 2], st[1:, 3]) >= 18 * S
for i in range(1, n):                                   # not the letters in the middle
    x, y, w, h, a = st[i]
    if 590 * S < x and x + w < 880 * S and 440 * S < y and y + h < 590 * S: keep[i] = False
w8 = keep[cl].astype(np.uint8) * 255
np.save(SP + 'white.npy', w8)
pv = (cv2.resize(im, (W, H)) // 3)
pv[cv2.dilate(cross.astype(np.uint8), None) > 0] = (0, 160, 0)
pv[w8 > 0] = (0, 255, 255)
cv2.imwrite(SP + 'geo5.png', cv2.resize(pv, (W // S, H // S), interpolation=cv2.INTER_AREA))
for i, (x0, y0) in enumerate([(380, 0), (850, 0), (100, 560), (750, 560)]):
    cv2.imwrite(SP + f'g5_{i}.png', pv[y0 * S:(y0 + 450) * S:2, x0 * S:(x0 + 620) * S:2])
