---
feature: plan-pre-flight-check
status: locked
date: 2026-06-21
layout: requirements
created: 2026-06-21
tier: standard
workflow_variant: requirements-first
kind: feature
brownfield: true
---

# Requirements Document

## Purpose

obra/superpowers v6.0.0 在 subagent-driven-development 引入 Plan Pre-flight:第一个任务执行前,controller 通读 plan 检查内部冲突(任务间矛盾)和自带违规(plan 要求了 reviewer 会判违规的东西),一次 raise,避免跑到一半才发现。

当前 Forge 的 `/forge build` 已有四道 Pre-build Checks(Spec Gate / Plan Gate / Dir Integrity / Branch Gate),但检查的都是外部状态(spec 是否 locked、plan 是否 approved、分支是否正确),没有一道检查 plan 文档内容本身的内部一致性。结果是 plan 写错(任务间矛盾、TDD 违规、verify 命令不在白名单)往往要到 build 中途或 review 才发现,已消耗大量 token。本 spec 补第 5 道内容预检门禁。

## Glossary

| Term | Definition |
|------|-----------|
| Plan Self-Consistency Gate | 本 spec 引入的第 5 道 build 前置门禁,检查 plan 文档内部一致性 |
| 内部冲突 | plan 文档内任务间互相矛盾,如文件操作冲突、依赖循环、Spec Coverage 缺口 |
| 自带违规 | plan 文档内自带了会被 review 阶段判违规的指令,如违反 TDD/验证/阶段间确认铁律的表述 |
| preflight-exempt | plan 中标注某规则对某 task 豁免的注释,用于处理误报 |

## Requirements

### Requirement 1: 新增 Plan Self-Consistency 前置门禁

build 启动时,在现有四道门禁通过后、Charter Grounding 之前,自动检查 plan 文档的内部一致性。

#### Acceptance Criteria

- 当 build 执行到 Pre-build Checks 阶段时 系统应当 在 Branch Gate 之后、Charter Grounding 之前执行 Plan Self-Consistency 检查。
- 当 Plan Self-Consistency 检查发现任一内部冲突或自带违规时 系统应当 阻断 build 并路由回 plan 阶段要求修订后重新批准。
- 当 Plan Self-Consistency 检查发现多项问题时 系统应当 一次性列出所有触发项(不逐项阻断),每项含规则编号、涉及任务、证据。
- 当当前路径为 Light tier(无 Spec/Plan)时 系统应当 跳过 Plan Self-Consistency 检查(没有 plan 文档可检查)。
- 当 Plan Self-Consistency 检查全部通过时 系统应当 输出通过提示并显示检测项总数与触发数。

### Requirement 2: 内部冲突检测

Plan Self-Consistency 检查覆盖可预测的任务间矛盾类型。

#### Acceptance Criteria

- 当 plan 中某任务标记删除的文件被后续任务引用时 系统应当 检测为文件操作冲突。
- 当 plan 中存在循环依赖或任务依赖编号大于自己的任务时 系统应当 检测为依赖反向。
- 当 spec 中某 Requirement 在 plan 的 Spec Coverage 表中无任何覆盖任务时 系统应当 检测为 Spec Coverage 缺口。
- 当 plan 中任一任务的 Verify 字段不在配置的 Verify-By 白名单内时 系统应当 检测为白名单违规。
- 当 plan 中存在两个任务标题完全相同时 系统应当 检测为重复标题(避免 handoff 和 commit 引用歧义)。

### Requirement 3: plan 自带违规检测

Plan Self-Consistency 检查覆盖 plan 中自带了但会被 review 阶段判违规的指令。

#### Acceptance Criteria

- 当 plan 任务描述中出现明确违反项目宪法 TDD Iron-Law 的表述时 系统应当 检测为 TDD 违规。
- 当 plan 任务描述中出现明确违反 Verification Iron-Law 的表述(跳过验证/手动验证即可/测试以后再补)时 系统应当 检测为跳过验证违规。
- 当 plan 任务描述中出现明确违反 No-Mid-Step-Confirmation Iron-Law 的表述(询问用户是否继续/等用户确认再下一步)时 系统应当 检测为阶段间确认违规。
- 当 full format plan 的某任务 RED 段为空或仅占位符时 系统应当 检测为 RED 缺失违规。
- 当违规检测基于关键词模式时 系统应当 允许少量误报(开发者可声明豁免),但不允许漏报明确违规。

### Requirement 4: 误报豁免与可观测性

预检失败时能看到具体哪条规则被触发、证据是什么,对误报有明确处理路径。

#### Acceptance Criteria

- 当 Plan Self-Consistency 检查触发任一检测项时 系统应当 在阻断输出中列出每条触发项的规则编号、涉及任务编号、证据引用。
- 当开发者确认某触发项为误报时 系统应当 允许开发者在 plan 对应任务下追加豁免注释,重新批准后该规则对该任务跳过。
- 当豁免注释被使用时 系统应当 把豁免记录写入 progress 文件的预检日志段以便审计误报模式。
- 当 Plan Self-Consistency 检查通过时 系统应当 在主 agent 输出显示通过提示及检测项总数。

## Non-Functional Requirements

- **性能**:预检是纯字符串/表格解析,无外部 IO,单次执行应在 100ms 内,不显著增加 build 启动延迟。
- **向后兼容**:现有 plan(无违规)通过预检;历史 plan 格式解析失败时走现有 Plan Gate 报错路径,不由预检负责。
- **可配置**:可在 config 加 `preflight_enabled` 开关,紧急情况下可关闭预检。
- **误报容忍**:初始关键词模式保守(宁少勿多),误报通过豁免注释 + 审计日志持续优化。

## Out of Scope

- 不重新实现 plan 生成逻辑(预检只读不写)。
- 不检查 spec 本身的正确性(那是 spec 阶段的事)。
- 不替代 review 阶段的 spec-check(预检是早期 fail-fast,review 是终态验收)。
- 不引入新的大型 TS 模块(预检作为轻量校验函数 + Markdown 规则)。

## Delta

### Added
- build Pre-build Checks 表的第 5 行 Plan Self-Consistency。
- 新增预检函数与 references 文档。
- 豁免注释机制与预检日志段。

### Modified
- `skills/forge/lib/build/instructions.md` §2 表追加第 5 行 + 函数调用说明。
- build 前置检查的编排入口在 Branch Gate 之后调用预检。

### Unchanged
- 现有四道门禁(Spec/Plan/Dir/Branch)逻辑不变。
- Charter Grounding(§2.5)位置与行为不变。
- Rejection Output 统一格式不变(本 spec 复用)。
- plan 文档格式不变(预检只读)。
- review 阶段的 spec-check 职责不变。

## 反漂移声明

- **主目标**:在 build 启动时 fail-fast 检测 plan 文档内部矛盾与自带违规,避免执行到一半才发现。
- **非目标代理信号**:不重新评审 spec 正确性(那是 spec 阶段);不替代 review 的 spec-check(那是终态验收);不检查 plan 的"好不好"(那是 plan 阶段),只检查"自洽不自相矛盾";不引入重型静态分析(纯字符串/表格解析)。
- **验证材料角色**:需求满足的证据是——带矛盾/违规的 plan 在 build 启动时被阻断并一次列全问题;无问题的 plan 正常通过;误报可通过豁免注释处理。

## Validation Contract

### VAL-R1-001: 门禁表新增第 5 行

**Verify-By**: `bash:contract`
**Evidence**: `grep 'Plan Self-Consistency' skills/forge/lib/build/instructions.md` 非空且位于 Branch Gate 行之后
**Covers**: R1.AC1

### VAL-R1-002: 阻断输出一次列全

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `preflight failure lists all violations in Rejection Output` 通过
**Covers**: R1.AC2, R1.AC3

### VAL-R1-003: Light tier 跳过

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `Light tier skips Plan Self-Consistency Gate` 通过
**Covers**: R1.AC4

### VAL-R1-004: 通过输出

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `passing preflight shows ✅ Plan Self-Consistency 通过` 通过
**Covers**: R1.AC5

### VAL-R2-001: 文件操作冲突检测

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `detects file deleted by Task N but referenced by Task M` 通过
**Covers**: R2.AC1

### VAL-R2-002: 依赖循环检测

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `detects cyclic Depends On` 与 `detects depends-on-future-task` 通过
**Covers**: R2.AC2

### VAL-R2-003: Spec Coverage 缺口

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `detects Spec Requirement with no covering task` 通过
**Covers**: R2.AC3

### VAL-R2-004: Verify 白名单违规

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `detects Verify command not in whitelist` 通过
**Covers**: R2.AC4

### VAL-R2-005: 重复标题检测

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `detects duplicate task titles` 通过
**Covers**: R2.AC5

### VAL-R3-001: TDD 违规检测

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `detects 先写实现再补测试 phrasing` 通过
**Covers**: R3.AC1

### VAL-R3-002: 跳过验证检测

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `detects 跳过 verify phrasing` 通过
**Covers**: R3.AC2

### VAL-R3-003: 阶段间确认检测

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `detects 询问用户是否继续 phrasing` 通过
**Covers**: R3.AC3

### VAL-R4-001: 豁免注释生效

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `preflight-exempt comment skips flagged rule for that task` 通过
**Covers**: R4.AC2

### VAL-R4-002: 豁免审计日志

**Verify-By**: `vitest:unit`
**Evidence**: `test/build/plan-preflight.test.ts` 测试 `exempt records written to progress preflight log` 通过
**Covers**: R4.AC3
