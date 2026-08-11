---
status: completed
feature: knowledge-tdd-methodology
layout: requirements
created: 2026-06-04
tier: standard
---
# Requirements Document

## Introduction

obra/superpowers 的 `writing-skills/SKILL.md` 将 TDD 直接映射到文档/skill 创作：
- RED = 运行压力场景**不带** skill，记录 baseline 失败行为
- GREEN = 写 skill 解决那些具体失败
- REFACTOR = 关闭新发现的漏洞

Forge 的 evolved-rules（CLAUDE.md §5）有类似思路但更模糊——"Knowledge entries 达阈值时提出"。当前问题：
1. evolved-rules 的生成是"统计阈值触发"，不是"验证失败驱动"
2. 新 skill/instructions 写好后没有验证"agent 行为真的变了"
3. 没有 pressure test——写完就上线

**明确不做的事情**：不修改 evolved-rules 的现有内容（13 条 rule 保持不变）；不修改 TypeScript 代码；不改变 learn 的五维度提取逻辑。

## Requirements

### Requirement 1: Evolved-Rules TDD 生成流程

**User Story:** 作为 Forge 维护者，我希望 evolved-rules 的生成经过"先验证问题存在，再写规则"的 TDD 流程，这样不会生成不需要的规则。

#### Acceptance Criteria

1. `skills/forge/lib/learn/instructions.md` 中 evolved-rules 生成逻辑 SHALL 改为三阶段 TDD 流程。
2. **Phase 1 (RED)** SHALL 要求：从 knowledge entries 提取错误模式 → 构造最小复现场景（<200 词 prompt）→ 在不加载目标 rule 的条件下派发 subagent → 记录 baseline 行为。
3. **Phase 1** SHALL 包含止损机制：如果 subagent 没有违反目标规则 → 问题不存在或已被其他规则覆盖，**不生成** evolved rule。
4. **Phase 2 (GREEN)** SHALL 要求：基于 Phase 1 记录的具体违反行为写最小化 rule → rule 必须直接反驳 Phase 1 中的借口。
5. **Phase 3 (REFACTOR)** SHALL 要求：在加载新 rule 的条件下重跑 Phase 1 场景 → 如果找到新逃避方式则更新 rule → 连续 2 次运行无违反才上线。
6. THE 流程 SHALL 包含铁律："没有完成 Phase 1 验证 → 不写 rule"、"没有完成 Phase 3 验证 → 不上线 rule"。

### Requirement 2: Skill/Instructions 变更验证步骤

**User Story:** 作为 Forge 维护者，我希望修改 skill/instructions 后能验证 agent 行为是否真的变了，这样不会上线无效变更。

#### Acceptance Criteria

1. `skills/forge/lib/learn/instructions.md` SHALL 新增 "Skill/Instructions 变更验证" 章节。
2. THE 章节 SHALL 定义验证步骤：识别变更意图 → 构造验证场景 → 运行 baseline（可选）→ 运行验证 → 记录结果。
3. THE 章节 SHALL 将验证结果记录到 `.forge/knowledge/skill-feedback.md`。
4. THE 章节 SHALL 定义豁免条件：纯格式/排版修改、链接/路径修复、typo 修正、删除过时内容。豁免变更必须在 commit message 中注明 `[skip-skill-verify]`。

### Requirement 3: Evolved-Rules 格式扩展

**User Story:** 作为 Forge 维护者，我希望 evolved-rule 的格式中能区分"经过 TDD 验证"和"仅阈值触发"的规则。

#### Acceptance Criteria

1. `.forge/knowledge/evolved-rules.md` 的 rule 格式 SHALL 追加两个可选字段：`Verified_via` 和 `Baseline_violation`。
2. `Verified_via` SHALL 取值为 `TDD-phase-1`（附具体 scenario 描述）或 `threshold-only`。
3. `Baseline_violation` SHALL 记录 subagent 在 RED 阶段的违反行为摘要，或 `N/A`。
4. WHEN `Verified_via: TDD-phase-1` THEN `Confidence` SHALL 自动 ≥ 0.8。
5. WHEN `Verified_via: threshold-only` THEN `Confidence` SHALL ≤ 0.6。
6. 现有 13 条 rules SHALL 保持 `Verified_via: threshold-only`（不修改现有 rule）。

### Requirement 4: 不修改现有 Evolved-Rules

**User Story:** 作为 Forge 维护者，我希望本 spec 不修改已有的 13 条 evolved-rules 内容。

#### Acceptance Criteria

1. NO existing rule（R1-R13）SHALL be modified in content, severity, or confidence.
2. ONLY the rule format template（顶部的注释块）SHALL be extended with the two new optional fields.
