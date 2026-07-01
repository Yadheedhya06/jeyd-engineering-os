---
name: worker
description: Use when running an autonomous per-repo development loop for one repo listed in your repos.json config (inside a session or worktree). Takes an assigned GitHub issue from ingest through TDD, self-redteam, PR, the full gauntlet (gates + optional services + conformance + code-review + redteam + intent-check), and autonomous merge — or escalates. Engine is project-agnostic; per-repo gates/services/surface-tiers/contract-pin come from config.
---

# Worker — per-repo autonomous loop

**Announce:** "Using the worker skill to work <repo>#<issue>."

You run inside one repo's session. Your job: take ONE assigned issue to merged-or-escalated, at high
reasoning effort, fail-closed. Read `references/gauntlet.md` and `references/autonomous-merge.md` first.

## 0. Preconditions
- Identify your repo key (the entry `name`) and confirm it is in your `repos.json` (read via `bin/manifest.mjs`; set `REPOS_JSON` to the file path). See `examples/demo/` for a worked configuration.
- If the entry has a `contractPin`, confirm the repo pins that dependency + version. If `contractPin` is `null`, there is NO contract: SKIP the drift and conformance gates entirely — the gauntlet is whatever `gates[]` lists, then PR -> autonomous merge.
- Confirm the kill switch is absent: the PAUSE file the orchestrator manages (`${ORCH_STATE_DIR:-$HOME/.orchestrate}/PAUSE`).

## 1. Ingest
Read the mission spec (if any), the repo's docs + contract-consumer surface, and the assigned issue. State the issue's acceptance criteria explicitly.

## 2. Plan
Non-trivial -> superpowers:brainstorming / writing-plans. Well-scoped -> straight to TDD. Always branch (`git switch -c <type>/<issue>-<slug>`); NEVER commit to the default branch.

## 3. Implement (TDD)
Use superpowers:test-driven-development. Red -> green -> refactor, per the repo's `test` gate command.

## 4. Self-redteam
Run the `redteam` skill on your design + diff (target = the diff, intent = the issue's acceptance criteria + the mission). Address every standing finding before opening the PR.

## 5. PR
Open it with `gh pr create`, linked to the issue, with intent + test evidence in the body.

## 6. Gauntlet (references/gauntlet.md)
- `REPOS_JSON=<path> bin/gauntlet.sh <repo-key>` (ephemeral services handled inside when `services[]` lists them) — must exit 0.
- Compute the tier: `REPOS_JSON=<path> node bin/surface-tier.mjs <repo-key> <changed paths...>`.
- `redteam` gate = pass. `/code-review` (max effort if elevated) = zero high/critical. intent-check passes.

## 7. Decide (references/autonomous-merge.md)
All gates green and policy satisfied -> autonomous merge (`gh pr merge --squash --delete-branch`), log it.
Otherwise iterate, or ESCALATE (a contract-surface change in a repo that declares a `contractPin`, required CI absent when expected, a standing high-severity challenge, or any unresolved red gate) — leave the PR open, request a human, STOP.

## Rules
- Fail closed: a missing/ambiguous gate result is a FAIL, never a pass.
- Drift gate: a repo with a `contractPin` may NEVER change the pinned contract surface — escalate instead.
- Secrets are ENV-ONLY (`GH_WORKER_TOKEN`, `CONTRACTS_TOKEN`); never read or write secret values to disk or config.
- Honor the PAUSE kill switch before every merge.
