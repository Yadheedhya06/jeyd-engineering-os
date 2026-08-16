# My AI agency runtime

> How I researched and built a small, persistent engineering agency around Hermes, Codex,
> conventional infrastructure, and fail-closed deployment gates.

I do not think of an AI coding agent as an employee living in a terminal. The model is only
the reasoning engine. The useful system is the **harness around the model**: task state,
workspaces, permissions, retries, tests, review, logs, deployment, rollback, and the rules for
when a human must decide.

That distinction changed how I built my own setup. I wanted one server that could host my
projects and continuously help maintain them, without turning a chat agent into an
unrestricted production administrator. I researched current agent-harness work, long-running
coding patterns, practitioner setups, and ordinary production operations, then built the
smallest version I could actually audit.

This document describes the runtime I use. It is separate from the local development loop in
[`codex-first`](../skills/codex-first): that workflow describes how I split design and
implementation between models; this one describes the server that accepts work, runs Codex in
isolation, watches applications, and controls deployment.

## The conclusion I reached

The strongest setup is not one all-powerful agent with root access. It is a set of narrow
authorities with evidence passed between them:

```text
me / Discord / GitHub
          |
        Hermes
  intake, memory, planning
          |
  durable task ledger
  leases, retries, state
          |
 disposable Codex worker
 one worktree, one bounded task
          |
 independent review + CI
          |
      human approval
          |
 narrow deployment broker
          |
 immutable deploy + health gate
          |
 production or automatic rollback

metrics + logs + traces
          |
 deterministic alert
          |
 bounded read-only AI diagnosis
          |
 incident report / normal code task
```

The power comes from the feedback loops and authority boundaries, not from giving the model
more permissions.

## What each part owns

| Part | Owns | Explicitly does not own |
|---|---|---|
| **Hermes** | Conversation, durable personal context, task intake, status, approval requests | Root, production secrets, raw Docker socket, deployment approval |
| **Task orchestrator** | Task state, leases, retries, reconciliation, artifact paths | Product judgment or permission to declare its own work correct |
| **Codex worker** | One repository-scoped implementation task and its evidence | Other projects, production credentials, Docker, merge or deploy authority |
| **Independent reviewer** | Read-only review of the candidate change | Editing the candidate it is judging |
| **Deterministic CI** | Tests, lint, types, security and project-specific gates | Interpreting an agent's confidence as proof |
| **Human approval** | The decision that a reviewed candidate may deploy | Hidden or implicit approval |
| **Deployment broker** | Allow-listed deploy, health verification, rollback and audit records | Arbitrary shell or arbitrary image tags |
| **Observability stack** | Metrics, logs, traces and deterministic detection | Streaming unlimited, untrusted logs into a model |

No model process receives the host Docker socket, root credentials, production secrets, or
permission to approve its own deployment.

## The task lifecycle I run

Chat history is context; it is not the source of truth. Every task lives in an SQLite ledger
with a state, attempt count, lease, timestamps, artifacts, review result, and deployment
evidence.

```text
ready
  -> coding
  -> AI review
  -> deterministic CI
  -> human review
  -> approved
  -> deployed
  -> verified

any unsafe deployment result -> rollback
any worker failure -> evidence + bounded retry or human intervention
```

For each coding task the orchestrator creates a dedicated Git worktree and a disposable
Codex container. The container has project-only mounts, CPU/RAM/PID limits, no Docker socket,
no production credentials, and restricted egress that blocks the host, private networks, and
cloud metadata endpoints. I currently keep concurrency at **one**. Reliability at one worker
is more valuable than multiplying a broken loop.

Codex returns structured, machine-readable evidence. A separate read-only Codex pass reviews
the diff, then CI runs without network access. A syntactically valid “I was blocked” response
cannot advance the task. The candidate stops at human review until I explicitly approve an
immutable image digest.

Deployment is deliberately boring: Docker Compose, an allow-listed project registry, exact
image digests, a deterministic localhost health endpoint, and automatic restoration of the
previous digest when verification fails. I chose this over Kubernetes because the machine is
small and the extra control-plane complexity would not improve the risk boundary.

## Monitoring before AI

I do not ask a model to tail every log line. Logs are noisy, expensive, and untrusted input;
they can contain user content, dependency output, or prompt injection.

My intended incident loop is:

1. Prometheus or an external uptime checker detects a deterministic condition.
2. The harness builds a bounded incident packet: recent metrics, deployment diff, health
   results, and a limited log window.
3. A read-only Codex task diagnoses that packet and cites its evidence.
4. Only predefined, reversible runbooks may execute automatically.
5. Code changes go through the normal review and deployment lifecycle.
6. The failure becomes a regression check or replayable evaluation.

The local stack is Prometheus, Grafana Alloy, Loki, Tempo, Grafana, node-exporter, and
cAdvisor. Grafana, Prometheus, Loki, and Tempo are bound to loopback; Traefik is the public
edge. Loki currently collects the Docker logs, while Prometheus covers host, container, log,
and trace services.

An important operating lesson came from the first live audit: cAdvisor was technically
“running” and Docker marked it healthy, but its memory/CPU limits were saturated and
Prometheus scrapes timed out. My original acceptance check only counted running containers,
so it returned a false green. That is exactly the kind of failure I want the harness to turn
into a stronger mechanical gate: **process up is not the same as telemetry working**.

## Schedules and maintenance

Recurring infrastructure work runs through systemd timers because I want persistence,
journald evidence, explicit service identities, and observable exit status. The current
schedule is:

| Cadence | Job |
|---|---|
| Every 5 minutes | Harness health acceptance check |
| Daily around 03:15 UTC | Encrypted Restic backup with retention |
| Monthly | Repository integrity check and real restore drill |
| Daily, randomized | Old Docker image pruning |
| System defaults | Security upgrades, log rotation and filesystem trimming |

I keep conversational reminders separate from server maintenance. Hermes does not need a
chat cron job to keep the infrastructure alive; systemd is the authority for that job.

## What is actually live

This is the state of my server as of **2026-08-16**, not a hypothetical architecture slide:

| Area | Live state |
|---|---|
| Host | Ubuntu 24.04, 2 vCPU, 8 GB RAM, 4 GB swap |
| Control plane | Hermes 0.20.1 behind authenticated Traefik |
| Coding worker | Codex CLI 0.147.0 in a pinned disposable worker image |
| Task state | SQLite ledger with leases, retries, events and artifacts |
| Review | Independent read-only AI review plus deterministic CI |
| Deployment | Human approval, immutable digests, health verification, rollback |
| Isolation | Separate networks, restricted egress, no model-visible Docker socket |
| Observability | Prometheus, Loki, Tempo, Alloy, Grafana, cAdvisor, node-exporter |
| Backups | Two encrypted local snapshots, verified restore path, daily timer |
| Acceptance proof | Full synthetic code -> review -> CI -> approval -> deploy task reached `verified` |

The operations source of truth is versioned separately from the applications:

```text
/opt/ai-harness        versioned programs, policies, Compose and runbooks
/etc/ai-harness        root-owned live configuration and secret references
/srv/projects          canonical repositories
/srv/apps              deployment definitions and persistent application state
/var/lib/ai-harness    task database, worktrees, artifacts and approvals
/var/log/ai-harness    audit and incident records
```

## What I have intentionally not called complete

The local foundation works, but I do not describe it as a fully autonomous production agency
yet. The remaining work is concrete:

- repair the saturated cAdvisor scrape and make target health part of acceptance;
- add Prometheus alert rules, Alertmanager, and notification routing;
- connect alerts to bounded, read-only AI incident diagnosis;
- provision useful host and per-project Grafana dashboards;
- add an external uptime checker that does not share the server's failure domain;
- replicate encrypted backups off-host;
- add off-box CI, image publishing, and automatic PR creation;
- separate staging and production more strongly;
- turn recorded failures into a replayable evaluation suite;
- replace long-lived credentials with narrower, rotated or broker-issued credentials.

I will add concurrency only after the single-worker path, monitoring, restore, and rollback
remain boring under real project load.

## Rules I took from the research

These are the ideas that survived both the research pass and implementation:

1. **State outside the chat.** A durable ledger beats conversational memory for operations.
2. **Fresh workspace per task.** Worktrees make ownership, cleanup, and evidence inspectable.
3. **Separate planning, implementation, review, and deployment.** Context independence is a
   feature when one component must judge another.
4. **Define done mechanically.** Outcome, constraints, exact proof commands, and expected
   evidence belong in every task contract.
5. **CI is the authority.** The agent's “done” is a hypothesis until deterministic gates pass.
6. **Least privilege per stage.** The coding identity should not also be the merging and
   production identity.
7. **Conventional monitoring first.** AI investigates bounded anomalies; it does not replace
   metrics, health checks, alert rules, or uptime probes.
8. **Automatic actions must be narrow and reversible.** Restarting an allow-listed service is
   different from granting arbitrary production shell.
9. **Every recurring failure upgrades the harness.** Instruction -> schema -> automated check
   -> mechanical enforcement.
10. **Scale reliability before worker count.** Serialized merges and one trusted loop beat a
    crowd of agents racing through the same failure mode.

## Research trail

I weighted primary engineering documentation above social-media excitement, then used
practitioner reports to look for repeated operational patterns.

### Primary and engineering sources

- [OpenAI: Scheduled tasks](https://learn.chatgpt.com/docs/automations) — recurring work,
  worktree isolation, run review, and testing the prompt before scheduling it.
- [OpenAI: Long-running work](https://learn.chatgpt.com/docs/long-running-work) — durable goals
  with explicit outcomes, constraints, and verification.
- [OpenAI: Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) —
  `codex exec` for scripts/CI, explicit sandboxing, JSONL events, schemas, and credential
  separation.
- [OpenAI: Symphony](https://github.com/openai/symphony) — isolated workspaces, issue-driven
  orchestration, reconciliation, retries, and bounded concurrency.
- [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
  — external progress state, incremental sessions, Git boundaries, and explicit verification.
- [Grafana Alloy documentation](https://grafana.com/docs/alloy/latest/) and
  [Loki documentation](https://grafana.com/docs/loki/latest/) — ordinary telemetry collection
  and log querying before model-driven investigation.

### Practitioner signals I treated as experience, not authority

- [Mitchell Hashimoto: My AI adoption journey](https://mitchellh.com/writing/my-ai-adoption-journey)
  — improve the harness when the same agent failure repeats.
- [The VV Harness](https://ovidiueftimie.substack.com/p/the-vv-harness) — promote recurring
  expectations from prose into deterministic validation.
- [Gas Town](https://yegge.ai/gastown) — durable work tracking and serialized integration;
  useful ideas even though I do not need its many-agent scale on one small server.
- [A practitioner report on AI production monitoring](https://www.reddit.com/r/ClaudeCode/comments/1q4g2q3/claude_code_now_monitors_my_production_servers/)
  — read-only investigation and incident summaries, with deterministic monitoring doing the
  filtering first.

The system will keep changing. The invariant is that every increase in autonomy must arrive
with a stronger proof boundary, a smaller permission surface, or a faster rollback path.
