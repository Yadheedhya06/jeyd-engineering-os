#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export function summarize(repoStatuses) {
  const totals = { repos: repoStatuses.length, openPRs: 0, openIssues: 0, prsGreen: 0, prsRed: 0, prsPending: 0, prsNone: 0 };
  const lines = ['repo                | PRs | grn/red/pnd/none | issues | lastMerge'];
  for (const r of repoStatuses) {
    totals.openPRs += r.openPRs.length;
    totals.openIssues += r.openIssues;
    const g = r.openPRs.filter((p) => p.checks === 'green').length;
    const rd = r.openPRs.filter((p) => p.checks === 'red').length;
    const pd = r.openPRs.filter((p) => p.checks === 'pending').length;
    const nn = r.openPRs.filter((p) => p.checks === 'none').length;
    totals.prsGreen += g; totals.prsRed += rd; totals.prsPending += pd; totals.prsNone += nn;
    lines.push(`${r.repo.padEnd(20)}| ${String(r.openPRs.length).padStart(3)} | ${g}/${rd}/${pd}/${nn}            | ${String(r.openIssues).padStart(6)} | ${r.lastMerge || '-'}`);
  }
  return { totals, repos: repoStatuses, table: lines.join('\n') };
}

function isMain() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (isMain()) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');
  const { loadConfig, repoSlug } = await import('./config.mjs');
  const cfg = loadConfig();
  // Status covers exactly the repos declared in repos.json (the engine has no hardcoded repo set).
  const statuses = [];
  for (const r of cfg.repos) {
    const slug = repoSlug(r);
    let openPRs = [], openIssues = 0, lastMerge = null;
    try {
      const prs = JSON.parse(execFileSync('gh', ['pr', 'list', '--json', 'number,title,statusCheckRollup', '-R', slug], { encoding: 'utf8' }));
      openPRs = prs.map((p) => ({ number: p.number, title: p.title, checks: rollup(p.statusCheckRollup) }));
      openIssues = JSON.parse(execFileSync('gh', ['issue', 'list', '--json', 'number', '-R', slug], { encoding: 'utf8' })).length;
      const merged = JSON.parse(execFileSync('gh', ['pr', 'list', '--state', 'merged', '--limit', '1', '--json', 'number,mergedAt', '-R', slug], { encoding: 'utf8' }));
      if (merged[0]) lastMerge = `#${merged[0].number} ${(merged[0].mergedAt || '').slice(0, 10)}`;
    } catch { /* no remote / not authed — leave zeros */ }
    statuses.push({ repo: r.name, openPRs, openIssues, lastMerge });
  }
  const out = summarize(statuses);
  console.log(out.table);
  // Durable cache + audit snapshot — configurable state dir, non-fatal if it can't be written.
  try {
    const base = process.env.ORCHESTRATE_STATE || join(homedir(), '.orchestrate');
    mkdirSync(join(base, 'logs'), { recursive: true });
    const payload = JSON.stringify({ totals: out.totals, repos: out.repos, generatedAt: new Date().toISOString() }, null, 2);
    writeFileSync(join(base, 'status.json'), payload);
    writeFileSync(join(base, 'logs', `status-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), payload);
  } catch { /* status still printed */ }
}
export function classifyCheck(c) {
  const status = (c.status || '').toUpperCase();       // CheckRun: QUEUED|IN_PROGRESS|COMPLETED
  const state = (c.state || '').toUpperCase();          // StatusContext: PENDING|SUCCESS|FAILURE|ERROR|EXPECTED
  const conclusion = (c.conclusion || '').toUpperCase();// CheckRun conclusion (when COMPLETED)
  if (status === 'QUEUED' || status === 'IN_PROGRESS' || state === 'PENDING' || state === 'EXPECTED') return 'running';
  if (state === 'SUCCESS') return 'success';
  if (state === 'FAILURE' || state === 'ERROR') return 'failed';
  if (conclusion === 'SUCCESS' || conclusion === 'NEUTRAL' || conclusion === 'SKIPPED') return 'success';
  if (['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE'].includes(conclusion)) return 'failed';
  return 'unknown';
}

// Fail closed: unknown/unrecognized state is RED, never green. A still-running check is pending.
export function rollup(checks) {
  if (!checks || checks.length === 0) return 'none';
  const cls = checks.map(classifyCheck);
  if (cls.some((x) => x === 'failed' || x === 'unknown')) return 'red';
  if (cls.some((x) => x === 'running')) return 'pending';
  return 'green';
}
