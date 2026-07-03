#!/bin/bash
# Claude Code custom status line — self-contained, no third-party plugins.
# Reads Claude Code's JSON session data on stdin and prints two rows:
#   line 1:  model · current dir · git branch (+staged ~modified)
#   line 2:  context-window usage bar (green<70 / yellow<90 / red) · cost · time
# Safety: only ever reads git state of the current repo. Writes one small cache
# file under /tmp. Touches nothing else on the machine.

input=$(cat)

# --- extract fields (jq, null-safe) ---
MODEL=$(printf '%s' "$input"  | jq -r '.model.display_name // "Claude"')
DIR=$(printf '%s' "$input"    | jq -r '.workspace.current_dir // .cwd // "."')
PCT=$(printf '%s' "$input"    | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
COST=$(printf '%s' "$input"   | jq -r '.cost.total_cost_usd // 0')
DUR_MS=$(printf '%s' "$input" | jq -r '.cost.total_duration_ms // 0')
SESSION=$(printf '%s' "$input" | jq -r '.session_id // "default"')

# --- colors ---
CYAN=$'\033[36m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'
DIM=$'\033[2m';   RESET=$'\033[0m'

# --- git info, cached 5s per session so the bar stays snappy in big repos ---
CACHE="/tmp/cc-statusline-git-${SESSION}"
age() { echo $(( $(date +%s) - $(stat -f %m "$CACHE" 2>/dev/null || echo 0) )); }
if [ ! -f "$CACHE" ] || [ "$(age)" -gt 5 ]; then
  ( cd "$DIR" 2>/dev/null || exit 0
    if git rev-parse --git-dir >/dev/null 2>&1; then
      B=$(git branch --show-current 2>/dev/null)
      S=$(git diff --cached --numstat 2>/dev/null | wc -l | tr -d ' ')
      M=$(git diff --numstat 2>/dev/null | wc -l | tr -d ' ')
      printf '%s|%s|%s\n' "$B" "$S" "$M"
    else
      printf '||\n'
    fi
  ) > "$CACHE"
fi
IFS='|' read -r BRANCH STAGED MODIFIED < "$CACHE"

# --- context usage bar (10 cells), colored by threshold ---
if   [ "$PCT" -ge 90 ]; then BAR_COLOR="$RED"
elif [ "$PCT" -ge 70 ]; then BAR_COLOR="$YELLOW"
else                         BAR_COLOR="$GREEN"; fi
FILLED=$(( PCT / 10 )); [ "$FILLED" -gt 10 ] && FILLED=10
EMPTY=$(( 10 - FILLED ))
printf -v FILL "%${FILLED}s"; printf -v PAD "%${EMPTY}s"
BAR="${FILL// /█}${PAD// /░}"

# --- duration + cost formatting ---
MINS=$(( DUR_MS / 60000 )); SECS=$(( (DUR_MS % 60000) / 1000 ))
COST_FMT=$(printf '$%.2f' "$COST")

# --- line 1: identity + git ---
GIT=""
if [ -n "$BRANCH" ]; then
  GIT=" ${DIM}|${RESET} 🌿 ${BRANCH}"
  [ "${STAGED:-0}"   -gt 0 ] && GIT="${GIT} ${GREEN}+${STAGED}${RESET}"
  [ "${MODIFIED:-0}" -gt 0 ] && GIT="${GIT} ${YELLOW}~${MODIFIED}${RESET}"
fi
printf '%b\n' "${CYAN}${MODEL}${RESET} 📁 ${DIR##*/}${GIT}"

# --- line 2: context bar + cost + time ---
printf '%b\n' "${BAR_COLOR}${BAR}${RESET} ${PCT}% ctx ${DIM}|${RESET} ${COST_FMT} ${DIM}|${RESET} ⏱ ${MINS}m${SECS}s"
