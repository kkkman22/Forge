---
feature: knowledge-tdd-methodology
layout: tasks
created: 2026-06-04
spec_ref: ".forge/specs/knowledge-tdd-methodology/requirements.md"
---

# Tasks

## Task 1: learn/instructions.md Evolved-Rules TDD 流程

- [ ] 1.1 在 `skills/forge/lib/learn/instructions.md` 中替换/增强 evolved-rules 生成逻辑为 TDD 三阶段
- [ ] 1.2 写入 Phase 1 (RED)：构造场景 → baseline 测试 → 止损机制
- [ ] 1.3 写入 Phase 2 (GREEN)：基于 baseline 写最小 rule
- [ ] 1.4 写入 Phase 3 (REFACTOR)：加载 rule 重测 → 连续 2 次通过上线
- [ ] 1.5 写入铁律声明

## Task 2: learn/instructions.md Skill/Instructions 变更验证

- [ ] 2.1 在 `skills/forge/lib/learn/instructions.md` 新增 "Skill/Instructions 变更验证" 章节
- [ ] 2.2 写入 5 步验证流程
- [ ] 2.3 写入豁免条件列表 + `[skip-skill-verify]` commit message 约定

## Task 3: evolved-rules.md 格式模板扩展

- [ ] 3.1 在 `.forge/knowledge/evolved-rules.md` 顶部注释模板追加 `Verified_via` 字段
- [ ] 3.2 在顶部注释模板追加 `Baseline_violation` 字段
- [ ] 3.3 确认现有 R1-R13 内容未被修改

## Task 4: 验证

- [ ] 4.1 确认 TDD 流程不与现有 learn 五维度提取逻辑冲突
- [ ] 4.2 确认现有 13 条 rules 格式不变
- [ ] 4.3 运行 `npm run check` 全量测试通过
