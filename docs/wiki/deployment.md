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
through that `ci.yml` then rejected on formatting - the gate a hook does not run is a gate you
meet after pushing. The lockfile is committed and CI installs `--frozen-lockfile`.

## Dependency updates, and the merge that reaches the server

Dependabot opens the pull requests (`.github/dependabot.yml`); **from there they are the same as
anybody's**. `arm-auto-merge.yml` arms GitHub's own auto-merge on every pull request in the
repository, and GitHub squash-merges each one the moment `CI passed` goes green.

**There is no sweep any more (deleted 2026-09-04).** `dependabot-auto-merge.yml` was ~300 lines on
an hourly cron: it enumerated the open Dependabot pull requests, decided for ITSELF whether each was
green, merged them with its own `gh pr merge`, and dispatched the deploy afterwards. Four mechanisms
where one belongs. It existed because a `pull_request` run raised by Dependabot **gets no secrets** -
GitHub runs it as if it came from a fork - so no App token can be minted in that context.
`pull_request_target` runs in the base repository's context, WITH its secrets, for every pull
request, which is what makes one file enough. It is safe on that trigger for one specific reason:
**it never checks the pull request out.**

**The deploy dispatch went with it, and that is a consequence rather than a loss.** A squash merge
made with `GITHUB_TOKEN` raises no `push` event - GitHub's anti-recursion rule - so `CI (Bun)` never
ran on the merge commit and `deploy.yml`'s `workflow_run` trigger never fired; the dispatch was the
compensation. An App-token merge raises the event, so CI runs on `main` and the deploy hears about
it the ordinary way.

**What went with the sweep that DID NOT work.** Its staleness gate refused to merge a head whose
check suite described gates `main` no longer carried, and the only way to lift that refusal was to
rebuild the branch - which no identity a workflow can mint may do. `PUT /pulls/{n}/update-branch`
writes a merge commit authored by `github-actions[bot]`, which parks the re-triggered run in
`action_required` and makes Dependabot refuse the branch for good; and `@dependabot recreate` is
answered _"Sorry, only users with push access can use that command"_ - **including when the caller
is a GitHub App**, measured ten times out of ten on emse-students/canari. An App INSTALLATION is not
an account with push access. _A gate whose only remedy is unavailable is a stop, not a gate._

The question it was trying to answer is answered elsewhere and better: `ci.yml` runs on
`push: main` as well as on `pull_request`, so a merge that breaks the trunk turns `CI passed` red ON
`main`, where somebody looking at the repository sees it, rather than being predicted per branch.

## Nothing deploys on a push - the release does

**Since 2026-09-04, and in every repository of the ecosystem** (user: _"Pour tous les repos, le push
sur main ne doit rien deployer, c'est la release qui le fait."_). A merge to `main` runs the CI and
stops there. The human gesture that ships is publishing a GitHub release:

```sh
gh release create v1.2.3 --generate-notes
```

`release.yml` then asks three questions, all of them in `.github/scripts/release-preflight.sh` so
they can be tested without a run - and they are, on both sides of every gate:

1. **Is the version a version?** A typo becomes a deployed image tag nobody can find again.
2. **Is the released commit on `main`?** Everything downstream reads the trunk.
3. **Did `CI passed` go green ON that commit?** Not "run the tests again" - they already ran on this
   exact tree, and running them a second time here is a second opinion that would decide a
   deployment: a flake would ship or block, and a suite that changed since the merge would be
   judging code it was not written for. **An absent check is refused too** - that is not a failure,
   it means nothing ever asked, and an absent measurement is not permission.

Only then does it call `deploy.yml`, which since the same day is a **library with no triggers of its
own** - it used to fire on `workflow_run` after the CI finished on `main`, which made every merge a
deployment. It is handed the commit the gates approved and the version they read, so what is built
is what was checked, and the image carries a `v<version>` tag alongside `latest`.

**So a merged fix is not a shipped fix**, and that is the deliberate cost. Dependency updates merge
themselves and then WAIT; what they wait for is somebody deciding this is the tree that ships. The
alternative - deploying whatever last merged - means production is whatever the last green pull
request happened to be, which nobody chose.

**The ceiling was EMPTY here, and that is a measured answer rather than an omission** - all three
candidates were closed by writing the test instead of refusing the update. A ceiling entry is never
a semver judgement: a break that stops the tree compiling is caught by the suite. It is a statement
that A TEST IS MISSING, and every entry has to name the test that retires it. Canari keeps a
`dependency-ceiling` job for the classes it genuinely cannot see the failure mode of; this
repository has none.

### The security pass gained the question it had never asked

`code-analysis.yml` had CodeQL, a secret scan and a quality gate - and **nothing that asks whether a
dependency this repository already ships has since been found vulnerable.** Canari, MiGallery and
the portal have audited theirs for months; the gap here was invisible because every other tick was
green. _A correct mechanism with no report is found by hand, a day late; a question nobody asks is
never found at all._ The `dependencies` job added on 2026-09-04 audits the tree and guards the
lockfile version that keeps Dependabot able to read it. It was measured clean before it was turned
on (`No vulnerabilities found (checked 327 packages)`), so its first red will be a real one.

**An npm outage is not a vulnerability.** `bun audit` exits 1 for
`POST .../advisories/bulk - 503` exactly as it exits 1 for a real advisory - that walled every merge
in Canari on 2026-09-03. `.github/scripts/audit-dependencies.sh` classifies once and answers with
three exit codes: `0` clean, `1` an advisory was named, `2` the registry never answered. What a `2`
costs is the caller's policy - a pull request tolerates it (a refusal whose only remedy is
unavailable is a stop, not a gate), the nightly pass fails on it (nothing is queued behind that run,
and its failure is the report saying this tree has gone a day unaudited). The unknown case fails
CLOSED, and `audit-dependencies.test.sh` asserts that direction against a fake `bun`, in the same
run that uses the script.

### One lesson from the year the sweep ran, kept because it outlives it

**Counting deliveries is the wrong question; read one log.** This repository's sweep was delivered,
ran, went GREEN and had never executed anything: the script landed without its executable bit,
`Permission denied` on every pull request, `merged 0`, six consecutive green passes. The step
swallowed a non-zero status by design so one unmergeable branch could not stop the sweep, and it
swallowed "the script could not run" with it. No count of runs would ever have found that.

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
