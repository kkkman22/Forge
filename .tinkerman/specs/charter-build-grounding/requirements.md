---
status: draft
feature: charter-build-grounding
layout: requirements
created: 2026-06-19
tier: standard
work_nature: feature
---
# Requirements Document — build 阶段 Charter Grounding 注入

## Introduction

Forge 的 `.tinkerman/charter.md`(项目宪章,cross-spec 工程约束锚点)目前在 decide/spec/plan/review 四个阶段被读取并作为 grounding 约束,但**在 build 阶段是盲区**。

代码证据:
- `templates/CLAUDE.md:122` 的 charter 下游 skill 列表只含 decide/spec/plan/review,**故意未包含 build**。
- `skills/forge/lib/build/instructions.md` 全文 grep 无 `charter`/`convention`/`grounding` 任何匹配。
- `skills/forge/lib/build/references/subagent-orchestration.md:29-39` 的 "Prompt 必须包含" 清单不含 charter invariant。
- 对比:`agents/spec-check.md:167-173` 的 Check Item 7 "Charter Compliance" 会检查 INV-NNN 违规——**说明 charter 约束是真实存在的,只是 build 不读、靠 review 事后兜底**。

后果:一个 INV-NNN 边界(如"API 层禁止直接访问数据层"、"禁止在 hooks 中引入新运行时依赖")在 build 写代码时不可见,subagent 可能直接违反,只能等 review 阶段 spec-check 发现并打回,浪费一轮 build→review 往返。

本 spec 借鉴 Trellis 的 `trellis-before-dev` 模式(写代码前强制读 spec/编码约定),在 build 阶段注入 charter grounding 摘要,闭合 decide/spec/plan → build → review 的 charter 一致性回路。

## Goals

- 让 build 阶段(主 agent + subagent)在写代码前可见 charter invariant。
- 复用 charter 现有的 graceful degradation,不引入新的 build 阻断。
- 闭合 charter 一致性回路:decide/spec/plan 决策时对照 → build 执行时遵守 → review 验证。

## Non-Goals

- 不修改 charter.md 的格式、生成逻辑或注入摘要格式(≤500 tokens 摘要已有现成格式,见 `charter/instructions.md:55-64`)。
- 不改变 charter 的生命周期(仍由 `/forge charter` 管理,仍按 status:active/draft/deprecated 降级)。
- 不在 `src/build.ts` 的 `checkBuildGate` 中新增 charter 门禁——charter 注入是"内容可见性"增强,不是"流程门禁"。流程门禁(Spec/Plan/Branch)保持不变。
- 不让 charter 注入影响 token 预算到导致 compact-safe 降级(≤500 tokens 属于 context-budget Layer 1 "Keep Highest")。

## Requirements

### Requirement 1: build 主流程注入 charter grounding

**User Story:** As a developer, I want the build phase to read and inject the charter grounding summary before writing code, so that subagents遵守 project invariants 而非靠 review 事后兜底。

#### Acceptance Criteria

1. THE `skills/forge/lib/build/instructions.md` SHALL 在 §2 Pre-build Checks 之后新增一节(建议 §2.5 或 §1.7)"Charter Grounding",内容为:当 `.tinkerman/charter.md` 存在且 frontmatter `status: active` 时,读取并注入其 grounding 摘要(格式同 `charter/instructions.md:55-64` 定义的核心问题/架构边界/INV-NNN 列表,≤500 tokens)。
2. THE Charter Grounding 节 SHALL 复用 charter 现有的 graceful degradation:`status: draft` 或 `deprecated` → 不注入并标注 `ℹ No active charter`;文件不存在 → 静默跳过。**不得阻断 build**。
3. THE Charter Grounding 节 SHALL 明确声明:invariant 是"写代码时的约束",不是"新增门禁"——subagent 若发现任务本身与 INV-NNN 冲突,SHOULD 在三段式变更摘要(build-discipline-enhancement Requirement 2)的"关注点"区报告,而非自行阻断。
4. THE `templates/CLAUDE.md:122` 的 charter 下游 skill 列表 SHALL 追加 `build`,与 decide/spec/plan/review 对齐。

### Requirement 2: build subagent prompt 注入 charter invariant

**User Story:** As a developer, I want each build subagent's prompt to include the relevant charter invariants, so that the subagent doesn't violate project boundaries while coding。

#### Acceptance Criteria

1. THE `skills/forge/lib/build/references/subagent-orchestration.md:29-39` 的 "Prompt 必须包含" 清单 SHALL 新增一项 "Charter grounding 摘要(若 active):核心架构边界 + 与本任务相关的 INV-NNN 列表"。
2. THE subagent prompt 构造逻辑 SHALL 在 charter 不存在或非 active 时跳过此项,不产生空字段。
3. THE charter invariant 注入 SHALL 限定为 ≤500 tokens 的**摘要**,不得注入 charter 全文(避免触发 `src/forge/agents-dispatcher.ts:201` 的 4096 字符 prompt 截断)。

### Requirement 3: 文档一致性同步

**User Story:** As a maintainer, I want the charter documentation to reflect that build is now a downstream consumer, so that the grounding loop is discoverable。

#### Acceptance Criteria

1. THE `docs/forge-constitution-detail.md`(若含 charter 下游列表)SHALL 同步将 build 加入。
2. THE `skills/forge/lib/charter/instructions.md` 的"下游消费者"说明 SHALL 更新,标注 build 为新增消费者及注入位置(§2.5 Charter Grounding)。

## 验收标准

- [ ] `skills/forge/lib/build/instructions.md` 含 Charter Grounding 节,且 graceful degradation 行为符合 Requirement 1.2
- [ ] `skills/forge/lib/build/references/subagent-orchestration.md` 的 "Prompt 必须包含" 含 charter grounding 项
- [ ] `templates/CLAUDE.md` charter 下游列表含 build
- [ ] charter 不存在 / status:draft / status:deprecated 三种情况下 build 均不阻断(手动验证)
- [ ] charter status:active 时,build subagent prompt 可见 INV-NNN 列表(手动验证或通过 subagent 输出确认)

## 依赖

- 无前置 spec 依赖。charter 系统已存在(v3.4 引入)。
- 与 `context-injection-activation` spec 正交:charter 是项目级常量注入,context-injection 是任务级动态文件清单。两者可并行实现。

## 非目标

- 不引入"charter 违规自动阻断 build"——那是 review 阶段 spec-check 的职责。
- 不为 charter invariant 编写新的 property-based test——charter 注入是 skill 文本层增强,非 src/ 纯函数。
- 不修改 `agents/spec-check.md` 的 Check Item 7(它已经正确工作)。
