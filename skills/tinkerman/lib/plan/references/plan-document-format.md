---
updated: 2026-08-11
---
# Plan Document Format

> Extracted from forge-plan SKILL.md Section 7.

## Output Path

`.tinkerman/plans/<topic>.md`（`<topic>` 为 kebab-case，如 `user-notification`）

## YAML Frontmatter

```yaml
---
topic: "<主题>"
status: "draft" | "approved"
date: "YYYY-MM-DD"
spec_ref: ".tinkerman/specs/<feature>/spec.md"
format: "lightweight" | "full"
---
```

| Field | Description |
|------|------|
| `format` | `lightweight` (compact format, when design.md exists) or `full` (complete format), defaults to `full` |

## Lightweight Format Body Structure (when Spec includes design.md)

```markdown
---
topic: "<topic>"
status: "draft"
date: "YYYY-MM-DD"
spec_ref: ".kiro/specs/<feature>"
format: "lightweight"
---

## Objective
<一段话说明这个计划要实现什么>

## Global Constraints
> 本次 plan 所有任务都必须遵守的约束。**逐字抄录原值**，不引用外部链接（避免链接腐烂导致 implementer 读不到原值）。
> 无跨任务约束时填 `None`（显式声明，不省略块）。（spec `plan-global-constraints-and-interfaces`）

| Constraint | Value | Source | Applies To |
|------------|-------|--------|------------|
| Node 版本下限 | ≥ 20.0.0 | `.tinkerman/config.md#runtime` | All Tasks |
| 依赖上限 | react ≤ 18.2.0 | `package.json` | All Tasks |
| 命名约定 | 新增 hook 用 `use` 前缀 | `.tinkerman/charter.md#naming` | Task 1, Task 3 |
| 错误文案 | 用户态错误含 i18n key | spec NFR-3 | All Tasks |
| 超时取值 | 网络请求 3000ms | spec NFR-5 | Task 2 |
| Charter invariant | 不跨模块直接 import | `.tinkerman/charter.md#boundaries` | All Tasks |

## Design Reference Index
| Anchor | Summary |
|--------|---------|
| `design.md#components-and-interfaces` | 定义 LightweightTask 接口和验证函数 |

## File Mapping
| File Path | Operation | Description |
|---------|------|------|
| `src/plan.ts` | MODIFY | Add LightweightTask validation |

## Task Breakdown
### Task 1: <Title>
- **Goal**: <一句话描述行为变更>
- **File**: `<file-path>`
- **Design Reference**: `design.md#<anchor>` — <一句话摘要>
- **Property**: Property N（如适用）
- **Depends On**: `[N, M]` or `[]`
- **Verify**: `<command>`
- **Commit**: `<commit message>`
- **Interfaces**:
  - **Consumes**:
    - `name`: `formatNotification` | `signature`: `(msg: RawMsg) => FormattedMsg` | `provider`: existing | `file`: `src/format.ts`
  - **Produces**:
    - `name`: `useNotification` | `signature`: `() => { notify, dismiss }` | `provider`: Task 1 | `file`: `src/hooks/useNotification.ts`
  - 无接口依赖/产出时填 `Consumes: None` / `Produces: None`（显式声明）

## Spec Coverage
| Spec Requirement | Covering Tasks |
|-----------|---------|
| Requirement 1 | Task 1, Task 2 |
```

## Full Format Body Structure (when Spec does not include design.md)

```markdown
---
topic: "user-notification"
status: "draft"
date: "2025-01-15"
spec_ref: ".tinkerman/specs/user-notification/spec.md"
---

## Objective
<一段话说明这个计划要实现什么，对应哪个 Spec>

## Global Constraints
> 本次 plan 所有任务都必须遵守的约束。**逐字抄录原值**，不引用外部链接。无跨任务约束时填 `None`。（spec `plan-global-constraints-and-interfaces`）

| Constraint | Value | Source | Applies To |
|------------|-------|--------|------------|
| Node 版本下限 | ≥ 20.0.0 | `.tinkerman/config.md#runtime` | All Tasks |
| 命名约定 | 新增 hook 用 `use` 前缀 | `.tinkerman/charter.md#naming` | All Tasks |
| Charter invariant | 不跨模块直接 import | `.tinkerman/charter.md#boundaries` | All Tasks |

## Research Findings
<研究阶段的发现：历史经验、现有代码分析、技术选型依据>

## File Mapping
| File Path | Operation | Description |
|---------|------|------|
| `src/...` | CREATE / MODIFY | ... |

## Task Breakdown
### Task 1：<任务标题>（N min）
**Depends On**: `[]` or `[N, M]`
**文件**：`<文件路径>`
**RED** — 写失败的测试 ...
**GREEN** — 写最少代码让测试通过 ...
**REFACTOR** — 重构 ...
**验证命令**：`<命令>`
**提交信息**：`<commit message>`
**Interfaces**:
  - **Consumes**: `name`/`signature`/`provider`（哪个 task 或 existing）/`file`，无依赖填 `None`
  - **Produces**: 同上结构，无产出填 `None`

## Spec Coverage
| Spec Requirement | Covering Tasks |
|-----------|---------|
| Requirement 1 Scenario S1 | Task 1, Task 2 |
```
