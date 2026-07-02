/**
 * Authentik (miconnect) OIDC flow for Sky.
 *
 * Ported from MiGallery's equivalent module: same Authentik instance, same
 * claims (`sub, given_name/family_name, email, promo, formation`). This module
 * is deliberately database-free: it returns a raw identity (`OidcClaims`) that
 * the callback links to a `people` record via the quasi-unique key (last name,
 * first name, class). The profile picture comes from the MiGallery API
 * (`/api/avatar/{sub}`), not from the `picture` claim (unused).
 */

import { formatFirstName, formatLastName } from "$utils/format";

/** Response of Authentik's /token/ endpoint. */
interface OidcToken {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Raw profile returned by /userinfo/ (arbitrary claims included). This miconnect
 * instance exposes first/last name in custom claims `firstName`/`lastName`
 * (camelCase, as Canari reads them); the standard `given_name`/`family_name` are
 * only a fallback (and may hold the full name on some accounts).
 */
interface OidcProfile {
  sub?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  promo?: string | number;
  formation?: string;
  [key: string]: unknown;
}

/**
 * Identity resolved from the SSO, ready to be linked to a `people` record.
 * `promo` maps to the `level` column.
 */
export interface OidcClaims {
  sub: string;
  firstName: string;
  lastName: string;
  email: string | null;
  promo: number | null;
  formation: string | null;
}

/**
 * Authentik base without trailing slash (e.g. https://auth.canari-emse.fr). As
 * in Canari, endpoints live at a global path `/application/o/<endpoint>/`: the
 * app slug only appears in the token issuer, not in the endpoint URLs (a slugged
 * path `/o/<slug>/authorize/` returns 404 under Authentik).
 */
function getBaseUrl(): string {
  return (process.env.MICONNECT_BASE_URL || "").trim().replace(/\/+$/, "");
}

function trimmedOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/** Converts a class value (string or number) to an integer, else null. */
function parsePromo(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Decodes a JWT payload (no signature verification, parsing only). */
function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const parsed: unknown = JSON.parse(atob(padded));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch (e) {
    console.error("[OIDC] JWT decoding failed:", e);
    return null;
  }
}

/** Exchanges the authorization code for tokens. */
async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<OidcToken | null> {
  try {
    const response = await fetch(`${getBaseUrl()}/application/o/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.MICONNECT_CLIENT_ID || "",
        client_secret: process.env.MICONNECT_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!response.ok) {
      console.error(
        "[OIDC] Code exchange failed:",
        response.status,
        await response.text(),
      );
      return null;
    }
    return (await response.json()) as OidcToken;
  } catch (e) {
    console.error("[OIDC] Error during code exchange:", e);
    return null;
  }
}

/** Fetches the user profile via /userinfo/. */
async function fetchUserProfile(
  accessToken: string,
): Promise<OidcProfile | null> {
  try {
    const response = await fetch(`${getBaseUrl()}/application/o/userinfo/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      console.error(
        "[OIDC] userinfo fetch failed:",
        response.status,
        await response.text(),
      );
      return null;
    }
    return (await response.json()) as OidcProfile;
  } catch (e) {
    console.error("[OIDC] Profile fetch failed:", e);
    return null;
  }
}

/** Builds the Authentik authorization URL (start of the flow). */
export function generateAuthorizationUrl(
  redirectUri: string,
  state: string,
  nonce: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.MICONNECT_CLIENT_ID || "",
    redirect_uri: redirectUri,
    scope: "openid profile promo name formation",
    state,
    nonce,
  });
  return `${getBaseUrl()}/application/o/authorize/?${params.toString()}`;
}

/**
 * Runs the OIDC flow: code -> tokens -> profile. Returns the resolved identity
 * (claims). Class/formation are read from the userinfo profile, completed if
 * needed from the id_token claims. Returns null if any step fails.
 */
export async function completeOIDCFlow(
  code: string,
  redirectUri: string,
): Promise<OidcClaims | null> {
  const tokens = await exchangeCodeForTokens(code, redirectUri);
  if (!tokens) {
    console.error("[OIDC] Flow aborted at code exchange");
    return null;
  }

  const profile = await fetchUserProfile(tokens.access_token);
  if (!profile) {
    console.error("[OIDC] Flow aborted at profile fetch");
    return null;
  }

  const sub = trimmedOrNull(profile.sub);
  if (!sub) {
    console.error("[OIDC] No sub claim in the profile");
    return null;
  }

  // Some claims (promo/formation) may live only in the id_token.
  const idClaims = decodeJWT(tokens.id_token) || {};

  // This instance provides firstName/lastName (camelCase); given_name/family_name
  // as a fallback (may hold the full name -> avoid when possible). If either is
  // missing, derive from the `name` claim (full name) so a raw id is never shown
  // in place of the name (cf. getPersonName).
  let firstName =
    trimmedOrNull(profile.firstName) ?? trimmedOrNull(profile.given_name);
  let lastName =
    trimmedOrNull(profile.lastName) ?? trimmedOrNull(profile.family_name);
  if (!firstName || !lastName) {
    const full =
      trimmedOrNull(profile.name) ??
      trimmedOrNull(idClaims.name) ??
      trimmedOrNull(profile.given_name);
    const parts = full ? full.split(/\s+/) : [];
    if (parts.length > 0) {
      firstName = firstName ?? parts[0];
      lastName = lastName ?? (parts.length > 1 ? parts.slice(1).join(" ") : "");
    }
  }
  // Canonical "NOM Prenom" display format stored in the database (MiConnect is
  // source of truth on every login), for consistent casing in admin and the tree.
  firstName = formatFirstName(firstName ?? "");
  lastName = formatLastName(lastName ?? "");
  const promo = parsePromo(profile.promo ?? idClaims.promo);
  const formation =
    trimmedOrNull(profile.formation) ?? trimmedOrNull(idClaims.formation);

  console.debug(
    `[OIDC] Login: sub=${sub} lastName=${lastName} firstName=${firstName} promo=${promo ?? "null"} formation=${formation ?? "null"}`,
  );

  return {
    sub,
    firstName,
    lastName,
    email: trimmedOrNull(profile.email),
    promo,
    formation,
  };
}
