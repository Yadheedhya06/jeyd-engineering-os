# fanout mode — emit a per-repo kickoff manifest

For each repo with assigned issues, write `$ORCHESTRATE_STATE/manifests/<repo>.md`:
- the repo name + url + contract pin (from `repos.json` `contractPin`, if any)
- the assigned issue numbers + titles
- the mission ref (your hub repo's mission doc; see `examples/demo`)
- the kickoff prompt: "Open a session in a clone of <repo>. Use the `worker` skill. Work issue #<n>. Honor the
  gauntlet + autonomous-merge policy. Stop at the PAUSE kill switch."
- the gauntlet command (`worker/bin/gauntlet.sh <repo>`) and the merge policy reference.
The human launches each manifest as a session. orchestrate does not dispatch.
