// The outline of a picture's shape, as a polygon: used to cut the 3D pieces
// out of the kit's piece pictures (assets/ui/piece/*.png). Pure functions on a
// pixel mask (1 = inside), no DOM and no three.js, so they are unit-tested.

/** A point in pixel coordinates (x right, y down). */
export type Pt = [number, number];

/** Keeps only the largest 4-connected blob of the mask (drops specks and detached shadows). */
export function largestBlob(mask: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(w * h);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i]) continue;
    next++;
    let size = 0;
    stack.push(i);
    label[i] = next;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w;
      const y = (p - x) / w;
      const around = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of around) {
        if (q >= 0 && mask[q] && !label[q]) {
          label[q] = next;
          stack.push(q);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
  }
  const out = new Uint8Array(w * h);
  if (best) for (let i = 0; i < w * h; i++) out[i] = label[i] === best ? 1 : 0;
  return out;
}

// The 8 neighbours clockwise on screen, starting west.
const DIRS: Pt[] = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];

/**
 * Walks the outer boundary of the mask's shape clockwise (Moore neighbour
 * tracing) from its top-left pixel. Returns the boundary pixels in order, or
 * [] for an empty mask. Use largestBlob first when the mask may have specks.
 */
export function traceOutline(mask: Uint8Array, w: number, h: number): Pt[] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const start = mask.indexOf(1);
  if (start < 0) return [];
  const sx = start % w;
  const sy = (start - sx) / w;
  const out: Pt[] = [[sx, sy]];
  let x = sx;
  let y = sy;
  let dir = 3; // so the first search starts looking west
  let first = -1;
  for (let guard = 0; guard < 4 * w * h + 8; guard++) {
    let moved = -1;
    for (let i = 0; i < 8; i++) {
      const d = (dir + 5 + i) % 8;
      if (at(x + DIRS[d][0], y + DIRS[d][1])) {
        moved = d;
        break;
      }
    }
    if (moved < 0) break; // a single pixel
    if (x === sx && y === sy) {
      if (first < 0) first = moved;
      else if (moved === first) break; // back at the start, about to repeat the walk
    }
    x += DIRS[moved][0];
    y += DIRS[moved][1];
    dir = moved;
    out.push([x, y]);
  }
  if (out.length > 1 && out[out.length - 1][0] === sx && out[out.length - 1][1] === sy) out.pop();
  return out;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Drops the points of an open path that lie within `eps` pixels of the simplified line (Ramer–Douglas–Peucker). */
function simplifyPath(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  let far = 0;
  let max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) {
      max = d;
      far = i;
    }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplifyPath(pts.slice(0, far + 1), eps).slice(0, -1), ...simplifyPath(pts.slice(far), eps)];
}

/** Simplifies a closed polygon to within `eps` pixels, keeping its shape. */
export function simplifyOutline(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 4) return pts;
  // Split the ring at the point farthest from the first, simplify both halves.
  let far = 0;
  let max = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > max) {
      max = d;
      far = i;
    }
  }
  const a = simplifyPath(pts.slice(0, far + 1), eps);
  const b = simplifyPath([...pts.slice(far), pts[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Signed area of a polygon (positive when clockwise on screen, y down). */
export function outlineArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
