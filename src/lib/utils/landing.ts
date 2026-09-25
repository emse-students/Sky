/**
 * Where the map opens (user decision, 2026-09-25): a signed-in member whose account is linked to a
 * star lands ON that star - selected, its neighbourhood framed, its sheet at peek - rather than on
 * the whole-sky overview, which on a 393 px phone is a field of dots with no name. The fit button
 * is the way back to the whole sky.
 */

/** What the map does once the graph has loaded. */
export type Landing =
  /** Select this star and frame its neighbourhood, without animating. */
  | { kind: 'own-star'; id: string }
  /** Leave the view and the selection as they are. */
  | { kind: 'keep'; reason: 'signed-out' | 'selection-wins' | 'no-star' };

/** The facts the decision reads. */
export interface LandingInput {
  signedIn: boolean;
  /** The star the account is linked to, if any. */
  profileId: string | null | undefined;
  /** Whether that star is in the loaded graph with a position. */
  starPositioned: boolean;
  /** A selection already made (a search, any link that selected someone): it wins. */
  selectedId: string | null;
}

/**
 * Decide the landing. Signed out: nothing changes (the landing page). A selection already made
 * wins over the member's own star. No linked or positioned star: today's overview.
 */
export function decideLanding(input: LandingInput): Landing {
  if (!input.signedIn) return { kind: 'keep', reason: 'signed-out' };
  if (input.selectedId) return { kind: 'keep', reason: 'selection-wins' };
  if (!input.profileId || !input.starPositioned) return { kind: 'keep', reason: 'no-star' };
  return { kind: 'own-star', id: input.profileId };
}
