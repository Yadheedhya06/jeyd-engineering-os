#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HIGHISH = (sev) => sev === 'critical' || sev === 'high';
const SURFACES = new Set(['standard', 'elevated']);
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const SEV_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const MIN_OPPONENTS = { standard: 3, elevated: 5 };

export function classify(d) {
  // Fail closed on malformed input — an audit gate must never silently soften.
  if (!SURFACES.has(d.surface)) {
    throw new Error(`decision ${d.id}: unknown surface "${d.surface}" (expected standard|elevated)`);
  }
  if (!SEVERITIES.has(d.severity)) {
    throw new Error(`decision ${d.id}: unknown severity "${d.severity}" (expected critical|high|medium|low)`);
  }
  if (!Array.isArray(d.opponents)) {
    throw new Error(`decision ${d.id}: opponents must be an array`);
  }
  const required = MIN_OPPONENTS[d.surface];
  if (d.opponents.length < required) {
    throw new Error(`decision ${d.id}: ${d.surface} surface requires >= ${required} opponents, got ${d.opponents.length}`);
  }
  // Effective severity = max(audited agent's rating, any opponent's rating).
  // Opponents are independent adversaries: they can ESCALATE severity but never
  // lower it, so the audited agent cannot game the gate by self-rating low.
  let sev = d.severity;
  for (const o of d.opponents) {
    if (o.severity === undefined || o.severity === null) continue;
    if (!SEVERITIES.has(o.severity)) {
      throw new Error(`decision ${d.id}: opponent has unknown severity "${o.severity}" (expected critical|high|medium|low)`);
    }
    if (SEV_RANK[o.severity] > SEV_RANK[sev]) sev = o.severity;
  }
  const total = d.opponents.length;
  const refuted = d.opponents.filter((o) => o.refuted).length;
  const majority = refuted * 2 > total;
  let verdict;
  if (d.surface === 'elevated') {
    // unanimous clear required
    if (refuted === 0) verdict = 'cleared';
    else if (sev === 'critical') verdict = 'blocked';
    else verdict = 'revise';
  } else {
    if (refuted === 0) verdict = 'cleared';
    else if (majority && HIGHISH(sev)) verdict = 'blocked';
    else if (majority) verdict = 'revise';
    else if (HIGHISH(sev)) verdict = 'revise';
    else verdict = 'cleared';
  }
  return { id: d.id, verdict, refuted, total, surface: d.surface, severity: sev };
}

export function aggregate(input) {
  if (!input || !Array.isArray(input.decisions)) {
    throw new Error('input must have a decisions array');
  }
  const decisions = input.decisions.map(classify);
  const summary = { cleared: 0, revise: 0, blocked: 0 };
  for (const d of decisions) summary[d.verdict] += 1;
  const gate = decisions.every((d) => d.verdict === 'cleared') ? 'pass' : 'fail';
  return { decisions, summary, gate };
}

// Run the CLI when this file is executed directly — INCLUDING through the
// install symlink (~/.claude/skills/redteam -> repo), where process.argv[1] is
// the symlink path but import.meta.url is the realpath. Compare realpaths so
// the gate is not silently inert in its installed configuration.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: aggregate.mjs <opponents.json>');
    process.exit(2);
  }
  try {
    const input = JSON.parse(readFileSync(path, 'utf8'));
    console.log(JSON.stringify(aggregate(input), null, 2));
  } catch (err) {
    console.error(`redteam: ${err.message}`);
    process.exit(1);
  }
}
