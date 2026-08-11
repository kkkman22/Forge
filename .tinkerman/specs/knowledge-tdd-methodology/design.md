---
feature: knowledge-tdd-methodology
layout: design
created: 2026-06-04
---

# Design Document: Knowledge TDD Methodology

## Overview

将 evolved-rules 的生成流程从"统计阈值触发"改为 TDD 驱动（先验证问题存在再写规则），并为 skill/instructions 变更增加验证步骤。修改 `skills/forge/lib/learn/instructions.md` 和 `.tinkerman/knowledge/evolved-rules.md` 格式模板。

## Architecture

无架构变更。仅修改 Markdown 文件。

## Components and Interfaces

### 1. learn/instructions.md Evolved-Rules TDD 流程

替换/增强现有的 evolved-rules 生成逻辑：

```markdown
## Evolved-Rules 生成（TDD 驱动）

当 knowledge entries 达到阈值（≥3 次同类错误）时，执行以下流程：

### Phase 1: RED — 验证问题存在

1. 从 knowledge entries 中提取错误模式
2. 构造一个**最小复现场景**（<200 词 prompt），描述一个任务：
   - 正确执行需要遵守目标规则
   - 但 prompt 中不提及该规则
3. 在**不加载**目标 evolved-rule 的条件下，派发 subagent 执行
4. 记录 baseline 行为：是否违反？借口是什么？哪些压力条件触发？

如果 subagent 没有违反 → 问题不存在或已被其他规则覆盖，**不生成** evolved rule。

### Phase 2: GREEN — 写最小规则

基于 Phase 1 的具体违反行为写最小化 evolved rule。Rule 必须直接反驳 Phase 1 中记录的借口。

### Phase 3: REFACTOR — 关闭漏洞

1. 在**加载**新 evolved-rule 的条件下，重跑 Phase 1 场景
2. 检查 subagent 是否遵守规则
3. 找到新逃避方式 → 更新 rule，追加反驳
4. 连续 2 次运行无违反 → rule 上线

### 铁律

没有完成 Phase 1（RED）验证 → 不写 evolved rule。
没有完成 Phase 3（REFACTOR）验证 → 不上线 evolved rule。
```

### 2. learn/instructions.md Skill/Instructions 变更验证

```markdown
## Skill/Instructions 变更验证

修改任何 `skills/forge/lib/*/instructions.md` 或 `.claude/agents/*.md` 后，必须执行：

1. **识别变更意图**：这次修改想让 agent 做什么不同的事？
2. **构造验证场景**：写一个简短 prompt，让 agent 执行需要新行为的任务
3. **运行 baseline**（可选）：如果修改是新增行为，先不带修改运行，记录 baseline
4. **运行验证**：带修改运行，检查 agent 行为是否如预期改变
5. **记录结果**：在 `.tinkerman/knowledge/skill-feedback.md` 中记录

**豁免条件**（commit message 注明 `[skip-skill-verify]`）：
- 纯格式/排版修改
- 链接/路径修复
- typo 修正
- 删除过时内容
```

### 3. evolved-rules.md 格式模板扩展

在顶部注释块中追加两个字段：

```markdown
<!-- Rule format:
### R{N}: {title}

**Content**: {concise rule statement}
**Prevents**: {specific error this rule prevents}
**Source**: {knowledge file and entry that triggered this rule}
**Added**: {YYYY-MM-DD}
**Confidence**: {0.3-0.9}
**Last_triggered**: {YYYY-MM-DD}
**Verified_via**: {TDD-phase-1: <scenario-desc> | threshold-only}  ← 新增
**Baseline_violation**: {subagent RED 阶段违反摘要 | N/A}  ← 新增
**Infra_Ref**: {path(s) to infrastructure that enforces this rule, if any}
-->
```

## Testing Strategy

- 人工审查：确认 TDD 流程不与现有 learn 五维度提取逻辑冲突
- 确认现有 13 条 rules 的格式未被修改（仅模板注释块扩展）
- `npm run check`：全量测试通过
