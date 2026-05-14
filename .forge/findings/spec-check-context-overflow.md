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

### 已实施（Phase 1 — quick fix，a94ef8c）

- `maxTurns` 15→20
- Agent 定义增加效率约束文本："优先用 prompt 传入的 diff 摘要，禁止逐文件 Read"
- **局限**：prompt 约束文本不可靠，agent 仍可能按自己逻辑读取

### 已实施（Phase 2 — 完整修复）

**改动清单**：

1. **`src/mcp/tools/forge-git.ts`** — 新增 `diff-content` 子命令 + `truncateDiffContent()` 函数
   - 智能截断：按文件优先级（源码 > 配置 > 测试 > 生成文件 > lock）
   - 单文件上限 200 行，总量上限 3000 行
   - 截断后附注省略文件列表

2. **`skills/forge-review/SKILL.md`** — §2.0 Diff Context Preparation 前置步骤
   - 编排层在启动 agent 前执行 `forge_git(diff-content)` 写入 `.forge/reviews/.diff-context.md`
   - Execution Flow 更新为包含 Step 1.5

3. **`.claude/agents/spec-check.md`** — Check Method 重写 + maxTurns 20→12
   - 铁律：基于 prompt diff 分析，Read 上限 5 次
   - 明确禁止行为列表

4. **`.claude/agents/quality-check.md`** — 新增 Check Method + maxTurns 15→12
   - 同样的铁律和 Read 预算约束

5. **`.claude/agents/security-check.md`** — 新增 Check Method + maxTurns 15→12
   - 同样的铁律和 Read 预算约束

6. **`test/mcp/diff-truncation.test.ts`** — 6 个单元测试覆盖截断逻辑

### 后续优化（Phase 3，未实施）

- **forge_read 深入验证脚本**：为 review 场景预置分析脚本模板，agent 通过 MCP 沙箱获取精炼摘要而非 Read 全文
- **工具硬限制**：大变更集时将 agent tools 从 `Read, Glob, Grep` 缩减为 `Grep`（只允许搜索不允许全文读取）
- **Token 监控**：在合并管线中记录每个 agent 的 token 消耗，超过 150K 时标注 warning
- **自动拆分**：如果注入 diff 后 agent 仍截断（极大变更集），编排层检测截断并自动拆分为多次评审（按文件分组）

#### 预期效果

| 指标 | Phase 1 (quick fix) | Phase 2 (当前) | Phase 3 (目标) |
|------|------|--------|--------|
| Agent Read 调用 | 22+ | 0-5 | 0-2 |
| Token 消耗 | 663K+ | <200K | <120K |
| 输出完整性 | 截断 | 完整 | 完整 |
| maxTurns 需求 | 20 | 12 | 8-10 |

### 优先级

P1 — review 是 ship 的前置门禁，spec-check 截断意味着 Layer 1 评审缺失，P0/P1 问题可能漏过。

### 相关文件

- `.claude/agents/spec-check.md` — agent 定义（已修改）
- `.claude/agents/quality-check.md` — 同类风险（已修改）
- `.claude/agents/security-check.md` — 同类风险（已修改）
- `skills/forge-review/SKILL.md` — 编排层（已增加 §2.0 预读步骤）
- `src/mcp/tools/forge-git.ts` — diff-content 子命令（新增）
- `test/mcp/diff-truncation.test.ts` — 截断逻辑测试（新增）
