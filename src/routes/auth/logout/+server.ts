import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { deleteSession } from "$server/database";
import { SESSION_COOKIE_NAME, clearSessionCookie } from "$server/session";

/**
 * Ends the session: deletes the `sessions` row and the cookie, then redirects
 * home. Accepts GET and POST (plain link or form).
 */
function handleLogout(cookies: import("@sveltejs/kit").Cookies): never {
  const token = cookies.get(SESSION_COOKIE_NAME);
  if (token) {
    deleteSession(token);
  }
  clearSessionCookie(cookies);
  throw redirect(302, "/");
}

export const GET: RequestHandler = ({ cookies }) => handleLogout(cookies);
export const POST: RequestHandler = ({ cookies }) => handleLogout(cookies);
