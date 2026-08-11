---
topic: dynamic-replan-loop
date: "2026-06-17"
spec_ref: dynamic-replan-loop
format: lightweight
monolith_acknowledged: true
---

# 动态重规划闭环 — 任务清单（已锁定）

> 4 个需求按依赖顺序：**R1 failure_class → R2 scheduler debug 分支 → R3 增量 replan → R4 可观测性**。
>
> **Plan Self-Check 成果（接口校正）**：
> - `determineNextSkill(input: SchedulerInput): SchedulerResult { nextPhase, reason }`（`skill-scheduler.ts:97/:59`）。当前 `SchedulerInput`（:39）无 debug 解析字段、无 `previousPhase`。R2 扩展 `SchedulerInput` 加 debug 解析结果字段（`debugStatus` / `debugFailureClass` / `debugInvalidatedAssumptions`），调用方从 `.tinkerman/debug/<slug>.md` frontmatter 填入。
> - `currentPhase === "debug"` 作分支条件。手动 `/forge debug` 独立 fork、不经主流程调度器链路，**不需要 previousPhase 隔离**。
> - `SkillPhase` 联合类型已含 `"debug"`，但 if 链无对应分支（落入末尾 fallback）——R2 补这个分支。
> - 原 Task 9（status.md 字段文档化）合并进 Task 4（SchedulerInput 扩展时一并文档化 passthrough 字段），Task 8（failure-sink）+ Task 9（叙事）合并为 R4 两任务。

## File Mapping

| 文件 | 动作 | 需求 |
|---|---|---|
| `skills/forge/lib/debug/instructions.md` | MODIFY（Phase 5 加 failure_class 填写 + 文件格式说明） | R1 |
| `src/debug.ts` | MODIFY（FailureClass 类型 + DebugSession 扩展 + parseFailureClass 辅助） | R1, R2 |
| `src/skill-scheduler.ts` | MODIFY（SchedulerInput 加 debug 字段 + determineNextSkill 加 debug 分支） | R2 |
| `skills/forge/lib/plan/instructions.md` | MODIFY（加 replan 分支 + replan 叙事） | R3, R4 |
| `src/spec-bundle.ts` | MODIFY（filterRemainingTasks 辅助） | R3 |
| `src/failure-sink.ts` | MODIFY（新增 replan_triggered 枚举） | R4 |
| `test/failure-class.test.ts` | CREATE | R1 |
| `test/scheduler-debug-branch.test.ts` | CREATE | R2 |

---

## R1 — failure_class（debug 结论分类）

### Task 1: debug skill Phase 5 加 failure_class 填写
- **目标文件**：`skills/forge/lib/debug/instructions.md`
- **行为变更**：Phase 5（resolved 时）在 frontmatter 要求填 `failure_class: fixable_bug | assumption_invalidated | environmental`，默认 `fixable_bug`；`assumption_invalidated` 时附 `invalidated_assumptions: string[]`。列举 `assumption_invalidated` 典型场景（依赖接口不存在、方案与架构冲突等）。更新文件格式段示例。
- **Design Reference**：`design.md#d1`（加 frontmatter）+ `design.md#d4`（保守判定）
- **HITL/AFK**：AFK
- **Depends On**：[]
- **Verify**：grep `failure_class` 命中 debug/instructions.md
- **Commit**：`feat(debug): failure_class field in debug resolution`

### Task 2: src/debug.ts 加 FailureClass 类型 + parseFailureClass
- **目标文件**：`src/debug.ts`
- **行为变更**：新增 `FailureClass = "fixable_bug" | "assumption_invalidated" | "environmental"` 类型；`DebugSession` 接口（:80）加 `failureClass?: FailureClass` + `invalidatedAssumptions?: string[]`；新增 `parseFailureClass(raw: string | undefined): FailureClass` 容错（缺失/无效→`fixable_bug`）。
- **Design Reference**：`design.md#d1` + `design.md#d4`
- **HITL/AFK**：AFK
- **Depends On**：[1]
- **Verify**：`npm run check`
- **Commit**：`feat(debug): FailureClass type + parseFailureClass conservative default`

### Task 3: failure_class 解析测试
- **目标文件**：`test/failure-class.test.ts`（CREATE）
- **行为变更**：测试 `parseFailureClass` 容错（undefined/空/非法→`fixable_bug`）、三态正确解析。
- **Design Reference**：`design.md#d4`
- **HITL/AFK**：AFK
- **Depends On**：[2]
- **Verify**：`npx vitest run test/failure-class.test.ts`
- **Commit**：`test(debug): parseFailureClass coverage`

---

## R2 — scheduler debug 分支（正式状态转移）

### Task 4: SchedulerInput 扩展 + determineNextSkill 加 debug 分支
- **目标文件**：`src/skill-scheduler.ts`
- **行为变更**：
  - `SchedulerInput`（:39）加可选字段：`debugStatus?: string`（resolved/abandoned）、`debugFailureClass?: FailureClass`、`debugInvalidatedAssumptions?: string[]`。注释文档化 `replan_pending` / `invalidated_assumptions` 作为 status.md passthrough 字段（调用方据 debug 解析结果写入）。
  - `determineNextSkill`（:97）新增 `currentPhase === "debug"` 分支（插在 refactor/fix 分支之前）：
    - `debugStatus === "abandoned"` → `aborted`
    - `debugStatus === "resolved"` AND `debugFailureClass === "assumption_invalidated"` → `plan`（reason 注明 replan）
    - `debugStatus === "resolved"` AND `debugFailureClass === "environmental"` → `build`（reason 注明环境告警）
    - `debugStatus === "resolved"` 默认（fixable_bug）→ `build`
    - debug 字段缺失/未解析 → 默认 `build`（保守，不阻断）
- **Design Reference**：`design.md#d2`（读字段+规则分流，不引事件系统）+ `design.md#d5`
- **HITL/AFK**：AFK
- **Depends On**：[2]
- **Verify**：`npm run check`
- **Commit**：`feat(scheduler): debug phase branch — build/plan handoff by failure_class`

### Task 5: scheduler debug 分支测试
- **目标文件**：`test/scheduler-debug-branch.test.ts`（CREATE）
- **行为变更**：测试四路分流（fixable_bug→build / assumption_invalidated→plan / environmental→build+告警 reason / abandoned→aborted）；测试 debug 字段缺失容错→build（保守）；测试非 debug phase 不进该分支（现有 plan/build/review 等不变）。
- **Design Reference**：`design.md#d2`
- **HITL/AFK**：AFK
- **Depends On**：[4]
- **Verify**：`npx vitest run test/scheduler-debug-branch.test.ts`
- **Commit**：`test(scheduler): debug branch routing — 4 paths + missing-field fallback + non-debug isolation`

---

## R3 — 增量 replan（incremental replan）

### Task 6: filterRemainingTasks 辅助函数
- **目标文件**：`src/spec-bundle.ts`
- **行为变更**：新增 `filterRemainingTasks(tasks: TaskSeed[]): TaskSeed[]`——返回 `status !== "completed"` 的 task（涵盖 pending/in-progress/blocked/failed，`TaskSeed.status` 在 :118）。供 plan replan 分支识别剩余 task。
- **Design Reference**：`design.md#d3`
- **HITL/AFK**：AFK
- **Depends On**：[]
- **Verify**：`npm run check`
- **Commit**：`feat(spec-bundle): filterRemainingTasks for incremental replan`

### Task 7: plan skill 加 replan 分支
- **目标文件**：`skills/forge/lib/plan/instructions.md`
- **行为变更**：新增 replan 分支：当 status.md `replan_pending === "true"` 时进入增量模式——读 `invalidated_assumptions`、用 `filterRemainingTasks` 取剩余 task、对受影响 task 重新设计（顺序/拆分/方案）、写回 `.tinkerman/plans/<topic>.md`（frontmatter 加 `replan_of` + `invalidated_assumptions`）、等用户批准、批准后清空 `replan_pending`。明确：已完成 task 不回滚（增量非全量）；受 plan phase Spec Lock 门禁约束。
- **Design Reference**：`design.md#d3`（复用 plan 不新建 skill）+ R3 全部 AC
- **HITL/AFK**：HITL（需用户批准修订计划——plan phase 批准门禁，非违反 No-Mid-build-Confirmation）
- **Depends On**：[4, 6]
- **Verify**：grep `replan_pending\|replan_of\|filterRemainingTasks` 命中 plan/instructions.md
- **Commit**：`feat(plan): incremental replan branch — revise remaining tasks on assumption invalidation`

---

## R4 — replan 可观测性与叙事

### Task 8: failure-sink 新增 replan_triggered
- **目标文件**：`src/failure-sink.ts`
- **行为变更**：`FailureTrigger` 枚举（:36）新增 `"replan_triggered"`（与 `"loop_circuit_broken"` 区分：后者目标不可达熔断，前者方向修正）。
- **Design Reference**：R4-AC3
- **HITL/AFK**：AFK
- **Depends On**：[]
- **Verify**：`npm run check`
- **Commit**：`feat(failure-sink): replan_triggered trigger`

### Task 9: replan 叙事复用 commit-narrative
- **目标文件**：`skills/forge/lib/plan/instructions.md`（replan 分支内）
- **行为变更**：replan 修订计划后，若 `.tinkerman/runs/<id>/commit-narrative.md` 存在（loop-engineering-adoption R3），追加一节记录"为什么改方向（invalidated_assumptions）+ 改了什么（剩余 task 修订摘要）"。不存在则跳过（解耦）。
- **Design Reference**：R4-AC2
- **HITL/AFK**：AFK
- **Depends On**：[7]
- **Verify**：grep `commit-narrative` 命中 plan/instructions.md replan 分支
- **Commit**：`feat(plan): replan narrative to commit-narrative (reuse R3, decoupled)`

---

## 依赖图（拓扑）

```
1 → 2 → 3
       ↓
       4 → 5
       ↓
6 ────→ 7 → 9
8 (independent)
```

Task 8 独立。Task 6 仅被 Task 7 依赖，可与 R1/R2 并行。

## 整体验收（DoD）

| 验收点 | 任务 | 验证方式 |
|---|---|---|
| failure_class 写入 | 1,2,3 | debug 跑完 `.tinkerman/debug/<slug>.md` 含 failure_class |
| scheduler debug 分支 | 4,5 | 四路分流 + 缺失容错 + 非 debug phase 隔离 |
| 不破坏现有路径 | 4,5 | fixable_bug→build，现有 plan/build/review 分支不变 |
| 增量 replan 只改剩余 | 6,7 | replan 后已完成 task 不变，未完成 task 修订 |
| replan 可 review | 7 | 修订计划标 replan_of，用户批准后继续 |
| replan 事件可观测 | 8,9 | failure-sink 含 replan_triggered，commit-narrative 含改方向叙事 |

## Spec Coverage Matrix

| 需求 AC | 覆盖任务 |
|---|---|
| R1-AC1~AC5 | 1, 2, 3 |
| R2-AC1~AC4 | 4, 5 |
| R3-AC1~AC7 | 6, 7 |
| R4-AC1~AC3 | 8, 9 |
