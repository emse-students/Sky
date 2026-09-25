import { describe, it, expect } from 'vitest';
import {
  BUTTON_ZOOM_FACTOR,
  EMPTY_GRAPH_MIN_ZOOM,
  FIT_FILL,
  fitView,
  SINGLE_STAR_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM_FIT_RATIO,
  wheelZoomFactor,
  zoomAt,
  zoomBoundsFor,
  type ScreenPoint,
  type View,
} from './camera';

const viewport = { width: 400, height: 800 };
const wide = { min: 0.001, max: 1000 };

/** World point under a screen point, with the canvas transform GraphCanvas draws with. */
function worldAt(view: View, p: ScreenPoint) {
  return {
    x: view.x + (p.x - viewport.width / 2) / view.zoom,
    y: view.y + (p.y - viewport.height / 2) / view.zoom,
  };
}

describe('zoomAt', () => {
  const start: View = { x: 120, y: -40, zoom: 0.3 };
  const anchor = { x: 37, y: 610 };

  it('keeps the world point under the anchor fixed', () => {
    const before = worldAt(start, anchor);
    for (const factor of [0.25, 0.9, 1.7, 4]) {
      const after = worldAt(zoomAt(start, factor, anchor, viewport, wide), anchor);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
  });

  it('is multiplicative: x2 is x2 at every level, and two x2 steps are x4', () => {
    for (const zoom of [0.05, 0.6, 2]) {
      const view = { ...start, zoom };
      const once = zoomAt(view, 2, anchor, viewport, wide);
      expect(once.zoom).toBeCloseTo(zoom * 2, 12);
      const twice = zoomAt(once, 2, anchor, viewport, wide);
      expect(twice.zoom).toBeCloseTo(zoom * 4, 12);
      const direct = zoomAt(view, 4, anchor, viewport, wide);
      expect(twice.x).toBeCloseTo(direct.x, 9);
      expect(twice.y).toBeCloseTo(direct.y, 9);
    }
  });

  it('is the identity for factor 1', () => {
    const view = zoomAt(start, 1, anchor, viewport, wide);
    expect(view.zoom).toBe(start.zoom);
    expect(view.x).toBeCloseTo(start.x, 12);
    expect(view.y).toBeCloseTo(start.y, 12);
  });

  it('carries the anchor to moveTo (two-finger pan with the midpoint)', () => {
    const moveTo = { x: 200, y: 100 };
    const before = worldAt(start, anchor);
    const after = worldAt(zoomAt(start, 1.5, anchor, viewport, wide, moveTo), moveTo);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('clamps to the bounds and keeps the anchor fixed when it does', () => {
    const bounds = { min: 0.1, max: 2 };
    const before = worldAt(start, anchor);
    const zoomedIn = zoomAt(start, 100, anchor, viewport, bounds);
    expect(zoomedIn.zoom).toBe(2);
    expect(worldAt(zoomedIn, anchor).x).toBeCloseTo(before.x, 9);
    expect(zoomAt(start, 0.001, anchor, viewport, bounds).zoom).toBe(0.1);
  });

  it('never pushes a view already out of bounds further out, nor snaps it back', () => {
    const bounds = { min: 0.1, max: 2 };
    const tooFar = { ...start, zoom: 0.05 };
    expect(zoomAt(tooFar, 0.5, anchor, viewport, bounds).zoom).toBe(0.05);
    expect(zoomAt(tooFar, 1.2, anchor, viewport, bounds).zoom).toBeCloseTo(0.06, 12);
  });
});

describe('wheelZoomFactor', () => {
  it('makes one mouse notch about x1.15, in pixels and in Firefox lines alike', () => {
    expect(wheelZoomFactor(-100, 0, false)).toBeCloseTo(Math.pow(2, 0.2), 12);
    expect(wheelZoomFactor(-3, 1, false)).toBeCloseTo(Math.pow(2, 0.15), 12);
    expect(wheelZoomFactor(100, 0, false)).toBeCloseTo(1 / Math.pow(2, 0.2), 12);
  });

  it('makes a trackpad pinch (ctrlKey) ten times as sensitive', () => {
    expect(wheelZoomFactor(-10, 0, true)).toBeCloseTo(wheelZoomFactor(-100, 0, false), 12);
  });

  it('is symmetric: a notch in then a notch out is the identity', () => {
    expect(wheelZoomFactor(-100, 0, false) * wheelZoomFactor(100, 0, false)).toBeCloseTo(1, 12);
  });
});

describe('zoomBoundsFor', () => {
  it('sets the minimum at a ratio of the zoom that fits the whole graph', () => {
    // 4000 x 2000 world units in a 400 x 800 viewport: width constrains, fit = 0.1.
    const positions = { a: { x: -2000, y: 0 }, b: { x: 2000, y: 2000 } };
    expect(zoomBoundsFor(positions, viewport)).toEqual({
      min: 0.1 * MIN_ZOOM_FIT_RATIO,
      max: MAX_ZOOM,
    });
  });

  it('falls to the empty-graph floor while nothing is positioned, or for a lone star', () => {
    expect(zoomBoundsFor({}, viewport).min).toBe(EMPTY_GRAPH_MIN_ZOOM);
    expect(zoomBoundsFor({ a: { x: 5, y: 5 } }, viewport).min).toBe(EMPTY_GRAPH_MIN_ZOOM);
  });
});

describe('fitView', () => {
  const vp = { width: 400, height: 800 };

  it('returns null for an empty graph', () => {
    expect(fitView([], vp)).toBeNull();
  });

  it('centres the graph and fits its larger side with a margin', () => {
    const view = fitView(
      [
        { x: -100, y: 0 },
        { x: 100, y: 50 },
      ],
      vp
    )!;
    expect(view.x).toBe(0);
    expect(view.y).toBe(25);
    // Width 200 against 400 px is the binding axis.
    expect(view.zoom).toBeCloseTo((400 * FIT_FILL) / 200);
  });

  it('centres the graph in the area the insets leave uncovered', () => {
    const insets = { top: 72, bottom: 240 };
    const view = fitView(
      [
        { x: 0, y: 0 },
        { x: 10, y: 1000 },
      ],
      vp,
      insets
    )!;
    // The graph centre (world y 500) lands at the centre of the visible band, not of the canvas.
    const screenY = (500 - view.y) * view.zoom + vp.height / 2;
    expect(screenY).toBeCloseTo(insets.top + (vp.height - insets.top - insets.bottom) / 2);
    expect(view.zoom).toBeCloseTo(((800 - 72 - 240) * FIT_FILL) / 1000);
  });

  it('uses the single-star zoom for one star, and never exceeds MAX_ZOOM', () => {
    expect(fitView([{ x: 3, y: 4 }], vp)).toEqual({ x: 3, y: 4, zoom: SINGLE_STAR_ZOOM });
    const tiny = fitView(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      vp
    )!;
    expect(tiny.zoom).toBe(MAX_ZOOM);
  });
});

describe('the + / - control', () => {
  it('doubles or halves the zoom around the screen centre, keeping the centre put', () => {
    const view: View = { x: 50, y: -20, zoom: 0.4 };
    const centre = { x: viewport.width / 2, y: viewport.height / 2 };
    const zoomedIn = zoomAt(view, BUTTON_ZOOM_FACTOR, centre, viewport, wide);
    expect(zoomedIn).toEqual({ x: 50, y: -20, zoom: 0.8 });
    const zoomedOut = zoomAt(view, 1 / BUTTON_ZOOM_FACTOR, centre, viewport, wide);
    expect(zoomedOut.zoom).toBeCloseTo(0.2);
  });
});
