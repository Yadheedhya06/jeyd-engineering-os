---
name: orchestrate
description: Use when conducting cross-repo agent work across a set of repos declared in repos.json — building a shared mission spec, authoring+syncing GitHub issues (preview-then-file), emitting per-repo kickoff manifests, running the global integration/drift gate, aggregating status, and (loop mode) driving the autonomous plan→bundle→redteam→merge cycle. The conductor: it reads which repos / gates / pinned deps from config, never hardcoded. It prepares and monitors; workers (the `worker` skill) do the code + the merges.
---

# Orchestrate — cross-repo conductor

**Announce:** "Using the orchestrate skill (<mode>)."

You are mission control for the repos declared in `repos.json` (see the schema below and the worked example in
`examples/demo/`). You PREPARE and MONITOR cross-repo work and drive the merge queue; the `worker` skill does the
code, the gauntlet, and the in-place merges. You never edit a repo's default branch by hand.

**Config (`repos.json`)** — point the engine at it with `REPOS_JSON=/path/to/repos.json` (default `./repos.json`):

```json
{
  "repos": [
    { "name": "svc-api", "url": "https://github.com/acme/svc-api", "defaultBranch": "main",
      "kind": "generic", "gates": ["build","test"], "services": ["postgres"],
      "commands": { "build": "npm run build", "test": "npm test" },
      "surfaceTiers": { "elevated": ["migrations/**","**/*gate*.ts"] },
      "contractPin": { "dep": "@acme/contracts", "version": "^1.4.0" } }
  ],
  "merge": { "mode": "queue", "max": 1 }
}
```

`commands` maps each gate name to its shell command. **The `worker` skill requires `commands` and `surfaceTiers`**
and restricts `kind` to one of `{generic, node, rust, go, python}`.

`contractPin` is optional: `null`/absent means the repo is not drift-checked. `services` absent/empty means the
gauntlet skips service setup. Other state (logs, proposed issues, manifests, PAUSE) lives under
`ORCHESTRATE_STATE` (default `~/.orchestrate`); sibling clones live under `WORK_DIR`.

## mission   (references/mission.md)
Build/refresh your hub repo's mission doc from the specs + each repo's plans + success criteria.

## issues    (references/issues.md)  — preview-then-file
Mine candidates (plans/docs, `bin/drift.mjs`, missing CI, spec follow-ups) → write proposed issues to
`$ORCHESTRATE_STATE/proposed-issues/<repo>.md` → dedup vs `gh issue list` → present and WAIT for confirmation →
on confirm `gh issue create --label agent-authored`. Never auto-file. Then pull existing open issues and assign
each to exactly one repo.

## fanout    (references/fanout.md)
Emit `$ORCHESTRATE_STATE/manifests/<repo>.md` per repo with assigned issues + the kickoff prompt (open a session,
use the `worker` skill, work issue #n). The human launches the sessions.

## gate
`bin/gate.sh` — global integration gate. Lightweight (default): drift check (repos with a `contractPin`) + each
repo's conformance. `--full`: + per-repo gauntlet via the `worker` skill (needs the services the repos declare).
Run before/after elevated-tier merges; a drift or conformance failure blocks and is escalated. Real runs (not
`--dry`) are logged under `$ORCHESTRATE_STATE/logs/`.

## status
`bin/status.mjs` — aggregate open PRs / checks / issues / merges across the repos in `repos.json` → print the
table, write `$ORCHESTRATE_STATE/status.json`, and append a timestamped snapshot under `$ORCHESTRATE_STATE/logs/`.

## loop
`run.sh <repo-key> [--host] [--max N] [--effort LEVEL] [--go]` — the autonomous plan→bundle→redteam→merge
cycle: plan the backlog into bundles, spawn a `worker` per bundle (TDD → self-redteam → PR → gauntlet), run the
adversarial redteam gate, then serial-merge eligible PRs. Merge mode is selected by `merge.mode` in `repos.json`
(`"queue"` or `"self"`), not by a flag. Without `--go` the command is a dry run (prints the plan + status table;
no spawns, no merges). Honors the PAUSE kill-switch.

## add-repo   (bin/add-repo.mjs)
Onboard a GitHub repo: `node bin/add-repo.mjs <owner/repo> --path <local-clone-dir>` auto-detects the toolchain
(npm/pnpm/yarn/cargo/go/python) and infers build/test/lint. Set `REPOS_JSON` to the manifest you want to grow.

## spawn   (bin/spawn.sh)
Launch headless workers, one per issue: `bin/spawn.sh <repo-key> [--issues "N N"] [--host] [--go]
[--allow-broad-token]`. DRY-RUN by default; add `--go` to launch. **HOST mode is the supported default** — each
worker runs on the host in a git worktree with `--dangerously-skip-permissions`. Honors the PAUSE kill-switch.

**Container mode is not yet supported on the canonical `repos.json` schema.** Omitting `--host` (or passing
`--container`) will fail loudly with a clear error; use `--host` for all current runs.

**Token requirements (host mode):** requires `gh auth` so the worker can clone and push PRs. For additional
isolation you can set `GH_WORKER_TOKEN` to a fine-grained PAT limited to the target repo (contents + PR write);
`--allow-broad-token` uses your full `gh auth token` instead (not recommended).

## Rules
- Drift gate: a repo that configures a `contractPin` must match it; a mismatch is reported + escalated, never
  auto-fixed here. Repos without a pin are not drift-checked.
- A change to a shared/contract dependency is NOT a consumer-repo issue — escalate it; it flows through the
  owning repo behind the global gate.
- Honor `$ORCHESTRATE_STATE/PAUSE`: while present, do not fan out new work.
- Never hand-merge into a repo's default branch.
