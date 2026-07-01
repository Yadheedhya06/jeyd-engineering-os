# Autonomous merge policy

Merge the PR automatically ONLY when ALL hold:
1. gauntlet.sh exits 0 (green).
2. redteam gate = pass.
3. /code-review reports zero high/critical (max effort on elevated tier).
4. intent-check passes.
5. The repo's required CI checks are PRESENT and green on the PR (`gh pr checks`). If the repo is expected to have CI but ZERO required checks are reported, that is a FAIL -> escalate (never treat "no checks reported" as "all green"). A repo with no CI yet: the first issue is "add CI".
6. The kill switch is OFF: the PAUSE file (`${ORCH_STATE_DIR:-$HOME/.orchestrate}/PAUSE`) must not exist.

Mechanics: `gh pr merge <n> --squash --delete-branch` (only after 1-6). Log the merge + all gate results under `${ORCH_STATE_DIR:-$HOME/.orchestrate}/logs/`. Never commit to the default branch directly; never force-merge; never override a red check.

Merge mode comes from config `merge.mode`: `queue` = serial through the orchestrator's merge queue (width `merge.max`); `self` = the worker merges its own PR directly.

Escalate (open PR, request human, STOP) when: any gate red and unresolved · a contract-surface change in a repo that declares a `contractPin` (drift gate — pinned consumers may not change the contract) · required CI expected but absent · a standing high-severity redteam challenge.
