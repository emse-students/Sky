/**
 * Promotion-year rules for the parrainage graph.
 *
 * These four live apart from `database.ts` on purpose: they are PURE - no query, no driver, no
 * connection - and keeping them beside the SQLite code meant every consumer, and every test,
 * pulled in `bun:sqlite` just to ask whether a number was a plausible year. Their unit test
 * could not run at all under the suite's jsdom environment for exactly that reason.
 */

/**
 * Earliest valid promotion year: the school (Ecole des Mines de Saint-Etienne)
 * was founded in 1816, so no promotion can predate it. Used to reject typos at
 * creation time.
 */
export const MIN_PROMO = 1816;

/**
 * Maximum promotion-year gap between a godparent and their godchild. A godchild
 * is always a strictly more recent promotion, at most this many years apart.
 */
export const MAX_PROMO_GAP = 3;

/**
 * True if a promotion year is acceptable as user input: either unknown (null) or
 * an integer not before the school's founding year ({@link MIN_PROMO}). The
 * required-ness of the field is enforced separately by the callers.
 */
export function isValidPromo(level: number | null): boolean {
  return level === null || (Number.isInteger(level) && level >= MIN_PROMO);
}

/**
 * Validate the promotions of a would-be godparent/godchild pair. Returns the
 * violated rule's code, or null when the pair is acceptable: both promos must be
 * known, the godchild ({@link fillotLevel}) must be a strictly more recent
 * promotion than the godparent ({@link parrainLevel}), and they must be at most
 * {@link MAX_PROMO_GAP} years apart. Applies to both link kinds.
 */
export function checkPromoPair(
  parrainLevel: number | null,
  fillotLevel: number | null
): 'PROMO_UNKNOWN' | 'PROMO_ORDER' | 'PROMO_GAP' | null {
  if (parrainLevel === null || fillotLevel === null) {
    return 'PROMO_UNKNOWN';
  }
  if (fillotLevel <= parrainLevel) {
    return 'PROMO_ORDER';
  }
  if (fillotLevel - parrainLevel > MAX_PROMO_GAP) {
    return 'PROMO_GAP';
  }
  return null;
}
