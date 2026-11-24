// The 3D views must run on the graphics card: software renderers are recognised
// by name, and a map that cannot keep up is found by its frame times.
import { describe, expect, it } from 'vitest';
import { FrameWatch, isSoftwareRenderer } from '../../../src/ui/table/gpu';

describe('isSoftwareRenderer', () => {
  it('recognises the software renderers browsers fall back to', () => {
    for (const name of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'GDI Generic',
    ]) expect(isSoftwareRenderer(name)).toBe(true);
  });

  it('accepts real graphics cards, dedicated and integrated', () => {
    for (const name of [
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Apple M1',
      '',
    ]) expect(isSoftwareRenderer(name)).toBe(false);
  });
});

/** Feeds `watch` `n` frames `dt` milliseconds apart from `t0`; true if it reported slow at any of them. */
function feed(watch: FrameWatch, n: number, dt: number, t0 = 0): boolean {
  let slow = false;
  for (let i = 0; i <= n; i++) slow = watch.tick(t0 + i * dt) || slow;
  return slow;
}

describe('FrameWatch', () => {
  it('reports frames that stay slower than the limit', () => {
    // Arrange
    const watch = new FrameWatch(45, 10);
    // Act / Assert: 10 frames at 60 ms each
    expect(feed(watch, 10, 60)).toBe(true);
  });

  it('stays quiet at a smooth rate', () => {
    expect(feed(new FrameWatch(45, 10), 30, 16)).toBe(false);
  });

  it('does not count pauses (a hidden tab) as slow frames', () => {
    // 300 ms apart: every frame is a pause, the count starts again each time.
    expect(feed(new FrameWatch(45, 10, 250), 30, 300)).toBe(false);
  });

  it('reports only once', () => {
    const watch = new FrameWatch(45, 10);
    feed(watch, 10, 60);
    expect(feed(watch, 30, 60, 1000)).toBe(false);
  });
});
