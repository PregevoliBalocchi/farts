// Positions on the 3D table (src/ui/table/board3d-layout.ts): calibration
// mapping, schematic fallback, and how ship stacks are laid out.
import { describe, expect, it } from 'vitest';
import {
  BOARD_DEPTH, boardWidth, buildingSpots, isCalibration, MAX_SHOWN, pictureToWorld, PILE_SHOWN, pileSpots, shipSpot, schematicToWorld, slotSpots, stackCentres, stackSpots, systemSpots, TILT_FAR, TILT_NEAR, tiltForZoom, worldToPicture,
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

  it('has no zone without calibration or ship points', () => {
    expect(shipSpot(null, 'a', 0)).toBeNull();
    expect(shipSpot(calib, 'b', 0)).toBeNull();
    expect(shipSpot(calib, 'missing', 0)).toBeNull();
  });

  it('keeps a pile within a ship-and-a-half of its point, fresh standing behind damaged', () => {
    const pile = pileSpots(2, 1);
    expect(pile).toHaveLength(3);
    for (const s of pile) expect(Math.hypot(s.dx, s.dz)).toBeLessThan(0.3);
    const standing = pile.filter((s) => !s.lying);
    const lying = pile.filter((s) => s.lying);
    expect(standing).toHaveLength(2);
    expect(Math.max(...standing.map((s) => s.dz))).toBeLessThan(Math.min(...lying.map((s) => s.dz)));
  });

  it('draws at most PILE_SHOWN ships, keeping one place for a damaged ship', () => {
    const pile = pileSpots(5, 3);
    expect(pile).toHaveLength(PILE_SHOWN);
    expect(pile.filter((s) => s.lying)).toHaveLength(1);
    expect(pileSpots(5, 0).every((s) => !s.lying)).toBe(true);
    expect(pileSpots(0, 5).every((s) => s.lying)).toBe(true);
    expect(pileSpots(0, 5)).toHaveLength(PILE_SHOWN);
  });
});
