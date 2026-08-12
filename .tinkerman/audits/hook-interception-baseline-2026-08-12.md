# Hook Interception Rate Baseline (2026-08-12)

> Source: hook-audit-2026-08-11 + tool-health.log (795 lines, maintenance-only)

## Summary

tool-health.log contains maintenance events (prune-sessions), NOT hook trigger data.
No programmatic interception rate data exists — hooks run as fail-open scripts with no
telemetry beyond stdout/stderr (discarded by Claude Code runtime).

## Baseline (from hook-audit Existence Test analysis)

| Hook | Audit Verdict | Status (2026-08-12) | Trigger Evidence |
|------|---------------|---------------------|------------------|
| stop-phase-verify | 🟢 brake | Alive (tinkerman-*) | Manual observation: triggers on Stop events |
| stop-pending-rules | 🟡 degrade | Alive, degraded | No telemetry |
| inject-evolved-rules | 🟡 degrade | Alive, degraded (32KB content-only) | No telemetry |
| forge-prompt-guard | 🟢 brake | Alive (tinkerman-prompt-guard) | Triggers on Write/Edit .tinkerman/ |
| forge-read-injection-scanner | 🟢 brake | Alive (tinkerman-read-injection-scanner) | Triggers on Read |
| frozen-zone (3 scripts) | 🟢 brake | Alive | Triggers on frozen file writes |
| postooluse-inject-warnings | 🟢 brake | Alive | Triggers on PostToolUse |

## Cut Hooks (pass 1 — zero interception = correctly removed)

All 12 cut hooks had **zero documented interception events** in available logs.
No evidence of ever blocking a user action → babysit/可吸收 classification confirmed.

## Recommendation

1. **No programmatic telemetry needed** — Existence Test + manual observation sufficient per ADR-0009
2. **If telemetry desired**: add `console.error(JSON.stringify({hook, ts, blocked}))` to brake hooks,
   pipe to .tinkerman/runs/ — but this is NOT Existence Test required, it's a "nice to have"
3. **RE-AUDIT.md checklist** (see separate file) handles model-version-triggered re-evaluation

