/**
 * The camera moves the map UI asks for by name - frame a star's neighbourhood, show the whole sky -
 * so the auto-zoom, "go to my star", the landing on one's own star, the fit button and "Sortir"
 * each reach the same view through one implementation instead of their own numbers.
 */
import { get } from 'svelte/store';
import { cameraStore } from './cameraStore';
import { findNeighborsWithinHops, focusDepth, graphStore, selectedPersonId } from './graphStore';
import { fitView, focusView, type Insets, type Viewport } from '$lib/utils/camera';
import { framingInsets } from './mapChrome';

/** Pixels of the desktop top bar: nothing is framed under it. */
export const TOP_BAR_HEIGHT = 72;

/** A phone has no top bar, only the 40 px account disc 8 px from the top: frame below it. */
export const PHONE_TOP_INSET = 56;

/** Bottom of the focus chip (40 px, 8 px from the top) on a phone: a framed star sits below it. */
export const PHONE_CHIP_BOTTOM = 48;

/** Bottom of the focus chip on desktop: 12 px under the bar, 40 px high. */
export const DESKTOP_CHIP_BOTTOM = TOP_BAR_HEIGHT + 12 + 40;

/** Width of the desktop person drawer (ProfileSheet): a framed star sits right of it. */
export const DRAWER_WIDTH = 400;

/** The canvas is the full window. */
function viewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Frame `personId` and the stars within the focus depth (`focusView`). `instant` puts the camera
 * there on this frame - the landing, which must not be seen flying in from the overview; otherwise
 * it eases, as every programmatic move does. Returns false when the star has no position.
 */
export function frameStar(personId: string, instant = false): boolean {
  const graph = get(graphStore);
  const star = graph.positions[personId];
  if (!star) {
    console.debug('[mapActions] frameStar: no position for', personId);
    return false;
  }
  const group = [...findNeighborsWithinHops(personId, graph.relations, get(focusDepth))]
    .map((id) => graph.positions[id])
    .filter((pos) => pos !== undefined);
  const view = focusView(star, group, viewport(), get(framingInsets));
  console.debug('[mapActions] frame', personId, instant ? 'instantly' : 'eased', view);
  if (instant) cameraStore.jumpTo(view);
  else cameraStore.setTarget(view.x, view.y, view.zoom);
  return true;
}

/**
 * Leave focus and show every star: the fit button and "Sortir". Deselecting closes the sheet, so
 * only the top bar is an inset.
 */
export function showWholeSky(insets: Insets = { top: TOP_BAR_HEIGHT, bottom: 0 }): void {
  selectedPersonId.set(null);
  const view = fitView(Object.values(get(graphStore).positions), viewport(), insets);
  if (!view) {
    console.debug('[mapActions] showWholeSky: nothing positioned yet');
    return;
  }
  console.debug('[mapActions] whole sky at zoom', view.zoom.toFixed(4));
  cameraStore.setTarget(view.x, view.y, view.zoom);
}
