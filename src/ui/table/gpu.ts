// How the 3D views get their graphics card. Every WebGL renderer of the table
// is made here: it asks the browser for the fast (dedicated) graphics card and
// first refuses a context the browser would draw in software (on the
// processor, as when hardware acceleration is off or the driver is blocked).
// Only when nothing else is offered does it take the software one, and then
// the views draw lighter: one pixel per screen pixel, no shadows, animations
// at a lower rate. A frame watch makes the same switch on a slow real card.

import * as THREE from 'three';

/** Names browsers give their software renderers (WEBGL_debug_renderer_info). */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|basic render|software|gdi generic/i;

/** True when `name`, a WebGL renderer's name, is drawing in software. */
export function isSoftwareRenderer(name: string): boolean {
  return SOFTWARE.test(name);
}

/** What the table learnt about the graphics card, shared by every 3D view. */
export const gpu = {
  /** The renderer's name as the browser reports it ('' when hidden). */
  name: '',
  /** Drawing in software: no usable graphics card. */
  software: false,
  /** Drawing lighter (software, or frames found too slow). */
  lite: false,
};

/** The renderer's name, or '' when the browser hides it. */
function rendererName(r: THREE.WebGLRenderer): string {
  const gl = r.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String((ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) ?? '');
}

/**
 * A WebGL renderer on the fast graphics card when there is one. Throws when
 * this browser has no WebGL at all. Sets `gpu` from what it got.
 */
export function createRenderer(params: THREE.WebGLRendererParameters = {}): THREE.WebGLRenderer {
  let r: THREE.WebGLRenderer;
  try {
    r = new THREE.WebGLRenderer({ ...params, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true });
  } catch {
    // Only a software context is left: take it, without the costly smoothing.
    r = new THREE.WebGLRenderer({ ...params, antialias: false, powerPreference: 'high-performance' });
    gpu.software = true;
  }
  gpu.name ||= rendererName(r);
  if (isSoftwareRenderer(gpu.name)) gpu.software = true;
  if (gpu.software) gpu.lite = true;
  return r;
}

/** The pixel ratio to draw at: the screen's (at most 2), or 1 when drawing lighter. */
export function drawRatio(screenRatio: number): number {
  return gpu.lite ? 1 : Math.min(2, screenRatio || 1);
}

/** Animation frames drawn at most this often when drawing lighter (milliseconds: about 30 a second). */
export const LITE_FRAME_MS = 33;

/**
 * Watches the time between drawn frames while a view animates: reports once
 * when, over `frames` frames in a row, they average more than `slowMs`
 * (the card cannot keep up). Pauses longer than `gapMs` (a hidden tab, a
 * still view) start the count again.
 */
export class FrameWatch {
  private last = -1;
  private sum = 0;
  private n = 0;
  private done = false;

  constructor(private readonly slowMs = 45, private readonly frames = 90, private readonly gapMs = 250) {}

  /** A frame was drawn at `t` milliseconds; true the one time the frames are found too slow. */
  tick(t: number): boolean {
    if (this.done) return false;
    const dt = this.last < 0 ? -1 : t - this.last;
    this.last = t;
    if (dt < 0 || dt > this.gapMs) {
      this.sum = 0;
      this.n = 0;
      return false;
    }
    this.sum += dt;
    this.n++;
    if (this.n < this.frames) return false;
    const slow = this.sum / this.n > this.slowMs;
    this.sum = 0;
    this.n = 0;
    if (slow) this.done = true;
    return slow;
  }
}
