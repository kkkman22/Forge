---
feature: review-unverifiable-verdict
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

obra/superpowers v6.0.0 在 task-reviewer 引入第三种评审结论"can't verify from the diff"。当需求点对应的代码不在本次 diff 触及的文件里时,reviewer 标记为"无法从 diff 验证"并交给 controller 自行复核,而不是强行判定 pass/fail。

当前 Forge 的 spec-check reviewer(`.claude/agents/spec-check.md`)只有 pass/fail 两种结论。在 `review-adversarial-stance` spec 注入"不信任 implementer、独立验证一切"铁律后出现副作用:需求落在未被本次 diff 触及的文件时,spec-check 为了"独立验证"去读一堆无关代码,导致 context 稀释、turn 预算浪费、或为给结论而妄下判定。本 spec 给 reviewer 一个诚实的第三出口。

## Glossary

| Term | Definition |
|------|-----------|
| verdict | 单条 finding 的评审结论,枚举 pass/fail/unverifiable |
| unverifiable | 需求点对应的代码不在本次 diff 触及的文件内,reviewer 无法从 diff 独立验证 |
| controller | review 主 agent,汇总三层 subagent 结果并做 Independent Verification |
| Independent Verification | review controller 收到三层结果后的独立复核职责(见 review/instructions.md 现有铁律章节) |

## Requirements

### Requirement 1: spec-check 新增 unverifiable 结论

spec-check reviewer 在判定单条需求点时,除现有的 pass/fail 外,可输出第三种结论 unverifiable。

#### Acceptance Criteria

- 当 reviewer 判定某需求点时 系统应当 允许输出结论值 `unverifiable`,且该结论需满足两个条件同时成立:需求点对应的代码不在本次 diff 触及的任何文件内;目标文件确实存在但未被本次 diff 改动。
- 当 reviewer 输出 unverifiable 结论时 系统应当 在该条 finding 上附带非空字符串说明(哪个需求点、对应哪个未改动文件),并标记严重度为需 controller 复核的级别(不阻断 ship)。
- 当 reviewer 发现需求点对应的目标文件根本不存在时 系统应当 标记为 fail(确实未实现),而不是 unverifiable。
- 当 finding 未携带结论字段时 系统应当 在合并阶段按 fail 处理(保守,向后兼容历史 finding)。

### Requirement 2: spec-check 判定流程明确化

reviewer 在遇到"需求落在未改动文件"时,应明确知道该走的流程,避免在 pass/fail/unverifiable 之间犹豫消耗 turn。

#### Acceptance Criteria

- 当 reviewer 评估每个需求点时 系统应当 按决策树选择结论:需求点代码能从需求描述定位且在 diff 内→正常 pass/fail;能定位但目标文件不存在→fail;能定位且目标文件存在但未被 diff 改动→unverifiable;无法从需求描述定位代码→fail。
- 当 reviewer 对某需求点标记 unverifiable 后 系统应当 停止对该需求点发起额外的文件读取/搜索调用,把 turn 预算留给 diff 内的需求点。
- 当 reviewer 使用 unverifiable 结论时 系统应当 在其判定流程文档中声明:这不违反 Adversarial Stance 铁律——不信任 implementer 不等于必须亲自读完所有相关代码,跨文件复核是 controller 的职责。

### Requirement 3: controller 接收并复核 unverifiable

review controller 收到 unverifiable finding 时,被明确告知须亲自读对应文件复核,不会误把它当成已通过。

#### Acceptance Criteria

- 当 review controller 收到 unverifiable finding 时 系统应当 要求 controller 亲自读取对应的未改动文件对照需求点复核,不得跳过。
- 当 controller 复核后确认未实现时 系统应当 将该项升级为高严重度并加入最终 finding;当确认已实现时 系统应当 在最终报告标注"经 controller 复核"并保留低严重度痕迹以便审计。
- 当存在任意未复核的 unverifiable finding 时 系统应当 不允许将本次 review 标记为三层全绿,即便没有 fail 结论也必须完成复核后才能标记通过。

## Non-Functional Requirements

- **性能**:unverifiable 标记后停止对该需求点的进一步工具调用,实测应节省 reviewer 的 turn 预算,不引入额外延迟。
- **向后兼容**:历史 finding(无 verdict 字段)按 fail 缺省,合并结果与现状一致,不破坏既有 review 报告解析。
- **可审计**:所有 unverifiable finding 的复核路径(升级/保留/不计入全绿)在最终报告中留痕。

## Out of Scope

- 不修改 review 的三层架构(spec-check/quality-check/security-check 分工不变)。
- 不修改 quality-check / security-check——它们的职责就是评判 diff 内代码,不存在"需求落在未改动文件"的问题。
- 不重写合并管线的核心逻辑,仅扩展 verdict 枚举与全绿判定函数。
- 不引入新的 review subagent。

## Delta

### Added
- spec-check 的第三种结论 unverifiable 及其判定流程。
- controller 对 unverifiable 的强制复核职责。
- verdict 可选字段与 unverifiable_reason 字段在 finding schema 中。

### Modified
- `.claude/agents/spec-check.md` 的 Output Format:Status 列允许第三种值;Structured JSON finding 允许 verdict/unverifiable_reason 字段。
- `.claude/agents/spec-check.md` 的 Severity Judgment 表:新增 unverifiable 行。
- `skills/forge/lib/review/instructions.md` 的 Independent Verification 章节:新增第 5 条复核规则。
- 合并管线的全绿判定函数:存在 unverifiable 时返回非全绿。

### Unchanged
- review 三层并行架构不变。
- fallback ladder(L0→L1→L2→L3)不变。
- Adversarial Stance 铁律原文不变(仅新增澄清段)。
- Turn Budget Discipline 不变。
- 现有 P0/P1/P2/P3 severity 语义不变。

## 反漂移声明

- **主目标**:给 spec-check 一个诚实的第三结论,避免为给结论而读无关代码或妄下判定。
- **非目标代理信号**:不把 unverifiable 扩展到 quality-check/security-check(它们职责在 diff 内);不把跨文件复核职责推回给 reviewer(unverifiable 的复核是 controller 的事);不降低 Adversarial Stance 强度(unverifiable 是分工不是偷懒)。
- **验证材料角色**:需求满足的证据是——reviewer 遇到未改动文件的需求点时标 unverifiable 而非 fail/pass;controller 复核留痕;合并管线全绿判定正确处理 unverifiable。

## Validation Contract

### VAL-R1-001: unverifiable 结论字段

**Verify-By**: `vitest:unit`
**Evidence**: `test/review/verdict-schema.test.ts` 测试 `parseFinding accepts verdict pass|fail|unverifiable` 通过
**Covers**: R1.AC1

### VAL-R1-002: unverifiable 附带说明与严重度

**Verify-By**: `vitest:unit`
**Evidence**: `test/review/verdict-schema.test.ts` 测试 `unverifiable finding requires non-empty unverifiable_reason and P2 severity` 通过
**Covers**: R1.AC2

### VAL-R1-003: 缺省 fail 向后兼容

**Verify-By**: `vitest:unit`
**Evidence**: `test/review/verdict-schema.test.ts` 测试 `finding without verdict field defaults to fail in merge` 通过
**Covers**: R1.AC4

### VAL-R1-004: 文件不存在判 fail

**Verify-By**: `vitest:unit`
**Evidence**: `test/review/verdict-schema.test.ts` 测试 `target file not existing yields fail not unverifiable` 通过
**Covers**: R1.AC3

### VAL-R2-001: 判定流程文档存在

**Verify-By**: `bash:contract`
**Evidence**: `grep '## Unverifiable Verdict Decision Flow' .claude/agents/spec-check.md` 非空,章节内含决策树四分支
**Covers**: R2.AC1

### VAL-R2-002: 标记后停止工具调用

**Verify-By**: `bash:contract`
**Evidence**: `grep` 命中 spec-check.md 中"标记 unverifiable 后禁止继续对该需求点发起额外的 Read/Glob/Grep"
**Covers**: R2.AC2, R2.AC3

### VAL-R3-001: controller 复核规则

**Verify-By**: `bash:contract`
**Evidence**: `grep 'unverifiable' skills/forge/lib/review/instructions.md` 非空且命中"controller 必须亲自"
**Covers**: R3.AC1

### VAL-R3-002: 全绿判定排除 unverifiable

**Verify-By**: `vitest:unit`
**Evidence**: `test/review/verdict-merge.test.ts` 测试 `review with only unverifiable findings cannot be marked all-green until controller verification` 通过
**Covers**: R3.AC3
