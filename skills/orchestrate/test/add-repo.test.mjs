import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectStack, inferCommands, buildCanonicalEntry, writeEntry } from '../bin/add-repo.mjs';
import { validateConfig as validateOrchConfig } from '../bin/config.mjs';
import { validateConfig as validateWorkerConfig } from '../../worker/bin/manifest.mjs';

// ---- detectStack ----
test('detects pnpm from lockfile', () => { assert.equal(detectStack(['package.json', 'pnpm-lock.yaml']), 'ts-pnpm'); });
test('detects npm from package-lock', () => { assert.equal(detectStack(['package.json', 'package-lock.json']), 'ts-npm'); });
test('detects yarn', () => { assert.equal(detectStack(['package.json', 'yarn.lock']), 'ts-yarn'); });
test('detects rust', () => { assert.equal(detectStack(['Cargo.toml']), 'rust'); });
test('detects go', () => { assert.equal(detectStack(['go.mod']), 'go'); });
test('unknown -> null', () => { assert.equal(detectStack(['README.md']), null); });

// ---- inferCommands ----
test('infers npm commands from scripts', () => {
  const c = inferCommands('ts-npm', { scripts: { build: 'tsc', test: 'jest', lint: 'eslint .' } });
  assert.equal(c.install, 'npm install'); assert.equal(c.build, 'npm run build'); assert.equal(c.test, 'npm test'); assert.equal(c.lint, 'npm run lint');
});
test('rust commands are conventional', () => {
  const c = inferCommands('rust');
  assert.equal(c.build, 'cargo build'); assert.equal(c.test, 'cargo test'); assert.equal(c.lint, 'cargo clippy -- -D warnings');
});

// ---- buildCanonicalEntry ----
test('buildCanonicalEntry maps ts-npm stack to kind:node', () => {
  const entry = buildCanonicalEntry('svc', 'https://github.com/a/svc', 'ts-npm', inferCommands('ts-npm'));
  assert.equal(entry.kind, 'node');
});
test('buildCanonicalEntry maps rust stack to kind:rust', () => {
  const entry = buildCanonicalEntry('svc', 'https://github.com/a/svc', 'rust', inferCommands('rust'));
  assert.equal(entry.kind, 'rust');
});
test('buildCanonicalEntry maps go stack to kind:go', () => {
  const entry = buildCanonicalEntry('svc', 'https://github.com/a/svc', 'go', inferCommands('go'));
  assert.equal(entry.kind, 'go');
});
test('buildCanonicalEntry filters null commands from gates', () => {
  const cmds = inferCommands('go'); // lint is null for go
  assert.equal(cmds.lint, null);
  const entry = buildCanonicalEntry('svc', 'https://github.com/a/svc', 'go', cmds);
  assert.ok(!entry.gates.includes('lint'), 'lint gate should not appear when command is null');
  assert.ok(!Object.hasOwn(entry.commands, 'lint'), 'lint command should not appear when null');
});
test('buildCanonicalEntry gates and commands are consistent', () => {
  const cmds = inferCommands('ts-npm', { scripts: { build: 'tsc', test: 'jest', lint: 'eslint .' } });
  const entry = buildCanonicalEntry('svc', 'https://github.com/a/svc', 'ts-npm', cmds);
  for (const g of entry.gates) {
    assert.ok(typeof entry.commands[g] === 'string' && entry.commands[g].trim(), `gate "${g}" must have a command`);
  }
});
test('buildCanonicalEntry includes required canonical fields', () => {
  const entry = buildCanonicalEntry('svc', 'https://github.com/a/svc', 'rust', inferCommands('rust'));
  for (const k of ['name', 'url', 'defaultBranch', 'kind', 'gates', 'commands', 'services', 'surfaceTiers', 'contractPin']) {
    assert.ok(k in entry, `entry must have field "${k}"`);
  }
  assert.ok(Array.isArray(entry.surfaceTiers.elevated));
});

// ---- canonical schema round-trip through both validators ----
test('buildCanonicalEntry (node) produces schema accepted by config.mjs + manifest.mjs validators', () => {
  const stack = 'ts-npm';
  const cmds = inferCommands(stack, { scripts: { build: 'tsc', test: 'jest' } });
  const entry = buildCanonicalEntry('my-svc', 'https://github.com/acme/my-svc', stack, cmds);
  const cfg = { repos: [entry], merge: { mode: 'queue', max: 4 } };
  assert.doesNotThrow(() => validateOrchConfig(cfg), 'config.mjs (orchestrate) must accept entry');
  assert.doesNotThrow(() => validateWorkerConfig(cfg), 'manifest.mjs (worker) must accept entry');
});

test('buildCanonicalEntry (rust) produces schema accepted by both validators', () => {
  const cmds = inferCommands('rust');
  const entry = buildCanonicalEntry('my-rust-svc', 'https://github.com/acme/my-rust-svc', 'rust', cmds);
  const cfg = { repos: [entry], merge: { mode: 'queue', max: 1 } };
  assert.doesNotThrow(() => validateOrchConfig(cfg));
  assert.doesNotThrow(() => validateWorkerConfig(cfg));
});

test('writeEntry writes a canonical repos.json accepted by both validators', () => {
  const dir = mkdtempSync(join(tmpdir(), 'add-repo-test-'));
  try {
    const manifestPath = join(dir, 'repos.json');
    const cmds = inferCommands('rust');
    const entry = buildCanonicalEntry('my-rust-svc', 'https://github.com/acme/my-rust-svc', 'rust', cmds);
    writeEntry(manifestPath, entry);
    const cfg = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.doesNotThrow(() => validateOrchConfig(cfg), 'written file must pass config.mjs validator');
    assert.doesNotThrow(() => validateWorkerConfig(cfg), 'written file must pass manifest.mjs validator');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('writeEntry replaces existing entry by name, does not duplicate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'add-repo-test-'));
  try {
    const manifestPath = join(dir, 'repos.json');
    const cmds = inferCommands('go');
    const entry = buildCanonicalEntry('my-go-svc', 'https://github.com/acme/my-go-svc', 'go', cmds);
    writeEntry(manifestPath, entry);
    writeEntry(manifestPath, { ...entry, defaultBranch: 'develop' });
    const cfg = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(cfg.repos.length, 1, 'second write must replace, not append');
    assert.equal(cfg.repos[0].defaultBranch, 'develop', 'updated field must be reflected');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('writeEntry initialises merge block with sane defaults when file is new', () => {
  const dir = mkdtempSync(join(tmpdir(), 'add-repo-test-'));
  try {
    const manifestPath = join(dir, 'repos.json');
    const cmds = inferCommands('python');
    const entry = buildCanonicalEntry('my-py-svc', 'https://github.com/acme/my-py-svc', 'python', cmds);
    writeEntry(manifestPath, entry);
    const cfg = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.ok(cfg.merge && cfg.merge.mode, 'merge block must be present');
    assert.ok(typeof cfg.merge.max === 'number' && cfg.merge.max >= 1, 'merge.max must be >= 1');
    assert.doesNotThrow(() => validateWorkerConfig(cfg));
  } finally {
    rmSync(dir, { recursive: true });
  }
});
