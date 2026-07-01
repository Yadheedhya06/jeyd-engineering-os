#!/usr/bin/env bash
set -euo pipefail
# is_stale <logfile> <minutes> : exit 0 if the log is older than <minutes> (the watchdog's core predicate)
is_stale() { [ -n "$(find "$1" -mmin +"$2" -print 2>/dev/null)" ]; }

tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
touch -t "$(date -v-20M +%Y%m%d%H%M 2>/dev/null || date -d '20 min ago' +%Y%m%d%H%M)" "$tmp"
is_stale "$tmp" 8 || { echo "FAIL: 20-min-old log should be stale at threshold 8"; exit 1; }

touch "$tmp"   # now
if is_stale "$tmp" 8; then echo "FAIL: fresh log must not be stale"; exit 1; fi
echo "ok: staleness predicate correct"
