---
feature: phase-advance-hardening
layout: tasks
created: 2026-05-08
spec_ref: ".tinkerman/specs/phase-advance-hardening/requirements.md"
---

# Tasks: Phase Advance Hardening

## Task 1: 添加 evolved-rules R3

- [x] 1.1 在 `.tinkerman/knowledge/evolved-rules.md` 追加 R3 条目（Sprint Is Not Phase Boundary），格式参考 design.md Component 3
- [x] 1.2 更新该文件 frontmatter `rule_count: 2` → `rule_count: 3`
- [x] 1.3 验证 SessionStart hook 能正确注入扩展后的文件（启动新会话，确认 R3 出现在 context 注入日志中）

## Task 2: 实现 Plan_Structure_Check 核心函数

- [x] 2.1 在 `src/plan.ts` 添加 `SplitTriggerResult` 接口和 `checkPlanStructure` 函数（签名参考 design.md Component 1）
- [x] 2.2 实现四条判定规则：task 数 > 15、Sprint 标题 ≥ 2、交付类任务名、链式 Sprint 依赖
- [x] 2.3 在 `src/index.ts` 导出新增符号
- [x] 2.4 编写 unit test 覆盖每条判定规则的正负用例（见 design.md Testing Strategy）

## Task 3: 集成 Plan_Structure_Check 到 forge-plan SKILL

- [x] 3.1 修改 `skills/forge-plan/SKILL.md` §2.4 Self-Check 表格，追加 Plan Structure 行
- [x] 3.2 删除 §9 Edge Case 中"Task count > 20 提醒"条目
- [x] 3.3 新增 `skills/forge-plan/references/plan-split-wizard.md` 描述拆分向导流程（输入 split 后的交互）
- [x] 3.4 在 SKILL §5 User Approval 前插入 Plan_Structure_Check 触发后的用户交互描述（acknowledge / split / 其他）
- [x] 3.5 定义 frontmatter 字段 `monolith_acknowledged: true` 的语义并在 SKILL §7 Plan Document Format 中记录

## Task 4: 扩展 persistent-loop.sh 辅助函数

- [x] 4.1 在 `scripts/persistent-loop.sh` 新增 `compute_phase_state_hash` 函数（9 字段拼接 + sha1sum）
- [x] 4.2 新增 `check_and_mark_dedupe` 函数（60s TTL，fail-open）
- [x] 4.3 新增 `cleanup_dedupe_stale` 函数（>24h 清理）
- [x] 4.4 在 `.gitignore` 追加 `.tinkerman/.stop-hook-dedupe/` 条目
- [x] 4.5 在 hook 主流程早期调用 `cleanup_dedupe_stale`

## Task 5: 实现 Case 5 (plan → build)

- [x] 5.1 在 `persistent-loop.sh` 的 Case 4 之后添加 Case 5 分支
- [x] 5.2 判定条件：`phase=plan` + plan frontmatter `status: approved` + `tier != light` + progress 为空/不存在
- [x] 5.3 集成 dedupe 检查，注入 `🔄 [AUTO-ADVANCE] Plan 已批准...请立即调用 Skill(skill="forge", args="build")`
- [x] 5.4 命中后 `exit 0`，不评估后续 case
- [x] 5.5 在 `test/persistent-loop.test.sh` 添加 `plan-approved-build-not-started` 场景

## Task 6: 实现 Case 6 (build → review)

- [x] 6.1 添加 Case 6 分支：`phase=build` + progress 全 `[x]` + 最新 review mtime 早于 progress mtime 或不存在
- [x] 6.2 注入 `🔄 [AUTO-ADVANCE] Build 阶段所有任务已完成...请立即调用 Skill(skill="forge", args="review")`
- [x] 6.3 在测试文件添加 `build-done-review-missing` 场景

## Task 7: 实现 Case 7 (review → test)

- [x] 7.1 添加 Case 7 分支：`phase=review` + review frontmatter `result: pass, p0_count: 0, p1_count: 0` + tier ∈ (standard, full) + test-result 不存在或早于 review
- [x] 7.2 注入 `🔄 [AUTO-ADVANCE] Review 已通过...请立即调用 Skill(skill="forge", args="test")`
- [x] 7.3 在测试文件添加 `review-pass-test-missing` 场景

## Task 8: 实现 Case 8 (test → ship)

- [x] 8.1 添加 Case 8 分支：`phase=test` + 最新 test-result frontmatter `result: pass` + ship artifact 不存在
- [x] 8.2 注入 `🔄 [AUTO-ADVANCE] Test 阶段全部通过...请立即调用 Skill(skill="forge", args="ship")`
- [x] 8.3 在测试文件添加 `test-pass-ship-missing` 场景

## Task 9: 实现 Case 9 (ship → learn)

- [x] 9.1 添加 Case 9 分支：`phase=ship` + `tier=full` + ship artifact 存在 + learn session 不存在
- [x] 9.2 注入 `🔄 [AUTO-ADVANCE] Ship 已完成（tier=full）...请立即调用 Skill(skill="forge", args="learn")`
- [x] 9.3 在测试文件添加 `ship-done-full-tier-learn-missing` 场景

## Task 10: 实现 Case 10 (loop handoff)

- [x] 10.1 在 Case 5 之前（但 Case 1-4 之后）添加 Case 10 分支，保证 mode=autonomous 优先判定
- [x] 10.2 判定条件：`mode=autonomous` + (phase ∈ (ship, completed) 且 progress 有 `[ ]`) 或 skill_sequence 未走完
- [x] 10.3 注入 `🔄 [LOOP HANDOFF]...请立即调用 Skill(skill="forge", args="resume")`
- [x] 10.4 在测试文件添加 `loop-autonomous-progress-remaining` 场景

## Task 11: 回归测试既有 case

- [x] 11.1 添加 `existing-case1-p0p1-regression` 场景，断言 Case 1 auto-fix 行为不变
- [x] 11.2 添加 `existing-case3-build-exhaustion-regression` 场景，断言 Case 3 行为不变
- [x] 11.3 添加 `stale-status-silent` 场景（status.md > 2h），断言无输出
- [x] 11.4 添加 `unknown-phase-silent` 场景（phase=unknown），断言无输出
- [x] 11.5 添加 `light-tier-early-exit` 场景，断言 Case 5-10 在 light tier 下不触发
- [x] 11.6 添加 `dedupe-second-call-silent` 场景，连续两次调用断言第二次无输出

## Task 12: 真实案例 fixture

- [x] 12.1 将 `.tinkerman/plans/cmux-integration.md` 复制到 `test/fixtures/real-cases/cmux-integration-monolith.md`
- [x] 12.2 添加 unit test 断言 `checkPlanStructure` 对该 fixture 返回 `triggered: true`
- [x] 12.3 断言 reasons 至少包含三条（task 数、Sprint 标题、链式依赖）

## Task 13: Plan_Structure_Check TypeScript 测试

- [x] 13.1 创建 `test/plan-structure.test.ts`
- [x] 13.2 添加 `split-trigger-task-count` 测试（16 个 task）
- [x] 13.3 添加 `split-trigger-sprint-headings` 测试（2 个 `### Sprint` 标题）
- [x] 13.4 添加 `split-trigger-delivery-task-name` 测试（任务名含"Sprint 6 回归"）
- [x] 13.5 添加 `split-trigger-chained-deps` 测试
- [x] 13.6 添加 `no-trigger-small-plan` 测试
- [x] 13.7 添加 `monolith-acknowledged-bypass` 测试

## Task 14: 添加 evolved-rules lint 脚本

- [x] 14.1 创建 `scripts/lint-evolved-rules.mjs`
- [x] 14.2 实现：读取 frontmatter `rule_count` 字段与正文中 `### R\d+:` 标题数对比
- [x] 14.3 不一致时 exit 1 并输出差异
- [x] 14.4 在 `package.json` `scripts` 添加 `"lint:rules": "node scripts/lint-evolved-rules.mjs"`
- [x] 14.5 在 `npm run check` 中串联此脚本

## Task 15: 文档与 CHANGELOG

- [x] 15.1 更新 `.tinkerman/knowledge/glm-summary-ending.md` "实施优先级"章节，追加本 spec ID 和完成日期
- [x] 15.2 在 `CHANGELOG.md` 添加条目描述 Stop hook 覆盖的六种自动推进场景
- [x] 15.3 在 `scripts/persistent-loop.sh` 每个新 case 的注释中标注 Requirement 号（Requirement 3.2 到 3.6、5.2、5.3）
- [x] 15.4 在本 spec design.md 中确认 mermaid 状态机图正确反映最终实现的判定顺序

## Task 16: 最终验证

- [x] 16.1 运行完整 shell 测试套件 `bash test/persistent-loop.test.sh`，全部通过
- [x] 16.2 运行 TypeScript 测试 `npm test -- test/plan-structure.test.ts`，全部通过
- [x] 16.3 运行 `npm run check` 确认无 regression
- [x] 16.4 运行 `npm run lint:rules` 确认 evolved-rules.md 一致
- [x] 16.5 手动测试：构造一个 `.tinkerman/` 状态模拟 plan-approved-build-not-started，通过 Claude Code 触发一次 Stop 事件，确认注入文本出现
