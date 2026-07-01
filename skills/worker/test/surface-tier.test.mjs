import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierFor } from '../bin/surface-tier.mjs';

const cfg = {
  repos: [
    { name: 'svc-a', surfaceTiers: { elevated: ['migrations/**', 'sql/**', '**/*.event.ts', '**/*.gateway.ts'] } },
    { name: 'svc-b', surfaceTiers: { elevated: ['crates/core/**', '**/schema.rs', 'migrations/**'] } },
  ],
  merge: { mode: 'self', max: 1 },
};

test('a migrations change is elevated (glob from config)', () => {
  assert.equal(tierFor('svc-b', ['migrations/0005_x.sql'], cfg), 'elevated');
});
test('a plain source change is standard', () => {
  assert.equal(tierFor('svc-a', ['src/modules/foo/foo.service.ts'], cfg), 'standard');
});
test('a repo-specific elevated glob matches (filename glob)', () => {
  assert.equal(tierFor('svc-a', ['src/modules/signal/signal.gateway.ts'], cfg), 'elevated');
});
test('glob semantics: crates/core/** (dir) and **/schema.rs (filename)', () => {
  assert.equal(tierFor('svc-b', ['crates/core/src/x.rs'], cfg), 'elevated');
  assert.equal(tierFor('svc-b', ['crates/db/src/schema.rs'], cfg), 'elevated');
  assert.equal(tierFor('svc-b', ['crates/db/src/main.rs'], cfg), 'standard');
});
test('mixed set with one elevated path is elevated', () => {
  assert.equal(tierFor('svc-a', ['README.md', 'src/db/user.event.ts'], cfg), 'elevated');
});
test('unknown repo throws', () => {
  assert.throws(() => tierFor('nope', ['x.ts'], cfg), /unknown repo/);
});
