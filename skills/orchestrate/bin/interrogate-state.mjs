#!/usr/bin/env node
// Pure, fail-closed decision logic for the redteam interrogation loop, plus a tiny CLI the
// bash driver (run.sh) shells out to. No side effects on import. The Workflow script
// (interrogate.mjs) MIRRORS gatePasses/noProgress/interrogationLoop inline (the Workflow sandbox
// cannot import); keep them in sync — these are the tested source of truth.
import { realpathSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bundleIssues } from './plan.mjs';

// gatePasses: the ONLY predicate that may earn redteam-clear. Anything not exactly {gate:'pass'} -> false.
export function gatePasses(verdict) {
  return !!verdict && typeof verdict === 'object' && verdict.gate === 'pass';
}

// noProgress: true when the last 2 worker turns both made no progress (no push AND no concede).
export function noProgress(workerHistory) {
  if (!Array.isArray(workerHistory) || workerHistory.length < 2) return false;
  return workerHistory.slice(-2).every((w) => !w || (!w.pushed && !w.conceded));
}

// interrogationLoop: the fail-closed round loop. dispatch(kind, ctx) performs the side-effecting turn.
// Guarantees: 'clear' is dispatched ONLY when a redteam verdict gatePasses; otherwise the loop ends
// in 'block' (max-rounds or no-progress). Never returns 'cleared' without a passing verdict.
export async function interrogationLoop({ pr, maxRounds, dispatch }) {
  const workerHistory = [];
  let round = 0;
  while (round < maxRounds) {
    round += 1;
    const verdict = await dispatch('redteam', { pr, round });
    if (gatePasses(verdict)) {
      await dispatch('clear', { pr, round });
      return { pr, result: 'cleared', rounds: round };
    }
    const work = await dispatch('worker', { pr, round, verdict });
    workerHistory.push(work);
    if (noProgress(workerHistory)) {
      await dispatch('block', { pr, round, reason: 'no-progress' });
      return { pr, result: 'blocked', rounds: round, reason: 'no-progress' };
    }
  }
  await dispatch('block', { pr, round, reason: 'max-rounds' });
  return { pr, result: 'blocked', rounds: round, reason: 'max-rounds' };
}

// buildArgs: assemble the Workflow args from the plan + the ready PRs (with their bundle id + priority).
export function buildArgs(plan, ready, opts) {
  const { repo, owner, base, maxRounds, reviewDir, elevatedAtOrBelow = 1 } = opts;
  const prs = ready.map(({ pr, bid, prio }) => ({
    pr,
    issues: bundleIssues(plan, bid),
    tier: prio <= elevatedAtOrBelow ? 'elevated' : 'auto',
  }));
  return { repo, owner, base, maxRounds, reviewDir, prs };
}

function isMain() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (isMain()) {
  // CLI: args <planPath> --owner O --repo R --base B --max N --review-dir D --ready "pr:bid:prio,..."
  const argv = process.argv.slice(2);
  if (argv[0] !== 'args') { console.error('usage: interrogate-state.mjs args <planPath> --owner ... --ready "pr:bid:prio,..."'); process.exit(2); }
  const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    const plan = JSON.parse(readFileSync(argv[1], 'utf8'));
    const ready = (get('--ready') || '').split(',').filter(Boolean).map((t) => {
      // triple format is "pr:bid:prio"; assumes bundle ids are colon-free (plan.mjs uses b1,b2,...).
      const [pr, bid, prio] = t.split(':');
      return { pr: Number(pr), bid, prio: Number(prio) };
    });
    const out = buildArgs(plan, ready, {
      owner: get('--owner'), repo: get('--repo'), base: get('--base'),
      maxRounds: Number(get('--max') || 4), reviewDir: get('--review-dir'),
    });
    console.log(JSON.stringify(out));
  } catch (e) { console.error(`interrogate-state: ${e.message}`); process.exit(1); }
}
