import { error, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { generateAuthorizationUrl } from "$server/oidc";
import { randomBytes } from "crypto";

const STATE_COOKIE_NAME = "__oidc_state";
const NONCE_COOKIE_NAME = "__oidc_nonce";

/** Genere une chaine aleatoire base64url (state / nonce anti-CSRF). */
function generateRandomString(length: number): string {
  return randomBytes(length).toString("base64url");
}

/**
 * Demarre le flux OIDC : pose les cookies state/nonce puis redirige vers
 * l ecran d autorisation Authentik. Le redirect_uri pointe sur `/auth/callback`
 * (doit correspondre a l URI enregistree dans l app Authentik).
 */
export const GET: RequestHandler = ({ cookies, url }) => {
  let authUrl: string;
  try {
    const state = generateRandomString(32);
    const nonce = generateRandomString(32);

    const cookieOpts = {
      path: "/",
      maxAge: 600, // 10 minutes
      sameSite: "lax" as const,
      secure: true,
      httpOnly: true,
    };
    cookies.set(STATE_COOKIE_NAME, state, cookieOpts);
    cookies.set(NONCE_COOKIE_NAME, nonce, cookieOpts);

    const callbackUrl = new URL("/auth/callback", url.origin).toString();
    authUrl = generateAuthorizationUrl(callbackUrl, state, nonce);
  } catch (e) {
    console.error("[LOGIN] Erreur:", e);
    throw error(500, "Echec de la connexion");
  }

  throw redirect(302, authUrl);
};
