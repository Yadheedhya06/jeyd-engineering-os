#!/usr/bin/env node
// Pure, fail-closed decision logic for the autonomous dev-team loop, plus a small CLI
// the bash driver (run.sh) shells out to. No side effects on import.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOLERATED = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);

// classifyRollup: a GitHub statusCheckRollup array -> 'green'|'red'|'pending'|'none'.
// green requires >=1 SUCCESS and zero non-tolerated conclusions. Empty -> none.
// Any in-progress/queued/unknown -> pending. all-SKIP / all-NEUTRAL -> red (not green).
export function classifyRollup(rollup) {
  const checks = Array.isArray(rollup) ? rollup : [];
  if (checks.length === 0) return 'none';
  const norm = checks.map((c) => String((c && (c.conclusion ?? c.state ?? c.status)) ?? '').toUpperCase());
  if (norm.some((s) => s === '' || /PEND|PROG|QUEUE|WAIT|EXPECT/.test(s))) return 'pending';
  if (norm.some((s) => !TOLERATED.has(s))) return 'red';
  return norm.some((s) => s === 'SUCCESS') ? 'green' : 'red';
}

// isEligible: the deterministic merge gate. Fail closed on any missing/ambiguous input.
export function isEligible({ labels = [], state, baseRefName, defaultBranch, mergeable, allowlist = null } = {}) {
  const names = (labels || []).map((l) => (typeof l === 'string' ? l : l && l.name)).filter(Boolean);
  if (names.includes('redteam-blocked')) return { eligible: false, reason: 'redteam-blocked' };
  if (!names.includes('redteam-clear')) return { eligible: false, reason: 'no-redteam-clear' };
  if (state !== 'green') return { eligible: false, reason: `ci-${state}` };
  if (mergeable !== 'MERGEABLE') return { eligible: false, reason: `mergeable-${String(mergeable).toLowerCase()}` };
  // Default branch is NEVER auto-mergeable — checked BEFORE (and independent of) any allowlist,
  // so an allowlist can only further restrict, never re-enable merges into the production branch.
  if (!defaultBranch) return { eligible: false, reason: 'no-default-branch' };
  if (baseRefName === defaultBranch) return { eligible: false, reason: 'base-is-default-branch' };
  if (Array.isArray(allowlist) && allowlist.length && !allowlist.includes(baseRefName)) {
    return { eligible: false, reason: 'base-not-allowed' };
  }
  return { eligible: true, reason: 'ok' };
}

// extractRefs: unique issue numbers from #N tokens in arbitrary text.
export function extractRefs(text) {
  return [...new Set((String(text || '').match(/#(\d+)/g) || []).map((s) => Number(s.slice(1))))];
}

export function uncoveredIssues(openIssues, coveredNumbers) {
  const covered = new Set(coveredNumbers || []);
  return (openIssues || []).filter((n) => !covered.has(n));
}

export function isDone({ openIssues, openPRs, aliveAgents } = {}) {
  return openIssues === 0 && openPRs === 0 && aliveAgents === 0;
}

// modalBase: most common non-null baseRefName among open PRs (the active feature branch),
// used to seed uncovered-issue workers off the right base instead of the default branch.
export function modalBase(prs) {
  const counts = new Map();
  for (const p of prs || []) {
    const b = p && p.baseRefName;
    if (b) counts.set(b, (counts.get(b) || 0) + 1);
  }
  let best = '';
  let n = 0;
  for (const [b, c] of counts) if (c > n) { best = b; n = c; }
  return best;
}

function isMain() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (isMain()) {
  const args = process.argv.slice(2);
  const mode = args[0];
  const getOpt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  let data;
  try {
    data = JSON.parse(input || '[]');
    if (!Array.isArray(data)) throw new Error('not an array');
  } catch (e) {
    console.error(`merge-gate: bad input: ${e.message}`);
    process.exit(3); // fail closed
  }
  if (mode === 'modal-base') { console.log(modalBase(data)); process.exit(0); }
  if (mode === 'rows') {
    const defaultBranch = getOpt('--default-branch');
    const allowlist = getOpt('--allowlist') ? getOpt('--allowlist').split(',').filter(Boolean) : null;
    for (const pr of data) {
      const state = classifyRollup(pr.statusCheckRollup);
      const { eligible, reason } = isEligible({ labels: pr.labels, state, baseRefName: pr.baseRefName, defaultBranch, mergeable: pr.mergeable, allowlist });
      console.log(`${pr.number} ${state} ${eligible ? 'ELIGIBLE' : 'INELIGIBLE'} ${reason}`);
    }
    process.exit(0);
  }
  console.error('usage: merge-gate.mjs rows --default-branch <b> [--allowlist csv] | modal-base');
  process.exit(2);
}
