---
topic: "resume-phase-coverage"
status: "approved"
date: "2026-05-09"
spec_ref: ".tinkerman/specs/resume-phase-coverage"
format: "lightweight"
---

# Plan: Resume Phase Coverage

> 来源: `.tinkerman/specs/resume-phase-coverage/tasks.md`

## Objective

修复 Forge 在 context compaction 恢复后遗漏当前阶段 SKILL.md 步骤的问题。三层防御：R4 evolved rule 注入 + forge-resume SKILL Reload 步骤 + 各阶段 SKILL.md Compaction Recovery Check 段落。

## Task Breakdown

- [ ] 1.1 新增 R4 evolved rule (`.tinkerman/knowledge/evolved-rules.md`)
- [ ] 1.2 forge-resume SKILL Reload Step (`skills/forge-resume/SKILL.md`)
- [ ] 2.1 forge-ship Compaction Recovery Check (`skills/forge-ship/SKILL.md`)
- [ ] 2.2 forge-review Compaction Recovery Check (`skills/forge-review/SKILL.md`)
- [ ] 2.3 forge-test Compaction Recovery Check (`skills/forge-test/SKILL.md`)
- [ ] 2.4 forge-learn Compaction Recovery Check (`skills/forge-learn/SKILL.md`)
- [ ] 3.1 验证 lint-evolved-rules.mjs (`scripts/lint-evolved-rules.mjs`) — depends: 1.1
- [ ] 3.2 SKILL.md 内容测试 (`test/`) — depends: 1.2, 2.1-2.4
- [ ] 4.1 CHANGELOG 更新 (`CHANGELOG.md`)
- [ ] 5.1 最终验证 — depends: all

## Execution Strategy

顺序执行。Task 1.1 和 1.2 无依赖可并行；Task 2.1-2.4 无依赖可并行；Task 3.1 等 1.1；Task 3.2 等 1.2+2.x；Task 5.1 等全部。

## Verification

- `npm run lint:rules` 通过（rule_count=4）
- `tsc --noEmit` 通过
- `npm test` 通过
- 5 个 SKILL.md 包含预期段落
