# Verdict format

## Opponent results — input to bin/aggregate.mjs
{
  "decisions": [
    {
      "id": "D1",
      "summary": "<one line>",
      "surface": "standard" | "elevated",
      "severity": "critical" | "high" | "medium" | "low",
      "opponents": [
        { "refuted": true, "alternative": "...", "why": "...",
          "what_breaks_if_wrong": "...", "severity": "high" }
      ]
    }
  ]
}

## aggregate.mjs output
{
  "decisions": [
    { "id": "D1", "verdict": "cleared"|"revise"|"blocked",
      "refuted": 0, "total": 3, "surface": "standard", "severity": "high" }
  ],
  "summary": { "cleared": 0, "revise": 0, "blocked": 0 },
  "gate": "pass" | "fail"
}
The gate is `pass` iff every decision is `cleared`.
The per-decision `severity` in the output is the EFFECTIVE severity (the audited agent's rating escalated by any higher opponent rating).

## Human-facing report (what the skill prints at the end)
A markdown table with columns:
| id | decision | challenged alternative | agent's defense | verdict | severity | required action |
Then a final line: `GATE: pass` or `GATE: fail`.

> Note: `agent's defense` is captured by SKILL.md during the defend/revise step and passed through to the report separately — it is not part of the aggregate.mjs input/output.
