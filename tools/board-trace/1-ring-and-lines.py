# Step A: ring ellipse and separator lines measured on the board picture's line mask.
import cv2, json, numpy as np, sys
SP = sys.argv[1]
im = cv2.imread('assets/ui/map/board.png')
H, W = im.shape[:2]
v = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)[..., 2]
th = cv2.morphologyEx(v, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
_, m = cv2.threshold(th, 45, 255, cv2.THRESH_BINARY)
ys, xs = np.nonzero(m)
# Ring: points near a rough ellipse, refit twice dropping outliers.
cx, cy, rx, ry, ang = 737, 506, 295, 268, 0.0
for it in range(4):
    c, s = np.cos(np.radians(ang)), np.sin(np.radians(ang))
    dx, dy = xs - cx, ys - cy
    u, w = dx * c + dy * s, -dx * s + dy * c
    rr = np.hypot(u / rx, w / ry)
    tol = [0.06, 0.03, 0.015, 0.01][it]
    sel = np.abs(rr - 1) < tol
    pts = np.stack([xs[sel], ys[sel]], 1).astype(np.float32)
    (cx, cy), (a, b), ang = cv2.fitEllipse(pts)
    rx, ry = a / 2, b / 2
    print('ellipse', it, round(cx, 1), round(cy, 1), round(rx, 1), round(ry, 1), round(ang, 1), sel.sum())
ring = dict(cx=round(cx, 1), cy=round(cy, 1), rx=round(rx, 1), ry=round(ry, 1), angle=round(ang, 2))
ROUGH = [
    ('c1', (735, 238), (735, 30)), ('c1', (868, 262), (985, 40)),
    ('c2', (1012, 395), (1440, 230)), ('c2', (1030, 470), (1340, 437)),
    ('b23', (1100, 552), (1440, 592)),
    ('c3', (1015, 615), (1430, 780)), ('c3', (955, 685), (1330, 990)),
    ('c4', (738, 780), (738, 1000)), ('c4', (605, 750), (485, 990)),
    ('c5', (468, 618), (75, 775)), ('c5', (440, 548), (25, 600)),
    ('b56', (350, 463), (70, 435)),
    ('c6', (455, 400), (45, 240)), ('c6', (505, 325), (170, 50)),
]
seps = []
for tag, p, q in ROUGH:
    p, q = np.array(p, float), np.array(q, float)
    d = (q - p) / np.linalg.norm(q - p)
    nrm = np.array([-d[1], d[0]])
    rel = np.stack([xs, ys], 1) - p
    t = rel @ d
    off = rel @ nrm
    L = np.linalg.norm(q - p)
    band = (np.abs(off) < 7) & (t > 0) & (t < L)
    pts = np.stack([xs[band], ys[band]], 1).astype(np.float32)
    vx, vy, x0, y0 = cv2.fitLine(pts, cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
    # Project the rough endpoints on the fitted line.
    dd = np.array([vx, vy]); o = np.array([x0, y0])
    P = o + ((p - o) @ dd) * dd; Q = o + ((q - o) @ dd) * dd
    seps.append(dict(cluster=tag, a=[round(float(P[0]), 1), round(float(P[1]), 1)], b=[round(float(Q[0]), 1), round(float(Q[1]), 1)], n=int(band.sum())))
    print(tag, seps[-1])
json.dump(dict(ring=ring, separators=seps), open(SP + 'geoA.json', 'w'), indent=1)
