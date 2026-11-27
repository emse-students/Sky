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
     (`sub, firstName, lastName, promo, formation`).
   - Apply the **ICM gate** (below).
   - Resolve the identity to a `people` record (see
     [identity-model.md](identity-model.md)).
   - Open a session and set the cookie; redirect to `/`.

### Endpoints and base URL

`getBaseUrl()` reads `MICONNECT_BASE_URL` (default `https://miconnect.emse.fr`)
and strips the trailing slash. As on Canari, the endpoints are at a global path,
not under the app slug:

```
<base>/application/o/authorize/
<base>/application/o/token/
<base>/application/o/userinfo/
```

The app slug only appears in the token issuer, never in the endpoint URL (a
slugged `/o/<slug>/authorize/` returns 404 under Authentik).

Both server-side calls (`/token/`, `/userinfo/`) carry the shared
`OUTBOUND_BUDGET_MS` deadline - see
[the outbound budget](integrations.md#the-outbound-budget). A login that FAILS
returns the user to the start, which they can act on; a login left hanging on an
Authentik that holds the socket open gives them nothing to act on at all.

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
`refreshPersonIdentity` overwrites the linked record's name/promo/formation
each time. The e-mail is neither requested nor stored
([data-protection.md](data-protection.md)).

## The ICM gate

Sky is reserved for the ICM formation. The rule is ONE function,
`admits(formation, role)` in `src/lib/server/admission.ts`, and every way in asks
it: the callback, the Canari handoff (below) and `gateHandler`. In the callback:

```
role = roleAtSignIn(sub, getPersonRoleByAuthSub(sub))   // isAdminSub(sub) || db role === "admin"
if (!admits(claims.formation, role)) -> redirect /unauthorized
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

## Signed in from Canari

**Canari, already signed in, opens Sky already signed in**, instead of the
browser meeting a MiConnect prompt it has long forgotten. One mechanism for every
MiConnect site Canari opens; the design, the threats and the contract are
Canari's
[sign-in handoff note](https://github.com/emse-students/canari/blob/main/docs/wiki/backlog.d/sign-in-handoff-to-the-ecosystem-sites-and-migallery-notifications.md),
section 8. This section is what Sky does.

1. **Canari mints** a 60-second ES256 token for the audience `sky` (after
   MiConnect's own access inputs pass) and opens
   `https://sky.emse.fr/auth/handoff#<token>`. The token rides in the FRAGMENT,
   which no browser sends to a server.
2. **`/auth/handoff`** (`routes/auth/handoff/+page.svelte`) removes the fragment
   from the address bar at once (`takeHandoffToken`) and posts the token to
   `POST /api/auth/handoff`. `Referrer-Policy: no-referrer`,
   `Cache-Control: no-store`, no third-party script.
3. **The redemption** (`src/lib/server/handoff/redeem.ts`): `Origin` must be
   Sky's; the VENDORED verifier checks the token against Canari's JWKS (`ES256`,
   `typ: canari-handoff+jwt`, issuer `CANARI_HANDOFF_ISSUER`, audience the
   constant `sky`, 30 s leeway, at most 60 s of life, `dest` a path on this
   origin). JWKS cached 60 s, never jose's ten minutes.
4. **Admission (F1)**: the record LINKED to the token's `sub`, nothing written on
   it. None - a first visit, or an account still to link - answers
   `unknown_user`, and the page sends the user through MiConnect, where linking
   (`choice` -> `/auth/link`) happens as after any sign-in. A linked record that
   fails the ICM gate (`admits`, on its own formation and role) is refused
   `not_admitted`: the page goes to MiConnect, whose callback refuses the same
   person the same way.
5. **The interstitial, ALWAYS** before anything is written ("Tu vas être
   connecté en tant que B", with B's avatar, `/api/avatar/` being public), or
   "Tu es connecté en tant que A - continuer en tant que B ?". Only a browser
   already signed in as B skips it. The click sends the same token again.
6. **Single use and the session, in ONE transaction** (`redeemHandoffToken`):
   `INSERT OR IGNORE INTO handoff_redemptions` is the decision (409
   `replayed`), dead rows are purged by proof first, the other user's session is
   deleted and the ordinary 7-day session opened, MARKED
   `sessions.via_handoff = 1`.

Every refusal is logged `[HANDOFF] refused class=<class> jti=<jti or none>` -
**never the token**. `keys_unavailable` (Canari's JWKS unreachable) is 503 at
error. After a key COMPROMISE at Canari, restart Sky right after Canari deploys.

**Configuration**: `CANARI_HANDOFF_ISSUER` and `CANARI_HANDOFF_JWKS`, defaulted
in `docker-compose.prod.yml` to production Canari, like MiGallery's. Either
empty: every redemption answers `not_offered` and the page goes to MiConnect.

**The vendored files are byte-identical copies of Canari's**, edited only there
(`src/lib/server/handoff/handoff-verify.ts`, `src/lib/handoff/handoff-landing.ts`,
`tests/fixtures/handoff-token.cases.json`, and the Alumni merge call's verifier
`src/lib/server/handoff/alumni-merge-verify.ts`, [identity-model.md](identity-model.md#the-alumni-merge-canari-d52-d54));
Canari's `shape.mjs` compares them. Each is in `oxfmt.json`'s `ignorePatterns`, so
the formatter never makes a copy differ.

### The step-up: a handoff session may browse and may change nothing

**The attack (login CSRF):** anyone with a Canari account can mint a token for
THEIR OWN account and send a victim to `/auth/handoff#<token>`, whose browser
would then hold a session as the attacker. The interstitial warns, it does not
prove. **What decides is the mark:** a session whose row says `via_handoff = 1`
is refused EVERY `POST`, `PUT`, `PATCH` and `DELETE`, whatever its path, form
actions included - **default deny**, `stepUpHandler` in `hooks.server.ts`,
`src/lib/server/handoff/step-up.ts` - until the user signs in through MiConnect
in this browser. The callback and `/auth/link` open an UNMARKED session through
`openSignedInSession`, which deletes the presented one.

Guarded today, enumerated from the route tree by `tests/step-up.test.ts`: record
linking (`/account` relink), relatives (`/api/relatives/[id]`) and relationships
(`/api/relationships`), and every admin write (people, merge, merge suggestions,
import, positions recompute). **Exempt**, each because it writes nothing into the
session's account: `/auth/logout`, `/api/auth/handoff`, `/auth/link` (it acts on
the identity a MiConnect sign-in just proved, from its pending cookie) and
`/api/csp-report`.

**The refusal** carries `x-step-up-required: 1` in every shape: a redirect
ActionResult to `/auth/login` for a `use:enhance` form, a 303 for a plain form,
a 403 `{ code: "STEP_UP_REQUIRED" }` for a `fetch`. `hooks.client.ts` wraps
`fetch` once (`installStepUpRedirect`), so the page goes to MiConnect whatever
the caller does with the answer. The mark rides on the session row the session
handler already reads, so it costs no query.

## Admin roles

`role` is a column on `people` (`'user'` | `'admin'`) and is the source of truth.

- `SKY_ADMIN_SUBS` (comma-separated Authentik subs) only **bootstraps** admin at
  login; a person promoted in the DB is never demoted by a subsequent login,
  because the role is computed as `isAdminSub(sub) || db role === "admin"`.
- `requireAdmin(locals)` (`guards.ts`) protects `/admin/*` pages and
  `/api/admin/*` endpoints, throwing `403` otherwise.
- Admins bypass the ICM gate, so a non-ICM admin can still operate Sky.
