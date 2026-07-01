---
name: redteam
description: Use when a decision, design, diff, or PR needs adversarial third-person scrutiny before it is accepted or merged. Spawns independent opponents that argue the opposite and demand evidence, then returns a deterministic per-decision verdict (cleared / revise / blocked) and an overall gate. Use inside the worker gauntlet, before any autonomous merge, or any time a choice should be stress-tested.
---

# Red Team — Adversarial Decision Auditor

**Announce:** "Using the redteam skill to adversarially audit <target>."

Question every material decision in opposition, in the THIRD PERSON, and force an
evidence-backed defense or a revision. Default stance: a decision is NOT justified until
its defense survives opposition.

## When to use
- Inside the `worker` gauntlet (self-redteam after implementation; intent-check before merge).
- Before any autonomous merge on a real-money surface.
- Any time you want to stress-test a design, diff, or PR.

## Inputs
- **Target:** a decision list, design doc, diff, or PR number.
- **Intent:** the issue's acceptance criteria + the mission spec's success criteria + constraints.

## Procedure (follow exactly)

1. **Frame.** State the target and the intent in 2-3 lines. If the intent is missing, get it
   before proceeding — you cannot judge a decision without knowing what it is for.

2. **Extract decisions.** Enumerate the material decisions (see `references/severity-rubric.md`,
   "What counts as a material decision"). For each record: `id`, a one-line `summary`, the
   `surface` it touches (standard vs elevated, per the rubric), and a `severity` estimate.

3. **Oppose.** For each decision, dispatch independent opponent subagents using
   `references/opponent-prompt.md` verbatim (fill the {{slots}}):
   - standard surface: 3 opponents
   - elevated surface: 5 opponents
   Dispatch them concurrently — one message, multiple Agent calls.

4. **Defend / revise.** Collect each opponent's JSON verdict. For every refutation, answer with
   concrete evidence (code, tests, spec citation). An unanswered or hand-waved refutation STANDS
   (it counts as `refuted: true`). Do not perform agreement; cf. superpowers:receiving-code-review.

5. **Aggregate (deterministic).** Write the opponent results as JSON in the
   `references/verdict-format.md` input schema, then run:
   `node bin/aggregate.mjs <opponents.json>`
   It applies the majority/unanimous + severity-floor rules and prints the per-decision verdict
   and the overall gate. Do not compute the verdict by hand.

6. **Report.** Emit the human-facing report (`references/verdict-format.md`): per decision —
   challenged alternative, the agent's defense, verdict, severity, required action — then the
   final `GATE: pass|fail` line.

## Rules
- Elevated-surface decisions require a UNANIMOUS clear; any standing refutation fails them.
- The gate passes only if EVERY decision is `cleared`. Both `revise` and `blocked` fail the gate.
- Never soften a verdict to be agreeable. The opponents' job is to be right, not kind.
- If `aggregate.mjs` exits non-zero or prints an error instead of a verdict, treat the gate as FAILED (fail closed). Never read a missing verdict as a pass.
