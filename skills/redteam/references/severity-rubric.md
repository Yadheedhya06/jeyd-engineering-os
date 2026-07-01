# Severity rubric, surfaces, and aggregation

## What counts as a material decision
- A design/architecture choice (structure, boundary, interface shape).
- An algorithm or tradeoff pick (and the alternatives not taken).
- An error-handling / failure-mode choice (especially fail-open vs fail-closed).
- Something deliberately NOT done (a skipped check, a deferred edge case).
- A schema, SQL, migration, or wire-contract change.

NOT decisions: mechanical edits with one obvious form (a rename to match a type, formatting).

## Surfaces
Elevated (real-money blast radius — require a UNANIMOUS clear; dispatch 5 opponents):
- `migrations/`, `sql/`
- `fixtures/*.snapshot.json` and the conformance fixtures
- claim / gate / finalize / heartbeat / reclaim SQL
- `contract_version`
- fail-closed gate logic, exit logic, and `pg_notify` payloads in any repo

Standard (everything else — majority rule; dispatch 3 opponents).

## Severity levels
- critical: wrong => real-money loss, data corruption, or pipeline halt.
- high: wrong => incorrect signals or a silent drift no test catches.
- medium: wrong => a bug caught by tests or recoverable at runtime.
- low: style/clarity.

## Aggregation (authoritative implementation: bin/aggregate.mjs)
Let r = number of opponents with refuted=true, n = total opponents, majority = (r*2 > n).
- Elevated surface: r==0 -> cleared; else if severity==critical -> blocked; else -> revise.
- Standard surface: r==0 -> cleared; else if majority and severity in {critical,high} -> blocked;
  else if majority -> revise; else if severity in {critical,high} -> revise; else -> cleared.
The gate passes IFF every decision is `cleared`. Both `revise` and `blocked` fail the gate.
Effective severity = max(the audited agent's severity, the highest severity any opponent reports). Opponents can ESCALATE severity but never lower it (so a decision cannot be gamed by self-rating it low); the rule above runs on this effective severity.
Fail-closed input validation: the aggregator THROWS on an unknown surface/severity, a non-array `opponents`, or fewer than the required opponents (3 standard / 5 elevated). A thrown error means the gate is FAILED — never passed.
