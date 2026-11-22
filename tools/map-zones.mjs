// Computes where each seat's ships stand in every system of the calibrated
// board picture and writes them into its calibration (src/ui/table/board.default.json,
// key `ships`: one point per seat, in seat-stack order). Run it again after
// recalibrating the systems or their slots; edit single points by hand after.
//
//   node tools/map-zones.mjs [calibration.json]
//
// The rules, in picture pixels:
// - a planet's ships stand on the planet's disc (`disc`, found on the picture;
//   else around the system point), at least SLOT_CLEAR from every
//   building slot and STACK_GAP from each other, nearer to their own system
//   than to any other (so they never spill into a neighbour), closest to the
//   planet's centre first;
// - a gate's ships stand on the ring around the board's centre, spread along
//   the arc on both sides of the gate's number.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(process.argv[2] ?? `${root}/src/ui/table/board.default.json`);

/** Seats per system. */
const SEATS = 4;
/** Planet without a disc: how far from the system point ships may stand. */
const PLANET_R = 105;
/** How far inside the disc's edge a stack's centre stays; it may reach past the edge by EDGE_OUT when the disc is full. */
const EDGE_IN = 14;
const EDGE_OUT = 30;
/** Clearance from a building slot's centre (a slot triangle is about 70 px wide). */
const SLOT_CLEAR = 52;
/** Distance between two seats' stacks. */
const STACK_GAP = 46;
/** Gate: angle between two seats' stacks along the ring, in degrees. */
const GATE_STEP = 9;

const calib = JSON.parse(readFileSync(file, 'utf8'));
const entries = Object.entries(calib.systems);
const gates = entries.filter(([id]) => id.endsWith('-gate'));
const centre = {
  x: gates.reduce((s, [, p]) => s + p.x, 0) / gates.length,
  y: gates.reduce((s, [, p]) => s + p.y, 0) / gates.length,
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const round = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** True when `q` is nearer to system `id` than to any other system. */
function inOwnCell(id, q) {
  const own = dist(q, calib.systems[id]);
  return entries.every(([other, p]) => other === id || dist(q, p) > own);
}

function planetShips(id, sys) {
  const slots = sys.slots ?? [];
  const disc = sys.disc ?? { x: sys.x, y: sys.y, r: PLANET_R + EDGE_IN };
  // Inside the disc first; only when it is full, a little past its edge.
  for (const limit of [disc.r - EDGE_IN, disc.r + EDGE_OUT]) {
    const candidates = [];
    for (let dy = -limit; dy <= limit; dy += 4) {
      for (let dx = -limit; dx <= limit; dx += 4) {
        const q = { x: disc.x + dx, y: disc.y + dy };
        const r = Math.hypot(dx, dy);
        if (r > limit) continue;
        if (slots.some((s) => dist(q, s) < SLOT_CLEAR)) continue;
        if (!inOwnCell(id, q)) continue;
        candidates.push({ q, r });
      }
    }
    candidates.sort((a, b) => a.r - b.r);
    const out = [];
    for (const c of candidates) {
      if (out.every((p) => dist(p, c.q) >= STACK_GAP)) out.push(c.q);
      if (out.length === SEATS) break;
    }
    if (out.length === SEATS) return out.map(round);
  }
  throw new Error(`${id}: no room for ${SEATS} stacks`);
}

function gateShips(sys) {
  const r = dist(sys, centre);
  const a0 = Math.atan2(sys.y - centre.y, sys.x - centre.x);
  // Both sides of the gate's number, nearest first.
  const steps = [-1, 1, -2, 2].map((k) => (k * GATE_STEP * Math.PI) / 180);
  return steps.map((da) => round({ x: centre.x + r * Math.cos(a0 + da), y: centre.y + r * Math.sin(a0 + da) }));
}

for (const [id, sys] of entries) sys.ships = id.endsWith('-gate') ? gateShips(sys) : planetShips(id, sys);

// One system per line, as the hand-written file.
const pt = (p) => `{ "x": ${p.x}, "y": ${p.y} }`;
const line = ([id, s]) => {
  const parts = [`"x": ${s.x}`, `"y": ${s.y}`];
  if (s.disc) parts.push(`"disc": { "x": ${s.disc.x}, "y": ${s.disc.y}, "r": ${s.disc.r} }`);
  if (s.slots) parts.push(`"slots": [${s.slots.map(pt).join(', ')}]`);
  parts.push(`"ships": [${s.ships.map(pt).join(', ')}]`);
  return `    ${JSON.stringify(id)}: { ${parts.join(', ')} }`;
};
writeFileSync(file, `{\n  "width": ${calib.width},\n  "height": ${calib.height},\n  "systems": {\n${entries.map(line).join(',\n')}\n  }\n}\n`);
console.log(`ships placed in ${entries.length} systems -> ${file}`);
