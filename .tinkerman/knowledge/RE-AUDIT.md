# Re-Audit Checklist (Per Model/Platform Version Release)

> Trigger: Claude Code or ZCode major version release
> Action: Walk this checklist. If any item returns "yes, absorbed", re-evaluate that hook's Existence Test.

## Brake Hooks (14 alive — tinkerman-*)

| # | Hook | Question: Has the platform natively absorbed this? |
|---|------|---------------------------------------------------|
| 1 | tinkerman-hook-dispatch (SessionStart/Stop) | Does the platform now natively inject project rules + verify phase completion? |
| 2 | tinkerman-phase-worker | Does the platform now track build/test/review phase state? |
| 3 | tinkerman-prompt-guard (PreToolUse Write/Edit) | Does the platform now natively protect config/state files? |
| 4 | tinkerman-read-injection-scanner (PostToolUse Read) | Does the platform now natively scan for prompt injection in read content? |
| 5 | tinkerman-sync-runtime | Does the platform now self-heal hook registrations? |
| 6 | frozen-zone: check-frozen (3 scripts) | Does the platform now natively protect locked/approved files? |
| 7 | stop-phase-verify (Stop) | Does the platform now verify task completion before session end? |
| 8 | stop-pending-rules (Stop) | Does the platform now track pending evolved rules? |
| 9 | inject-evolved-rules (SessionStart) | Does the platform now natively inject project rules from markdown? |
| 10 | postooluse-inject-warnings (PostToolUse) | Does the platform now natively warn on frozen boundary violations? |
| 11 | prompt-injection-scan (CI) | Does the platform now natively scan commits for injection? |
| 12 | check-destructive (PreToolUse Bash) | Does the platform now natively block git reset --hard / push --force? |
| 13 | check-diff-context-integrity | Does the platform now natively protect review context? |
| 14 | hook-notify (frozen interception) | Does the platform now natively notify on frozen file access? |

## Evaluation Rule

- If "yes" for a hook → run full Existence Test (ADR-0009) before cutting
- If "partially" → degrade (simplify mechanism, keep content)
- If "no" → keep as-is
- Log decision in `.tinkerman/decisions/` as ADR

