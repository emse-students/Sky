/**
 * THE STEP-UP - the decisive answer to login CSRF through the Canari sign-in handoff
 * (docs/wiki/authentication.md, "Signed in from Canari").
 *
 * A handoff token can be minted by anyone with a Canari account and carried to a victim's browser,
 * which then holds a session AS THE ATTACKER. So a session a handoff opened (`via_handoff`) may
 * BROWSE and may change NOTHING - no record linking (`/account` relink), no relative or
 * relationship added, edited or removed, no admin edit, merge, import or recompute - until the
 * user signs in through MiConnect in this browser, which names who is signing in and replaces the
 * marked session with an unmarked one (`/auth/callback`, `/auth/link`).
 *
 * DEFAULT DENY: every state-changing request from a marked session is refused, whatever its path -
 * a form action is a POST to its page - except the short list below of requests that write nothing
 * into the account the session names. A route added tomorrow is guarded without anyone remembering
 * to guard it; `tests/step-up.test.ts` enumerates every state-changing route and fails on an
 * exemption that names no route.
 */
import { STEP_UP_CODE, STEP_UP_HEADER, STEP_UP_LOGIN_PATH } from '#lib/step-up.js';

/** The methods that change state. GET, HEAD and OPTIONS never do here. */
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The requests a marked session may still make, each with why it writes nothing that matters.
 * Exact paths, never prefixes.
 */
export const STEP_UP_EXEMPT: ReadonlyMap<string, string> = new Map([
  ['/auth/logout', 'ends the session - the way out must always be open'],
  ['/api/auth/handoff', 'the redemption itself, which replaces the session it finds'],
  [
    '/auth/link',
    'acts on the identity a MiConnect sign-in has JUST proved (its pending cookie), never on the session it finds, which it replaces',
  ],
  ['/api/csp-report', 'a browser reports a policy violation: nothing is stored, only logged'],
]);

/** Whether this request must be refused until the user signs in through MiConnect. */
export function stepUpRequired(method: string, pathname: string, viaHandoff: boolean): boolean {
  return viaHandoff && STATE_CHANGING.has(method.toUpperCase()) && !STEP_UP_EXEMPT.has(pathname);
}

/**
 * The refusal, in the shape the caller can act on: a form action submitted by `use:enhance`
 * (`x-sveltekit-action`) gets an ActionResult REDIRECT, which SvelteKit follows; a form posted
 * without JavaScript (a document request) a 303 to the sign-in; a `fetch` a `403` the client's fetch
 * wrapper recognises by its header (`#lib/step-up.js`). Every one carries the header, so the client
 * wrapper sends the page to MiConnect whatever the caller does with the answer.
 */
export function stepUpResponse(request: Request): Response {
  const headers = { [STEP_UP_HEADER]: '1', 'cache-control': 'no-store' };
  if (request.headers.get('x-sveltekit-action') === 'true') {
    return new Response(
      JSON.stringify({ type: 'redirect', status: 303, location: STEP_UP_LOGIN_PATH }),
      { status: 200, headers: { ...headers, 'content-type': 'application/json' } }
    );
  }
  if ((request.headers.get('accept') ?? '').includes('text/html')) {
    return new Response(null, {
      status: 303,
      headers: { ...headers, location: STEP_UP_LOGIN_PATH },
    });
  }
  return new Response(JSON.stringify({ code: STEP_UP_CODE }), {
    status: 403,
    headers: { ...headers, 'content-type': 'application/json' },
  });
}
