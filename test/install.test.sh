#!/usr/bin/env bash
# Verifies install.sh links every skill into CLAUDE_SKILLS_DIR and is
# idempotent (a second run must not error and must not change the link set).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # repo root
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

# Build a fake repo: the real install.sh + two dummy skills.
mkdir -p "$work/repo/skills/alpha/bin" "$work/repo/skills/beta/bin"
cp "$here/install.sh" "$work/repo/install.sh"
echo "alpha" > "$work/repo/skills/alpha/SKILL.md"
echo "beta"  > "$work/repo/skills/beta/SKILL.md"

dest="$work/dest"
export CLAUDE_SKILLS_DIR="$dest"

bash "$work/repo/install.sh" >/dev/null            # first run
bash "$work/repo/install.sh" >/dev/null            # second run (idempotency)

[ -L "$dest/alpha" ] || { echo "FAIL: alpha is not a symlink"; exit 1; }
[ -L "$dest/beta" ]  || { echo "FAIL: beta is not a symlink";  exit 1; }
[ "$(readlink "$dest/alpha")" = "$work/repo/skills/alpha/" ] \
  || { echo "FAIL: alpha target wrong: $(readlink "$dest/alpha")"; exit 1; }
[ -f "$dest/alpha/SKILL.md" ] || { echo "FAIL: link does not resolve into skill dir"; exit 1; }

n="$(find "$dest" -maxdepth 1 -type l | wc -l | tr -d ' ')"
[ "$n" = "2" ] || { echo "FAIL: expected 2 links, got $n"; exit 1; }

echo "ok: install.sh links skills idempotently"
