---
spec: subagent-result-truncation
stage: 1
commit: 91af56c
generated_at: 2026-05-17T00:09:09Z
review_started: 2026-05-17T00:11:18Z
review_completed: 2026-05-17T00:12:26Z
result: complete
closure_upgraded_by: forge-review-diff-context-fidelity-stage2 (2026-05-17)
---

# Subagent Result Truncation — Stage 1 Dogfood Smoke

## Fixture (pre-flight confirmed)

- Commit: 91af56c
- `.forge/plans/` ≥ 4 KB active plans: 49 (≥ 5 threshold ✅)
- `.forge/knowledge/evolved-rules.md`: 9580 bytes (≥ 8 KB threshold ✅)
- Review target diff: `agents/spec-check.md` (1 file, +59 -14 lines)
- spec-check.md: maxTurns bumped 6→10, Turn Budget Discipline added, Step 0.5 merged, Final Report Block added
- quality-check.md / security-check.md: UNMODIFIED (control group, old maxTurns: 6)

## Stage 1 Real Smoke

### spec-check (foreground)

- **duration_ms**: ~68000 (foreground, includes orchestration overhead)
- **tool_uses**: 7 (forge_git + Read/Glob/Grep for spec + diff analysis)
- **result**: Complete Layer 1 report ✅

```
## Layer 1 — Spec Alignment

**Reviewer**: spec-check

| Requirement/Scenario | Status | Note |
|-----------|------|------|
| Hook stdin router with subagent short-circuit (Property 1) | ✅ 已实现 | Hook stdin parser router module exists in scripts/lib/ |
| Subagent zero-injection (C(X) → exit 0) | ✅ 已实现 | router provides shouldSkipForSubagent() |
| Main agent preservation (Property 2) | ✅ 已实现 | Should inject path preserved for main agent |
| Fail-safe on ill-formed stdin (Property 3) | ✅ 已实现 | Router handles timeout, partial read, parse errors |
| Settings.json head/tail removal (Property 4) | ✅ 已实现 | Duplicate injection source removed |
| SessionStart byte cap (4KB) | ✅ 已实现 | inject-evolved-rules.mjs implements cap |
| Turn Budget Discipline in spec-check agent | ✅ 已实现 | maxTurns bumped from 6 to 10, budget rules added |

**Scope Creep**:
- None observed. All changes align with bugfix scope.

**Issue List**:

| # | Severity | Issue | Fix Suggestion |
|---|--------|------|---------|
| 1 | P0 | spec-check agent definition modified without explicit test coverage | The Turn Budget Discipline changes (maxTurns: 10, budget table, Final-Report Block contract) are behavioral changes to the spec-check agent itself. Unlike other changes which have corresponding tests in the hook-budget spec, this meta-change to the spec-check agent lacks explicit verification. Consider adding a test that validates the agent can complete a review within 10 turns and produces the required final report format. |
```

**Verdict**: ✅ Complete Layer 1 report with severity table + Issue List + Scope Creep. No preamble at start.

### quality-check (background, CONTROL GROUP)

- **duration_ms**: 22297
- **tool_uses**: 6
- **result**: TRUNCATED ❌

```
Now let me check the tasks.md to understand the specific requirements:
```

**Verdict**: ❌ Truncated. Agent exhausted 6 turns on tool calls (Read/Glob/Grep for context gathering) and the last turn output was a preamble ("Now let me check..."), not a Layer 2 report. This is the expected control-group behavior — quality-check.md was NOT modified and still has maxTurns: 6.

### security-check (background, CONTROL GROUP)

- **duration_ms**: 20224
- **tool_uses**: 6
- **result**: TRUNCATED ❌

```
Now let me check the git diff directly to see the actual changes:
```

**Verdict**: ❌ Truncated. Same pattern as quality-check — 6 tool_uses exhausted, last turn was preamble. Expected control-group behavior.

## Checklist

- [x] **spec-check 完整 Layer 1 报告**（severity 表 + Issue List + Scope Creep 段）
  - Output starts with `## Layer 1 — Spec Alignment`, includes requirement coverage table, scope creep section, and issue list with severity.
- [x] **spec-check 不以 preamble 起头**
  - No "Now let me..." / "I need to..." / "Let me check..." preamble detected. Report starts directly with the Layer 1 heading.
- [x] **quality-check 行为**: 仍 truncate
  - Control group (unmodified). 6/6 tool_uses consumed, result = preamble text only. No Layer 2 report produced. Expected.
- [x] **security-check 行为**: 仍 truncate
  - Control group (unmodified). 6/6 tool_uses consumed, result = preamble text only. No Layer 3 report produced. Expected.

## Conclusion

**Stage 1 PASSED.** The spec-check agent (modified with Turn Budget Discipline + maxTurns: 10) produced a complete Layer 1 report without preamble truncation. The two control-group agents (quality-check, security-check — unmodified, maxTurns: 6) still truncate as expected. The fix is effective for the modified agent.

**P0 issue raised by spec-check** (about lack of test coverage for the meta-change to spec-check.md itself) is noted but is a review finding, not a smoke-test failure. This can be addressed in a follow-up.
