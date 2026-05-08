---
name: forge-refactor
description: "Refactor code without changing external behavior while tests remain green. Use when user runs `/forge refactor`, tests are green and code needs structural cleanup, or extracting functions and renaming symbols across the codebase."
disable-model-invocation: true
---

# /forge refactor — 重构引擎

> **触发方式**：路由器判定 WorkNature=refactor 时自动进入，用户入口仍为 `/forge`
> **职责**：通过三阶段流程（scan → design → apply）执行结构化重构，确保行为等价性
> **输出路径**：`.forge/findings/refactor-scan.md`（扫描结果）+ `.forge/plans/refactor-<topic>.md`（执行方案）+ 代码变更

---

## 1. Overview

`/forge refactor` 是 Forge 工作流中专门处理重构任务的 SKILL。当路由器通过 WorkNature 维度判定任务为重构性质时，自动分流到此工作流。用户无需记忆独立命令——入口仍然是 `/forge`。

**核心原则**：重构 = 改变结构，不改变行为。每一步都必须通过测试验证行为等价性。如果测试不存在，先补测试再重构。

**触发方式**：由路由器 WorkNature=refactor 自动分流。关键词（优化、重构、重写、拆分、refactor 等）识别。用户可 `--nature=refactor` 覆盖。

---

**Not For**：
- 同时需要添加新功能的场景（先功能后重构）
- 不理解现有代码为什么这样写时（先理解再重构）

## 2. Pre-flight Checks

在启动重构流程之前，必须逐条验证以下 7 项前置条件。**任一条件命中时，不得继续重构**。

| # | Check Item | Route on Hit |
|---|------------|-------------|
| 1 | **Behavioral change mixed in** | → Router re-classifies as feature or bugfix |
| 2 | **Target lacks test coverage** | → Add tests first (`/forge build` to add test tasks) |
| 3 | **Cross-module** (3+ independent modules) | → Run `/forge spec` for design first |
| 4 | **Purely stylistic** | → Configure lint/formatter rules |
| 5 | **Generated artifacts / third-party code** | → Fix the source (generator config or upstream dependency) |
| 6 | **Scope too large** (files affected > 15) | → Narrow scope, refactor in batches |
| 7 | **Nothing to change after scan** | → "Zero output is valid", Agent returns `should_fully_stop: true` |

**Rejection**: `🚫 命中检查：<条目> 证据：<路径/分析> 建议：<路由> 重入：<条件>`。Autonomous → JSON: `{ success: false, summary, evidence, suggested_route, reentry_condition }`

---

## 3. 三阶段流程

### 3.1 Scan 阶段（refactor-scan）

**职责**：扫描代码库，识别优化点，按方法库分类，输出候选清单。

**产出**：`.forge/findings/refactor-scan.md`

**流程**：

1. 读取任务描述，确定重构范围
2. 扫描目标代码，按方法库（§4）四层分类识别候选优化点
3. 为每个候选标注：位置（file:line）、当前问题、建议方法、预估影响、推荐等级（★/☆）
4. 输出候选清单

**Scan 输出**：`.forge/findings/refactor-scan.md`，L1-L4 分类候选表 + 推荐顺序。

**双模式行为**：

| 模式 | 行为 | ConfirmationPoint |
|------|------|------------------|
| interactive | 展示候选清单，等待用户勾选 | — |
| autonomous | 自动选择所有推荐项（★） | `refactor_scan_select`，preset: `auto-select-recommended` |

### 3.2 Design 阶段

为每个候选制定方案（方法名、步骤、验证、回滚），产出 refactor plan。Interactive 等批准；autonomous 自动批准。

### 3.3 Apply 阶段（refactor-apply）

逐步执行，每步验证行为等价：操作 → 验证 → 通过继续/失败回滚 → 全量测试 → 提交。Interactive 每步确认；autonomous 自动继续。

---

## 4. 方法库

四层分类（L1 行为等价迁移 / L2 Fowler 经典 / L3 结构拆分 / L4 性能），scan 阶段按此匹配候选。

→ 详见 references/method-library.md（完整方法列表）

---

## 5. 快速通道（Tier=light）

当路由器判定 Tier=light 且 WorkNature=refactor 时，走快速通道。

**入场条件**：单文件重构、改动点 ≤ 3 处、目标文件有测试覆盖。

**流程**：跳过 scan 阶段，直接 `refactor-apply → review`。apply 阶段直接根据任务描述执行重构，每步仍需运行验证。

---

## 6. 执行流程

1. 路由器判定 WorkNature=refactor → 前置检查（7 项）
2. 前置检查不通过 → 🚫 结构化拒绝 + 路由
3. 前置检查通过 → Tier 判定
4. Tier=light → 直接 Apply；Tier=standard/full → Scan → Design → Apply
5. Apply → Review → Test/Ship（标准路径继续）

---

## 7. 状态更新

### Phase 更新

| 当前阶段完成 | phase 更新为 |
|-------------|-------------|
| refactor-scan | refactor-apply |
| refactor-apply | review |

### Commit 策略

refactor-scan 不 commit（仅产出分析文档）；refactor-apply commit（产出代码变更）。

---

## 8. Edge Cases

Scan 无候选 → `should_fully_stop: true` · Apply 验证失败 → 回滚+记录+下一个 → 连续 3 步失败停止 · 无 `.forge/` → forge init

---

## 9. Known AI Failure Modes

| Failure | Wrong | Correct |
|---------|-------|---------|
| 夹带行为改动 | "顺手"加功能/修bug | 行为等价原则；需改行为的记入 findings/ |
| 不跑测试 | 连续多步后才验证 | 每步操作后都运行验证命令 |
| 一次改太多 | 多重构合并大步骤 | 每步一个方法库方法 |
| 不用方法库命名 | "优化一下" | 候选和方案必须标注方法名 |

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "顺便加个功能" | 重构和功能是独立变更，混合增加 review/rollback 风险 |
| "能跑就不用重构" | 重构价值在于降低未来变更成本 |
