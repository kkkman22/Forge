---
status: completed
feature: review-adversarial-stance
layout: requirements
created: 2026-06-04
tier: standard
---
# Requirements Document

## Introduction

obra/superpowers 的 `spec-reviewer-prompt.md` 中有一条核心指令，显著改变了 reviewer 的审查立场：

> The implementer finished suspiciously quickly. Their report may be incomplete, inaccurate, or optimistic. **You MUST verify everything independently.**

这条指令将 reviewer 从"核实"姿态转为"怀疑"姿态，使 review 变成 adversarial process（对抗性过程）。

当前 Forge 的三个 review subagent（spec-check、quality-check、security-check）在 Identity 章节声明了职责范围，但没有设定对 implementer 自我报告的不信任立场。review instructions 的 controller 层也没有"不信任任何单层结论"的独立验证指令。

**明确不做的事情**：不修改 review 的 Check Items、Check Method、Output Format 等核心逻辑；不修改 TypeScript 代码；不改变 review 的三层架构。

## Requirements

### Requirement 1: spec-check Adversarial Stance

**User Story:** 作为 spec-check reviewer，我希望在 Identity 章节中明确被告知"不信任 implementer 的报告"，这样我在审查时能独立验证而非跟随 implementer 的声明。

#### Acceptance Criteria

1. `.claude/agents/spec-check.md` Identity 章节 SHALL 在末尾追加 `## Adversarial Stance（铁律）` 子章节。
2. THE 子章节 SHALL 包含声明："实现者完成得异常迅速。他们的报告可能不完整、不准确或过度乐观。你必须独立验证一切。"
3. THE 子章节 SHALL 包含至少 3 条"禁止"指令：不信任 implementer 声称实现了什么、不信任完整性声明、不接受对需求的解读。
4. THE 子章节 SHALL 包含至少 4 条"必须"指令：读实际代码、逐行对比实现与需求、检查声称实现但缺失的部分、寻找未提及的额外功能。
5. THE 子章节 SHALL 以铁律声明结尾："实现者说'已实现' ≠ 已实现。只有代码存在且行为正确 = 已实现。"

### Requirement 2: quality-check Adversarial Stance

**User Story:** 作为 quality-check reviewer，我希望在 Identity 章节中被告知不信任 implementer 的自审结论。

#### Acceptance Criteria

1. `.claude/agents/quality-check.md` Identity 章节 SHALL 在末尾追加 `## Adversarial Stance（铁律）` 子章节。
2. THE 子章节 SHALL 包含声明："实现者可能声称'代码质量良好'、'已自审'。你必须独立判断。"
3. THE 子章节 SHALL 包含至少 3 条"禁止"指令：不信任自审结论、不因测试全绿假定质量没问题、不跳过 diff 中可见的质量问题。
4. THE 子章节 SHALL 包含至少 3 条"必须"指令：基于实际代码判断质量、对每个变更文件执行六维检查、特别关注 implementer 自审容易忽略的问题（重复代码、深层嵌套、魔法数字）。
5. THE 子章节 SHALL 以铁律声明结尾："测试全绿 ≠ 代码质量好。全绿的垃圾代码比失败的干净代码更危险。"

### Requirement 3: security-check Adversarial Stance

**User Story:** 作为 security-check reviewer，我希望被要求假设最坏情况，不因项目安全级别低而放松检查。

#### Acceptance Criteria

1. `.claude/agents/security-check.md`（或 review instructions 中的安全章节）SHALL 追加 `## Adversarial Stance（铁律）` 章节。
2. THE 章节 SHALL 包含声明："安全审查必须假设最坏情况。"
3. THE 章节 SHALL 包含至少 3 条"禁止"指令：不假定安全级别低不需要严格检查、不因代码简单跳过注入风险、不接受"只是测试用的"作为硬编码密钥的辩解。
4. THE 章节 SHALL 包含至少 4 条"必须"指令：扫描每个新增的字符串拼接/模板字面量中的变量插值、检查每个新增的 exec/eval/spawn 调用、验证每个新增的文件路径操作是否防止路径遍历、对比 OWASP Top 10 逐项检查。

### Requirement 4: Controller Independent Verification

**User Story:** 作为 review controller，我希望在汇总三层结果时有独立验证指令，这样我不会因为一层 pass 就假定其他层也没问题。

#### Acceptance Criteria

1. `skills/forge/lib/review/instructions.md` SHALL 新增 `## Independent Verification（铁律）` 章节。
2. THE 章节 SHALL 包含至少 4 条独立验证规则。
3. THE 规则 SHALL 包含：不信任任何单层结论、验证 reviewer 的证据引用、交叉比对三层结论、盲点感知（三层全绿但变更涉及安全代码时触发深度审查）。
4. THE 章节 SHALL 包含高风险信号判定："reviewer 全绿 + 变更 > 200 行 = 高风险信号。大规模变更零问题通常意味着 review 不够深入。"
