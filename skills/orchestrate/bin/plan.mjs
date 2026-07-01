#!/usr/bin/env node
// The coordinator "brain" state for the v3 plan-bundle-merge loop: validate the persisted plan,
// classify each bundle's next action (reusing the fail-closed merge gate), and the merge order.
// No side effects on import. Fail closed: a malformed plan is unusable (the loop re-plans).
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifyRollup, isEligible } from './merge-gate.mjs';

export function validatePlan(obj) {
  if (!obj || typeof obj !== 'object') return { valid: false, error: 'not an object' };
  if (typeof obj.repo !== 'string' || !obj.repo) return { valid: false, error: 'missing repo' };
  if (typeof obj.base !== 'string' || !obj.base) return { valid: false, error: 'missing base' };
  if (!Array.isArray(obj.bundles) || obj.bundles.length === 0) return { valid: false, error: 'no bundles' };
  const ids = new Set();
  for (const b of obj.bundles) {
    if (!b || typeof b !== 'object') return { valid: false, error: 'bad bundle' };
    if (typeof b.id !== 'string' || !b.id) return { valid: false, error: 'bundle missing id' };
    if (ids.has(b.id)) return { valid: false, error: `duplicate bundle id ${b.id}` };
    ids.add(b.id);
    if (!Number.isInteger(b.priority)) return { valid: false, error: `bundle ${b.id} bad priority` };
    if (!Array.isArray(b.issues) || b.issues.some((n) => !Number.isInteger(n))) return { valid: false, error: `bundle ${b.id} bad issues` };
    if (b.action !== 'keep' && b.action !== 'new') return { valid: false, error: `bundle ${b.id} bad action` };
    if (b.action === 'keep' && !Number.isInteger(b.pr)) return { valid: false, error: `keep bundle ${b.id} needs pr` };
  }
  return { valid: true, plan: obj };
}

// bundleStatus: per bundle -> {id, priority, pr, needs}. needs in:
//   done     - all the bundle's issues are closed (only when openIssues is provided)
//   worker   - new/keep bundle with no open PR yet
//   fix      - PR red/none/blocked/conflicting/unknown
//   redteam  - PR green but not yet redteam-clear
//   eligible - passes the full merge gate
//   pending  - held (ci pending, or base==default-branch) — waits
export function bundleStatus(plan, openPRs, defaultBranch, openIssues) {
  const byNum = new Map((openPRs || []).map((p) => [p.number, p]));
  const byBranch = new Map((openPRs || []).map((p) => [p.headRefName, p]));
  const haveIssues = Array.isArray(openIssues);
  const openSet = new Set(openIssues || []);
  return (plan.bundles || []).map((b) => {
    const pr = (b.action === 'keep' && b.pr != null ? byNum.get(b.pr) : byBranch.get(`agent/bundle-${b.id}`)) || null;
    if (haveIssues && b.issues.length && b.issues.every((n) => !openSet.has(n))) {
      return { id: b.id, priority: b.priority, pr: pr ? pr.number : null, needs: 'done' };
    }
    if (!pr) return { id: b.id, priority: b.priority, pr: null, needs: 'worker' };
    const state = classifyRollup(pr.statusCheckRollup);
    const { eligible, reason } = isEligible({ labels: pr.labels, state, baseRefName: pr.baseRefName, defaultBranch, mergeable: pr.mergeable });
    let needs = 'pending';
    if (eligible) needs = 'eligible';
    else if (state === 'green' && reason === 'no-redteam-clear') needs = 'redteam';
    else if (state === 'red' || state === 'none' || reason === 'redteam-blocked' || reason === 'mergeable-conflicting' || reason === 'mergeable-unknown') needs = 'fix';
    return { id: b.id, priority: b.priority, pr: pr.number, needs };
  });
}

export function mergeOrder(plan) {
  return [...(plan.bundles || [])].sort((a, b) => a.priority - b.priority).map((b) => b.id);
}

export function bundleIssues(plan, id) {
  const b = (plan.bundles || []).find((x) => x.id === id);
  return b ? b.issues.slice() : [];
}

// issuesForPr: the issues of the bundle whose `pr` matches (keep-bundles record their pr); [] if none.
// New-bundle PRs are not recorded in the plan by pr -> returns [] -> caller falls back to closingIssuesReferences.
export function issuesForPr(plan, pr) {
  const n = Number(pr);
  // x.pr != null guard: a not-yet-built (pr:null) bundle must never match a PR lookup
  // (without it, Number(null)===0 would let issuesForPr(plan, 0) match a null-pr bundle).
  const b = (plan.bundles || []).find((x) => x.pr != null && Number(x.pr) === n);
  return (b && Array.isArray(b.issues)) ? b.issues : [];
}

function isMain() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (isMain()) {
  const args = process.argv.slice(2);
  const [mode, file] = args;
  const getOpt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  let plan;
  try { plan = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`plan: cannot read ${file}: ${e.message}`); process.exit(3); }
  const v = validatePlan(plan);
  if (!v.valid) { console.error(`plan: invalid: ${v.error}`); process.exit(4); }
  if (mode === 'validate') { process.exit(0); }
  if (mode === 'order') { console.log(mergeOrder(plan).join(' ')); process.exit(0); }
  if (mode === 'issues') { console.log(bundleIssues(plan, args[2]).join(' ')); process.exit(0); }
  if (mode === 'issues-for-pr') { console.log(issuesForPr(plan, args[2]).join(' ')); process.exit(0); }
  if (mode === 'status') {
    const oi = getOpt('--open-issues');
    const openIssues = oi === undefined ? undefined : oi.split(',').filter(Boolean).map(Number);
    let input = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) input += chunk;
    let prs;
    try { prs = JSON.parse(input || '[]'); if (!Array.isArray(prs)) throw new Error('not array'); } catch (e) { console.error(`plan: bad PR json: ${e.message}`); process.exit(3); }
    for (const s of bundleStatus(plan, prs, getOpt('--default-branch'), openIssues)) console.log(`${s.id} ${s.priority} ${s.pr ?? '-'} ${s.needs}`);
    process.exit(0);
  }
  console.error('usage: plan.mjs validate|order|issues|status <file> ...');
  process.exit(2);
}
