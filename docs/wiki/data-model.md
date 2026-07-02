# Data model

Sky stores everything in one SQLite file, `database/sky.db`, accessed through
`better-sqlite3` in `src/lib/server/database.ts`. The schema is `schema.sql`
(version 4.0); on first boot `getDatabase()` applies it if the `people` table is
missing, with an inline fallback schema baked into the code.

## Live tables

### `people`

One row per person, whether or not they have an account (see
[identity-model.md](identity-model.md)).

| Column | Notes |
| ------ | ----- |
| `id` TEXT PK | account: the Authentik `sub`; placeholder: `prenom.nom[.promo][.idx]` |
| `first_name`, `last_name` | display form "Prenom" / "NOM" |
| `level` INTEGER | graduation year (promo); nullable |
| `bio`, `image_url` | legacy/optional; profile now comes from Canari |
| `auth_sub` TEXT | Authentik sub; `NULL` for placeholders |
| `email`, `formation` | from the SSO; `formation` drives the ICM gate |
| `role` TEXT | `'user'` \| `'admin'`, default `'user'` |
| `last_login` INTEGER | epoch of last SSO login |
| `created_by` TEXT | id of the person who created a placeholder |
| `created_at`, `updated_at` | timestamps |

A **partial unique index** `idx_people_auth_sub ON people(auth_sub) WHERE
auth_sub IS NOT NULL` enforces one account per record while allowing many
placeholders with `NULL`. Indexes on `level`, `last_name`, `first_name` back
searches.

### `relationships`

The directed sponsorship graph. `source_id` is the sponsor (parrain),
`target_id` the godchild (fillot).

| Column | Notes |
| ------ | ----- |
| `id` INTEGER PK | autoincrement |
| `source_id`, `target_id` TEXT | FK to `people(id)`, `ON DELETE CASCADE` |
| `type` TEXT | `'parrainage'` (official) or `'adoption'` |
| `created_at` | timestamp |

`UNIQUE(source_id, target_id, type)` prevents duplicates. The business rules
(maxima 1/1/3/2, no cycle) are enforced in code, not by the schema; see
[sponsorship-graph.md](sponsorship-graph.md).

### `sessions` and `pending_links`

- `sessions(token PK, person_id FK, expires_at, created_at)` - opaque login
  sessions (7-day tokens). Replaces the former separate `auth.db`.
- `pending_links(token PK, sub, first_name, last_name, level, email, formation,
  role, expires_at, created_at)` - SSO identities waiting for the user to pick a
  record on `/auth/link` (ambiguous login).

Both are swept of expired rows on each login.

### Full-text search

`people_fts` is an FTS5 virtual table (`content=people`) over `first_name` and
`last_name`, kept in sync by three triggers (`people_fts_insert/delete/update`).
Note that the primary user-facing search does not rely on FTS; it uses the
tolerant scorer in `format.ts` (see [matching-and-search.md](matching-and-search.md)).

### `ignored_merge_pairs`

Created lazily in `getDatabase()` (no migration needed):
`ignored_merge_pairs(a_id, b_id PRIMARY KEY)` with the canonical order `a_id <
b_id`. Records merge suggestions an admin chose to ignore so they stop resurfacing.

### `metadata`

Key/value store holding `schema_version` and `last_migration`.

## Dormant tables

`external_links` and `associations` remain in the schema for history but are no
longer written by Sky. Bio, current clubs and former clubs now come from Canari
at read time (see [integrations.md](integrations.md)).

## `positions.json`

The star-map layout is not in SQLite. `recalculatePositions()` computes a
`{ id: {x, y} }` map with the in-process ForceAtlas2 layout (see
[sponsorship-graph.md](sponsorship-graph.md)) and writes
`database/positions.json`. The frontend fetches it via `GET /api/positions`; any
person missing from it is scattered deterministically client-side so no star is
ever hidden.

## The legacy snapshot

`sky-legacy.db` is a **read-only** SQLite snapshot of the pre-rebuild data,
opened lazily with `{ readonly: true }`. It exists so admins can rebuild data by
hand after the schema-4.0 clean rebuild. It is browsed through
`GET /api/admin/legacy` and the `/admin/legacy` page: `legacyExists`,
`getLegacyCounts`, `getLegacyPeople(search)`, `getLegacyPersonRelations(id)`.
Nothing writes to it.

## Maintenance scripts

`scripts/` holds unbundled Node scripts run outside the app process:
`init-db.js` (apply schema), `migrate-*.js` (idempotent `ALTER`/`CREATE`),
`rebuild-db.js`, `rebuild-fts.js`, `check-db-integrity.js`,
`update-positions.js`. The production start chains the migrations before
launching the server (see [deployment.md](deployment.md)).
