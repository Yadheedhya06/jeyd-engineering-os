#!/usr/bin/env bash
# Idempotent symlink installer: links every skills/<name>/ into the Claude
# Code skills dir. Re-running is safe (ln -sfn replaces the link atomically).
# Override target with CLAUDE_SKILLS_DIR (used by tests; defaults to
# ~/.claude/skills). Prefer the plugin flow (/plugin marketplace add) when you
# can; this is the no-plugin fallback.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
mkdir -p "$dest"
linked=0
for skill in "$repo_root"/skills/*/; do
  [ -d "$skill" ] || continue   # no skills present yet -> clean no-op
  name="$(basename "$skill")"
  ln -sfn "$skill" "$dest/$name"
  echo "linked $dest/$name -> $skill"
  linked=$((linked + 1))
done
echo "install.sh: linked $linked skill(s) into $dest"
