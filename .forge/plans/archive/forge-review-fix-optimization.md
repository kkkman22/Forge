---
topic: "forge-review-fix-optimization"
status: "approved"
date: "2026-04-29"
spec_ref: ".kiro/specs/forge-review-fix-optimization"
format: "lightweight"
---

## Objective

实现 review→fix→re-review→ship 循环的六项系统性优化：修复 context-budget.ts 的 3 个 P1 缺陷，新增 backlog/fix-checklist/incremental-verifier/fix-recovery 四个模块，扩展 ship.ts/state.ts 的功能，并更新 SKILL 文档以集成 CI 命令发现和上下文预算管理。

## Research Findings

### 来自知识库

- **ship-delivery-pure-functions.md**（confidence: N/A）：纯函数构建器 + execFileSync 模式、正则内联化、多字符序列检查
- **agent-team-migration.md**（confidence: N/A）：Subagent 并行执行模式，已迁移完成
- **instincts.md**：正则 `.test()` 用内联正则（0.85）、外部命令纯函数构建器（0.8）、多字符序列检查（0.7）

### 来自执行指标

- 历史 Plan 偏差率：高（>1.5），建议预估时间 ×1.25
- `npx vitest run` 成功率 100%，`npx biome check` 成功率 83% → 健康状态正常

### 来自代码库分析

- `src/context-budget.ts`：已有 10 个接口 + 18 个序列化/反序列化函数，需修复 enum 验证、explore passthrough、test output parse failure
- `src/ship.ts`：已有 `checkShipGate` 函数（ReviewResult + TestResult + ProgressResult → ShipGateResult）
- `src/state.ts`：已有保护分区（frozen/guarded/open）和锁机制，但无多任务状态追踪
- `src/index.ts`：barrel file 有 39 个 value exports，barrel-file.test.ts 验证精确数量
- 测试模式：`fast-check` 属性测试 + vitest 单元测试，属性测试用 `describe` + `fc.assert` + `fc.property` 模式

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#1-context-budget-module-extensions-srccontext-budgetts` | P1 修复：enum 验证、explore passthrough、test output rawOutput |
| `design.md#2-backlog-module-srcbacklogts--new` | BacklogEntry 接口 + parse/serialize/append/resolve 函数 |
| `design.md#3-fix-checklist-module-srcfix-checklistts--new` | ChecklistStatus 状态机 + createChecklist/updateEntry/allEntriesVerified |
| `design.md#4-incremental-verifier-module-srcincremental-verifierts--new` | VerificationStrategy + determineVerificationStrategy + 50-line threshold |
| `design.md#5-fix-recovery-module-srcfix-recoveryts--new` | RecoveryCandidate + isFixCandidate + parseGitLog |
| `design.md#6-ship-gate-extension-srcshipts` | checkShipGateWithChecklist 增加第四道门禁 |
| `design.md#7-multi-task-status-extension-srcstatets` | TaskStatusEntry + parse/serialize/upsert/remove/detectConflict |
| `design.md#8-skill-document-changes` | SKILL 文档新增 CI 命令和上下文预算章节 |
| `design.md#correctness-properties` | 26 个正确性属性定义（Property 1–26） |
| `design.md#data-models` | BacklogEntry、ChecklistEntry、TaskStatusEntry、TestOutputSummary 数据模型 |

## File Mapping

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/context-budget.ts` | MODIFY | 添加 isValidSeverity/isValidSubagentStatus、rawOutput 字段、修复 passthrough |
| `src/backlog.ts` | CREATE | BacklogEntry 接口 + parse/serialize/append/resolve/header 函数 |
| `src/fix-checklist.ts` | CREATE | ChecklistStatus + VALID_TRANSITIONS + create/update/verify/parse/serialize |
| `src/incremental-verifier.ts` | CREATE | VerificationStrategy + determineVerificationStrategy + buildVerificationCriteria |
| `src/fix-recovery.ts` | CREATE | RecoveryCandidate + isFixCandidate + parseGitLog |
| `src/ship.ts` | MODIFY | 添加 checkShipGateWithChecklist 函数 |
| `src/state.ts` | MODIFY | 添加 TaskStatusEntry + parse/serialize/upsert/remove/detectConflict |
| `src/index.ts` | MODIFY | 导出所有新增类型和函数 |
| `test/context-budget.property.test.ts` | MODIFY | 添加 Property 2, 5, 26 |
| `test/context-budget-passthrough.test.ts` | MODIFY | 添加 vitest 格式兼容测试 |
| `test/context-budget-roundtrip.property.test.ts` | MODIFY | 验证 Property 4 覆盖 rawOutput 字段 |
| `test/backlog.property.test.ts` | CREATE | Property 12, 13, 14, 15 |
| `test/backlog.test.ts` | CREATE | header 生成、空 backlog、legacy 格式 |
| `test/fix-checklist.property.test.ts` | CREATE | Property 16, 17, 18 |
| `test/fix-checklist.test.ts` | CREATE | 转换序列、回归检测场景 |
| `test/incremental-verifier.property.test.ts` | CREATE | Property 20 |
| `test/fix-recovery.property.test.ts` | CREATE | Property 25 |
| `test/fix-recovery.test.ts` | CREATE | git log 解析、无匹配场景 |
| `test/ship.property.test.ts` | MODIFY | 添加 Property 19 |
| `test/multi-task-status.property.test.ts` | CREATE | Property 21, 22, 23, 24 |
| `test/multi-task-status.test.ts` | CREATE | legacy 格式迁移、向后兼容 |
| `test/barrel-file.test.ts` | MODIFY | 更新 value exports 数量和列表 |
| `test/skill-contract.test.ts` | CREATE | SKILL 文档 CI 命令和上下文预算章节检查 |
| `skills/forge-build/SKILL.md` | MODIFY | 添加 CI 验证命令 + 上下文预算管理章节 |
| `skills/forge-test/SKILL.md` | MODIFY | 添加 CI 验证命令章节 |
| `skills/forge-review/SKILL.md` | MODIFY | 扩展上下文预算管理章节 |
| `skills/forge-decide/SKILL.md` | MODIFY | 添加上下文预算管理章节 |

## Task Breakdown

### Task 1: Add runtime enum validation helpers

- **Goal**: 在 context-budget.ts 中添加 isValidSeverity 和 isValidSubagentStatus 验证函数，并集成到 deserializeReviewSummary 和 deserializeSubagentSummary
- **File**: `src/context-budget.ts`
- **Design Reference**: `design.md#1-context-budget-module-extensions-srccontext-budgetts` — 添加 isValidSeverity/isValidSubagentStatus，在 deserializer 中验证 enum 值
- **Property**: Property 26
- **Depends On**: (none)
- **Verify**: `npx vitest run --grep "context-budget"`
- **Commit**: `fix(context-budget): add runtime enum validation to deserializers`

### Task 2: Fix explore error/empty passthrough

- **Goal**: 修复 serializeExploreResult 的空对象场景，确保返回 passthrough message；确保 string error 原样返回
- **File**: `src/context-budget.ts`
- **Design Reference**: `design.md#1-context-budget-module-extensions-srccontext-budgetts` — 硬化空对象和 error string passthrough 逻辑
- **Property**: Property 2
- **Depends On**: (none)
- **Verify**: `npx vitest run --grep "explore"`
- **Commit**: `fix(context-budget): harden explore error/empty passthrough`

### Task 3: Fix test output parse failure retention

- **Goal**: 在 TestOutputSummary 接口添加 rawOutput 字段，deserializeTestOutput 在 parseFailed 时保留原始输入
- **File**: `src/context-budget.ts`
- **Design Reference**: `design.md#1-context-budget-module-extensions-srccontext-budgetts` — 新增 rawOutput 字段，parseFailed 时赋值原始文本
- **Property**: Property 5
- **Depends On**: (none)
- **Verify**: `npx vitest run --grep "test-output"`
- **Commit**: `fix(context-budget): retain raw output on parse failure`

### Task 4: Property tests for P1 fixes

- **Goal**: 在 context-budget.property.test.ts 添加 Property 2（explore passthrough）、Property 5（test output parse failure）、Property 26（enum validation）；在 context-budget-passthrough.test.ts 添加 vitest 格式兼容测试
- **File**: `test/context-budget.property.test.ts`, `test/context-budget-passthrough.test.ts`
- **Design Reference**: `design.md#correctness-properties` — Property 2, 5, 26 的定义和验证要求
- **Depends On**: Task 1, Task 2, Task 3
- **Verify**: `npx vitest run --grep "context-budget"`
- **Commit**: `test(context-budget): add property tests for P1 fixes`

### Task 5: Checkpoint — Verify P1 fixes pass CI

- **Goal**: 运行 npm run check 确保 P1 修复通过全部测试（包括已有的 Property 1, 3, 4, 6, 7, 8, 9, 10, 11）
- **File**: (none — verification only)
- **Design Reference**: N/A
- **Depends On**: Task 4
- **Verify**: `npm run check`
- **Commit**: (no commit — checkpoint verification)

### Task 6: Implement backlog module

- **Goal**: 创建 src/backlog.ts，实现 BacklogEntry 接口、parseBacklog、serializeBacklog、appendToBacklog、findOverlappingEntries、resolveEntry、generateBacklogHeader
- **File**: `src/backlog.ts`
- **Design Reference**: `design.md#2-backlog-module-srcbacklogts--new` — BacklogEntry 接口定义和所有函数签名
- **Depends On**: (none)
- **Verify**: `npx vitest run --grep "backlog"`
- **Commit**: `feat(backlog): implement backlog module with parse/serialize/append/resolve`

### Task 7: Property and unit tests for backlog

- **Goal**: 创建 test/backlog.property.test.ts（Property 12, 13, 14, 15）和 test/backlog.test.ts（header 生成、空 backlog、legacy 格式）
- **File**: `test/backlog.property.test.ts`, `test/backlog.test.ts`
- **Design Reference**: `design.md#correctness-properties` — Property 12（dedup）、13（overlap）、14（resolve）、15（round-trip）
- **Depends On**: Task 6
- **Verify**: `npx vitest run --grep "backlog"`
- **Commit**: `test(backlog): add property and unit tests`

### Task 8: Implement fix-checklist module

- **Goal**: 创建 src/fix-checklist.ts，实现 ChecklistStatus、ChecklistEntry、VALID_TRANSITIONS、isValidTransition、createChecklist、updateEntryStatus、allEntriesVerified、parseChecklist、serializeChecklist
- **File**: `src/fix-checklist.ts`
- **Design Reference**: `design.md#3-fix-checklist-module-srcfix-checklistts--new` — ChecklistStatus 状态机和所有函数签名
- **Depends On**: (none)
- **Verify**: `npx vitest run --grep "fix-checklist"`
- **Commit**: `feat(fix-checklist): implement checklist module with state machine`

### Task 9: Property and unit tests for fix-checklist

- **Goal**: 创建 test/fix-checklist.property.test.ts（Property 16, 17, 18）和 test/fix-checklist.test.ts（转换序列、回归检测场景）
- **File**: `test/fix-checklist.property.test.ts`, `test/fix-checklist.test.ts`
- **Design Reference**: `design.md#correctness-properties` — Property 16（P0/P1 filter）、17（transition）、18（round-trip）
- **Depends On**: Task 8
- **Verify**: `npx vitest run --grep "fix-checklist"`
- **Commit**: `test(fix-checklist): add property and unit tests`

### Task 10: Implement incremental-verifier module

- **Goal**: 创建 src/incremental-verifier.ts，实现 VerificationStrategy、VerificationDecision、VerificationResult、INCREMENTAL_THRESHOLD（50）、determineVerificationStrategy、buildVerificationCriteria
- **File**: `src/incremental-verifier.ts`
- **Design Reference**: `design.md#4-incremental-verifier-module-srcincremental-verifierts--new` — threshold 50-line 决策和 criteria 构建
- **Depends On**: (none)
- **Verify**: `npx vitest run --grep "incremental-verifier"`
- **Commit**: `feat(incremental-verifier): implement verification strategy module`

### Task 11: Property test for incremental-verifier

- **Goal**: 创建 test/incremental-verifier.property.test.ts（Property 20：threshold 边界验证）
- **File**: `test/incremental-verifier.property.test.ts`
- **Design Reference**: `design.md#correctness-properties` — Property 20（<50 → incremental, >=50 → targeted-review）
- **Depends On**: Task 10
- **Verify**: `npx vitest run --grep "incremental-verifier"`
- **Commit**: `test(incremental-verifier): add property test for threshold`

### Task 12: Implement fix-recovery module

- **Goal**: 创建 src/fix-recovery.ts，实现 RecoveryCandidate、RecoveryResult、isFixCandidate（±10 line tolerance）、parseGitLog
- **File**: `src/fix-recovery.ts`
- **Design Reference**: `design.md#5-fix-recovery-module-srcfix-recoveryts--new` — isFixCandidate 匹配逻辑和 git log 解析格式
- **Depends On**: (none)
- **Verify**: `npx vitest run --grep "fix-recovery"`
- **Commit**: `feat(fix-recovery): implement git history fix recovery module`

### Task 13: Property and unit tests for fix-recovery

- **Goal**: 创建 test/fix-recovery.property.test.ts（Property 25）和 test/fix-recovery.test.ts（git log 解析、无匹配场景、malformed 输入）
- **File**: `test/fix-recovery.property.test.ts`, `test/fix-recovery.test.ts`
- **Design Reference**: `design.md#correctness-properties` — Property 25（±10 line tolerance 匹配）
- **Depends On**: Task 12
- **Verify**: `npx vitest run --grep "fix-recovery"`
- **Commit**: `test(fix-recovery): add property and unit tests`

### Task 14: Checkpoint — Verify all new modules pass CI

- **Goal**: 运行 npm run check 确保四个新模块编译通过、所有测试通过
- **File**: (none — verification only)
- **Design Reference**: N/A
- **Depends On**: Task 7, Task 9, Task 11, Task 13
- **Verify**: `npm run check`
- **Commit**: (no commit — checkpoint verification)

### Task 15: Extend ship.ts with checklist gate

- **Goal**: 在 src/ship.ts 添加 checkShipGateWithChecklist 函数，接受可选 ChecklistEntry[] 参数，增加第四道门禁（所有 P0/P1 必须为 verified）
- **File**: `src/ship.ts`
- **Design Reference**: `design.md#6-ship-gate-extension-srcshipts` — 保留 checkShipGate 不变，新增带 checklist 的版本
- **Depends On**: Task 8
- **Verify**: `npx vitest run --grep "ship"`
- **Commit**: `feat(ship): add checklist gate to ship gate check`

### Task 16: Property test for ship checklist gate

- **Goal**: 在 test/ship.property.test.ts 添加 Property 19（未 verified entry → blocked，全 verified → allowed）
- **File**: `test/ship.property.test.ts`
- **Design Reference**: `design.md#correctness-properties` — Property 19（ship gate blocks on unverified）
- **Depends On**: Task 15
- **Verify**: `npx vitest run --grep "ship"`
- **Commit**: `test(ship): add property test for checklist gate`

### Task 17: Extend state.ts with multi-task status tracking

- **Goal**: 在 src/state.ts 添加 TaskStatusEntry 接口、parseStatusEntries（legacy 检测）、serializeStatusEntries、upsertTaskEntry、removeTaskEntry、detectConflict
- **File**: `src/state.ts`
- **Design Reference**: `design.md#7-multi-task-status-extension-srcstatets` — tasks 数组格式、legacy 单任务格式检测和自动迁移
- **Depends On**: (none)
- **Verify**: `npx vitest run --grep "state"`
- **Commit**: `feat(state): add multi-task status tracking`

### Task 18: Property and unit tests for multi-task status

- **Goal**: 创建 test/multi-task-status.property.test.ts（Property 21, 22, 23, 24）和 test/multi-task-status.test.ts（legacy 格式迁移、向后兼容）
- **File**: `test/multi-task-status.property.test.ts`, `test/multi-task-status.test.ts`
- **Design Reference**: `design.md#correctness-properties` — Property 21（round-trip）、22（upsert）、23（remove）、24（conflict detect）
- **Depends On**: Task 17
- **Verify**: `npx vitest run --grep "multi-task"`
- **Commit**: `test(state): add multi-task status property and unit tests`

### Task 19: Checkpoint — Verify extended modules pass CI

- **Goal**: 运行 npm run check 确保 ship.ts 和 state.ts 扩展编译通过、所有测试通过
- **File**: (none — verification only)
- **Design Reference**: N/A
- **Depends On**: Task 16, Task 18
- **Verify**: `npm run check`
- **Commit**: (no commit — checkpoint verification)

### Task 20: Update barrel file and barrel test

- **Goal**: 在 src/index.ts 添加所有新增模块的 type 和 value exports；更新 test/barrel-file.test.ts 的 exports 数量和列表
- **File**: `src/index.ts`, `test/barrel-file.test.ts`
- **Design Reference**: `design.md#data-models` — 所有新增导出的类型和函数清单
- **Depends On**: Task 4, Task 7, Task 9, Task 11, Task 13, Task 15, Task 17
- **Verify**: `npx vitest run --grep "barrel"`
- **Commit**: `feat(index): export new modules from barrel file`

### Task 21: Update SKILL documents

- **Goal**: 更新 forge-build（CI 命令 + 上下文预算）、forge-test（CI 命令）、forge-review（上下文预算）、forge-decide（上下文预算）的 SKILL.md，不修改现有内容
- **File**: `skills/forge-build/SKILL.md`, `skills/forge-test/SKILL.md`, `skills/forge-review/SKILL.md`, `skills/forge-decide/SKILL.md`
- **Design Reference**: `design.md#8-skill-document-changes` — 各 SKILL 文档的具体章节内容模板
- **Depends On**: (none)
- **Verify**: manual review
- **Commit**: `docs(skill): add CI command and context budget sections`

### Task 22: SKILL contract tests

- **Goal**: 创建 test/skill-contract.test.ts，验证 forge-build/forge-test SKILL 含 CI 命令章节、forge-build/forge-review/forge-decide SKILL 含上下文预算章节
- **File**: `test/skill-contract.test.ts`
- **Design Reference**: `design.md#correctness-properties` — R12.1–R12.5、R13.1–R13.4 的验证要求
- **Depends On**: Task 21
- **Verify**: `npx vitest run --grep "skill-contract"`
- **Commit**: `test(skill): add SKILL contract tests for CI and context budget`

### Task 23: Verify remaining round-trip property tests

- **Goal**: 确认 context-budget-roundtrip.property.test.ts 中的 Property 1（explore）、3（review）、4（test output 含 rawOutput）、9（subagent conditional fields）、11（low-savings warning）覆盖更新后的模块
- **File**: `test/context-budget-roundtrip.property.test.ts`
- **Design Reference**: `design.md#correctness-properties` — Property 1, 3, 4, 9, 11 的定义
- **Depends On**: Task 4
- **Verify**: `npx vitest run --grep "context-budget-roundtrip"`
- **Commit**: `test(context-budget): verify round-trip properties cover updates`

### Task 24: Final checkpoint — Full CI validation

- **Goal**: 运行 npm run check 确保全量 CI 通过，验证 26 个 correctness properties 均有对应测试，所有 R1–R15 需求均被任务覆盖
- **File**: (none — verification only)
- **Design Reference**: N/A
- **Depends On**: Task 20, Task 22, Task 23
- **Verify**: `npm run check`
- **Commit**: (no commit — final checkpoint)

## Spec Coverage

| Spec 需求 | 覆盖任务 |
|-----------|---------|
| R1: Context reduction for Explore | Task 2, Task 4, Task 23 |
| R2: Context reduction for Review | Task 23 |
| R3: Context reduction for Test Output | Task 3, Task 4, Task 23 |
| R4: Context reduction for Git Output | Task 23 |
| R5: Context reduction for Subagent | Task 23 |
| R6: P2/P3 Backlog Capture | Task 6, Task 7 |
| R7: Knowledge Accumulation | (SKILL 文档变更，由 learn 模块已有实现覆盖) |
| R8: Parallel Task Status | Task 17, Task 18 |
| R9: Incremental P1 Verification | Task 10, Task 11 |
| R10: P1 Fix Checklist | Task 8, Task 9, Task 15, Task 16 |
| R11: Fix Recovery from Git | Task 12, Task 13 |
| R12: CI Command Discovery | Task 21, Task 22 |
| R13: Context Budget SKILL Integration | Task 21, Task 22 |
| R14: Context Budget Reporting | Task 23 |
| R15: Fix Context Budget P1s | Task 1, Task 2, Task 3, Task 4 |

## Task Dependency Graph

```
Task 1 ──┐
Task 2 ──┤
Task 3 ──┴──→ Task 4 ──→ Task 5 (checkpoint)

Task 6 ──→ Task 7 ──┐
Task 8 ──→ Task 9 ──┤
Task 10 ─→ Task 11 ─┤──→ Task 14 (checkpoint)
Task 12 ─→ Task 13 ─┘

Task 8 ────→ Task 15 ──→ Task 16 ──┐
Task 17 ──→ Task 18 ───────────────┤──→ Task 19 (checkpoint)

Task 4,7,9,11,13,15,17 ──→ Task 20
Task 21 ──→ Task 22
Task 4 ────→ Task 23

Task 20,22,23 ──→ Task 24 (final checkpoint)
```
