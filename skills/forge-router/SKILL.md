---
name: forge-router
description: "Forge 入口路由器。三维路由：复杂度（档位）× 任务类型（领域）× 项目阶段（生命周期），生成命令序列和行为提示。"
---

# /forge — 入口路由器

> **触发方式**：用户输入 `/forge` 并附带任务描述
> **职责**：三维分析（复杂度 × 任务类型 × 项目阶段）→ 建议档位 + 行为提示 → 用户确认或覆盖 → 启动对应命令序列

---

## 0. 三维路由模型

Forge 路由器从三个维度分析任务：

| 维度 | 决定什么 | 可选值 |
|------|---------|--------|
| **复杂度（Tier）** | 运行**哪些**命令 | 轻量 / 标准 / 全量 |
| **任务类型（TaskType）** | 每个命令**怎么**执行 | frontend / backend / fullstack / data / infra / docs |
| **项目阶段（ProjectPhase）** | **强调**什么 | greenfield / iteration / refactor / bugfix |

复杂度决定命令序列（和之前一样）。任务类型和项目阶段生成**行为提示（Hints）**，注入到命令序列中，让下游 skill 调整行为。

**示例**：同样是标准路径（plan → build → review → test → ship），一个"前端 + 重构"任务和一个"后端 + 新功能"任务会收到完全不同的行为提示。

---

## 1. 路由流程

当用户输入 `/forge <任务描述>` 时，按以下四步执行：

### Step 1：分析任务描述

阅读用户的任务描述，提取以下信号：

**复杂度信号**（决定档位）：

| 信号维度 | 评估方法 |
|---------|---------|
| **影响范围** | 预估涉及的文件数量和改动行数 |
| **需求清晰度** | 需求是否明确、边界是否清晰、是否有现成 Spec |
| **系统影响** | 是否涉及新服务、新数据库、认证体系变更 |
| **现有资产** | `.forge/specs/` 中是否已有相关的锁定 Spec |

**任务类型信号**（决定领域提示）：

| 任务类型 | 判定依据 |
|---------|---------|
| **frontend** | 涉及 UI 组件、样式、页面路由、浏览器交互 |
| **backend** | 涉及 API、数据库、服务端逻辑、中间件 |
| **fullstack** | 同时涉及前后端，或无法明确归类 |
| **data** | 涉及数据管道、ETL、数据分析、报表 |
| **infra** | 涉及 CI/CD、部署、容器、云资源、监控 |
| **docs** | 涉及文档编写、API 文档、README 更新 |

**项目阶段信号**（决定生命周期提示）：

| 项目阶段 | 判定依据 |
|---------|---------|
| **greenfield** | 从零开始的新项目或新模块，无现有代码 |
| **iteration** | 在现有功能基础上迭代新功能（默认值） |
| **refactor** | 重构现有代码，不改变外部行为 |
| **bugfix** | 修复已知 bug |

### Step 2：建议档位 + 维度

根据信号判定表输出建议档位和判定理由：

| 信号 | 建议档位 |
|------|---------|
| 影响文件 ≤ 1 **且** 改动 ≤ 20 行 | **轻量**（light） |
| 有现成 Spec 或需求已明确 | **标准**（standard） |
| 涉及新服务 / 新数据库 / 认证体系变更 | **全量**（full） |
| 需求描述模糊、边界不清 | **全量**（full） |

**判定优先级**（从高到低）：

1. **用户覆盖**：用户明确指定档位时，直接采用，跳过 AI 分析。
2. **全量信号**：任何全量信号命中即建议全量，不降级。
3. **标准信号**：有明确需求或现成 Spec 时建议标准。
4. **轻量信号**：仅当影响文件 ≤ 1 且改动 ≤ 20 行时建议轻量。
5. **默认**：无法判定时，选择**标准**。宁重勿轻。

向用户输出建议时，使用以下格式：

```
📋 路由分析

档位建议：<轻量 | 标准 | 全量>
任务类型：<frontend | backend | fullstack | data | infra | docs>
项目阶段：<greenfield | iteration | refactor | bugfix>
判定理由：<一句话说明为什么选择这个档位>

命令序列：<对应的命令列表>

行为提示：
  • [review] a11y-check — 增加可访问性检查（WCAG 2.1 AA 级别对照）
  • [review] responsive-check — 检查响应式布局在主流断点下的表现
  • [build] component-isolation — 优先以组件为单位拆分任务
  • ...

确认？或覆盖：light / standard / full，--type=backend，--phase=refactor
```

### Step 3：用户确认或覆盖

- **用户确认**（回复确认、是、ok、y 等）：按建议档位启动命令序列。
- **用户覆盖档位**（回复 `light`、`standard`、`full`）：以用户指定的档位为准，忽略 AI 建议。
- **用户覆盖维度**（回复 `--type=backend`、`--phase=refactor` 等）：覆盖对应维度，重新生成行为提示。
- **用户在初始输入中指定**（如 `/forge --type=frontend --phase=refactor 重构登录组件`）：直接采用指定维度。

---

## 2. 三级档位与命令序列

### 轻量路径（light）

**适用场景**：单文件小改动，如修复 typo、调整样式、改配置值。

**命令序列**：

```
build → review
```

| 步骤 | 命令 | 说明 |
|------|------|------|
| 1 | `/forge build` | 直接修改代码，每两步暂停确认 |
| 2 | `/forge review` | 快速评审改动 |

**注意**：轻量路径跳过了 spec、plan、test，仅适用于真正的小改动。如果执行过程中发现改动超出预期，应升级到标准路径。

### 标准路径（standard）

**适用场景**：需求明确的功能开发或 bug 修复，有清晰的输入输出。

**命令序列**：

```
plan → build → review → test → ship
```

| 步骤 | 命令 | 说明 |
|------|------|------|
| 1 | `/forge plan` | 拆解任务为原子步骤 |
| 2 | `/forge build` | 以 Subagent 模式逐任务 TDD 实现 |
| 3 | `/forge review` | 三层独立评审 |
| 4 | `/forge test` | 三层验证（单元测试 + 清单） |
| 5 | `/forge ship` | 门禁检查 + 交付 |

### 全量路径（full）

**适用场景**：新服务、新数据库、认证体系变更、需求模糊需要先厘清方向。

**命令序列**：

```
decide → spec → plan → build → review → test → ship → learn
```

| 步骤 | 命令 | 说明 |
|------|------|------|
| 1 | `/forge decide` | 四视角前置决策（产品/架构/安全/设计） |
| 2 | `/forge spec` | 固化需求为可锁定的规格文档 |
| 3 | `/forge plan` | 拆解为原子任务 |
| 4 | `/forge build` | 全量两阶段实现（研究 + 分模块执行） |
| 5 | `/forge review` | 三层独立评审 |
| 6 | `/forge test` | 三层验证 |
| 7 | `/forge ship` | 门禁检查 + 交付 |
| 8 | `/forge learn` | 五维度知识沉淀 |

---

## 3. 判定信号详解

### 3.1 轻量信号

以下条件**同时满足**时，建议轻量路径：

- 影响文件数量 ≤ 1
- 预估改动行数 ≤ 20 行
- 改动内容是确定性的（不需要设计决策）

**典型场景**：

- 修复一个 typo 或拼写错误
- 调整 CSS 样式值（颜色、间距、字号）
- 修改配置文件中的一个值
- 更新一个常量或环境变量
- 修复一个明显的 off-by-one 错误

### 3.2 标准信号

以下条件**任一满足**时，建议标准路径：

- `.forge/specs/` 中已有相关的锁定 Spec
- 用户提供了明确的需求描述（有清晰的输入、输出、边界条件）
- 任务是对现有功能的增强或修复，影响范围可预估

**典型场景**：

- 为现有 API 添加一个新端点
- 实现一个有明确需求的新组件
- 修复一个有复现步骤的 bug
- 重构一个模块（目标明确）
- 添加表单验证逻辑

### 3.3 全量信号

以下条件**任一满足**时，建议全量路径：

- 涉及创建新服务或新微服务
- 涉及新数据库或数据库 schema 变更
- 涉及认证/授权体系变更
- 需求描述模糊，边界不清晰
- 涉及多个系统的集成
- 影响面广，无法预估改动范围

**典型场景**：

- 搭建一个新的后端服务
- 引入新的数据库或迁移数据库
- 实现 OAuth/SSO 集成
- "我们需要一个用户系统"（需求模糊）
- 重构整个认证流程
- 跨多个微服务的功能开发

---

## 4. 用户覆盖机制

### 4.1 覆盖规则

用户覆盖是最高优先级。当用户明确指定档位时，**无论 AI 分析结果如何**，最终档位以用户为准。

覆盖方式：

1. **内联指定**：`/forge light 修复按钮颜色` — 直接采用 light，不输出建议。
2. **回复覆盖**：AI 建议标准后，用户回复 `full` — 切换到全量。
3. **中文指定**：`/forge 轻量 修复按钮颜色` — 支持中文档位名。

### 4.2 档位名称映射

| 用户输入 | 映射档位 |
|---------|---------|
| `light`、`轻量`、`lite`、`quick` | 轻量（light） |
| `standard`、`标准`、`std`、`normal` | 标准（standard） |
| `full`、`全量`、`complete`、`heavy` | 全量（full） |

### 4.3 降级提醒

当用户将 AI 建议的档位**降级**时（如 AI 建议全量，用户指定轻量），输出一次提醒：

```
⚠️ 注意：AI 建议全量路径（原因：涉及新数据库），你选择了轻量路径。
轻量路径将跳过 decide、spec、plan、test、learn 步骤。
继续使用轻量路径？(y/n)
```

用户确认后执行，不再重复提醒。

---

## 5. 状态更新

路由完成后，更新 `.forge/status.md`：

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

下游命令（plan、build、review、test 等）在启动时**必须读取 `status.md` 中的 `hints` 字段**，并据此调整行为。例如：
- 看到 `a11y-check` → review 阶段增加可访问性检查
- 看到 `reproduce-first` → build 阶段先写复现测试
- 看到 `behavior-preservation` → plan 阶段标注不得改变外部行为

---

## 6. 分类示例

以下示例展示不同任务描述的分类结果：

### 轻量示例

| 任务描述 | 档位 | 类型 | 阶段 | 理由 |
|---------|------|------|------|------|
| "把按钮颜色从蓝色改成绿色" | 轻量 | frontend | iteration | 单文件，改动 < 5 行 |
| "修复 README 中的 typo" | 轻量 | docs | bugfix | 单文件，改动 1 行 |
| "把 API_URL 环境变量改成新地址" | 轻量 | infra | iteration | 单文件配置改动 |

### 标准示例

| 任务描述 | 档位 | 类型 | 阶段 | 理由 | 关键提示 |
|---------|------|------|------|------|---------|
| "为 /users API 添加分页功能" | 标准 | backend | iteration | 需求明确 | api-contract-check, backward-compat |
| "实现登录表单的前端验证" | 标准 | frontend | iteration | 需求明确 | a11y-check, responsive-check |
| "重构 UserService 拆分为独立模块" | 标准 | backend | refactor | 需求明确 | behavior-preservation, characterization-tests |
| "修复用户列表排序 bug" | 标准 | frontend | bugfix | 有复现步骤 | reproduce-first, regression-for-fix |

### 全量示例

| 任务描述 | 档位 | 类型 | 阶段 | 理由 | 关键提示 |
|---------|------|------|------|------|---------|
| "我们需要一个通知系统" | 全量 | backend | greenfield | 需求模糊 | scaffold-first, tech-stack-review |
| "把认证从 JWT 迁移到 OAuth2" | 全量 | backend | refactor | 认证体系变更 | behavior-preservation, error-path-audit |
| "搭建 Kubernetes 部署流水线" | 全量 | infra | greenfield | 新基础设施 | cost-estimate, dry-run-first, blast-radius |
| "构建数据分析仪表盘" | 全量 | fullstack | greenfield | 需求模糊 | scaffold-first, data-volume-estimate |

---

## 7. 边界情况处理

### 7.1 无任务描述

用户仅输入 `/forge` 不附带任务描述时：

```
请描述你要做的任务，我来帮你判断合适的执行路径。

示例：
  /forge 修复登录页面的样式问题
  /forge 为用户 API 添加分页功能
  /forge light 修复 README typo
```

### 7.2 任务描述过于简短

用户输入如 `/forge 修 bug` 等过于简短的描述时，追问一次：

```
任务描述太简短，无法准确判定复杂度。请补充：
1. 具体是什么 bug？
2. 影响哪个模块/文件？
3. 有复现步骤吗？
```

### 7.3 执行中发现档位不匹配

如果在轻量路径执行过程中发现改动超出预期（如需要修改多个文件或改动超过 20 行），应提醒用户：

```
⚠️ 当前改动已超出轻量路径的预期范围（影响 3 个文件，约 45 行改动）。
建议升级到标准路径以获得更完整的流程保障。
升级到标准路径？(y/n)
```

### 7.4 已有进行中的任务

如果 `.forge/status.md` 显示有进行中的任务，提醒用户：

```
⚠️ 检测到进行中的任务：<current_task>（<phase> 阶段）
建议先完成当前任务或使用 /forge resume 恢复上下文。
继续创建新任务？(y/n)
```

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

| 任务类型 | 项目阶段 | 提示标签 | 作用命令 | 说明 |
|---------|---------|---------|---------|------|
| frontend | refactor | `snapshot-update` | test | 重构后检查并更新组件快照测试 |
| backend | bugfix | `error-path-audit` | review | 审查错误处理路径 |
| infra | greenfield | `cost-estimate` | decide | 估算基础设施成本 |
