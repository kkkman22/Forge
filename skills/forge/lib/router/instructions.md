---
description: "Use when user runs `/forge <task>`, starts a new task, or needs skill dispatch across light, standard, or full workflow tiers"
updated: 2026-06-05

dispatch_mode: inline
allowed_tools:
  - Read
  - Glob
  - Grep
---

# /forge — 入口路由器

> **触发方式**：用户输入 `/forge` 并附带任务描述
> **职责**：三维分析（复杂度 × 任务类型 × 项目阶段）→ 建议档位 + 行为提示 → 用户确认或覆盖 → 启动对应命令序列

---

## 0. Three-Dimensional Routing Model

Forge 路由器从三个维度分析任务：

| 维度 | 决定什么 | 可选值 |
|------|---------|--------|
| **复杂度（Tier）** | 运行**哪些**命令 | 轻量 / 标准 / 全量 |
| **任务类型（TaskType）** | 每个命令**怎么**执行 | frontend / backend / fullstack / data / infra / docs |
| **项目阶段（ProjectPhase）** | **强调**什么 | greenfield / iteration / refactor / bugfix |

复杂度决定命令序列。任务类型和项目阶段生成**行为提示（Hints）**，注入到命令序列中，让下游 skill 调整行为。

**Not For**：已知要执行的子命令（直接 `/forge build`）· 非 Forge 管理的任务

---

## 1. Routing Flow

当用户输入 `/forge <任务描述>` 时，按以下四步执行：

### Step 1：分析任务描述

**复杂度信号**（决定档位）：影响范围（文件数/行数）· 需求清晰度（是否有锁定 Spec）· 系统影响（新服务/新库/认证变更）· 现有资产（`.forge/specs/`）。

**任务类型信号**：frontend（UI/样式/路由）· backend（API/DB/中间件）· fullstack（前后端交叉）· data（管道/ETL/报表）· infra（CI/CD/部署/云资源）· docs（文档/README）。

**项目阶段信号**：greenfield（从零开始）· iteration（现有功能迭代，默认）· refactor（不改外部行为）· bugfix（修复已知 bug）。

**执行偏好信号（Intent Signals）**：用户在任务描述中表达的执行偏好（"深思熟虑"、"严格 TDD"、"安全审计"等），由 `src/router-intents.ts` 从 `templates/router-intents.md` 词典匹配，注入为 `source: 'intent'` 的 RouteHint。Prompt-defense critical/high 级别抑制 intent 匹配；medium 级别双信号共存。

**假设生成**：从技术栈、影响范围、实现模式、数据层、棕地/绿地维度生成 3-5 条显式假设。内容必须来自实际项目扫描，至少覆盖技术栈和影响范围。

### Step 2：建议档位 + 维度

| 信号 | 建议档位 |
|------|---------|
| 影响文件 ≤ 1 **且** 改动 ≤ 20 行 | **轻量** |
| 有现成 Spec 或需求已明确 | **标准** |
| 涉及新服务 / 新数据库 / 认证体系变更 / 需求模糊 | **全量** |

**判定优先级**（从高到低）：用户覆盖 > 全量信号 > 标准信号 > 轻量信号 > 默认标准。

**全量档位的可选前置步骤**：`tier === "full"` 时，在 `decide` 之前建议一次可选的 `/forge grill` 会话，用于苏格拉底式对齐功能/边界/依赖/假设/非目标。用户回复 `skip` 或未触发关键词（见 §9）即跳过，直接进入标准全量序列。

```
📋 路由分析
档位：<light|standard|full> | 类型：<task_type> | 阶段：<project_phase>
理由：<一句话> | 命令序列：<commands>

行为提示（来自 taskType / projectPhase）：
  - <hint tags>

执行偏好（来自任务描述）：
  - <intent tag> (将影响 <command> 阶段)
  [无则不显示此分组]

假设：1. <判断>（基于 <来源>）...
[全量额外] 💡 可选：先跑 /forge grill 对齐，或回复 skip 跳过
确认？或覆盖：light/standard/full，--type=，--phase=
              取消执行偏好可回复"取消 intent 信号"或"忽略 <intent名>"
```

### Step 3：用户确认或覆盖

- **用户确认**（回复确认、是、ok、y 等）：按建议档位启动
- **用户覆盖档位**（回复 `light`、`standard`、`full`）：以用户指定的为准
- **用户覆盖维度**（回复 `--type=backend` 等）：覆盖对应维度，重新生成行为提示
- **用户纠正假设**（回复具体纠正内容）：更新对应假设，继续流程
- **用户触发 grill**（见 §9）：转入 `/forge grill`，grill 完成后续跑 decide
- **用户取消 intent 信号**（回复含取消语义关键词"取消/忽略/不要/跳过/撤销/cancel/skip/no intent/ignore"）：调用 `detectIntentCancellation` 剔除全部/指定 intent hints，保留其他来源 hint
- **用户在初始输入中指定**（如 `/forge --type=frontend --phase=refactor 重构登录组件`）：直接采用

---

## 2. Three-Tier Levels and Command Sequences

→ 三档定义见 CLAUDE.md §1。Router 额外支持：
- **refactor_light**: refactor-apply → review
- **refactor_standard**: refactor-scan → refactor-apply → review → test → ship
- **fix_light**: fix-apply → review
- **fix_standard**: fix-analyze → fix-apply → review → test → ship

**全量档位序列**（含 grill 可选前缀）：`[grill?] → decide → spec → plan → build → review → test → ship → learn`。方括号表示可由用户跳过。

---

## 3. Routing Signal Details

**Light**: 影响文件 ≤1 且改动 ≤20 行且确定性改动（typo/CSS/配置常量）。
**Standard**: 任一满足：已有锁定 Spec / 需求明确 / 影响范围可预估。
**Full**: 任一满足：新服务/新数据库 / 认证变更 / 需求模糊 / 多系统集成。

---

## 4. User Override

用户覆盖优先级最高。映射：light/轻量/lite/quick → light · standard/标准/std → standard · full/全量/complete/heavy → full。用户降级档位时输出一次提醒并确认。

---

## 5. Status Update

路由完成后更新 `.forge/status.md`（单任务）或 `.forge/status/<task-id>.md`（多任务，调用 `writeTaskStatus`）。字段：`current_task`, `tier`, `work_nature`（feature/refactor/bugfix，默认 feature）, `task_type`, `project_phase`, `phase`, `hints`（逗号分隔标签）, `assumptions`（可选数组）, `updated`。下游 SKILL 必须读取 `hints` 调整行为。

---

## 6. Classification Examples

**Light**: "按钮颜色蓝改绿" (frontend/iteration, 单文件<5行) · "修复 README typo" (docs/bugfix, 1行)

**Standard**: "/users API 添加分页" (backend/iteration, api-contract-check+backward-compat) · "登录表单前端验证" (frontend/iteration, a11y-check)

**Full**: "需要一个通知系统" (backend/greenfield, scaffold-first+tech-stack-review) · "JWT 迁移到 OAuth2" (backend/refactor, behavior-preservation+error-path-audit)

---

## 7. Edge Cases

无描述 → prompt 示例 · 过于简短 → 追问 · 轻量超范围 → 建议升级 · 已有活跃任务(单) → 提示 resume · 已有活跃任务(多) → 展示列表+确认

---

## 8. Behavior Hints Reference

→ 完整 hint 表（30+ 条，按 TaskType × ProjectPhase scope 分组）见 `references/behavior-hints.md`，由下游 skill 按需加载。路由器只负责把命中的 hint 标签写入 status.md，不预加载参考文档。

---

## 9. Grill Trigger Detection

以下用户输入会触发 `/forge grill` 会话（纯函数 `detectGrillTrigger` 位于 `src/grill-trigger.ts`）：

| 关键词 | 场景 |
|--------|------|
| `/forge grill [topic]` | 用户显式启动 grill |
| `grill me` | 任意 skill 执行中请求追问 |
| `grill harder` | 对当前 grill 结果不满意，继续下钻 |
| `dig deeper` | 英文语境下的同义触发 |
| `再挖深点` | 中文语境下的同义触发 |

匹配规则：**大小写不敏感子串**。`buildGrillSuggestion("full")` 返回 grill 建议串，其他档位返回 `null`。命中时路由把 phase 置为 `grill_pending`，由 `/forge grill` 接管；完成后回到原推荐档位序列。

## Common Rationalizations

| 合理化 | 反驳 |
|---|---|
| "用户没说档位，默认轻量吧" | 宁重勿轻原则。无法判定时选更重的档位，轻量误判成本远高于过重 |
| "需求听起来简单，直接 standard" | 缺少锁定 Spec 或明确需求信号时不能假设。无 Spec 的全量任务是常见盲区 |
| "假设差不多就行，用户会纠正的" | 假设必须基于实际项目扫描，至少覆盖技术栈和影响范围。空假设会导致下游 skill 行为偏差 |

## ForgeResult — Unified Command Result Model

All `/forge` subcommands must return one of these result kinds:

### Result Types
```
ForgeResult =
  | { kind: "ok",        value: CommandOutput,  command: string }
  | { kind: "blocked",   reason: string,         command: string, detail: string }
  | { kind: "refused",   reason: string,         command: string, suggestion: string }
  | { kind: "failed",    error: string,          command: string, exitCode: number }
```

### Kind Semantics
- **ok**: Command fully succeeded. `value` contains structured output.
- **blocked**: Preconditions not met (spec not locked, plan not approved, dirty worktree). `reason` is UPPER_SNAKE_CASE code.
- **refused**: Command declined to execute (already done, plan exists). `suggestion` gives alternative.
- **failed**: Execution error (compile error, test failure, 3-strike triggered).

### Dispatcher Three Iron Laws
1. **No-throw**: Never propagate exceptions. Catch all → `{ kind: "failed" }`.
2. **No-print**: Never write directly to stdout. Return structured result, let caller decide display.
3. **No-exit**: Never call `process.exit()`. Let caller control exit.

### Blocked Reason Codes
- `SPEC_NOT_LOCKED`: "Current spec status is {status}, needs 'locked'"
- `PLAN_NOT_APPROVED`: "Plan {id} status is {status}, needs 'approved'"
- `DIRTY_WORKTREE`: "Working tree has uncommitted changes: {files}"
- `P0_FOUND`: "Review found P0 issues that block ship"
- `NO_CHANGES`: "No code changes to review"

### Refused Reason Codes
- `ALREADY_DONE`: "Task {id} already completed in commit {hash}"
- `PLAN_EXISTS`: "Phase already has approved plan (use --force to replan)"

### Automation Rules
- `kind=ok` after build → auto-enter review (No-Confirmation)
- `kind=ok` after review with no P0/P1 → eligible for ship
- `kind=blocked` → output reason + fix suggestion, no retry
- `kind=failed` → increment 3-strike counter → `/forge debug` at 3

## Gotchas
- **Under-routing**: Complex task routed to light → skips planning → analysis paralysis → when unsure, route to heavier tier
- **Over-routing**: Simple typo fix routed to full → wasted cycles → respect user tier override
- **Assumption hidden**: Router makes implicit assumptions about project → wrong tier → surface assumptions explicitly for user correction
