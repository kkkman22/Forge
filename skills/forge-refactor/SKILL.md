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

## 1. Overview

`/forge refactor` 是 Forge 工作流中专门处理重构任务的 SKILL。当路由器通过 WorkNature 维度判定任务为重构性质时，自动分流到此工作流。用户无需记忆独立命令——入口仍然是 `/forge`。

**核心原则**：重构 = 改变结构，不改变行为。每一步都必须通过测试验证行为等价性。如果测试不存在，先补测试再重构。

**触发方式**：由路由器 WorkNature=refactor 自动分流。路由器通过关键词匹配（优化、重构、重写、拆分、性能改进、代码整理、refactor、optimize、restructure、simplify）识别重构任务。用户也可通过 `--nature=refactor` 显式覆盖。

---

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

**Rejection output format**:

```
🚫 重构前置检查未通过

命中检查：<检查条目名称>
证据：<具体的文件路径、分析结果或状态>
建议路由：<应该先执行的命令或工作流>
重入条件：<满足什么条件后可以重新运行重构>
```

**Autonomous 模式行为**：前置检查不通过时，Agent 返回 JSON：`{ success: false, summary, evidence, suggested_route, reentry_condition }`

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

**Scan 输出格式**：

```markdown
---
topic: "<主题>"
date: "YYYY-MM-DD"
candidates: <数量>
---

## 扫描结果

### L1 — 行为等价迁移

| # | 位置 | 当前问题 | 建议方法 | 推荐 |
|---|------|---------|---------|------|
| 1 | `src/utils.ts:42` | 魔法数字散落多处 | Extract Constant | ★ |

### L2 — Fowler 经典

| # | 位置 | 当前问题 | 建议方法 | 推荐 |
|---|------|---------|---------|------|
| 2 | `src/service.ts:80-120` | 方法过长（40 行） | Extract Method | ★ |

## 推荐执行顺序

1. #1 Extract Constant（低风险，立即可做）
2. #2 Extract Method（中风险，需验证调用方）
```

**双模式行为**：

| 模式 | 行为 | ConfirmationPoint |
|------|------|------------------|
| interactive | 展示候选清单，等待用户勾选 | — |
| autonomous | 自动选择所有推荐项（★） | `refactor_scan_select`，preset: `auto-select-recommended` |

### 3.2 Design 阶段

**职责**：为每个勾选的候选项制定详细执行方案。

**产出**：`.forge/plans/refactor-<topic>.md`

**每个候选项的方案包含**：方法名（从方法库引用）、执行步骤、退出信号、验证方式、回滚策略。

**双模式行为**：interactive 展示方案等待用户 review 和批准；autonomous 自动批准（`refactor_design_review`，preset: `auto-approve`）。

### 3.3 Apply 阶段（refactor-apply）

**职责**：逐步执行重构方案，每步验证行为等价性。

1. 按方案中的执行步骤逐步操作
2. 每步完成后运行验证命令（测试/lint/typecheck）
3. 验证通过 → 继续；失败 → 回滚当前步骤，记录失败原因
4. 所有步骤完成后，运行全量测试确认无回归
5. 执行原子提交

**双模式行为**：interactive 每步等待用户放行；autonomous 自动继续（`refactor_apply_step`，preset: `continue`）。

---

## 4. 方法库

重构方法按四层分类，scan 阶段按此分类匹配候选，design 阶段每步引用方法名。

### L1 — 行为等价迁移（最低风险）

| 方法 | 适用场景 |
|------|---------|
| Rename | 命名不清晰、不一致 |
| Move | 职责错位 |
| Extract Constant | 散落的字面量 |
| Extract Type | 重复的类型声明 |
| Inline | 过度抽象（只用一次） |

### L2 — Fowler 经典（中等风险）

| 方法 | 适用场景 |
|------|---------|
| Extract Method | 方法过长（>30 行） |
| Extract Class | 类职责过多 |
| Replace Conditional with Polymorphism | 复杂的 if/switch 链 |
| Introduce Parameter Object | 参数过多（>3 个） |
| Replace Temp with Query | 复杂的临时变量计算 |
| Encapsulate Field | 直接访问内部状态 |

### L3 — 结构拆分（较高风险）

| 方法 | 适用场景 |
|------|---------|
| Split Module | 模块职责过多 |
| Split Class | 上帝类 |
| Introduce Facade | 调用方需要了解太多内部细节 |
| Extract Layer | 层次混乱 |

### L4 — 性能（需要度量验证）

| 方法 | 适用场景 |
|------|---------|
| Lazy Loading | 启动时间过长 |
| Caching | 重复的昂贵计算 |
| Batch Processing | N+1 查询、逐条 API 调用 |
| Memoization | 相同输入的重复调用 |

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

## 8. 边界情况处理

| 条件 | 处理 |
|------|------|
| Scan 无候选 | ℹ️ 未发现需要重构的候选项，当前代码结构良好。Agent 返回 `should_fully_stop: true` |
| Apply 步骤验证失败 | 回滚当前步骤 → 记录失败原因 → 继续下一个候选项 → 连续 3 步失败则停止 |
| 无 `.forge/` 目录 | ⚠️ 请先运行 forge init 初始化项目 |

---

## 9. 已知 AI 失败模式

| 失败模式 | 错误行为 | 正确做法 |
|---------|---------|---------|
| 夹带行为改动 | "顺手"添加新功能、修复 bug 或改变外部行为 | 严格遵守行为等价原则。发现需修改行为的地方记录到 `.forge/findings/`，留给后续流程 |
| 不跑测试就重构 | 连续多步后才运行测试或根本不跑测试 | 每一步重构操作后都运行验证命令：操作 → 验证 → 通过则继续，失败则回滚 |
| 一次改太多 | 多个独立重构合并成大步骤 | 每步只做一个重构操作，对应方法库中的一个方法 |
| 不用方法库命名 | 用模糊描述（"优化一下"）而非具体方法名 | scan 候选必须标注方法名（如 "Extract Method"），design 每步必须引用方法名 |
