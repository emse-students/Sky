/**
 * Label placement for the star map: which names are drawn, the way a map decides it.
 *
 * Drawing every name once zoomed in turned dense families into an unreadable pile of text. A map
 * (Google Maps, Apple Maps) instead ranks its labels and draws one only if its box collides with
 * none already placed, so what is on screen is always readable and the most relevant names win.
 * Everything here is in SCREEN pixels: names are drawn at a constant screen size, so collisions
 * are a screen-space question whatever the zoom.
 */

/** A name that could be drawn: its screen box and its rank (higher = placed first). */
export interface LabelCandidate {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  priority: number;
}

/** Why a label matters, from strongest to weakest. */
export interface LabelContext {
  selected: boolean;
  hovered: boolean;
  /** A direct parrain / fillot of the selected star. */
  neighbourOfSelected: boolean;
  /** Number of links of the star in the whole graph - its importance on the map. */
  degree: number;
}

/**
 * Tier width: a tier outranks every degree below it. No star has anywhere near a million links,
 * so a lower tier can never overtake a higher one through its degree.
 */
const TIER = 1_000_000;

/**
 * Rank of a label: selected > hovered > neighbour of the selected star > the rest, and within a
 * tier the better-connected star first (a hub names its family, as a city names its region).
 */
export function labelPriority(ctx: LabelContext): number {
  const tier = ctx.selected ? 3 : ctx.hovered ? 2 : ctx.neighbourOfSelected ? 1 : 0;
  return tier * TIER + Math.min(ctx.degree, TIER - 1);
}

/**
 * Side of one occupancy-grid cell, in screen pixels. About one short name wide: a candidate then
 * touches a handful of cells and is compared only with the labels already in those.
 */
export const LABEL_GRID_CELL = 64;

/** Empty space kept around every placed label so two names never touch. */
export const LABEL_PADDING = 3;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Greedy placement: candidates in descending priority (ties broken by id, so the same scene always
 * yields the same labels and nothing flickers between frames), each kept only if its padded box
 * overlaps no label kept before it. An occupancy grid keeps this near-linear in the number of
 * candidates instead of comparing every pair.
 *
 * Returns the ids of the labels to draw. The top-ranked candidate is always placed, so a selected
 * star is never left unnamed.
 */
export function placeLabels(
  candidates: readonly LabelCandidate[],
  padding: number = LABEL_PADDING,
  cell: number = LABEL_GRID_CELL
): Set<string> {
  const order = [...candidates].sort(
    (a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  const grid = new Map<string, Box[]>();
  const placed = new Set<string>();

  for (const c of order) {
    const box: Box = {
      left: c.left - padding,
      top: c.top - padding,
      right: c.left + c.width + padding,
      bottom: c.top + c.height + padding,
    };
    const x0 = Math.floor(box.left / cell);
    const x1 = Math.floor(box.right / cell);
    const y0 = Math.floor(box.top / cell);
    const y1 = Math.floor(box.bottom / cell);

    let free = true;
    for (let gx = x0; gx <= x1 && free; gx++) {
      for (let gy = y0; gy <= y1 && free; gy++) {
        const boxes = grid.get(`${gx},${gy}`);
        if (boxes?.some((other) => overlaps(box, other))) free = false;
      }
    }
    if (!free) continue;

    placed.add(c.id);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const key = `${gx},${gy}`;
        const boxes = grid.get(key);
        if (boxes) boxes.push(box);
        else grid.set(key, [box]);
      }
    }
  }
  return placed;
}

/**
 * Opacity change per frame while a label fades. At 60 fps a full fade takes ~150 ms: long enough
 * that a name appearing or yielding its place reads as a transition, not a pop.
 */
export const LABEL_FADE_STEP = 0.12;

/**
 * Advance every label's opacity one frame toward its target: 1 for a placed label, 0 for the rest.
 * A label that reaches 0 is dropped from the map. `animating` is true while any label is still
 * between states, so the on-demand renderer knows to draw another frame.
 */
export function stepLabelOpacity(
  previous: ReadonlyMap<string, number>,
  placed: ReadonlySet<string>,
  step: number = LABEL_FADE_STEP
): { opacity: Map<string, number>; animating: boolean } {
  const opacity = new Map<string, number>();
  let animating = false;

  for (const id of placed) {
    const next = Math.min(1, (previous.get(id) ?? 0) + step);
    opacity.set(id, next);
    if (next < 1) animating = true;
  }
  for (const [id, value] of previous) {
    if (placed.has(id)) continue;
    const next = Math.max(0, value - step);
    if (next > 0) {
      opacity.set(id, next);
      animating = true;
    }
  }
  return { opacity, animating };
}

/**
 * Fade state of the labels on screen across frames: `step` advances it one frame toward the
 * placement just computed (see `stepLabelOpacity`) and says whether another frame is needed.
 */
export class LabelFader {
  opacity: Map<string, number> = new Map();

  step(placed: ReadonlySet<string>): boolean {
    const next = stepLabelOpacity(this.opacity, placed);
    this.opacity = next.opacity;
    return next.animating;
  }
}

/**
 * Width of a name in the label font, measured once. `measureText` is the costly part of labelling
 * a frame and a name's width at a constant font never changes - until the web font arrives, which
 * is what `clear` is for.
 */
export class TextWidthCache {
  private widths = new Map<string, number>();

  constructor(private measure: (text: string) => number) {}

  get(text: string): number {
    let width = this.widths.get(text);
    if (width === undefined) {
      width = this.measure(text);
      this.widths.set(text, width);
    }
    return width;
  }

  clear(): void {
    this.widths.clear();
  }
}

/** Number of links of every star (a star with none is absent): its importance on the map. */
export function linkDegree(
  relations: readonly { id1: string; id2: string }[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of relations) {
    counts.set(r.id1, (counts.get(r.id1) ?? 0) + 1);
    counts.set(r.id2, (counts.get(r.id2) ?? 0) + 1);
  }
  return counts;
}
