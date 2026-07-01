# issues mode — author (preview-then-file) + sync

Mine candidates from: each repo's open follow-ups in its plans/docs; the drift check (`bin/drift.mjs` — a
mismatch becomes a "re-pin to the configured contract version" issue, only for repos that set a `contractPin`);
the spec's open follow-ups; failing/missing CI (a repo with no CI → an "add CI" issue, which is the FIRST issue
for that repo).

Preview-then-file (REQUIRED — never auto-file):
1. Write proposed issues to `$ORCHESTRATE_STATE/proposed-issues/<repo>.md`, one block per issue: title, body
   (intent + acceptance criteria), labels, target repo, priority.
2. Dedup: for each, run `gh issue list -R <owner/repo> --search "<title>" --state open` — skip if it exists.
3. Present the proposed list to the user and WAIT for explicit confirmation.
4. On confirm: `gh issue create -R <owner/repo> --title ... --body ... --label agent-authored[,priority]`.
5. Pull existing open issues (`gh issue list`) and fold them into the assignment set.

Assignment: each issue is tagged with exactly one target repo (the repo whose files it changes). A change to a
shared/contract dependency is NOT a consumer-repo issue — it is escalated (drift gate).

For repos without a `contractPin`, issue mining skips the contract/drift sources — candidates come from existing
open GitHub issues and the repo's own docs/TODOs.
