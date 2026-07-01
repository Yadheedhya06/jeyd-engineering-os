export const meta = {
  name: 'interrogate',
  description: 'Per-PR redteam<->worker interrogation loop until the redteam gate passes, then label redteam-clear',
  phases: [{ title: 'Interrogate' }],
}

// MIRRORS skills/orchestrate/bin/interrogate-state.mjs (gatePasses / noProgress / interrogationLoop).
// The Workflow sandbox cannot import; keep these three in sync — tests live in interrogate-state.test.mjs.
const gatePasses = (v) => !!v && typeof v === 'object' && v.gate === 'pass'
const noProgress = (h) => Array.isArray(h) && h.length >= 2 && h.slice(-2).every((w) => !w || (!w.pushed && !w.conceded))

const HEADLESS =
  'You are HEADLESS — there is NO human and NO stdin. NEVER ask a question or wait for input; a question ' +
  'hangs you forever. On any decision, pick the option best for this autonomous, offline-CI, real-money use ' +
  'case AND recommended by the ecosystem (prefer the most deterministic/immutable/offline-safe/fail-closed ' +
  'option for pins/contracts/money/CI); record the choice + why in the PR body and commit, then proceed. ' +
  'For an irreversible high-stakes choice, pick the conservative/fail-closed option and flag it in the PR body — never block.'

const VERDICT_SCHEMA = {
  type: 'object', required: ['gate'],
  properties: {
    gate: { enum: ['pass', 'fail'] },
    ciGreen: { type: 'boolean' },
    decisions: { type: 'array', items: { type: 'object',
      properties: {
        id: { type: 'string' }, verdict: { enum: ['cleared', 'revise', 'blocked'] },
        surface: { enum: ['standard', 'elevated'] },
        severity: { enum: ['critical', 'high', 'medium', 'low'] },
        why: { type: 'string' }, demand: { type: 'string' },
      } } },
  },
}
const WORK_SCHEMA = {
  type: 'object', required: ['pushed', 'conceded'],
  properties: { pushed: { type: ['string', 'null'] }, conceded: { type: 'boolean' },
    answers: { type: 'array', items: { type: 'object' } } },
}

const RR = (a) => `${a.owner}/${a.repo}`
const thread = (a, pr) => `${a.reviewDir}/${a.repo}-${pr}.jsonl`

const RT_PROMPT = (a, pr, issues, tier, round) =>
  `[agent:${a.repo}:rt-${pr}] You are the SINGLE redteam gate for PR #${pr} of ${RR(a)}, round ${round}. ` +
  `Run the redteam skill (~/.claude/skills/redteam) adversarially. ` +
  `Target = the PR's DIFF ONLY: \`gh pr diff ${pr} -R ${RR(a)}\` (committed changes vs base '${a.base}') — NOT the whole repo. ` +
  `Intent = the acceptance criteria of EACH bundle issue: run \`gh issue view <N> -R ${RR(a)}\` for N in [${issues.join(', ')}] and use their Intent/expected-behaviour sections + the configured contract. ` +
  `${tier === 'elevated' ? 'This is an ELEVATED real-money surface: 5 opponents per material decision, UNANIMOUS clear required. ' : 'Apply the severity rubric per decision (standard=3 / elevated=5 opponents). '}` +
  `PRECONDITION: confirm CI is green on the PR head (\`gh pr checks ${pr} -R ${RR(a)}\`); if red, return {gate:"fail"} with a "CI red" refutation. ` +
  `Read the prior dialogue at ${thread(a, pr)} (if it exists) for continuity. Dispatch fresh, independent opponent subagents (references/opponent-prompt.md) — they REFUTE, not review; an unanswered/hand-waved refutation STANDS. ` +
  `Write opponents.json and run \`node ~/.claude/skills/redteam/bin/aggregate.mjs <opponents.json>\` for the DETERMINISTIC verdict — never compute it by hand; if aggregate errors/exits non-zero, the gate is FAIL. ` +
  `Append your turn (round ${round}, role redteam, the aggregate output) as one JSON line to ${thread(a, pr)} (\`mkdir -p\` its dir first). ` +
  `NEVER add/remove labels (a separate step owns that). ${HEADLESS} ` +
  `RETURN the aggregate.mjs output verbatim: { gate, decisions, ciGreen }.`

const WK_PROMPT = (a, pr, issues, round) =>
  `[agent:${a.repo}:def-${pr}] You are the BUILDER/DEFENDER of PR #${pr} of ${RR(a)}, round ${round}. ` +
  `\`gh pr checkout ${pr} -R ${RR(a)}\`. Read the dialogue at ${thread(a, pr)} — for EACH standing refutation (verdict revise|blocked): ` +
  `either DEFEND it with CONCRETE EVIDENCE (cite code, a passing test, or a spec/contract clause) OR CONCEDE and revise the code IN PLACE on this branch and push. ` +
  `A hand-waved/unanswered refutation STANDS — do not pretend. Keep CI green (reproduce CI locally from .github/workflows/*.yml before relying on remote); NEVER loosen/repoint the configured contract dependency pin to force green. ` +
  `These issues are the bar: [${issues.join(', ')}]. Append your turn (round ${round}, role worker, your answers, the pushed sha or null) as one JSON line to ${thread(a, pr)}. ` +
  `Do NOT merge. Do NOT touch labels. ${HEADLESS} ` +
  `RETURN { pushed: "<sha>"|null, conceded: <true if you changed code this round>, answers: [...] }.`

const CLEAR_PROMPT = (a, pr) =>
  `[agent:${a.repo}:clear-${pr}] Apply the redteam-clear gate to PR #${pr} of ${RR(a)}: ` +
  `\`gh pr edit ${pr} -R ${RR(a)} --add-label redteam-clear --remove-label redteam-blocked\`. Do NOTHING else. Do NOT merge. ${HEADLESS}`

const BLOCK_PROMPT = (a, pr, reason) =>
  `[agent:${a.repo}:block-${pr}] Block PR #${pr} of ${RR(a)} (reason: ${reason}): ` +
  `\`gh pr edit ${pr} -R ${RR(a)} --add-label redteam-blocked --remove-label redteam-clear\` and ` +
  `\`gh pr comment ${pr} -R ${RR(a)} -b "redteam: not cleared (${reason}). See ${thread(a, pr)} for standing refutations; needs human review."\`. Do NOTHING else. Do NOT merge. ${HEADLESS}`

// Workflow body — the runtime injects args/phase/pipeline/agent/log and captures the top-level `return`.
// Top-level await + top-level return are how Workflow scripts run (proven by the §10 validation smoke).
// Do NOT wrap this in an IIFE or use `export` here — the runtime extracts `meta` above and runs this in an async scope.
let a = args
// The Workflow runtime can deliver `args` as a JSON string rather than a parsed object; normalize defensively.
if (typeof a === 'string') { try { a = JSON.parse(a) } catch (e) { log(`interrogate: args JSON.parse failed: ${e.message}`); return { results: [] } } }
// Fail-safe: no ready PRs -> no-op (run.sh already guards, but pipeline() rejects an empty array).
if (!Array.isArray(a.prs) || a.prs.length === 0) { log('interrogate: no ready PRs — nothing to do'); return { results: [] } }
phase('Interrogate')

// One PR's full interrogation chain: redteam <-> worker rounds until the gate passes or a fail-closed cap.
const interrogatePr = async ({ pr, issues, tier }) => {
  const workerHistory = []
  let round = 0
  while (round < a.maxRounds) {
    round += 1
    const verdict = await agent(RT_PROMPT(a, pr, issues, tier, round),
      { label: `rt-${pr}-r${round}`, phase: 'Interrogate', effort: 'high', schema: VERDICT_SCHEMA })
    if (gatePasses(verdict)) {
      await agent(CLEAR_PROMPT(a, pr), { label: `clear-${pr}`, phase: 'Interrogate', effort: 'low' })
      return { pr, result: 'cleared', rounds: round }
    }
    const work = await agent(WK_PROMPT(a, pr, issues, round),
      { label: `def-${pr}-r${round}`, phase: 'Interrogate', effort: 'high', schema: WORK_SCHEMA })
    workerHistory.push(work)
    if (noProgress(workerHistory)) {
      await agent(BLOCK_PROMPT(a, pr, 'no progress after 2 rounds'), { label: `block-${pr}`, phase: 'Interrogate', effort: 'low' })
      return { pr, result: 'blocked', rounds: round, reason: 'no-progress' }
    }
  }
  await agent(BLOCK_PROMPT(a, pr, `not cleared in ${a.maxRounds} rounds`), { label: `block-${pr}`, phase: 'Interrogate', effort: 'low' })
  return { pr, result: 'blocked', rounds: round, reason: 'max-rounds' }
}

// Spec §8: bound concurrent PR-chains for cost/load control on the wallet machine (the Workflow's own
// default cap is ~min(16, cores-2), too high). Run interrogations in batches of `concurrency` (default 2).
const concurrency = a.concurrency ?? 2
const results = []
for (let i = 0; i < a.prs.length; i += concurrency) {
  const batch = await parallel(a.prs.slice(i, i + concurrency).map((item) => () => interrogatePr(item)))
  results.push(...batch)
}
log(`interrogate ${a.repo}: ${results.filter((r) => r && r.result === 'cleared').length}/${results.length} cleared`)
return { results }
