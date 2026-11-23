/**
 * WHO MAY ENTER SKY - the one decision every way in asks, so the paths cannot drift: the MiConnect
 * callback (on the claims it just verified), the Canari sign-in handoff (on the linked record, F1),
 * and `gateHandler` on every request (on the session's record). Sky is the ICM sponsorship tree:
 * an ICM member gets in, and so does an admin, whatever the formation.
 */

/** True if the sub is on the SKY_ADMIN_SUBS bootstrap list (comma-separated). */
export function isAdminSub(sub: string): boolean {
  return (process.env.SKY_ADMIN_SUBS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .includes(sub);
}

/**
 * The role a sign-in gives: admin when the env bootstraps it OR the database already says so - the
 * database stays the source of truth, so an admin promoted there is never demoted at a sign-in.
 */
export function roleAtSignIn(sub: string, storedRole: string | null): 'admin' | 'user' {
  return isAdminSub(sub) || storedRole === 'admin' ? 'admin' : 'user';
}

/** The ICM gate: Sky is reserved for the ICM formation, and admins pass. */
export function admits(formation: string | null, role: string): boolean {
  return formation === 'ICM' || role === 'admin';
}
