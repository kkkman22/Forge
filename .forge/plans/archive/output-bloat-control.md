---
topic: "output-bloat-control"
status: "approved"
date: "2026-04-30"
spec_ref: ".kiro/specs/output-bloat-control"
format: "lightweight"
---

# Plan: Output Bloat Control

> 来源: `.kiro/specs/output-bloat-control/`

## Objective

通过四项优化措施（Agent 级模型路由、散文压缩规则、Restatement 摘要压缩、opusplan 模式推荐）控制 AI 输出端 token 消耗。所有变更均为文档/配置修改，无新代码。

## Research Findings

### 来自知识库

- **instincts.md**: 无直接相关模式（regex、command-injection、validation 不涉及本功能）

### 来自代码库分析

- `agents/` 有 10 个文件，`.claude/agents/` 仅 7 个（缺 explore.md、debugger.md、critic.md）
- 所有 agent 的 `model` 字段均为 `inherit` 或不存在
- CLAUDE.md §2.6 已有 Output Conciseness 基础规则，需扩展散文压缩子节
- `forge-build/SKILL.md` §3.2 使用 5 块/1500t 格式，需压缩为 3 块/800t
- README.md 无 opusplan 或 token efficiency 相关内容
- `templates/CLAUDE.md` §2.6 与 `CLAUDE.md` §2.6 当前一致

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#component-1-agent-model-routing` | 为 10 个 Agent 分配匹配任务复杂度的模型别名 |
| `design.md#component-2-prose-compression-rules` | CLAUDE.md §2.6 追加散文压缩规则子节 |
| `design.md#component-3-restatement-summary-compression` | Restatement 从 5 块/1500t 简化为 3 块/800t |
| `design.md#component-4-opusplan-mode-documentation` | 新建 opusplan 使用指南 |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `agents/explore.md` | MODIFY | 添加 `model: haiku` |
| `agents/spec-check.md` | MODIFY | `model: inherit` → `model: sonnet` |
| `agents/quality-check.md` | MODIFY | `model: inherit` → `model: sonnet` |
| `agents/security-check.md` | MODIFY | `model: inherit` → `model: sonnet` |
| `agents/debugger.md` | MODIFY | 添加 `model: inherit`（显式声明） |
| `.claude/agents/explore.md` | CREATE | 从 agents/ 复制（含 model: haiku） |
| `.claude/agents/debugger.md` | CREATE | 从 agents/ 复制（含 model: inherit） |
| `.claude/agents/critic.md` | CREATE | 从 agents/ 复制 |
| `.claude/agents/spec-check.md` | MODIFY | `model: inherit` → `model: sonnet` |
| `.claude/agents/quality-check.md` | MODIFY | `model: inherit` → `model: sonnet` |
| `.claude/agents/security-check.md` | MODIFY | `model: inherit` → `model: sonnet` |
| `CLAUDE.md` | MODIFY | §2.6 追加散文压缩规则子节 |
| `templates/CLAUDE.md` | MODIFY | §2.6 追加散文压缩规则子节（与 CLAUDE.md 同步） |
| `skills/forge-build/SKILL.md` | MODIFY | §3.2 Restatement 格式从 5 块/1500t 更新为 3 块/800t |
| `docs/opusplan-guide.md` | CREATE | opusplan 模式使用指南 |
| `README.md` | MODIFY | 添加 opusplan 指南链接 |

## Task Breakdown

### Task 1: Agent 级模型路由 — explore.md
- **Goal**: 为 explore Agent 设置 `model: haiku`，降低搜索任务的 token 成本
- **File**: `agents/explore.md`
- **Design Reference**: `design.md#component-1-agent-model-routing` — Explore_Agent 使用 haiku，仅执行搜索/grep
- **Depends On**: (none)
- **Verify**: `grep -c "model: haiku" agents/explore.md`
- **Commit**: `feat(agents): set explore agent model to haiku`

### Task 2: Agent 级模型路由 — review agents
- **Goal**: 将 spec-check、quality-check、security-check 的 model 从 inherit 改为 sonnet
- **Files**: `agents/spec-check.md`, `agents/quality-check.md`, `agents/security-check.md`
- **Design Reference**: `design.md#component-1-agent-model-routing` — Review_Agent 使用 sonnet，需中等推理
- **Depends On**: (none)
- **Verify**: `grep "model:" agents/spec-check.md agents/quality-check.md agents/security-check.md`
- **Commit**: `feat(agents): set review agents model to sonnet`

### Task 3: Agent 级模型路由 — debugger 显式声明
- **Goal**: 为 debugger.md 添加显式 `model: inherit` 字段
- **File**: `agents/debugger.md`
- **Design Reference**: `design.md#component-1-agent-model-routing` — debugger 需要 inherit（强推理）
- **Depends On**: (none)
- **Verify**: `grep "model:" agents/debugger.md`
- **Commit**: `feat(agents): add explicit model inherit to debugger agent`

### Task 4: Agent 级模型路由 — 同步到 .claude/agents/
- **Goal**: 将所有 agent 文件同步到 .claude/agents/，包括 3 个缺失文件和 3 个 model 变更
- **Files**: `.claude/agents/explore.md` (CREATE), `.claude/agents/debugger.md` (CREATE), `.claude/agents/critic.md` (CREATE), `.claude/agents/spec-check.md` (MODIFY), `.claude/agents/quality-check.md` (MODIFY), `.claude/agents/security-check.md` (MODIFY)
- **Design Reference**: `design.md#component-1-agent-model-routing` — 双目录同步，frontmatter 一致
- **Depends On**: Task 1, Task 2, Task 3
- **Verify**: `diff <(grep "model:" agents/*.md) <(cd .claude/agents && grep "model:" *.md)`
- **Commit**: `feat(agents): sync agent files to .claude/agents/ with model routing`

### Task 5: 验证 Agent 模型路由
- **Goal**: 验证所有 10 个 agent 的 model 字段符合路由策略，两目录一致，无具体模型名
- **Design Reference**: `design.md#component-1-agent-model-routing` — 路由策略表
- **Depends On**: Task 4
- **Verify**: `grep "model:" agents/*.md .claude/agents/*.md | grep -v -E "(haiku|sonnet|inherit)"` (应为空)
- **Commit**: (验证任务，无提交)

### Task 6: 散文压缩规则 — CLAUDE.md §2.6
- **Goal**: 在 CLAUDE.md §2.6 追加散文压缩规则子节（词汇压缩、行为规则、豁免清单、安全阀）
- **File**: `CLAUDE.md`
- **Design Reference**: `design.md#component-2-prose-compression-rules` — 词汇压缩 + 行为规则 + 豁免清单 + 安全阀
- **Depends On**: (none)
- **Verify**: `grep -c "省略冠词" CLAUDE.md && grep -c "Structured_Output" CLAUDE.md`
- **Commit**: `feat(claude-md): add prose compression rules to §2.6`

### Task 7: 散文压缩规则 — templates/CLAUDE.md §2.6 同步
- **Goal**: 将 §2.6 散文压缩规则同步到 templates/CLAUDE.md，保持模板变量
- **File**: `templates/CLAUDE.md`
- **Design Reference**: `design.md#component-2-prose-compression-rules` — 模板同步
- **Depends On**: Task 6
- **Verify**: `diff <(sed -n '/### 2.6/,/### 2.7/p' CLAUDE.md) <(sed -n '/### 2.6/,/### 2.7/p' templates/CLAUDE.md)`
- **Commit**: `feat(templates): sync prose compression rules to template CLAUDE.md`

### Task 8: Restatement 摘要压缩 — forge-build SKILL
- **Goal**: 将 §3.2 的 5 块/1500t 格式替换为 3 块/800t 格式
- **File**: `skills/forge-build/SKILL.md`
- **Design Reference**: `design.md#component-3-restatement-summary-compression` — 3 块格式 + 800t 预算
- **Depends On**: (none)
- **Verify**: `grep -c "800" skills/forge-build/SKILL.md && grep -c "1,500" skills/forge-build/SKILL.md` (前者 >0, 后者 =0)
- **Commit**: `feat(skill): compress restatement summary from 5-block/1500t to 3-block/800t`

### Task 9: opusplan 模式文档
- **Goal**: 创建 docs/opusplan-guide.md 并在 README.md 添加引用链接
- **Files**: `docs/opusplan-guide.md` (CREATE), `README.md` (MODIFY)
- **Design Reference**: `design.md#component-4-opusplan-mode-documentation` — 工作原理 + 启用方法 + 成本节省 + 互补关系
- **Depends On**: (none)
- **Verify**: `grep -c "opusplan" docs/opusplan-guide.md README.md`
- **Commit**: `docs: add opusplan mode guide`

### Task 10: 最终验证
- **Goal**: 运行 `npm run check` 确认无回归，验证 4 个需求全部覆盖
- **Depends On**: Task 5, Task 7, Task 8, Task 9
- **Verify**: `npm run check`
- **Commit**: (验证任务，无提交)

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| Req 1 (Agent 级模型路由) | Task 1, 2, 3, 4, 5 |
| Req 2 (散文压缩规则) | Task 6, 7 |
| Req 3 (Restatement 压缩) | Task 8 |
| Req 4 (opusplan 推荐) | Task 9 |

## Dependency Graph

```
Task 1 ──┐
Task 2 ──┼── Task 4 ── Task 5 ──┐
Task 3 ──┘                       │
Task 6 ── Task 7 ────────────────┼── Task 10
Task 8 ──────────────────────────┘
Task 9 ──────────────────────────┘
```

## Notes

- 所有变更为文档/配置修改，无新代码，PBT 不适用
- Agent 文件双目录同步是关键约束
- `.claude/agents/` 当前缺 3 个文件（explore, debugger, critic）
