import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateAuthorizationUrl, getIssuerOrigin } from '#lib/server/oidc.js';
import { randomBytes } from 'crypto';
import { m } from '#lib/paraglide/messages.js';

const STATE_COOKIE_NAME = '__oidc_state';
const NONCE_COOKIE_NAME = '__oidc_nonce';

/** Generates a random base64url string (anti-CSRF state / nonce). */
function generateRandomString(length: number): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Starts the OIDC flow: sets the state/nonce cookies then redirects to the
 * Authentik authorization screen. The redirect_uri points to `/auth/callback`
 * (must match the URI registered in the Authentik app).
 */
export const GET: RequestHandler = ({ cookies, url }) => {
  let authUrl: string;
  let issuerOrigin: string;
  try {
    const state = generateRandomString(32);
    const nonce = generateRandomString(32);

    const cookieOpts = {
      path: '/',
      maxAge: 600, // 10 minutes
      sameSite: 'lax' as const,
      secure: true,
      httpOnly: true,
    };
    cookies.set(STATE_COOKIE_NAME, state, cookieOpts);
    cookies.set(NONCE_COOKIE_NAME, nonce, cookieOpts);

    const callbackUrl = new URL('/auth/callback', url.origin).toString();
    authUrl = generateAuthorizationUrl(callbackUrl, state, nonce);
    issuerOrigin = getIssuerOrigin();
  } catch (e) {
    console.error('[LOGIN] Error:', e);
    throw error(500, m.api_login_failed());
  }

  // The one external redirect in Sky: SvelteKit 3 refuses it without this allowlist (a 500).
  throw redirect(302, authUrl, { external: [issuerOrigin] });
};
