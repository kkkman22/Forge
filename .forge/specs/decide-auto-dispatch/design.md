---
feature: decide-auto-dispatch
layout: design
created: 2026-05-30
---

# Design Document: Decide 双模式自动分发

## Overview

在 `/forge decide` 的执行流程中新增 `auto` 模式，根据 tier（从 `.forge/status.md` 读取）自动选择 inline 或 Agent Teams 执行模式。

**变更范围**：
- 修改 `skills/forge/lib/decide/instructions.md`（添加 auto 分发逻辑）
- 修改 `skills/forge/lib/router/instructions.md`（确保 tier 传递）
- 修改 `.forge/config.md`（`decide_dispatch_mode: inline` → `auto`）
- 修改 `.claude/rules/workflow-fallback-ladder.md`（L1 触发条件更新）

**不涉及**：Agent Teams 的内部实现（forge-decide-lead 等）、inline 模式的分析逻辑。

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  /forge decide                           │
└──────────────────────────┬──────────────────────────────┘
                           │
               ┌───────────▼────────────┐
               │ 读取 decide_dispatch_mode│
               │ 从 .forge/config.md     │
               └───────────┬────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
     ┌─────▼─────┐  ┌──────▼──────┐  ┌────▼────┐
     │  inline   │  │   agents    │  │  auto   │
     │  (固定)   │  │  (固定)     │  │ (新增)  │
     └─────┬─────┘  └──────┬──────┘  └────┬────┘
           │               │               │
           │               │     ┌─────────▼──────────┐
           │               │     │ 读取 tier from      │
           │               │     │ .forge/status.md    │
           │               │     └─────────┬──────────┘
           │               │               │
           │               │     ┌─────────▼──────────┐
           │               │     │ tier=full?          │
           │               │     │  Yes → agents       │
           │               │     │  No  → inline       │
           │               │     └─────────┬──────────┘
           │               │               │
           │       ┌───────▼───────────────▼┐
           │       │  Agent Teams 可用？     │
           │       │  No → 降级 inline       │
           │       │  Yes → forge-decide-lead│
           │       └───────┬────────────────┘
           │               │
     ┌─────▼───────────────▼─────┐
     │     inline 3 视角分析      │
     │  product/architect/security│
     └───────────────────────────┘
```

## Components and Interfaces

### Component 1: decide/instructions.md 修改

在 decide skill 的执行流程头部添加模式分发逻辑：

```markdown
## 模式选择

1. 读取 `.forge/config.md` 的 `decide_dispatch_mode` 字段
2. 如果为 `inline` → 使用 inline 模式
3. 如果为 `agents` → 使用 Agent Teams 模式
4. 如果为 `auto`：
   a. 读取 `.forge/status.md` 的 `tier` 字段
   b. tier=full → 尝试 Agent Teams
   c. tier=standard/light → inline
   d. Agent Teams 不可用 → 降级 inline + 警告
```

### Component 2: config.md 默认值变更

```yaml
# 当前
decide_dispatch_mode: inline

# 变更后
decide_dispatch_mode: auto
```

### Component 3: workflow-fallback-ladder.md 更新

在 L1 触发条件中新增：

```markdown
| `agents_unavailable` | `auto` 模式选择 Agent Teams 但环境不支持，降级到 inline |
```

## Key Design Decisions

| Decision | Chosen Path | Rejected Path | Reason |
|----------|-------------|---------------|--------|
| 默认值 | `auto` | 保持 `inline` | Full tier 用户获益最大，Standard/Light 行为等价 |
| Tier 来源 | `.forge/status.md` | router 参数传递 | status.md 是跨阶段的单一事实源 |
| 降级策略 | 自动降级 + 警告 | 阻断 + 报错 | 不阻断用户工作流 |

## Error Handling

| 场景 | 行为 |
|------|------|
| `.forge/config.md` 无 `decide_dispatch_mode` | 默认 `auto` |
| `.forge/status.md` 无 `tier` 字段 | 默认 `standard` |
| Agent Teams 环境不可用 | 降级 inline + 警告 |
| `decide_dispatch_mode` 值非法 | 当作 `auto` 处理 |

## Testing Strategy

1. **手动验证**：`/forge decide`（Full tier）→ 确认启动 Agent Teams
2. **手动验证**：`/forge decide`（Standard tier）→ 确认 inline 模式
3. **降级验证**：`unset CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` + Full tier → 确认降级
4. **回归验证**：`npm run check` 通过
