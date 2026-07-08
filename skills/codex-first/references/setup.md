# Codex-First — setup & replication guide

The complete recipe for the two-model division of labor this skill runs on: **Claude drives,
Codex types**. Read this once, copy the config blocks, and you have the same setup.

## The idea in one paragraph

Two frontier models, two billing models, two strengths. Claude (in Claude Code) is the
**driver**: it holds the session context, talks to you, designs, writes the spec, reviews the
diff, runs the gates, and owns every git push/merge. Codex CLI is the **implementer**: it
receives a frozen, self-contained spec, writes the code, runs the tests, and reports back.
Claude tokens are metered and expensive — spend them on judgment. Codex is flat-rate under a
ChatGPT Plus subscription — spend it on keystrokes. Every Codex diff is reviewed by Claude
like a contributor PR before it ships; nothing merges unreviewed.

## The models (exactly what runs where)

| Role | Model | Harness | Billing | Why this model here |
|------|-------|---------|---------|---------------------|
| **Driver** — design, spec, review, verify, orchestrate, all git/GitHub mutations | **Claude Fable 5** (`claude-fable-5`) — Anthropic's Mythos-class tier, above Opus. Opus 4.8 / Sonnet 5 also work as drivers; Fable is the ceiling. | Claude Code (CLI / desktop / IDE) | Metered API / Max-plan tokens | Best-in-class judgment, long-horizon agentic reasoning, session tools (MCP, subagents, workflows, skills), and it's the thing you're already talking to. |
| **Implementer** — writes the code from the frozen spec, runs tests, reports proof | **GPT-5.5** with `model_reasoning_effort = "xhigh"` | Codex CLI (`@openai/codex`, tested on `codex-cli 0.143.0`) | **Flat-rate** under ChatGPT Plus | GPT-5.5 at xhigh is usually the faster/better raw code-writer, and the marginal cost of its tokens is zero — perfect for generation-heavy, exploration-heavy work. |

The skill assumes a **GPT-5.5-or-better / high-effort floor** on the Codex side. If your
`config.toml` points at something weaker, the review burden on Claude goes up and the
economics stop working — fix the config, don't compensate in the prompt.

## Prerequisites

- **Claude Code** installed and signed in (any plan; the driver model is whatever your session runs — Fable 5 here).
- **ChatGPT Plus** (or better) subscription — this is what makes Codex flat-rate.
- **Node.js** ≥ 18 (for the npm install).

## Step 1 — install Codex CLI

```bash
npm i -g @openai/codex
codex login          # authenticates against your ChatGPT subscription
codex --version      # this guide was written against codex-cli 0.143.0
```

## Step 2 — configure `~/.codex/config.toml`

```toml
model = "gpt-5.5"
model_reasoning_effort = "xhigh"
```

That's the whole required config. Two rules:

- **Never override the model downward** per-invocation with `-c` — the skill's routing
  assumes the floor above.
- Codex will add `[projects."<path>"] trust_level = "trusted"` entries as you approve repos;
  that's normal and per-machine.

## Step 3 — wire it into Claude Code

Two pieces: the **skill** and the **standing instruction** that makes Claude reach for it.

**The skill** — install this repo's plugin (`/plugin marketplace add
Yadheedhya06/jeyd-engineering-os` → `/plugin install engineering-os@jeyd-engineering-os`), or
symlink via `./install.sh`. Either way `codex-first` lands in Claude's skill list.

**The standing instruction** — add this to your global `~/.claude/CLAUDE.md` so every session
in every repo routes work the same way (adapt the division-of-labor bullets to taste; this is
the block I run):

```markdown
## Codex-first delegation

I have a ChatGPT Plus subscription with Codex CLI installed (`codex`, via
`npm i -g @openai/codex`). For any hands-on coding task, invoke the `codex-first` skill
BEFORE writing code yourself: Claude designs/specs/reviews/verifies; Codex implements via
`codex exec --dangerously-bypass-approvals-and-sandbox`. Keep tiny edits (<20 lines), design
work, and anything needing session tools in Claude. Always review Codex's diff — never ship
it unreviewed.

Division of labor (all repos):
- **GitHub issues**: "implement issue #N" → Claude reads issue + specs → Codex implements →
  Claude reviews diff, runs tests, opens PR. Multiple independent issues: parallel worktrees
  + parallel `codex exec` runs.
- **Merges**: Claude only, and only with explicit user go-ahead ("merge it" / a standing
  "merge when green" for the session). Codex NEVER performs git pushes, merges, or GitHub
  mutations.
- **Bug diagnosis** (logical bugs): Claude's job — systematic debugging; delegate bulk
  exploration/repro-test writing to Codex mid-investigation. Once root-caused, Codex
  implements the fix from Claude's spec.
- **Code review / security review**: Claude only, never delegated. `codex review` may be
  used as an advisory second opinion, never as the gate.
```

The CLAUDE.md block is what makes this a *default*, not a thing you remember to ask for. The
skill body is the *how*; the CLAUDE.md block is the *when*.

## Step 4 — how a delegation actually runs

Claude does this for you once the skill fires, but knowing the shape helps you debug:

```bash
# 1. Claude freezes a spec into a temp file (never inline shell quoting — heredocs break on
#    backticks/quotes inside real specs)
P=$(mktemp); cat >"$P" <<'EOF'
Goal: <one sentence>
Repo: /abs/path/to/repo   Key paths: src/foo/, tests/foo/
Constraints: don't touch X; keep public API of Y stable
Non-goals: no refactor of Z
Proof expected: `pnpm test --filter foo` green — paste the output
Output: list files changed + the test output
EOF

# 2. Fire Codex, full autonomy inside the repo, result to a file
command codex exec --dangerously-bypass-approvals-and-sandbox -C /abs/path/to/repo \
  -o /tmp/codex-last.md - <"$P" 2>/dev/null

# 3. Claude reads /tmp/codex-last.md, then reviews the REAL diff:
#    git status -sb && git diff        ← judged like a contributor PR

# 4. Fixes go through resume (keeps Codex's context; no -C flag, so cd first):
(cd /abs/path/to/repo && command codex exec resume --last \
  --dangerously-bypass-approvals-and-sandbox -o /tmp/codex-last.md - <"$P2" 2>/dev/null)
```

Key mechanics (each earned by a failure):

- **Prompt via temp file** — inline quoting mangles real specs.
- **`command codex`** — bypasses shell aliases/wrappers.
- **`2>/dev/null`** — Codex's thinking stream is noise that bloats Claude's context; only
  un-suppress to debug a failing run.
- **Read the `-o` file** for the result; never parse the JSONL event stream.
- **Long runs** — background the Bash call; don't kill a quiet run under 30 minutes.
- **Parallel is fine** when tasks are independent: separate repos/worktrees, separate `-o` files.
- **Not a git repo?** add `--skip-git-repo-check`.

## The prompt contract (why specs decide everything)

Codex starts with **zero** session context — it never saw your conversation. Every prompt
must be self-contained: goal, exact repo + paths, constraints ("don't touch X"), non-goals,
the exact proof command expected, and the output shape. A vague spec doesn't fail loudly; it
produces plausible wrong code that costs a review round. Spec quality is the whole game.

## The verify loop (non-negotiable)

1. `git status -sb` + read the **full diff** — Claude judges it like an external PR.
2. Run the focused tests yourself, or demand pasted proof output. Codex's "tests pass" is
   advisory, never load-bearing.
3. Iterate via `exec resume` (cheaper than fresh runs, keeps Codex's context).
4. **Two failed rounds → Claude takes over** and implements directly. Don't ping-pong.
5. Normal closeout still applies: `code-review`, `redteam`, `verify` — the gauntlet doesn't
   care who typed the code.

## Economics — when it wins and when it doesn't

The win is moving **generation and bulk-exploration tokens** (the expensive, voluminous part)
to the flat-rate model, while Claude spends metered tokens only on spec + diff review — the
short, high-leverage parts.

It loses when: the edit is tiny (<20 lines — delegation overhead eats the gain), the task IS
the design (writing the spec forces every decision anyway), the task needs session tools
(MCP, secrets, artifacts), or it's a git/GitHub mutation (Claude-only by policy). Route those
straight to Claude.

Heuristic: **if the prompt reads like a work order, delegate; if writing it forces decisions,
it's design — keep it.**

## Where it slots into the engineering OS

`codex-first` is a **Phase-2 (Implement) strategy**, orthogonal to the pipeline: the
`orchestrate` → `worker` → `redteam` loop defines *what* gets built and *what gates it must
survive*; codex-first only changes *which model types the implementation*. Design gates,
TDD discipline, fail-closed gauntlet, adversarial merge review — all unchanged.
