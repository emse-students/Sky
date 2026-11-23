/**
 * Sky opaque session cookie. The token (uuid) references a `sessions` row
 * resolved server-side (cf. database.ts); no signed data on the client. Shared
 * by the OIDC callback, the logout and `hooks.server.ts`.
 */
import type { Cookies } from '@sveltejs/kit';
import { createSession, deleteSession } from '#lib/server/database.js';

export const SESSION_COOKIE_NAME = 'sky_session';

/** Sets the session cookie (httpOnly, expires with the DB session). */
export function setSessionCookie(cookies: Cookies, token: string, expiresAt: number): void {
  cookies.set(SESSION_COOKIE_NAME, token, {
    path: '/',
    expires: new Date(expiresAt * 1000),
    sameSite: 'lax',
    secure: true,
    httpOnly: true,
  });
}

/** Clears the session cookie (logout). */
export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
}

/**
 * Opens the ordinary, UNMARKED session after a MiConnect sign-in (the callback, or the link choice
 * that follows one), replacing the session this browser presented: a session a Canari handoff
 * opened is MARKED and may change nothing, and signing in through MiConnect is exactly what lifts
 * that - so the marked row goes, rather than lingering beside the new one.
 */
export function openSignedInSession(cookies: Cookies, personId: string): void {
  const presented = cookies.get(SESSION_COOKIE_NAME);
  if (presented) {
    deleteSession(presented);
  }
  const session = createSession(personId);
  setSessionCookie(cookies, session.token, session.expiresAt);
}
