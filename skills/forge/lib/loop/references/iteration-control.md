# Iteration Control Logic

## 4. Iteration Control Logic

### 4.1 Iteration Flow

每轮迭代按以下步骤执行：

1. Read StatusFile, determine current phase
2. Call SkillScheduler to determine next SKILL
3. Build SKILL-aware prompt
4. Execute corresponding SKILL (Agent invocation)
5. Evaluate quality gates (review/test/ship stages)
6. Commit / rollback decision
7. Update StatusFile (phase + iteration)
8. Check for completion or circuit breaker trigger

### 4.2 SKILL Scheduling State Machine

→ 完整状态转换见 `src/skill-scheduler.ts`。非显而易见的转换：
- review fail → build（fix loop）· ship + tier=full → learn · completed/aborted → terminal（幂等）· unknown → router（fallback）

### 4.3 Quality Gate Evaluation

Loop 在 review、test、ship 阶段完成后独立评估质量门禁，不依赖 Agent 自报结果：

| Stage | Gate | Evaluation |
|-------|------|------------|
| review | Review Gate | Parse review report `p0_count`/`p1_count`, blocked if either > 0 |
| test | Test Gate | Parse test result `failed` field or `result` field |
| ship | Ship Gate | Triple combination: Review + Test + Progress (any blocked → overall blocked) |

门禁结果：`passed`（继续）/ `blocked`（修复循环）/ `skipped`（无法解析，不阻断也不算通过）

### 4.4 Autonomous Mode Presets

| Confirmation Point | Preset |
|--------------------|--------|
| Router tier | `auto-detect` |
| Plan breakdown | `auto-approve` |
| Build light pause | `continue` |
| Review P0/P1 | `auto-fix` |
| Ship delivery | `keep branch`（不可逆操作不自动执行） |
| Refactor scan/design/apply | `auto-select-recommended` / `auto-approve` / `continue` |
| Fix report/analysis/verify | `auto-confirm` / `auto-recommend` / `auto-verify` |

---

## 5. Commit / Rollback Decisions

| SKILL Stage | On Success | On Failure | Commit Message Format |
|-------------|-----------|-----------|----------------------|
| plan | commit | no commit | `forge(plan): <objective> plan approved` |
| build | commit | rollback | `forge(build): <agent summary>` |
| fix / fix-apply | commit | rollback | `forge(fix): resolve P0/P1 from review` |
| refactor-apply | commit | rollback | `forge(refactor): apply refactoring changes` |
| review / test / ship / router / learn / refactor-scan / fix-analyze | no commit | no commit | — |

**Commit 失败处理**：如果 Git commit 操作失败，标记为 hard failure 并触发指数退避机制。

---

## 6. Fix Loop and Circuit Breaker Protection

### 6.1 Fix Loop

当 Review Gate 返回 `blocked`（存在 P0/P1 问题）时：

1. Increment `reviewFixAttempts` counter
2. Roll back `phase` to `build`
3. Inject P0/P1 issue details in next iteration
4. After fix, re-enter review
5. When Review Gate returns `passed`, reset counter to 0

### 6.2 Circuit Breaker Conditions

当 `reviewFixAttempts` 达到最大值（默认 3）且 review 仍为 `fail` 时，Loop 中止执行。

### 6.3 Other Abort Conditions

| Condition | Description |
|-----------|-------------|
| Agent consecutive failures reach threshold | Underlying state machine protection |
| Commit operation failed | Marked as hard failure, triggers backoff mechanism |
| Guarded zone violation | Immediately terminates loop, no backoff |
| User manual abort (`/forge abort`) | User-initiated termination |
| `--stop-when` condition met | Agent reports stop condition satisfied |
| `--max-iterations` / `--max-tokens` / `--max-budget-usd` limit reached | Resource limit |

---

## 7. Shutdown Sequence

**Normal**: 清除所有 Loop 字段，恢复 interactive 模式。**Circuit breaker**: 报告未解决问题 + `/forge resume` 恢复。**Error**: 清除 `mode`/`loop_run_id`/`loop_iteration`，**保留** `phase`/`skill_sequence`（便于 resume）。
