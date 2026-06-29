import { redirect, json, type Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { getSessionPerson } from "$server/database";
import { SESSION_COOKIE_NAME } from "$server/session";

/**
 * Routes accessibles sans session. `/` (la landing avec le bouton Connexion) et
 * `/unauthorized` sont publiques en correspondance EXACTE ; les autres sont des
 * prefixes (flux de connexion, sonde de sante, proxy d avatars appele par <img>).
 * Les fichiers statiques (_app, assets) sont servis avant le hook. Comme Canari,
 * la landing publique evite la boucle de re-login silencieux apres deconnexion
 * (la session SSO Authentik n est pas tuee : reconnexion en un clic).
 */
const PUBLIC_EXACT = new Set(["/", "/unauthorized"]);
const PUBLIC_PREFIXES = ["/auth/", "/api/health", "/api/avatar/"];

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

/**
 * Resout la session opaque (cookie -> table sessions -> fiche people) et peuple
 * `event.locals.user`. Aucune redirection ici : seulement la resolution.
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
 * Gate global : tout Sky est reserve aux ICM. Sans session -> redirection vers la
 * connexion (ou 401 sur une route API). Session non-ICM et non-admin -> page de
 * refus (defense en profondeur : le callback OIDC gate deja a la connexion).
 */
const gateHandler: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;
  if (isPublic(pathname)) {
    return resolve(event);
  }

  const user = event.locals.user;
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return json({ error: "Non authentifie" }, { status: 401 });
    }
    throw redirect(302, "/auth/login");
  }

  if (user.formation !== "ICM" && user.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return json({ error: "Reserve aux ICM" }, { status: 403 });
    }
    throw redirect(302, "/unauthorized");
  }

  return resolve(event);
};

export const handle = sequence(sessionHandler, gateHandler);
