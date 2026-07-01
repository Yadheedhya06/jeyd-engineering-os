# examples/demo — a worked reference config

A fictional 3-repo project showing how one `repos.json` drives both skills. Nothing here is real — copy it and
replace the entries with your own repos.

## The repos
- **api** (Node / npm) — needs Postgres; pins a shared contract dependency.
- **engine** (Rust / cargo) — no DB service.
- **web** (Node / pnpm) — needs Postgres.

## How the skills read this one file
- **orchestrate** aggregates PR/issue/merge status across these repos (owner derived from `url`), checks each
  repo's pinned dependency against its `contractPin.version` (a `contractPin: null` repo is skipped cleanly),
  and runs the integration gate.
- **worker** runs each repo's `gates` via its `commands`, provisioning ephemeral Postgres only for repos that
  declare `"services": ["postgres"]`, and classifies a change as *elevated* when it touches a
  `surfaceTiers.elevated` glob.

Both skills read the same file, located via the **`REPOS_JSON`** env var (or an explicit path arg):

```bash
export REPOS_JSON="$PWD/examples/demo/repos.json"
node skills/orchestrate/bin/status.mjs
node skills/orchestrate/bin/drift.mjs
```
