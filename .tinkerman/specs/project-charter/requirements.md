---
status: completed
feature: project-charter
layout: requirements
created: 2026-06-04
tier: standard
---
# Requirements Document — Project Charter（项目宪章）

## 引言

随着 Forge 项目 spec 数量增长，一个结构性问题浮现：**spec 之间缺乏一致性锚定**。`/forge decide` 为每个决策产出独立的 ADR，但 10 个 ADR 之间可能暗含矛盾——spec 3 选了 REST，spec 7 引入了 GraphQL；spec 1 约定了 monolith，spec 5 开始拆微服务。没有任何机制在 `decide` 或 `spec` 执行时检测跨 spec 的一致性。

Every Inc 的 compound-engineering-plugin（CE）用 `STRATEGY.md` 解决了同类问题——一份持久的产品策略文档，所有下游 skill 自动读取作为 grounding。但 CE 的 `STRATEGY.md` 偏产品（用户画像、市场指标），不完全适合 Forge 的工程纪律定位。

本 spec 引入 `.tinkerman/charter.md`（项目宪章）——一个**工程导向的策略锚定物**，记录项目的核心约束、架构边界、技术选型基线和不变量。它不是产品管理文档，而是**跨 spec 的工程一致性保证**。

**本 spec 的范围**：
- 定义 `.tinkerman/charter.md` 的格式和生命周期
- 实现 `/forge charter` 命令（创建 / 更新 / 校验）
- 让 `/forge decide`、`/forge spec`、`/forge plan` 自动读取 charter 作为 grounding
- 让 `/forge review` 的 spec-check 层检测 charter 违规

**不在范围内**：
- 产品管理功能（用户画像、市场分析、竞品对比）——这些属于业务层，不属于 Forge
- 自动化 charter 生成（需要用户参与，不能纯 AI 产出）
- 跨项目 charter（每个项目独立）

## 术语表

- **Charter**：项目宪章文件 `.tinkerman/charter.md`，记录项目的工程策略锚定物。位于 `.tinkerman/` 保护区的 open 子集中。
- **Charter_Invariants**：charter 中的"不可违反"条款。一旦声明，`/forge review` 的 spec-check 将其作为硬约束检查。
- **Charter_Boundaries**：charter 中的架构边界声明（如"前后端通过 REST API 通信"、"数据层只通过 repository pattern 访问"）。
- **Charter_Baseline**：charter 中的技术选型基线（如"TypeScript strict mode"、"PostgreSQL as primary DB"、"React with Server Components"）。
- **Charter_Drift**：当新 spec 的决策与 charter 的 Invariants 或 Boundaries 矛盾时，称为 charter drift。
- **Grounding_Read**：下游 skill（decide/spec/plan）在执行前自动读取 charter 并将其作为上下文约束的行为。
- **Charter_Refresh**：定期或有触发地重新审视 charter，更新过时条款，删除不再适用的约束。

## Requirements

### Requirement 1: Charter 文件格式

**User Story:** As a Forge user starting a new project, I want a structured charter file that captures engineering constraints, architecture boundaries, and technology baselines, so that all subsequent specs and decisions are grounded in a shared understanding.

#### 验收标准

1. THE charter 文件 SHALL 位于 `.tinkerman/charter.md`，使用 YAML frontmatter + markdown body 格式。
2. THE frontmatter SHALL 包含以下字段：
   - `name`：项目名称
   - `created`：创建日期（ISO 8601）
   - `updated`：最后更新日期（ISO 8601）
   - `version`：语义化版本号（从 `1.0.0` 开始）
   - `status`：`draft` | `active` | `deprecated`
3. THE markdown body SHALL 包含以下**必选**章节（每个章节必须存在，内容可为空但标题不可省略）：
   - `## 核心问题`：本项目要解决的工程问题（1–3 句话）
   - `## 架构边界`：系统的模块划分和模块间通信契约
   - `## 技术选型基线`：语言、框架、数据库、CI/CD 等核心选型
   - `## 不可变量（Invariants）`：不可违反的工程约束（每条带唯一 ID，如 `INV-001`）
   - `## 变更日志`：charter 自身的变更历史
4. THE markdown body MAY 包含以下**可选**章节：
   - `## 约定与偏好`：命名规范、代码风格、测试策略等
   - `## 已知的未来变化`：预期会改变但尚未决定的事项
   - `## 排除范围`：明确不属于本项目的事项
5. EACH invariant（`INV-NNN`）SHALL 包含：
   - 标题（一行描述）
   - 理由（为什么这条是不可变量）
   - 违反后果（如果违反会发生什么）
6. THE charter 文件总长度 SHALL 不超过 150 行（含 frontmatter），以保证作为 grounding 被读取时不会过度占用 context。

### Requirement 2: `/forge charter` 命令

**User Story:** As a Forge user, I want a dedicated command to create and maintain the project charter, so that I don't have to manually create and format the file.

#### 验收标准

1. THE `/forge charter` 命令 SHALL 支持以下子命令：
   - `/forge charter init`：交互式创建 `.tinkerman/charter.md`
   - `/forge charter update`：交互式更新现有 charter（逐章节审视）
   - `/forge charter check`：非交互式校验 charter 与当前代码库的一致性
   - `/forge charter show`：显示当前 charter 内容
2. WHEN `/forge charter init` 执行，THE 系统 SHALL：
   - 扫描项目结构（`package.json` / `tsconfig.json` / `Cargo.toml` 等）推断技术选型
   - 扫描 `.tinkerman/decisions/` 中的现有 ADR 提取已做出的架构决策
   - 扫描 `.tinkerman/specs/` 中的现有 spec 提取已有的约束
   - 通过 `AskUserQuestion` 逐章节确认或补充内容（每次一个问题）
   - 生成 `.tinkerman/charter.md` 文件
3. WHEN `/forge charter update` 执行，THE 系统 SHALL：
   - 读取当前 charter
   - 识别与当前代码库状态不一致的条款（如 charter 说用 PostgreSQL 但 `schema.prisma` 显示 SQLite）
   - 对每个不一致条款询问用户：保留 / 更新 / 标记为过时
   - 保留未变更的章节不动
   - 更新 `version`（minor bump）和 `updated` 日期
4. WHEN `/forge charter check` 执行，THE 系统 SHALL：
   - 读取 charter 中的所有 invariants
   - 对每个 invariant 检查代码库是否违反（通过 grep / glob / AST 分析）
   - 输出合规报告：`✅ INV-001: TypeScript strict mode` 或 `❌ INV-003: No direct DB access — found 2 violations in src/services/`
   - 以 exit code 0（全部合规）或 1（存在违规）退出
5. IF `.tinkerman/charter.md` 不存在，THE `/forge charter check` SHALL 输出提示信息并 exit 0（不阻断）。

### Requirement 3: Grounding Read（下游自动读取）

**User Story:** As a developer running `/forge decide` or `/forge spec`, I want these commands to automatically read the charter and use it as context, so that my decisions and specs stay consistent with established constraints.

#### 验收标准

1. WHEN `/forge decide` 执行且 `.tinkerman/charter.md` 存在且 `status: active`，THE decide agent SHALL 在分析前读取 charter，并将 invariants 和 boundaries 作为约束条件注入到每个 reviewer 的上下文中。
2. WHEN `/forge spec` 执行且 charter 存在，THE spec agent SHALL 在需求文档中增加一个"Charter 合规性检查"章节，声明每个需求与 charter invariants 的对应关系（如 `R1 → INV-002, INV-005`）。
3. WHEN `/forge plan` 执行且 charter 存在，THE plan agent SHALL 在 plan 的 self-check 阶段增加一项：验证 plan 中的文件变更不违反 charter boundaries。
4. WHEN 任何下游 skill 检测到 charter drift（新决策与 invariant 矛盾），THE skill SHALL **显式标注冲突**并询问用户：
   - (A) 修改 charter（更新 invariant）
   - (B) 修改决策（符合 charter）
   - (C) 标记为例外（记录理由，但不修改 charter）
5. IF `.tinkerman/charter.md` 不存在或 `status: draft`，THE 下游 skill SHALL 正常执行，不阻断，但在输出开头标注 `ℹ No active charter — decisions not grounded`。

### Requirement 4: Charter 违规检测（Review 集成）

**User Story:** As a developer running `/forge review`, I want the spec-check layer to detect when implementation violates charter invariants, so that drift is caught before ship.

#### 验收标准

1. THE `spec-check` agent SHALL 在 charter 存在时增加一个"Charter Compliance"检查维度。
2. WHEN implementation code violates a charter invariant（如 charter 声明"所有 API 必须 versioned"但新 API 没有 version prefix），THE spec-check SHALL 报告为 P1 finding，标注违反的 invariant ID（如 `[P1] Violates INV-003: API versioning`）。
3. THE charter compliance finding SHALL 在报告中归入 spec-check 层，severity 不可低于 P1（因为 invariant 是项目级不可变量）。
4. IF charter 不存在，THE spec-check SHALL 跳过 charter compliance 检查，不产出空 finding。

### Requirement 5: Charter 生命周期管理

**User Story:** As a project evolves, I want the charter to evolve with it—updating when constraints change, archiving when no longer relevant—so that it stays a living document rather than a stale artifact.

#### 验收标准

1. THE charter 的 `version` SHALL 遵循语义化版本：
   - **Major**（2.0.0）：删除或修改了 invariant
   - **Minor**（1.1.0）：新增了 invariant、boundary 或 baseline
   - **Patch**（1.0.1）：修正了描述、补充了理由
2. WHEN charter version 发生 major bump，THE `/forge charter update` SHALL 扫描所有 `.tinkerman/specs/` 和 `.tinkerman/decisions/`，标记可能受影响的文档，输出一份影响报告。
3. THE charter 变更日志 SHALL 记录每次变更的：日期、版本、变更摘要、触发原因（手动 / spec 触发 / check 触发）。
4. WHEN charter `status` 变为 `deprecated`，THE 下游 skill SHALL 停止读取 charter，但保留文件作为历史参考。
5. THE `/forge learn` SHALL 在提取知识时检查 charter 相关性——如果新知识涉及 charter 的 boundary 或 invariant，SHALL 在知识文档的 frontmatter 中标注 `charter_refs: [INV-NNN]`。

### Requirement 6: `/forge init` 集成

**User Story:** As a new Forge user running `/forge init` for the first time, I want to be offered the option to create a charter, so that I start with grounding from day one.

#### 验收标准

1. THE `/forge init` 命令 SHALL 在完成环境检查和目录创建后，询问用户是否创建 charter（默认 Yes）。
2. IF 用户选择创建，THE init 流程 SHALL 调用 `/forge charter init` 的精简版（只问 3 个问题：核心问题、主要技术选型、1–3 条 invariants），生成初始 charter。
3. IF 用户选择跳过，THE init 流程 SHALL 正常完成，不阻断。
4. THE 生成的初始 charter 的 `status` SHALL 为 `draft`，直到用户运行 `/forge charter update` 确认后变为 `active`。
