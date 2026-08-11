---
feature: skill-composability
layout: design
created: 2026-05-01
---

# Design Document: Skill Composability

## Overview

将 Forge 的大型 SKILL.md 文件拆分为主体 + references/ 子文件，实现跨 SKILL 引用、token 优化和 SKILL-TypeScript 解耦。

## Architecture

### 拆分后的目录结构

```
skills/
  forge-build/
    SKILL.md                          # 主体 ≤200 行（编排逻辑）
    references/
      tdd-rules.md                    # TDD 铁律 + 简洁性检查
      closure-probes.md               # Closure-First 探针详细规则
      context-budget.md               # 硬 token 限制表 + 生命周期分类
      anti-drift.md                   # 反漂移守卫 + 反射触发器
      change-summary.md               # 三段式变更摘要格式
      dependency-discipline.md        # 依赖纪律检查清单
      function-contracts.md           # 函数调用签名

  forge-review/
    SKILL.md                          # 主体 ≤150 行
    references/
      confidence-filtering.md         # 置信度评分 + 过滤规则
      dedup-pipeline.md               # 指纹去重 + 跨评审者一致性
      quality-gate.md                 # 6 项报告质量自检
      function-contracts.md           # 函数调用签名

  forge-plan/
    SKILL.md                          # 主体 ≤150 行
    references/
      atomic-task-format.md           # 完整任务格式 + TDD 步骤示例
      lightweight-task-format.md      # 轻量任务格式 + 设计引用
      prohibited-content.md           # 占位符扫描规则
      function-contracts.md           # 函数调用签名
```

### 引用方式

主体中使用指针引用：

```markdown
## 4. TDD Iron Rules

→ 遵循 CLAUDE.md §2.1 TDD Enforcement (RED → GREEN → REFACTOR)

**详细规则**：→ 详见 references/tdd-rules.md

**Build Phase Additions**:
- In-Subagent TDD: 每个 Subagent 独立执行完整 TDD 循环
- ...
```

跨 SKILL 引用：

```markdown
## Phase 4 — Fix Verification

以 TDD 方式实施修复。→ TDD 规则详见 ../forge-build/references/tdd-rules.md
```

### 拆分原则

| 留在主体 | 拆到 references/ |
|---------|-----------------|
| Overview + 核心原则 | 详细规则和检查清单 |
| 执行流程（高层） | 格式模板和示例 |
| 门禁检查逻辑 | 函数调用签名 |
| 阶段转换规则 | 反漂移守卫详细表 |
| 边界情况处理 | 上下文预算管理详细表 |
| Known AI Failure Patterns | Closure-First 探针详细步骤 |
| Common Rationalizations | — |
| Not For | — |

## Components and Interfaces

### forge-build 主体结构（拆分后）

```markdown
---
name: forge-build
description: "..."
---

# /forge build — 执行引擎

## 1. Overview
（保留完整）

**Not For**：（保留）

## 2. Pre-build Checks
（保留完整——门禁逻辑是每次都需要的）
→ 函数签名详见 references/function-contracts.md

## 3. Three Execution Paths
### 3.1 Lightweight Path
（保留高层描述）

### 3.2 Standard Path
（保留流程描述，Restatement 机制保留）
→ Closure-First 探针详见 references/closure-probes.md
→ Subagent 指令构造详见 references/subagent-instructions.md

### 3.3 Full Path
（保留高层描述）

## 4. TDD Iron Rules
（保留摘要）
→ 详细规则详见 references/tdd-rules.md

## 5. Failure Handling
（保留完整——失败处理是关键路径）

## 6. Execution Discipline
（保留摘要 + 引用）
→ 反漂移守卫详见 references/anti-drift.md
→ 变更摘要格式详见 references/change-summary.md
→ 依赖纪律详见 references/dependency-discipline.md

## 7. Status Updates
（保留完整）

## 8. Execution Flow
（保留完整）

## 9. Edge Cases
（保留完整）

## Context Budget Management
→ 详见 references/context-budget.md

## Known AI Failure Patterns
（保留完整）

## Common Rationalizations
（保留完整）
```

## Testing Strategy

### 合约测试更新

contract.test.ts 需要更新：
- 验证每个 SKILL 目录下的 references/ 文件存在性
- 验证主体中的 `→ 详见 references/` 指针指向的文件确实存在
- 验证跨 SKILL 引用（`../forge-build/references/`）指向的文件确实存在

### 人工验证

- 拆分前后 SKILL 的行为完全一致（通过人工对照）
- 主体行数符合目标（build ≤200, review ≤150, plan ≤150）
- 所有 references 文件内容完整，无遗漏

### 回归测试

- `npm run check` 全量通过
