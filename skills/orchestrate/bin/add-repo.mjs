#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

export function detectStack(files) {
  const f = new Set(files);
  if (f.has('pnpm-lock.yaml')) return 'ts-pnpm';
  if (f.has('yarn.lock')) return 'ts-yarn';
  if (f.has('package-lock.json') || f.has('package.json')) return 'ts-npm';
  if (f.has('Cargo.toml')) return 'rust';
  if (f.has('go.mod')) return 'go';
  if (f.has('pyproject.toml') || f.has('setup.py')) return 'python';
  return null;
}
const PM = { 'ts-npm': 'npm', 'ts-pnpm': 'pnpm', 'ts-yarn': 'yarn' };
export function inferCommands(stack, pkg = {}) {
  if (stack in PM) {
    const pm = PM[stack];
    const s = pkg.scripts || {};
    return {
      install: `${pm} install`,
      build: s.build ? `${pm}${pm === 'npm' ? ' run' : ''} build` : 'true',
      test: s.test ? (pm === 'npm' ? 'npm test' : `${pm} test`) : 'true',
      lint: s.lint ? `${pm}${pm === 'npm' ? ' run' : ''} lint` : null,
    };
  }
  if (stack === 'rust') return { install: 'true', build: 'cargo build', test: 'cargo test', lint: 'cargo clippy -- -D warnings' };
  if (stack === 'go') return { install: 'true', build: 'go build ./...', test: 'go test ./...', lint: null };
  if (stack === 'python') return { install: 'pip install -e .', build: 'true', test: 'pytest', lint: null };
  return { install: 'true', build: 'true', test: 'true', lint: null };
}

// Map detected stack string to the kind value accepted by the canonical schema.
const STACK_KIND = { 'ts-npm': 'node', 'ts-pnpm': 'node', 'ts-yarn': 'node', rust: 'rust', go: 'go', python: 'python' };

/**
 * Build a canonical entry compatible with both config.mjs (orchestrate) and
 * manifest.mjs (worker) validators.
 *
 * @param {string} name        - repo name (the key used everywhere)
 * @param {string} url         - full GitHub HTTPS URL
 * @param {string|null} stack  - detectStack() result
 * @param {object} cmds        - inferCommands() result (null values are filtered out)
 * @param {object} [opts]      - optional overrides: defaultBranch, services, elevated, contractPin
 */
export function buildCanonicalEntry(name, url, stack, cmds, opts = {}) {
  const kind = STACK_KIND[stack] || 'generic';
  // Build gates (ordered list) and commands map by filtering out null command values.
  const gates = [];
  const commands = {};
  for (const [k, v] of Object.entries(cmds)) {
    if (v != null) { gates.push(k); commands[k] = v; }
  }
  return {
    name,
    url,
    defaultBranch: opts.defaultBranch || 'main',
    kind,
    gates,
    commands,
    services: opts.services || [],
    surfaceTiers: { elevated: opts.elevated || ['**/*migrat*', '**/*.sql', '**/*secret*', '**/*.env*'] },
    contractPin: opts.contractPin || null,
  };
}

/**
 * Append or replace (by name) an entry in the canonical repos.json at manifestPath.
 * Creates the file (and parent directories) if it does not exist.
 */
export function writeEntry(manifestPath, entry) {
  mkdirSync(dirname(manifestPath), { recursive: true });
  let cfg = { repos: [], merge: { mode: 'queue', max: 4 } };
  try { cfg = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch {}
  if (!cfg.repos) cfg.repos = [];
  if (!cfg.merge) cfg.merge = { mode: 'queue', max: 4 };
  const idx = cfg.repos.findIndex((r) => r.name === entry.name);
  if (idx >= 0) cfg.repos[idx] = entry;
  else cfg.repos.push(entry);
  writeFileSync(manifestPath, JSON.stringify(cfg, null, 2));
}

function isMain() { if (!process.argv[1]) return false; try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } }
if (isMain()) {
  const args = process.argv.slice(2);
  const ownerRepo = args[0];
  if (!ownerRepo || !ownerRepo.includes('/')) { console.error('usage: add-repo <owner/repo> --path <dir> [--manifest <file>]'); process.exit(2); }
  const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const name = ownerRepo.split('/')[1];
  const repoPath = get('--path') || join(process.env.WORK_DIR || process.cwd(), name);
  if (!existsSync(repoPath)) { console.error(`path not found: ${repoPath} (clone the repo first or pass --path)`); process.exit(3); }
  const files = readdirSync(repoPath);
  const stack = detectStack(files);
  if (!stack) { console.error(`could not detect a supported stack in ${repoPath}`); process.exit(4); }
  let pkg = {}; try { pkg = JSON.parse(readFileSync(join(repoPath, 'package.json'), 'utf8')); } catch {}
  const cmds = inferCommands(stack, pkg);
  const url = `https://github.com/${ownerRepo}`;
  const entry = buildCanonicalEntry(name, url, stack, cmds);
  const manifestPath = get('--manifest') || process.env.REPOS_JSON || resolve(process.cwd(), 'repos.json');
  writeEntry(manifestPath, entry);
  console.log(`added ${name} (${stack}) to ${manifestPath}`);
}
