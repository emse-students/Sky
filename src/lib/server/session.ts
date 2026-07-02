/**
 * Sky opaque session cookie. The token (uuid) references a `sessions` row
 * resolved server-side (cf. database.ts); no signed data on the client. Shared
 * by the OIDC callback, the logout and `hooks.server.ts`.
 */
import type { Cookies } from "@sveltejs/kit";

export const SESSION_COOKIE_NAME = "sky_session";

/** Sets the session cookie (httpOnly, expires with the DB session). */
export function setSessionCookie(
  cookies: Cookies,
  token: string,
  expiresAt: number,
): void {
  cookies.set(SESSION_COOKIE_NAME, token, {
    path: "/",
    expires: new Date(expiresAt * 1000),
    sameSite: "lax",
    secure: true,
    httpOnly: true,
  });
}

/** Clears the session cookie (logout). */
export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
}
