# Sky

Sky is the star map of EMSE's ICM godparent tree. Every ICM student is a star
on an interactive canvas, connected by parrainage (godparent) and adoption
links. A signed-in student can explore the graph and edit their own godparent
entourage. Identity, avatars and the rest of the profile come from the shared
EMSE stack (Authentik SSO, MiGallery, Canari); Sky owns only the godparent
graph.

## Stack

- **Framework**: SvelteKit 2 + Svelte 5 (SSR, `adapter-node`), TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: SQLite via `better-sqlite3` (single file `database/sky.db`)
- **Graph layout**: in-process ForceAtlas2 (graphology), no Python at runtime
- **i18n**: Paraglide (inlang), French + English
- **Auth**: Authentik OIDC (miconnect), opaque server sessions
- **Runtime**: Node in production (Docker); Bun for local dev tooling

## Quick start

```bash
bun install
bun run dev        # http://localhost:5173
```

Create a `.env` (see the variables below). The database is created and migrated
automatically on first run.

### Verification (matches CI and the pre-commit hook)

```bash
bun run check      # paraglide:compile + svelte-kit sync + svelte-check (0 errors, 0 warnings)
bun run lint       # eslint on src/lib and src/routes
```

The Husky pre-commit hook runs `lint && check`. The lockfile is committed and CI
installs `--frozen`.

## How it works (short version)

- Every request passes through `src/hooks.server.ts`:
  `sequence(paraglideHandler, sessionHandler, gateHandler)`. Paraglide binds the
  locale (so `m.*()` renders server-side, including thrown errors), the session
  handler resolves the `sky_session` cookie to a `people` row, and the gate keeps
  all of Sky ICM-only.
- People live in one `people` table. A record is either a **placeholder**
  (`auth_sub` NULL, id `prenom.nom[.promo][.idx]`) or an **account** (id = the
  Authentik `sub`). Login links an SSO identity to an existing record by name +
  promo, or creates one.
- The godparent graph (`relationships`) enforces the rules 1 official godparent /
  1 adoption godparent / 3 official godchildren / 2 adoption godchildren, plus
  no-cycle, server-side. Star positions are computed in-process and cached in
  `database/positions.json`.
- Bio and clubs are read from Canari at request time; avatars are proxied from
  MiGallery. Canari reads a person's close tree back from Sky's
  `/api/external/entourage/{sub}` API.

## Environment variables

| Variable                  | Required     | Role                                                      |
| ------------------------- | ------------ | --------------------------------------------------------- |
| `MICONNECT_CLIENT_ID`     | yes          | Authentik OIDC client for the Sky app                     |
| `MICONNECT_CLIENT_SECRET` | yes          | Authentik OIDC secret                                     |
| `MIGALLERY_API_KEY`       | yes          | MiGallery avatar API access                               |
| `SKY_ADMIN_SUBS`          | no           | Comma-separated Authentik subs bootstrapped as admin      |
| `MICONNECT_BASE_URL`      | no           | Authentik base; default `https://auth.canari-emse.fr`     |
| `MIGALLERY_API_URL`       | no           | MiGallery base; default `https://gallery.mitv.fr`         |
| `CANARI_API_URL`          | no           | Canari base; default `https://canari-emse.fr`             |
| `CANARI_API_KEY`          | for profiles | Read the inbound Canari profile API                       |
| `SKY_API_KEY`             | for outbound | Protects `/api/external/entourage/*` (Canari presents it) |

## Documentation

- **[docs/wiki/](docs/wiki/index.md)** - the technical wiki (English): architecture,
  authentication, identity model, data model, the godparent graph, matching and
  search, the frontend, integrations, the API reference, and deployment. This is
  the canonical source of truth.
- **[MIGRATION.md](MIGRATION.md)** - runbook for cloning Sky onto a new server.
- **[docs/ID-MODEL.md](docs/ID-MODEL.md)** - the two record kinds (superseded by
  the wiki's identity-model page).

## Conventions

- Code comments and developer-facing strings (logs, thrown errors) are English.
  User-visible text goes through Paraglide (`m.*()`), never inline.
- Text is ASCII (straight `'` and `"`, hyphen `-`); the ellipsis `…` is the one
  intentional exception.
- Changing a component that carries a translated string usually means updating
  its message keys in `messages/{fr,en}.json` in the same change.

## License

Internal EMSE project.
