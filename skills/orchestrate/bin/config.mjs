#!/usr/bin/env node
// Canonical config reader for the orchestrate engine. Reads repos.json:
//   { "repos": [ { name, url, defaultBranch, kind, gates, services, surfaceTiers:{elevated}, contractPin } ],
//     "merge": { mode: "queue"|"self", max } }
// No project names are hardcoded — the engine is config-driven. No side effects on import.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// owner/repo from a git URL (https or ssh), a bare "owner/repo", else fall back to the name.
export function repoSlug(repo) {
  const u = (repo && repo.url) || '';
  const m = u.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (m) return `${m[1]}/${m[2]}`;
  if (/^[^/\s]+\/[^/\s]+$/.test(u)) return u;
  return (repo && repo.name) || '';
}

export function validateConfig(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('config: not an object');
  if (!Array.isArray(obj.repos) || obj.repos.length === 0) throw new Error('config: "repos" must be a non-empty array');
  const seen = new Set();
  const repos = obj.repos.map((r) => {
    if (!r || typeof r !== 'object') throw new Error('config: bad repo entry');
    if (typeof r.name !== 'string' || !r.name) throw new Error('config: repo missing "name"');
    if (seen.has(r.name)) throw new Error(`config: duplicate repo name "${r.name}"`);
    seen.add(r.name);
    if (typeof r.url !== 'string' || !r.url) throw new Error(`config: repo "${r.name}" missing "url"`);
    if (typeof r.defaultBranch !== 'string' || !r.defaultBranch) throw new Error(`config: repo "${r.name}" missing "defaultBranch"`);
    if (typeof r.kind !== 'string' || !r.kind) throw new Error(`config: repo "${r.name}" missing "kind"`);
    if (!Array.isArray(r.gates)) throw new Error(`config: repo "${r.name}" "gates" must be an array`);
    if ('services' in r && !Array.isArray(r.services)) throw new Error(`config: repo "${r.name}" "services" must be an array`);
    if ('contractPin' in r && r.contractPin !== null) {
      const cp = r.contractPin;
      if (typeof cp !== 'object' || typeof cp.dep !== 'string' || typeof cp.version !== 'string') {
        throw new Error(`config: repo "${r.name}" "contractPin" must be {dep,version} or null`);
      }
    }
    if ('surfaceTiers' in r && r.surfaceTiers !== null) {
      const st = r.surfaceTiers;
      if (typeof st !== 'object' || ('elevated' in st && !Array.isArray(st.elevated))) {
        throw new Error(`config: repo "${r.name}" "surfaceTiers.elevated" must be an array`);
      }
    }
    return {
      name: r.name, url: r.url, defaultBranch: r.defaultBranch, kind: r.kind,
      gates: r.gates, services: Array.isArray(r.services) ? r.services : [],
      surfaceTiers: { elevated: (r.surfaceTiers && Array.isArray(r.surfaceTiers.elevated)) ? r.surfaceTiers.elevated : [] },
      contractPin: r.contractPin ?? null,
    };
  });
  const merge = (obj.merge && typeof obj.merge === 'object') ? obj.merge : {};
  if (merge.mode != null && merge.mode !== 'queue' && merge.mode !== 'self') {
    throw new Error('config: "merge.mode" must be "queue" or "self"');
  }
  return { repos, merge: { mode: merge.mode || 'queue', max: Number.isInteger(merge.max) ? merge.max : 1 } };
}

export function loadConfig(jsonPath) {
  const path = jsonPath || process.env.REPOS_JSON || resolve(process.cwd(), 'repos.json');
  return validateConfig(JSON.parse(readFileSync(path, 'utf8')));
}

function fieldValue(repo, key) {
  const slug = repoSlug(repo);
  switch (key) {
    case 'slug': return slug;
    case 'owner': return slug.split('/')[0] || '';
    case 'repo': case 'path': return repo.name;
    case 'url': return repo.url;
    case 'defaultBranch': return repo.defaultBranch;
    case 'kind': return repo.kind;
    case 'gates': return (repo.gates || []).join(' ');
    case 'services': return (repo.services || []).join(' ');
    default: return '';
  }
}

function isMain() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (isMain()) {
  const [mode, name, key] = process.argv.slice(2);
  const cfg = loadConfig();
  if (!mode) { console.log(JSON.stringify(cfg, null, 2)); process.exit(0); }
  if (mode === 'names') { console.log(cfg.repos.map((r) => r.name).join(' ')); process.exit(0); }
  if (mode === 'field') {
    const repo = cfg.repos.find((r) => r.name === name);
    if (!repo) { console.error(`unknown repo ${name}`); process.exit(2); }
    process.stdout.write(String(fieldValue(repo, key)));
    process.exit(0);
  }
  console.error('usage: config.mjs [names | field <name> <key>]');
  process.exit(64);
}
