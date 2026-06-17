---
description: "Use when running `/forge plan`, a spec is locked, or an actionable task breakdown is needed before build"
updated: 2026-06-05

dispatch_mode: fork
allowed_tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Write
---

# /forge plan — 规划引擎

> **触发方式**：标准路径的第一步，全量路径的第三步，或用户直接输入 `/forge plan`
> **职责**：将锁定的 Spec 拆解为包含 TDD 步骤的原子任务，生成可直接执行的开发计划
> **输出路径**：`.forge/specs/<topic>/tasks.md`（三文件单源）。Legacy 回退：`.forge/plans/<topic>.md`

---

## 1. Overview

五步流程（Research → File Mapping → Task Breakdown → Self-Check → User Approval）将锁定的 Spec 转化为原子任务列表。每个任务包含文件路径、TDD 步骤、完整代码、验证命令和提交信息。

**三文件单源**：plan 阶段不再向 `.forge/plans/<topic>.md` 写入独立文件。而是直接读取并就地升级 `.forge/specs/<topic>/tasks.md`（draft → locked），补全任务编号、JSON wave 块、估时、status 字段、DoD。运行时调用 `lockPlan(doc)`（`src/plan.ts`），传入解析得到的 `TasksSeedDocument`；它内部会调用 `upgradeTasksSeed` 补 wave/status，最终 frontmatter `status` 从 draft 切到 locked。当 `tasks.md` 不存在但 `plans/<topic>.md` 存在时，作为兼容回退以 plans 文件为只读种子合成 tasks.md。

**核心原则**：计划中不允许任何模糊内容。写不出完整代码说明还没想清楚，回去重新研究。

**Zero Context 原则**：假设执行者对代码库零了解、品味存疑。每个 step 必须包含执行者需要的全部信息——不能假设他们知道项目约定、文件结构或已有代码模式。如果需要他们知道什么，写在 step 的上下文中。

**Not For**：轻量路径任务（≤1 文件 ≤20 行）、Spec 已包含完整任务拆解的情况。

### §1.5 Pre-flight: Branch Gate

调用 `runBranchGate({ skill: "plan", mode, currentBranch, currentTask, pendingDeliveries, alreadyCheckedThisPhase, isCleanTree })`：
- `passed` / `skipped` → 继续后续 §
- `auto_fixed` → 输出 `✅ 已自动切换到 <newBranch>` 后继续
- `blocked` → 中止 skill，按 mode 输出对应提示
- `warned` → 输出警告但继续

默认严重度：warn。可通过 `severityOverride` 覆盖。

### §1.6 Pre-flight: Spec Health Check

Read spec frontmatter `health` field. If spec_hash matches current content, reuse cached score. Otherwise, call `checkSpecHealth` to recompute.

- `verdict=degraded` + interactive → prompt user: 1) return to spec 2) trigger grill 3) force continue
- `verdict=degraded` + autonomous → write advisory to `.forge/findings/spec-health-advisory-<topic>.md`, continue
- `verdict=marginal` → output warning, continue

### §1.7 Pre-flight: Replan Gate（dynamic-replan-loop R3）

读 `.forge/status.md` 的 `replan_pending` 字段（passthrough，非强制 schema）。**WHEN `replan_pending === "true"`**，进入**增量重规划模式**（而非首次 plan）：

1. **读 `invalidated_assumptions`**：从 status.md 取被证伪的假设清单（由 scheduler debug 分支在 `failure_class: assumption_invalidated` 时写入）。
2. **取剩余未完成 task**：用 `filterRemainingTasks(tasks)`（`src/spec-bundle.ts`）过滤出 `status !== "completed"` 的 task（pending/in-progress/blocked/failed）。**已完成 task 不参与重规划、不回滚**（增量非全量）。
3. **修订剩余 task**：对照 `invalidated_assumptions`，重设计受影响的剩余 task 的顺序/拆分/方案。未受影响的剩余 task 保持原样。
4. **写回计划**：修订后的剩余 task 写回 `.forge/plans/<topic>.md`，frontmatter 加 `replan_of: "<original-plan-ref>"` + `invalidated_assumptions: [...]`，**显著标注为 replan 版本**。
5. **等用户批准**（plan phase 批准门禁，Step 5）：replan 版本需用户 review 后才继续 build。这是计划层批准，**不是**违反 No-Mid-build-Confirmation（该铁律管 build 内中途确认，不管 plan 批准）。
6. **批准后清空 `replan_pending`**：用户批准修订计划后，清空 status.md 的 `replan_pending` 和 `invalidated_assumptions`，回到 build。
7. **叙事落盘（可选，R4）**：若 `.forge/runs/<run_id>/commit-narrative.md` 存在（loop-engineering-adoption R3），追加一节：`why: <invalidated_assumptions>` + `what: <剩余 task 修订摘要>`。不存在则跳过（解耦）。

**约束**：增量 replan 受 plan phase 既有门禁约束——Spec Lock（不偏离已批准 spec）、frozen-zone 保护（已完成 task 不回滚）。不静默改方向（Step 5 用户批准）。

`replan_pending` 非 true 或缺失 → 正常首次 plan 流程（Step 1 起），本节不生效。

## 2. Five-Step Planning Process

### Step 1: Research

搜索历史经验和项目上下文。强制步骤：读取 `knowledge/catalog.md`（全景索引，~50 行）、按需深入 `knowledge/` 相关条目、读取 `instincts.md`、读取锁定 Spec、派发 explore agent 扫描代码库。可选：`metrics.md`（偏差率 > 1.2 时预估时间乘系数）、`tool-health.md`（退化命令注入警告）。`catalog.md` 新鲜度由 hooks.json PostToolUse 自动维护（`scripts/knowledge-hook-dispatch.mjs`），plan 启动时如 catalog 过期会自动 rebuild，无需手动 `/forge learn` 刷新。

**Spec Status Check（Research 阶段）**：引用 spec 时检查其 frontmatter status：
- `archived` → 阻断，提示已被归档，显示 `replaced_by`
- `deferred` → 警告，提示该 spec 已暂缓（显示 `deferred_reason`）
- `draft` / `approved` → 自动更新 status 为 `in_progress`
- `in_progress` → 正常继续

#### Sandbox Advisory Checkpoint

Phase 1 advisory: **does not block**, only warns.

**Before reading .forge/ or project files**, call `checkFilesystemPolicy(targetPath, 'read', sandboxConfig)`:

```
import { loadSandboxConfig, checkFilesystemPolicy } from "./sandbox-policy.js";
const sandboxConfig = loadSandboxConfig();
const result = checkFilesystemPolicy(targetPath, "read", sandboxConfig);
if (!result.allowed) {
  console.warn(`⚠️ 沙箱策略建议阻止此操作：${result.reason}（Phase 1 advisory，不阻断）`);
}
```

**Trigger**: Any `Read` tool call targeting `.forge/` or project source files during research.

### Step 2: File Mapping

列出所有需创建/修改的文件。标注 `CREATE` 或 `MODIFY`，说明原因。测试文件与源文件成对。

### Step 2.5: Backlog Overlap Check（forge-review-fix-optimization R6.3）

File Mapping 完成后，检查 `.forge/backlog.md`（若存在）是否有与本计划受影响文件路径重叠的未解决 P2/P3 条目。

**实现**：纯函数 `findOverlappingEntries(entries, affectedFiles)`（`src/backlog.ts`）——传入 `parseBacklog(read(".forge/backlog.md"))` 与本计划 File Mapping 的文件列表，返回重叠条目。

- 若有重叠：在计划开头的 "已知背景" 段列出每条（severity / filePath / description / originTask），提示这些历史 P2/P3 可在本任务中顺手解决（R6.5：解决后调 `resolveEntry` 标记）。
- 若无 `.forge/backlog.md` 或无重叠：跳过，不阻塞计划。

### Step 3: Task Breakdown

根据是否有 design.md 选择格式：
1. **有 design.md** → Lightweight Task → 详见 references/lightweight-task-format.md
2. **无 design.md** → Atomic Task（含完整 RED/GREEN/REFACTOR 代码）→ 详见 references/atomic-task-format.md

拆解规则：Granularity（2-5 min）、Independence（独立可验证）、Ordering（按依赖排序）、Completeness（不留空白）。

#### Vertical Slice 约束

每个 task 必须是一个 **Tracer Bullet**：贯穿所有相关层的端到端垂直切片。
参考 `.forge/glossary.md` 中 `Vertical Slice` 的定义。

WRONG（水平切片）:
  Task 1: 设计数据库 schema
  Task 2: 实现 API 端点
  Task 3: 写前端页面
  Task 4: 写测试

RIGHT（垂直切片）:
  Task 1: 用户可通过 API 创建 Order，数据持久化到 DB，有测试覆盖
  Task 2: 用户可在前端创建 Order，调用 API，有 E2E 测试
  Task 3: 用户可取消 Order，从 API 到 DB 到 UI 端到端

**判断标准**：
- 每个 task 完成后可以**独立演示或验证**
- task 不是按技术层拆分，而是按用户行为/功能切片
- 如果一个 task 只涉及一层（只有 schema / 只有 API / 只有 UI），
  考虑与相邻层合并为端到端切片

**例外**：纯基础设施 task（数据库迁移、配置变更、依赖安装）可以按层拆分，
但必须标记 `nature: infrastructure`。

#### HITL/AFK 标记

每个 task 必须标记交互类型：

| 标记 | 含义 | build 行为 |
|------|------|-----------|
| `AFK` | 可自主完成，无需人工 | 连续执行，不中断 |
| `HITL` | 需要人工决策/验证/设计评审 | 执行前暂停，等待用户确认 |

**HITL 触发条件**：
- 需要选择设计方向（多个合理方案）
- 需要用户提供外部信息（API key、第三方配置）
- 需要人工视觉验证（UI 布局确认）
- 涉及不可逆操作（数据库迁移、破坏性重构）

**默认**：`AFK`。仅在明确满足 HITL 触发条件时标记 `HITL`。

任务命名优先使用 `.forge/glossary.md` 定义的规范术语；如发现同义词/别名，自动替换为 canonical term，保持跨 skill 命名一致。

Glossary Hook: Task Breakdown 后调用 `runGlossaryCheck({ phase: 'plan' })` 检查 task title 术语一致性。启动时如 spec frontmatter 含 `pending_glossary_advisories`，调用 `renderPendingAdvisoryNotice(paths)` 显示 advisory 列表。

### Step 3.5: 依赖识别

对每个任务 T_i，回答：
- T_i 的 RED 步骤是否需要 T_j (j < i) 已实现的内容？
  → 若是，T_i.dependsOn.push(T_j.taskNumber)
- T_i 的 GREEN 步骤是否需要 T_j 的产物？
  → 若是，同上
- T_i 是否仅在文档/配置层面，无运行时依赖？
  → dependsOn 留空数组 []

输出：每个任务的 dependsOn 字段填充完整（包括空数组）

→ 识别规则详见 references/dependency-rules.md

### Step 4: Self-Check

#### No-Placeholders 铁律

每个 task step 必须包含执行者需要的**全部实际内容**。以下模式属于**计划失败**：

| 模式 | 示例 | 为什么失败 |
|------|------|-----------|
| 模糊待办 | "TBD"、"TODO"、"后续补充"、"待确认" | 执行者无法行动 |
| 空泛指令 | "添加适当的错误处理"、"处理边界情况"、"添加验证" | 什么是"适当"？"哪些"边界？ |
| 无代码测试 | "为以上逻辑编写测试"（不含实际测试代码） | 执行者不知测什么、怎么断言 |
| 跨任务引用 | "参考 Task 3 的模式"、"与 Task 1 类似" | 执行者可能不按顺序读 task |
| 描述性步骤 | "实现导出功能"（无代码、无文件路径、无验证命令） | "做什么"≠"怎么做" |
| 未定义引用 | 引用前面 task 中未定义的类型、函数或方法 | 类型/函数在引用点不存在 |
| 空验证 | "验证功能正常"（无具体命令、无预期输出） | 无法判断是否真的验证了 |

正确的 Step 格式必须包含四要素：**文件路径** + **完整代码** + **验证命令** + **预期输出**。

| Check | Criteria |
|-------|----------|
| Spec Coverage | 每个需求至少被一个任务覆盖 |
| Placeholder Scan | 零占位符 → grep: `TBD\|TODO\|待确认\|适当\|参考 Task` |
| Type Consistency | 所有引用有定义（full）/ Design Reference 有效（lightweight） |
| Dependencies | 无循环依赖，拓扑排序正确 |
| Dependency Graph Validity | `validateGraph(toTaskGraph(tasks))` 通过；循环依赖自动修正 |
| Plan Structure | Split_Trigger 任一命中 → 警告 + 等待用户选择 → 详见 references/plan-split-wizard.md |
| Charter Boundary | 当 `.forge/charter.md` 存在且 `status: active` 时，验证 plan 中的文件变更不违反 charter boundaries（模块间通信约束、层级访问限制）。违规任务标注 `⚠ Charter boundary conflict: <invariant-id>` |

未通过则自动修正并重新自检。

### Step 4a: Plan Structure Check

IF Plan_Structure_Check 触发（`checkPlanStructure` 返回 `triggered: true`）且 plan frontmatter 不含 `monolith_acknowledged: true`：

输出结构化警告：

```
⚠️ Plan Structure Warning
本 plan 触发以下拆分建议条件：
- [已命中的条件列表]

建议将 plan 按 Sprint 拆成 N 个独立 plan，每个 plan 对应一次完整的 build → review → test → ship 周期。

继续使用当前 plan 请输入 "acknowledge-monolith"；拆分请输入 "split"。
```

- `acknowledge-monolith`（或任何非 `split` 输入）→ plan frontmatter 追加 `monolith_acknowledged: true`，继续到 Step 5
- `split` → 进入拆分向导（→ 详见 references/plan-split-wizard.md）
- plan 已含 `monolith_acknowledged: true` → 跳过此检查

### Step 5: User Approval

批准 → `status: approved`；修改意见 → 回到 Self-Check；拒绝 → 保持 `draft`。

Plan frontmatter 可含 `monolith_acknowledged: true`（用户明确知悉未拆分风险），此字段由 Step 4a 自动追加。

---

## 3. Atomic Task Format

→ 详见 references/atomic-task-format.md

## 4. Prohibited Content List

→ 详见 references/prohibited-content.md

## 5. Self-Check Criteria Details

- **5.1 Spec Coverage**：逐条对照 Spec，未覆盖则自动补充。
- **5.2 Placeholder Scan**：全文扫描禁止关键词，匹配则定位任务和行号。
- **5.3 Type Consistency**：扫描 import 和类型引用，查找定义，未定义则自动补充。

---

## 6. Gate: Plan Not Approved → Block `/forge build`

<HARD-GATE name="plan-approve">

→ 遵循 CLAUDE.md §2.2 前置检查（Plan 批准门禁）。轻量路径不要求批准。

</HARD-GATE>

---

## 7. Plan Document Format

输出路径：`.forge/plans/<topic>.md`（kebab-case）

Frontmatter 字段：`topic`, `status` (draft/approved), `date`, `spec_ref`, `format` (lightweight/full)

两种格式模板（Lightweight + Full）的完整结构 → 详见 references/plan-document-format.md

---

## 8. Execution Flow

1. **Pre-check**: `.forge/` 存在？Spec 状态？
2. **Research**: 搜索 knowledge/、读 Spec、派发 explore agent
3. **File Mapping**: 列出所有创建/修改文件
4. **Task Breakdown**: 拆解为原子任务
5. **Self-Check**: 覆盖率/占位符/类型一致性，自动修正
6. **User Approval**: 批准/修改/拒绝
7. **自动推进（铁律）**: 批准后**立即调用** `Skill(skill="forge", args="build")`。不输出"是否继续？""开始build？"等确认文本。仅输出 `✅ plan 完成 → 自动进入 build`，然后直接调用 Skill。静默 idle（无输出、等待用户输入）与显式询问同罪。（→ 详见 shared/next-step-protocol.md）

**Pre-check 详情**：`.forge/` 不存在 → prompt `/forge init`。Full path 要求 Spec locked；Standard path 无 Spec 时直接生成 Plan（`spec_ref: "none"`）。

---

## 9. Edge Case Handling

| Case | Handling |
|------|------|
| Spec not locked (full path) | Block, prompt `/forge spec` |
| No Spec (standard path) | 直接生成 Plan，跳过 Spec 对齐检查 |
| Existing plan (draft) | 以已有 plan 为基础修改 |
| Existing plan (approved) | 提示先改 status 为 draft |
| Self-check fails 3 times | 停止自动修正，呈现给用户 |
| No knowledge/ history | 跳过，输出提示 |
| No `.forge/` directory | Prompt `/forge init` |

---

## 10. Examples

→ 详见 references/examples.md

---

## Known AI Failure Modes

| # | Failure Mode | Correct Approach |
|---|---------|---------|
| 1 | Task granularity too large | 一个任务 = 一个独立可验证的行为变更 → references/atomic-task-format.md |
| 2 | Missing dependencies | 画依赖图，确保引用在先前任务中定义 |
| 3 | Placeholders not replaced | 每步必须含完整可执行代码 → references/prohibited-content.md |
| 4 | Breakdown without reading Spec | Step 1 Research 强制执行 |

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "边做边想更高效" | 10 分钟规划节省数小时调试 |
| "任务很明显不需要拆解" | 显式任务列表暴露隐藏依赖和边界情况 |
| "规划是额外开销" | 没有计划的实现只是在打字 |

## Gotchas
- **Task too large**: Single task covers 5 files → ambiguous what "done" means → split to atomic tasks, one concern each
- **Missing file mapping**: Plan lists tasks without specifying which files → agent searches mid-build → map files upfront in plan
- **Plan drift**: Implementation deviates from plan → scope creep → re-read plan every 3 tasks, flag deviations
- **Dependency ordering**: Task B depends on Task A, but B listed first → B fails → validate dependency ordering in self-check

## Atomic Task Gate and Execution Package Gate

Before Step 5 User Approval, `/forge plan` MUST run the Atomic Task Gate:

- compute `task_weight` for every task (`files_touched`, `estimated_loc`, `layers`, `new_dependencies`, `test_scope`, `risk`, `estimated_minutes`)
- split any overweight task before approval
- `monolith_acknowledged` MUST NOT bypass overweight task splitting

Then run the Execution Package Gate:

- generate `execution_packages` when atomic task count is >= 10
- SHOULD generate packages for 6-9 tasks using dependency, wave, or sprint boundaries
- keep packages at 3-5 atomic tasks when dependencies and risk allow
- preserve the Task DAG and declare `depends_on_packages`
- `monolith_acknowledged` MAY keep one plan, but MUST NOT bypass execution package generation

Package decisions that require user input MUST use Claude Code `AskUserQuestion`.
Required prompts include package split approval, explicit monolith acceptance after package
warnings, and any package split option that changes task boundaries. Do not ask the user to type
commands such as `split` or `acknowledge-monolith`; present choices through AskUserQuestion and
continue automatically after the user chooses.
