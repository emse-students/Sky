import { json, type RequestHandler } from '@sveltejs/kit';
import { redeemHandoff } from '#lib/server/handoff/redeem.js';
import { SESSION_COOKIE_NAME, setSessionCookie } from '#lib/server/session.js';

/**
 * POST /api/auth/handoff - redeems a Canari sign-in handoff token (`#lib/server/handoff/redeem.js`).
 * Same origin, JSON `{ token, confirm? }`; answers the outcome the landing page acts on. Never a GET,
 * never a query string: the token travels in the body only.
 */
export const POST: RequestHandler = async ({ request, url, cookies, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }
  const token = cookies.get(SESSION_COOKIE_NAME);
  const result = await redeemHandoff({
    origin: request.headers.get('origin'),
    ownOrigin: url.origin,
    contentType: request.headers.get('content-type'),
    body,
    current: locals.user && token ? { token, user: locals.user } : null,
  });
  if (result.session) {
    setSessionCookie(cookies, result.session.token, result.session.expiresAt);
  }
  return json(result.body, { status: result.status, headers: { 'cache-control': 'no-store' } });
};
