# ADR: Stop Hook 8-Block Cap Compliance Audit

**Date**: 2026-05-16
**Status**: Accepted
**Context**: Claude Code 2.1.143

## Decision

All 6 Stop hooks in plugin.json are compliant with the 8-block cap safety mechanism. No modification required.

## Evidence

### 1. Inline bash — incomplete tasks reminder
- **Script**: `if [ -f .tinkerman/progress/*.md ]; then ... echo ...; fi`
- **Exit behavior**: Implicit exit 0 (bash default)
- **Block risk**: None. Only `echo` statements, no `exit 2`, no JSON output.
- **Verdict**: ✅ Compliant

### 2. persistent-loop.sh
- **Script**: `scripts/persistent-loop.sh`
- **Exit behavior**: 19 instances of `exit 0`. Zero instances of `exit 1`, `exit 2`, or any non-zero exit.
- **Block risk**: None. Even error paths exit 0.
- **Verdict**: ✅ Compliant

### 3. Inline bash — evolved rules pending
- **Script**: `if [ -f .tinkerman/knowledge/evolved-rules.md ]; then ... echo ...; fi`
- **Exit behavior**: Implicit exit 0
- **Block risk**: None. Only `echo` and `grep -c`.
- **Verdict**: ✅ Compliant

### 4. record-evolved-rule-violation.mjs
- **Script**: `scripts/record-evolved-rule-violation.mjs`
- **Exit behavior**: `process.exit(main())` where main() returns 0 (success) or 1 (error).
- **Block risk**: None. Exit 1 is error (not block). No block JSON output.
- **Verdict**: ✅ Compliant

### 5. flag-stale-evolved-rules.mjs
- **Script**: `scripts/flag-stale-evolved-rules.mjs`
- **Exit behavior**: `process.exit(main())` where main() returns 0 (no stale) or 1 (stale found).
- **Block risk**: None. Exit 1 is error (not block). No block JSON output.
- **Verdict**: ✅ Compliant

### 6. Inline bash — phase reminder
- **Script**: `if [ -f .tinkerman/status.md ]; then ... echo ...; fi`
- **Exit behavior**: Implicit exit 0
- **Block risk**: None. Only `echo` and string comparison.
- **Verdict**: ✅ Compliant

### 7. cmux-mirror/sync-once.mjs
- **Script**: `scripts/cmux-mirror/sync-once.mjs`
- **Exit behavior**: 3 instances of `process.exit(0)`. No non-zero exits in source.
- **Block risk**: None. Wrapped in `|| true` in plugin.json as additional safety.
- **Verdict**: ✅ Compliant

## Constraint

Future modifications to any Stop hook script **must not** use:
- `exit 2` or any non-zero exit intended as "block"
- `{"continue": false}` or `{"decision": "block"}` JSON on stdout

This constraint is enforced by `test/contract.test.ts` `stop-hook-no-block` test suite.

## Reference

Claude Code 2.1.143 changelog: "Fixed stop hooks that block repeatedly looping forever — the turn now ends with a warning after 8 consecutive blocks"
