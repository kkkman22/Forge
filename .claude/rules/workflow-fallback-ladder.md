---
inclusion: always
---

# Workflow Fallback Ladder

Cross-reference: ADR `.forge/decisions/2026-05-18-review-fallback-ladder.md`

Applies to: `forge-review`, `forge-decide`, `forge-learn`.

| Level | Trigger Condition | methodology Field | Blocks Ship |
|-------|-------------------|-------------------|-------------|
| L0 | Interactive mode + `CLAUDE_CODE_WORKFLOWS=1` + `tengu_workflows_enabled` gate ON + workflow file exists + `node --check` passes + concurrency bridge probe passes | `workflow` | No |
| L1 | Any L0 condition fails OR L0 runtime failure (`bp_exception`, `schema_validation_failed`, `subprocess_crash`, `stuck_timeout`, `frozen_zone_blocked`) | `subagent-parallel` / `workflow-then-subagent` | No |
| L2 | Subagent teams unavailable → serial single-agent fallback | `subagent-serial` | No |
| L3 | All levels unavailable | `unavailable` | **Yes** |

<HARD-GATE name="l3-no-main-agent-substitute">
L3 禁止主 agent 顶替评审/决策。Ship 阻断。
</HARD-GATE>

## L1 Trigger Reasons

`gate_disabled` | `env_unset` | `non_interactive` | `workflow_missing` | `workflow_syntax_error` | `concurrency_uncontrolled` | `unmatched_state`

## L0 Failure Signatures

`bp_exception` | `schema_validation_failed` | `subprocess_crash` | `stuck_timeout` | `frozen_zone_blocked`
