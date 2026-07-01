#!/usr/bin/env bash
# Compact progress dashboard for spawned workers on one repo.
# Usage: progress.sh <repo-key>   (wrap in `watch -n 15 progress.sh <repo>` for a live view)
set -euo pipefail
export GH_PAGER=cat GIT_PAGER=cat PAGER=cat   # never open a pager — this is a refreshing dashboard
SELF="$(node -e 'const fs=require("fs");process.stdout.write(fs.realpathSync(process.argv[1]))' "$0")"
HUB="$(cd "$(dirname "$SELF")/../../.." && pwd)"
WORK="${WORK_DIR:-$(dirname "$HUB")}"
LOGS="$WORK/.orchestrate/logs"
REPO_KEY="${1:?usage: progress.sh <repo-key>}"

CONFIG="$HUB/skills/orchestrate/bin/config.mjs"
get() { node "$CONFIG" field "$REPO_KEY" "$1"; }
OWNER="$(get owner)"
ABS="$WORK/$REPO_KEY"

echo "═══ $OWNER/$REPO_KEY  @ $(date '+%H:%M:%S') ═══"
[ -f "$WORK/.orchestrate/PAUSE" ] && echo "⏸  PAUSE is set — merges halted"

ISS="$(gh issue list -R "$OWNER/$REPO_KEY" --state open --json number --jq 'length' 2>/dev/null || echo '?')"
PRO="$(gh pr list -R "$OWNER/$REPO_KEY" --state open --json number --jq 'length' 2>/dev/null || echo '?')"
MRG="$(gh pr list -R "$OWNER/$REPO_KEY" --state merged --limit 100 --search 'created:>'"$(date -u -v-1d '+%Y-%m-%d' 2>/dev/null || date -u '+%Y-%m-%d')" --json number --jq 'length' 2>/dev/null || echo '?')"
echo "open issues: $ISS   |   open PRs: $PRO   |   merged (last ~1d): $MRG"

echo "── open PRs + checks ──"
gh pr list -R "$OWNER/$REPO_KEY" --json number,title,statusCheckRollup \
  --jq '.[] | "  #\(.number)  [\((.statusCheckRollup // []) | map(.conclusion // .state // .status // "?") | (if any(test("FAIL|ERROR";"i")) then "RED" elif any(test("PENDING|IN_PROGRESS|QUEUED";"i")) then "RUN" elif length==0 then "none" else "green" end))]  \(.title[0:56])"' \
  2>/dev/null || echo "  (gh unavailable or none)"

echo "── workers (per-issue worktree, last log line) ──"
shown=0
if [ -d "$ABS/.worktrees" ]; then
  for wt in "$ABS"/.worktrees/issue-* "$ABS"/.worktrees/pr-*; do
    [ -d "$wt" ] || continue
    n="$(basename "$wt" | sed 's/issue-//')"
    log="$LOGS/worker-$REPO_KEY-$n.log"
    if [ -f "$log" ]; then last="$(tail -n 1 "$log" 2>/dev/null | tr -d '\r' | cut -c1-88)"; else last="(starting…)"; fi
    echo "  issue #$n: ${last:-…}"
    shown=1
  done
fi
[ "$shown" = 0 ] && echo "  (no active worktrees — none spawned yet, or all finished/cleaned up)"
