/**
 * Cookie de session opaque Sky. Le token (uuid) reference une ligne `sessions`
 * resolue cote serveur (cf. database.ts) ; aucune donnee signee cote client.
 * Partage par le callback OIDC, le logout et `hooks.server.ts`.
 */
import type { Cookies } from "@sveltejs/kit";

export const SESSION_COOKIE_NAME = "sky_session";

/** Pose le cookie de session (httpOnly, expire avec la session en base). */
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

/** Supprime le cookie de session (logout). */
export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
}
