/**
 * THE ONE DEADLINE EVERY OUTBOUND CALL FROM THIS SERVER ANSWERS TO.
 *
 * `fetch` has no default timeout. Not one of Sky's four server-to-server calls - MiGallery for a
 * photo, Canari for a profile, Authentik twice during login - carried a deadline of its own, so an
 * upstream that accepted the connection and then said nothing held a Node connection open for as
 * long as it cared to, and the request behind it waited with it. Nothing recovers from that: there
 * is no error to catch and no fallback to reach, only a page that never finishes.
 *
 * One number rather than four, because a budget that differs per call site is a budget nobody can
 * state. It is deliberately the same 4 s Canari's avatar proxy uses, so a slow MiGallery degrades
 * at the same moment everywhere it is read.
 *
 * Use as `signal: AbortSignal.timeout(OUTBOUND_BUDGET_MS)` at the call, so the abort is visible
 * where the request is written - and remember that it surfaces as a THROW (`TimeoutError`), never
 * as a status, so the catch is what has to say the upstream was unreachable.
 */
export const OUTBOUND_BUDGET_MS = 4000;
