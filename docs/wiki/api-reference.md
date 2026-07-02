# API reference

Every HTTP endpoint under `src/routes/api/`. "Auth" is the effective requirement
after `gateHandler` (see [architecture.md](architecture.md)): unless a route is
in the public list, a valid ICM session (or admin) is required; `/api/admin/*`
additionally calls `requireAdmin`.

## Public / infrastructure

| Method | Path | Auth | Purpose |
| ------ | ---- | ---- | ------- |
| GET | `/api/health` | none | Liveness probe, `{ status: "ok" }` |
| GET | `/api/avatar/[id]` | none | Avatar proxy (MiGallery) or initials SVG; see [integrations.md](integrations.md) |
| GET | `/api/external/entourage/[sub]` | `x-api-key` (`SKY_API_KEY`) | Outbound entourage API for Canari |

## Graph and positions

| Method | Path | Auth | Purpose |
| ------ | ---- | ---- | ------- |
| GET | `/api/graph` | ICM | Full graph (`people` + `relationships`) for the map |
| GET | `/api/positions` | ICM | `{ id: {x, y} }` layout from `positions.json` |
| GET | `/api/search?q=` | ICM | Tolerant people search (min 2 chars), `{ results }` |
| GET | `/api/relationships` | ICM | Raw relationship rows |
| POST | `/api/relationships` | ICM (self / same-family / admin) | Add an entourage link |
| DELETE | `/api/relationships` | ICM (same-family / admin) | Remove a link by `relationshipId` |

`POST /api/relationships` body: `{ type, role, targetId | newPerson, confirmCreate,
centerId }`. Returns `409 { needsConfirmation, candidates }` on a possible
duplicate `newPerson`, `409 { error, code }` on a `RelationError`, or
`{ success, personId }`. See [sponsorship-graph.md](sponsorship-graph.md).

## Entourage editor

| Method | Path | Auth | Purpose |
| ------ | ---- | ---- | ------- |
| GET | `/api/entourage?id=` | ICM | Direct parrains/fillots + maxima + `canEdit` |
| PUT | `/api/relatives/[id]` | ICM (same-family / admin) | Edit a placeholder's identity |
| DELETE | `/api/relatives/[id]` | ICM (same-family / admin) | Delete a placeholder |
| GET | `/api/canari/[id]` | ICM | Proxied Canari profile (bio, clubs) |

## Admin

All require `requireAdmin` (403 otherwise).

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/admin/people` | List people (admin view) |
| POST | `/api/admin/people` | Create a person |
| PUT | `/api/admin/people/[id]` | Update a person |
| PATCH | `/api/admin/people/[id]` | Partial update (e.g. role, link/unlink) |
| DELETE | `/api/admin/people/[id]` | Delete a person |
| POST | `/api/admin/merge` | Merge two records (`mergePeople`) |
| GET | `/api/admin/merge/suggestions` | Likely-duplicate pairs |
| POST | `/api/admin/merge/suggestions` | Ignore a suggested pair |
| GET | `/api/admin/legacy` | Browse `sky-legacy.db` (`?id=` for relations, `?q=` filter) |
| POST | `/api/admin/positions/recalc` | Recompute `positions.json` |
| GET | `/api/admin/export` | Download a copy of the database |
| POST | `/api/admin/import` | Replace the database from a backup |

## Auth (form/redirect, not JSON)

Under `src/routes/auth/` (pages/handlers, not `api/`):

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/auth/login` | Start OIDC (state/nonce + redirect to Authentik) |
| GET | `/auth/callback` | Authentik return: ICM gate, link, session |
| GET/POST | `/auth/logout` | Delete session + cookie |
| - | `/auth/link` | Disambiguation form (choose which record is you) |
| - | `/account` | Self-service relink (SvelteKit `actions`) |

See [authentication.md](authentication.md) and
[identity-model.md](identity-model.md).

## Error conventions

- User-facing errors are localized Paraglide strings returned as `{ error }`
  (and `{ code }` for `RelationError`), so the client can display them directly.
- The gate returns `401 { error }` (no session) or `403 { error }` (non-ICM) for
  any `/api/*` path.
