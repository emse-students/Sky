# Architecture

Sky is a single SvelteKit application: the same Node process serves the SSR
pages, the `/api/*` REST endpoints, and the SQLite access layer. There are no
separate backend services; the "backend" is `src/lib/server/*` called from
route handlers.

## Request lifecycle

Every request flows through `src/hooks.server.ts`, which composes three handles
with `sequence(...)`. Order matters:

```
sequence(paraglideHandler, sessionHandler, gateHandler)
```

1. **`paraglideHandler`** wraps the request in `paraglideMiddleware`. This binds
   the resolved locale (cookie / `Accept-Language`, default `fr`) to the
   server-side async context and injects it into `<html lang>`. Because it is
   first and wraps `resolve(event)`, `m.*()` renders in the correct language
   everywhere downstream: in SSR page loads, in `+server.ts` handlers, and deep
   inside `src/lib/server/database.ts` (e.g. a `RelationError` message). This is
   the pattern to reuse for any new server-side user-facing string.

2. **`sessionHandler`** reads the `sky_session` cookie, resolves it to a
   `people` row via `getSessionPerson`, and populates `event.locals.user`
   (a `SessionUser`) or `null`. It never redirects; it only resolves.

3. **`gateHandler`** enforces that all of Sky is ICM-only:
   - Public paths are allowed through (see below).
   - No session on a protected path -> `302 /auth/login` for pages, `401` JSON
     for `/api/*`.
   - A session whose `formation !== "ICM"` and `role !== "admin"` ->
     `302 /unauthorized` for pages, `403` JSON for `/api/*`. This is defense in
     depth; the OIDC callback already gates at login.

### Public paths

Defined in `hooks.server.ts`:

- Exact: `/` (the landing with the Login button) and `/unauthorized`.
- Prefixes: `/auth/`, `/api/health`, `/api/avatar/`, `/api/external/`.

`/api/external/` is not session-gated because it is a server-to-server API
protected by its own key (`SKY_API_KEY`); Canari calls it to render the close
tree on a profile page. `/api/avatar/` is public so `<img>` tags can load it.
The public landing (like Canari) avoids a silent re-login loop after logout: the
Authentik SSO session is not killed, so reconnecting is one click.

## Route map

```
src/routes/
├── +layout.server.ts        # exposes locals.user + canariUrl to the client
├── +page.svelte             # the star map (home)
├── unauthorized/            # ICM-only refusal page
├── auth/
│   ├── login/+server.ts     # GET -> start OIDC (state/nonce cookies + redirect)
│   ├── callback/+server.ts  # GET  <- Authentik return: gate, link, session
│   ├── logout/+server.ts    # GET/POST -> delete session + cookie
│   └── link/                # disambiguation screen (choose which record is you)
├── account/                 # self-service "fix my link" (relink)
├── admin/                   # dashboard, people manager, legacy browser (admin only)
└── api/                     # REST endpoints (see api-reference.md)
```

Server logic lives in `src/lib/server/`:

| File | Responsibility |
| ---- | -------------- |
| `database.ts` | All SQLite access: people, relationships, sessions, linking, merge, positions recompute |
| `oidc.ts` | Authentik OIDC flow (authorize URL, code exchange, userinfo, claims) |
| `positions.ts` | Pure ForceAtlas2 layout of the graph |
| `session.ts` | The `sky_session` cookie helpers |
| `link.ts` | The `__pending_link` cookie name (ambiguous-login token) |
| `guards.ts` | `requireAdmin(locals)` |

## Deployment topology

Production runs as a single Docker container (`adapter-node`, Node runtime) on
port `3001`, behind a reverse proxy that terminates TLS for `sky.mitv.fr`. The
`database/` directory is a mounted volume holding `sky.db`, `schema.sql`, and the
generated `positions.json`. See [deployment.md](deployment.md) for the full
picture.

Node (not Bun) is the production runtime because `better-sqlite3` is used by
unbundled maintenance scripts (`init-db.js`, migrations) that Bun cannot load.
The graph layout is TypeScript in-process, so there is no Python dependency at
runtime.
