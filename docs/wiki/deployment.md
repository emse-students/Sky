# Deployment

Sky runs as a single Docker container (SvelteKit `adapter-node`, Node runtime) on
port `3001`, behind a reverse proxy that terminates TLS for `sky.mitv.fr`. The
image is built and published to GHCR by the CD. This page is the operational
summary; [MIGRATION.md](../../MIGRATION.md) is the authoritative, checklist-style
runbook for cloning Sky onto a new server and must be kept in sync when the
procedure changes.

## Topology

| Element | Detail                                                                                |
| ------- | ------------------------------------------------------------------------------------- |
| Runtime | Docker container `sky`, Bun, port 3001                                                |
| Data    | `database/` mounted as a volume: `sky.db` + `schema.sql` + generated `positions.json` |
| Image   | `ghcr.io/emse-students/sky:latest` (built by CD)                                      |
| CD      | `.github/workflows/deploy.yml` (runs after "CI (Bun)"): build-image -> deploy         |
| Backups | `scripts/backup-offsite.sh` -> offsite rsync to Canari (root cron)                    |

Bun, not Node, is the runtime, and the reason INVERTED on 2026-08-27. It used to be
Node because `better-sqlite3` was a native module the unbundled maintenance scripts
loaded and Bun could not (oven-sh/bun#4290). The driver is now `bun:sqlite` - a Bun
builtin - so those same scripts can no longer run under Node at all. The graph layout
is TypeScript in-process (`positions.ts`), so there is no Python dependency at runtime.

`bun run build` is `bun --bun vite build`, and the `--bun` is load-bearing: Bun honours
a bin's node shebang, so a plain `vite build` runs Vite under Node and SSR then fails to
resolve `bun:sqlite` with `ERR_UNSUPPORTED_ESM_URL_SCHEME`.

## Startup sequence

`start:prod` (package.json) chains the idempotent maintenance scripts before
launching the server:

```
bun scripts/init-db.js                    # apply schema if the DB is empty
bun scripts/migrate-auth.js               # auth_sub/email/formation/role/last_login + sessions/pending_links
bun scripts/rebuild-db.js
bun scripts/migrate-drop-dead-schema.js   # drop bio/image_url/external_links
bun build/index.js
```

The migrations use `PRAGMA table_info` guards and `CREATE TABLE IF NOT EXISTS`, so
re-running them is safe. The chain runs under `set -e`: it used to be joined by
`|| true`, which made a FAILED migration indistinguishable from a successful one
and started the server against a half-migrated database. A migration that fails
now stops the container, and the deploy's health check reports it.

## Configuration

The CD generates `.env` from GitHub repo secrets. Non-secret values have defaults
in `docker-compose.prod.yml`.

| Variable                  | Required     | Role                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MICONNECT_CLIENT_ID`     | yes          | Authentik OIDC client for the Sky app                                                                                                                                                                                                                                                                                    |
| `MICONNECT_CLIENT_SECRET` | yes          | Authentik OIDC secret                                                                                                                                                                                                                                                                                                    |
| `MIGALLERY_API_KEY`       | yes          | MiGallery avatar API access                                                                                                                                                                                                                                                                                              |
| `SKY_ADMIN_SUBS`          | no           | Comma-separated Authentik subs bootstrapped as admin                                                                                                                                                                                                                                                                     |
| `MICONNECT_BASE_URL`      | no           | Authentik base; default `https://auth.canari-emse.fr`                                                                                                                                                                                                                                                                    |
| `MIGALLERY_API_URL`       | no           | MiGallery base; default `https://gallery.mitv.fr`                                                                                                                                                                                                                                                                        |
| `CANARI_API_URL`          | no           | Canari base; default `https://canari-emse.fr`                                                                                                                                                                                                                                                                            |
| `CANARI_API_KEY`          | for profiles | Read the inbound Canari profile API                                                                                                                                                                                                                                                                                      |
| `SKY_API_KEY`             | for outbound | Protects `/api/external/entourage/*` (Canari presents it)                                                                                                                                                                                                                                                                |
| `SKY_ORIGIN`              | no           | Public origin; default `https://sky.mitv.fr`. Sets `ORIGIN` for `adapter-node`: without it the origin is derived from the `Host` header, which keeps the hostname and loses the scheme, and every absolute URL in the head is built from it (see [seo.md](seo.md)). It is also the origin `adapter-node` checks for CSRF |

The three MiConnect/MiGallery secrets are mandatory (the CD fails without them).

### Authentik app requirements

The Sky app in Authentik must register the redirect URI
`https://sky.mitv.fr/auth/callback` and expose the claims used by the login flow
(`given_name`/`family_name` or the camelCase `firstName`/`lastName`, `email`,
`promo`, `formation`) via scopes `openid profile promo name formation`. All of Sky
is ICM-only; `SKY_ADMIN_SUBS` are the exception (see
[authentication.md](authentication.md)).

## Backups

A root cron runs `scripts/backup-offsite.sh`, which rsyncs `sky.db` offsite to
Canari. Restore with `scripts/restore-offsite.sh --yes` (pulls the latest
`sky.db`). The offsite target and cron line are in
[MIGRATION.md](../../MIGRATION.md).

## Local development

```bash
bun install
bun run dev        # http://localhost:5173
```

Verification (matches CI and the pre-commit hook):

```bash
bun run check         # paraglide:compile + svelte-kit sync + svelte-check (0 errors)
bun run lint          # oxlint over the whole package, then oxvelte over src
bun run format:check  # oxfmt - there is no prettier here and no prettier config
```

There is no eslint and no prettier in this repository: `lint` is oxlint plus oxvelte, two Rust
binaries, and `format` is oxfmt. oxvelte is built from a PINNED revision by
`scripts/run-oxvelte.sh`, which every caller goes through, so a workstation and CI lint with the
same binary or with neither.

The Husky pre-commit hook runs all three. It used to run `lint && check` only, which let a commit
through that `ci-bun.yml` then rejected on formatting - the gate a hook does not run is a gate you
meet after pushing. The lockfile is committed and CI installs `--frozen-lockfile`.

**The lockfile stays at `lockfileVersion: 1`** - Dependabot cannot read v2, and bun 1.4.0 writes v2
for any lockfile it creates from scratch, with no flag to ask for v1. `bun install` and `bun update`
preserve the version they find, so never delete this file to "refresh" it. Its `configVersion: 0` is
the same story and stays for the same reason.
