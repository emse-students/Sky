import { error, redirect, isRedirect, isHttpError } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { completeOIDCFlow } from "$server/oidc";
import {
  linkOrCreateAuthPerson,
  createSession,
  deleteExpiredSessions,
  type OidcIdentity,
} from "$server/database";
import { setSessionCookie } from "$server/session";

const STATE_COOKIE_NAME = "__oidc_state";
const NONCE_COOKIE_NAME = "__oidc_nonce";

/** Vrai si le sub fait partie de la liste d admins SKY_ADMIN_SUBS (virgules). */
function isAdminSub(sub: string): boolean {
  return (process.env.SKY_ADMIN_SUBS || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .includes(sub);
}

/**
 * Retour Authentik : valide le state, deroule le flux OIDC, applique le gate ICM
 * (seuls les ICM et les admins entrent), relie/cree la fiche `people`, ouvre une
 * session et pose le cookie. Un non-ICM non-admin est renvoye vers `/unauthorized`
 * sans session.
 */
export const GET: RequestHandler = async ({ cookies, url }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    console.error("[CALLBACK] Code d autorisation manquant");
    throw error(400, "Code d autorisation manquant");
  }
  if (!state) {
    console.error("[CALLBACK] Parametre state manquant");
    throw error(400, "Parametre state manquant");
  }
  if (state !== cookies.get(STATE_COOKIE_NAME)) {
    console.error("[CALLBACK] State invalide");
    throw error(400, "Validation du state echouee");
  }

  let personId: string;
  let expiresAt: number;
  let token: string;
  try {
    const callbackUrl = new URL("/auth/callback", url.origin).toString();
    const claims = await completeOIDCFlow(code, callbackUrl);
    if (!claims) {
      console.error("[CALLBACK] Flux OIDC echoue");
      throw error(500, "Authentification echouee");
    }

    cookies.delete(STATE_COOKIE_NAME, { path: "/" });
    cookies.delete(NONCE_COOKIE_NAME, { path: "/" });

    const role = isAdminSub(claims.sub) ? "admin" : "user";

    // Gate ICM : Sky est reserve a la formation ICM (les admins passent aussi).
    if (claims.formation !== "ICM" && role !== "admin") {
      console.warn(
        `[CALLBACK] Acces refuse (non-ICM): sub=${claims.sub} formation=${claims.formation ?? "null"}`,
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

    personId = linkOrCreateAuthPerson(identity);
    deleteExpiredSessions();
    const session = createSession(personId);
    token = session.token;
    expiresAt = session.expiresAt;
    console.debug(`[CALLBACK] Session ouverte pour ${personId} (role=${role})`);
  } catch (e) {
    // Le gate ICM (redirect) et les error() sont jetes comme objets SvelteKit :
    // les relancer tels quels au lieu de les transformer en 500.
    if (isRedirect(e) || isHttpError(e)) {
      throw e;
    }
    console.error("[CALLBACK] Erreur durant l authentification:", e);
    throw error(500, "Erreur d authentification");
  }

  setSessionCookie(cookies, token, expiresAt);
  throw redirect(302, "/");
};
