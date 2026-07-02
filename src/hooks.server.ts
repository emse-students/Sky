import { redirect, json, type Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { getSessionPerson } from "$server/database";
import { SESSION_COOKIE_NAME } from "$server/session";
import { paraglideMiddleware } from "$lib/paraglide/server";
import { m } from "$lib/paraglide/messages";

/**
 * Binds the request locale (resolved from the cookie / Accept-Language header,
 * falling back to fr) to the server-side async context so that `m.*()` renders
 * in the right language during SSR, and injects it into the <html lang> tag.
 */
const paraglideHandler: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request, locale }) => {
    event.request = request;
    return resolve(event, {
      transformPageChunk: ({ html }) =>
        html.replace("%paraglide.lang%", locale),
    });
  });

/**
 * Routes reachable without a session. `/` (the landing with the Login button) and
 * `/unauthorized` are public on an EXACT match; the others are prefixes (login
 * flow, health probe, avatar proxy called by <img>). Static files (_app, assets)
 * are served before the hook. Like Canari, the public landing avoids the silent
 * re-login loop after logout (the Authentik SSO session is not killed: one-click
 * reconnect).
 */
const PUBLIC_EXACT = new Set(["/", "/unauthorized"]);
// `/api/external/` is protected by its own key (SKY_API_KEY), not the ICM
// session: it is consumed by Canari (server to server).
const PUBLIC_PREFIXES = [
  "/auth/",
  "/api/health",
  "/api/avatar/",
  "/api/external/",
];

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

/**
 * Resolve the opaque session (cookie -> sessions table -> people record) and
 * populate `event.locals.user`. No redirect here: resolution only.
 */
const sessionHandler: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get(SESSION_COOKIE_NAME);
  const person = token ? getSessionPerson(token) : null;

  if (person) {
    event.locals.user = {
      id: person.id,
      profile_id: person.id,
      auth_sub: person.auth_sub,
      name: `${person.nom.toUpperCase()} ${person.prenom}`.trim(),
      email: person.email,
      role: person.role === "admin" ? "admin" : "user",
      formation: person.formation,
      promo: person.level,
      image: person.image,
    };
  } else {
    event.locals.user = null;
  }
  return resolve(event);
};

/**
 * Global gate: all of Sky is reserved for ICM. No session -> redirect to login
 * (or 401 on an API route). Non-ICM, non-admin session -> refusal page (defense
 * in depth: the OIDC callback already gates at login).
 */
const gateHandler: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;
  if (isPublic(pathname)) {
    return resolve(event);
  }

  const user = event.locals.user;
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return json({ error: m.api_unauthenticated() }, { status: 401 });
    }
    throw redirect(302, "/auth/login");
  }

  if (user.formation !== "ICM" && user.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return json({ error: m.api_icm_only() }, { status: 403 });
    }
    throw redirect(302, "/unauthorized");
  }

  return resolve(event);
};

export const handle = sequence(paraglideHandler, sessionHandler, gateHandler);
