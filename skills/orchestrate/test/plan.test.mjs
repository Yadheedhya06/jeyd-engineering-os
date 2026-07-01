import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { validatePlan, bundleStatus, mergeOrder, bundleIssues, issuesForPr } from '../bin/plan.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'plan.mjs');
const goodPlan = {
  repo: 'svc-api', base: 'feat/pipeline-ledger-sync',
  bundles: [
    { id: 'b1', priority: 2, issues: [15, 16], rationale: 'ulp', pr: null, action: 'new' },
    { id: 'b2', priority: 1, issues: [14], rationale: 'safety', pr: 28, action: 'keep' },
  ],
};

test('validatePlan accepts a good plan', () => {
  assert.equal(validatePlan(goodPlan).valid, true);
});
test('validatePlan rejects malformed (fail closed)', () => {
  assert.equal(validatePlan(null).valid, false);
  assert.equal(validatePlan({ repo: 'x', base: 'y', bundles: [] }).valid, false);
  assert.equal(validatePlan({ repo: 'x', base: 'y', bundles: [{ id: 'b1', priority: 1, issues: [1], action: 'keep' }] }).valid, false); // keep needs pr
  assert.equal(validatePlan({ repo: 'x', base: 'y', bundles: [{ id: 'b1', priority: 'hi', issues: [1], action: 'new' }] }).valid, false);
  assert.equal(validatePlan({ repo: 'x', base: 'y', bundles: [{ id: 'b1', priority: 1, issues: [1], action: 'new' }, { id: 'b1', priority: 2, issues: [2], action: 'new' }] }).valid, false); // dup id
});
test('mergeOrder sorts by ascending priority', () => {
  assert.deepEqual(mergeOrder(goodPlan), ['b2', 'b1']);
});
test("bundleIssues returns a bundle's issues", () => {
  assert.deepEqual(bundleIssues(goodPlan, 'b1'), [15, 16]);
  assert.deepEqual(bundleIssues(goodPlan, 'nope'), []);
});
test('bundleStatus: keep-bundle maps by pr number, classifies needs', () => {
  const prs = [{ number: 28, mergeable: 'MERGEABLE', baseRefName: 'feat/pipeline-ledger-sync', labels: [{ name: 'redteam-clear' }], statusCheckRollup: [{ conclusion: 'SUCCESS' }], headRefName: 'fix/x' }];
  const s = bundleStatus(goodPlan, prs, 'main');
  const b2 = s.find((x) => x.id === 'b2');
  assert.equal(b2.pr, 28); assert.equal(b2.needs, 'eligible');
});
test('bundleStatus: new-bundle with no PR -> worker; with branch PR -> classified', () => {
  const s1 = bundleStatus(goodPlan, [], 'main');
  assert.equal(s1.find((x) => x.id === 'b1').needs, 'worker');
  const prs = [{ number: 40, mergeable: 'MERGEABLE', baseRefName: 'feat/pipeline-ledger-sync', labels: [], statusCheckRollup: [{ conclusion: 'FAILURE' }], headRefName: 'agent/bundle-b1' }];
  const s2 = bundleStatus(goodPlan, prs, 'main');
  const b1 = s2.find((x) => x.id === 'b1');
  assert.equal(b1.pr, 40); assert.equal(b1.needs, 'fix');
});
test('bundleStatus marks a bundle done when all its issues are closed (not re-created)', () => {
  // openIssues = [15,16] -> issue 14 (b2) is closed -> b2 done even though its keep PR is gone
  const s = bundleStatus(goodPlan, [], 'main', [15, 16]);
  assert.equal(s.find((x) => x.id === 'b2').needs, 'done');
  assert.equal(s.find((x) => x.id === 'b1').needs, 'worker'); // 15,16 still open
});
test('bundleStatus done-check is skipped when openIssues is not provided (fail toward work)', () => {
  // no openIssues arg -> never short-circuits to done
  const s = bundleStatus(goodPlan, [], 'main');
  assert.ok(s.every((x) => x.needs !== 'done'));
});
test('issuesForPr: matches a keep-bundle pr -> its issues (number or string pr)', () => {
  const plan = { bundles: [{ id: 'b1', pr: 31, issues: [12] }, { id: 'b9', pr: 29, issues: [25] }] };
  assert.deepEqual(issuesForPr(plan, 29), [25]);
  assert.deepEqual(issuesForPr(plan, '31'), [12]);
});
test('issuesForPr: pr not in plan (new bundle / unknown) -> []', () => {
  const plan = { bundles: [{ id: 'b4', pr: null, issues: [15, 16] }] };
  assert.deepEqual(issuesForPr(plan, 45), []);
  assert.deepEqual(issuesForPr({}, 1), []);
});
test('issuesForPr: a null-pr bundle never matches (not even pr 0 via Number(null)===0)', () => {
  const plan = { bundles: [{ id: 'b4', pr: null, issues: [15, 16] }] };
  assert.deepEqual(issuesForPr(plan, 0), []);
});
test('CLI validate exits non-zero on malformed plan', () => {
  const d = mkdtempSync(join(tmpdir(), 'plan-'));
  const f = join(d, 'bad.json'); writeFileSync(f, JSON.stringify({ repo: 'x', base: 'y', bundles: [] }));
  assert.throws(() => execFileSync('node', [BIN, 'validate', f], { encoding: 'utf8' }));
});
test('CLI status prints id priority pr needs', () => {
  const d = mkdtempSync(join(tmpdir(), 'plan-'));
  const f = join(d, 'p.json'); writeFileSync(f, JSON.stringify(goodPlan));
  const out = execFileSync('node', [BIN, 'status', f, '--default-branch', 'main'], { input: '[]', encoding: 'utf8' }).trim().split('\n').sort();
  assert.ok(out.includes('b1 2 - worker'));
  assert.ok(out.includes('b2 1 - worker')); // pr 28 not in empty list -> keep bundle with missing PR falls back to worker
});
