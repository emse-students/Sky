/**
 * Pure camera math for the star map: the one place a zoom gesture becomes a new view.
 *
 * The map follows the contract of every zoomable map (Google Maps, Figma, d3-zoom):
 * - zoom is MULTIPLICATIVE - a 2x finger spread is a 2x zoom at every level, where the old
 *   additive step turned the same spread into x20 zoomed out and x1.3 zoomed in;
 * - zoom is ANCHORED - the world point under the cursor or the pinch midpoint stays under it;
 * - zoom is BOUNDED by the graph itself - it cannot be zoomed out far past the whole map.
 */

/** The part of the camera a gesture changes: the world point at the screen centre, and the scale. */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

/** Inclusive zoom range a gesture may reach. */
export interface ZoomBounds {
  min: number;
  max: number;
}

/** A point in canvas pixels, origin at the canvas top-left corner. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** Canvas size in pixels. */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * Closest zoom a gesture may reach. Nodes and labels are drawn at a constant SCREEN size, so
 * zooming in only spreads stars apart; past this there is nothing more to read, only emptier space.
 */
export const MAX_ZOOM = 5;

/**
 * How far below "the whole graph fits" a gesture may zoom out, as a ratio of that fit. Half the
 * fit leaves the whole map visible at half the screen, never the 50 px blob the old 0.01 floor
 * allowed.
 */
export const MIN_ZOOM_FIT_RATIO = 0.5;

/** Floor used only while no star has a position yet (graph still loading): nothing can be lost. */
export const EMPTY_GRAPH_MIN_ZOOM = 0.01;

/**
 * Apply a zoom `factor` anchored at `anchor`, then carry that anchor to `moveTo`.
 *
 * The world point under `anchor` before the call is under `moveTo` after it. With `moveTo`
 * omitted this is a pure anchored zoom (wheel); with it, one call is a whole two-finger step -
 * scale by the finger spread and pan with the midpoint.
 *
 * Clamping never jumps: a view already outside `bounds` (a programmatic `setTarget` may put it
 * there) is never pushed further out, and is not snapped back either - the gesture just cannot
 * go the wrong way.
 */
export function zoomAt(
  view: View,
  factor: number,
  anchor: ScreenPoint,
  viewport: Viewport,
  bounds: ZoomBounds,
  moveTo: ScreenPoint = anchor
): View {
  const min = Math.min(bounds.min, view.zoom);
  const max = Math.max(bounds.max, view.zoom);
  const zoom = Math.max(min, Math.min(max, view.zoom * factor));

  // Screen -> world for the anchor under the CURRENT view.
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const worldX = view.x + (anchor.x - cx) / view.zoom;
  const worldY = view.y + (anchor.y - cy) / view.zoom;

  // Choose the new centre so that world point lands on `moveTo` under the new zoom.
  return {
    x: worldX - (moveTo.x - cx) / zoom,
    y: worldY - (moveTo.y - cy) / zoom,
    zoom,
  };
}

/**
 * Zoom factor for one wheel event, with d3-zoom's constants: one mouse notch (deltaY 100 px,
 * or 3 lines in Firefox) is 2^0.2 = x1.15, and a trackpad pinch - which browsers report as a wheel
 * event with `ctrlKey` set and small deltas - is ten times as sensitive so it tracks the fingers.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  // deltaMode: 0 = pixels, 1 = lines, 2 = pages.
  const unit = deltaMode === 1 ? 0.05 : deltaMode === 2 ? 1 : 0.002;
  return Math.pow(2, -deltaY * unit * (ctrlKey ? 10 : 1));
}

/**
 * Zoom bounds for a graph: the minimum is `MIN_ZOOM_FIT_RATIO` of the zoom at which every
 * positioned star fits the viewport, the maximum `MAX_ZOOM`.
 */
export function zoomBoundsFor(
  positions: Record<string, { x: number; y: number }>,
  viewport: Viewport
): ZoomBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pos of Object.values(positions)) {
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x);
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y);
  }
  if (minX === Infinity) return { min: EMPTY_GRAPH_MIN_ZOOM, max: MAX_ZOOM };

  // A single star (or a line of them) has no extent on an axis: that axis does not constrain.
  const fitX = maxX > minX ? viewport.width / (maxX - minX) : Infinity;
  const fitY = maxY > minY ? viewport.height / (maxY - minY) : Infinity;
  const fit = Math.min(fitX, fitY);
  if (fit === Infinity) return { min: EMPTY_GRAPH_MIN_ZOOM, max: MAX_ZOOM };

  return { min: Math.min(fit * MIN_ZOOM_FIT_RATIO, MAX_ZOOM), max: MAX_ZOOM };
}

/**
 * Zoom factor of one press on the + / - map control: x2, one "zoom level" of Google Maps. A
 * button is not a gesture - its move eases toward the target - so presses in quick succession
 * compound from the TARGET, not from the frame in flight.
 */
export const BUTTON_ZOOM_FACTOR = 2;

/** Share of the visible area a fitted graph fills, leaving a margin so no star sits on an edge. */
export const FIT_FILL = 0.85;

/** Zoom used to "fit" a single star, which has no extent to fit (the same as a lone selection). */
export const SINGLE_STAR_ZOOM = 0.8;

/** Screen pixels covered by chrome on an edge (the top bar, a bottom sheet), where nothing fits. */
export interface Insets {
  top: number;
  bottom: number;
}

/**
 * The view that fits every point of `positions` inside the part of the viewport `insets` leaves
 * uncovered, centred in it - the "recentre" control. Returns null when there is nothing to fit.
 */
export function fitView(
  positions: Iterable<{ x: number; y: number }>,
  viewport: Viewport,
  insets: Insets = { top: 0, bottom: 0 }
): View | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pos of positions) {
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x);
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y);
  }
  if (minX === Infinity) return null;

  const visibleHeight = Math.max(1, viewport.height - insets.top - insets.bottom);
  const fitX = maxX > minX ? (viewport.width * FIT_FILL) / (maxX - minX) : Infinity;
  const fitY = maxY > minY ? (visibleHeight * FIT_FILL) / (maxY - minY) : Infinity;
  const fit = Math.min(fitX, fitY);
  const zoom = fit === Infinity ? SINGLE_STAR_ZOOM : Math.min(fit, MAX_ZOOM);

  // The camera names the world point at the SCREEN centre; the graph's centre must land on the
  // centre of the uncovered area instead, which sits (top - bottom) / 2 below it.
  const shift = (insets.top - insets.bottom) / 2;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 - shift / zoom, zoom };
}
