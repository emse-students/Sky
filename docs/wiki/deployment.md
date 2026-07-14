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
| Runtime | Docker container `sky`, Node, port 3001                                               |
| Data    | `database/` mounted as a volume: `sky.db` + `schema.sql` + generated `positions.json` |
| Image   | `ghcr.io/emse-students/sky:latest` (built by CD)                                      |
| CD      | `.github/workflows/deploy.yml` (runs after "CI (Bun)"): build-image -> deploy         |
| Backups | `scripts/backup-offsite.sh` -> offsite rsync to Canari (root cron)                    |

Node, not Bun, is the runtime because `better-sqlite3` is loaded by unbundled
maintenance scripts that Bun cannot run. The graph layout is TypeScript
in-process (`positions.ts`), so there is no Python dependency at runtime.

## Startup sequence

`start:prod` (package.json) chains the idempotent maintenance scripts before
launching the server:

```
node scripts/init-db.js        # apply schema if the DB is empty
node scripts/migrate-add-bio.js
node scripts/migrate-auth.js   # auth_sub/email/formation/role/last_login + sessions/pending_links
node scripts/rebuild-db.js
node --env-file=.env build/index.js
```

The migrations use `PRAGMA table_info` guards and `CREATE TABLE IF NOT EXISTS`, so
re-running them is safe.

## Configuration

The CD generates `.env` from GitHub repo secrets. Non-secret values have defaults
in `docker-compose.prod.yml`.

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
bun run check      # paraglide:compile + svelte-kit sync + svelte-check (0 errors, 0 warnings)
bun run lint       # eslint on src/lib and src/routes
```

The Husky pre-commit hook runs `lint && check` only (no Prettier), so keep both
green. The lockfile is committed and CI installs `--frozen`.
