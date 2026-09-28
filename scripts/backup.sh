#!/usr/bin/env bash
#
# Full backup of Sky's SQLite database, the same shape as Canari's and le Cercle's backup.sh.
#
# Produces one timestamped archive holding a consistent VACUUM INTO snapshot of the running
# database, plus a manifest derived from what was actually archived. Keeps the last N days
# locally, then mirrors the archive offsite over SSH.
#
# Meant to run from cron as the deploy user, or by hand:
#   /srv/sky/scripts/backup.sh
#
# No host dependency beyond Docker and SSH/rsync. The snapshot is taken INSIDE the container with
# `bun:sqlite`, so the host needs no sqlite3 CLI and the database is never read from outside the
# process that writes it.
#
set -euo pipefail

# -- Configuration (overridable via environment) -----------------------------
BACKUP_DIR="${BACKUP_DIR:-/srv/sky-backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
# compose names it <project>-<service>-1, and the project is the deploy directory's name (`sky`).
SKY_CONTAINER="${SKY_CONTAINER:-sky-sky-1}"
DB_DIR_IN_CONTAINER="${DB_DIR_IN_CONTAINER:-/app/database}"
# Offsite mirror: the mitv NAS, over the School network - the same account and path shape
# Canari's own backup uses every night. An EMPTY BACKUP_SSH_HOST disables it, and that is the only
# gesture that does - hence `-` and not `:-` below: `:-` treats empty as unset and puts the default
# back, so "empty disables" would be a comment the code contradicts (found by running it).
BACKUP_SSH_HOST="${BACKUP_SSH_HOST-canaribackup@10.0.0.4}"
BACKUP_SSH_PATH="${BACKUP_SSH_PATH:-/srv/sky-backups}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)

log() { printf '[sky-backup] %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { printf '[sky-backup] ERROR %s\n' "$*" >&2; exit 1; }

docker inspect "$SKY_CONTAINER" >/dev/null 2>&1 || fail "container ${SKY_CONTAINER} not found"

TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/sky-backup.XXXXXX")"
ARCHIVE_PATH="${BACKUP_DIR}/sky-backup-${TIMESTAMP}.tar.gz"
SNAPSHOT_PREFIX="/tmp/sky-backup-${TIMESTAMP}"
trap 'rm -rf "$STAGE"; docker exec "$SKY_CONTAINER" sh -c "rm -f ${SNAPSHOT_PREFIX}-*" >/dev/null 2>&1 || true' EXIT

mkdir -p "$BACKUP_DIR"
log "Starting backup -> $ARCHIVE_PATH"

# -- 1. Consistent snapshots --------------------------------------------------
# VACUUM INTO is the documented-safe way to copy a live SQLite database; a `cp` while the app
# writes is how a backup ends up subtly corrupt. sky.db carries the sessions too, so a restore
# signs nobody out.
snapshot() {
  local name="$1"
  log "VACUUM INTO a consistent snapshot of ${name}..."
  docker exec "$SKY_CONTAINER" bun -e "
    const { Database } = require('bun:sqlite');
    new Database('${DB_DIR_IN_CONTAINER}/${name}', { readonly: true }).exec(\"VACUUM INTO '${SNAPSHOT_PREFIX}-${name}'\");
  " || fail "VACUUM INTO of ${name} failed"
  docker cp "${SKY_CONTAINER}:${SNAPSHOT_PREFIX}-${name}" "$STAGE/${name}" || fail "docker cp of ${name} failed"
  gzip "$STAGE/${name}"
}
snapshot sky.db

# positions.json is the star map's layout. It is recomputed on a mutation, never at start, so a
# restore without it shows a clumped map until the next edit. A database that has never been laid
# out has none, and the manifest says so rather than the archive pretending otherwise.
if docker exec "$SKY_CONTAINER" test -f "${DB_DIR_IN_CONTAINER}/positions.json"; then
  docker cp "${SKY_CONTAINER}:${DB_DIR_IN_CONTAINER}/positions.json" "$STAGE/positions.json" \
    || fail "docker cp of positions.json failed"
else
  log "positions.json absent in the container - never laid out, archived without it"
fi

# -- 2. Manifest, derived from what was actually produced --------------------
MEMBERS=""
for member in "$STAGE"/*; do
  MEMBERS="${MEMBERS}  - $(basename "$member")  ($(du -h "$member" | cut -f1))
"
done
cat >"$STAGE/MANIFEST.txt" <<EOF
Sky backup
timestamp: $TIMESTAMP
created_by: $(whoami)@$(hostname)
container: ${SKY_CONTAINER}
content (listed from what was actually archived):
${MEMBERS}
sky.db holds people, relationships and sessions; positions.json is the star map's layout,
recomputed only on a mutation. auth.db has had no writer since 2026-02 and is not archived.
EOF

tar czf "$ARCHIVE_PATH" -C "$STAGE" .
log "Archive written ($(du -h "$ARCHIVE_PATH" | cut -f1))"

# -- 3. Local retention -------------------------------------------------------
find "$BACKUP_DIR" -maxdepth 1 -name 'sky-backup-*.tar.gz' -type f \
  -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete || true

# -- 4. Offsite mirror --------------------------------------------------------
if [ -n "$BACKUP_SSH_HOST" ]; then
  log "Sending offsite to ${BACKUP_SSH_HOST}:${BACKUP_SSH_PATH}..."
  rsync -a --partial -e "ssh ${SSH_OPTS[*]}" "$ARCHIVE_PATH" "${BACKUP_SSH_HOST}:${BACKUP_SSH_PATH}/" \
    || fail "offsite copy failed - the local archive is written, the mirror is not"
  # The path and the retention are LOCAL settings, meant to reach the remote shell expanded.
  # shellcheck disable=SC2029
  ssh "${SSH_OPTS[@]}" "$BACKUP_SSH_HOST" \
    "find '$BACKUP_SSH_PATH' -maxdepth 1 -name 'sky-backup-*.tar.gz' -type f -mtime +${BACKUP_RETENTION_DAYS} -delete" \
    || log "WARN offsite purge incomplete"
  log "Offsite copy succeeded"
else
  log "WARN offsite disabled (BACKUP_SSH_HOST empty) - local backup only"
fi

log "Backup complete: $ARCHIVE_PATH"
