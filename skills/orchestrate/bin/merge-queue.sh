#!/usr/bin/env bash
# Serial merge coordinator: rebases each agent PR onto the latest default branch,
# waits for checks, merges, then the next — so concurrent workers never conflict.
# Usage: merge-queue.sh <repo-key> [--go] [--loop]
#   (dry-run lists the queue; --go actually merges; --loop keeps draining until
#    no agent PRs remain and no workers are running.)
set -euo pipefail
export GH_PAGER=cat GIT_PAGER=cat PAGER=cat
SELF="$(node -e 'const fs=require("fs");process.stdout.write(fs.realpathSync(process.argv[1]))' "$0")"
HUB="$(cd "$(dirname "$SELF")/../../.." && pwd)"
WORK="${WORK_DIR:-$(dirname "$HUB")}"
ORCH="$WORK/.orchestrate"

REPO_KEY="${1:?usage: merge-queue.sh <repo-key> [--go] [--loop]}"; shift || true
GO=0; LOOP=0
for a in "$@"; do
  case "$a" in --go) GO=1;; --loop) LOOP=1;; *) echo "unknown arg $a"; exit 64;; esac
done

CONFIG="$HUB/skills/orchestrate/bin/config.mjs"
get() { node "$CONFIG" field "$REPO_KEY" "$1"; }
OWNER="$(get owner)"
RR="$OWNER/$REPO_KEY"
DEFAULT_BRANCH="$(gh repo view "$RR" --json defaultBranchRef --jq .defaultBranchRef.name 2>/dev/null || echo main)"

list_prs() { # open agent PRs, oldest first (so earlier issues merge first)
  gh pr list -R "$RR" --state open --json number,headRefName,createdAt \
    --jq 'sort_by(.createdAt) | .[] | select(.headRefName|test("agent/issue-")) | .number' 2>/dev/null || true
}
workers_running() { pgrep -f 'worker skill to work issue' 2>/dev/null | wc -l | tr -d ' '; }

drain_once() {
  local prs pr
  prs="$(list_prs)"
  if [ -z "$prs" ]; then echo "merge-queue $RR: no ready agent PRs."; return 0; fi
  echo "merge-queue $RR: queued -> $(echo "$prs" | tr '\n' ' ')"
  [ "$GO" = 1 ] || { echo "DRY RUN — add --go to rebase+merge serially (oldest first)."; return 0; }
  for pr in $prs; do
    [ -f "$ORCH/PAUSE" ] && { echo "  PAUSE — stopping queue."; return 0; }
    echo "── PR #$pr ──"
    if ! gh pr update-branch "$pr" -R "$RR" >/dev/null 2>&1; then
      echo "  ✗ conflict with $DEFAULT_BRANCH — left open for manual resolution; skipping."
      gh pr comment "$pr" -R "$RR" --body "merge-queue: cannot auto-update onto $DEFAULT_BRANCH (conflict). Needs manual rebase/resolution." >/dev/null 2>&1 || true
      continue
    fi
    sleep 10   # let the rebase commit's checks register before watching
    echo "  rebased onto $DEFAULT_BRANCH; waiting for checks…"
    if ! gh pr checks "$pr" -R "$RR" --watch >/dev/null 2>&1; then
      echo "  ✗ checks red/absent after rebase — left open; skipping."
      gh pr comment "$pr" -R "$RR" --body "merge-queue: checks failed (or none) after updating to latest $DEFAULT_BRANCH; not merging." >/dev/null 2>&1 || true
      continue
    fi
    if gh pr merge "$pr" -R "$RR" --squash --delete-branch >/dev/null 2>&1; then
      echo "  ✓ merged #$pr"
    else
      echo "  ✗ merge refused (not mergeable / branch protection) — left open."
    fi
  done
}

while :; do
  if [ -f "$ORCH/PAUSE" ]; then
    echo "PAUSE present — merge-queue idle."
    [ "$LOOP" = 1 ] && { sleep 30; continue; } || exit 0
  fi
  drain_once
  [ "$LOOP" = 1 ] || break
  if [ -z "$(list_prs)" ] && [ "$(workers_running)" -eq 0 ]; then
    echo "merge-queue $RR: queue empty + no workers running — done."; break
  fi
  sleep 30
done
