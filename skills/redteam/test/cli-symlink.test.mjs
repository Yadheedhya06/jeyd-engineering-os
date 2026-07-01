import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The install script symlinks the whole skill dir into ~/.claude/skills/redteam.
// Invoking the CLI through that symlink must still print a verdict — the
// main-module guard compares realpaths so it does not go silently inert.
test('CLI prints a verdict when invoked through a directory symlink', () => {
  const skillDir = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..')); // skills/redteam
  const tmp = mkdtempSync(join(tmpdir(), 'redteam-smoke-'));
  const link = join(tmp, 'redteam');
  symlinkSync(skillDir, link, 'dir');
  const sample = join(skillDir, 'fixtures', 'opponents-sample.json');
  const out = execFileSync('node', [join(link, 'bin', 'aggregate.mjs'), sample], { encoding: 'utf8' });
  assert.match(out, /"gate":\s*"fail"/);
  assert.match(out, /"verdict":\s*"blocked"/);
});
