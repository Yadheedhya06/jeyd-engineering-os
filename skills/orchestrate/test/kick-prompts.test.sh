#!/usr/bin/env bash
set -euo pipefail
SRC="$(dirname "$0")/../bin/run.sh"
grep -q 'RATIONALE:START' "$SRC" || { echo "FAIL: KICK_BUNDLE missing RATIONALE block"; exit 1; }
echo "ok: rationale block present"
for fn in KICK_PLANNER KICK_BUNDLE KICK_MERGER KICK_COORD; do
  body="$(awk -v f="$fn" '$0 ~ f"\\(\\) \\{" {print}' "$SRC")"
  echo "$body" | grep -q 'HEADLESS' || { echo "FAIL: $fn missing HEADLESS directive"; exit 1; }
  echo "$body" | grep -q 'NEVER ask' || { echo "FAIL: $fn missing 'NEVER ask'"; exit 1; }
done
grep -q 'issues-for-pr' "$SRC" || { echo "FAIL: KICK_MERGER missing issues-for-pr wiring"; exit 1; }
echo "ok: KICK_MERGER references issues-for-pr"
echo "ok: all kick prompts have HEADLESS directive"
