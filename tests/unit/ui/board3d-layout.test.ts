// Positions on the 3D table (src/ui/table/board3d-layout.ts): calibration
// mapping, schematic fallback, and how ship stacks are laid out.
import { describe, expect, it } from 'vitest';
import {
  BOARD_DEPTH, boardWidth, buildingSpots, edgeDistance, GATE, gateLayouts, numberGap, insidePolygon, isCalibration, ORBIT, orbitLayouts, pathPoints, MAX_SHOWN, pictureToWorld, GROUP_GAP, headingJitter, HEADING_SPREAD, shipGroups, shipPlace, shipSpot, schematicToWorld, slotSpots, stackCentres, stackSpots, systemSpots, TILT_FAR, TILT_NEAR, tiltForZoom, worldToPicture,
} from '../../../src/ui/table/board3d-layout';

const PICTURE = { width: 4000, height: 2000 };

describe('board calibration', () => {
  it('puts the picture centre at the table origin and its corners at the board edges', () => {
    expect(pictureToWorld(PICTURE, 2000, 1000)).toEqual({ x: 0, z: 0 });
    expect(pictureToWorld(PICTURE, 0, 0)).toEqual({ x: -boardWidth(4000, 2000) / 2, z: -BOARD_DEPTH / 2 });
  });

  it('converts back from the table to the same picture pixel', () => {
    const w = pictureToWorld(PICTURE, 1234, 567);
    const back = worldToPicture(PICTURE, w);
    expect(back.x).toBeCloseTo(1234);
    expect(back.y).toBeCloseTo(567);
  });

  it('accepts only calibration files with sizes and numeric positions', () => {
    expect(isCalibration({ width: 10, height: 5, systems: { a: { x: 1, y: 2 } } })).toBe(true);
    expect(isCalibration({ width: 10, height: 5, systems: { a: { x: '1', y: 2 } } })).toBe(false);
    expect(isCalibration({ width: 0, height: 5, systems: {} })).toBe(false);
    expect(isCalibration(null)).toBe(false);
  });

  it('uses the calibration where it names a system and the schematic elsewhere', () => {
    const schematic = { a: { x: 320, y: 320 }, b: { x: 392, y: 320 } };
    const spots = systemSpots(schematic, { ...PICTURE, systems: { a: { x: 0, y: 0 } } });
    expect(spots.a).toEqual(pictureToWorld(PICTURE, 0, 0));
    expect(spots.b).toEqual(schematicToWorld(392, 320));
    expect(spots.b).toEqual({ x: 1, z: 0 });
  });
});

describe('stackSpots', () => {
  it('stands fresh ships and lays damaged ones down', () => {
    const s = stackSpots(2, 1);
    expect(s.filter((x) => !x.lying)).toHaveLength(2);
    expect(s.filter((x) => x.lying)).toHaveLength(1);
  });

  it('draws at most MAX_SHOWN pieces, fresh first', () => {
    const s = stackSpots(MAX_SHOWN + 3, 2);
    expect(s).toHaveLength(MAX_SHOWN);
    expect(s.every((x) => !x.lying)).toBe(true);
  });

  it('centres a row on the stack', () => {
    const s = stackSpots(3, 0);
    expect(s.reduce((t, x) => t + x.dx, 0)).toBeCloseTo(0);
  });
});

describe('stack and building spots', () => {
  it('puts up to four seat stacks at distinct corners around the system', () => {
    const c = stackCentres(4);
    expect(new Set(c.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`)).size).toBe(4);
  });

  it('puts buildings below the system centre (toward the viewer)', () => {
    for (const b of buildingSpots(3)) expect(b.z).toBeGreaterThan(0);
  });
});

describe('slotSpots', () => {
  const calib = { ...PICTURE, systems: { a: { x: 2000, y: 1000, slots: [{ x: 0, y: 0 }, { x: 4000, y: 2000 }] }, b: { x: 10, y: 10 } } };

  it('gives the calibrated building slots as table points, in slot order', () => {
    expect(slotSpots(calib, 'a')).toEqual([pictureToWorld(PICTURE, 0, 0), pictureToWorld(PICTURE, 4000, 2000)]);
  });

  it('gives null without a calibration, for an unknown system, or one without slots', () => {
    expect(slotSpots(null, 'a')).toBeNull();
    expect(slotSpots(calib, 'zz')).toBeNull();
    expect(slotSpots(calib, 'b')).toBeNull();
  });
});

describe('tiltForZoom', () => {
  it('leans the camera when close and looks straight down when far', () => {
    expect(tiltForZoom(2, 2, 10)).toBe(TILT_NEAR);
    expect(tiltForZoom(1, 2, 10)).toBe(TILT_NEAR);
    expect(tiltForZoom(10, 2, 10)).toBe(TILT_FAR);
    expect(tiltForZoom(25, 2, 10)).toBe(TILT_FAR);
  });

  it('rises steadily as the camera moves away', () => {
    const tilts = [2, 4, 6, 8, 10].map((d) => tiltForZoom(d, 2, 10));
    expect(tilts).toEqual([...tilts].sort((a, b) => a - b));
    expect(tiltForZoom(6, 2, 10)).toBeCloseTo((TILT_NEAR + TILT_FAR) / 2);
  });
});

describe('ship zones', () => {
  const calib = { ...PICTURE, systems: { a: { x: 100, y: 100, ships: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }, b: { x: 5, y: 5 } } };

  it('puts each seat on its own point of the system ship zone', () => {
    expect(shipSpot(calib, 'a', 0)).toEqual(pictureToWorld(PICTURE, 10, 20));
    expect(shipSpot(calib, 'a', 1)).toEqual(pictureToWorld(PICTURE, 30, 40));
    expect(shipSpot(calib, 'a', 2)).toEqual(pictureToWorld(PICTURE, 10, 20));
  });

  it('stands the seats in the centred figure for how many seats are there', () => {
    const fig = { ...calib, systems: { ...calib.systems, a: { ...calib.systems.a, layouts: [[{ x: 50, y: 50 }], [{ x: 40, y: 50 }, { x: 60, y: 50 }]] } } };
    expect(shipPlace(fig, 'a', 2, [2])).toEqual(pictureToWorld(PICTURE, 50, 50));
    expect(shipPlace(fig, 'a', 1, [1, 3])).toEqual(pictureToWorld(PICTURE, 40, 50));
    expect(shipPlace(fig, 'a', 3, [1, 3])).toEqual(pictureToWorld(PICTURE, 60, 50));
    // More seats than figures: the largest figure, round again.
    expect(shipPlace(fig, 'a', 2, [0, 1, 2])).toEqual(pictureToWorld(PICTURE, 40, 50));
    // No figures: the seat's own spot.
    expect(shipPlace(calib, 'a', 1, [1])).toEqual(shipSpot(calib, 'a', 1));
  });

  it('has no zone without calibration or ship points', () => {
    expect(shipSpot(null, 'a', 0)).toBeNull();
    expect(shipSpot(calib, 'b', 0)).toBeNull();
    expect(shipSpot(calib, 'missing', 0)).toBeNull();
  });

  it('draws a fleet as one model: fresh when any ship is fresh, with both counts', () => {
    expect(shipGroups(3, 2)).toEqual([{ dx: 0, dz: 0, lying: false, count: 5, fresh: 3, damaged: 2 }]);
    expect(shipGroups(4, 0)).toEqual([{ dx: 0, dz: 0, lying: false, count: 4, fresh: 4, damaged: 0 }]);
  });

  it('draws the damaged model only when every ship is damaged, and nothing for no ships', () => {
    expect(shipGroups(0, 1)).toEqual([{ dx: 0, dz: 0, lying: true, count: 1, fresh: 0, damaged: 1 }]);
    expect(shipGroups(0, 0)).toEqual([]);
  });

  it('turns each ship group a fixed amount within the spread', () => {
    const keys = ['a:0:f', 'a:0:d', 'a:1:f', 'b:2:f', 'c:3:d'];
    const turns = keys.map(headingJitter);
    for (const t of turns) expect(Math.abs(t)).toBeLessThanOrEqual(HEADING_SPREAD);
    expect(keys.map(headingJitter)).toEqual(turns);
    expect(new Set(turns).size).toBeGreaterThan(3);
  });
});

// A square sector 600 px wide with a planet of radius 80 in its middle (picture pixels).
const SQUARE = pathPoints('M0,0L600,0L600,600L0,600Z');
const PLANET = { x: 300, y: 300, r: 80 };

describe('ships orbiting a planet', () => {
  it('reads a sector outline and tells inside from outside', () => {
    expect(SQUARE).toHaveLength(4);
    expect(insidePolygon({ x: 10, y: 10 }, SQUARE)).toBe(true);
    expect(insidePolygon({ x: 610, y: 10 }, SQUARE)).toBe(false);
    expect(edgeDistance({ x: 10, y: 300 }, SQUARE)).toBeCloseTo(10);
  });

  it('puts one seat straight below the planet, just past its rim on the tilted orbit', () => {
    const [one] = orbitLayouts(PLANET, SQUARE);
    expect(one).toHaveLength(1);
    expect(one![0].x).toBeCloseTo(300);
    expect(one![0].y).toBeCloseTo(300 + PLANET.r / ORBIT.squash + ORBIT.gap);
  });

  it('keeps every seat outside the planet, inside the sector and apart, in order left to right', () => {
    const figs = orbitLayouts(PLANET, SQUARE);
    figs.forEach((fig, i) => {
      expect(fig).toHaveLength(i + 1);
      for (const p of fig!) {
        expect(Math.hypot(p.x - PLANET.x, p.y - PLANET.y)).toBeGreaterThan(PLANET.r + ORBIT.gap - 1);
        expect(insidePolygon(p, SQUARE)).toBe(true);
        expect(edgeDistance(p, SQUARE)).toBeGreaterThanOrEqual(ORBIT.clear);
      }
      for (let a = 0; a < fig!.length; a++) for (let b = a + 1; b < fig!.length; b++) expect(Math.hypot(fig![a].x - fig![b].x, fig![a].y - fig![b].y)).toBeGreaterThanOrEqual(ORBIT.apart);
      expect(fig!.map((p) => p.x)).toEqual([...fig!.map((p) => p.x)].sort((x, y) => x - y));
    });
  });

  it('stays off a neighbouring planet and gives up a figure with no room', () => {
    const below = { x: 300, y: 520, r: 70 };
    for (const p of orbitLayouts(PLANET, SQUARE, [below])[0]!) expect(Math.hypot(p.x - below.x, p.y - below.y)).toBeGreaterThan(below.r);
    const tight = pathPoints('M180,180L420,180L420,420L180,420Z');
    expect(orbitLayouts(PLANET, tight)).toEqual([null, null, null, null]);
  });
});

describe('ships at a gate', () => {
  // A ring segment above the centre (0, 0): between radius 150 and 290, from -120 to -60 degrees.
  const arc = (r: number, from: number, to: number) => Array.from({ length: 13 }, (_, i) => {
    const a = ((from + ((to - from) * i) / 12) * Math.PI) / 180;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
  const SEGMENT = [...arc(290, -120, -60), ...arc(150, -60, -120)];
  const NUMBER = { x: 0, y: -220 };

  it('keeps the number clear and puts two seats one each side of it', () => {
    const [one, two] = gateLayouts({ x: 0, y: 0 }, NUMBER, SEGMENT);
    expect(numberGap(one![0], NUMBER)).toBeGreaterThanOrEqual(GATE.number);
    expect(two).toHaveLength(2);
    expect(Math.sign(two![0].x)).not.toBe(Math.sign(two![1].x));
  });

  it('fits up to four seats inside the segment, strictly for one or two, easing room and gaps a little for more', () => {
    gateLayouts({ x: 0, y: 0 }, NUMBER, SEGMENT).forEach((fig, i) => {
      const strict = i < 2;
      expect(fig).not.toBeNull();
      for (const p of fig!) {
        expect(insidePolygon(p, SEGMENT)).toBe(true);
        expect(numberGap(p, NUMBER)).toBeGreaterThanOrEqual(strict ? GATE.number : 0);
      }
      for (let a = 0; a < fig!.length; a++) for (let b = a + 1; b < fig!.length; b++) expect(Math.hypot(fig![a].x - fig![b].x, fig![a].y - fig![b].y)).toBeGreaterThanOrEqual(strict ? GATE.apart : GATE.apart * 0.62);
    });
  });
});
