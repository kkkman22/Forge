# Requirements Document

## Introduction

本特性修复 Forge 在 context compaction（Claude Code 上下文自动压缩）恢复后遗漏当前阶段 SKILL.md 步骤的问题。根因：Forge 恢复机制仅覆盖 build 阶段（Restatement + Subagent 派发），不覆盖 review/test/ship/learn；且没有任何规则要求恢复后重读当前阶段 SKILL.md，导致模型凭 conversation summary 摘要执行，遗漏关键步骤（如 ship 阶段的 AskUserQuestion 合并选项提示）。

问题陈述：
1. `forge-resume` SKILL.md 的恢复逻辑只管 build 阶段——§2 "恢复后的首次 Restatement" 限定 "如果用户确认继续 build"，不覆盖其他阶段。
2. `forge-resume` 的五问恢复只读 status/plan/progress/findings，不读当前阶段的 SKILL.md。
3. Context compaction 是 Claude Code 内部行为，不产生 interim 文件，不触发 `exhaustion_pending`，因此 forge-resume 的 Auto-triggered Resume（§4.1）不会被触发。恢复完全依赖 conversation summary，不是 Forge 的恢复机制。
4. 没有任何 Forge 规则要求"恢复后必须重读当前阶段 SKILL.md"。

价值来源：在当前阶段 SKILL.md 的完整步骤上下文中执行后续操作，而不是凭摘要猜测。

业务价值：
1. 消除 compaction 恢复后遗漏 SKILL.md 步骤的系统性风险。
2. 将"靠模型自觉重读"改为"Forge 机制保证重读"。
3. 覆盖所有阶段（不仅限于 build），让 forge-resume 成为通用恢复机制。

关键约束：
- **Zero-behavior-regression**：正常流程（无 compaction）下行为不变。仅 compaction 恢复路径增加 SKILL.md 重读步骤。
- **Zero-SKILL-contract-change**：不修改既有 SKILL 的外部契约、触发方式或输出格式。
- **Zero-new-dependency**：不新增运行时依赖。

## Glossary

- **Context_Compaction**: Claude Code 在上下文接近限制时自动压缩历史对话的行为。压缩后模型收到 conversation summary 而非完整历史。不产生 Forge 层面的 interim 文件。
- **Phase_Resumption**: 上下文压缩（或会话边界）后恢复到当前阶段继续执行的过程。当前仅 build 阶段有正式恢复机制。
- **SKILL_Reload_Rule**: 本 spec 新增规则，要求任何恢复路径（compaction 或 session boundary）在继续执行前必须重读当前阶段的 SKILL.md 完整内容。

## Requirements

### Requirement 1: forge-resume 覆盖所有阶段

**User Story:** As a Forge user resuming after context compaction, I want the resume mechanism to work for all phases (not just build), so that ship/test/review/learn phases also recover correctly.

#### Acceptance Criteria

1. THE `skills/forge-resume/SKILL.md` §2 "恢复后的首次 Restatement" SHALL 扩展为适用于所有阶段，不仅限于 build。文本 SHALL 改为："恢复上下文后，在执行任何操作之前，立即读取当前阶段对应的 SKILL.md 完整内容。"
2. THE §2 新增一段 **SKILL Reload Step**，定义恢复后的第一步操作：
   ```
   ### SKILL Reload（恢复后必读步骤）

   恢复上下文后，在执行任何阶段操作之前，必须：
   1. 从 status.md 读取当前 phase 字段
   2. 读取 skills/forge-{phase}/SKILL.md 完整内容
   3. 按 SKILL.md 定义的步骤顺序执行，不得跳步
   ```
3. THE §4 "自动定位" SHALL 在定位完成后追加一步："读取定位阶段对应的 SKILL.md，确认当前应执行的步骤编号/名称，从该步骤继续。"
4. THE §4.1 "Auto-triggered Resume" SHALL 在第 3 步 "立即执行 Restatement" 之后追加第 4 步："读取当前阶段 SKILL.md 完整内容，确认从中断步骤继续。"
5. THE §4.1 Auto-triggered Resume 的触发条件 SHALL 扩展：除了 `exhaustion_pending: true` 和 interim 文件外，SHALL 增加 "conversation summary 中包含 compaction 恢复信号（如 'This session is being continued from a previous conversation'）" 作为触发条件。
6. THE §5 边界情况表格 SHALL 新增一行：
   | Context compaction 恢复 | 读取当前阶段 SKILL.md 完整内容后继续。不执行 Restatement（Restatement 仅限 build 阶段）。 |

### Requirement 2: Evolved Rule R4 补强

**User Story:** As a Forge maintainer, I want the evolved rules to explicitly remind the model to re-read the current SKILL.md after any context recovery, so that the rule acts as a defense-in-depth layer even if forge-resume's SKILL Reload Step is missed.

#### Acceptance Criteria

1. THE `.forge/knowledge/evolved-rules.md` SHALL 新增 R4 rule，格式与 R1/R2/R3 一致：
   ```
   ### R4: SKILL Reload After Context Recovery

   **Content**: 上下文压缩（compaction）恢复后，或新会话通过 /forge resume 恢复后，必须先读取当前阶段对应的 SKILL.md 完整内容，再执行任何操作。禁止凭 conversation summary 摘要跳步执行。Conversation summary 是高维压缩，会丢失 SKILL.md 中的具体步骤编号、AskUserQuestion 调用、门禁检查等关键细节。
   **Prevents**: 模型在 compaction 恢复后凭摘要执行，遗漏 SKILL.md 中定义的关键步骤（如 ship 阶段的合并选项提示、review 阶段的三层评审配置）
   **Source**: 用户反馈 — ship 阶段 compaction 恢复后跳过 AskUserQuestion 合并选项提示
   **Added**: 2026-05-09
   **Confidence**: 0.9
   **Last_triggered**: 2026-05-09
   ```
2. THE `evolved-rules.md` frontmatter `rule_count` SHALL 从 `3` 更新为 `4`。
3. THE R4 rule SHALL NOT 与 R1（Forge Phase Auto-Advance）重复；R1 管阶段间推进，R4 管恢复后重读 SKILL。
4. THE `scripts/lint-evolved-rules.mjs` SHALL 自动验证 rule_count 与实际规则数一致（既有行为，本需求不修改该脚本）。

### Requirement 3: forge-ship SKILL.md 补充 Compaction 恢复指引

**User Story:** As a Forge developer reading the ship SKILL, I want to see explicit instructions for handling compaction recovery, so that even without forge-resume I can understand the expected behavior.

#### Acceptance Criteria

1. THE `skills/forge-ship/SKILL.md` SHALL 在 §3（门禁检查）之后、§4（交付操作）之前新增 §3.5 "Compaction Recovery Check"：
   ```
   ### 3.5 Compaction Recovery Check

   IF 本次执行是从 conversation summary 恢复（上下文压缩后继续），THEN：
   1. 重新读取本 SKILL.md 完整内容（你正在读的就是）
   2. 确认三道门禁的检查结果在 summary 中有 P5 证据链记录
   3. 确认未跳过 §4 中的任何步骤（特别是 AskUserQuestion 合并选项）
   4. 从中断点继续执行
   ```
2. THE 其他阶段 SKILL（forge-review、forge-test、forge-learn）SHALL 在各自文件中添加同等结构的 Compaction Recovery Check 段落，放在门禁检查之后、主操作之前。每个阶段的段落内容对应各自的步骤结构。
3. THE Compaction Recovery Check 段落 SHALL NOT 改变正常流程（无 compaction）的执行路径。它仅在 compaction 恢复场景下提供显式检查点。

### Requirement 4: 回归测试

**User Story:** As a Forge maintainer, I want automated tests that verify the evolved-rules rule_count and SKILL.md Compaction Recovery Check paragraphs exist, so that future changes don't silently remove these safety nets.

#### Acceptance Criteria

1. THE `scripts/lint-evolved-rules.mjs` SHALL 继续验证 rule_count 与实际 `### R\d+:` 标题数一致。R4 新增后 rule_count=4，lint 通过。
2. THE `test/` 目录下 SHALL 新增或扩展一个测试验证以下 SKILL.md 文件包含 `Compaction Recovery Check` 段落：
   - `skills/forge-ship/SKILL.md`
   - `skills/forge-review/SKILL.md`
   - `skills/forge-test/SKILL.md`
   - `skills/forge-learn/SKILL.md`
3. THE `skills/forge-resume/SKILL.md` SHALL 包含 `SKILL Reload` 段落（Requirement 1），此存在性 SHALL 被测试覆盖。

### Requirement 5: 文档更新

**User Story:** As a Forge user, I want to understand that context compaction recovery now includes SKILL.md re-reading, so that I can trust the recovery mechanism.

#### Acceptance Criteria

1. THE `CHANGELOG.md` SHALL 新增条目描述本特性。
2. THE `skills/forge-resume/SKILL.md` 的 Common Rationalizations 表 SHALL 新增一行：
   | "我记得上次的步骤不需要重读" | compaction 后 conversation summary 是高维压缩，丢失步骤细节。重读 SKILL.md 成本极低，跳过成本极高 |
