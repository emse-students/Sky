#!/usr/bin/env bash
#
# Restauration de la base Sky (sky.db) depuis la sauvegarde offsite
# (serveur canari). Pensee pour la reprise / migration vers un nouveau serveur.
#
#   ./scripts/restore-offsite.sh --yes
#
# OPERATION DESTRUCTIVE : remplace database/sky.db par la derniere version
# offsite. Exige --yes.
#
set -euo pipefail

SKY_DIR="${SKY_DIR:-/home/mitv/Sky}"
DB_DIR="${DB_DIR:-$SKY_DIR/database}"
DATABASES="${DATABASES:-sky}"   # noms sans extension
OFFSITE_HOST="${OFFSITE_HOST:-canari@10.0.0.3}"
OFFSITE_PATH="${OFFSITE_PATH:-sky-offsite}"
COMPOSE="docker compose -f $SKY_DIR/docker-compose.prod.yml --project-directory $SKY_DIR"

log() { printf '[sky-restore] %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { printf '[sky-restore] ERROR %s\n' "$*" >&2; exit 1; }

CONFIRM="no"
for arg in "$@"; do
  case "$arg" in
    --yes) CONFIRM="yes" ;;
    *) fail "option inconnue: $arg" ;;
  esac
done
[ "$CONFIRM" = "yes" ] || fail "operation DESTRUCTIVE. Relancer avec --yes"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

log "Arret du conteneur Sky..."
$COMPOSE stop sky || true
mkdir -p "$DB_DIR"

for name in $DATABASES; do
  log "Recuperation de la derniere sauvegarde $name depuis $OFFSITE_HOST..."
  latest="$(ssh -o BatchMode=yes "$OFFSITE_HOST" \
    "ls -1t '$OFFSITE_PATH'/${name}-*.db.gz 2>/dev/null | head -1")"
  if [ -z "$latest" ]; then
    log "WARN aucune sauvegarde offsite pour $name, ignore"
    continue
  fi
  rsync -a -e "ssh -o BatchMode=yes" "$OFFSITE_HOST:$latest" "$STAGE/"
  dest="$DB_DIR/${name}.db"
  [ -f "$dest" ] && cp "$dest" "$dest.before-restore-$(date '+%Y%m%d-%H%M%S')" || true
  gunzip -c "$STAGE/$(basename "$latest")" > "$dest"
  log "Restauree -> $dest"
done

log "Redemarrage du conteneur..."
$COMPOSE up -d sky
log "Restauration terminee."
