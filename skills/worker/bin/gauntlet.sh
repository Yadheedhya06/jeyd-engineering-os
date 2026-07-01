#!/usr/bin/env bash
set -euo pipefail

# Resolve this script's REAL location (invoked through the install symlink,
# e.g. ~/.claude/skills/worker -> <repo>/skills/worker). realpath via node.
SELF="$(node -e 'const fs=require("fs");process.stdout.write(fs.realpathSync(process.argv[1]))' "$0")"
BIN="$(dirname "$SELF")"                              # <repo>/skills/worker/bin
REPO_KEY="${1:?usage: REPOS_JSON=<path> gauntlet.sh <repo-key> [--dry]}"
DRY="${2:-}"

# Where the per-repo working copies live (siblings). Override with WORK_DIR.
WORK="${WORK_DIR:-$(dirname "$PWD")}"

# Pull a JS expression out of the repo entry. loadManifest validates on every
# call, and getRepo throws on an unknown key -> non-zero -> fail-closed.
emit() {
  node --input-type=module -e "
import { loadManifest, getRepo } from '$BIN/manifest.mjs';
const r = getRepo(loadManifest(process.env.REPOS_JSON), '$REPO_KEY');
process.stdout.write(String($1));
"
}

NAME="$(emit "r.name")"
GATES="$(emit "(r.gates||[]).join(' ')")"
SERVICES="$(emit "(r.services||[]).join(' ')")"
ABS_REPO="$WORK/$NAME"

needs_pg() { case " $SERVICES " in *" postgres "*) return 0;; *) return 1;; esac; }

plan() {
  echo "repo: $REPO_KEY  name: $NAME  abs: $ABS_REPO  exists: $([ -d "$ABS_REPO" ] && echo yes || echo no)"
  echo "services: ${SERVICES:-<none>}"
  echo "gates: ${GATES:-<none>}"
  for g in $GATES; do
    echo "  $g: $(emit "(r.commands&&r.commands['$g'])||'<MISSING>'")"
  done
  if needs_pg; then
    command -v docker >/dev/null 2>&1 && echo "docker: available" || echo "docker: MISSING (postgres service fails closed)"
  fi
}

if [ "$DRY" = "--dry" ]; then plan; exit 0; fi

[ -d "$ABS_REPO" ] || { echo "FAIL: repo dir not found: $ABS_REPO (set WORK_DIR?)"; exit 2; }

run() {
  local label="$1" cmd="$2"
  [ -z "$cmd" ] && { echo "FAIL: gate '$label' has no command (fail-closed)"; exit 7; }
  echo "▶ $label: $cmd"
  ( cd "$ABS_REPO" && eval "$cmd" )
}

PGID=""
cleanup() { [ -n "$PGID" ] && docker rm -f "$PGID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

if needs_pg; then
  command -v docker >/dev/null 2>&1 || { echo "FAIL: docker required for $REPO_KEY (postgres service) — failing closed"; exit 3; }
  PG_DB="${POSTGRES_DB:-app_test}"
  PGID="$(docker run -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB="$PG_DB" -P postgres:15)"
  PGREADY=0
  for _ in $(seq 1 30); do
    docker exec "$PGID" pg_isready -U postgres >/dev/null 2>&1 && { PGREADY=1; break; }
    sleep 1
  done
  [ "$PGREADY" = 1 ] || { echo "FAIL: postgres did not become ready within 30s"; exit 5; }
  PORT="$(docker port "$PGID" 5432/tcp | head -1 | sed 's/.*://')"
  [ -n "$PORT" ] || { echo "FAIL: could not determine postgres port"; exit 5; }
  export DATABASE_URL="postgres://postgres:postgres@localhost:$PORT/$PG_DB"
  # Mirror DATABASE_URL into any extra env names the stack reads (e.g. DATABASE_URL_WS).
  if [ -n "${DB_ENV_VARS:-}" ]; then
    IFS=',' read -ra _extra <<< "$DB_ENV_VARS"
    for v in "${_extra[@]}"; do export "$v"="$DATABASE_URL"; done
  fi
  # Optional: apply NNNN_*.sql migrations from MIGRATIONS_DIR (skipped cleanly when unset).
  if [ -n "${MIGRATIONS_DIR:-}" ]; then
    shopt -s nullglob
    migs=("$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql)
    [ "${#migs[@]}" -gt 0 ] || { echo "FAIL: MIGRATIONS_DIR set but no NNNN_*.sql in $MIGRATIONS_DIR"; exit 6; }
    echo "▶ migrate: applying ${#migs[@]} migration(s) from $MIGRATIONS_DIR"
    for f in "${migs[@]}"; do
      echo "  $f"
      docker exec -i "$PGID" psql -U postgres -d "$PG_DB" -v ON_ERROR_STOP=1 < "$f" >/dev/null \
        || { echo "FAIL: migration $f"; exit 4; }
    done
  fi
fi

for g in $GATES; do
  run "$g" "$(emit "(r.commands&&r.commands['$g'])||''")"
done
echo "GAUNTLET GREEN: $REPO_KEY"
