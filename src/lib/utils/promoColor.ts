/**
 * Node coloring by promotion year for the family graph.
 *
 * Tints each node along a single blue hue (the app accent) so a branch's
 * chronological direction reads at a glance: darker = older promo, lighter =
 * more recent. The scale is normalised against the promo bounds of the
 * currently displayed graph, so the full lightness range is always used
 * whatever the span. Nodes with an unknown promo get a neutral tint.
 */

/** Inclusive promo bounds across the displayed nodes. */
export interface PromoBounds {
  min: number;
  max: number;
}

// Blue hue shared with the app accent (#3b82f6 ~ hsl(217, 91%, 60%)).
const HUE = 217;
const SATURATION = 85;
// Lightness ramp: oldest promo -> darkest, newest -> lightest.
const LIGHT_MIN = 42;
const LIGHT_MAX = 72;
// Neutral desaturated tint for nodes whose promo is unknown.
const UNKNOWN_COLOR = "hsl(217, 12%, 55%)";

/**
 * Compute the inclusive promo bounds over the displayed promo values.
 * Returns null when no value is known (nothing to scale against).
 */
export function computePromoBounds(
  promos: readonly (number | null)[],
): PromoBounds | null {
  let min = Infinity;
  let max = -Infinity;
  for (const promo of promos) {
    if (promo === null) {
      continue;
    }
    if (promo < min) {
      min = promo;
    }
    if (promo > max) {
      max = promo;
    }
  }
  return min === Infinity ? null : { min, max };
}

/**
 * Map a promo year to a node color within the current graph bounds.
 * Lighter = more recent. Unknown promo (or missing bounds) -> neutral tint.
 */
export function promoColor(
  promo: number | null,
  bounds: PromoBounds | null,
): string {
  if (promo === null || bounds === null) {
    return UNKNOWN_COLOR;
  }
  // Single-promo graph (min === max): land on the mid tone (the base accent).
  const span = bounds.max - bounds.min;
  const t = span === 0 ? 0.5 : (promo - bounds.min) / span;
  const lightness = LIGHT_MIN + t * (LIGHT_MAX - LIGHT_MIN);
  return `hsl(${HUE}, ${SATURATION}%, ${lightness.toFixed(1)}%)`;
}
