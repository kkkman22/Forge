---
status: completed
feature: skill-document-optimization
layout: requirements
created: 2026-04-29
tier: standard
---
# Requirements Document

## Introduction

Forge 的 16 个 SKILL 文档总计约 320K 字符（~213K tokens），其中最大的 forge-build（58K 字符，~39K tokens）和 forge-learn（41K 字符，~27K tokens）各自就占据了 Claude 200K 上下文窗口的 14-20%。AI 在加载 skill 时已经明确反馈"这是一个很长的 SKILL"，说明文档体量已经影响到执行质量。

客观分析发现三类可压缩内容：
1. **冗余输出模板**（~40%）：每种边界情况都有完整的格式化输出示例，AI 看一个即可推导变体
2. **重复规则声明**（~25%）：CLAUDE.md 已声明的规则在 skill 中被完整展开重述
3. **过度防御性指导**（~35%）：失败模式用三段式（错误行为/为什么错/正确做法）展开，可压缩为表格

本 spec 的目标是将 SKILL 文档总体积压缩至当前的 40-50%，同时不丢失任何关键行为指令，提升 AI 的执行遵从度和上下文利用效率。

## Glossary

- **SKILL_Document**: 位于 `skills/<command>/SKILL.md` 的 markdown 文件，定义某个 forge 子命令的完整行为规范。
- **Constitution**: `CLAUDE.md` 文件，定义所有 Agent 必须遵守的全局规则（TDD 铁律、验证纪律、评审纪律等）。
- **Output_Template**: SKILL 文档中用于展示预期输出格式的 markdown 代码块示例。
- **Failure_Mode_Section**: SKILL 文档末尾的"已知 AI 失败模式"章节，列举常见错误及纠正方法。
- **Rule_Duplication**: 同一条规则在 Constitution 和 SKILL 文档中被完整重述的现象。
- **Canonical_Example**: 每种输出格式保留的唯一完整示例，其余变体用一句话描述差异。
- **Reference_Directive**: 用 `→ 遵循 CLAUDE.md §X.Y` 格式引用 Constitution 中已有规则，替代完整重述。
- **Contract_Test**: 位于 `test/contract.test.ts` 和 `test/contract.skills.test.ts` 中的测试，验证 SKILL 文档包含必要的关键章节和关键词。

## Requirements

### Requirement 1: 输出模板去冗余 — 每种格式仅保留一个 Canonical Example

**User Story:** 作为使用 Forge 的开发者，我希望 SKILL 文档中每种输出格式只保留一个完整示例，其余变体用简短描述替代，以减少 SKILL 文档的 token 消耗。

#### Acceptance Criteria

1. GIVEN forge-build SKILL 文档的前置检查拒绝输出（§2），WHEN 优化完成后，THEN 仅保留一个完整的拒绝输出示例，其余变体（Spec 未锁定、Plan 未批准、目录不完整、多项不通过）用一行描述差异点，不再包含完整代码块。
2. GIVEN forge-build SKILL 文档的分支切换输出（§2.1），WHEN 优化完成后，THEN 仅保留一个完整的分支切换示例，其余变体（分支创建、分支冲突、切换失败）用一行描述差异点。
3. GIVEN forge-review SKILL 文档的评审结果输出（§8, §12），WHEN 优化完成后，THEN 仅保留一个通过和一个未通过的完整示例，删除重复的阻断输出。
4. GIVEN forge-learn SKILL 文档的示例章节（§11），WHEN 优化完成后，THEN 仅保留一个完整的知识沉淀示例，其余示例（高重叠合并、知识库维护）用简短描述替代。
5. FOR ALL 16 个 SKILL 文档，WHEN 优化完成后，THEN 每种独立的输出格式类型最多包含一个完整代码块示例。

### Requirement 2: 消除 Constitution 与 SKILL 之间的规则重复

**User Story:** 作为使用 Forge 的开发者，我希望 SKILL 文档通过引用 CLAUDE.md 中已有的规则而非重述，以减少重复内容并确保规则的单一来源。

#### Acceptance Criteria

1. GIVEN forge-build SKILL 文档的 TDD 铁律章节（§4），WHEN 优化完成后，THEN 该章节被替换为 Reference_Directive（`→ 遵循 CLAUDE.md §2.1 TDD 强制`），仅保留 SKILL 特有的补充内容（如 Subagent 内 TDD 的具体执行方式）。
2. GIVEN forge-build SKILL 文档的执行纪律章节（§6），WHEN 优化完成后，THEN 与 CLAUDE.md §2.2-§2.4 重复的条目被替换为 Reference_Directive，仅保留 build 阶段特有的纪律（如反漂移护栏、状态文件保护）。
3. GIVEN forge-build SKILL 文档的 P5 证据链格式（§6.3），WHEN 优化完成后，THEN 被替换为 Reference_Directive（`→ 遵循 CLAUDE.md §2.3 验证铁律`），仅保留一个 build 阶段的具体示例。
4. GIVEN forge-review SKILL 文档的严重度分级（§4），WHEN 优化完成后，THEN 被替换为 Reference_Directive（`→ 遵循 CLAUDE.md §3.3 P0/P1 必须修复`），仅保留评审阶段特有的分级原则。
5. FOR ALL 16 个 SKILL 文档，WHEN 优化完成后，THEN 不存在与 CLAUDE.md 完全重复的规则段落（超过 3 行的逐字重复）。

### Requirement 3: 失败模式章节压缩为简表

**User Story:** 作为使用 Forge 的开发者，我希望"已知 AI 失败模式"章节从三段式展开压缩为表格格式，以在保留关键信息的同时大幅减少行数。

#### Acceptance Criteria

1. GIVEN forge-build SKILL 文档的已知 AI 失败模式章节（7 个模式），WHEN 优化完成后，THEN 该章节使用表格格式（列：失败模式 | 错误行为 | 正确做法），每个模式占一行，总行数不超过 20 行（含表头）。
2. GIVEN forge-review SKILL 文档的已知 AI 失败模式章节（4 个模式），WHEN 优化完成后，THEN 该章节使用相同的表格格式，总行数不超过 10 行。
3. FOR ALL 包含失败模式章节的 SKILL 文档，WHEN 优化完成后，THEN 每个失败模式的描述不超过 2 行（表格单元格内），且保留了原始的核心纠正指令。

### Requirement 4: Restatement 机制描述去重

**User Story:** 作为使用 Forge 的开发者，我希望 Restatement Checkpoint 机制只在一处完整定义，其他引用处使用简短引用，以消除 forge-build 中最大的单一重复块。

#### Acceptance Criteria

1. GIVEN forge-build SKILL 文档中 Restatement 机制在 §3.2（标准路径）和 §3.3（全量路径）中的重复描述，WHEN 优化完成后，THEN Restatement 机制仅在 §3.2 中完整定义一次，§3.3 通过引用（`→ Restatement 机制与 §3.2 相同`）替代完整重述。
2. GIVEN Restatement 摘要格式在 forge-build 中的定义，WHEN 优化完成后，THEN 5 区块摘要格式仅出现一次，异常触发的额外区块作为补充紧跟其后，不再在全量路径中重复。

### Requirement 5: 流程图与边界情况精简

**User Story:** 作为使用 Forge 的开发者，我希望 SKILL 文档中的 ASCII 流程图和边界情况章节被精简，以减少对 AI 执行无实质帮助的视觉内容。

#### Acceptance Criteria

1. GIVEN forge-build SKILL 文档的完整流程图（§8，约 60 行 ASCII art），WHEN 优化完成后，THEN 流程图被替换为不超过 15 行的简化步骤列表（编号列表格式）。
2. GIVEN forge-build SKILL 文档的边界情况章节（§9，6 个场景），WHEN 优化完成后，THEN 边界情况被合并为一个表格（列：场景 | 处理方式），每个场景占一行，删除重复的输出示例（已在 §2 中有 Canonical Example）。
3. GIVEN forge-learn SKILL 文档的流程图（§9，约 40 行 ASCII art），WHEN 优化完成后，THEN 流程图被替换为不超过 15 行的简化步骤列表。
4. GIVEN forge-review SKILL 文档的流程图（§10，约 30 行 ASCII art），WHEN 优化完成后，THEN 流程图被替换为不超过 10 行的简化步骤列表。

### Requirement 6: forge-learn 规则蒸馏章节精简

**User Story:** 作为使用 Forge 的开发者，我希望 forge-learn 中的 Error-Prevention Rule Distillation 章节（§6.5，约 300 行）被精简，以在保留算法核心的同时减少过度详细的子章节。

#### Acceptance Criteria

1. GIVEN forge-learn SKILL 文档的规则蒸馏章节（§6.5.1-§6.5.10），WHEN 优化完成后，THEN 蒸馏算法的伪代码保留，但 §6.5.3（转换过程）、§6.5.6（冲突检测）、§6.5.7（容量管理）、§6.5.8（陈旧检测）的详细输出示例被压缩为每个子章节不超过 5 行的规则描述。
2. GIVEN forge-learn SKILL 文档的提案展示格式（§6.5.9），WHEN 优化完成后，THEN 仅保留一个提案示例，审批规则压缩为 3 行以内。
3. GIVEN forge-learn SKILL 文档的写入与变更日志格式（§6.5.10），WHEN 优化完成后，THEN 仅保留一个 changelog 条目示例，删除退役写入的重复示例。

### Requirement 7: 体积目标与验证

**User Story:** 作为使用 Forge 的开发者，我希望优化后的 SKILL 文档总体积达到可量化的压缩目标，并通过自动化测试验证。

#### Acceptance Criteria

1. WHEN 所有优化完成后，THEN 16 个 SKILL 文档的总字符数不超过 192,000（当前 320K 的 60%）。
2. WHEN 所有优化完成后，THEN forge-build SKILL 文档的字符数不超过 29,000（当前 58K 的 50%）。
3. WHEN 所有优化完成后，THEN forge-learn SKILL 文档的字符数不超过 21,000（当前 41K 的 50%）。
4. WHEN 所有优化完成后，THEN forge-review SKILL 文档的字符数不超过 17,000（当前 28K 的 60%）。
5. WHEN 所有优化完成后，THEN forge-plan SKILL 文档的字符数不超过 19,000（当前 32K 的 60%）。
6. WHEN 所有优化完成后，THEN 现有的 `test/contract.test.ts` 和 `test/contract.skills.test.ts` 中的所有 contract test 仍然通过，确认关键章节和关键词未被误删。

### Requirement 8: 行为等价性保证

**User Story:** 作为使用 Forge 的开发者，我希望优化后的 SKILL 文档在行为指令上与优化前完全等价，不丢失任何关键的执行规则。

#### Acceptance Criteria

1. FOR ALL 16 个 SKILL 文档，WHEN 优化完成后，THEN 每个 SKILL 的 YAML frontmatter（name, description, disable-model-invocation）保持不变。
2. FOR ALL 16 个 SKILL 文档，WHEN 优化完成后，THEN 每个 SKILL 的核心章节标题（概述、前置检查、执行流程等）保持存在，允许内容精简但不允许删除章节。
3. GIVEN forge-build SKILL 文档，WHEN 优化完成后，THEN 以下关键行为指令仍然存在（可以是引用形式）：TDD RED→GREEN→REFACTOR 顺序、Closure-First 探针 2P+1V、原子提交、P5 证据链、三次换路、Subagent 状态处理协议（DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED）。
4. GIVEN forge-review SKILL 文档，WHEN 优化完成后，THEN 以下关键行为指令仍然存在：三层评审结构、置信度过滤阈值 0.8、去重规则（±3 行容差）、跨评审者一致性验证（+0.10）、报告质量门 6 项检查。
5. GIVEN forge-learn SKILL 文档，WHEN 优化完成后，THEN 以下关键行为指令仍然存在：五维度知识提取、执行质量分析四维度、知识库维护不变量（文档数 ≤ 上限、无低置信度模式）、知识回流机制、规则蒸馏算法核心逻辑。
