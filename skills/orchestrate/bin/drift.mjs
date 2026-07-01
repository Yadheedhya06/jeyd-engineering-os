#!/usr/bin/env node
// Pinned-dependency drift check. Generic: the dependency name + expected ref come from each repo's
// `contractPin` ({dep, version}) in repos.json. A repo with contractPin:null is skipped cleanly.
// The dep-file format (npm package.json vs cargo Cargo.toml) is auto-detected from the files present.
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// extractDepRef(format, text, depName): the pinned ref string for depName, or null if absent.
//   'npm'   -> dependencies/devDependencies of a package.json; string values only.
//   'cargo' -> `<depName> = { ... }` in Cargo.toml; returns `git+tag:<tag>` when a tag is pinned.
export function extractDepRef(format, text, depName) {
  if (format === 'npm') {
    const pkg = JSON.parse(text);
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const v = deps[depName];
    return typeof v === 'string' ? v : null;
  }
  if (format === 'cargo') {
    const m = text.match(new RegExp(`^[ \\t]*${escapeRe(depName)}\\s*=\\s*\\{([^}]*)\\}`, 'm'));
    if (!m) return null;
    const tag = m[1].match(/tag\s*=\s*"([^"]+)"/);
    return tag ? `git+tag:${tag[1]}` : m[1].trim();
  }
  return null;
}

export function driftStatus(contractPin, actualRef) {
  return { dep: contractPin.dep, expected: contractPin.version, actual: actualRef, ok: actualRef === contractPin.version };
}

const DEP_FILES = [
  { file: 'package.json', format: 'npm' },
  { file: 'Cargo.toml', format: 'cargo' },
];

// checkRepo(work, repo): a drift row for a config repo, or null when no contractPin is configured
// (skip cleanly — a repo without a pin is simply not drift-checked, never reported as a failure).
export function checkRepo(work, repo) {
  if (!repo.contractPin) return null;
  const repoDir = join(work, repo.name);
  let actual = null;
  for (const { file, format } of DEP_FILES) {
    const fp = join(repoDir, file);
    if (!existsSync(fp)) continue;
    try { actual = extractDepRef(format, readFileSync(fp, 'utf8'), repo.contractPin.dep); } catch { actual = null; }
    if (actual != null) break;
  }
  return { repo: repo.name, ...driftStatus(repo.contractPin, actual) };
}

function isMain() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (isMain()) {
  const { loadConfig } = await import('./config.mjs');
  const cfg = loadConfig();
  const work = process.env.WORK_DIR ||
    join(realpathSync(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..'); // .../skills/orchestrate/bin -> Work
  const rows = cfg.repos.map((r) => checkRepo(work, r)).filter((r) => r !== null);
  console.log(JSON.stringify({ ok: rows.every((r) => r.ok), repos: rows }, null, 2));
}
