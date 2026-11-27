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
 * Promotion-year gap beyond which linking a godparent and a godchild raises a WARNING (not a
 * refusal). Owner decision 2026-11-27: the gap and the order are soft rules, "so as not to
 * block the future".
 */
export const MAX_PROMO_GAP = 3;

/** Codes of the SOFT promo rules: the link is created only once the caller acknowledged them. */
export const PROMO_WARNING_CODES = ['PROMO_ORDER', 'PROMO_GAP'] as const;

/** A soft promo rule that was tripped. */
export type PromoWarningCode = (typeof PROMO_WARNING_CODES)[number];

/** Type guard: is `code` one of the acknowledgeable promo warnings? */
export function isPromoWarningCode(code: unknown): code is PromoWarningCode {
  return (PROMO_WARNING_CODES as readonly unknown[]).includes(code);
}

/**
 * True if a promotion year is acceptable as user input: either unknown (null) or
 * an integer not before the school's founding year ({@link MIN_PROMO}). The
 * required-ness of the field is enforced separately by the callers.
 */
export function isValidPromo(level: number | null): boolean {
  return level === null || (Number.isInteger(level) && level >= MIN_PROMO);
}

/**
 * Check the promotions of a would-be godparent/godchild pair. Returns `'PROMO_UNKNOWN'` (HARD:
 * both promos must be known), a {@link PromoWarningCode} (SOFT: the link is allowed once the
 * caller acknowledged it) or null when the pair is fine. The same promotion is valid; a godchild
 * (`fillotLevel`) OLDER than the godparent (`parrainLevel`) is `PROMO_ORDER`; more than
 * {@link MAX_PROMO_GAP} years younger is `PROMO_GAP`. The two warnings are mutually exclusive.
 * Applies to both link kinds.
 */
export function checkPromoPair(
  parrainLevel: number | null,
  fillotLevel: number | null
): 'PROMO_UNKNOWN' | PromoWarningCode | null {
  if (parrainLevel === null || fillotLevel === null) {
    return 'PROMO_UNKNOWN';
  }
  if (fillotLevel < parrainLevel) {
    return 'PROMO_ORDER';
  }
  if (fillotLevel - parrainLevel > MAX_PROMO_GAP) {
    return 'PROMO_GAP';
  }
  return null;
}
