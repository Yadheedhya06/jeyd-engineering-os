import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadManifest, validateConfig, validateEntry, getRepo, REQUIRED_KEYS } from '../bin/manifest.mjs';

const repoJson = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'examples', 'demo', 'repos.json');

const goodEntry = (over = {}) => ({
  name: 'svc', url: 'https://github.com/o/svc', defaultBranch: 'main', kind: 'generic',
  gates: ['build', 'test'], commands: { build: 'b', test: 't' },
  services: [], surfaceTiers: { elevated: ['migrations/**'] }, contractPin: null, ...over,
});

test('config loads and has the 3 example repos', () => {
  const cfg = loadManifest(repoJson);
  for (const k of ['api', 'engine', 'web']) {
    assert.ok(getRepo(cfg, k), `missing ${k}`);
  }
});
test('every entry validates', () => {
  const cfg = loadManifest(repoJson);
  for (const e of cfg.repos) validateEntry(e); // throws if invalid
});
test('merge block is queue/max=4', () => {
  const cfg = loadManifest(repoJson);
  assert.equal(cfg.merge.mode, 'queue');
  assert.equal(cfg.merge.max, 4);
});
test('REQUIRED_KEYS lists the expected keys', () => {
  assert.deepEqual(
    [...REQUIRED_KEYS].sort(),
    ['commands', 'defaultBranch', 'gates', 'kind', 'name', 'surfaceTiers', 'url'].sort(),
  );
});
test('validateEntry throws on a missing required key', () => {
  const { url, ...bad } = goodEntry(); // drop url
  assert.throws(() => validateEntry(bad), /missing required key "url"/);
});
test('validateEntry throws on an unknown kind', () => {
  assert.throws(() => validateEntry(goodEntry({ kind: 'weird' })), /unknown kind/);
});
test('validateEntry throws when a listed gate has no command', () => {
  assert.throws(() => validateEntry(goodEntry({ gates: ['build', 'lint'], commands: { build: 'b' } })),
    /gate "lint" has no command/);
});
test('validateEntry throws on a malformed contractPin', () => {
  assert.throws(() => validateEntry(goodEntry({ contractPin: { dep: 'x' } })),
    /contractPin must be null or \{dep, version\}/);
});
test('contractPin null and absent services validate', () => {
  const e = goodEntry({ contractPin: null });
  delete e.services;
  validateEntry(e); // must not throw
});
test('surfaceTiers.elevated is an array for every repo', () => {
  const cfg = loadManifest(repoJson);
  for (const e of cfg.repos) {
    assert.ok(Array.isArray(e.surfaceTiers.elevated), `${e.name} surfaceTiers.elevated`);
  }
});
test('validateConfig throws on an invalid merge mode', () => {
  assert.throws(() => validateConfig({ repos: [goodEntry()], merge: { mode: 'rebase', max: 1 } }),
    /merge.mode must be one of/);
});
test('validateConfig throws when repos is empty', () => {
  assert.throws(() => validateConfig({ repos: [], merge: { mode: 'self', max: 1 } }),
    /repos must be a non-empty array/);
});
