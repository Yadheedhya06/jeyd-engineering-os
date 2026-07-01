import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gatePasses, noProgress, interrogationLoop, buildArgs } from '../bin/interrogate-state.mjs';

// ---------------- gatePasses (fail-closed guard) ----------------
test('gatePasses: gate pass -> true', () => {
  assert.equal(gatePasses({ gate: 'pass' }), true);
});
test('gatePasses: gate fail -> false', () => {
  assert.equal(gatePasses({ gate: 'fail' }), false);
});
test('gatePasses: missing gate / malformed / nullish -> false', () => {
  for (const v of [null, undefined, {}, { gate: 'PASS' }, { gate: '' }, 'pass', 0]) {
    assert.equal(gatePasses(v), false);
  }
});

// ---------------- noProgress (anti-stall) ----------------
test('noProgress: < 2 turns -> false', () => {
  assert.equal(noProgress([]), false);
  assert.equal(noProgress([{ pushed: null, conceded: false }]), false);
});
test('noProgress: last 2 both no push & no concede -> true', () => {
  assert.equal(noProgress([
    { pushed: 'a1', conceded: true },
    { pushed: null, conceded: false },
    { pushed: null, conceded: false },
  ]), true);
});
test('noProgress: a recent push or concede -> false', () => {
  assert.equal(noProgress([{ pushed: null, conceded: false }, { pushed: 'sha', conceded: false }]), false);
  assert.equal(noProgress([{ pushed: null, conceded: false }, { pushed: null, conceded: true }]), false);
});

// ---------------- interrogationLoop (fail-closed control flow) ----------------
const recorder = (script) => {
  const calls = [];
  let i = 0;
  const dispatch = async (kind, ctx) => {
    calls.push({ kind, ctx });
    if (kind === 'redteam') return script.verdicts[i++] ?? { gate: 'fail' };
    if (kind === 'worker') return script.work?.shift?.() ?? { pushed: 'x', conceded: false };
    return null; // clear / block
  };
  return { calls, dispatch };
};

test('loop: clears as soon as a verdict passes, dispatches clear, never block', async () => {
  const { calls, dispatch } = recorder({ verdicts: [{ gate: 'fail' }, { gate: 'pass' }], work: [{ pushed: 's', conceded: true }] });
  const r = await interrogationLoop({ pr: 7, maxRounds: 4, dispatch });
  assert.deepEqual(r, { pr: 7, result: 'cleared', rounds: 2 });
  assert.equal(calls.filter((c) => c.kind === 'clear').length, 1);
  assert.equal(calls.filter((c) => c.kind === 'block').length, 0);
});

test('loop: never cleared by maxRounds -> blocked(max-rounds), no clear', async () => {
  const { calls, dispatch } = recorder({ verdicts: [{ gate: 'fail' }, { gate: 'fail' }], work: [{ pushed: 's1', conceded: false }, { pushed: 's2', conceded: false }] });
  const r = await interrogationLoop({ pr: 9, maxRounds: 2, dispatch });
  assert.equal(r.result, 'blocked');
  assert.equal(r.reason, 'max-rounds');
  assert.equal(calls.filter((c) => c.kind === 'clear').length, 0);
});

test('loop: two no-progress worker turns -> blocked(no-progress) early', async () => {
  const { calls, dispatch } = recorder({ verdicts: [{ gate: 'fail' }, { gate: 'fail' }, { gate: 'fail' }], work: [{ pushed: null, conceded: false }, { pushed: null, conceded: false }] });
  const r = await interrogationLoop({ pr: 5, maxRounds: 9, dispatch });
  assert.equal(r.result, 'blocked');
  assert.equal(r.reason, 'no-progress');
  assert.equal(calls.filter((c) => c.kind === 'clear').length, 0);
});

// ---------------- buildArgs ----------------
const PLAN = { repo: 'r', base: 'feat/x', bundles: [
  { id: 'b1', priority: 1, issues: [11, 12] },
  { id: 'b2', priority: 3, issues: [20] },
] };

test('buildArgs: maps PRs to issues + tier from priority', () => {
  const out = buildArgs(PLAN, [{ pr: 31, bid: 'b1', prio: 1 }, { pr: 28, bid: 'b2', prio: 3 }], {
    repo: 'svc-api', owner: 'acme', base: 'feat/x', maxRounds: 4, reviewDir: '/o/review',
  });
  assert.equal(out.repo, 'svc-api');
  assert.equal(out.maxRounds, 4);
  assert.deepEqual(out.prs, [
    { pr: 31, issues: [11, 12], tier: 'elevated' },
    { pr: 28, issues: [20], tier: 'auto' },
  ]);
});
