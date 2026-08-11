---
status: completed
feature: build-subagent-protocol
layout: requirements
created: 2026-06-04
tier: standard
---
# Requirements Document

## Introduction

obra/superpowers 项目在三个维度上强化了 build subagent 的执行纪律，这些是 Forge 当前缺失的：

1. **合理化预防表**：每个纪律执行型 skill 都包含"借口 vs 事实"表。Forge 的铁律以断言式写成（"必须遵循 RED→GREEN→REFACTOR"），但没有覆盖 LLM 常见的逃避模式。枚举借口并预置反驳比单纯声明铁律更有效。

2. **Implementer 四状态码**：Superpowers 的 subagent 报告固定四种状态（DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT），controller 对每种状态有明确处理流程。Forge 的 forge-build 以自由文本报告，不可靠。

3. **反讨好性回应**：LLM 在 code review 场景中极易产生 sycophantic behavior（"你说得对！"）。Forge 没有约束此类行为。

本 spec 将这三项改进整合到 Forge 的 build 执行纪律框架中。

**明确不做的事情**：不修改 TypeScript 代码；不改变 build 的执行路径或门禁逻辑；不增加新的 Subagent 或 Hook；不修改 review agents（由 `review-adversarial-stance` spec 负责）。

## Requirements

### Requirement 1: TDD 合理化预防表

**User Story:** 作为开发者，我希望在 TDD 铁律旁能看到常见逃避借口的具体反驳，这样当 LLM 产生"先写实现再补测试"的念头时能被有效阻止。

#### Acceptance Criteria

1. CLAUDE.md §2.1 SHALL 在现有 `tdd-delete-and-restart` 铁律之后新增 §2.1.2 "TDD 合理化预防表"。
2. THE 表格 SHALL 包含至少 10 行"想法 vs 事实"对照。
3. THE 表格 SHALL 覆盖以下逃避模式：太简单不用测、先写实现后补测试、手动验证已够、删除太浪费、这次例外、先探索、测试太难、保留当参考、TDD 太教条、代码逻辑看起来对、任务不需要 TDD。
4. THE 表格 SHALL 使用中文（与 CLAUDE.md 现有风格一致）。

### Requirement 2: 验证合理化预防表

**User Story:** 作为开发者，我希望在验证铁律旁也有类似的借口反驳表。

#### Acceptance Criteria

1. CLAUDE.md §2.3 SHALL 在现有 `verification-run-command` 铁律之后新增 §2.3.1 "验证合理化预防表"。
2. THE 表格 SHALL 包含至少 8 行"想法 vs 事实"对照。
3. THE 表格 SHALL 覆盖以下逃避模式：应该可以了、我很确定、就这一次、lint 通过了、subagent 报告成功、我累了、部分验证够了、输出看起来干净。
4. THE 表格 SHALL 使用中文。

### Requirement 3: Build Instructions TDD Red Flags

**User Story:** 作为 build 执行者，我希望在 instructions 中看到明确的"红旗清单"，这样我能快速自检是否在逃避 TDD。

#### Acceptance Criteria

1. `skills/forge/lib/build/instructions.md` SHALL 新增 "TDD Red Flags" 章节。
2. THE 章节 SHALL 列出至少 10 种应立即停止的信号（代码先于测试、"后面补测试"、测试立刻通过、无法解释失败原因等）。
3. THE 章节 SHALL 以"**以上任何一条 = 删除代码，从测试开始。**"作为结尾铁律声明。

### Requirement 4: Implementer 四状态码

**User Story:** 作为 build controller，我希望 subagent 用标准化状态码报告结果，这样我能程序化地处理不同情况，而不是解析自由文本。

#### Acceptance Criteria

1. `.claude/agents/forge-build.md` SHALL 新增 `## Report Format` 章节。
2. THE 章节 SHALL 定义四个标准状态码：`DONE`、`DONE_WITH_CONCERNS`、`BLOCKED`、`NEEDS_CONTEXT`。
3. EACH 状态码 SHALL 有明确的定义和后续处理说明。
4. THE `DONE_WITH_CONCERNS` 定义 SHALL 禁止将其当作 DONE 使用（concerns 必须明确列出）。
5. THE `BLOCKED` 定义 SHALL 禁止忽略 BLOCKED 直接重试同模型同指令。

### Requirement 5: Controller 状态处理流程

**User Story:** 作为 build controller，我希望对每种 subagent 状态有明确处理流程，这样我不会在遇到异常状态时不知道怎么办。

#### Acceptance Criteria

1. `skills/forge/lib/build/instructions.md` SHALL 新增 `## Subagent Status Handling` 章节。
2. THE 章节 SHALL 为 DONE、DONE_WITH_CONCERNS、BLOCKED、NEEDS_CONTEXT 各定义处理流程。
3. THE BLOCKED 处理流程 SHALL 包含：补充上下文 / 升级模型 / 拆分任务 / 升级用户 四个升级路径。
4. THE BLOCKED 处理流程 SHALL 集成 Three-Strike Reroute（同一任务连续 BLOCKED 3 次触发 CLAUDE.md §2.4）。
5. THE NEEDS_CONTEXT 处理流程 SHALL 规定：连续 2 次 NEEDS_CONTEXT → 升级为 BLOCKED 处理。

### Requirement 6: 升级安全阀声明

**User Story:** 作为 build subagent，我希望知道"承认困难不会受罚"，这样我会在真正卡住时及时升级而不是硬着头皮做糟糕的工作。

#### Acceptance Criteria

1. `.claude/agents/forge-build.md` SHALL 新增 `## 升级安全阀` 章节。
2. THE 章节 SHALL 包含声明："随时可以停下来报告'这个任务对我太难了'。糟糕的工作比没有工作更差。你不会因为升级而受罚。"
3. THE 章节 SHALL 列出至少 4 种应 STOP 并升级的具体场景。
4. THE 章节 SHALL 指定升级方式：报告 `STATUS: BLOCKED` 或 `STATUS: NEEDS_CONTEXT`。

### Requirement 7: Self-Review 步骤

**User Story:** 作为 build subagent，我希望在报告完成前有自检清单，这样我能自己发现并修复明显问题。

#### Acceptance Criteria

1. `.claude/agents/forge-build.md` SHALL 新增 `## Self-Review（报告前必做）` 章节。
2. THE 自审 SHALL 覆盖四个维度：完整性、质量、纪律、测试。
3. EACH 维度 SHALL 包含至少 3 个自检问题。
4. THE 步骤 SHALL 声明：自审发现问题 → 先修复再报告。

### Requirement 8: Anti-Performative Agreement

**User Story:** 作为开发者，我希望 build subagent 在收到 review 反馈后用技术语言回应而不是情感表达，这样我能验证它是否真正理解并修复了问题。

#### Acceptance Criteria

1. `.claude/agents/forge-build.md` SHALL 新增 `## Anti-Performative Agreement` 章节。
2. THE 章节 SHALL 禁止以下表达："你说得对"、"好点子"、"感谢指出"、"完全同意" 及任何纯赞同不包含技术内容的回复。
3. THE 章节 SHALL 定义正确回应格式：`Fixed. [简要描述改了什么]`。
4. THE 章节 SHALL 包含至少 2 个正反示例对（❌ 错误 vs ✅ 正确）。
5. CLAUDE.md §2.6 Output Conciseness SHALL 追加一条"反讨好纪律"条款。

### Requirement 9: Review Sycophancy Detection

**User Story:** 作为 review 执行者，我希望在 re-review 时能检测 implementer 是否只是口头同意而实际修复不匹配。

#### Acceptance Criteria

1. `skills/forge/lib/review/instructions.md` SHALL 新增 `## Sycophancy Detection` 检查项。
2. THE 检查项 SHALL 定义四种模式及其判定：纯赞同无技术描述（P3）、口头同意但修复不匹配（P1）、口头同意但修复不完整（P1）、技术回应 + 实际修复（✅）。
3. THE 判断方法 SHALL 声明：比较 reviewer 要求的修复点 vs implementer 实际修改的代码 diff，忽略口头声明。
