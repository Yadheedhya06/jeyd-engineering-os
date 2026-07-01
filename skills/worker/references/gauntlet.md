# The gauntlet (run via bin/gauntlet.sh; all gates must be green)

Order, per repo: exactly the gate names listed in `gates[]` for that repo (e.g. install -> fmt -> lint -> typecheck -> build -> test -> conformance), each running its `commands[<gate>]` shell string. A gate listed with no command is a FAIL (fail-closed).

Services: if the repo's `services[]` includes `postgres`, the gauntlet spins up an ephemeral Postgres (docker `postgres:15`) first, exports `DATABASE_URL` (plus any names in `DB_ENV_VARS`), and — when `MIGRATIONS_DIR` is set — applies `NNNN_*.sql` migrations in order. If docker is missing, the gauntlet FAILS CLOSED — never skip a required service. Repos with no `services[]` skip service setup entirely.

Then, beyond gauntlet.sh:
- redteam: run the `redteam` skill on the design + diff. Gate must be `pass` (every decision cleared).
- /code-review: standard tier = default effort; elevated tier = max effort. Zero high/critical findings.
- intent-check: run `redteam` in intent mode — does the diff satisfy the issue's acceptance criteria + the mission success criteria? Any unmet criterion = fail.

Tier (from bin/surface-tier.mjs, driven by each repo's `surfaceTiers.elevated` globs): elevated changes require redteam UNANIMOUS clear + /code-review max effort + the change is flagged for the orchestrator's global integration gate.
