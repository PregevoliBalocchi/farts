// The table stage (src/ui/table/layout.ts): at least 1920x1080, stretched to the window's shape,
// with the side columns on the window's edges.
import { afterEach, describe, expect, it } from 'vitest';
import { REGIONS, setStage, STAGE } from '../../../src/ui/table/layout';

afterEach(() => setStage(1920, 1080));

describe('elastic stage', () => {
  it('keeps 1920x1080 on a 16:9 window at any size', () => {
    expect(setStage(1600, 900)).toBeCloseTo(1600 / 1920);
    expect([STAGE.w, STAGE.h]).toEqual([1920, 1080]);
  });

  it('widens on an ultrawide window and keeps the right column on the right edge', () => {
    setStage(2560, 1080);
    expect([STAGE.w, STAGE.h]).toEqual([2560, 1080]);
    const side = REGIONS.side;
    expect(side.x + side.w).toBe(2560 - 10);
  });

  it('grows taller on a squarer window and keeps the bottom row on the bottom edge', () => {
    setStage(1280, 1024);
    expect(STAGE.w).toBe(1920);
    expect(STAGE.h).toBe(1536);
    const local = REGIONS.local;
    expect(local.y + local.h).toBe(1536 - 10);
  });
});
