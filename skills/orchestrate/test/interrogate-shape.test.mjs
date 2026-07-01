import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'interrogate.mjs');
const src = readFileSync(BIN, 'utf8');

test('interrogate.mjs has workflow-valid syntax (top-level await + return, single meta export)', () => {
  // A Workflow script legitimately uses BOTH `export const meta` and a top-level `return`; no single standard
  // parse mode accepts both. The runtime extracts `meta` and runs the body in an async scope — validate the
  // same way: strip the `export` keyword(s) and wrap the whole source in an async function, where const/await/return are legal.
  const wrapped = `async function __wf(){\n${src.replace(/^export /gm, '')}\n}`;
  const tmp = join(tmpdir(), `interrogate-check-${process.pid}.mjs`);
  writeFileSync(tmp, wrapped);
  try { execFileSync('node', ['--check', tmp]); } finally { rmSync(tmp, { force: true }); }
});
test('meta is the interrogate workflow', () => {
  assert.match(src, /export const meta = \{/);
  assert.match(src, /name: 'interrogate'/);
});
test('runs interrogations in bounded-concurrency batches with the redteam skill', () => {
  assert.match(src, /parallel\(/);       // batched concurrency (spec §8), not unbounded pipeline
  assert.match(src, /concurrency/);      // the cost/load cap
  assert.match(src, /redteam/);          // invokes the redteam skill
  assert.match(src, /gh pr diff/);       // Target scoped to the diff (R1)
  assert.match(src, /gh issue view/);    // Intent from the issues (R2)
});
test('mirrors the fail-closed gate and carries the I6 directive', () => {
  assert.match(src, /gate === 'pass'/);                 // gatePasses mirror
  assert.match(src, /redteam-clear/);
  assert.match(src, /redteam-blocked/);
  assert.match(src, /HEADLESS/);                        // I6 directive present in prompts
  assert.match(src, /MIRRORS .*interrogate-state/);     // sync marker comment
});
