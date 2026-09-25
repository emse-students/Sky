#!/usr/bin/env bash
#
# Restore Sky's database from an archive written by backup.sh.
#
#   /srv/sky/scripts/restore.sh --yes                     # the newest LOCAL archive
#   /srv/sky/scripts/restore.sh --yes --offsite           # the newest archive on the offsite mirror
#   /srv/sky/scripts/restore.sh --yes --archive <path>    # that archive
#
# DESTRUCTIVE: replaces database/sky.db. Requires --yes. The database it replaces is kept beside
# it as sky.db.before-restore-<timestamp>. Where the archive comes from is always NAMED on the
# command line - it never falls back from local to offsite, because a restore that silently took
# an older copy from elsewhere is one nobody can reason about afterwards.
#
set -euo pipefail

SKY_DIR="${SKY_DIR:-/srv/sky}"
DB_DIR="${DB_DIR:-$SKY_DIR/database}"
BACKUP_DIR="${BACKUP_DIR:-/srv/sky-backups}"
BACKUP_SSH_HOST="${BACKUP_SSH_HOST-canaribackup@10.0.0.4}"
BACKUP_SSH_PATH="${BACKUP_SSH_PATH:-/srv/sky-backups}"
COMPOSE="docker compose -f $SKY_DIR/docker-compose.prod.yml --project-directory $SKY_DIR"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)

log() { printf '[sky-restore] %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { printf '[sky-restore] ERROR %s\n' "$*" >&2; exit 1; }

CONFIRM=no SOURCE=local ARCHIVE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) CONFIRM=yes ;;
    --offsite) SOURCE=offsite ;;
    --archive) SOURCE=path; ARCHIVE="${2:-}"; shift ;;
    *) fail "unknown option: $1" ;;
  esac
  shift
done
[ "$CONFIRM" = yes ] || fail "DESTRUCTIVE operation. Re-run with --yes"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

case "$SOURCE" in
  local)
    # The timestamp in the name sorts as a string, so the newest archive is the last one by name.
    ARCHIVE="$(find "$BACKUP_DIR" -maxdepth 1 -name 'sky-backup-*.tar.gz' -type f | sort | tail -1)"
    [ -n "$ARCHIVE" ] || fail "no local archive in $BACKUP_DIR - name one with --archive, or use --offsite"
    ;;
  offsite)
    # shellcheck disable=SC2029
    latest="$(ssh "${SSH_OPTS[@]}" "$BACKUP_SSH_HOST" "find '$BACKUP_SSH_PATH' -maxdepth 1 -name 'sky-backup-*.tar.gz' -type f | sort | tail -1")"
    [ -n "$latest" ] || fail "no archive on ${BACKUP_SSH_HOST}:${BACKUP_SSH_PATH}"
    rsync -a -e "ssh ${SSH_OPTS[*]}" "${BACKUP_SSH_HOST}:${latest}" "$STAGE/"
    ARCHIVE="$STAGE/$(basename "$latest")"
    ;;
  path)
    [ -f "$ARCHIVE" ] || fail "--archive needs an existing file, got '${ARCHIVE}'"
    ;;
esac
log "Restoring from $ARCHIVE"

# backup.sh archives `-C <stage> .`, so members are `./sky.db.gz` and `./MANIFEST.txt`: extract all
# of it and check for the two files, rather than naming members whose prefix is an implementation detail.
tar xzf "$ARCHIVE" -C "$STAGE" || fail "cannot read archive: $ARCHIVE"
if [ ! -f "$STAGE/sky.db.gz" ] || [ ! -f "$STAGE/MANIFEST.txt" ]; then
  fail "not a backup.sh archive: $ARCHIVE"
fi
sed 's/^/  /' "$STAGE/MANIFEST.txt"
gunzip "$STAGE/sky.db.gz"

log "Stopping Sky..."
$COMPOSE stop sky
mkdir -p "$DB_DIR"
dest="$DB_DIR/sky.db"
if [ -f "$dest" ]; then
  cp -p "$dest" "$dest.before-restore-$(date '+%Y%m%d-%H%M%S')"
fi
# Replace the file's CONTENT and keep its inode, owner and mode: the container writes it, and a
# restored file carrying the stage's owner is a database that reads and cannot be written.
cat "$STAGE/sky.db" >"$dest"
log "Restored -> $dest"

log "Starting Sky..."
$COMPOSE up -d sky
log "Restore complete."
