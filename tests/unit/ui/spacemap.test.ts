import { describe, expect, it } from 'vitest';
import lines from '../../../src/ui/table/board.lines.json';
import calibration from '../../../src/ui/table/board.default.json';
import { bridgeArc, CONTROL_TINT, isBoardLines, RESOURCE_TINT, resourceIconSpots, sectorTints, tokenSpot, withLayerSpots } from '../../../src/ui/table/infolayer';
import { planetPalette, planetRecipe, STYLES } from '../../../src/ui/table/planets3d';

describe('board.lines.json (traced information layer)', () => {
  it('has the shape the map reads', () => {
    expect(isBoardLines(lines)).toBe(true);
  });

  it('gives every system of the board a zone, and only those', () => {
    expect(Object.keys(lines.sectors).sort()).toEqual(Object.keys(calibration.systems).sort());
  });

  it('numbers the six gates 1 to 6', () => {
    expect(lines.gates.map((g) => g.n).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('puts one symbol on the ring for each of the 18 planets', () => {
    const planets = Object.keys(calibration.systems).filter((id) => !id.endsWith('gate'));
    expect(lines.symbols.map((s) => s.system).sort()).toEqual(planets.sort());
    for (const s of lines.symbols) expect(['crescent', 'hexagon', 'arrowhead']).toContain(s.shape);
  });

  it('carries the dark inside of the four cracks and two spikes', () => {
    expect(lines.cracks?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(lines.lines.length).toBeGreaterThan(0);
  });

  it('keeps every line inside the picture', () => {
    for (const s of lines.separators) {
      for (const [x, y] of [s.a, s.b]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(lines.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(lines.height);
      }
    }
  });
});

describe('sector colours', () => {
  const systems = [
    { id: 'c1-p1', resource: 'weapons', controller: 2, inPlay: true },
    { id: 'c1-gate', resource: null, controller: null, inPlay: true },
    { id: 'c2-p1', resource: 'fuel', controller: null, inPlay: false },
  ];
  const resourceColor = (r: string) => (r === 'weapons' ? '#ff0000' : '#00ff00');
  const seatColor = (p: number) => (p === 2 ? '#0000ff' : '#ffffff');

  it('clouds planets in their resource colour and leaves gates and systems out of play bare', () => {
    const t = sectorTints(systems, 'resource', resourceColor, seatColor);
    expect([...t.keys()]).toEqual(['c1-p1']);
    expect(t.get('c1-p1')).toEqual({ colour: '#ff0000', alpha: RESOURCE_TINT, nebula: true });
  });

  it('tints every sector in play by its controller, grey when nobody controls it', () => {
    const t = sectorTints(systems, 'control', resourceColor, seatColor);
    expect(t.get('c1-p1')).toEqual({ colour: '#0000ff', alpha: CONTROL_TINT, nebula: false });
    expect(t.get('c1-gate')?.nebula).toBe(false);
    expect(t.get('c1-gate')?.colour).not.toBe(t.get('c1-p1')?.colour);
    expect(t.has('c2-p1')).toBe(false);
  });
});

describe('resource icons', () => {
  it('puts one icon per planet on its rim, on the side away from the ring', () => {
    const planets = Object.entries(calibration.systems).filter(([id]) => !id.endsWith('gate'));
    const spots = resourceIconSpots(calibration, lines.ring, planets.map(([id]) => ({ id, resource: 'fuel' })));
    expect(spots).toHaveLength(planets.length);
    for (const s of spots) {
      const d = calibration.systems[s.system as keyof typeof calibration.systems] as { disc: { x: number; y: number; r: number } };
      const fromDisc = Math.hypot(s.x - d.disc.x, s.y - d.disc.y);
      expect(fromDisc).toBeCloseTo(d.disc.r * 0.9, 1);
      const nearer = Math.hypot(s.x - lines.ring.cx, s.y - lines.ring.cy) > Math.hypot(d.disc.x - lines.ring.cx, d.disc.y - lines.ring.cy);
      expect(nearer).toBe(true);
    }
  });

  it('skips systems without a resource', () => {
    expect(resourceIconSpots(calibration, lines.ring, [{ id: 'c1-gate', resource: null }, { id: 'c1-p1', resource: null }])).toEqual([]);
  });
});

describe('arrow between gates linked across a cluster out of play', () => {
  const ring = lines.ring;
  const angleOf = (x: number, y: number) => Math.atan2(y - ring.cy, x - ring.cx);
  const gate = (id: string) => lines.gates.find((g) => g.system === id)!;
  const between = (a: number, b: number, x: number) => {
    // true if angle x lies on the shorter arc from a to b
    const TAU = Math.PI * 2;
    const w = (v: number) => ((v % TAU) + TAU) % TAU;
    const span = w(b - a);
    return span <= Math.PI ? w(x - a) < span : w(a - x) < TAU - span;
  };

  it('runs over the gate taken out, not round the other way', () => {
    const inPlay = new Map([['c3-gate', false]]);
    const pts = bridgeArc(lines, inPlay, 'c2-gate', 'c4-gate')!;
    const mid = pts[Math.floor(pts.length / 2)];
    const g2 = gate('c2-gate');
    const g4 = gate('c4-gate');
    const g3 = gate('c3-gate');
    // the middle of the arrow is nearer the removed gate than any gate in play
    const d = (g: { x: number; y: number }) => Math.hypot(mid[0] - g.x, mid[1] - g.y);
    expect(d(g3)).toBeLessThan(d(g2));
    expect(d(g3)).toBeLessThan(d(g4));
    expect(between(angleOf(g2.x, g2.y), angleOf(g4.x, g4.y), angleOf(g3.x, g3.y))).toBe(true);
  });

  it('crosses two gates out of play when the setup links across both', () => {
    const inPlay = new Map([['c6-gate', false], ['c1-gate', false]]);
    const pts = bridgeArc(lines, inPlay, 'c5-gate', 'c2-gate')!;
    const near = (id: string) => Math.min(...pts.map((p) => Math.hypot(p[0] - gate(id).x, p[1] - gate(id).y)));
    expect(near('c6-gate')).toBeLessThan(60);
    expect(near('c1-gate')).toBeLessThan(60);
    expect(near('c3-gate')).toBeGreaterThan(150);
  });

  it('stops short of both gates it joins', () => {
    const pts = bridgeArc(lines, new Map([['c3-gate', false]]), 'c2-gate', 'c4-gate')!;
    const first = pts[0];
    const last = pts[pts.length - 1];
    expect(Math.hypot(first[0] - gate('c2-gate').x, first[1] - gate('c2-gate').y)).toBeGreaterThan(30);
    expect(Math.hypot(last[0] - gate('c4-gate').x, last[1] - gate('c4-gate').y)).toBeGreaterThan(30);
  });

  it('gives nothing for an unknown gate', () => {
    expect(bridgeArc(lines, new Map(), 'c2-gate', 'nowhere')).toBeNull();
  });
});

describe('where pieces go', () => {
  /** Even-odd point-in-polygon on an M/L/Z path. */
  const inside = (d: string, x: number, y: number) => {
    const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    let hit = false;
    for (let i = 0, j = n.length - 2; i < n.length; j = i, i += 2) {
      const [xi, yi, xj, yj] = [n[i], n[i + 1], n[j], n[j + 1]];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const spots = lines.spots!;

  it('gives every system four ship spots and four token spots inside its own zone', () => {
    for (const id of Object.keys(calibration.systems)) {
      expect(spots[id].ships).toHaveLength(4);
      expect(spots[id].tokens).toHaveLength(4);
      for (const [x, y] of [...spots[id].ships, ...spots[id].tokens]) expect(inside(lines.sectors[id], x, y)).toBe(true);
    }
  });

  it('gives every system a centred figure for 1 to 4 seats, inside its zone, off the planet, the seats apart', () => {
    for (const [id, sys] of Object.entries(calibration.systems)) {
      const layouts = spots[id].layouts!;
      expect(layouts.map((f) => f.length)).toEqual([1, 2, 3, 4]);
      const disc = (sys as { disc?: { x: number; y: number; r: number } }).disc;
      for (const fig of layouts) {
        for (const [x, y] of fig) {
          expect(inside(lines.sectors[id], x, y)).toBe(true);
          if (disc) expect(Math.hypot(x - disc.x, y - disc.y)).toBeGreaterThan(disc.r);
        }
        for (let i = 0; i < fig.length; i++)
          for (let j = i + 1; j < fig.length; j++) expect(Math.hypot(fig[i][0] - fig[j][0], fig[i][1] - fig[j][1])).toBeGreaterThan(40);
      }
    }
  });

  it('keeps ships and tokens off the planet', () => {
    for (const [id, sys] of Object.entries(calibration.systems)) {
      const disc = (sys as { disc?: { x: number; y: number; r: number } }).disc;
      if (!disc) continue;
      for (const [x, y] of [...spots[id].ships, ...spots[id].tokens]) expect(Math.hypot(x - disc.x, y - disc.y)).toBeGreaterThan(disc.r);
    }
  });

  it('stands the ships on the layer spots, keeping everything else of the calibration', () => {
    const c = withLayerSpots(calibration, lines);
    expect(c.systems['c1-p1'].ships).toEqual(spots['c1-p1'].ships.map(([x, y]) => ({ x, y })));
    expect(c.systems['c1-p1'].slots).toEqual(calibration.systems['c1-p1'].slots);
    expect(c.systems['c1-p1'].layouts?.[1]).toEqual(spots['c1-p1'].layouts![1].map(([x, y]) => ({ x, y })));
    expect(withLayerSpots(calibration, {})).toBe(calibration);
  });

  it('cycles token spots and reports none for an unknown system', () => {
    expect(tokenSpot(lines, 'c1-p1', 4)).toEqual(tokenSpot(lines, 'c1-p1', 0));
    expect(tokenSpot(lines, 'nowhere', 0)).toBeNull();
  });
});

describe('planet recipes', () => {
  it('reads a known planet with its extras', () => {
    const r = planetRecipe('c2-p3');
    expect(r.style).toBe('veined');
    expect(r.extras).toContain('ring');
  });

  it('falls back to the defaults for an unknown planet', () => {
    const r = planetRecipe('nowhere');
    expect(r.style).toBe('terrain');
    expect(r.extras).toEqual([]);
    expect(r.size).toBeGreaterThan(0);
  });

  it('gives every planet a style the shader knows', () => {
    for (const id of Object.keys(calibration.systems).filter((x) => !x.endsWith('gate'))) {
      expect(STYLES).toContain(planetRecipe(id).style);
    }
  });

  it('colours a planet by its resource, with a fallback', () => {
    expect(planetPalette('weapons').line).not.toBe(planetPalette('relic').line);
    expect(planetPalette(undefined)).toEqual(planetPalette('relic'));
  });
});
