# Authentication

Sky authenticates through **Authentik** (the shared "miconnect" instance, also
used by Canari and MiGallery) via OpenID Connect. There is no local password
store: a session is an opaque server token that points at a `people` row.

## The OIDC flow

The client-side flow lives in `src/lib/server/oidc.ts` (transport) and the two
route handlers `auth/login` and `auth/callback` (orchestration).

1. **Start** (`GET /auth/login`, `auth/login/+server.ts`): generate a random
   `state` and `nonce` (base64url, 32 bytes), store them in short-lived cookies
   (`__oidc_state`, `__oidc_nonce`, 10 min, httpOnly), and redirect to Authentik
   with `generateAuthorizationUrl(callbackUrl, state, nonce)`. Scopes:
   `openid profile promo name formation`. The `redirect_uri` is
   `<origin>/auth/callback` and must match the URI registered in the Authentik
   app.

2. **Return** (`GET /auth/callback`, `auth/callback/+server.ts`):
   - Validate `code` and `state` (the latter against the `__oidc_state` cookie).
   - `completeOIDCFlow(code, callbackUrl)` exchanges the code for tokens, calls
     `/userinfo/`, and returns `OidcClaims`
     (`sub, firstName, lastName, email, promo, formation`).
   - Apply the **ICM gate** (below).
   - Resolve the identity to a `people` record (see
     [identity-model.md](identity-model.md)).
   - Open a session and set the cookie; redirect to `/`.

### Endpoints and base URL

`getBaseUrl()` reads `MICONNECT_BASE_URL` (default `https://auth.canari-emse.fr`)
and strips the trailing slash. As on Canari, the endpoints are at a global path,
not under the app slug:

```
<base>/application/o/authorize/
<base>/application/o/token/
<base>/application/o/userinfo/
```

The app slug only appears in the token issuer, never in the endpoint URL (a
slugged `/o/<slug>/authorize/` returns 404 under Authentik).

### Claim handling

This Authentik instance exposes the first/last name as custom camelCase claims
`firstName`/`lastName` (as Canari reads them); the standard `given_name`/
`family_name` are only a fallback and may hold the full name on some accounts.
If either name is missing, `completeOIDCFlow` derives it from the `name` claim so
a raw id is never shown in place of a name. Names are then canonicalized with
`formatLastName` ("NOM" uppercase) and `formatFirstName` ("Prenom" capitalized).
`promo` is parsed to an integer (stored as `people.level`); `promo`/`formation`
may live only in the id_token, so both the userinfo profile and the decoded
id_token are consulted.

MiConnect is treated as the source of truth for identity on every login:
`refreshPersonIdentity` overwrites the linked record's name/promo/formation/email
each time.

## The ICM gate

Sky is reserved for the ICM formation. In the callback:

```
role = isAdminSub(sub) || getPersonRoleByAuthSub(sub) === "admin" ? "admin" : "user"
if (claims.formation !== "ICM" && role !== "admin") -> redirect /unauthorized
```

Non-ICM, non-admin users are redirected to `/unauthorized` **without a session**.
The same rule is re-checked on every request by `gateHandler` (see
[architecture.md](architecture.md)) as defense in depth.

## Sessions

Sessions are opaque and server-resolved; nothing signed is stored client-side.

- **Table**: `sessions(token TEXT PK, person_id TEXT, expires_at INTEGER)` in
  `sky.db`. `createSession(personId)` mints a `randomUUID` token valid 7 days.
- **Cookie**: `sky_session` (`SESSION_COOKIE_NAME` in `session.ts`), httpOnly,
  secure, `sameSite=lax`, `expires` matched to the DB row.
- **Resolution**: `getSessionPerson(token)` joins `sessions` to `people` and is
  called by `sessionHandler` on every request.
- **Logout** (`auth/logout`): `deleteSession(token)` + clear the cookie. Both GET
  and POST are accepted (plain link or form). The Authentik SSO session is left
  intact.
- **Housekeeping**: the callback calls `deleteExpiredSessions()` and
  `deleteExpiredPendingLinks()` on each login.

## Admin roles

`role` is a column on `people` (`'user'` | `'admin'`) and is the source of truth.

- `SKY_ADMIN_SUBS` (comma-separated Authentik subs) only **bootstraps** admin at
  login; a person promoted in the DB is never demoted by a subsequent login,
  because the role is computed as `isAdminSub(sub) || db role === "admin"`.
- `requireAdmin(locals)` (`guards.ts`) protects `/admin/*` pages and
  `/api/admin/*` endpoints, throwing `403` otherwise.
- Admins bypass the ICM gate, so a non-ICM admin can still operate Sky.
