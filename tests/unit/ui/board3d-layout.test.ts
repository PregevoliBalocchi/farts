// Positions on the 3D table (src/ui/table/board3d-layout.ts): calibration
// mapping, schematic fallback, and how ship stacks are laid out.
import { describe, expect, it } from 'vitest';
import {
  BOARD_DEPTH, boardWidth, buildingSpots, isCalibration, MAX_SHOWN, pictureToWorld, schematicToWorld, stackCentres, stackSpots, systemSpots, worldToPicture,
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
