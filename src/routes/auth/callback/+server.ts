import { error, redirect, isRedirect, isHttpError } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { completeOIDCFlow } from "$server/oidc";
import {
  resolveLogin,
  createPendingLink,
  createSession,
  deleteExpiredSessions,
  deleteExpiredPendingLinks,
  getPersonRoleByAuthSub,
  recalculatePositions,
  type OidcIdentity,
} from "$server/database";
import { setSessionCookie } from "$server/session";
import { PENDING_COOKIE_NAME } from "$server/link";
import { m } from "$lib/paraglide/messages";

const STATE_COOKIE_NAME = "__oidc_state";
const NONCE_COOKIE_NAME = "__oidc_nonce";

/** True if the sub is part of the SKY_ADMIN_SUBS admin list (comma-separated). */
function isAdminSub(sub: string): boolean {
  return (process.env.SKY_ADMIN_SUBS || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .includes(sub);
}

/**
 * Authentik return: validates the state, runs the OIDC flow, applies the ICM gate
 * (only ICM and admins get in), links/creates the `people` record, opens a session
 * and sets the cookie. A non-ICM non-admin is redirected to `/unauthorized`
 * without a session.
 */
export const GET: RequestHandler = async ({ cookies, url }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    console.error("[CALLBACK] Authorization code missing");
    throw error(400, m.api_oidc_code_missing());
  }
  if (!state) {
    console.error("[CALLBACK] State parameter missing");
    throw error(400, m.api_oidc_state_missing());
  }
  if (state !== cookies.get(STATE_COOKIE_NAME)) {
    console.error("[CALLBACK] Invalid state");
    throw error(400, m.api_oidc_state_invalid());
  }

  try {
    const callbackUrl = new URL("/auth/callback", url.origin).toString();
    const claims = await completeOIDCFlow(code, callbackUrl);
    if (!claims) {
      console.error("[CALLBACK] OIDC flow failed");
      throw error(500, m.api_auth_failed());
    }

    cookies.delete(STATE_COOKIE_NAME, { path: "/" });
    cookies.delete(NONCE_COOKIE_NAME, { path: "/" });

    // Role source of truth: the database. The SKY_ADMIN_SUBS env only bootstraps;
    // an admin promoted in the DB is never demoted at login.
    const role =
      isAdminSub(claims.sub) || getPersonRoleByAuthSub(claims.sub) === "admin"
        ? "admin"
        : "user";

    // ICM gate: Sky is reserved for the ICM formation (admins also pass).
    if (claims.formation !== "ICM" && role !== "admin") {
      console.warn(
        `[CALLBACK] Access denied (non-ICM): sub=${claims.sub} formation=${claims.formation ?? "null"}`,
      );
      throw redirect(302, "/unauthorized");
    }

    const identity: OidcIdentity = {
      sub: claims.sub,
      firstName: claims.firstName,
      lastName: claims.lastName,
      level: claims.promo,
      email: claims.email,
      formation: claims.formation,
      role,
    };

    deleteExpiredSessions();
    deleteExpiredPendingLinks();

    const resolution = resolveLogin(identity);
    if (resolution.kind === "choice") {
      // Several possible records: ask the user to choose.
      const pendingToken = createPendingLink(identity);
      cookies.set(PENDING_COOKIE_NAME, pendingToken, {
        path: "/",
        maxAge: 60 * 15,
        sameSite: "lax",
        secure: true,
        httpOnly: true,
      });
      console.debug(
        `[CALLBACK] ${resolution.candidates.length} candidates for ${claims.sub} -> /auth/link`,
      );
      throw redirect(302, "/auth/link");
    }

    // A brand-new account fiche has no position yet: recompute so the new star
    // appears on the map. Best-effort (never blocks login); failures are logged
    // and recorded in the positions status.
    if (resolution.created) {
      recalculatePositions().catch((err) =>
        console.error("[CALLBACK] Position recompute failed:", err),
      );
    }

    const session = createSession(resolution.personId);
    setSessionCookie(cookies, session.token, session.expiresAt);
    console.debug(
      `[CALLBACK] Session opened for ${resolution.personId} (role=${role})`,
    );
    throw redirect(302, "/");
  } catch (e) {
    // Redirects (link choice, success, ICM gate) and error() are thrown as
    // SvelteKit objects: rethrow them as-is.
    if (isRedirect(e) || isHttpError(e)) {
      throw e;
    }
    console.error("[CALLBACK] Error during authentication:", e);
    throw error(500, m.api_auth_failed());
  }
};
