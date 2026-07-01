import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoSlug, validateConfig, loadConfig } from '../bin/config.mjs';

test('repoSlug: https url', () => {
  assert.equal(repoSlug({ url: 'https://github.com/acme/svc-api' }), 'acme/svc-api');
});
test('repoSlug: https url with .git suffix', () => {
  assert.equal(repoSlug({ url: 'https://github.com/acme/svc-api.git' }), 'acme/svc-api');
});
test('repoSlug: ssh url', () => {
  assert.equal(repoSlug({ url: 'git@github.com:acme/svc-api.git' }), 'acme/svc-api');
});
test('repoSlug: bare owner/repo passes through', () => {
  assert.equal(repoSlug({ url: 'acme/svc-api' }), 'acme/svc-api');
});
test('repoSlug: unparseable url falls back to name', () => {
  assert.equal(repoSlug({ url: 'not-a-url', name: 'svc-api' }), 'svc-api');
});

const good = {
  repos: [
    { name: 'svc-api', url: 'https://github.com/acme/svc-api', defaultBranch: 'main', kind: 'generic', gates: ['build', 'test'] },
    { name: 'svc-web', url: 'https://github.com/acme/svc-web', defaultBranch: 'main', kind: 'generic', gates: ['build', 'test'], services: ['postgres'], contractPin: { dep: '@acme/contracts', version: '^1.4.0' } },
  ],
  merge: { mode: 'queue', max: 2 },
};

test('validateConfig: accepts a good config and applies defaults', () => {
  const c = validateConfig(good);
  assert.equal(c.repos.length, 2);
  assert.deepEqual(c.repos[0].services, []);                 // default
  assert.deepEqual(c.repos[0].surfaceTiers, { elevated: [] }); // default
  assert.equal(c.repos[0].contractPin, null);                // default
  assert.deepEqual(c.merge, { mode: 'queue', max: 2 });
});
test('validateConfig: rejects a non-array repos (fail closed)', () => {
  assert.throws(() => validateConfig({ repos: {} }), /non-empty array/);
});
test('validateConfig: rejects duplicate repo names', () => {
  const dup = { repos: [good.repos[0], good.repos[0]] };
  assert.throws(() => validateConfig(dup), /duplicate repo name/);
});
test('validateConfig: rejects a malformed contractPin (must be {dep,version} or null)', () => {
  const bad = { repos: [{ ...good.repos[0], contractPin: { dep: 'x' } }] };
  assert.throws(() => validateConfig(bad), /contractPin/);
});
test('loadConfig: reads + normalizes a file on disk', () => {
  const d = mkdtempSync(join(tmpdir(), 'cfg-'));
  const f = join(d, 'repos.json'); writeFileSync(f, JSON.stringify(good));
  const c = loadConfig(f);
  assert.equal(c.repos[1].contractPin.version, '^1.4.0');
  assert.equal(c.merge.max, 2);
});
