# shellcheck shell=bash
#
# Where the backups go, read by backup.sh and restore.sh (sourced, never run).
#
# The destinations are OPERATIONS data, not code: this public repository names no host, account or
# path for them. The deploy writes `backup.env` beside these scripts from the repository secrets
# `BACKUP_DIR`, `BACKUP_SSH_HOST` and `BACKUP_SSH_PATH` (deploy.yml), and refuses to deploy without
# them. A variable already set in the environment wins over the file: the cron line sets
# `BACKUP_DIR` on purpose (MIGRATION.md), and an EMPTY `BACKUP_SSH_HOST` is the one gesture that
# disables the offsite mirror.
#
# A missing value is a hard failure, never a default: a backup that silently writes
# somewhere else, or silently stops mirroring, is worse than one that fails. The caller defines
# `fail` before sourcing this file.

BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup.env}"

# Reads KEY=VALUE lines WITHOUT executing them, and refuses an unknown key so a typo cannot pass
# for a setting.
# The file may be absent only when the environment names every value itself: a restore on a new
# server, before its first deploy, has no backup.env yet.
load_backup_config() {
  local key value
  if [ -r "$BACKUP_ENV_FILE" ]; then
    while IFS='=' read -r key value || [ -n "$key" ]; do
      case "$key" in
        '' | '#'*) continue ;;
        BACKUP_DIR | BACKUP_SSH_HOST | BACKUP_SSH_PATH) ;;
        *) fail "unknown key '${key}' in ${BACKUP_ENV_FILE}" ;;
      esac
      # Only a variable that is UNSET takes the file's value: set-but-empty is a decision.
      if [ -z "${!key+x}" ]; then printf -v "$key" '%s' "$value"; fi
    done <"$BACKUP_ENV_FILE"
  fi

  local where="export it, or deploy (which writes ${BACKUP_ENV_FILE} from the BACKUP_* repository secrets)"
  [ -n "${BACKUP_DIR:-}" ] || fail "BACKUP_DIR is not set: ${where}"
  [ -n "${BACKUP_SSH_HOST+x}" ] \
    || fail "BACKUP_SSH_HOST is not set: ${where}; set it EMPTY to disable the mirror"
  if [ -n "$BACKUP_SSH_HOST" ] && [ -z "${BACKUP_SSH_PATH:-}" ]; then
    fail "BACKUP_SSH_PATH is not set while the mirror is enabled: ${where}"
  fi
}
