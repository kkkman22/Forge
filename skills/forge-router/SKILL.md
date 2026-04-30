---
name: forge-router
description: "Forge 入口路由器。三维路由：复杂度（档位）× 任务类型（领域）× 项目阶段（生命周期），生成命令序列和行为提示。"
---

# /forge — 入口路由器

> **触发方式**：用户输入 `/forge` 并附带任务描述
> **职责**：三维分析（复杂度 × 任务类型 × 项目阶段）→ 建议档位 + 行为提示 → 用户确认或覆盖 → 启动对应命令序列

---

## 0. 三维路由模型

| 维度 | 决定什么 | 可选值 |
|------|---------|--------|
| **复杂度（Tier）** | 运行**哪些**命令 | 轻量 / 标准 / 全量 |
| **任务类型（TaskType）** | 每个命令**怎么**执行 | frontend / backend / fullstack / data / infra / docs |
| **项目阶段（ProjectPhase）** | **强调**什么 | greenfield / iteration / refactor / bugfix |

复杂度决定命令序列。任务类型和项目阶段生成**行为提示（Hints）**，注入到命令序列中，让下游 skill 调整行为。

---

## 1. 路由流程

### Step 1：分析任务描述

**复杂度信号**：影响范围（文件数/行数）、需求清晰度（是否明确、有现成 Spec）、系统影响（新服务/数据库/认证变更）、现有资产（`.forge/specs/` 已有锁定 Spec）。

**任务类型判定**：frontend（UI/样式/路由/浏览器交互）；backend（API/数据库/服务端逻辑/中间件）；fullstack（前后端均涉及）；data（管道/ETL/分析/报表）；infra（CI-CD/部署/容器/云资源）；docs（文档编写/API 文档）。

**项目阶段判定**：greenfield（从零开始，无现有代码）；iteration（现有功能迭代，**默认值**）；refactor（重构不改变外部行为）；bugfix（修复已知 bug）。

### Step 2：建议档位 + 维度

| 信号 | 建议档位 |
|------|---------|
| 影响文件 ≤ 1 **且** 改动 ≤ 20 行 | **轻量** |
| 有现成 Spec 或需求已明确 | **标准** |
| 涉及新服务/数据库/认证变更/需求模糊 | **全量** |

**判定优先级**：用户覆盖 > 全量信号 > 标准信号 > 轻量信号 > 默认标准

```
📋 路由分析

档位建议：<轻量 | 标准 | 全量>
任务类型：<类型>
项目阶段：<阶段>
判定理由：<一句话>
命令序列：<命令列表>
行为提示：
  • [review] a11y-check — 增加可访问性检查
  • ...

确认？或覆盖：light / standard / full，--type=backend，--phase=refactor
```

### Step 3：用户确认或覆盖

确认（ok/y/是）→ 按建议启动。覆盖档位（`light`/`standard`/`full`）→ 以用户为准。覆盖维度（`--type=backend`）→ 重新生成提示。初始输入中指定（`--type=frontend --phase=refactor`）→ 直接采用。

---

## 2. 三级档位与命令序列

→ 详见 CLAUDE.md §1 三级路由。此处仅列出 router 特有的扩展：

| 变体 | 命令序列 |
|------|---------|
| refactor_light | refactor-apply → review |
| refactor_standard | refactor-scan → refactor-apply → review → test → ship |
| fix_light | fix-apply → review |
| fix_standard | fix-analyze → fix-apply → review → test → ship |

---

## 3. 判定信号详解

**轻量**：影响文件 ≤ 1，改动 ≤ 20 行，改动内容确定性。典型：修复 typo、调整 CSS 值、修改配置常量。

**标准**：已有锁定 Spec、需求描述明确、任务影响范围可预估。典型：添加 API 端点、实现明确需求的新组件、有复现步骤的 bug。

**全量**：新服务/数据库、认证体系变更、需求模糊、多系统集成、影响面不可预估。典型：搭建新后端服务、OAuth/SSO 集成。

---

## 4. 用户覆盖机制

用户覆盖是最高优先级。覆盖词映射：`light`/`轻量`/`lite`/`quick` → 轻量；`standard`/`标准`/`std`/`normal` → 标准；`full`/`全量`/`complete`/`heavy` → 全量。

**降级提醒**：用户将 AI 建议档位降级时，输出一次提醒并要求确认，说明跳过哪些步骤。

---

## 5. 状态更新

路由完成后写入状态文件（单任务：`.forge/status.md`；多任务：`.forge/status/<task-id>.md`）：

```yaml
---
current_task: "<任务描述>"
tier: "light" | "standard" | "full"
task_type: "frontend" | "backend" | "fullstack" | "data" | "infra" | "docs"
project_phase: "greenfield" | "iteration" | "refactor" | "bugfix"
phase: "<命令序列的第一个命令>"
hints: "<行为提示标签列表，逗号分隔>"
updated: "YYYY-MM-DD HH:mm"
---
```

下游命令启动时**必须读取 `hints` 字段**并据此调整行为。

---

## 6. 分类示例

### Canonical：轻量

| 任务描述 | 类型 | 阶段 | 理由 |
|---------|------|------|------|
| "把按钮颜色从蓝色改成绿色" | frontend | iteration | 单文件，改动 < 5 行 |

**标准示例**："为 /users API 添加分页功能" → backend/iteration, hints: api-contract-check, backward-compat。**全量示例**："我们需要一个通知系统" → backend/greenfield, hints: scaffold-first, tech-stack-review。

---

## 7. 边界情况处理

| 条件 | 输出 |
|------|------|
| 无任务描述 | 请描述你要做的任务 |
| 任务描述过于简短 | 追问具体是什么 bug、影响哪个模块、有复现步骤吗 |
| 轻量路径中改动超出预期 | ⚠️ 建议升级到标准路径 |
| 已有进行中的任务 | ⚠️ 检测到进行中任务，建议先完成或 /forge resume |
| 多任务模式下已有活跃任务 | 展示活跃任务列表，确认后写入新任务 StatusFile |

---

## 8. 行为提示参考表

行为提示（Hints）根据任务类型和项目阶段自动生成，注入命令序列指导下游 skill 调整行为。提示是**叠加的**——只增加检查项或强调点，不移除命令。

| Hint | 作用命令 | 触发条件 |
|------|---------|---------|
| `a11y-check` | review | frontend |
| `responsive-check` | review | frontend |
| `visual-regression` | test | frontend |
| `component-isolation` | build | frontend |
| `api-contract-check` | review | backend |
| `n-plus-one-check` | review | backend |
| `integration-test` | test | backend |
| `migration-safety` | build | backend |
| `data-integrity-check` | review | data |
| `data-validation` | test | data |
| `data-volume-estimate` | plan | data |
| `iac-drift-check` | review | infra |
| `dry-run-first` | build | infra |
| `blast-radius` | review | infra |
| `accuracy-check` | review | docs |
| `link-check` | review | docs |
| `scaffold-first` | plan | greenfield |
| `tech-stack-review` | decide | greenfield |
| `backward-compat` | review | iteration |
| `regression-suite` | test | iteration |
| `behavior-preservation` | plan | refactor |
| `characterization-tests` | test | refactor |
| `small-steps` | build | refactor |
| `behavior-diff` | review | refactor |
| `reproduce-first` | build | bugfix |
| `root-cause-focus` | plan | bugfix |
| `regression-for-fix` | test | bugfix |
| `snapshot-update` | test | frontend + refactor |
| `error-path-audit` | review | backend + bugfix |
| `cost-estimate` | decide | infra + greenfield |
