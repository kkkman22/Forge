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

`gate_disabled` | `env_unset` | `non_interactive` | `workflow_missing` | `workflow_syntax_error` | `concurrency_uncontrolled` | `unmatched_state` | `agents_unavailable`

### `agents_unavailable` Detail

`decide_dispatch_mode: auto` 选择 Agent Teams（tier=full）但 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` 未设置或 Agent Teams 运行时不可用 → 降级到 inline 模式 + 警告输出。降级不阻断 decide 流程，最终决策结果仍然有效。

## L0 Failure Signatures

`bp_exception` | `schema_validation_failed` | `subprocess_crash` | `stuck_timeout` | `frozen_zone_blocked`

## Saved Workflow Naming

Production Forge workflow dispatch targets MUST use stable Forge-derived names, for example `forge-review.js`, `forge-decide.js`, `forge-plan-package.js`, `forge-package-build.js`, `forge-test-gates.js`, and `forge-learn.js`. Generic names such as `multi-agent-review.js` are experimental only and MUST NOT be production dispatch targets.
