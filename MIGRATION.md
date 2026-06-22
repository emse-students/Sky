# Migration / clonage de Sky sur un nouveau serveur

Sky tourne en conteneur Docker (runtime **Node**, image publiee sur GHCR par la
CD). Ce document couvre le bootstrap manuel d un nouveau serveur et la
restauration des donnees.

## Architecture de deploiement

| Element | Detail                                                                                 |
| ------- | -------------------------------------------------------------------------------------- |
| Runtime | conteneur Docker `sky` (SvelteKit adapter-node, Node + Python), port 3001              |
| Donnees | `database/` monte en volume : `sky.db` + `auth.db` (SQLite) + `schema.sql`             |
| Image   | `ghcr.io/emse-students/sky:latest` (buildee par la CD)                                 |
| CD      | `.github/workflows/deploy.yml` (workflow_run apres "CI (Bun)") : build-image -> deploy |
| Backups | `scripts/backup-offsite.sh` -> offsite rsync vers canari (cron root)                   |

> Runtime Node (et non Bun) : `better-sqlite3` est utilise par des scripts non
> bundles (`init-db.js`, migrations) que Bun ne sait pas charger. Python +
> networkx/numpy/scipy sont embarques pour `scripts/calcul_positions.py`.

## 0. Pre-requis

- Docker Engine + plugin `docker compose`.
- Runner GitHub Actions self-hosted dont l utilisateur est dans le groupe `docker`.

## 1. Runner self-hosted

Installer un runner (Settings -> Actions -> Runners) en service ; l utilisateur
doit pouvoir lancer `docker` (`usermod -aG docker <user>` + redemarrage du runner).

## 2. Secrets GitHub

La CD genere `.env` depuis les secrets du repo :

| Secret              | Role                                           |
| ------------------- | ---------------------------------------------- |
| `AUTH_SECRET`       | signatures Auth.js (`openssl rand -base64 32`) |
| `MIGALLERY_API_KEY` | acces a l API MiGallery                        |

Les valeurs non-secretes (PORT 3001, AUTH_TRUST_HOST, BODY_SIZE_LIMIT) ont des
defauts dans `docker-compose.prod.yml`.

## 3. Acces SSH pour la sauvegarde offsite

Sur le serveur (root, qui lance le cron) :

```bash
ssh-keyscan -H 10.0.0.3 >> /root/.ssh/known_hosts
```

Sur canari, autoriser la cle publique de root@<serveur> dans `~/.ssh/authorized_keys`
du user `canari` et creer `~/sky-offsite/`.

## 4. Premier deploiement

Pousser sur `main` : "CI (Bun)" s execute, puis `deploy.yml` build l image,
la pousse sur GHCR, genere `.env` et `docker compose up -d` sur le serveur.

## 5. Restauration des donnees

```bash
./scripts/restore-offsite.sh --yes     # dernieres sky.db + auth.db depuis canari
```

## 6. Sauvegardes recurrentes

Cron root sur le serveur :

```cron
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 5 * * * /home/mitv/Sky/scripts/backup-offsite.sh >> /var/log/sky-backup.log 2>&1
```

## Checklist

- [ ] Docker + compose, runner self-hosted (groupe docker)
- [ ] Secrets GitHub crees
- [ ] SSH serveur -> canari pour l offsite
- [ ] CD verte (image + deploiement)
- [ ] Bases restaurees
- [ ] Cron de sauvegarde installe
- [ ] Reverse proxy / DNS / TLS vers le port 3001
