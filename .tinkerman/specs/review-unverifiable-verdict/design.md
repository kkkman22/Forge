---
feature: review-unverifiable-verdict
date: 2026-06-21
layout: design
created: 2026-06-21
tier: standard
workflow_variant: requirements-first
kind: feature
brownfield: true
---

# Design Document: Review Unverifiable Verdict

## Overview

为 spec-check reviewer 增加 `unverifiable` 第三结论,并让 review controller 承接跨文件复核职责。改动集中在 `.claude/agents/spec-check.md`(Markdown 追加)+ `skills/forge/lib/review/instructions.md`(追加 1 条规则)+ 合并管线的 verdict 枚举扩展(TS)。

## Architecture

无架构变更。spec-check 已有 Structured JSON Output(含 severity/confidence/file/line 字段),本 spec 仅扩展 verdict 可选字段 + unverifiable_reason 字段。合并管线已按 severity 聚合,unverifiable 对应的 P2 不阻断 ship,与现有 P2 语义一致。

## Component Interfaces

### 1. spec-check.md Output Format 扩展

在现有 Markdown Report Format 表格 Status 列示例中追加 `❓ unverifiable` 一行;Structured JSON finding 对象追加两个可选字段。

**缺省规则**:verdict 字段缺省时,合并管线按 fail 处理(保守,向后兼容历史 finding)。

### 2. spec-check.md 新增 Decision Flow 章节

三分支决策树 + "标记后停止工具调用"铁律 + Adversarial Stance 澄清段。

### 3. review/instructions.md Independent Verification 追加第 5 条

controller 收到 unverifiable 时须亲自 Read 复核,含升级/保留/不计入全绿三种处理路径。

### 4. 合并管线 verdict 枚举扩展(TS)

finding schema 加 verdict? + unverifiable_reason?,缺省 fail;全绿判定函数在存在 unverifiable 时返回非全绿。

## Data Model

```typescript
type Verdict = "pass" | "fail" | "unverifiable";

type Finding = {
  severity: "P0" | "P1" | "P2" | "P3";
  verdict?: Verdict;             // 缺省 = "fail"(保守)
  unverifiable_reason?: string;  // verdict === "unverifiable" 时必填
  // ...现有字段不变
};

type AllGreenResult =
  | { allGreen: true }
  | { allGreen: false; pending_controller_verification: string[] };

function isAllGreen(findings: Finding[]): AllGreenResult;
```

## Error Handling

| 情况 | 处理 |
|------|------|
| finding 缺 verdict 字段(历史 finding) | 按 fail 处理,不报错 |
| unverifiable finding 缺 unverifiable_reason | parse 时标 P1 schema 错误并回退为 fail |
| 合并管线收到未知 verdict 值 | 按 fail 处理 + 输出告警 |

## Testing Strategy

- **单元测试**(`test/review/verdict-schema.test.ts`):parseFinding 接受三值 verdict;缺省 fail;unverifiable 强制 P2 + reason 非空;文件不存在判 fail。
- **合并测试**(`test/review/verdict-merge.test.ts`):全 unverifiable 不 all-green;unverifiable + fail 混合保留 fail 阻断;缺省 fail 回归。
- **回归**:`npm run check` 全量通过;历史 finding(无 verdict 字段)按 fail 缺省,合并结果不变。

## Current State

现有实现引用(file:line 准确性以 build 时复核为准):

| 现有产物 | 位置 | 现有行为 |
|---------|------|---------|
| spec-check Output Format | `.claude/agents/spec-check.md:252-314` | Markdown 表 Status 列只有 ✅/❌/⚠️;Structured JSON finding 无 verdict 字段 |
| spec-check Severity Judgment 表 | `.claude/agents/spec-check.md:318-335` | 无 unverifiable 行 |
| Independent Verification 铁律 | `skills/forge/lib/review/instructions.md`(review-adversarial-stance 引入) | 当前 4 条规则,无 unverifiable 复核规则 |
| 合并管线 finding schema | `src/review/merge-findings.ts`(确切路径 build 时核实) | finding 无 verdict 字段;isAllGreen 二元判定 |
| Adversarial Stance 铁律 | `.claude/agents/spec-check.md`(review-adversarial-stance 引入) | 原文不变,本 spec 仅在其后追加澄清段 |

## Proposed Change

### 要改变的
- spec-check.md:Output Format 表追加 unverifiable 示例行;Structured JSON finding 加 verdict/unverifiable_reason 可选字段;Severity Judgment 表加 unverifiable 行;新增 Decision Flow 章节。
- review/instructions.md:Independent Verification 章节追加第 5 条复核规则。
- 合并管线:finding schema 加 verdict?/unverifiable_reason?;isAllGreen 改为处理 unverifiable。

### 明确不改变的
- review 三层架构(spec-check/quality-check/security-check 并行)不变。
- Turn Budget Discipline、Final Report Block、REPORT_START/END sentinel 机制不变。
- fallback ladder 不变。
- quality-check / security-check 的 Output Format 不变(它们职责在 diff 内)。
- 现有 P0/P1/P2/P3 severity 语义不变(unverifiable 复用 P2)。

## Reversibility

### Rollback Checklist
1. 还原 `.claude/agents/spec-check.md`:删除 Decision Flow 章节、Severity Judgment 表的 unverifiable 行、Output Format 的 unverifiable 示例、Structured JSON 的 verdict/unverifiable_reason 字段。
2. 还原 `skills/forge/lib/review/instructions.md`:删除 Independent Verification 第 5 条。
3. 还原合并管线:移除 verdict/unverifiable_reason 字段、isAllGreen 恢复二元判定。
4. 删除测试文件 `test/review/verdict-schema.test.ts`、`test/review/verdict-merge.test.ts`。
5. 跑 `npm run check` 确认无回归。

### Mount Points
- `.claude/agents/spec-check.md` 的 Output Format / Severity Judgment 章节。
- `skills/forge/lib/review/instructions.md` 的 Independent Verification 章节。
- 合并管线的 finding schema 定义与 isAllGreen 函数。

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| reviewer 滥用 unverifiable 逃避深查(所有难点都标 unverifiable) | Decision Flow 入口条件严格:必须先确认"文件存在但未被 diff 改动",否则标 fail;reviewer 滥用会被 controller 复核发现并升级为 P1 |
| controller 复核也跳过(双重偷懒) | R3.AC3 明确:unverifiable 不计入全绿,controller 必须完成复核才能标通过;ship gate 可校验 |
| TS schema 扩展破坏历史 finding 解析 | verdict 字段可选 + 缺省 fail,向后兼容 |

## Rollout

- 纯文档 + 轻量 TS 改动,无数据迁移,无配置迁移。
- 一次性 ship,无灰度需求(向后兼容保证历史 review 报告不受影响)。

## Open Questions

- 合并管线 finding schema 的确切文件路径(`src/review/merge-findings.ts`?)需在 plan/build 阶段核实。
- ship gate 是否需要额外校验"所有 unverifiable 已被 controller 复核"?当前设计依赖 controller 自律,可选增强。
