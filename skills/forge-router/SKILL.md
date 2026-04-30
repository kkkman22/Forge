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

| 任务类型 | 判定依据 |
|---------|---------|
| **frontend** | 涉及 UI 组件、样式、页面路由、浏览器交互 |
| **backend** | 涉及 API、数据库、服务端逻辑、中间件 |
| **fullstack** | 同时涉及前后端，或无法明确归类 |
| **data** | 涉及数据管道、ETL、数据分析、报表 |
| **infra** | 涉及 CI/CD、部署、容器、云资源、监控 |
| **docs** | 涉及文档编写、API 文档、README 更新 |

**项目阶段信号**：

| 项目阶段 | 判定依据 |
|---------|---------|
| **greenfield** | 从零开始的新项目或新模块，无现有代码 |
| **iteration** | 在现有功能基础上迭代新功能（默认值） |
| **refactor** | 重构现有代码，不改变外部行为 |
| **bugfix** | 修复已知 bug |

### Step 2：建议档位 + 维度

| 信号 | 建议档位 |
|------|---------|
| 影响文件 ≤ 1 **且** 改动 ≤ 20 行 | **轻量** |
| 有现成 Spec 或需求已明确 | **标准** |
| 涉及新服务 / 新数据库 / 认证体系变更 / 需求模糊 | **全量** |

**判定优先级**（从高到低）：用户覆盖 > 全量信号 > 标准信号 > 轻量信号 > 默认标准

```
📋 路由分析

档位建议：<轻量 | 标准 | 全量>
任务类型：<frontend | backend | fullstack | data | infra | docs>
项目阶段：<greenfield | iteration | refactor | bugfix>
判定理由：<一句话说明为什么选择这个档位>

命令序列：<对应的命令列表>

行为提示：
  • [review] a11y-check — 增加可访问性检查
  • [build] component-isolation — 优先以组件为单位拆分任务
  • ...

确认？或覆盖：light / standard / full，--type=backend，--phase=refactor
```

### Step 3：用户确认或覆盖

- **用户确认**（回复确认、是、ok、y 等）：按建议档位启动
- **用户覆盖档位**（回复 `light`、`standard`、`full`）：以用户指定的为准
- **用户覆盖维度**（回复 `--type=backend` 等）：覆盖对应维度，重新生成行为提示
- **用户在初始输入中指定**（如 `/forge --type=frontend --phase=refactor 重构登录组件`）：直接采用

---

## 2. Three-Tier Levels and Command Sequences

| 档位 | 命令序列 | 适用场景 |
|------|---------|---------|
| **轻量** | `build → review` | 单文件小改动（typo、样式值、配置值）。跳过 spec/plan/test |
| **标准** | `plan → build → review → test → ship` | 需求明确的功能开发或 bug 修复 |
| **全量** | `decide → spec → plan → build → review → test → ship → learn` | 新服务、认证变更、需求模糊 |

---

## 3. Routing Signal Details

### 3.1 Light Signals

以下条件**同时满足**时建议轻量：影响文件 ≤ 1，改动 ≤ 20 行，改动内容是确定性的。典型：修复 typo、调整 CSS 值、修改配置常量。

### 3.2 Standard Signals

以下**任一满足**时建议标准：已有锁定 Spec、需求描述明确、任务影响范围可预估。典型：添加 API 端点、实现明确需求的新组件、有复现步骤的 bug。

### 3.3 Full Signals

以下**任一满足**时建议全量：新服务/新数据库、认证体系变更、需求模糊、多系统集成、影响面不可预估。典型：搭建新后端服务、OAuth/SSO 集成、"需要一个用户系统"。

---

## 4. User Override Mechanism

用户覆盖是最高优先级，无论 AI 分析结果如何。

**覆盖方式**：

| 用户输入 | 映射档位 |
|---------|---------|
| `light`、`轻量`、`lite`、`quick` | 轻量（light） |
| `standard`、`标准`、`std`、`normal` | 标准（standard） |
| `full`、`全量`、`complete`、`heavy` | 全量（full） |

**降级提醒**：当用户将 AI 建议的档位**降级**时，输出一次提醒：

```
⚠️ 注意：AI 建议全量路径（原因：涉及新数据库），你选择了轻量路径。
轻量路径将跳过 decide、spec、plan、test、learn 步骤。
继续使用轻量路径？(y/n)
```

---

## 5. Status Update

路由完成后，更新状态文件：

**单任务模式**（无 `.forge/status/` 目录）：写入 `.forge/status.md`。

**多任务模式**（`.forge/status/` 目录存在）：调用 `writeTaskStatus(io, forgeRoot, taskName, content)` 写入 `.forge/status/<task-id>.md`。如为新任务且已有活跃任务，自动从单文件模式迁移。

```yaml
---
current_task: "<用户的任务描述>"
tier: "light" | "standard" | "full"
task_type: "frontend" | "backend" | "fullstack" | "data" | "infra" | "docs"
project_phase: "greenfield" | "iteration" | "refactor" | "bugfix"
phase: "<命令序列的第一个命令>"
hints: "<行为提示标签列表，逗号分隔>"
updated: "YYYY-MM-DD HH:mm"
---
```

下游命令启动时**必须读取 `hints` 字段**并据此调整行为（如 `a11y-check` → review 增加可访问性检查；`reproduce-first` → build 先写复现测试）。

---

## 6. Classification Examples

### Light Examples

| 任务描述 | 类型 | 阶段 | 理由 |
|---------|------|------|------|
| "把按钮颜色从蓝色改成绿色" | frontend | iteration | 单文件，改动 < 5 行 |
| "修复 README 中的 typo" | docs | bugfix | 单文件，改动 1 行 |
| "把 API_URL 环境变量改成新地址" | infra | iteration | 单文件配置改动 |

### Standard Examples

| 任务描述 | 类型 | 阶段 | 关键提示 |
|---------|------|------|---------|
| "为 /users API 添加分页功能" | backend | iteration | api-contract-check, backward-compat |
| "实现登录表单的前端验证" | frontend | iteration | a11y-check, responsive-check |
| "重构 UserService 拆分为独立模块" | backend | refactor | behavior-preservation, characterization-tests |
| "修复用户列表排序 bug" | frontend | bugfix | reproduce-first, regression-for-fix |

### Full Examples

| 任务描述 | 类型 | 阶段 | 关键提示 |
|---------|------|------|---------|
| "我们需要一个通知系统" | backend | greenfield | scaffold-first, tech-stack-review |
| "把认证从 JWT 迁移到 OAuth2" | backend | refactor | behavior-preservation, error-path-audit |
| "搭建 Kubernetes 部署流水线" | infra | greenfield | cost-estimate, dry-run-first, blast-radius |
| "构建数据分析仪表盘" | fullstack | greenfield | scaffold-first, data-volume-estimate |

---

## 7. 边界情况处理

| 条件 | 输出 |
|------|------|
| 无任务描述 | 请描述你要做的任务，我来帮你判断合适的执行路径。示例：/forge 修复登录页面的样式问题 |
| 任务描述过于简短 | 追问具体是什么 bug、影响哪个模块、有复现步骤吗 |
| 轻量路径中改动超出预期 | ⚠️ 改动已超出轻量路径预期范围，建议升级到标准路径 |
| 已有进行中的任务（单任务） | ⚠️ 检测到进行中的任务，建议先完成或使用 /forge resume |
| 已有进行中的任务（多任务） | 展示活跃任务列表（任务名 + 阶段 + 更新时间），确认后写入新任务的 Task_StatusFile |

---

## 8. 行为提示参考表

行为提示（Hints）是路由器根据任务类型和项目阶段自动生成的，注入到命令序列中指导下游 skill 调整行为。提示是**叠加的**——不会移除命令，只会增加检查项或强调点。

### 8.1 按任务类型

| 任务类型 | 提示标签 | 作用命令 | 说明 |
|---------|---------|---------|------|
| frontend | `a11y-check` | review | 增加可访问性检查（WCAG 2.1 AA） |
| frontend | `responsive-check` | review | 检查响应式布局在主流断点下的表现 |
| frontend | `visual-regression` | test | 建议运行视觉回归测试 |
| frontend | `component-isolation` | build | 优先以组件为单位拆分任务 |
| backend | `api-contract-check` | review | 检查 API 契约向后兼容性 |
| backend | `n-plus-one-check` | review | 重点检查 N+1 查询和数据库性能热点 |
| backend | `integration-test` | test | 除单元测试外补充 API 集成测试 |
| backend | `migration-safety` | build | 数据库变更必须有可回滚的迁移脚本 |
| data | `data-integrity-check` | review | 检查数据一致性约束和边界值处理 |
| data | `data-validation` | test | 测试数据管道的输入验证和异常数据处理 |
| data | `data-volume-estimate` | plan | 在计划中估算数据量级 |
| infra | `iac-drift-check` | review | 检查基础设施代码与实际状态的漂移风险 |
| infra | `dry-run-first` | build | 变更前先执行 dry-run / plan |
| infra | `blast-radius` | review | 评估变更的爆炸半径 |
| docs | `accuracy-check` | review | 对照代码验证文档中的示例和 API 签名 |
| docs | `link-check` | review | 检查文档中的链接是否有效 |

### 8.2 按项目阶段

| 项目阶段 | 提示标签 | 作用命令 | 说明 |
|---------|---------|---------|------|
| greenfield | `scaffold-first` | plan | 优先搭建项目骨架和基础设施 |
| greenfield | `tech-stack-review` | decide | 评估技术栈选型的长期影响 |
| iteration | `backward-compat` | review | 检查对现有用户的向后兼容性 |
| iteration | `regression-suite` | test | 确保运行完整回归测试套件 |
| refactor | `behavior-preservation` | plan | 标注每个任务不得改变外部可观察行为 |
| refactor | `characterization-tests` | test | 重构前先补充特征测试锁定现有行为 |
| refactor | `small-steps` | build | 每步重构尽量小，每步都运行测试 |
| refactor | `behavior-diff` | review | 确认重构未引入行为变更 |
| bugfix | `reproduce-first` | build | 先写复现 bug 的失败测试 |
| bugfix | `root-cause-focus` | plan | 计划中必须包含根因分析 |
| bugfix | `regression-for-fix` | test | 修复后补充回归测试 |

### 8.3 跨维度组合

| 任务类型 | 项目阶段 | 提示标签 | 作用命令 |
|---------|---------|---------|---------|
| frontend | refactor | `snapshot-update` | test |
| backend | bugfix | `error-path-audit` | review |
| infra | greenfield | `cost-estimate` | decide |
