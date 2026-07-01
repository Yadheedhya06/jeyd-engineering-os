#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadManifest, getRepo } from './manifest.mjs';

// Minimal glob: support '**' (any path segments) and '*' (within a segment).
function globToRe(glob) {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\x00/g, '.*');
  return new RegExp('(^|/)' + re + '$');
}

// Elevated globs are 100% config-driven (entry.surfaceTiers.elevated). No hardcoded surfaces.
export function tierFor(repoKey, changedPaths, config) {
  const cfg = config || loadManifest();
  const entry = getRepo(cfg, repoKey);
  const globs = (entry.surfaceTiers && entry.surfaceTiers.elevated) || [];
  const res = globs.map(globToRe);
  for (const p of changedPaths) {
    if (res.some((r) => r.test(p))) return 'elevated';
  }
  return 'standard';
}

function isMain() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}
if (isMain()) {
  const [, , repo, ...paths] = process.argv;
  console.log(tierFor(repo, paths));
}
