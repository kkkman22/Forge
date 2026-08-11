---
topic: "phase-advance-hardening"
date: "2026-05-09"
tier: "standard"
phase: "shipped"
commit: "1f8beb38c3766d23891d8cd51523202e420778d5"
review_result: "pass"
test_result: "pass"
tests_run: 20
tests_passed: 20
p0_count: 0
p1_count: 0
---

## Ship Summary

phase-advance-hardening: 修复 SKILL 驱动模式下的阶段推进断点（Auto_Advance_Break）。

### 三层防御

1. **Layer 1 — Plan 结构预防**: `checkPlanStructure()` 检测 monolith plan（>15 tasks / multi-Sprint / 链式依赖），forge-plan Self-Check 集成
2. **Layer 2 — R3 规则注入**: evolved-rules R3 "Sprint Is Not Phase Boundary" 在会话启动时注入
3. **Layer 3 — Stop hook 兜底**: `persistent-loop.sh` Cases 5-10 覆盖所有阶段转换（plan→build→review→test→ship→learn）

### 新增文件

- `scripts/lint-evolved-rules.mjs`: evolved-rules lint 脚本
- `test/persistent-loop.test.sh`: 13 个 shell 测试
- `test/plan-structure.test.ts`: 7 个 TypeScript 测试
- `test/fixtures/real-cases/monolith-plan.md`: 真实 monolith plan fixture
- `skills/forge-plan/references/plan-split-wizard.md`: plan split wizard 文档

### 修改文件

- `src/plan.ts`: +`checkPlanStructure`, +`SplitTriggerResult`
- `src/index.ts`: 导出新增符号
- `scripts/persistent-loop.sh`: Cases 5-10 + dedupe + helpers
- `skills/forge-plan/SKILL.md`: Self-Check 集成 plan structure
- `.tinkerman/knowledge/evolved-rules.md`: R3 规则
- `.gitignore`: dedupe marker 排除
- `package.json`: `lint:rules` 脚本
- `CHANGELOG.md`: Unreleased 段落
