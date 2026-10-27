#!/usr/bin/env bash
# Release Mobile Business Lite on the partners' VPS (D-031). Run as `ubuntu` in the repo clone:
#
#   cd ~/Mobile-Business-Lite && git pull && bash scripts/deploy.sh
#   bash scripts/deploy.sh --rollback      swap the live copy with the previous one
#
# Builds here (Next.js standalone), migrates, then copies the build to $APP_DIR and restarts the
# service; the previous copy is kept as $APP_DIR-old. A failed build or migration leaves $APP_DIR
# untouched. See deploy/README.md.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/mobile-business}"
SERVICE="${SERVICE:-mobile-business}"
NEW="$APP_DIR-new"
OLD="$APP_DIR-old"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Node comes from nvm on the VPS; load it when the caller's shell hasn't.
if ! command -v npm >/dev/null && [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
fi

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'deploy: %s\n' "$*" >&2; exit 1; }

# Restart the service; true when it is still running a few seconds later.
restart_ok() {
  sudo systemctl restart "$SERVICE" || return 1
  sleep 5
  systemctl is-active --quiet "$SERVICE"
}

rollback() {
  [[ -d "$OLD" ]] || die "no previous copy at $OLD"
  log "Swapping $APP_DIR with $OLD"
  sudo mv "$APP_DIR" "$APP_DIR-swap"
  sudo mv "$OLD" "$APP_DIR"
  sudo mv "$APP_DIR-swap" "$OLD"
  restart_ok || die "$SERVICE is not running after the rollback; check: journalctl -u $SERVICE"
  log "Rolled back"
}

deploy() {
  cd "$REPO_DIR"
  [[ -f .env.local ]] || die "missing $REPO_DIR/.env.local (see deploy/README.md)"
  local rev
  rev="$(git rev-parse --abbrev-ref HEAD) $(git rev-parse --short HEAD)"

  log "Installing (npm ci) for $rev"
  nice -n 19 npm ci --include=dev --no-audit --no-fund

  log "Building at low CPU priority"
  NEXT_TELEMETRY_DISABLED=1 nice -n 19 npm run build

  log "Migrating the database"
  npx drizzle-kit migrate

  # N-1.2: the app is apps/web of a workspace; its standalone tree keeps that layout, with
  # server.js in apps/web next to its static files and `.env.local`.
  log "Copying the build to $NEW"
  sudo rm -rf "$NEW"
  sudo cp -a apps/web/.next/standalone "$NEW"
  sudo cp -a apps/web/.next/static "$NEW/apps/web/.next/static"
  if [[ -d apps/web/public ]]; then sudo cp -a apps/web/public "$NEW/apps/web/public"; fi
  sudo cp -a .env.local "$NEW/apps/web/.env.local"

  log "Switching to the new copy and restarting $SERVICE"
  sudo rm -rf "$OLD"
  if [[ -d "$APP_DIR" ]]; then sudo mv "$APP_DIR" "$OLD"; fi
  sudo mv "$NEW" "$APP_DIR"
  if ! restart_ok; then
    if [[ -d "$OLD" ]]; then
      sudo rm -rf "$APP_DIR"
      sudo mv "$OLD" "$APP_DIR"
      sudo systemctl restart "$SERVICE" || true
      die "$SERVICE did not start; moved the old copy back. Check: journalctl -u $SERVICE"
    fi
    die "$SERVICE did not start. Check: journalctl -u $SERVICE"
  fi

  log "Deployed $rev"
}

# One release at a time.
exec 9>/tmp/mobile-business-deploy.lock
flock -n 9 || die "another deploy is running"

case "${1:-}" in
  "") deploy ;;
  --rollback) rollback ;;
  *) die "usage: $0 [--rollback]" ;;
esac
