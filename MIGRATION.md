# Sky Migration / Cloning to a New Server

Sky runs as a Docker container (**Node** runtime, image published on GHCR by
the CD). This document covers manual bootstrapping of a new server and data
restoration.

## Deployment Architecture

| Element  | Detail                                                                                 |
| -------- | -------------------------------------------------------------------------------------- |
| Runtime  | `sky` Docker container (SvelteKit adapter-node, Node), port 3001                       |
| Data     | `database/` mounted as volume: `sky.db` (SQLite, identities + sessions) + `schema.sql` |
| Image    | `ghcr.io/emse-students/sky:latest` (built by CD)                                       |
| CD       | `.github/workflows/deploy.yml` (workflow_run after "CI (Bun)"): build-image -> deploy  |
| Backups  | `scripts/backup-offsite.sh` -> offsite rsync to canari (root cron)                     |

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

## 2. GitHub Secrets

The CD generates `.env` from repo secrets:

| Secret                    | Purpose                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| `MICONNECT_CLIENT_ID`     | Sky app OIDC client in Authentik (miconnect)                             |
| `MICONNECT_CLIENT_SECRET` | Associated OIDC secret                                                   |
| `MIGALLERY_API_KEY`       | MiGallery API access (avatars)                                           |
| `SKY_ADMIN_SUBS`          | (optional) Authentik admin subs, comma-separated                         |
| `MICONNECT_BASE_URL`      | (optional) Authentik base; default `https://auth.canari-emse.fr`         |
| `MIGALLERY_API_URL`       | (optional) MiGallery API base; default `https://gallery.mitv.fr`         |

The first three are mandatory (CD fails if missing). Non-secret values (PORT
3001, `MICONNECT_BASE_URL`, `MIGALLERY_API_URL`, BODY_SIZE_LIMIT) have defaults
in `docker-compose.prod.yml`. OIDC endpoints are at
`<base>/application/o/{authorize,token,userinfo}/` (global, no slug, like
Canari).

> Authentik: the Sky app must have the redirect URI
> `https://sky.mitv.fr/auth/callback` and expose the claims `given_name`,
> `family_name`, `email`, `promo`, `formation` (scopes `openid profile promo name
> formation`). All of Sky is restricted to the ICM program; `SKY_ADMIN_SUBS`
> bypass this restriction. `people` records are linked to an account by (last
> name, first name, promotion); otherwise a new record is created.

## 3. SSH Access for Offsite Backup

On the server (root, running the cron):

```bash
ssh-keyscan -H 10.0.0.3 >> /root/.ssh/known_hosts
```

On canari, authorize root@<server>'s public key in
`~/.ssh/authorized_keys` of the `canari` user and create `~/sky-offsite/`.

## 4. First Deployment

Push to `main`: "CI (Bun)" runs, then `deploy.yml` builds the image, pushes it
to GHCR, generates `.env`, and runs `docker compose up -d` on the server.

## 5. Data Restoration

```bash
./scripts/restore-offsite.sh --yes     # latest sky.db from canari
```

## 6. Recurring Backups

Root cron on the server:

```cron
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 5 * * * /home/mitv/Sky/scripts/backup-offsite.sh >> /var/log/sky-backup.log 2>&1
```

## Checklist

- [ ] Docker + compose, self-hosted runner (docker group)
- [ ] GitHub secrets created
- [ ] SSH server -> canari for offsite
- [ ] Green CD (image + deployment)
- [ ] Databases restored
- [ ] Backup cron installed
- [ ] Reverse proxy / DNS / TLS to port 3001
