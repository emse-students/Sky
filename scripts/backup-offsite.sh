#!/usr/bin/env bash
#
# Sauvegarde offsite des bases Sky (sky.db + auth.db) vers le serveur canari
# (miroir reciproque entre les deux serveurs LAN).
#
# Dump SQLite coherent via l API de sauvegarde en ligne (sqlite3 ".backup",
# WAL-safe), gzip, puis envoi rsync offsite. Tourne sur mitv (root, via cron).
#
set -euo pipefail

# ── Configuration (surchargeable via l environnement) ─────────────────────────
SKY_DIR="${SKY_DIR:-/home/mitv/Sky}"
DB_DIR="${DB_DIR:-$SKY_DIR/database}"
DATABASES="${DATABASES:-sky.db auth.db}"
OFFSITE_HOST="${OFFSITE_HOST:-canari@10.0.0.3}"
OFFSITE_PATH="${OFFSITE_PATH:-sky-offsite}"   # relatif au home du user canari
RETENTION_DAYS="${RETENTION_DAYS:-14}"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)

log() { printf '[sky-backup] %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { printf '[sky-backup] ERROR %s\n' "$*" >&2; exit 1; }

command -v sqlite3 >/dev/null || fail "sqlite3 CLI requis (apt-get install sqlite3)"
command -v rsync >/dev/null || fail "rsync requis"

TS="$(date '+%Y%m%d-%H%M%S')"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/sky-backup.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

ssh "${SSH_OPTS[@]}" "$OFFSITE_HOST" "mkdir -p '$OFFSITE_PATH'"

for db in $DATABASES; do
  src="$DB_DIR/$db"
  if [ ! -f "$src" ]; then
    log "WARN base absente, ignoree: $src"
    continue
  fi
  name="${db%.db}"
  log "Dump SQLite $db (online backup)..."
  sqlite3 "$src" ".backup '$STAGE/${name}-$TS.db'"
  gzip "$STAGE/${name}-$TS.db"
  log "Envoi offsite $name ($(du -h "$STAGE/${name}-$TS.db.gz" | cut -f1))..."
  rsync -a --partial "$STAGE/${name}-$TS.db.gz" "$OFFSITE_HOST:$OFFSITE_PATH/"
done

# Retention offsite.
ssh "${SSH_OPTS[@]}" "$OFFSITE_HOST" \
  "find '$OFFSITE_PATH' -name '*-*.db.gz' -type f -mtime +$RETENTION_DAYS -delete" || true

log "Sauvegarde offsite terminee."
