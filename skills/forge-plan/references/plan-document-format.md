# Plan Document Format

> Extracted from forge-plan SKILL.md Section 7.

## Output Path

`.forge/plans/<topic>.md`（`<topic>` 为 kebab-case，如 `user-notification`）

## YAML Frontmatter

```yaml
---
topic: "<主题>"
status: "draft" | "approved"
date: "YYYY-MM-DD"
spec_ref: ".forge/specs/<feature>/spec.md"
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
spec_ref: ".forge/specs/user-notification/spec.md"
---

## Objective
<一段话说明这个计划要实现什么，对应哪个 Spec>

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

## Spec Coverage
| Spec Requirement | Covering Tasks |
|-----------|---------|
| Requirement 1 Scenario S1 | Task 1, Task 2 |
```
