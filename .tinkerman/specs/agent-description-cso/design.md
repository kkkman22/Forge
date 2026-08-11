---
feature: agent-description-cso
layout: design
created: 2026-06-04
---

# Design Document: Agent Description CSO

## Overview

将所有 agent/skill 的 `description` 字段从混合格式（角色+功能+触发条件）统一为纯触发条件格式（"Use when..."），基于 superpowers 项目的 Claude Search Optimization 发现。纯 Markdown frontmatter 改动。

## Architecture

无架构变更。仅修改 `.claude/agents/*.md` 和 `skills/forge/lib/*/instructions.md` 的 YAML frontmatter。

## Components and Interfaces

### 1. Agent Definition 改写

每个 `.claude/agents/*.md` 文件的 frontmatter `description` 字段替换为新值。以 `spec-check.md` 为例：

```yaml
# Before
description: Spec 对齐评审者。在 /forge review 的 Agent Team 中提供 Layer 1 评审，逐条对照规格检查实现完整性和 scope creep。

# After
description: Use in /forge review Layer 1, when verifying implementation matches locked spec
```

完整替换映射见 requirements.md Requirement 2 的表格。

### 2. Skill Instructions 改写

每个 `skills/forge/lib/*/instructions.md` 的 frontmatter `description` 字段替换。以 `review/instructions.md` 为例：

```yaml
# Before
description: "Review build output through parallel subagents covering spec alignment, code quality, and security with P0/P1 ship-blocking severity classification. Use when running `/forge review`, build completes, or a multi-perspective code quality gate is needed before ship."

# After
description: "Use when running /forge review, build completes, or code changes need quality gate before ship"
```

### 3. CSO Description Gate 规则文件

新增 `.claude/rules/cso-description-gate.md`：

```markdown
# CSO Description Gate

所有新增或修改的 agent definition（`.claude/agents/*.md`）和 skill instructions（`skills/forge/lib/*/instructions.md`），其 `description` 字段必须：

1. 以 "Use when" 开头
2. 仅包含触发条件（在什么场景下使用）
3. 不包含角色描述、工作流总结或能力清单

**Why**: LLM 会直接跟随 description 的摘要而不读取完整内容（superpowers CSO 发现）。description 总结流程 = LLM 跳过流程。
```

## Testing Strategy

- 人工审查：确认所有 description 以 "Use when" 开头，不含角色/流程/能力描述
- `grep -r '^description:' .claude/agents/ skills/forge/lib/` 验证格式一致性
- `npm run check` 全量测试通过（本 spec 无代码变更，预期零影响）
