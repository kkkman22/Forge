---
inclusion: always
applies_to:
  - forge-review
  - forge-decide
  - forge-learn
---

# Workflow Fallback Ladder

> **范围**：本规则适用于 `forge-review`、`forge-decide`、`forge-learn` 三个走 Claude Code 原生 workflow 的子命令。`forge-build` 与本规则无关——build 不走 workflow 路径。
>
> Cross-reference: ADR [`2026-05-18-review-fallback-ladder.md`](../../.forge/decisions/2026-05-18-review-fallback-ladder.md)

## 1. Ladder 表

| Level | 触发条件 | methodology 字段值 | 阻断 ship |
|-------|----------|--------------------|-----------|
| **L0** | 交互模式 + `CLAUDE_CODE_WORKFLOWS=1` + `tengu_workflows_enabled` gate 开启 + workflow 文件可加载（`node --check` 通过） + 并发可控（`workflows/lib/concurrency.js` 存在且 workflow 源码引用 `from './lib/concurrency'`） | `workflow` | 否 |
| **L1** | L0 任一条件不满足 OR L0 运行时失败 | `subagent-parallel`（直接 L1） / `workflow-then-subagent`（L0 失败后降级） | 否 |
| **L2** | L1 subagent teams 不可用 → 串行单 agent | `subagent-serial` | 否 |
| **L3** | 所有级别不可用 | `unavailable` | **是** |

## 2. L1 触发原因 (`l1_trigger_reason`)

L1 路径必须在 `dispatch.jsonl` 写入以下原因之一：

- `gate_disabled` — `tengu_workflows_enabled` gate 关闭
- `env_unset` — `CLAUDE_CODE_WORKFLOWS` 未设置
- `non_interactive` — 当前会话由 `forge-loop` 子进程驱动
- `workflow_missing` — `${CLAUDE_PLUGIN_ROOT}/workflows/<name>.js` 不存在
- `workflow_syntax_error` — `node --check` 失败
- `concurrency_uncontrolled` — 并发桥接探测未通过
- `unmatched_state` — 状态空间未命中 L0/L1 任何明确条件（兜底）

## 3. L0 失败签名 (`l0_failure_signature`)

L0 启动后失败、自动降级到 L1 时，必须写入以下签名之一：

- `bp_exception` — `bp()` runtime 抛异常
- `schema_validation_failed` — workflow 返回值不通过 schema
- `subprocess_crash` — workflow 子进程崩溃
- `stuck_timeout` — 600s 静默超时
- `frozen_zone_blocked` — 写入命中 Frozen_Zone

## 4. Hard-Gate

<HARD-GATE name="l3-no-main-agent-substitute">

**L3 禁止主 agent 顶替评审/决策。**

当 fallback ladder 走到 L3（所有级别均不可用）时：

- `methodology` 字段必须标注 `unavailable`
- `.forge/status.md` 的 `phase` 字段必须标注 `<subcommand>-blocked`
- forge-ship SKILL 必须读取 `dispatch_chosen_level` 字段，遇到 `L3` 时**阻断 ship**
- **主 agent 不得**自行顶替评审/决策结论；用户必须人工介入或修复阻断条件后重跑

此 hard-gate 与 ADR `2026-05-18-review-fallback-ladder.md` §4 一致，是 §3.1 Execution-Assessment Separation 铁律的扩展。

</HARD-GATE>

## 5. 字段一致性

本表 `methodology` 字段值与 `dispatch.jsonl` 的 `chosen_level` 字段、`Requirement 2.4–2.6` 字段表保持字面一致。任何字段重命名必须同步更新此规则、`workflow-dispatcher.ts` 类型定义、以及 forge-ship SKILL 的读取逻辑。
