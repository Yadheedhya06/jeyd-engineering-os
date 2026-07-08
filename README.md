# jeyd-engineering-os

> A public, personal **operating system for engineering** — how I think about the development cycle,
> expressed through the AI skills I actually use.

This is not a dump of files. It is a **manifesto with working code**. Read it to understand the philosophy —
fail-closed, adversarial, test-first, evidence-before-claims, config-over-fork — then **install and run** the
parts that are mine.

The skills are the artifact. The repo is the statement.

- ★ **authored** (full MIT source, here): [`orchestrate`](skills/orchestrate), [`worker`](skills/worker), [`redteam`](skills/redteam), [`codex-first`](skills/codex-first)
- ☆ **marketplace** (referenced + annotated): [`SKILLS-I-USE.md`](SKILLS-I-USE.md)
- ⚡ **[Power-User Playbook](#power-user-playbook--running-the-dev-cycle-at-max)** — run the whole cycle at MAX
- 🎛 **[CLI UX](cli-ux)** — the cockpit: my statusline + the terminal settings I actually run

## Install

Native (recommended):

```bash
/plugin marketplace add Yadheedhya06/jeyd-engineering-os
/plugin install engineering-os@jeyd-engineering-os
```

Symlink fallback:

```bash
git clone https://github.com/Yadheedhya06/jeyd-engineering-os
cd jeyd-engineering-os && ./install.sh
```

## The engineering lifecycle

Every skill maps to a phase. ★ = authored here, ☆ = marketplace (see [`SKILLS-I-USE.md`](SKILLS-I-USE.md)).

### 1. Ideate & design
- ☆ `superpowers:brainstorming` — explore intent + requirements before any code (the design/approval gate).
- ☆ `superpowers:writing-plans` — turn the approved design into a step-by-step plan.

### 2. Implement
- ★ `codex-first` — the two-model split: Claude (Fable 5) designs/specs/reviews, Codex CLI (GPT-5.5 @ xhigh) writes the code. See the [playbook section](#3-codex-first--the-two-model-division-of-labor) and the [full setup guide](skills/codex-first/references/setup.md).
- ☆ `superpowers:test-driven-development` — red → green → refactor, always.
- ☆ `superpowers:subagent-driven-development` — execute independent plan tasks as parallel subagents.

### 3. Verify
- ☆ `verify` — run the real app/behavior, not just the unit tests.
- ☆ `superpowers:verification-before-completion` — evidence before any "done" claim.

### 4. Review & harden
- ☆ `code-review` — correctness + cleanup pass on the diff.
- ★ `redteam` — adversarial third-person audit of every material decision → `cleared / revise / blocked`.
- ☆ `superpowers:requesting-code-review` / `superpowers:receiving-code-review` — the etiquette on both sides.

### 5. Orchestrate & ship
- ★ `orchestrate` — the one-command autonomous dev-team loop: plan → build → redteam → serial-merge, until the backlog drains.
- ★ `worker` — the per-item loop: TDD → self-redteam → PR → fail-closed gauntlet → adversarial merge.
- ☆ `ralph-loop` — grind a single hard task to completion.

### 6. Debug
- ☆ `superpowers:systematic-debugging` — reproduce → isolate → fix → prove, no guess-patching.

### 7. Language tooling
- ☆ `rust-analyzer-lsp` — real LSP for the Rust repos.

## CLI UX — the cockpit

Skills are the engine; [`cli-ux/`](cli-ux) is the instrument panel. A self-contained two-row
statusline (model · dir · branch · dirty counts, then a color-thresholded context-window bar +
live cost + session clock) and the `settings.json` keys behind the setup: 1M context, `xhigh`
effort, fullscreen TUI, daltonized theme. One bash script + jq, no plugins.

## Principles

1. **Fail-closed gates.** A missing or ambiguous gate result is a FAIL, never a pass. Nothing is green-by-default.
2. **Adversarial verification before merge.** Every material decision must survive `redteam` opponents before it ships.
3. **Test-first.** No implementation without a failing test that describes the intent.
4. **Evidence before claims.** "Done" / "passing" / "fixed" requires the command output that proves it.
5. **Config-over-fork.** The engine is generic; per-project specifics live in `repos.json` — never hardcoded in engine code. Each project is just one consumer ([`examples/demo`](examples/demo)).

## Power-User Playbook — running the dev cycle at MAX

The punchline: everything above, chained into one autonomous flow you can trust to run unattended.

### 1. The golden path (chain the skills, end-to-end)

Run the cycle deliberately, one trigger per stage:

| # | Stage | Trigger | Output / gate |
|---|-------|---------|---------------|
| 1 | Design | `superpowers:brainstorming` | agreed design + **approval gate** |
| 2 | Plan | `superpowers:writing-plans` | `docs/plans/<feature>.md` |
| 3 | Build | ★ `codex-first` + `superpowers:test-driven-development` | Codex types from the frozen spec; red → green → refactor |
| 4 | Verify | `verify` + `superpowers:verification-before-completion` | observed behavior + evidence |
| 5 | Review | `code-review` + ★ `redteam` | zero high/critical + **GATE: pass** |
| 6 | Ship | ★ `orchestrate` autonomous merge | squash-merged behind the gauntlet |

Steps 1–5 are how you build one change by hand. Step 6 is how you stop doing it by hand.

### 2. The one-command autonomous dev-team loop (the headline move)

Point `orchestrate` at a `repos.json` and walk away. It scans open issues + open PRs, **plans** PR-sized
bundles, spawns one `worker` per bundle (each does TDD → self-redteam → PR → gauntlet), runs **one redteam
session** over the ready PRs to label them `redteam-clear` / `redteam-blocked`, then **serial-merges** every
eligible PR in priority order — and loops until the backlog is drained.

```bash
# env-only secrets — NEVER commit these
export GH_WORKER_TOKEN="<repo-scoped fine-grained PAT: contents + PR write>"
export CONTRACTS_TOKEN="<read token for a pinned cross-repo dep>"   # only if you set contractPin

# point the engine at YOUR config (examples/demo is a worked reference)
export REPOS_JSON="$PWD/examples/demo/repos.json"

# LIVE run: 4 workers in parallel, hardest effort
skills/orchestrate/bin/run.sh <repo-key> --go --max 4 --effort xhigh
```

`<repo-key>` is the `name` of an entry in your `repos.json`.

**Flags:**
- `--go` — actually run the loop. **Without it you get a single dry-run pass** (the plan + status table, no spawns, no merges). Always dry-run first.
- `--max N` — concurrency cap: at most N agents alive at once (default `4`).
- `--effort <level>` — reasoning effort per agent: `high` (default — bounded, sharp, drop-resistant) or `xhigh` for the hardest bundles.
- `--host` — run agents on the host in git worktrees (the mode for non-JS or contract-pinned repos).

**Merge modes**: The autonomous loop (`run.sh`) is queue-only today — it always spawns a single serial merger
coordinator. `merge.mode` in `repos.json` is the configuration intent for the `spawn.sh` / `worker` path (host
mode with `--self-merge`); `run.sh` does not read `merge.mode`. For the loop, use `--max` to control concurrency:

```json
{ "merge": { "mode": "queue", "max": 4 } }
```

A PR is **ELIGIBLE to merge** iff: label `redteam-clear` (and **not** `redteam-blocked`) **AND** CI green
(≥1 success, zero non-success) **AND** base ≠ the repo's default branch **AND** GitHub reports it MERGEABLE.
Anything else is skipped, not forced.

### 3. Codex-first — the two-model division of labor

The cost hack that funds everything else: **Claude drives, Codex types.** Claude Code (running
**Claude Fable 5**, `claude-fable-5` — the metered, judgment-heavy model) does design, spec-writing,
diff review, verification, and every git/GitHub mutation. **Codex CLI** (`npm i -g @openai/codex`,
running **GPT-5.5 at `xhigh` reasoning effort**, flat-rate under a ChatGPT Plus subscription) does the
actual code generation. Metered tokens buy judgment; flat-rate tokens buy keystrokes.

The flow per task:

1. **Claude freezes a spec** — goal, repo + exact paths, constraints, non-goals, the proof command expected. Codex has zero session context; the spec is everything.
2. **Codex implements**: `codex exec --dangerously-bypass-approvals-and-sandbox -C <repo> -o /tmp/codex-last.md - < spec` — full autonomy inside the repo, result read from the `-o` file.
3. **Claude reviews the real diff** like a contributor PR, runs the tests itself, iterates via `codex exec resume --last`. Two failed rounds → Claude takes over and writes it directly.
4. **Merges/pushes are Claude-only, ever.** Codex never touches git remotes or GitHub.

What stays in Claude regardless: design/architecture, tiny edits (<20 lines), anything needing
session tools (MCP, secrets), all code/security review, all merges. Routing heuristic: *a prompt
that reads like a work order → delegate; a prompt whose writing forces decisions → design, keep it.*

Setup to replicate (models, `~/.codex/config.toml`, the global `CLAUDE.md` wiring block):
[`skills/codex-first/references/setup.md`](skills/codex-first/references/setup.md). The skill itself:
[`skills/codex-first`](skills/codex-first).

This composes with the loop below: `codex-first` only changes *who types* in the Implement phase —
the gauntlet, redteam gate, and merge rules are unchanged and don't care who wrote the code.

### 4. Parallelism / ultracode — when to fan out

- **Independent bundles → parallel.** The loop's `--max N` runs N workers at once. Raise it when bundles are truly independent (different files/modules); keep it low when they fight over shared files.
- **Independent plan tasks → subagents.** Use `superpowers:dispatching-parallel-agents` / `subagent-driven-development` to fan out plan steps that share no state. Workflow orchestration drives the loop's coordinators (planner, interrogate, merger) the same way.
- **Hard single change → ultracode.** Bump `--effort xhigh` for the gnarliest bundle; the planner / redteam / merger coordinators already run at ultracode.
- **Rule of thumb:** parallel beats serial only when the work is *independent and the merge is queued*. Shared-file work, or anything touching a real-money / safety surface → serialize it (`--max 1` or `merge.mode: "queue"`): correctness over throughput.

### 5. Guardrails make autonomy safe (why you can leave it running)

Nothing merges green-by-default. Before **every** merge, two fail-closed gates run:

- **The gauntlet** (`worker`): build + test + (optional) services like ephemeral Postgres + lint + `code-review` + conformance/drift — pluggable per repo via `gates` / `services` in `repos.json`. A missing or ambiguous result is a **FAIL**.
- **The redteam gate** (`redteam`): independent opponents attack every material decision; the PR earns `redteam-clear` only on **GATE: pass** (`revise` and `blocked` both fail). Elevated-surface decisions require a **unanimous** clear.

Kill switch: `touch "$WORK_DIR/.orchestrate/PAUSE"` (default: a sibling `.orchestrate/` beside your hub
checkout) — the loop kills running agents and stops fanning out new work. Fail-closed gauntlet + adversarial
gate + a kill switch is exactly what lets you walk away.

### 6. Long-running / iterate-until-done

- ☆ `ralph-loop` — grind one stubborn task (a flaky fix, a big refactor) to completion across many turns without re-prompting.
- `/loop <interval> <command>` — run a command/skill on a recurring interval (e.g. `/loop 5m /babysit-prs`).
- `/schedule` — cron'd cloud runs (e.g. drain the backlog every night, then push a summary).

### 7. Setup-for-MAX checklist

- [ ] **Install** the authored skills: `/plugin marketplace add Yadheedhya06/jeyd-engineering-os` → `/plugin install`, or `./install.sh`.
- [ ] **Install** the marketplace skills from [`SKILLS-I-USE.md`](SKILLS-I-USE.md).
- [ ] **Wire codex-first** (optional but the cost unlock): ChatGPT Plus + `npm i -g @openai/codex` + `codex login`, set `~/.codex/config.toml` to `gpt-5.5` / `xhigh`, and paste the delegation block into your global `~/.claude/CLAUDE.md` — full walkthrough in [`skills/codex-first/references/setup.md`](skills/codex-first/references/setup.md).
- [ ] **Write `repos.json`** — copy [`examples/demo/repos.json`](examples/demo/repos.json), set `name` / `url` / `defaultBranch`, your `gates` / `services`, `surfaceTiers.elevated` globs, `contractPin` (or `null`), and the `merge` block.
- [ ] **Export env-only tokens:** `GH_WORKER_TOKEN` (repo-scoped) and `CONTRACTS_TOKEN` if you pin a cross-repo dep. Never put values in the repo.
- [ ] **Set `REPOS_JSON`** to the path of your `repos.json` (e.g. `export REPOS_JSON="$PWD/examples/demo/repos.json"`).
- [ ] **Enable CI** (`.github/workflows/ci.yml`) so the gauntlet's CI-green check has something to read.
- [ ] **Dry-run once** (`skills/orchestrate/bin/run.sh <repo-key>` — no `--go`), read the plan + status table, then add `--go`.
- [ ] **Pick effort:** `high` for most loops; `xhigh` when you need it.

### 8. Anti-patterns (what kills the gains)

| Anti-pattern | Why it hurts | The fix |
|--------------|--------------|---------|
| Skipping the brainstorming/design gate | Workers build the wrong thing, fast | Always run `superpowers:brainstorming` first — it's the cheapest gate. |
| Fail-**open** gates ("treat missing as pass") | A silent gauntlet/redteam failure ships a bug | Fail-closed: missing/ambiguous = FAIL. Never special-case to green. |
| Claiming "done" without `verify` | Passing tests, broken app | Run `verify` / `verification-before-completion`; paste the evidence. |
| Vendoring a marketplace skill instead of configuring | Stale copy, license drift, lost updates | Reference it ([`SKILLS-I-USE.md`](SKILLS-I-USE.md)); configure the engine via `repos.json`. |
| `--max` too high on shared-file bundles | Merge conflicts + races | Lower `--max` or use `merge.mode: "queue"`; parallel only when independent. |
| Running `--go` blind | Surprises in a live repo | Dry-run first (no `--go`), read the status table, then go live. |
| Shipping a Codex diff unreviewed | Flat-rate code, metered consequences | Claude reads the full diff like a contributor PR + runs the tests itself — Codex claims are advisory. |
| Delegating design or tiny edits to Codex | Spec-writing IS the decision-making; <20-line edits lose to delegation overhead | Route by the heuristic: work order → Codex; forces decisions → Claude. |
