---
feature: review-unverifiable-verdict
status: locked
date: 2026-06-21
layout: tasks
created: 2026-06-21
spec_ref: ".forge/specs/review-unverifiable-verdict/requirements.md"
---

# Tasks

## Overview

为本 spec 执行 TDD:先扩展合并管线的 verdict 枚举(RED→GREEN),再追加 spec-check.md 与 review/instructions.md 的 Markdown 约束。纯文档 + 轻量 TS,无新模块。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["T-01", "T-02"] },
    { "wave": 2, "tasks": ["T-03", "T-04"] },
    { "wave": 3, "tasks": ["T-05"] }
  ]
}
```

## Task Definitions

### T-01 合并管线 verdict schema 扩展

- **Goal**: finding schema 支持 verdict/unverifiable_reason 可选字段,缺省 fail
- **Depends On**: 无
- **TDD Steps**:
  - RED — `test/review/verdict-schema.test.ts` 写失败测试:parseFinding 接受三值 verdict;缺省 fail;unverifiable 强制 P2 + reason 非空;文件不存在判 fail
  - GREEN — 修改 finding schema 加 `verdict?` + `unverifiable_reason?`,缺省 fail
  - REFACTOR — 提取 Verdict 类型与缺省逻辑到独立导出
- **Verify Command**: `npx vitest run test/review/verdict-schema.test.ts`
- **Definition of Done**: 4 个测试通过;历史 finding(无 verdict)回归测试通过

### T-02 合并管线全绿判定处理 unverifiable

- **Goal**: isAllGreen 在存在 unverifiable 时返回非全绿 + 待复核列表
- **Depends On**: T-01
- **TDD Steps**:
  - RED — `test/review/verdict-merge.test.ts` 写失败测试:全 unverifiable 不 all-green;unverifiable + fail 混合保留 fail 阻断;缺省 fail 回归
  - GREEN — 修改 isAllGreen,unverifiable 存在时返回 `{allGreen: false, pending_controller_verification}`
  - REFACTOR — 抽取 AllGreenResult 类型
- **Verify Command**: `npx vitest run test/review/verdict-merge.test.ts`
- **Definition of Done**: 3 个测试通过

### T-03 spec-check.md Output Format 与 Severity Judgment 扩展

- **Goal**: spec-check 文档允许 unverifiable 结论并给出判定依据
- **Depends On**: 无(可与 T-01/T-02 并行,文档先行)
- **TDD Steps**:
  - RED — bash 契约测试:`grep 'unverifiable' .claude/agents/spec-check.md` 应非空(当前失败)
  - GREEN — 在 Markdown Report Format 表追加 `❓ unverifiable` 示例行;Structured JSON finding 加 verdict/unverifiable_reason 可选字段及缺省说明;Severity Judgment 表末尾追加 unverifiable 行
  - REFACTOR — 无
- **Verify Command**: `bash -c "grep -q 'unverifiable' .claude/agents/spec-check.md && grep -q 'outside the diff (unverifiable)' .claude/agents/spec-check.md"`
- **Definition of Done**: grep 双重命中;Output Format 现有结构未被破坏

### T-04 spec-check.md 新增 Decision Flow 章节

- **Goal**: reviewer 明确知道遇到未改动文件需求点时的判定流程
- **Depends On**: T-03(同文件追加)
- **TDD Steps**:
  - RED — bash 契约测试:`grep '## Unverifiable Verdict Decision Flow' .claude/agents/spec-check.md` 应非空
  - GREEN — 在 Severity Judgment 之后、Final Report Block 之前插入 Decision Flow 章节:四分支决策树 + "标记后停止工具调用"铁律 + Adversarial Stance 澄清段
  - REFACTOR — 无
- **Verify Command**: `bash -c "grep -q '## Unverifiable Verdict Decision Flow' .claude/agents/spec-check.md"`
- **Definition of Done**: 章节存在;四分支完整;澄清段不与现有 Adversarial Stance 冲突

### T-05 review/instructions.md Independent Verification 追加第 5 条

- **Goal**: controller 收到 unverifiable 时被强制复核
- **Depends On**: T-02(全绿判定已支持 unverifiable)
- **TDD Steps**:
  - RED — bash 契约测试:`grep 'unverifiable' skills/forge/lib/review/instructions.md` 应非空且命中"controller 必须亲自"
  - GREEN — 在 Independent Verification 规则列表末尾追加第 5 条:controller 须亲自 Read 复核 + 升级/保留/不计入全绿三路径
  - REFACTOR — 无
- **Verify Command**: `bash -c "grep -q 'unverifiable' skills/forge/lib/review/instructions.md && grep -q 'controller 必须亲自' skills/forge/lib/review/instructions.md"`
- **Definition of Done**: 第 5 条存在;三种处理路径齐全;现有 4 条规则未被改动

### T-06 全量验证

- **Goal**: 全套测试 + 契约校验通过
- **Depends On**: T-01, T-02, T-03, T-04, T-05
- **TDD Steps**: 无(验证任务)
- **Verify Command**: `npm run check`
- **Definition of Done**: `npm run check` 全量通过;`bash scripts/check-spec-contract.sh .forge/specs/review-unverifiable-verdict/requirements.md` 通过
