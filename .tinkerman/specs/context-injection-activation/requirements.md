---
status: draft
feature: context-injection-activation
layout: requirements
created: 2026-06-19
tier: standard
work_nature: feature
---
# Requirements Document — 激活 context-injection.ts 死代码骨架

## Introduction

Forge 的 `src/context-injection.ts` **完整实现了** subagent 启动前注入 spec/research 文件清单的机制(语义等同 Trellis 的 `implement.jsonl`/`check.jsonl`),**有完整测试,但从未接入任何生产流程**——是一套"建了一半的脚手架"。

代码证据(全仓 grep 验证):
- `src/context-injection.ts:47` `appendContextEntry`、`:62` `readContextEntries`、`:112` `mergeContextSources`——三个导出函数在 `src/` 全仓**零调用方**(仅 `src/index.ts:6` 注释提及)。
- `test/context-injection.test.ts` 存在——说明是认真设计、写完测试、未接线的骨架,非废弃代码。
- 路径约定 `.tinkerman/runs/<runId>/context.jsonl` 已在 `context-injection.ts:23,44,59` 注释定义。
- `src/schemas/plan-file.ts:26,36,82` 的 `ContextFilesSchema` plan frontmatter `context_files` 字段也解析了但无人消费。

真实的痛点(深挖 subagent prompt 构造代码确认):
- `src/review/subagent.ts:72-83`——**quality-check / security-check 的 prompt 是固定空字符串** `"Review code quality."` / `"Review security and risk."`,完全不注入任务上下文,靠 agent 自己 `forge_git diff` 后瞎找。
- `src/decide/types.ts:11-14`——`DecideContext` 只有 `taskDescription` + `involvedFiles`,product/architect/security 看不到 spec/charter/research。
- `src/review/subagent.ts:47`——`.diff-context.md` 是全 agent 共享的单一文件,无法按角色裁剪。

本 spec **不引入新机制**(避免与已有 `context.jsonl` 重复),而是**激活已有骨架**,把文件清单按角色注入 subagent prompt。

## Goals

- 激活 `src/context-injection.ts` 的三个导出函数,接入 review/decide subagent 的 prompt 构造。
- 让 quality-check / security-check / decide agent 启动时可见与本任务相关的 spec/research 文件清单(路径列表,非内容)。
- 复用 plan frontmatter 已有的 `context_files` 字段作为静态来源,`.tinkerman/runs/<runId>/context.jsonl` 作为动态运行时来源,经 `mergeContextSources` 去重合并。

## Non-Goals

- **不新建** `implement.jsonl`/`check.jsonl` 命名——那是与 `context.jsonl` 重复造轮子。本 spec 统一用 Forge 已有的 `context.jsonl` 机制。
- 不改变 `agents-dispatcher.ts:201` 的 4096 字符 prompt 截断——因此只能注入**文件路径清单**,不能注入文件内容(这正是 `context.jsonl` 的设计形态)。
- 不接管 charter 注入——charter 是项目级常量,由 `charter-build-grounding` spec 处理;本 spec 聚焦任务级 spec/research 文件清单。
- 不在本 spec 实现 build/learn 阶段的 `appendContextEntry` 写入——那是更大的接线工程,本 spec 先做"读取并注入"侧。
- 不修改 `ContextEntry` 接口或 schema——它们已经设计正确。

## Requirements

### Requirement 1: review subagent prompt 注入 context 清单

**User Story:** As a developer, I want the quality-check / security-check / spec-check subagents to receive the relevant spec/research file list, so that they can read the right context instead of blindly scanning the diff。

#### Acceptance Criteria

1. THE `src/review/subagent.ts:buildReviewSubagents`(`:59-97`)SHALL 在构造每个 subagent prompt 时,调用 `readContextEntries` 读取 `.tinkerman/runs/<runId>/context.jsonl`(若存在),并结合 plan frontmatter 的 `context_files` 经 `mergeContextSources` 去重合并,得到本任务的文件清单。
2. THE 注入内容 SHALL 为**文件路径列表**(每项一行 `path/to/file.md`)+ 每项的 `reason` 字段,**不包含文件正文**。
3. THE 注入 SHALL 区分角色:spec-check 优先注入 `requirements.md`/`design.md`;quality-check 优先注入 conventions/anti-pattern 文件;security-check 优先注入 threat-model/security-spec 文件。**若 context.jsonl 未标记角色,则全部注入**(渐进增强,不强制分类)。
4. THE quality-check / security-check 的 prompt SHALL 不再是纯固定字符串(`src/review/subagent.ts:72-83`),而是在固定引导语后追加 context 清单段落;清单为空时退化为现状(不破坏现有行为)。
5. THE 注入 SHALL 在 context.jsonl 不存在时静默跳过,不报错、不阻断 review。

### Requirement 2: decide subagent prompt 注入 context 清单

**User Story:** As a developer, I want the decide-phase agents (product/architect/security) to see relevant spec/research files, so that their analysis is grounded in actual artifacts rather than only taskDescription。

#### Acceptance Criteria

1. THE `src/decide/types.ts:11-14` 的 `DecideContext` SHALL 新增可选字段 `contextFiles?: string[]`(合并后的文件路径列表)。
2. THE `src/decide/orchestration.ts:59-68`(`buildDecideRound1Subagents`)SHALL 在构造 Round 1 prompt 时,若 `contextFiles` 非空,追加一段 "Relevant artifacts: <file list>"。
3. THE `contextFiles` 的来源 SHALL 由 decide skill 层(plan 已 approved 时读 plan frontmatter `context_files`;或读 `.tinkerman/runs/<runId>/context.jsonl`)填充。
4. THE 注入 SHALL 不超过 prompt 字符预算的合理比例(建议文件列表 ≤20 行),避免与 4096 字符截断冲突。

### Requirement 3: context.jsonl 运行时写入(最小接入)

**User Story:** As a developer, I want the build phase to populate context.jsonl during execution, so that downstream review/decide subagents have fresh context。

#### Acceptance Criteria

1. THE 至少一个生产流程(建议 build skill 在读取 plan 后、spawn subagent 前)SHALL 调用 `appendContextEntry` 把 plan frontmatter 的 `context_files` 条目写入 `.tinkerman/runs/<runId>/context.jsonl`。
2. THE 写入 SHALL 使用现有的 O_APPEND 并发安全语义(`context-injection.ts:47-50`),不引入锁。
3. THE 写入 SHALL 在 plan 无 `context_files` 字段时跳过(渐进增强,不强制 plan 必须有该字段)。
4. THE `<runId>` 的来源 SHALL 复用现有 run 标识机制(查看 `.tinkerman/runs/` 现有命名约定,不新造 run id 体系)。

### Requirement 4: plan frontmatter context_files 消费打通

**User Story:** As a developer, I want the existing plan frontmatter `context_files` field to actually be consumed, so that authors who declare context files see them reach subagents。

#### Acceptance Criteria

1. THE `src/plan.ts`(或合适的 plan 解析入口)SHALL 在 plan frontmatter 含 `context_files` 时,将其作为 `mergeContextSources` 的第一个参数(`planContextFiles`)传入合并流程。
2. THE 合并结果 SHALL 去重(`mergeContextSources` 已实现),plan 静态声明 + jsonl 动态运行时二者并存。

## 验收标准

- [ ] `src/review/subagent.ts` 的 quality-check/security-check prompt 含 context 清单注入逻辑
- [ ] `src/decide/types.ts` 的 `DecideContext` 含 `contextFiles` 字段
- [ ] `src/decide/orchestration.ts` Round 1 prompt 含 context 注入
- [ ] `appendContextEntry` 至少有 1 个生产调用方(grep 验证非零)
- [ ] `mergeContextSources` 至少有 1 个生产调用方
- [ ] `readContextEntries` 至少有 1 个生产调用方
- [ ] 现有 `test/context-injection.test.ts` 全部通过
- [ ] 新增测试覆盖:context.jsonl 不存在时 review/decide 不报错(回归保护)

## 依赖

- 无前置 spec 依赖。`context-injection.ts` 骨架已存在。
- 与 `charter-build-grounding` spec 正交:charter 是项目级常量,context-injection 是任务级文件清单。
- 与 `forge-continue-command` spec 正交:continue 是阶段推进,context-injection 是 subagent 上下文。

## 非目标

- 不实现 Trellis 风格的 `task.py add-context` CLI——Forge 不走 Python 脚本路线,context 清单由 plan frontmatter + 运行时自动填充。
- 不做 context 清单的 GUI/可视化展示。
- 不在本 spec 实现按角色裁剪的精细分类(Requirement 1.3 的"渐进增强"已说明:未标记角色时全部注入)。
