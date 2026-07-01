#!/usr/bin/env bash
set -euo pipefail
SELF="$(node -e 'const fs=require("fs");process.stdout.write(fs.realpathSync(process.argv[1]))' "$0")"
HUB="$(cd "$(dirname "$SELF")/../../.." && pwd)"        # <repo>/skills/orchestrate/bin -> <repo root>
WORK="${WORK_DIR:-$(dirname "$HUB")}"
MODE="${1:-}"

# Reject unknown modes — never silently downgrade a mistyped --full to lightweight.
case "$MODE" in
  ''|--dry|--full) ;;
  *) echo "usage: gate.sh [--dry|--full]  (got: $MODE)"; exit 64 ;;
esac

CONFIG="$HUB/skills/orchestrate/bin/config.mjs"
keys() { node "$CONFIG" names; }
get()  { node "$CONFIG" field "$1" "$2"; }

# Resolve a gate name to its command string by reading the commands map from repos.json.
# Fails closed (exit 1) when the gate has no configured command.
gate_cmd() {
  local repo_key="$1" gate_name="$2"
  node --input-type=module -e "
import { readFileSync } from 'node:fs';
const p = process.env.REPOS_JSON || 'repos.json';
const cfg = JSON.parse(readFileSync(p, 'utf8'));
const r = (cfg.repos||[]).find(r=>r.name==='$repo_key');
const cmd = r && r.commands && r.commands['$gate_name'];
if (typeof cmd === 'string' && cmd.trim()) process.stdout.write(cmd);
else { process.stderr.write('FAIL: no command for gate \"$gate_name\" in repo \"$repo_key\" (fail-closed)\n'); process.exit(1); }
"
}

# Capture the repo set on its OWN line so set -e catches a manifest read/parse failure,
# then fail closed if empty. A gate that validated zero repos must NEVER report GREEN.
KEYS="$(keys)" || { echo "FAIL: cannot read config (repos.json)"; exit 7; }
[ -n "${KEYS// /}" ] || { echo "FAIL: manifest defines no repos"; exit 7; }

if [ "$MODE" = "--dry" ]; then
  echo "global integration gate plan (lightweight = drift + conformance per repo; --full adds ephemeral PG + full test)"
  echo "drift: node $HUB/skills/orchestrate/bin/drift.mjs"
  for k in $KEYS; do echo "conformance[$k]: $(get "$k" gates)"; done
  command -v docker >/dev/null 2>&1 && echo "docker: available (--full possible)" || echo "docker: MISSING (--full would fail closed)"
  exit 0
fi

LOGDIR="$WORK/.orchestrate/logs"
mkdir -p "$LOGDIR" 2>/dev/null || true
LOG="$LOGDIR/gate-$(date +%Y%m%d-%H%M%S)-$$.log"
exec > >(tee -a "$LOG") 2>&1
echo "# gate run $(date -u +%Y-%m-%dT%H:%M:%SZ) mode=${MODE:-lightweight}"

DRIFT_JSON="$(mktemp -t drift.XXXXXX)"
cleanup() { rm -f "$DRIFT_JSON"; }
trap cleanup EXIT

echo "▶ drift check"
WORK_DIR="$WORK" node "$HUB/skills/orchestrate/bin/drift.mjs" > "$DRIFT_JSON" \
  || { echo "FAIL: drift check errored"; exit 2; }
cat "$DRIFT_JSON"
node -e 'process.exit(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok?0:1)' "$DRIFT_JSON" \
  || { echo "FAIL: contract-pin drift detected"; exit 2; }

FULL=0; [ "$MODE" = "--full" ] && FULL=1
for k in $KEYS; do
  abs="$WORK/$k"
  [ -d "$abs" ] || { echo "FAIL: $k dir missing ($abs)"; exit 3; }
  GATES_LIST="$(get "$k" gates)"
  [ -n "${GATES_LIST// /}" ] || { echo "FAIL: $k has no gates configured"; exit 4; }
  echo "▶ conformance[$k] (gates: $GATES_LIST)"
  for g in $GATES_LIST; do
    gcmd="$(gate_cmd "$k" "$g")" || { echo "FAIL: $k gate '$g' has no command — failing closed"; exit 4; }
    echo "  ▶ $g: $gcmd"
    ( cd "$abs" && eval "$gcmd" ) || { echo "FAIL: conformance $k gate $g"; exit 4; }
  done
done

if [ "$FULL" = 1 ]; then
  command -v docker >/dev/null 2>&1 || { echo "FAIL: --full needs docker — failing closed"; exit 5; }
  # P2/P3 seam: gauntlet.sh is not yet ported to skills/orchestrate/bin.
  # Invoking the legacy worker path before P3 lands would be a broken engine ref — fail closed instead.
  echo "▶ --full: per-repo gauntlet (ephemeral PG) via orchestrate"
  { echo "FAIL: --full gauntlet not yet ported (P2/P3 seam)"; exit 5; }
fi
echo "GLOBAL GATE GREEN (mode=${MODE:-lightweight})"
