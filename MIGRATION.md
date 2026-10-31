# Sky Migration / Cloning to a New Server

Sky runs as a Docker container (**Node** runtime, image published on GHCR by
the CD). This document covers manual bootstrapping of a new server and data
restoration.

## Deployment Architecture

| Element | Detail                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------ |
| Runtime | `sky` Docker container (SvelteKit adapter-bun, Bun), port 3001                                   |
| Data    | `database/` mounted as volume: `sky.db` (identities + sessions), `positions.json` + `schema.sql` |
| Image   | `ghcr.io/emse-students/sky:latest` (built by CD)                                                 |
| CD      | `.github/workflows/deploy.yml`, called by `release.yml` only: build-image -> deploy              |
| Target  | repository variables `SKY_RUNNER_LABEL` (the box's runner) + `SKY_DEPLOY_DIR`                    |
| Backups | `scripts/backup.sh`: local archive + offsite mirror over SSH (cron)                              |

> Runtime is Node (not Bun): `better-sqlite3` is used by non-bundled scripts
> (`init-db.js`, migrations) that Bun cannot load. Graph position computation is
> TypeScript in-process (`src/lib/server/positions.ts`, ForceAtlas2 via
> graphology): no Python dependency at runtime.

## 0. Prerequisites

- Docker Engine + `docker compose` plugin.
- Self-hosted GitHub Actions runner whose user is in the `docker` group.

## 1. Self-Hosted Runner

Install a runner (Settings -> Actions -> Runners) as a service; the user must
be able to run `docker` (`usermod -aG docker <user>` + restart the runner).

**Give it a label of its own** (`--labels sky-<box>`), then point the two repository
variables at it: `SKY_RUNNER_LABEL` = that label, `SKY_DEPLOY_DIR` = the directory the
deploy writes `.env` and the compose file into (the runner's user must own it). The
deploy refuses to start while either is empty. A bare `self-hosted` is never enough:
it matches whichever self-hosted runner is idle, and moving Sky - or moving it back -
is exactly the edit of those two variables.

## 2. GitHub Secrets

The CD generates `.env` from repo secrets:

| Secret                    | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `MICONNECT_CLIENT_ID`     | Sky app OIDC client in Authentik (miconnect)                     |
| `MICONNECT_CLIENT_SECRET` | Associated OIDC secret                                           |
| `MIGALLERY_API_KEY`       | MiGallery API access (avatars)                                   |
| `SKY_ADMIN_SUBS`          | (optional) Authentik admin subs, comma-separated                 |
| `MICONNECT_BASE_URL`      | (optional) Authentik base; default `https://miconnect.emse.fr`   |
| `MIGALLERY_API_URL`       | (optional) MiGallery API base; default `https://gallery.mitv.fr` |
| `BACKUP_DIR`              | Local archive directory on the host (`<backup-dir>`)             |
| `BACKUP_SSH_HOST`         | Offsite mirror, `<backup-account>@<backup-host>`                 |
| `BACKUP_SSH_PATH`         | Archive directory on the mirror                                  |

The first three and the three `BACKUP_*` are mandatory (CD fails if missing). The `BACKUP_*`
values never reach `.env`: the deploy writes them into `scripts/backup.env` beside the backup
scripts, which refuse to run without it (`scripts/backup-config.sh`). Non-secret values (PORT
3001, `MICONNECT_BASE_URL`, `MIGALLERY_API_URL`, BODY_SIZE_LIMIT) have defaults
in `docker-compose.prod.yml`. OIDC endpoints are at
`<base>/application/o/{authorize,token,userinfo}/` (global, no slug, like
Canari).

> Authentik: the Sky app must have the redirect URI
> `https://sky.emse.fr/auth/callback` (the old `https://sky.mitv.fr/auth/callback` stays beside
> it while that name redirects) and expose the claims `given_name`,
> `family_name`, `promo`, `formation` (scopes `openid profile promo name
formation`). All of Sky is restricted to the ICM program; `SKY_ADMIN_SUBS`
> bypass this restriction. `people` records are linked to an account by (last
> name, first name, promotion); otherwise a new record is created.

## 3. SSH Access for the Offsite Mirror

The deploy user (the runner's) needs a key authorized for the backup account on `<backup-host>`
(the `BACKUP_SSH_HOST` secret) and a directory that account owns there (`BACKUP_SSH_PATH`). Check,
as the deploy user, that a non-interactive `ssh -o BatchMode=yes` to that account can write in
that directory before relying on the cron line below.

## 4. First Deployment

Publish a release: `release.yml` calls `deploy.yml`, which builds the image, pushes it to GHCR,
generates `.env`, syncs `docker-compose.prod.yml` and `scripts/` into `SKY_DEPLOY_DIR`, and runs
`docker compose up -d` on the runner named by `SKY_RUNNER_LABEL`.

## 5. Data Restoration

```bash
./scripts/restore.sh --yes             # newest local archive in BACKUP_DIR
./scripts/restore.sh --yes --offsite   # newest archive on the offsite mirror
```

## 6. Recurring Backups

The deploy user's crontab on the server (`<backup-dir>` owned by that user). **Set `BACKUP_DIR` ON
THE LINE**: the environment wins over `scripts/backup.env`, so a `BACKUP_DIR` set at the top of a
crontab shared with other jobs would send Sky's archives into another project's directory and
under its retention.

```cron
45 4 * * * BACKUP_DIR=<backup-dir> <deploy-dir>/scripts/backup.sh >> <backup-dir>/backup.log 2>&1
```

## Checklist

- [ ] Docker + compose, self-hosted runner (docker group)
- [ ] GitHub secrets created, the three `BACKUP_*` included
- [ ] SSH deploy user -> the backup account for the offsite mirror, and the cron line above
- [ ] Green CD (image + deployment)
- [ ] Databases restored
- [ ] Backup cron installed
- [ ] Reverse proxy / DNS / TLS to port 3001
