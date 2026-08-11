---
topic: "phase-advance-hardening"
status: "approved"
date: "2026-05-08"
spec_ref: ".kiro/specs/phase-advance-hardening"
format: "lightweight"
---

## Objective

修复 SKILL 驱动模式下阶段推进断点（Auto_Advance_Break）。三层防御：Plan 结构预防（forge-plan Self-Check）+ R3 规则注入（SessionStart hook）+ Stop hook 兜底（persistent-loop.sh Case 5-10）。不修改 SKILL 外部契约、不新增运行时依赖、不增加 CLAUDE.md 条款。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#component-1-plan_structure_checktypescript` | SplitTriggerResult 接口 + checkPlanStructure 函数，四条判定规则 |
| `design.md#component-2-forge-plan-skill-extensionmarkdown` | §2.4 Self-Check 追加 Plan Structure 行、§9 Edge Case 替换、plan-split-wizard.md |
| `design.md#component-3-evolved-rulesmd-r3markdown` | R3: Sprint Is Not Phase Boundary，rule_count 2→3 |
| `design.md#component-4-persistent-loopsh-extensionshell` | compute_phase_state_hash、check_and_mark_dedupe、cleanup_dedupe_stale、Case 5-10 |
| `design.md#component-5-stop-hook-judgment-priority` | 判定顺序状态机：Case 10 优先于 Case 5-9，Case 1-4 保持不变 |
| `design.md#data-models` | Phase_State_Tuple（9 字段 sha1）、Dedupe Marker 文件、Plan frontmatter monolith_acknowledged |
| `design.md#error-handling` | fail-silent/fail-open 异常路径，.tinkerman/status.md 缺失→exit 0 |
| `design.md#testing-strategy` | Shell 测试覆盖矩阵（12 scenario）+ TypeScript 测试（6 scenario）+ 真实案例 regression |

## File Mapping

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `.tinkerman/knowledge/evolved-rules.md` | MODIFY | 追加 R3 条目，rule_count 2→3 |
| `src/plan.ts` | MODIFY | 追加 SplitTriggerResult 接口 + checkPlanStructure 函数 |
| `src/index.ts` | MODIFY | 导出新增符号 SplitTriggerResult + checkPlanStructure |
| `skills/forge-plan/SKILL.md` | MODIFY | §2.4 追加 Plan Structure 行，§9 删除 "Task count > 20" 条目，§5 前插入交互描述，§7 记录 monolith_acknowledged |
| `skills/forge-plan/references/plan-split-wizard.md` | CREATE | Plan 拆分向导流程描述 |
| `scripts/persistent-loop.sh` | MODIFY | 追加辅助函数（dedupe 三件套）+ Case 5-10 |
| `scripts/lint-evolved-rules.mjs` | CREATE | evolved-rules.md rule_count 与实际标题数一致性校验 |
| `.gitignore` | MODIFY | 追加 `.tinkerman/.stop-hook-dedupe/` |
| `test/persistent-loop.test.sh` | CREATE | Shell 测试 12 scenario |
| `test/plan-structure.test.ts` | CREATE | TypeScript 测试 6+ scenario |
| `test/fixtures/real-cases/` | CREATE | 真实案例 fixture 目录 |
| `package.json` | MODIFY | scripts 追加 `lint:rules`，check 中串联 |
| `CHANGELOG.md` | MODIFY | 追加 Auto_Advance_Break 兜底机制条目 |

## Task Breakdown

### Task 1: 添加 evolved-rules R3

- **Goal**: 在 evolved-rules.md 追加 R3 (Sprint Is Not Phase Boundary) 规则条目
- **File**: `.tinkerman/knowledge/evolved-rules.md`
- **Design Reference**: `design.md#component-3-evolved-rulesmd-r3markdown` — R3 规则内容覆盖三个要点：Sprint≠阶段边界、build 连续执行、plan 结构复核
- **Property**: Requirement 1
- **Depends On**: (none)
- **Verify**: `grep -c '### R3:' .tinkerman/knowledge/evolved-rules.md` 返回 1，frontmatter `rule_count: 3`
- **Commit**: `feat(evolved-rules): add R3 Sprint Is Not Phase Boundary`

### Task 2: 实现 Plan_Structure_Check 核心函数

- **Goal**: 在 src/plan.ts 添加 SplitTriggerResult 接口和 checkPlanStructure 函数，实现四条判定规则
- **File**: `src/plan.ts`, `src/index.ts`
- **Design Reference**: `design.md#component-1-plan_structure_checktypescript` — 四条 Split_Trigger_Condition：task>15、Sprint标题≥2、交付类任务名、链式Sprint依赖
- **Property**: Requirement 2
- **Depends On**: (none)
- **Verify**: `npx tsc --noEmit` 无错误，`npm test` 现有测试通过
- **Commit**: `feat(plan): add checkPlanStructure with split trigger detection`

### Task 3: 集成 Plan_Structure_Check 到 forge-plan SKILL

- **Goal**: 修改 forge-plan SKILL.md §2.4 追加 Plan Structure 行、删除 §9 旧条目、新增 plan-split-wizard.md、描述用户交互、定义 monolith_acknowledged 语义
- **File**: `skills/forge-plan/SKILL.md`, `skills/forge-plan/references/plan-split-wizard.md`
- **Design Reference**: `design.md#component-2-forge-plan-skill-extensionmarkdown` — §2.4 Self-Check 表格追加、§9 替换、拆分向导流程
- **Property**: Requirement 2
- **Depends On**: Task 2
- **Verify**: `grep 'Plan Structure' skills/forge-plan/SKILL.md` 有输出，`test -f skills/forge-plan/references/plan-split-wizard.md` 成功
- **Commit**: `feat(forge-plan): integrate Plan Structure Check into Self-Check`

### Task 4: 扩展 persistent-loop.sh 辅助函数

- **Goal**: 在 persistent-loop.sh 新增 dedupe 三件套辅助函数（compute_phase_state_hash、check_and_mark_dedupe、cleanup_dedupe_stale）+ .gitignore 追加 dedupe 目录
- **File**: `scripts/persistent-loop.sh`, `.gitignore`
- **Design Reference**: `design.md#component-4-persistent-loopsh-extensionshell` — 9 字段 sha1 hash、60s TTL fail-open dedupe、>24h cleanup
- **Property**: Requirement 4
- **Depends On**: (none)
- **Verify**: `bash -n scripts/persistent-loop.sh` 无语法错误，`grep -c 'compute_phase_state_hash\|check_and_mark_dedupe\|cleanup_dedupe_stale' scripts/persistent-loop.sh` 返回 ≥3
- **Commit**: `feat(hook): add dedupe helpers and gitignore entry`

### Task 5: 实现 Case 5 (plan → build)

- **Goal**: 在 persistent-loop.sh Case 4 后添加 Case 5 分支：判定 plan approved + tier≠light + progress 空，注入 build 推进指令
- **File**: `scripts/persistent-loop.sh`
- **Design Reference**: `design.md#component-4-persistent-loopsh-extensionshell` — Case 5 plan→build 判定条件
- **Property**: Requirement 3.2
- **Depends On**: Task 4
- **Verify**: `bash -n scripts/persistent-loop.sh`，grep Case 5 存在
- **Commit**: `feat(hook): add Case 5 plan-to-build auto-advance`

### Task 6: 实现 Case 6 (build → review)

- **Goal**: 添加 Case 6：progress 全 [x] + review 不存在或过期，注入 review 推进指令
- **File**: `scripts/persistent-loop.sh`
- **Design Reference**: `design.md#component-4-persistent-loopsh-extensionshell` — Case 6 build→review 判定
- **Property**: Requirement 3.3
- **Depends On**: Task 4
- **Verify**: `bash -n scripts/persistent-loop.sh`，grep Case 6 存在
- **Commit**: `feat(hook): add Case 6 build-to-review auto-advance`

### Task 7: 实现 Case 7 (review → test)

- **Goal**: 添加 Case 7：review pass (P0=0, P1=0) + tier∈(standard,full) + test 不存在，注入 test 推进指令
- **File**: `scripts/persistent-loop.sh`
- **Design Reference**: `design.md#component-4-persistent-loopsh-extensionshell` — Case 7 review→test 判定
- **Property**: Requirement 3.4
- **Depends On**: Task 4
- **Verify**: `bash -n scripts/persistent-loop.sh`，grep Case 7 存在
- **Commit**: `feat(hook): add Case 7 review-to-test auto-advance`

### Task 8: 实现 Case 8 (test → ship)

- **Goal**: 添加 Case 8：test pass + ship artifact 不存在，注入 ship 推进指令
- **File**: `scripts/persistent-loop.sh`
- **Design Reference**: `design.md#component-4-persistent-loopsh-extensionshell` — Case 8 test→ship 判定
- **Property**: Requirement 3.5
- **Depends On**: Task 4
- **Verify**: `bash -n scripts/persistent-loop.sh`，grep Case 8 存在
- **Commit**: `feat(hook): add Case 8 test-to-ship auto-advance`

### Task 9: 实现 Case 9 (ship → learn)

- **Goal**: 添加 Case 9：phase=ship + tier=full + ship artifact 存在 + learn 不存在，注入 learn 推进指令
- **File**: `scripts/persistent-loop.sh`
- **Design Reference**: `design.md#component-4-persistent-loopsh-extensionshell` — Case 9 ship→learn 判定
- **Property**: Requirement 3.6
- **Depends On**: Task 4
- **Verify**: `bash -n scripts/persistent-loop.sh`，grep Case 9 存在
- **Commit**: `feat(hook): add Case 9 ship-to-learn auto-advance`

### Task 10: 实现 Case 10 (loop handoff)

- **Goal**: 在 Case 5 之前添加 Case 10：mode=autonomous + progress 有未完成任务或 skill_sequence 未走完，注入 loop handoff 指令。优先于 Case 5-9 判定
- **File**: `scripts/persistent-loop.sh`
- **Design Reference**: `design.md#component-5-stop-hook-judgment-priority` — Case 10 优先判定，共享 dedupe
- **Property**: Requirement 5
- **Depends On**: Task 4, Task 5
- **Verify**: `bash -n scripts/persistent-loop.sh`，grep Case 10 存在，Case 10 代码在 Case 5 之前
- **Commit**: `feat(hook): add Case 10 loop iteration handoff`

### Task 11: Shell 测试 — 回归 + 新 case

- **Goal**: 创建 test/persistent-loop.test.sh，覆盖 12 scenario：6 个新 case 正向 + dedupe + stale + unknown-phase + light-tier + 2 个既有 case 回归
- **File**: `test/persistent-loop.test.sh`
- **Design Reference**: `design.md#testing-strategy` — Shell 测试覆盖矩阵
- **Property**: Requirement 8
- **Depends On**: Task 5, Task 6, Task 7, Task 8, Task 9, Task 10
- **Verify**: `bash test/persistent-loop.test.sh` 全部通过
- **Commit**: `test(hook): add persistent-loop shell test suite`

### Task 12: 真实案例 fixture + checkPlanStructure 测试

- **Goal**: 创建 test/fixtures/real-cases/ 目录，用合成的 monolith plan fixture 替代不存在的 cmux-integration.md；创建 test/plan-structure.test.ts 覆盖 6+ scenario
- **File**: `test/fixtures/real-cases/monolith-plan.md`, `test/plan-structure.test.ts`
- **Design Reference**: `design.md#testing-strategy` — TypeScript 测试 + 真实案例 regression
- **Property**: Requirement 8
- **Depends On**: Task 2
- **Verify**: `npm test -- test/plan-structure.test.ts` 全部通过
- **Commit**: `test(plan): add plan structure check unit tests with fixture`

### Task 13: evolved-rules lint 脚本

- **Goal**: 创建 scripts/lint-evolved-rules.mjs 读取 frontmatter rule_count 与正文 ### R\d+: 标题数对比，不一致时 exit 1；在 package.json 追加 lint:rules 并串联到 check
- **File**: `scripts/lint-evolved-rules.mjs`, `package.json`
- **Design Reference**: `design.md#testing-strategy` — evolved-rules 一致性校验
- **Property**: Requirement 8
- **Depends On**: Task 1
- **Verify**: `npm run lint:rules` 通过，`npm run check` 通过
- **Commit**: `feat(lint): add evolved-rules consistency checker`

### Task 14: 文档与 CHANGELOG

- **Goal**: 更新 CHANGELOG.md 描述 6 种自动推进场景；在 persistent-loop.sh 新 case 注释中标注 Requirement 号
- **File**: `CHANGELOG.md`, `scripts/persistent-loop.sh`
- **Design Reference**: `design.md#testing-strategy` — 文档可观测性
- **Property**: Requirement 9
- **Depends On**: Task 5, Task 6, Task 7, Task 8, Task 9, Task 10
- **Verify**: `grep 'AUTO-ADVANCE' CHANGELOG.md` 有输出
- **Commit**: `docs: add changelog for phase advance hardening`

### Task 15: 最终验证

- **Goal**: 运行完整验证套件：shell 测试 + TS 测试 + npm run check + lint:rules
- **File**: (none)
- **Design Reference**: `design.md#testing-strategy` — 最终验证门禁
- **Property**: Requirement 8
- **Depends On**: Task 11, Task 12, Task 13
- **Verify**: 所有命令 exit 0
- **Commit**: (none — verification only)

### Task 16: 验证 design.md 状态机图

- **Goal**: 确认 design.md mermaid 状态机图正确反映最终判定顺序（Case 1-4 → Case 10 → Case 5-9 → Case 4 cleanup → exit）
- **File**: `.kiro/specs/phase-advance-hardening/design.md`
- **Design Reference**: `design.md#component-5-stop-hook-judgment-priority`
- **Property**: Requirement 9
- **Depends On**: Task 10
- **Verify**: 人工审阅状态机图与代码一致
- **Commit**: `docs: verify state machine diagram matches implementation`

## Spec Coverage

| Requirement | Covering Tasks |
|-------------|---------------|
| Requirement 1 (R3 规则) | Task 1 |
| Requirement 2 (Plan_Structure_Check) | Task 2, Task 3 |
| Requirement 3 (Stop hook Case 5-9) | Task 5, Task 6, Task 7, Task 8, Task 9 |
| Requirement 4 (Dedupe 机制) | Task 4 |
| Requirement 5 (Loop handoff Case 10) | Task 10 |
| Requirement 6 (非侵入回退) | Task 11 (stale/unknown/light scenario) |
| Requirement 7 (禁止指令扩展) | Task 1 (R3 是唯一新规则出口) |
| Requirement 8 (回归测试) | Task 11, Task 12, Task 13, Task 15 |
| Requirement 9 (文档可观测性) | Task 14, Task 16 |
