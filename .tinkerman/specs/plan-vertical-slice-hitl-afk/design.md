---
feature: plan-vertical-slice-hitl-afk
layout: design
created: 2026-06-03
---

# Design Document: Plan 输出强制 Vertical Slice + HITL/AFK 标记

## Overview

本功能为 `/forge plan` 的 Task Breakdown 步骤新增 Vertical Slice 约束和 HITL/AFK 交互类型标记。每个 plan task 必须是端到端的 tracer bullet（而非水平分层），并标注该 task 是否需要人工交互。修改范围为 plan instructions 和 atomic-task-format 两个文档。

**灵感来源**：Matt Pocock `skills` 仓库的 `/to-issues` skill（tracer bullet vertical slices + HITL/AFK 标记）。

**修改范围**：
1. `skills/forge/lib/plan/instructions.md` — Step 3 Task Breakdown 追加规则
2. `skills/forge/lib/plan/references/atomic-task-format.md` — 追加 Interaction + Nature 字段

**设计原则**：
- glossary.md 已定义 `Vertical Slice`，直接引用而非重新定义
- HITL/AFK 标记在 build 阶段消费，plan 阶段只负责标注
- 向后兼容：旧格式 plan（无 Interaction/Nature 字段）仍然有效

## Architecture

### 现有实现分析

**`plan/instructions.md` Step 3 Task Breakdown**：

当前拆解规则：
- **Granularity**（2-5 min）
- **Independence**（独立可验证）
- **Ordering**（按依赖排序）
- **Completeness**（不留空白）

**`atomic-task-format.md`**：

当前字段：Task Number / Title / Depends On / File Path / Estimated Time / TDD Steps / Verify Command / Commit Message。

**Gap**：
1. "Independence"说的是"独立可验证"但未要求每个 task 端到端贯穿所有层。当前示例（`notification.ts` + `notification.test.ts`）是单文件 vertical slice，但多文件场景下可能出现 "Task 1: 写 schema / Task 2: 写 API / Task 3: 写测试" 这种水平切片
2. 没有 HITL/AFK 标记——build agent 无法区分可连续执行的 task 和需要停下来的 task
3. 没有 infrastructure 例外标记——纯基础设施 task（DB 迁移等）天然是按层的

### 修改拓扑

```
skills/forge/lib/plan/instructions.md
  └── Step 3 Task Breakdown
        ├── 现有规则（Granularity / Independence / Ordering / Completeness）
        ├── Vertical Slice 约束（新增）
        └── HITL/AFK 标记规则（新增）

skills/forge/lib/plan/references/atomic-task-format.md
  └── 字段表追加 Interaction + Nature（新增）
```

## Components and Interfaces

### Component 1: Vertical Slice 约束

在 Step 3 现有拆解规则后追加。

**内容**：

```markdown
#### Vertical Slice 约束

每个 task 必须是一个 **Tracer Bullet**：贯穿所有相关层的端到端垂直切片。
参考 `.tinkerman/glossary.md` 中 `Vertical Slice` 的定义。

WRONG（水平切片）:
  Task 1: 设计数据库 schema
  Task 2: 实现 API 端点
  Task 3: 写前端页面
  Task 4: 写测试

RIGHT（垂直切片）:
  Task 1: 用户可通过 API 创建 Order，数据持久化到 DB，有测试覆盖
  Task 2: 用户可在前端创建 Order，调用 API，有 E2E 测试
  Task 3: 用户可取消 Order，从 API 到 DB 到 UI 端到端

**判断标准**：
- 每个 task 完成后可以**独立演示或验证**
- task 不是按技术层拆分，而是按用户行为/功能切片
- 如果一个 task 只涉及一层（只有 schema / 只有 API / 只有 UI），
  考虑与相邻层合并为端到端切片

**例外**：纯基础设施 task（数据库迁移、配置变更、依赖安装）可以按层拆分，
但必须标记 `nature: infrastructure`。
```

### Component 2: HITL/AFK 标记规则

在 Vertical Slice 约束后追加。

**内容**：

```markdown
#### HITL/AFK 标记

每个 task 必须标记交互类型：

| 标记 | 含义 | build 行为 |
|------|------|-----------|
| `AFK` | 可自主完成，无需人工 | 连续执行，不中断 |
| `HITL` | 需要人工决策/验证/设计评审 | 执行前暂停，等待用户确认 |

**HITL 触发条件**：
- 需要选择设计方向（多个合理方案）
- 需要用户提供外部信息（API key、第三方配置）
- 需要人工视觉验证（UI 布局确认）
- 涉及不可逆操作（数据库迁移、破坏性重构）

**默认**：`AFK`。仅在明确满足 HITL 触发条件时标记 `HITL`。
```

### Component 3: atomic-task-format.md 新增字段

在字段表中追加：

```markdown
| **Interaction** | `AFK` or `HITL` | `AFK` |
| **Nature** | `feature` / `infrastructure` / `bugfix` | `feature` |
```

Task 示例中体现新字段：

```markdown
### Task 1: User can create Order via API with persistence and test

**Depends On**: []
**Interaction**: AFK
**Nature**: feature

**RED** — ...
```

## Edge Cases

| 情况 | 处理 |
|------|------|
| 旧格式 plan（无 Interaction/Nature 字段） | 向后兼容，build 按默认值 AFK/feature 处理 |
| 纯基础设施 task | 允许水平切片，标记 `nature: infrastructure` |
| 全部 task 都标 HITL | 合法但可疑——plan self-check 输出 warning |
| 一个 task 跨多个 feature | 应拆分——违反 Granularity 规则 |

## Out of Scope

- 不改变 build agent 的执行逻辑（HITL 暂停由 build agent prompt 约束，不在本 spec 范围）
- 不改变 Plan Document Format 的 frontmatter 结构
- 不引入新的 Plan Split 触发条件
- 不改变 plan/instructions.md Step 3.5 依赖识别逻辑
