/**
 * Flux OIDC Authentik (miconnect) pour Sky.
 *
 * Porte du module equivalent de MiGallery : meme instance Authentik, memes
 * claims (`sub, given_name/family_name, email, promo, formation`). Ce module est
 * volontairement sans acces base de donnees : il renvoie une identite brute
 * (`OidcClaims`) que le callback relie a une fiche `people` via la cle
 * quasi-unique (nom, prenom, promotion). La photo de profil vient de l API
 * MiGallery (`/api/avatar/{sub}`), pas du claim `picture` (non utilise).
 */

/** Reponse du endpoint /token/ d Authentik. */
interface OidcToken {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Profil brut renvoye par /userinfo/ (claims arbitraires inclus). Cette instance
 * miconnect expose le prenom/nom en claims custom `firstName`/`lastName`
 * (camelCase, comme les lit Canari) ; les `given_name`/`family_name` standards ne
 * sont qu un repli (et peuvent contenir le nom complet sur certains comptes).
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
 * Identite resolue depuis le SSO, prete a etre reliee a une fiche `people`.
 * `promo` correspond a la colonne `level`.
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
 * Base Authentik sans slash final (ex: https://auth.canari-emse.fr). Comme
 * Canari, les endpoints sont a un chemin global `/application/o/<endpoint>/` :
 * le slug de l app n apparait que dans l issuer des tokens, pas dans les URLs
 * d endpoint (un chemin slugge `/o/<slug>/authorize/` renvoie 404 sous Authentik).
 */
function getBaseUrl(): string {
  return (process.env.MICONNECT_BASE_URL || "").trim().replace(/\/+$/, "");
}

function trimmedOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/** Convertit une promo (string ou number) en entier, sinon null. */
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

/** Decode la charge utile d un JWT (sans verification de signature, parsing seul). */
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
    console.error("[OIDC] Echec du decodage JWT:", e);
    return null;
  }
}

/** Echange le code d autorisation contre des tokens. */
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
        "[OIDC] Echange de code echoue:",
        response.status,
        await response.text(),
      );
      return null;
    }
    return (await response.json()) as OidcToken;
  } catch (e) {
    console.error("[OIDC] Erreur a l echange de code:", e);
    return null;
  }
}

/** Recupere le profil utilisateur via /userinfo/. */
async function fetchUserProfile(
  accessToken: string,
): Promise<OidcProfile | null> {
  try {
    const response = await fetch(`${getBaseUrl()}/application/o/userinfo/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      console.error(
        "[OIDC] Recuperation userinfo echouee:",
        response.status,
        await response.text(),
      );
      return null;
    }
    return (await response.json()) as OidcProfile;
  } catch (e) {
    console.error("[OIDC] Echec de recuperation du profil:", e);
    return null;
  }
}

/** Construit l URL d autorisation Authentik (debut du flux). */
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
 * Deroule le flux OIDC : code -> tokens -> profil. Renvoie l identite resolue
 * (claims). La promo/formation sont lues sur le profil userinfo, completees si
 * besoin par les claims de l id_token. Renvoie null si une etape echoue.
 */
export async function completeOIDCFlow(
  code: string,
  redirectUri: string,
): Promise<OidcClaims | null> {
  const tokens = await exchangeCodeForTokens(code, redirectUri);
  if (!tokens) {
    console.error("[OIDC] Flux interrompu a l echange de code");
    return null;
  }

  const profile = await fetchUserProfile(tokens.access_token);
  if (!profile) {
    console.error("[OIDC] Flux interrompu a la recuperation du profil");
    return null;
  }

  const sub = trimmedOrNull(profile.sub);
  if (!sub) {
    console.error("[OIDC] Aucun claim sub dans le profil");
    return null;
  }

  // Certains claims (promo/formation) peuvent n etre que dans l id_token.
  const idClaims = decodeJWT(tokens.id_token) || {};

  // Cette instance fournit firstName/lastName (camelCase) ; given_name/family_name
  // en repli (peuvent contenir le nom complet -> a eviter en priorite). Si l un
  // des deux manque, on derive du claim `name` (nom complet) pour ne jamais
  // afficher un id brut a la place du nom (cf. getPersonName).
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
  firstName = firstName ?? "";
  lastName = lastName ?? "";
  const promo = parsePromo(profile.promo ?? idClaims.promo);
  const formation =
    trimmedOrNull(profile.formation) ?? trimmedOrNull(idClaims.formation);

  console.debug(
    `[OIDC] Login: sub=${sub} nom=${lastName} prenom=${firstName} promo=${promo ?? "null"} formation=${formation ?? "null"}`,
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
