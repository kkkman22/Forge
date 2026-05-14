---
title: "Spec-check Agent 上下文溢出导致评审输出截断"
tags: ["review", "agent", "context-overflow", "reliability"]
date: "2026-05-14"
confidence: 0.9
---

## Problem Pattern

`/forge review` 的 spec-check agent 在变更文件 ≥15 时，上下文溢出导致输出截断。两次实测（forge-slimming-followups，19 个变更文件）分别消耗 663K / 706K tokens，均返回不完整结果。

### 现象

- Agent 返回仅 1-2 行文本后停止（如 "Now let me check the TypeDoc configuration:"）
- 重新启动后仍截断（如输出 R3.3 分析后中断）
- token 消耗异常高（663K+），远超 Sonnet 200K 上下文窗口

### Root Cause

spec-check agent 的执行流程是"先读所有文件，再产出分析"：

1. 读取 spec 3 个文件（requirements/design/tasks）≈ 470 行
2. 逐文件 Read 19 个变更文件 ≈ 2500+ 行
3. Agent system prompt + 定义 ≈ 140 行
4. 总输入 ≈ 3100+ 行，加上 Sonnet 的处理开销，超出 200K 上下文

Agent 在 Read 阶段耗尽上下文 → 无空间产出结构化输出 → 截断。

### 影响范围

- spec-check：已确认受影响
- quality-check / security-check：同类风险（同样逐文件 Read）
- 变更文件 ≥15 时必现，≤5 时通常正常

## Solution

### 已实施（quick fix，a94ef8c）

- `maxTurns` 15→20
- Agent 定义增加效率约束文本："优先用 prompt 传入的 diff 摘要，禁止逐文件 Read"
- **局限**：prompt 约束文本不可靠，agent 仍可能按自己逻辑读取

### 待实施（完整修复）

**核心思路**：编排层（forge-review）预读 diff 并注入 agent prompt，消除 agent 的 Read 需求。

#### 改动 1：forge-review SKILL.md 增加预读步骤

在启动 agent 前，主线程执行：

```bash
# 1. Diff stat（已做）
git diff --stat main...HEAD

# 2. 变更内容摘要（新增）
git diff main...HEAD -- '*.ts' '*.js' '*.mjs' '*.sh' '*.json' '*.yml' '*.md'
```

将 diff 内容作为 prompt 的一部分传给每个 agent。

#### 改动 2：三个 agent 定义统一修改

spec-check.md、quality-check.md、security-check.md 的 Check Method 统一改为：

```
1. 基于 prompt 中传入的 diff 摘要分析变更（不做 Read）
2. 仅对存疑项用 Read 深入验证（最多 3-5 次）
3. 产出结构化输出
```

#### 改动 3：Diff 注入 prompt 模板

```
你正在评审 forge-slimming-followups 的变更。

## Diff 摘要
{git diff --stat}

## 变更内容
{git diff 完整内容}

## Spec 位置
.kiro/specs/forge-slimming-followups/requirements.md

请基于以上信息进行 {layer} 评审。仅对存疑项用 Read 验证。
```

#### 预期效果

| 指标 | 当前 | 修复后 |
|------|------|--------|
| Agent Read 调用 | 22+ | 0-5 |
| Token 消耗 | 663K+ | <200K |
| 输出完整性 | 截断 | 完整 |
| maxTurns 需求 | 20 | 8-10 |

### 优先级

P1 — review 是 ship 的前置门禁，spec-check 截断意味着 Layer 1 评审缺失，P0/P1 问题可能漏过。

### 相关文件

- `.claude/agents/spec-check.md` — agent 定义
- `.claude/agents/quality-check.md` — 同类风险
- `.claude/agents/security-check.md` — 同类风险
- `skills/forge-review/SKILL.md` — 编排层，需增加预读步骤
