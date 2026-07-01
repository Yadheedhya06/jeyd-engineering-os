import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, rollup, classifyCheck } from '../bin/status.mjs';

const fixture = [
  { repo: 'svc-api', openPRs: [{ number: 12, title: 'x', checks: 'green' }], openIssues: 3, lastMerge: 'abc' },
  { repo: 'svc-web', openPRs: [{ number: 5, title: 'y', checks: 'red' }, { number: 6, title: 'z', checks: 'pending' }], openIssues: 1, lastMerge: null },
];

test('totals roll up across repos', () => {
  const s = summarize(fixture);
  assert.equal(s.totals.repos, 2);
  assert.equal(s.totals.openPRs, 3);
  assert.equal(s.totals.openIssues, 4);
  assert.equal(s.totals.prsGreen, 1);
  assert.equal(s.totals.prsRed, 1);
  assert.equal(s.totals.prsPending, 1);
});
test('table is a non-empty string naming each repo', () => {
  const s = summarize(fixture);
  assert.equal(typeof s.table, 'string');
  assert.ok(s.table.includes('svc-api') && s.table.includes('svc-web'));
});
test('empty input is handled', () => {
  const s = summarize([]);
  assert.equal(s.totals.repos, 0);
  assert.equal(s.totals.openPRs, 0);
});

test('rollup: in-progress CheckRun is pending, not green', () => {
  assert.equal(rollup([{ status: 'IN_PROGRESS', conclusion: null }]), 'pending');
  assert.equal(rollup([{ status: 'QUEUED', conclusion: null }]), 'pending');
});
test('rollup: non-success conclusions are red (fail closed)', () => {
  for (const c of ['TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STALE', 'FAILURE', 'ERROR']) {
    assert.equal(rollup([{ status: 'COMPLETED', conclusion: c }]), 'red', c);
  }
});
test('rollup: an unknown conclusion is red, never green', () => {
  assert.equal(rollup([{ status: 'COMPLETED', conclusion: 'WAT_NEW_STATE' }]), 'red');
});
test('rollup: StatusContext pending/failure/success', () => {
  assert.equal(rollup([{ state: 'PENDING' }]), 'pending');
  assert.equal(rollup([{ state: 'FAILURE' }]), 'red');
  assert.equal(rollup([{ state: 'SUCCESS' }]), 'green');
});
test('rollup: all success (incl neutral/skipped) is green; empty is none', () => {
  assert.equal(rollup([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { status: 'COMPLETED', conclusion: 'SKIPPED' }]), 'green');
  assert.equal(rollup([]), 'none');
});
test('rollup: failure dominates a mix', () => {
  assert.equal(rollup([{ conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS' }, { conclusion: 'TIMED_OUT' }]), 'red');
});

test('summarize counts the none bucket (PRs with no checks are visible, not hidden)', () => {
  const s = summarize([{ repo: 'r', openPRs: [{ number: 1, title: 'x', checks: 'none' }, { number: 2, title: 'y', checks: 'green' }], openIssues: 0, lastMerge: null }]);
  assert.equal(s.totals.prsNone, 1);
  assert.equal(s.totals.prsGreen, 1);
  assert.equal(s.totals.openPRs, 2);
  assert.ok(s.table.includes('grn/red/pnd/none'));
});
