import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import {
  classifyRollup, isEligible, extractRefs, uncoveredIssues, isDone, modalBase,
} from '../bin/merge-gate.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'merge-gate.mjs');
const run = (args, input) => execFileSync('node', [BIN, ...args], { input, encoding: 'utf8' });

// ---------------- classifyRollup ----------------
test('empty rollup -> none', () => {
  assert.equal(classifyRollup([]), 'none');
  assert.equal(classifyRollup(undefined), 'none');
});
test('one SUCCESS check -> green', () => {
  assert.equal(classifyRollup([{ conclusion: 'SUCCESS' }]), 'green');
});
test('SUCCESS + SKIPPED -> green (skip tolerated alongside a real success)', () => {
  assert.equal(classifyRollup([{ conclusion: 'SUCCESS' }, { conclusion: 'SKIPPED' }]), 'green');
});
test('all SKIPPED -> red (no real success; fixes the all-skip hole)', () => {
  assert.equal(classifyRollup([{ conclusion: 'SKIPPED' }, { conclusion: 'SKIPPED' }]), 'red');
});
test('all NEUTRAL -> red', () => {
  assert.equal(classifyRollup([{ conclusion: 'NEUTRAL' }]), 'red');
});
test('any FAILURE -> red', () => {
  assert.equal(classifyRollup([{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }]), 'red');
});
test('in-progress CheckRun -> pending', () => {
  assert.equal(classifyRollup([{ status: 'IN_PROGRESS', conclusion: null }]), 'pending');
});
test('queued StatusContext (state PENDING) -> pending', () => {
  assert.equal(classifyRollup([{ state: 'PENDING' }]), 'pending');
});
test('StatusContext state SUCCESS -> green', () => {
  assert.equal(classifyRollup([{ state: 'SUCCESS' }]), 'green');
});

// ---------------- isEligible ----------------
const ok = { labels: ['redteam-clear'], state: 'green', baseRefName: 'feat/x', defaultBranch: 'main', mergeable: 'MERGEABLE' };
test('fully eligible PR', () => {
  assert.deepEqual(isEligible(ok), { eligible: true, reason: 'ok' });
});
test('missing redteam-clear -> ineligible', () => {
  assert.equal(isEligible({ ...ok, labels: [] }).eligible, false);
  assert.equal(isEligible({ ...ok, labels: [] }).reason, 'no-redteam-clear');
});
test('redteam-blocked present -> ineligible even if clear also present', () => {
  assert.equal(isEligible({ ...ok, labels: ['redteam-clear', 'redteam-blocked'] }).reason, 'redteam-blocked');
});
test('object-form labels are read by name', () => {
  assert.equal(isEligible({ ...ok, labels: [{ name: 'redteam-clear' }] }).eligible, true);
});
test('base == default branch -> ineligible (never auto-merge to main)', () => {
  assert.equal(isEligible({ ...ok, baseRefName: 'main' }).reason, 'base-is-default-branch');
});
test('non-green state -> ineligible', () => {
  assert.equal(isEligible({ ...ok, state: 'red' }).reason, 'ci-red');
  assert.equal(isEligible({ ...ok, state: 'none' }).reason, 'ci-none');
});
test('not MERGEABLE -> ineligible', () => {
  assert.equal(isEligible({ ...ok, mergeable: 'CONFLICTING' }).reason, 'mergeable-conflicting');
});
test('unknown default branch with no allowlist -> ineligible (fail closed)', () => {
  assert.equal(isEligible({ ...ok, defaultBranch: '' }).reason, 'no-default-branch');
});
test('explicit allowlist: base must be a member', () => {
  assert.equal(isEligible({ ...ok, allowlist: ['feat/x'] }).eligible, true);
  assert.equal(isEligible({ ...ok, baseRefName: 'other', allowlist: ['feat/x'] }).reason, 'base-not-allowed');
});
test('default branch is excluded even when an allowlist contains it (fail closed)', () => {
  assert.equal(isEligible({ ...ok, baseRefName: 'main', allowlist: ['main', 'feat/x'] }).reason, 'base-is-default-branch');
});

// ---------------- helpers ----------------
test('extractRefs pulls unique issue numbers', () => {
  assert.deepEqual(extractRefs('fixes #12 and #14, also #12 again'), [12, 14]);
  assert.deepEqual(extractRefs(''), []);
});
test('uncoveredIssues removes covered', () => {
  assert.deepEqual(uncoveredIssues([11, 12, 15], [12]), [11, 15]);
});
test('isDone only when all zero', () => {
  assert.equal(isDone({ openIssues: 0, openPRs: 0, aliveAgents: 0 }), true);
  assert.equal(isDone({ openIssues: 1, openPRs: 0, aliveAgents: 0 }), false);
  assert.equal(isDone({ openIssues: 0, openPRs: 0, aliveAgents: 2 }), false);
});
test('modalBase returns the most common base, else empty', () => {
  assert.equal(modalBase([{ baseRefName: 'feat/x' }, { baseRefName: 'feat/x' }, { baseRefName: 'main' }]), 'feat/x');
  assert.equal(modalBase([]), '');
  assert.equal(modalBase([{ baseRefName: null }]), '');
});

// ---------------- CLI ----------------
test('CLI rows: eligible + red + base-to-main classified correctly', () => {
  const prs = [
    { number: 27, mergeable: 'MERGEABLE', baseRefName: 'feat/x', labels: [{ name: 'redteam-clear' }], statusCheckRollup: [{ conclusion: 'SUCCESS' }] },
    { number: 28, mergeable: 'MERGEABLE', baseRefName: 'feat/x', labels: [], statusCheckRollup: [{ conclusion: 'FAILURE' }] },
    { number: 29, mergeable: 'MERGEABLE', baseRefName: 'main', labels: [{ name: 'redteam-clear' }], statusCheckRollup: [{ conclusion: 'SUCCESS' }] },
  ];
  const out = run(['rows', '--default-branch', 'main'], JSON.stringify(prs)).trim().split('\n');
  assert.equal(out[0], '27 green ELIGIBLE ok');
  // #28 is red AND unlabelled; the gate checks the label first, so the reason is the
  // first failing condition. The `red` state (from classifyRollup) is what run.sh routes on.
  assert.equal(out[1], '28 red INELIGIBLE no-redteam-clear');
  assert.equal(out[2], '29 green INELIGIBLE base-is-default-branch');
});
test('CLI rows: bad input exits non-zero (fail closed)', () => {
  assert.throws(() => run(['rows', '--default-branch', 'main'], 'not json'));
});
test('CLI modal-base prints the active feature branch', () => {
  const prs = [{ baseRefName: 'feat/x' }, { baseRefName: 'feat/x' }, { baseRefName: 'main' }];
  assert.equal(run(['modal-base'], JSON.stringify(prs)).trim(), 'feat/x');
});
