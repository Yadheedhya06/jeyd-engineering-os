#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REQUIRED_KEYS = ['name', 'url', 'defaultBranch', 'kind', 'gates', 'surfaceTiers', 'commands'];
const KINDS = new Set(['generic', 'node', 'rust', 'go', 'python']);
const MERGE_MODES = new Set(['queue', 'self']);

export function validateEntry(e) {
  if (!e || typeof e !== 'object') throw new Error('repo entry must be an object');
  const key = e.name || '(unnamed)';
  for (const k of REQUIRED_KEYS) {
    if (!(k in e)) throw new Error(`repo ${key}: missing required key "${k}"`);
  }
  for (const k of ['name', 'url', 'defaultBranch']) {
    if (typeof e[k] !== 'string' || e[k].trim() === '') {
      throw new Error(`repo ${key}: ${k} must be a non-empty string`);
    }
  }
  if (!KINDS.has(e.kind)) throw new Error(`repo ${key}: unknown kind "${e.kind}"`);
  if (!Array.isArray(e.gates) || e.gates.length === 0 || !e.gates.every((g) => typeof g === 'string')) {
    throw new Error(`repo ${key}: gates must be a non-empty array of strings`);
  }
  if (!e.commands || typeof e.commands !== 'object') {
    throw new Error(`repo ${key}: commands must be an object`);
  }
  for (const g of e.gates) {
    if (typeof e.commands[g] !== 'string' || e.commands[g].trim() === '') {
      throw new Error(`repo ${key}: gate "${g}" has no command`);
    }
  }
  if ('services' in e && (!Array.isArray(e.services) || !e.services.every((s) => typeof s === 'string'))) {
    throw new Error(`repo ${key}: services must be an array of strings`);
  }
  if (!e.surfaceTiers || typeof e.surfaceTiers !== 'object' || !Array.isArray(e.surfaceTiers.elevated)) {
    throw new Error(`repo ${key}: surfaceTiers.elevated must be an array`);
  }
  if (!e.surfaceTiers.elevated.every((g) => typeof g === 'string')) {
    throw new Error(`repo ${key}: surfaceTiers.elevated must be strings`);
  }
  if ('contractPin' in e && e.contractPin !== null) {
    const p = e.contractPin;
    if (typeof p !== 'object' || typeof p.dep !== 'string' || typeof p.version !== 'string') {
      throw new Error(`repo ${key}: contractPin must be null or {dep, version}`);
    }
  }
}

export function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new Error('config must be an object');
  if (!Array.isArray(cfg.repos) || cfg.repos.length === 0) {
    throw new Error('config.repos must be a non-empty array');
  }
  const seen = new Set();
  for (const e of cfg.repos) {
    validateEntry(e);
    if (seen.has(e.name)) throw new Error(`duplicate repo name "${e.name}"`);
    seen.add(e.name);
  }
  const m = cfg.merge;
  if (!m || typeof m !== 'object') throw new Error('config.merge must be an object');
  if (!MERGE_MODES.has(m.mode)) throw new Error(`config.merge.mode must be one of ${[...MERGE_MODES].join(', ')}`);
  if (typeof m.max !== 'number' || m.max < 1) throw new Error('config.merge.max must be a number >= 1');
  return cfg;
}

export function getRepo(cfg, name) {
  const e = (cfg.repos || []).find((r) => r.name === name);
  if (!e) throw new Error(`unknown repo "${name}"`);
  return e;
}

export function loadManifest(jsonPath) {
  const path = jsonPath || process.env.REPOS_JSON;
  if (!path) throw new Error('REPOS_JSON not set and no path provided');
  return validateConfig(JSON.parse(readFileSync(path, 'utf8')));
}

function isMain() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}
if (isMain()) {
  console.log(JSON.stringify(loadManifest(process.argv[2]), null, 2));
}
