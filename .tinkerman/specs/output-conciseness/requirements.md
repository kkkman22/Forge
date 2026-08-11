---
status: completed
feature: output-conciseness
layout: requirements
created: 2026-04-29
tier: standard
---
# Requirements Document

## Introduction

Forge 项目在 dogfooding 过程中发现，AI 在 `/forge build` 阶段执行代码编辑时，会输出大量冗长的解释性文字（如"现在添加 --log-format 和 --log-level 的验证"、"现在将 logSinkConfig 传入 SdkDriverConfig"），严重影响使用体验。

经调研确认，这是 Claude Code 的默认行为，而非 Forge SKILL 指示的。Forge 现有的 CLAUDE.md 模板和 16 个 SKILL.md 中均无输出风格约束。本功能通过在 `templates/CLAUDE.md` 模板和项目 `CLAUDE.md` 中添加精准的输出简洁性规则，约束 AI 在代码编辑场景下的输出行为，同时保留 Forge 流程所需的结构化输出（TDD 标记、探针结果、Restatement 摘要等）。

## Glossary

- **Output_Conciseness_Rules**: 定义在 CLAUDE.md §2.6 中的输出简洁性约束规则集，控制 AI 在不同场景下的输出详细程度
- **Narration**: AI 在执行代码编辑操作时输出的逐步解释性文字，如"现在我要修改 X 文件"、"让我添加 Y 字段"、"接下来将 Z 传入 W"
- **Structured_Output**: Forge 流程中定义的结构化输出格式，包括 TDD 阶段标记（🔴 RED / 🟢 GREEN / 🔵 REFACTOR）、Closure-First 探针结果、Restatement 摘要、评审报告、P5 证据链等
- **Decision_Point**: 执行过程中需要说明理由的关键节点，包括设计选择、意外情况处理、计划调整、方向变更等
- **CLAUDE_MD_Template**: 位于 `templates/CLAUDE.md` 的项目宪法模板文件，由 `forge init` 用于生成项目级 CLAUDE.md
- **Project_CLAUDE_MD**: 位于项目根目录的 `CLAUDE.md` 文件，是 Claude Code 在该项目中的行为准则
- **Build_Phase**: `/forge build` 命令执行的代码实现阶段，是 Narration 问题最严重的阶段
- **Forge_SKILL**: 位于 `skills/` 目录下的各 SKILL.md 文件，定义 Forge 各命令的执行流程和行为规范

## Requirements

### Requirement 1: CLAUDE.md 模板添加输出简洁性章节

**User Story:** As a Forge 维护者, I want to add output conciseness rules to the CLAUDE.md template, so that all new projects initialized with `forge init` automatically inherit output style constraints.

#### Acceptance Criteria

1. THE CLAUDE_MD_Template SHALL contain a §2.6 section titled "输出简洁性" within the "执行纪律" chapter
2. THE §2.6 section SHALL define a "禁止的输出模式" list that explicitly bans Narration patterns
3. WHEN the AI is performing code edits (file creation, modification, deletion), THE Output_Conciseness_Rules SHALL require the AI to execute silently without Narration
4. WHEN the AI encounters a Decision_Point (design choice, unexpected situation, plan adjustment, direction change), THE Output_Conciseness_Rules SHALL permit the AI to output a brief explanation of the reasoning
5. THE §2.6 section SHALL define a "保留的输出" list that explicitly preserves all Structured_Output formats defined in Forge SKILLs
6. THE §2.6 section SHALL place the conciseness constraint at lower priority than Forge SKILL-defined output formats, so that SKILL-mandated outputs are never suppressed

### Requirement 2: 禁止的 Narration 模式定义

**User Story:** As a Forge 用户, I want clearly defined forbidden narration patterns, so that the AI stops outputting verbose step-by-step commentary during code edits.

#### Acceptance Criteria

1. THE Output_Conciseness_Rules SHALL prohibit the following Narration patterns during code edit operations:
   - "现在我要修改 X 文件" / "Now I'll modify X file" 类的操作预告
   - "让我添加 Y 字段" / "Let me add Y field" 类的自我对话
   - "接下来将 Z 传入 W" / "Next, I'll pass Z into W" 类的逐步解说
   - "首先...然后...最后..." / "First...then...finally..." 类的步骤枚举
   - 对即将执行的工具调用的重复描述
2. THE Output_Conciseness_Rules SHALL provide concrete before/after examples showing the difference between verbose and concise output
3. IF the AI detects that it is about to output Narration during a code edit operation, THEN THE AI SHALL suppress the Narration and proceed directly with the edit action

### Requirement 3: 保留的结构化输出定义

**User Story:** As a Forge 用户, I want Forge's structured workflow outputs to remain intact, so that TDD markers, probe results, and restatement summaries continue to function correctly.

#### Acceptance Criteria

1. THE Output_Conciseness_Rules SHALL explicitly preserve the following Structured_Output categories:
   - TDD 阶段标记: 🔴 RED / 🟢 GREEN / 🔵 REFACTOR markers and their associated test run results
   - Closure-First 探针结果: Probe #1, Probe #2, Verify #1 output blocks
   - Restatement 摘要: periodic context refresh summaries with the 5-block format
   - P5 证据链: `[Command] → [Output] → [Claim]` verification format
   - 评审报告: review findings with severity levels (P0/P1/P2/P3)
   - 路由分析: tier suggestion, task type, project phase output
   - 前置检查结果: gate check pass/fail output
   - 进度更新: task completion markers and progress summaries
2. WHEN a Forge_SKILL defines a specific output format (via templates, markers, or structured blocks), THE Output_Conciseness_Rules SHALL NOT suppress that output
3. THE Output_Conciseness_Rules SHALL state that SKILL-defined output formats take precedence over conciseness constraints in case of conflict

### Requirement 4: Decision_Point 输出许可

**User Story:** As a Forge 用户, I want the AI to still explain its reasoning at critical decision points, so that I can understand important choices without being overwhelmed by routine commentary.

#### Acceptance Criteria

1. THE Output_Conciseness_Rules SHALL permit brief explanatory output at the following Decision_Points:
   - 设计选择: when choosing between multiple implementation approaches
   - 意外情况: when encountering unexpected code states, missing files, or failing probes
   - 计划调整: when deviating from the plan or reordering tasks
   - 方向变更: when switching approaches after failures (e.g., three-strikes rule)
   - 阻塞报告: when reporting BLOCKED or NEEDS_CONTEXT status
2. WHEN outputting at a Decision_Point, THE AI SHALL limit the explanation to the reasoning and evidence, without Narration of the subsequent actions
3. THE Output_Conciseness_Rules SHALL provide a concise template for Decision_Point output: "[原因] → [选择] → [依据]"

### Requirement 5: 项目 CLAUDE.md 同步更新

**User Story:** As a Forge 开发者, I want the project-level CLAUDE.md to be updated with the same output conciseness rules, so that the current project immediately benefits from the new constraints.

#### Acceptance Criteria

1. THE Project_CLAUDE_MD SHALL contain the same §2.6 "输出简洁性" section as the CLAUDE_MD_Template, with template variables resolved to project-specific values
2. THE Project_CLAUDE_MD §2.6 content SHALL be semantically identical to the CLAUDE_MD_Template §2.6 content (no project-specific deviations in the rules themselves)
3. WHEN the CLAUDE_MD_Template §2.6 is finalized, THE Project_CLAUDE_MD SHALL be updated in the same implementation cycle

### Requirement 6: forge-build SKILL.md 输出约束引用

**User Story:** As a Forge 维护者, I want the forge-build SKILL.md to reference the output conciseness rules, so that the build phase explicitly reinforces concise output behavior.

#### Acceptance Criteria

1. THE forge-build Forge_SKILL SHALL contain a reference to CLAUDE.md §2.6 Output_Conciseness_Rules in its execution discipline section (§6)
2. THE reference SHALL remind the AI that code edit operations during Build_Phase must follow the conciseness constraints
3. THE forge-build Forge_SKILL SHALL add "逐步解说代码编辑操作" to its "已知 AI 失败模式" section as a new failure mode entry
4. THE new failure mode entry SHALL include: error behavior description, why it's wrong, and correct behavior — following the same format as existing failure mode entries in forge-build SKILL.md
