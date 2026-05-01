---
name: forge-plan
description: "规划引擎。将锁定的 Spec 拆解为包含 TDD 步骤的原子任务。"
disable-model-invocation: true
---

# /forge plan — 规划引擎

> **触发方式**：标准路径的第一步，全量路径的第三步，或用户直接输入 `/forge plan`
> **职责**：将锁定的 Spec 拆解为包含 TDD 步骤的原子任务，生成可直接执行的开发计划
> **输出路径**：`.forge/plans/<topic>.md`

---

## 1. Overview

五步流程（Research → File Mapping → Task Breakdown → Self-Check → User Approval）将锁定的 Spec 转化为原子任务列表。每个任务包含文件路径、TDD 步骤、完整代码、验证命令和提交信息。

**核心原则**：计划中不允许任何模糊内容。写不出完整代码说明还没想清楚，回去重新研究。

**Not For**：轻量路径任务（≤1 文件 ≤20 行）、Spec 已包含完整任务拆解的情况。

## 2. Five-Step Planning Process

### Step 1: Research

搜索历史经验和项目上下文。强制步骤：搜索 `knowledge/`、读取 `instincts.md`、读取锁定 Spec、派发 explore agent 扫描代码库。可选：`metrics.md`（偏差率 > 1.2 时预估时间乘系数）、`tool-health.md`（退化命令注入警告）。

### Step 2: File Mapping

列出所有需创建/修改的文件。标注 `CREATE` 或 `MODIFY`，说明原因。测试文件与源文件成对。

### Step 3: Task Breakdown

根据是否有 design.md 选择格式：
1. **有 design.md** → Lightweight Task → 详见 references/lightweight-task-format.md
2. **无 design.md** → Atomic Task（含完整 RED/GREEN/REFACTOR 代码）→ 详见 references/atomic-task-format.md

拆解规则：Granularity（2-5 min）、Independence（独立可验证）、Ordering（按依赖排序）、Completeness（不留空白）。

### Step 4: Self-Check

| Check | Criteria |
|-------|----------|
| Spec Coverage | 每个需求至少被一个任务覆盖 |
| Placeholder Scan | 零占位符 → 详见 references/prohibited-content.md |
| Type Consistency | 所有引用有定义（full）/ Design Reference 有效（lightweight） |
| Dependencies | 无循环依赖，拓扑排序正确 |

未通过则自动修正并重新自检。

### Step 5: User Approval

批准 → `status: approved`；修改意见 → 回到 Self-Check；拒绝 → 保持 `draft`。

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

→ 遵循 CLAUDE.md §2.2 前置检查（Plan 批准门禁）。轻量路径不要求批准。

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

**Pre-check 详情**：`.forge/` 不存在 → prompt `forge init`。Full path 要求 Spec locked；Standard path 无 Spec 时直接生成 Plan（`spec_ref: "none"`）。

---

## 9. Edge Case Handling

| Case | Handling |
|------|------|
| Spec not locked (full path) | Block, prompt `/forge spec` |
| No Spec (standard path) | 直接生成 Plan，跳过 Spec 对齐检查 |
| Existing plan (draft) | 以已有 plan 为基础修改 |
| Existing plan (approved) | 提示先改 status 为 draft |
| Task count > 20 | 提醒拆分 Spec 或分批执行 |
| Self-check fails 3 times | 停止自动修正，呈现给用户 |
| No knowledge/ history | 跳过，输出提示 |
| No `.forge/` directory | Prompt `forge init` |

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
