---
name: dynamic-replan-loop
status: in_progress
feature: dynamic-replan-loop
layout: requirements
created: "2026-06-17"
updated: "2026-06-17"
priority: P2
tier: standard
source: "掘金 Loop Engineering 深度实践指南 §2 + decide 2026-06-17-dynamic-replan-loop"
decide_ref: "2026-06-17-dynamic-replan-loop"
---

# 动态重规划闭环 — 需求文档

## 背景

Forge 当前 build 失败后的处理是**单向修复链**：task 连续失败 3 次 → three-strike 触发 `/forge debug` → debug 修当前问题。但调研发现两个结构性缺口：

1. **debug→build 没有正式状态转移**：`skill-scheduler.ts:97` 的 `determineNextSkill` 状态机里**没有 debug 分支**。debug 是 fork 旁路，跑完后只写 `.forge/debug/<slug>.md` 的 `status: "resolved"`，控制权靠主 agent 隐式上下文恢复回到 build，硬跑剩余 task——没有代码/调度规则保障交接，也不读 debug 的 root_cause。

2. **不区分"可修复 bug"与"方案假设失效"**：debug 5 个 phase 全假设根因是代码 bug（Phase 4 直接 apply fix）。当根因其实是"剩余计划依赖的假设已失效"（如依赖的接口不存在、方案与现有架构冲突），debug 修好当前点后，build 会硬着头皮执行剩余（已失效的）task，导致连锁返工。

掘金《Loop Engineering 深度实践指南》§2 指出，2026 的双层循环最佳实践是**动态重规划**：inner loop（build TDD）失败时，outer loop（plan↔build）应根据失败原因修订剩余计划，而非只修当前点。这是 Forge 双层循环结构缺失的反馈闭环。

**decide 决策**（`.forge/decisions/2026-06-17-dynamic-replan-loop.md`）：**做，Standard tier。** 作为独立 spec（不并入 PR #98 loop-engineering-adoption），避免 scope 膨胀。明确 veto：全量重新 plan（回滚成本高）、引入 LangGraph/Temporal（分发摩擦致命）。

**现有可复用的语义锚点**：
- `learn` 的 `assumption_violation` root_cause 枚举（`learn/instructions.md:392`）——语义最贴切的"方案假设失效"标签。
- `failure-sink.ts` 的 `loop_circuit_broken`（Forge Loop 熔断）——最接近"目标不可达"的触发器。
- `TaskSeed.status`（`spec-bundle.ts:118`）——过滤 `!== "completed"` 即得剩余 task。
- Carry-Over Discipline（`build/instructions.md:204`）——现成的单 task 级重新分配逻辑，replan 是它的批量升级版。

**与 loop-engineering-adoption 的关系**：R3 的 commit-narrative 能为 replan 提供"为什么改方向"的叙事载体。两者天然衔接但分步交付。

## 目标

1. 让 Forge 能区分"可修复 bug"与"方案假设失效"，debug 完成后据此分流：前者回到原 build task 循环，后者触发增量重规划。
2. 建立 debug→build/plan 的**正式状态转移**（scheduler 的 debug 分支），结束"隐式上下文恢复"的不可靠交接。
3. 增量重规划只修订**剩余未完成**的 task，产出可被用户 review 的修订计划，不静默改方向。

**非目标**（明确排除）：
- 不做全量重新 plan（已 commit 的 task 不回滚）。
- 不做实时流式重规划。
- 不引入外部状态机框架（LangGraph/Temporal）。
- 不改 three-strike 触发阈值和 debug agent 的 5 phase 结构。
- 不改 No-Mid-build-Confirmation 铁律（replan 是计划层动作，不是中途问用户"是否继续"）。

## 术语

- **动态重规划（Dynamic Replan）**：build 中某 task 因"剩余计划假设失效"失败时，修订剩余未完成 task 的顺序/拆分/方案。只改剩余，不回滚已完成。
- **failure_class**：debug 结论的新分类，`fixable_bug | assumption_invalidated | environmental`。只有 `assumption_invalidated` 触发 replan。
  - `fixable_bug`：根因是代码 bug，debug 已修复，回原 build 继续。
  - `assumption_invalidated`：根因是计划依赖的假设失效（接口不存在、架构冲突等），debug 可能修了当前点但剩余 task 仍基于失效假设——需 replan。
  - `environmental`：根因是环境/依赖问题（缺依赖、权限不足），通常不通过改计划解决，需人工介入。
- **invalidated_assumptions**：被证伪的假设列表，回查 router `assumptions`（`router.ts:112`）或 status.md `### 假设` 章节。
- **replan gate**：debug resolved 后、回到 build 之前的判定点，读 `failure_class` 决定下一步。
- **incremental replan**：只重写 `.forge/plans/<topic>.md` 中 `status !== "completed"` 的 task，受 plan phase Spec Lock 门禁约束。

## 需求

### Requirement 1: debug 结论分类（failure_class）

**User Story:** 作为 Forge 用户，我希望 debug 修完一个问题后能区分"这只是个 bug"还是"剩余计划的前提失效了"，这样系统不会在我修完一个点后还硬着头皮跑基于错误前提的剩余任务。

#### 验收标准

1. THE `.forge/debug/<slug>.md` 的 frontmatter SHALL 新增 `failure_class` 字段，取值 `fixable_bug | assumption_invalidated | environmental`，默认 `fixable_bug`。
2. WHEN `failure_class: assumption_invalidated`，THE debug 文件 SHALL 附带 `invalidated_assumptions: string[]`（被证伪的假设清单），可回查 router/status.md 的 assumptions 字段。
3. THE debug skill（`skills/forge/lib/debug/instructions.md` Phase 5）SHALL 在 resolved 时要求填写 `failure_class`：若根因是方案假设失效则标 `assumption_invalidated`，否则 `fixable_bug`；环境问题标 `environmental`。
4. THE `failure_class` 判定 SHALL 保守化：无法明确判定时默认 `fixable_bug`（避免误触发 replan 打乱计划）。
5. THE `failure_class: assumption_invalidated` 的判定 SHALL 仅用于"剩余计划假设失效"场景，不用于普通逻辑 bug（off_by_one/null_propagation 等归 `fixable_bug`）。

### Requirement 2: debug→build/plan 正式状态转移

**User Story:** 作为 Forge 用户，我希望 debug 完成后系统有明确的下一步（继续 build 还是重入 plan），而不是靠隐式上下文恢复硬跑剩余任务。

#### 验收标准

1. THE `skill-scheduler.ts` 的 `determineNextSkill` SHALL 新增 `currentPhase === "debug"` 分支（当前完全缺失）。
2. THE debug 分支 SHALL 按以下规则分流：
   - debug `status: resolved` AND `failure_class: fixable_bug` → 返回 `build`（恢复原 task 循环）。
   - debug `status: resolved` AND `failure_class: assumption_invalidated` → 返回 `plan`（触发增量重规划，Requirement 3）。
   - debug `status: resolved` AND `failure_class: environmental` → 返回 `build` 并在 status.md 标注需人工介入环境问题。
   - debug `status: abandoned` → 返回 `aborted`（终止，等人工）。
3. THE scheduler 在 debug resolved 且 `failure_class: fixable_bug` 时 SHALL 不触发 replan，保证现有"debug 修复→继续 build"的路径不变。
4. THE 状态转移 SHALL 读 `.forge/debug/<slug>.md` 的 `status` 和 `failure_class` 作为决策依据（结束隐式上下文恢复）。

### Requirement 3: 增量重规划（incremental replan）

**User Story:** 作为 Forge 用户，当 debug 发现剩余计划的前提失效时，我希望系统只修订剩余未完成的任务（顺序/拆分/方案），产出我能 review 的修订计划，而不是全量推翻或静默改方向。

#### 验收标准

1. WHEN debug resolved 且 `failure_class: assumption_invalidated`，THE 系统 SHALL 触发增量重规划：重入 plan phase，但**只修订剩余未完成 task**。
2. THE "剩余未完成 task" SHALL 通过 `TaskSeed.status !== "completed"`（`spec-bundle.ts:118`）过滤，涵盖 `pending | in-progress | blocked | failed`。
3. THE 增量重规划 SHALL 读取 debug 的 `invalidated_assumptions`，明确标注哪些剩余 task 因这些假设失效而需修订。
4. THE 增量重规划 SHALL 受 plan phase 既有门禁约束：Spec Lock（不偏离已批准 spec）、frozen-zone 保护（已完成 task 不回滚）。
5. THE 修订后的剩余计划 SHALL 写回 `.forge/plans/<topic>.md`，并**显著标注为 replan 版本**（带 `replan_of: <original>` + `invalidated_assumptions`），供用户 review。
6. THE 重规划 SHALL 不静默改方向：replan 版本需用户 review 后才继续 build（这是 plan phase 批准门禁的天然要求，不是 No-Mid-build-Confirmation 的违反）。
7. THE 已 commit 的 task SHALL 不回滚、不重写（增量，非全量）。

### Requirement 4: replan 可观测性与叙事

**User Story:** 作为 Forge 用户，我希望知道发生了重规划、为什么、改了什么，这样我理解项目方向的变化（对抗理解腐烂）。

#### 验收标准

1. THE status.md SHALL 在发生 replan 时新增 `replan_pending: "true"` 和 `invalidated_assumptions: [...]` 字段（schema 已 `.passthrough()`，加字段不破坏兼容）。
2. THE replan 事件 SHALL 复用 loop-engineering-adoption R3 的 commit-narrative 机制：把"为什么改方向（哪个假设失效）+ 改了什么（剩余 task 修订摘要）"写进 `.forge/runs/<id>/commit-narrative.md`。
3. THE failure-sink.ts SHALL 新增 `replan_triggered` FailureTrigger（与 `loop_circuit_broken` 区分：后者是目标不可达熔断，前者是方向修正）。

## 验收标准

本 spec 整体验收：

| 验收点 | 验证方式 |
|---|---|
| failure_class 字段写入 | debug 跑完，`.forge/debug/<slug>.md` 含 `failure_class` |
| debug 分支生效 | scheduler 对 debug resolved + assumption_invalidated 返回 plan |
| 不破坏现有路径 | debug resolved + fixable_bug 仍返回 build，three-strike 流程不变 |
| 增量 replan 只改剩余 | replan 后 `.forge/plans/<topic>.md` 的已完成 task 不变，未完成 task 被修订 |
| replan 可 review | 修订计划标 replan 版本，用户批准后才继续 |
| replan 事件可观测 | status.md 含 replan_pending，commit-narrative 含改方向叙事 |

## 风险

| 风险 | 缓解 |
|---|---|
| failure_class 误判（普通 bug 当假设失效，频繁打乱计划） | 保守判定，默认 fixable_bug（AC4）；replan 需用户 review（R3-AC6） |
| replan 本身又错（重规划引入新问题） | 只改剩余 task 不动已完成；受 plan phase 门禁约束 |
| context 膨胀（debug + replan 双消耗） | debug 诊断 write-and-discard，只把 fail_signature + 根因摘要喂 replan |
| 改 scheduler debug 分支影响现有 debug 手动调用 | 手动 `/forge debug` 不经过 three-strike，不受 scheduler debug 分支影响（分支只在 build→debug 链路生效） |
| 与 loop-engineering-adoption commit-narrative 耦合 | R4 复用是可选的，commit-narrative 不存在时跳过叙事 |
