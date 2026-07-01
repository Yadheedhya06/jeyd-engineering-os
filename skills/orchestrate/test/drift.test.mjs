import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractDepRef, driftStatus, checkRepo } from '../bin/drift.mjs';

test('npm: extracts a link: dep by configured name', () => {
  const txt = JSON.stringify({ dependencies: { '@acme/contracts': 'link:../contracts/packages/ts' } });
  assert.equal(extractDepRef('npm', txt, '@acme/contracts'), 'link:../contracts/packages/ts');
});
test('npm: extracts a file: dep', () => {
  const txt = JSON.stringify({ dependencies: { '@acme/contracts': 'file:../contracts/packages/ts' } });
  assert.equal(extractDepRef('npm', txt, '@acme/contracts'), 'file:../contracts/packages/ts');
});
test('cargo: extracts a git+tag', () => {
  const txt = 'acme-contracts = { git = "https://github.com/acme/contracts.git", tag = "acme-v1" }';
  assert.equal(extractDepRef('cargo', txt, 'acme-contracts'), 'git+tag:acme-v1');
});
test('npm: null when the dep is absent', () => {
  assert.equal(extractDepRef('npm', JSON.stringify({ dependencies: {} }), '@acme/contracts'), null);
});
test('npm: an object-form dep returns null (not the object)', () => {
  const txt = JSON.stringify({ dependencies: { '@acme/contracts': { git: 'x' } } });
  assert.equal(extractDepRef('npm', txt, '@acme/contracts'), null);
});
test('cargo: a commented-out dep line does not match (no false pin)', () => {
  const txt = '# acme-contracts = { git = "x", tag = "acme-v1" }\nfoo = 1';
  assert.equal(extractDepRef('cargo', txt, 'acme-contracts'), null);
});
test('cargo: a real workspace.dependencies block still matches', () => {
  const txt = '[workspace.dependencies]\nacme-contracts = { git = "https://x", tag = "acme-v1" }\n';
  assert.equal(extractDepRef('cargo', txt, 'acme-contracts'), 'git+tag:acme-v1');
});
test('driftStatus ok when actual matches the configured version', () => {
  const r = driftStatus({ dep: 'acme-contracts', version: 'git+tag:acme-v1' }, 'git+tag:acme-v1');
  assert.deepEqual(r, { dep: 'acme-contracts', expected: 'git+tag:acme-v1', actual: 'git+tag:acme-v1', ok: true });
});
test('driftStatus not ok on mismatch (drift)', () => {
  assert.equal(driftStatus({ dep: 'd', version: 'git+tag:acme-v1' }, 'git+tag:acme-v2').ok, false);
});
test('driftStatus not ok when actual is null', () => {
  assert.equal(driftStatus({ dep: 'd', version: 'file:x' }, null).ok, false);
});
test('checkRepo skips cleanly when contractPin is null (returns null, never a failure)', () => {
  assert.equal(checkRepo('/nonexistent', { name: 'svc-web', contractPin: null }), null);
  assert.equal(checkRepo('/nonexistent', { name: 'svc-web' }), null); // absent === null
});
test('checkRepo reads the configured dep from the repo dir', () => {
  const work = mkdtempSync(join(tmpdir(), 'drift-'));
  mkdirSync(join(work, 'svc-api'));
  writeFileSync(join(work, 'svc-api', 'package.json'), JSON.stringify({ dependencies: { '@acme/contracts': '^1.4.0' } }));
  const r = checkRepo(work, { name: 'svc-api', contractPin: { dep: '@acme/contracts', version: '^1.4.0' } });
  assert.deepEqual(r, { repo: 'svc-api', dep: '@acme/contracts', expected: '^1.4.0', actual: '^1.4.0', ok: true });
});
