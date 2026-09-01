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

## Dependency updates, and the merge that reaches the server

`.github/workflows/dependabot-auto-merge.yml` squash-merges a Dependabot pull request once the whole
check suite on its head commit is green, and only for updates whose failure mode this repository can
actually SEE. The decision lives in `.github/scripts/dependabot-auto-merge.sh`, shared by every
trigger, so no path can drift into its own policy.

**Its ceiling is EMPTY, and that is a measured answer rather than an omission** - all three
candidates were closed by writing the test instead of refusing the update. A ceiling entry is not a
semver judgement: a break that stops the tree compiling is caught by the suite and merges on its
own. It is a statement that a TEST IS MISSING, and every entry has to name the test that retires it.

**Three things make it converge rather than merely fire.**

- **A full sweep on every push to `main`, not only a `workflow_run` from one pull request.** A pull
  request whose checks completed days ago never receives another event, so an event-only automation
  acts on what it happened to catch and on nothing else. The sweep enumerates every open Dependabot
  pull request, so the right state is reached from any starting state.

  **This was an hourly cron until 2026-08-31, and the measurement that demoted it was itself
  wrong.** It said `event=schedule` had produced ZERO runs, counted three hours after the cron
  landed. Counted again on 2026-09-01, all four repositories had delivered a scheduled sweep. **A
  three-hour window is not enough to call a trigger dead**, and a mechanism built on the first quiet
  interval anybody looked at is built on nothing. What survives is the shape of the delivery,
  measured over seven days rather than one afternoon: scheduled delivery on a public repository is
  best-effort and **GitHub drops the slots an hourly cron misses rather than queueing them**, so the
  clock is a floor and never a mechanism. The sweep stays bound to the workflow this repository runs
  on a push to `main`, and the cron keeps its slot as that floor.

- **A staleness gate narrow enough to be satisfiable.** A green check is evidence about the workflow
  that PRODUCED it, not about the one `main` carries today, and an absent check is indistinguishable
  from an inapplicable one. **But asking whether the head is built on current `main` is far wider
  than that**, and until 2026-09-01 it made the queue undrainable: every merge moves `main`, so
  every merge invalidated every remaining pull request at once, and the only exit was a rebuild no
  workflow holding `GITHUB_TOKEN` may perform. `PUT /pulls/{n}/update-branch` writes a merge commit
  authored by `github-actions[bot]`, which parks the re-triggered run in `action_required` and makes
  Dependabot refuse the branch for good; and `@dependabot recreate` is answered _"Sorry, only users
  with push access can use that command"_ when the caller is `github-actions[bot]`, measured on
  emse-students/canari#303. A gate whose only remedy is unavailable is a stop, not a gate. The
  question is now whether `.github/workflows/` or `.github/scripts/` moved between the branch's base
  and `main` - what decides which jobs run and what each asserts - so one sweep merges everything
  mergeable, and when the gates really did move the sweep says so on the pull request instead of
  pretending to fix it. The predicate is in `.github/scripts/lib/gate-moves.sh`, fails closed on a
  compare it cannot read or one the API truncated at 300, and its self-tests run in the same
  workflow run that uses it. The sweep still marks any head Dependabot did not write, whoever wrote
  it: detecting the state rather than its cause is what heals a branch already trapped.
- **An explicit `workflow_dispatch` on `deploy.yml` when anything merged.** A squash merge made with
  `GITHUB_TOKEN` produces a push that triggers NOTHING - GitHub's anti-recursion rule - so without
  this the merges land on `main` and the server never hears about them. The dispatched deploy runs
  its `verify` job first, which is the only thing that ever tests a sweep's updates TOGETHER.

**The lockfile stays at `lockfileVersion: 1`** - Dependabot cannot read v2, and bun 1.4.0 writes v2
for any lockfile it creates from scratch, with no flag to ask for v1. `bun install` and `bun update`
preserve the version they find, so a plain `bun install` can never break this.

**If it must be regenerated, regenerate it with `bunx --bun bun@1.3.14 install`**, never by deleting
it and running the local bun. 1.3.14 is the version Dependabot itself bundles
(`MAX_SUPPORTED_LOCKFILE_VERSION` 1) and it writes `lockfileVersion: 1` with `configVersion: 1`;
bun 1.4.0 then accepts the result under `--frozen-lockfile` with no changes. That is how
`configVersion` was moved from 0 to 1 here, after an earlier pass wrongly recorded it as unmovable.
A regeneration RE-RESOLVES the whole tree - this one shifted 209 lines - so run every gate against
the result (`check`, `lint`, `format:check`, `test`, `build`) before committing it.
