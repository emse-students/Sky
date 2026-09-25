/**
 * Snap logic of the person bottom sheet on a phone, the Google Maps place sheet: a PEEK that
 * names the person and leaves the map usable above it, a HALF, and a FULL for everything else.
 * The sheet is dragged by its handle and released to the nearest state, a fling carrying it on.
 */

/** A resting state of the sheet. */
export type SheetState = 'peek' | 'half' | 'full';

/**
 * Height of each state as a share of the viewport height. Full stops short of the 72 px top bar
 * (which stays above the sheet, search included) on any phone taller than 600 px.
 */
export const SHEET_SNAPS: Record<SheetState, number> = { peek: 0.3, half: 0.6, full: 0.88 };

/** The states from lowest to highest. */
export const SHEET_ORDER: readonly SheetState[] = ['peek', 'half', 'full'];

/**
 * How far ahead a release is projected along its velocity, in ms. A quick flick then travels a
 * whole state, where the same distance dragged slowly settles back - how every native sheet reads.
 */
export const SHEET_FLING_MS = 180;

/**
 * Below this share of the peek height, a release dismisses the sheet instead of settling on peek.
 */
export const SHEET_DISMISS_RATIO = 0.6;

/** Pixel height of `state` in a viewport `viewportHeight` pixels tall. */
export function sheetHeight(state: SheetState, viewportHeight: number): number {
  return Math.round(SHEET_SNAPS[state] * viewportHeight);
}

/**
 * Where a released drag comes to rest. `height` is the sheet height at release, `velocity` its
 * rate of growth in px/ms (positive = dragged up). The release is projected `SHEET_FLING_MS` ahead,
 * then snapped to the nearest state - or dismissed if that projection falls well below the peek.
 */
export function settleSheet(
  height: number,
  velocity: number,
  viewportHeight: number
): SheetState | 'dismissed' {
  const projected = height + velocity * SHEET_FLING_MS;
  if (projected < sheetHeight('peek', viewportHeight) * SHEET_DISMISS_RATIO) return 'dismissed';

  let best: SheetState = 'peek';
  let bestDistance = Infinity;
  for (const state of SHEET_ORDER) {
    const distance = Math.abs(sheetHeight(state, viewportHeight) - projected);
    if (distance < bestDistance) {
      best = state;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * One step up (`1`) or down (`-1`) from `state`, for the keyboard and a tap on the handle. It
 * stops at full and at peek: dismissing is an explicit gesture (drag down, Escape, close).
 */
export function stepSheet(state: SheetState, direction: 1 | -1): SheetState {
  const i = SHEET_ORDER.indexOf(state) + direction;
  return SHEET_ORDER[Math.max(0, Math.min(SHEET_ORDER.length - 1, i))];
}

/**
 * Whether the map is still what the user is looking at while the sheet covers `covered` pixels of a
 * `viewportHeight`-pixel screen. Past half, the sheet is being read, and the map chrome - the
 * controls and the focus hub - steps aside: at full the hub would otherwise show as a strip
 * between the top bar and the sheet (Mi 9T, 2026-09-25).
 */
export function sheetLeavesMapUsable(covered: number, viewportHeight: number): boolean {
  return covered <= viewportHeight / 2;
}
