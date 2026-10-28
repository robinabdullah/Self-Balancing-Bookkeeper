#!/usr/bin/env bash
# Release Self-Balancing Bookkeeper on the partners' VPS (D-031, D-071). Run as `ubuntu` in the
# repo clone:
#
#   cd ~/Self-Balancing-Bookkeeper && git pull && bash scripts/deploy.sh
#   bash scripts/deploy.sh --rollback      swap the live copy with the previous one
#
# Builds here (web's Next.js standalone and the api's bundle), migrates once, then copies both to
# $APP_DIR and restarts the api, then web; the previous copy is kept as $APP_DIR-old. A failed
# build or migration leaves $APP_DIR untouched. See deploy/README.md.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/self-balancing-bookkeeper}"
SERVICE="${SERVICE:-self-balancing-bookkeeper}"
API_SERVICE="${API_SERVICE:-self-balancing-bookkeeper-api}"
# The ports are set in the two unit files (web 4007, api 4006).
WEB_CHECK="${WEB_CHECK:-http://127.0.0.1:4007/login}"
API_CHECK="${API_CHECK:-http://127.0.0.1:4006/health}"
NEW="$APP_DIR-new"
OLD="$APP_DIR-old"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# N-7.1 (D-068): the clone's one `.env.local` is split per app; web never gets the database URL
# or the card key. SUPABASE_JWT_SECRET is optional (a legacy HS256 project only).
WEB_KEYS=(NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY)
API_KEYS=(DATABASE_URL SUPABASE_URL SUPABASE_ANON_KEY CARD_SECRET_KEY)
API_OPTIONAL=(SUPABASE_JWT_SECRET)

# Node comes from nvm on the VPS; load it when the caller's shell hasn't.
if ! command -v npm >/dev/null && [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
fi

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'deploy: %s\n' "$*" >&2; exit 1; }

# True once the URL answers 2xx (about 30 s at most).
wait_for() {
  local i
  for ((i = 0; i < 30; i++)); do
    if curl -fs -o /dev/null --max-time 5 "$1"; then return 0; fi
    sleep 1
  done
  return 1
}

# Start the live copy: the api, then web, each with its check.
start_units() {
  sudo systemctl restart "$API_SERVICE" || return 1
  wait_for "$API_CHECK" || return 1
  sudo systemctl restart "$SERVICE" || return 1
  wait_for "$WEB_CHECK"
}

# The live copy's release, for the log.
live_rev() { cat "$APP_DIR/RELEASE" 2>/dev/null || echo "unknown"; }

# Copy the listed keys' lines from .env.local into a copy's env file (mode 600, the caller's).
write_env() {
  local file="$1"; shift
  local IFS='|'
  grep -E "^($*)=" .env.local | sudo tee "$file" >/dev/null || true
  sudo chown "$(id -un):$(id -gn)" "$file"
  sudo chmod 600 "$file"
}

rollback() {
  [[ -d "$OLD" ]] || die "no previous copy at $OLD"
  log "Swapping $APP_DIR with $OLD"
  sudo mv "$APP_DIR" "$APP_DIR-swap"
  sudo mv "$OLD" "$APP_DIR"
  sudo mv "$APP_DIR-swap" "$OLD"
  start_units || die "not running after the rollback; check: journalctl -u $API_SERVICE -u $SERVICE"
  log "Rolled back to $(live_rev)"
}

deploy() {
  cd "$REPO_DIR"
  [[ -f .env.local ]] || die "missing $REPO_DIR/.env.local (see deploy/README.md)"
  local key rev
  for key in "${WEB_KEYS[@]}" "${API_KEYS[@]}"; do
    grep -qE "^$key=." .env.local || die "missing $key in .env.local (see deploy/README.md)"
  done
  rev="$(git rev-parse --abbrev-ref HEAD) $(git rev-parse --short HEAD)"

  log "Installing (npm ci) for $rev"
  nice -n 19 npm ci --include=dev --no-audit --no-fund

  log "Building web and the api at low CPU priority"
  NEXT_TELEMETRY_DISABLED=1 nice -n 19 npm run build
  nice -n 19 npm run build:api

  log "Migrating the database"
  npm run db:migrate

  # N-1.2: web is apps/web of a workspace; its standalone tree keeps that layout, so web's unit
  # runs apps/web/server.js.
  log "Copying the build to $NEW"
  sudo rm -rf "$NEW"
  sudo cp -a apps/web/.next/standalone "$NEW"
  sudo cp -a apps/web/.next/static "$NEW/apps/web/.next/static"
  if [[ -d apps/web/public ]]; then sudo cp -a apps/web/public "$NEW/apps/web/public"; fi
  sudo cp -a apps/api/dist "$NEW/api"
  write_env "$NEW/web.env" "${WEB_KEYS[@]}"
  write_env "$NEW/api.env" "${API_KEYS[@]}" "${API_OPTIONAL[@]}"
  echo "$rev" | sudo tee "$NEW/RELEASE" >/dev/null

  log "Switching to the new copy and restarting $API_SERVICE, then $SERVICE"
  sudo rm -rf "$OLD"
  if [[ -d "$APP_DIR" ]]; then sudo mv "$APP_DIR" "$OLD"; fi
  sudo mv "$NEW" "$APP_DIR"
  if ! start_units; then
    if [[ -d "$OLD" ]]; then
      sudo rm -rf "$APP_DIR"
      sudo mv "$OLD" "$APP_DIR"
      start_units || true
      die "the new copy did not start; moved the old one back ($(live_rev)). Check: journalctl -u $API_SERVICE -u $SERVICE"
    fi
    die "the new copy did not start. Check: journalctl -u $API_SERVICE -u $SERVICE"
  fi

  log "Deployed $rev"
}

# One release at a time.
exec 9>/tmp/self-balancing-bookkeeper-deploy.lock
flock -n 9 || die "another deploy is running"

case "${1:-}" in
  "") deploy ;;
  --rollback) rollback ;;
  *) die "usage: $0 [--rollback]" ;;
esac
