# Skills I Use — the marketplace layer

These are the skills I did **not** write but rely on every cycle. They are **referenced, not vendored** — all
four ship from Anthropic's official marketplace under their own licenses (Apache-2.0). Attribution is satisfied
by linking to source; no code is copied here (see [`NOTICE`](NOTICE)).

Install them the native way:

```bash
/plugin marketplace add anthropics/claude-plugins-official
/plugin install superpowers@claude-plugins-official
/plugin install code-review@claude-plugins-official
/plugin install ralph-loop@claude-plugins-official
/plugin install rust-analyzer-lsp@claude-plugins-official
```

| Skill | Version | Source | Why I use it | Where in the cycle |
|-------|---------|--------|--------------|--------------------|
| **superpowers** | 6.0.3 | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | The meta-toolkit: brainstorming → writing-plans → TDD → verification-before-completion → code-review etiquette. It is the spine every authored skill leans on. | Phases 1–4 (Ideate, Implement, Verify, Review) |
| **code-review** | latest | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | A second, dispassionate read of a diff for correctness + cleanups before it can merge. Pairs with `redteam` — code-review finds bugs, redteam attacks decisions. | Phase 4 (Review & harden) |
| **ralph-loop** | 1.0.0 | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | Grinds a single hard task to completion across many turns without me re-prompting. The "iterate-until-done" engine behind a stubborn fix or big refactor. | Phase 5 (Orchestrate & ship — long-running work) |
| **rust-analyzer-lsp** | 1.0.0 | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | Real LSP intelligence (go-to-def, types, diagnostics) for Rust projects. Stops the agent from guessing at Rust. | Phase 7 (Language tooling) |

> The authored skills (`orchestrate`, `worker`, `redteam`) live in this repo — see [`README.md`](README.md).
