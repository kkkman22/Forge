---
name: forge-router
description: "Forge 入口路由器。三维路由：复杂度（档位）× 任务类型（领域）× 项目阶段（生命周期），生成命令序列和行为提示。"
---

# /forge — 入口路由器

> **触发方式**：用户输入 `/forge` 并附带任务描述
> **职责**：三维分析（复杂度 × 任务类型 × 项目阶段）→ 建议档位 + 行为提示 → 用户确认或覆盖 → 启动对应命令序列

---

## 0. Three-Dimensional Routing Model

Forge 路由器从三个维度分析任务：

| 维度 | 决定什么 | 可选值 |
|------|---------|--------|
| **复杂度（Tier）** | 运行**哪些**命令 | 轻量 / 标准 / 全量 |
| **任务类型（TaskType）** | 每个命令**怎么**执行 | frontend / backend / fullstack / data / infra / docs |
| **项目阶段（ProjectPhase）** | **强调**什么 | greenfield / iteration / refactor / bugfix |

复杂度决定命令序列。任务类型和项目阶段生成**行为提示（Hints）**，注入到命令序列中，让下游 skill 调整行为。

---

**Not For**：
- 已知要执行的子命令（直接 `/forge build`）
- 非 Forge 管理的任务

## 1. Routing Flow

当用户输入 `/forge <任务描述>` 时，按以下四步执行：

### Step 1：分析任务描述

**复杂度信号**（决定档位）：

| 信号维度 | 评估方法 |
|---------|---------|
| **影响范围** | 预估涉及的文件数量和改动行数 |
| **需求清晰度** | 需求是否明确、边界是否清晰、是否有现成 Spec |
| **系统影响** | 是否涉及新服务、新数据库、认证体系变更 |
| **现有资产** | `.forge/specs/` 中是否已有相关的锁定 Spec |

**任务类型信号**：

frontend（UI/样式/路由）· backend（API/DB/中间件）· fullstack（前后端交叉）· data（管道/ETL/报表）· infra（CI/CD/部署/云资源）· docs（文档/README）

**项目阶段信号**：

greenfield（从零开始）· iteration（现有功能迭代，默认）· refactor（不改外部行为）· bugfix（修复已知 bug）

**假设生成**：从技术栈、影响范围、实现模式、数据层、棕地/绿地维度生成 3-5 条显式假设。内容必须来自实际项目扫描，至少覆盖技术栈和影响范围。

### Step 2：建议档位 + 维度

| 信号 | 建议档位 |
|------|---------|
| 影响文件 ≤ 1 **且** 改动 ≤ 20 行 | **轻量** |
| 有现成 Spec 或需求已明确 | **标准** |
| 涉及新服务 / 新数据库 / 认证体系变更 / 需求模糊 | **全量** |

**判定优先级**（从高到低）：用户覆盖 > 全量信号 > 标准信号 > 轻量信号 > 默认标准

```
📋 路由分析
档位：<light|standard|full> | 类型：<task_type> | 阶段：<project_phase>
理由：<一句话> | 命令序列：<commands>
行为提示：<hint tags>
假设：1. <判断>（基于 <来源>）...
确认？或覆盖：light/standard/full，--type=，--phase=
```

### Step 3：用户确认或覆盖

- **用户确认**（回复确认、是、ok、y 等）：按建议档位启动
- **用户覆盖档位**（回复 `light`、`standard`、`full`）：以用户指定的为准
- **用户覆盖维度**（回复 `--type=backend` 等）：覆盖对应维度，重新生成行为提示
- **用户纠正假设**（回复具体纠正内容）：更新对应假设，继续流程
- **用户不回应假设**：按已列出的假设继续
- **用户在初始输入中指定**（如 `/forge --type=frontend --phase=refactor 重构登录组件`）：直接采用

---

## 2. Three-Tier Levels and Command Sequences

→ 三档定义见 CLAUDE.md §1。Router 额外支持：
- **refactor_light**: refactor-apply → review
- **refactor_standard**: refactor-scan → refactor-apply → review → test → ship
- **fix_light**: fix-apply → review
- **fix_standard**: fix-analyze → fix-apply → review → test → ship

---

## 3. Routing Signal Details

**Light**: 影响文件 ≤1 且改动 ≤20 行且确定性改动（typo/CSS/配置常量）。
**Standard**: 任一满足：已有锁定 Spec / 需求明确 / 影响范围可预估。
**Full**: 任一满足：新服务/新数据库 / 认证变更 / 需求模糊 / 多系统集成。

---

## 4. User Override

用户覆盖优先级最高。映射：light/轻量/lite/quick → light · standard/标准/std → standard · full/全量/complete/heavy → full。用户降级档位时输出一次提醒并确认。

---

## 5. Status Update

路由完成后更新 `.forge/status.md`（单任务）或 `.forge/status/<task-id>.md`（多任务，调用 `writeTaskStatus`）。字段：`current_task`, `tier`, `task_type`, `project_phase`, `phase`, `hints`（逗号分隔标签）, `assumptions`（可选数组）, `updated`。下游 SKILL 必须读取 `hints` 调整行为。

---

## 6. Classification Examples

**Light**: "按钮颜色蓝改绿" (frontend/iteration, 单文件<5行) · "修复 README typo" (docs/bugfix, 1行)

**Standard**: "/users API 添加分页" (backend/iteration, api-contract-check+backward-compat) · "登录表单前端验证" (frontend/iteration, a11y-check)

**Full**: "需要一个通知系统" (backend/greenfield, scaffold-first+tech-stack-review) · "JWT 迁移到 OAuth2" (backend/refactor, behavior-preservation+error-path-audit)

---

## 7. Edge Cases

无描述 → prompt 示例 · 过于简短 → 追问 · 轻量超范围 → 建议升级 · 已有活跃任务(单) → 提示 resume · 已有活跃任务(多) → 展示列表+确认

---

## 8. Behavior Hints Reference

提示是叠加的（只增加检查项，不移除命令）。按 Scope 触发：

| Hint | Scope | Target Command |
|------|-------|---------------|
| `a11y-check` | frontend | review |
| `responsive-check` | frontend | review |
| `visual-regression` | frontend | test |
| `component-isolation` | frontend | build |
| `api-contract-check` | backend | review |
| `n-plus-one-check` | backend | review |
| `integration-test` | backend | test |
| `migration-safety` | backend | build |
| `data-integrity-check` | data | review |
| `data-validation` | data | test |
| `data-volume-estimate` | data | plan |
| `iac-drift-check` | infra | review |
| `dry-run-first` | infra | build |
| `blast-radius` | infra | review |
| `accuracy-check` | docs | review |
| `link-check` | docs | review |
| `scaffold-first` | greenfield | plan |
| `tech-stack-review` | greenfield | decide |
| `backward-compat` | iteration | review |
| `regression-suite` | iteration | test |
| `behavior-preservation` | refactor | plan |
| `characterization-tests` | refactor | test |
| `small-steps` | refactor | build |
| `behavior-diff` | refactor | review |
| `reproduce-first` | bugfix | build |
| `root-cause-focus` | bugfix | plan |
| `regression-for-fix` | bugfix | test |
| `snapshot-update` | frontend+refactor | test |
| `error-path-audit` | backend+bugfix | review |
| `cost-estimate` | infra+greenfield | decide |
