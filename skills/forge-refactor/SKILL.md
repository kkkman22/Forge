---
name: forge-refactor
description: "重构引擎。通过三阶段流程（scan → design → apply）执行结构化重构，确保行为等价。"
disable-model-invocation: true
---

# /forge refactor — 重构引擎

> **触发方式**：路由器判定 WorkNature=refactor 时自动进入，用户入口仍为 `/forge`
> **职责**：通过三阶段流程（scan → design → apply）执行结构化重构，确保行为等价性
> **输出路径**：`.forge/findings/refactor-scan.md`（扫描结果）+ `.forge/plans/refactor-<topic>.md`（执行方案）+ 代码变更

---

## 1. 概述

`/forge refactor` 是 Forge 工作流中专门处理重构任务的 SKILL。路由器通过关键词匹配（优化/重构/重写/拆分/refactor/optimize/restructure 等）识别重构任务，或用户通过 `--nature=refactor` 显式指定。

**核心原则**：重构 = 改变结构，不改变行为。每步必须通过测试验证行为等价性。测试不存在时，先补测试再重构。

---

## 2. 前置检查

启动重构前逐条验证以下 7 项。**任一命中不得继续**：

| # | 检查条目 | 命中时的路由 |
|---|---------|------------|
| 1 | 夹带行为改动 | → 路由器重新判定为 feature/bugfix |
| 2 | 目标无测试覆盖 | → 先补测试 |
| 3 | 跨模块（3+ 独立模块） | → 先走 `/forge spec` |
| 4 | 全是风格口味 | → 走 lint/formatter 配置 |
| 5 | 生成产物/第三方代码 | → 改源头 |
| 6 | 范围过大（文件 > 15） | → 缩小范围，分批 |
| 7 | 扫完无可改 | → 零输出合法，`should_fully_stop: true` |

**拒绝输出**：`🚫 重构前置检查未通过 — 命中检查：<名称> | 证据：<具体内容> | 建议路由：<命令> | 重入条件：<满足什么后可重试>`

**Autonomous 模式**：返回 JSON `{ success: false, summary, evidence, suggested_route, reentry_condition }`。

---

## 3. 三阶段流程

### 3.1 Scan 阶段（refactor-scan）

扫描代码库，按方法库（§4）四层分类识别候选优化点，输出 `.forge/findings/refactor-scan.md`。

每个候选标注：位置（file:line）、当前问题、建议方法、预估影响、推荐等级（★/☆）。

**Scan 输出格式**：frontmatter（topic/date/candidates）+ 四层分类表（# | 位置 | 问题 | 方法 | 推荐）+ 推荐执行顺序。

**双模式**：interactive 展示候选等待勾选；autonomous 自动选择所有 ★（`refactor_scan_select`，preset: `auto-select-recommended`）。

### 3.2 Design 阶段

为每个勾选项制定执行方案，输出 `.forge/plans/refactor-<topic>.md`。每项方案包含：方法名、执行步骤、退出信号、验证方式、回滚策略。

**双模式**：interactive 等待 review 批准；autonomous 自动批准（`refactor_design_review`，preset: `auto-approve`）。

### 3.3 Apply 阶段（refactor-apply）

逐步执行方案，每步验证行为等价：操作 → 运行验证（测试/lint/typecheck）→ 通过继续 / 失败回滚。全部完成后全量测试 + 原子提交。

**双模式**：interactive 每步等待放行；autonomous 自动继续（`refactor_apply_step`，preset: `continue`）。

---

## 4. 方法库

### L1 — 行为等价迁移（最低风险）

| 方法 | 适用场景 |
|------|---------|
| Rename | 命名不清晰/不一致 |
| Move | 职责错位 |
| Extract Constant | 散落字面量 |
| Extract Type | 重复类型声明 |
| Inline | 过度抽象（只用一次） |

### L2 — Fowler 经典（中等风险）

| 方法 | 适用场景 |
|------|---------|
| Extract Method | 方法过长（>30 行） |
| Extract Class | 类职责过多 |
| Replace Conditional with Polymorphism | 复杂 if/switch 链 |
| Introduce Parameter Object | 参数过多（>3） |
| Replace Temp with Query | 复杂临时变量计算 |
| Encapsulate Field | 直接访问内部状态 |

### L3 — 结构拆分（较高风险）

Split Module（职责过多）/ Split Class（上帝类）/ Introduce Facade（调用方需了解太多内部）/ Extract Layer（层次混乱）

### L4 — 性能（需度量验证）

Lazy Loading / Caching / Batch Processing / Memoization — 分别解决启动时间过长、重复昂贵计算、N+1 查询、相同输入重复调用。

---

## 5. 快速通道（Tier=light）

入场条件：单文件、改动点 ≤ 3、有测试覆盖。跳过 scan，直接 `refactor-apply → review`。apply 仍每步验证。

---

## 6. 执行流程

1. 路由器判定 WorkNature=refactor → 前置检查（7 项）
2. 不通过 → 🚫 拒绝 + 路由；通过 → Tier 判定
3. Tier=light → 直接 Apply；standard/full → Scan → Design → Apply
4. Apply → Review → Test/Ship

---

## 7. 状态更新

| 当前阶段完成 | phase 更新为 |
|-------------|-------------|
| refactor-scan | refactor-apply |
| refactor-apply | review |

refactor-scan 不 commit（仅分析文档）；refactor-apply commit（代码变更）。

---

## 8. 边界情况处理

| 条件 | 处理 |
|------|------|
| Scan 无候选 | ℹ️ 未发现候选项，`should_fully_stop: true` |
| Apply 验证失败 | 回滚当前步骤 → 记录原因 → 继续下一个 → 连续 3 步失败停止 |
| 无 `.forge/` 目录 | ⚠️ 请先运行 forge init |

---

## 9. 已知 AI 失败模式

| 失败模式 | 错误行为 | 正确做法 |
|---------|---------|---------|
| 夹带行为改动 | "顺手"加新功能或改行为 | 严格行为等价。发现需改行为的地方记录到 `.forge/findings/` |
| 不跑测试就重构 | 多步后才跑测试或根本不跑 | 每步后都运行验证：操作 → 验证 → 通过继续/失败回滚 |
| 一次改太多 | 多个独立重构合并成大步骤 | 每步只做一个操作，对应方法库中的一个方法 |
| 不用方法库命名 | 模糊描述"优化一下" | 候选必须标注方法名（如"Extract Method"） |
