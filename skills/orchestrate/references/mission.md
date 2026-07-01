# mission mode — build the canonical cross-repo intent

Output: your hub repo's `docs/mission/mission.md` (durable, versioned; path configurable — see `examples/demo`).
Sources: the system-design + hazards spec, each repo's plans/docs and any consuming-contract notes, and the
success criteria.
Content: the end-to-end pipeline intent, per-repo responsibility + success criteria, the invariants, and what
"done/correct" means for each repo. Every worker ingests this; every intent-check measures against it.
Refresh (not overwrite-blind): diff against the prior mission.md and note what changed.
