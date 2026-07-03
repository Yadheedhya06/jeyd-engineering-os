# CLI UX — the cockpit

The skills are the engine; this is the instrument panel. My actual Claude Code terminal setup —
a self-contained statusline script plus the handful of `settings.json` keys that shape the UI.
No third-party statusline plugins, no daemons: one bash script and jq.

What it looks like in a session:

```
❯ backport the fix to PR #27

Opus 4.8 (1M context) 📁 my-repo | 🌿 feat/my-branch +2 ~5
██████░░░░ 67% ctx | $8.20 | ⏱ 42m10s
▶▶ bypass permissions on (shift+tab to cycle) · ← for agents
```

The top two info rows come from [`statusline.sh`](statusline.sh); the permission-mode footer and
agents hint are stock Claude Code.

## The statusline

[`statusline.sh`](statusline.sh) reads Claude Code's JSON session data on stdin and prints two rows:

| Row | Contents |
|-----|----------|
| 1 | model (cyan) · 📁 current dir · 🌿 git branch, with `+N` staged / `~N` modified when dirty |
| 2 | 10-cell context-window bar · `% ctx` · session cost · session wall-clock |

Design decisions:

- **Context bar is a traffic light.** Green under 70%, yellow under 90%, red above. You feel
  compaction coming *before* it happens — that's the whole point of putting it in the statusline.
- **Cost and time are always visible.** Long autonomous sessions burn real money; the meter runs
  where you can see it, not in a menu.
- **Git state is cached 5s per session** (one small file under `/tmp`), so the bar stays snappy
  in big repos instead of shelling out to `git diff` on every render.
- **Fail-quiet.** Every jq extraction is null-safe; outside a git repo the branch segment just
  disappears. The statusline should never be the thing that breaks.

> Portability note: the script is written for macOS (`stat -f %m`). On Linux, swap that one call
> for `stat -c %Y`.

## Install

```bash
cp cli-ux/statusline.sh ~/.claude/statusline.sh
chmod +x ~/.claude/statusline.sh
```

Then merge [`settings.snippet.json`](settings.snippet.json) into `~/.claude/settings.json`.
Requires `jq` (`brew install jq`).

## The settings, and why

[`settings.snippet.json`](settings.snippet.json) — only the UI/UX keys. (My real `settings.json`
also carries a permissions allowlist; that's machine- and project-specific, so it stays private.
Grow your own — the `fewer-permission-prompts` skill will draft one from your transcripts.)

| Key | Value | Why |
|-----|-------|-----|
| `statusLine` | `~/.claude/statusline.sh` | the script above |
| `model` | `claude-fable-5[1m]` | the `[1m]` suffix opts into the 1M-token context window — the statusline's ctx bar is what makes a window that big manageable |
| `effortLevel` | `xhigh` | default reasoning effort; matches how the [Power-User Playbook](../README.md#power-user-playbook--running-the-dev-cycle-at-max) runs coordinators |
| `tui` | `fullscreen` | alternate-screen TUI instead of inline scrollback |
| `theme` | `dark-daltonized` | colorblind-safe dark palette — accessible defaults cost nothing |
| `enabledPlugins` | superpowers, code-review, ralph-loop, rust-analyzer-lsp | the marketplace skills from [`SKILLS-I-USE.md`](../SKILLS-I-USE.md) |
| `skipDangerousModePermissionPrompt` | `true` | no confirmation dialog when cycling into bypass-permissions |
| `skipWorkflowUsageWarning` | `true` | no token-usage warning before multi-agent workflows |

**Caveat, stated plainly:** the last two settings remove friction from *dangerous* modes. That
trade is only sane because the autonomy here is gated elsewhere — fail-closed gauntlets, redteam
before merge, a kill switch (see [Principles](../README.md#principles)). Don't copy the
convenience without the guardrails.
