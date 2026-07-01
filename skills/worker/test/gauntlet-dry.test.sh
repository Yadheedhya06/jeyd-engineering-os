#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SKILL="$(dirname "$HERE")"                          # skills/worker
export REPOS_JSON="$SKILL/../../examples/demo/repos.json"

# (1) rust repo: NO postgres service, build command surfaced from config.
out="$(bash "$SKILL/bin/gauntlet.sh" engine --dry)"
echo "$out"
echo "$out" | grep -q "name: engine"                         || { echo "FAIL: name line";          exit 1; }
echo "$out" | grep -q "build: cargo build"       || { echo "FAIL: build from config";  exit 1; }
echo "$out" | grep -q "services: <none>"                           || { echo "FAIL: engine has no svc"; exit 1; }
if echo "$out" | grep -q "docker:"; then echo "FAIL: postgres must be skipped for engine"; exit 1; fi

# (2) node repo: postgres service enabled + install command surfaced from config.
out2="$(bash "$SKILL/bin/gauntlet.sh" api --dry)"
echo "$out2" | grep -q "services: postgres"                        || { echo "FAIL: postgres not surfaced"; exit 1; }
echo "$out2" | grep -q "install: npm install"                      || { echo "FAIL: install from config";   exit 1; }

echo "PASS: gauntlet dry-run"
