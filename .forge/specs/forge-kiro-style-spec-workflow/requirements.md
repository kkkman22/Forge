---
feature: forge-kiro-style-spec-workflow
status: locked
date: 2026-05-23
workflow_variant: requirements-first
---

# Requirements Document

主题：将 Forge spec 流程改造为 Kiro 风格三文件 + 工作流变体。

## Introduction

Forge 当前 `/forge spec` 产物为单文件 `.forge/specs/<topic>/spec.md`，目录、frontmatter、frozen zone、dossier 索引器、scenario lint、contract 校验等多处对此布局有硬编码。Kiro 把同样的内容拆为 `requirements.md` / `design.md` / `tasks.md` 三个独立文件，配合 Requirements-First / Design-First / Quick Plan 三种工作流变体和 Analyze Requirements 预检步骤，可以做到：（1）每个文件可独立迭代与 Refine；（2）`tasks.md` 作为 spec 阶段任务种子从 `.forge/plans/<topic>.md` 中分离；（3）需求与技术设计在 spec 阶段就分离，给 review 和 build 的输入更结构化。

本特性把 Forge 的 spec 流程升级为 Kiro 风格的三文件 + 三工作流，**保留 Forge 既有铁律（§2.1 TDD / §2.2 Pre-build Gates / §2.7 No Mid-step Confirmation / §3 Review Discipline / §4 Knowledge）**，并向后兼容历史 `spec.md` 单文件布局至少一个发布周期。

## Glossary

- **Kiro 三文件**：`.forge/specs/<topic>/` 目录下的 `requirements.md`、`design.md`、`tasks.md` 三个独立文件。
- **工作流变体**：Requirements-First（需求优先）、Design-First（设计优先）、Quick Plan（一次性问答 → 三件套生成）。变体由 Forge 内部根据路由器 tier 与任务描述信号自动判定，不暴露为用户 CLI flag。
- **Analyze Requirements 预检**：在进入 design 阶段前，对 `requirements.md` 跑一次轻量 spec-check（一致性、歧义、冲突、遗漏），P0 阻断进入 design。
- **EARS 句式**：`当 <条件> 时 系统应当 <行为>`。沿用 Forge 现有"当...则..."场景作为兼容句式。
- **Refine 触发**：用户修改 requirements 或 design 后，下游文件按 diff 局部重生而非整体重写。Refine 由 Forge 自动检测 mtime / status 触发，不暴露为用户 CLI flag。
- **SpecBundle**：三文件聚合视图的运行时数据结构；单文件兼容读取时也产出该结构。
- **`.forge/plans/` 退役**：原 plan 阶段产物 `.forge/plans/<topic>.md` 的职责并入 spec 目录的 `tasks.md`，原目录在过渡期可读不可写，最终随 `enforced` 配置切换而退役。
- **单入口原则**：用户唯一可见命令为 `/forge <任务描述或子命令>`；变体、Refine、迁移等内部决策不暴露为 CLI flag，由 Forge 自动判定，必要时通过自然语言对话覆盖。
- **Wave 并行执行**：tasks.md 中 JSON wave 块定义任务依赖图；`/forge build` 按 wave 串行、wave 内并行的策略调度，并发上限由 AGENTS.md §6 `max_parallel_agents` 控制。
- **Brownfield 信号**：触发"棕地改造"判定的项目特征集合，包括（1）`.git` 历史存在；（2）`.forge/specs/` 已有同 topic 的历史 spec；（3）任务描述含"改造"/"重构"/"修改既有"等关键词。任一信号成立即按 brownfield 处理（Requirement 9）。
- **SpecBundle.kind**：区分 Feature Spec (`"feature"`) 与 Bugfix Spec (`"bugfix"`) 的核心字段。`kind: "feature"` 首文件为 `requirements.md`；`kind: "bugfix"` 首文件为 `bugfix.md`，含 Current/Expected/Unchanged 三段（Requirement 14）。
- **Unchanged → PBT 派生**：Bugfix Spec `bugfix.md` Unchanged 段每条 EARS 自动映射为 `tasks.md` 中标记 `category: regression-test`、`verification: pbt` 的回归任务；与 §2.4 三振重排铁律联动（Requirement 15）。

## Requirements

### Requirement 1: 三文件目录结构

**User Story:** 作为运行 `/forge spec` 的开发者，我希望需求、设计、任务能落到三个独立文件中，以便在某一阶段返工时只重生该文件而不影响已确认的其他阶段。

#### Acceptance Criteria

- 当用户运行 `/forge spec <feature>` 或路由器进入 spec 阶段时，系统应当按 Requirement 2 的自动判定结果在 `.forge/specs/<feature>/` 下产出 `requirements.md`、`design.md`、`tasks.md` 三个文件，单文件 `spec.md` 不再生成。
- 当三文件中任一缺失时，下游 `/forge plan` 应当阻断并提示缺失文件名。
- 当系统生成三文件时，每个文件均应当含有 YAML frontmatter，至少包含 `feature`（与目录名一致）、`status`（draft / locked，三文件状态独立）、`date`、`workflow_variant`（requirements-first / design-first / quick-plan）四字段。
- 当三文件 frontmatter 中的 `feature` 字段与目录名不一致时，系统应当在 spec 阶段自检阶段报告 P0 错误。
- 当 `.forge/specs/<feature>/` 下存在历史 `spec.md` 单文件而无三文件时，系统应当继续按现有逻辑读取 `spec.md`，且 `/forge build` / `/forge review` 等下游链路行为不变。
- 当同一目录下三文件与 `spec.md` 同时存在时，系统应当优先使用三文件，并在终端输出一条 P2 级别的迁移建议日志，不阻断流程。

### Requirement 2: 工作流变体的自动判定

**User Story:** 作为面向单一入口 `/forge <任务描述>` 的用户，我希望 Forge 自动判定使用哪种 spec 生成方式（Requirements-First / Design-First / Quick Plan），不必学习任何 flag 或子选项；我作为开发者也希望能在事后回看这个判定的依据。

**约束**：本特性不得引入任何新的用户可见 CLI flag。变体选择由 `forge-router` 与 `forge-spec` 内部根据上下文自动决定，并将决策与依据写入 `.forge/runs/<run-id>/events.jsonl`。

#### Acceptance Criteria

- 当 `/forge` 路由器分析任务后判定 tier=Light（≤1 文件 ≤20 行）时，系统应当自动采用 Quick Plan：先以单轮形式输出一组澄清问题（范围 / 约束 / 边界 / 非目标），用户回答后一次性生成三文件，不在中途询问"是否继续"。
- 当路由器判定 tier=Full 时，系统应当强制采用 Requirements-First，禁用 Quick Plan，即使任务描述短小或熟练度高。
- 当路由器判定 tier=Standard 且任务描述以行为/用户故事为主（含"用户"/"应当"/"显示"/"返回"等关键词，或匹配既有产品描述模板）时，系统应当采用 Requirements-First。
- 当路由器判定 tier=Standard 且任务描述以技术约束/架构为主（含具名服务、技术栈、性能/合规指标，例如"基于 Lambda"、"用 Postgres"、"<100ms 延迟"）时，系统应当采用 Design-First。
- 当 tier=Standard 而行为信号与架构信号同时显著时，系统应当默认采用 Requirements-First（宁重勿轻原则，与 AGENTS.md §1 路由原则对齐）。
- 当 spec 生成开始时，系统应当把 `{ variant, tier, signals: { behavior_score, architecture_score }, source: "auto" }` 写入 `.forge/runs/<run-id>/events.jsonl`，事件类型 `spec_variant_resolved`。
- 当 Requirements-First 路径中用户在 requirements 阶段拒绝时，系统应当保留 draft 状态，不进入 design 阶段，不静默 idle，不询问"是否继续"。
- 当 Design-First 路径中用户在 design 阶段对架构作出重大调整时，系统应当在生成 requirements 时显式标注"已根据更新后的设计重生"。
- 当 Quick Plan 完成三文件生成后，系统应当输出一条提示告知三文件均处于 draft、可统一审阅，然后按 §2.7 立即自动推进到 `/forge plan`。
- 当用户对 Forge 自动选择的变体有异议时，开发者应当能在 spec lock 之前输入"切换为 design-first / 切换为 requirements-first / 切换为 quick"等自然语言指令；系统据此重新生成。这是聊天层覆盖，不是新的 CLI flag。

### Requirement 3: Analyze Requirements 预检

**User Story:** 作为开发者，我希望在进入 design 之前对需求做一次自动化的逻辑/歧义/遗漏检查，以减少 review 阶段的需求级返工。

#### Acceptance Criteria

- 当 Requirements-First 工作流下 `requirements.md` 被用户锁定时，系统应当在自动推进到 design 之前调用 spec-check 预检子集（一致性 / 歧义 / 冲突 / 遗漏 / EARS 合规）。
- 当预检发现 P0 问题时，系统应当阻断进入 design，并把问题清单写到 `.forge/findings/spec-analyze-<feature>.md`。
- 当预检仅发现 P2/P3 问题时，系统应当输出告警但允许继续。
- 当预检通过时，系统应当按 `forge.md` 自动推进规则立即生成 `design.md`，禁止"是否继续"提示，禁止静默 idle。
- 当预检失败时，系统应当停止自动推进并把问题清单输出到终端与 `.forge/findings/spec-analyze-<feature>.md`，等待开发者修正；下次 spec 调用启动时，spec skill 应当自动重跑预检，无需用户输入额外命令。

### Requirement 4: tasks.md 是任务清单的唯一来源（plans/ 目录退役）

**User Story:** 作为评审者和构建者，我希望同一个 feature 的任务清单只在 `tasks.md` 一处维护，spec 阶段写入种子、plan 阶段就地升级、build 阶段更新状态，不再有 `.forge/plans/<topic>.md` 的并行权威源；既有 plans/ 目录在过渡期可读不可写，最终退役。

**背景**：原方案让 `tasks.md` 仅作为 plan 阶段输入种子、`plans/<topic>.md` 仍为权威源，造成双轨同步与开发者认知开销。Kiro 的 single source of truth 在三文件结构内已自包含，没必要保留并行文件。

#### Acceptance Criteria

- 当 spec 阶段生成 `tasks.md` 时，系统应当把任务列表（含依赖关系草稿）以 draft 状态写入 `.forge/specs/<feature>/tasks.md`，frontmatter `status: draft`。
- 当 `/forge plan` 运行时，系统应当**就地升级** `tasks.md`：补全任务编号、依赖图（JSON wave 块）、估时与状态字段，然后把 `status` 切到 `locked`。`/forge plan` 不再在 `.forge/plans/<feature>.md` 创建新文件。
- 当 `tasks.md` `status` 不为 `locked` 时，系统应当阻断 `/forge build`，提示运行 `/forge plan`，与 §2.2 Pre-build Checks 三道门禁一致。
- 当 `/forge build` 推进任务时，系统应当直接更新 `tasks.md` 中对应任务条目的状态字段（pending / in-progress / completed / blocked），不写入额外文件。
- 当 `/forge build` 启动且 `tasks.md` 含 wave 块时，系统应当按 wave 串行、wave 内并行的方式调度任务执行：同一 wave 内的任务并发上限为 `max_parallel_agents`（默认 6，HTTP 429 时按 AGENTS.md §6 降级阶梯减半），wave N 全部 completed 后才进入 wave N+1；任意一条任务为 blocked 即视为该 wave 未完成。
- 当用户希望仅运行单条任务时，系统应当支持 `/forge build <task-id>` 形式（沿用既有子命令位置参数语义，不引入新 flag），仅运行该任务及其阻塞依赖（依赖图沿用 wave 块解析）。
- 当 `/forge build` 全部任务 completed 时，系统应当允许 `/forge ship` 进入；`tasks.md` 不进入二次锁定，整个 spec 目录在 ship 后由 learn 阶段做归档判断。
- 当读取阶段遇到历史 `.forge/plans/<topic>.md` 文件且 `.forge/specs/<topic>/tasks.md` 不存在时，系统应当作为兼容路径回退到旧文件，并提示开发者在下次 spec 调用时由 Forge 自动迁移（迁移流程见 Requirement 7，无需用户输入命令）。
- 当 `.forge/plans/<topic>.md` 与 `.forge/specs/<topic>/tasks.md` 同时存在时，系统应当以 `tasks.md` 为权威源，把 `plans/<topic>.md` 视为遗留快照，并提示开发者删除遗留文件。
- 当 `.forge/config.md` `spec_three_file_layout: enforced` 时，系统应当对仍存在的 `.forge/plans/<topic>.md` 输出 P1 迁移建议；切到 `legacy` 时仍按旧路径写入 `.forge/plans/<topic>.md` 以便回滚。
- 当迁移工具（见 Requirement 7）执行时，系统应当同时迁移 `.forge/plans/<topic>.md` 到 `.forge/specs/<topic>/tasks.md`，原文件改名为 `plans/<topic>.legacy.md` 备份，新生成的 `tasks.md` frontmatter 标注 `migrated_from: plans/<topic>.md`。

### Requirement 5: Refine 与下游同步（自动检测，无 CLI flag）

**User Story:** 作为开发者，我希望修改某一阶段产物后，下游文件按 diff 局部重生而非整体重写，且这个重生由 Forge 自动检测触发，不需要我记忆 `--refine` 之类的开关。

#### Acceptance Criteria

- 当用户在 requirements 锁定后再次解锁并修改 `requirements.md` 时，系统应当自动把 `design.md` / `tasks.md` 状态从 locked 回退为 draft，并在 spec 阶段提示需要重新锁定。
- 当 spec 阶段下次运行（用户输入新一轮 `/forge` 任务或显式调用 spec）且检测到 `requirements.md` 已锁定但 `design.md` mtime 早于 requirements 上次锁定时间时，系统应当自动按差异重生 design 中受影响的章节，已确认章节保留。
- 当 `design.md` 被修改时，系统应当自动把 `tasks.md` 状态回退为 draft；下次运行时按 design 差异重生 tasks 受影响条目。
- 当差异 snapshot 不可用（首次启用本特性 / `.forge/runs/` 被清理）时，系统应当回退为整体重生并输出告警事件 `refine_fallback_to_full_regen`。

### Requirement 6: 与 Forge 既有产物的互操作

**User Story:** 作为下游链路（review / plan / dossier / living-doc / health），我希望透明地接入新的三文件布局，单文件 spec 仍能正常工作。

#### Acceptance Criteria

- 当三文件中任一文件 status 为 locked 时，系统应当把它纳入 frozen zone（与现有 `spec.md` 同等保护）。
- 当 frozen 文件被尝试修改且未先解锁时，系统应当按既有 frozen zone 报错路径阻断写入。
- 当 dossier 扫描器收集 spec 阶段产物时，系统应当同时识别 `spec.md` 与三文件，并按文件名作为 stage entry 区分。
- 当 dossier 渲染时，系统应当为同一 topic 的三文件聚合到一个 entry 下，避免在 dossier 中重复出现 topic 名。
- 当 `/forge review` 启动时，系统应当把 `requirements.md` 内容作为 spec-check 主要输入，把 `design.md` 内容作为 quality-check 与 security-check 的架构参照。
- 当历史 `spec.md` 单文件被读取时，系统应当按当前章节切片逻辑兼容性地把目的+需求段路由给 spec-check，把设计段（如有）路由给 quality/security-check。

### Requirement 7: 迁移与回滚（自动迁移，无 CLI flag）

**User Story:** 作为持有大量历史 `spec.md` 和 `.forge/plans/<topic>.md` 的开发者，我希望升级后这些遗留产物被 Forge 自动识别并按需迁移，不需要我手动调用 `--migrate`；整个过程可回滚。

#### Acceptance Criteria

- 当 spec 阶段读取 `.forge/specs/<feature>/` 时，若发现单文件 `spec.md` 存在而三文件不存在，系统应当在进入 lock 流程前自动调用迁移逻辑：按章节切分为 `requirements.md` / `design.md` / `tasks.md`，原文件改名为 `spec.legacy.md`，frontmatter 标注 `migrated_from: spec.md`。
- 当迁移过程中解析失败（章节缺失 / yaml 异常）时，系统应当不写入任何新文件、不重命名原 `spec.md`，仅输出失败原因事件 `spec_migration_failed`，并向用户提示该 feature 仍按 legacy 路径处理。
- 当 spec 阶段读取到对应 topic 同时存在 `.forge/plans/<topic>.md` 时，系统应当把它的内容并入新生成的 `tasks.md`（以最新的 plan 文件为准），并把 `plans/<topic>.md` 改名为 `plans/<topic>.legacy.md`。
- 当迁移完成后，系统应当自动跑一次 P0-only Analyze（Requirement 3 子集），失败则回滚（删除新文件、恢复 `spec.legacy.md` → `spec.md`、恢复 `plans/<topic>.legacy.md` → `plans/<topic>.md`）。
- 当 `.forge/config.md` 中 `spec_three_file_layout: legacy` 时，系统应当跳过自动迁移，继续生成单文件 `spec.md` 与 `plans/<topic>.md`，便于回滚。
- 当配置为 `experimental`（默认）时，系统应当对当前正在操作的 feature 执行迁移；其余未触达的历史 feature 保持原样直到被访问。
- 当配置为 `enforced` 时，系统应当在 spec 阶段启动时对仓内全部 `.forge/specs/*/spec.md` 与 `.forge/plans/*.md` 输出 P1 迁移建议清单（每条带建议命令），但不强制批量改写，避免单次 spec 调用产生跨 feature 副作用。

### Requirement 8: 单入口原则与 plans/decisions 目录定位

**User Story:** 作为面向单一入口 `/forge` 的用户，我希望本特性不引入任何新的用户可见 CLI flag；作为开发者，我希望 `.forge/decisions/` 与 `.forge/plans/` 的边界在本特性后是清晰的。

#### Acceptance Criteria

- 当本特性发布时，系统应当不增加任何用户可见的新 CLI flag（含但不限于 `--design-first`、`--quick`、`--migrate`、`--refine`、`--analyze`）。所有变体、迁移、refine、analyze 的触发都是 Forge 内部决策。
- 当用户希望覆盖 Forge 自动选择时，系统应当接受聊天层自然语言指令（例如"切换到 design-first"），由 spec skill 在生成阶段解析并应用，且这种覆盖记录到事件流但不变成持久化 flag。
- 当本特性发布时，系统应当保留 `.forge/decisions/` 目录及其用途不变：它仍是跨 feature 的 ADR 与决策记录所，由 `/forge decide` 写入；spec 内 `design.md` 仅描述当前 feature 的技术设计，不替代 ADR。
- 当某项 spec design 中的决策具有跨 feature 意义（例如新增运行时依赖、变更全局错误处理策略）时，系统应当在 design.md 中明示并提示开发者另行通过 `/forge decide` 沉淀为 ADR 写入 `.forge/decisions/`。
- 当本特性发布时，系统应当把 `.forge/plans/` 标注为 deprecated；新建的 spec 不再向该目录写入；既有目录在过渡期保留可读，迁移路径见 Requirement 7。

### Requirement 9: Brownfield 改造的章节落点与自检

**User Story:** 作为在棕地（已有代码库）上做改造的开发者，我希望三文件结构能完整承载 Forge 现行 spec 的 Current State / Proposed Change / Reversibility / Delta（新增/修改/不变）章节，让 brownfield 自检（quality-standards.md 5 项）继续有效。

**背景**：Forge 现行 `forge-spec` 单文件结构含 8 章节，其中 Current State / Proposed Change / Reversibility / Delta 是 brownfield 关键产物，与 spec-check 的 Brownfield Compat / Two-part Structure / Reversibility / Anti-drift 自检一一对应。三文件下若不显式约束这些章节的归属，brownfield 自检会 silent break。

#### Acceptance Criteria

- 当 spec 涉及 brownfield 改造（项目根存在 `.git` 历史 / `.forge/specs/` 内已有同 topic 的历史 spec / 任务描述含"改造"/"重构"/"修改既有"等关键词）时，系统应当自动判定为 brownfield 并在三文件中保留以下章节：
  - `requirements.md` 末尾 `## Delta` 段，含 `### 新增` / `### 修改` / `### 不变` 三小节，每节至少一项条目。
  - `design.md` 含 `## Current State` 段，包含 file:line 引用；含 `## Proposed Change` 段，明确变更点与不变点；含 `## Reversibility` 段，含回滚清单与挂载点清单。
- 当 brownfield 模式下三文件 lock 时，系统应当对上述章节执行现行 5 项 brownfield 自检（Brownfield Compat、Two-part Structure、Reversibility、Anti-drift、Spec Leak），任一失败 P0 阻断 lock。
- 当 spec 为 greenfield（无上述触发信号）时，系统应当跳过 brownfield 章节强制要求；`design.md` 仍可包含 Current State 等章节作为可选内容，但不阻断 lock。
- 当迁移工具（Requirement 7）处理含 Delta / Current State 的历史 `spec.md` 时，系统应当把 Current State / Proposed Change / Reversibility 段归到 `design.md`，把 Delta 段归到 `requirements.md` 末尾，保持原信息无损迁移。
- 当 brownfield 信号检测有歧义（边界场景）时，系统应当默认按 brownfield 处理（宁重勿轻原则，与 AGENTS.md §1 路由原则对齐），并在事件流写入 `brownfield_mode_inferred`。

### Requirement 10: 外部 spec 导入

**User Story:** 作为从产品经理处接收外部 spec 文档的开发者，我希望能把外部文档转换为 Forge 三文件结构，沿用现行 forge-spec 的 Import Mode 能力。

**背景**：`skills/forge/lib/spec/instructions.md` §1.5 现行支持 `/forge spec <file-path>` 的外部导入；三文件改造后这条通路必须保留。

#### Acceptance Criteria

- 当用户运行 `/forge spec <external-file-path>` 形式（位置参数为已存在的文件路径而非 feature 名）时，系统应当读取该文件，解析需求/场景/设计段，按 Requirement 1 的章节蓝本切分为三文件，frontmatter 标注 `import_source: <path>`。
- 当导入的外部文档以行为为主（含明显的用户故事或验收标准）时，系统应当走 Requirements-First 变体生成三文件。
- 当外部文档以架构/技术约束为主时，系统应当走 Design-First 变体。
- 当外部文档同时缺少行为与架构信号时，系统应当走 Quick Plan 变体，先以单轮澄清补全缺失维度再生成三文件。
- 当外部文档存在 Forge 现行五项 brownfield 信号时，系统应当按 Requirement 9 自动加 brownfield 章节。
- 当导入完成后，系统应当复用现行五项 spec 自检（Testability / Boundary Clarity / Human Readability / Brownfield Compat / Anti-drift）+ Analyze 预检（Requirement 3），任一 P0 失败阻断 lock。

### Requirement 11: Validation Contract 与 Spec Leak 在三文件下的兼容

**User Story:** 作为依赖现行 spec lock 门禁（Validation Contract Gate / Spec Leak Detection）的下游链路（plan / build / review），我希望这两项检测在三文件结构下继续有效，输入位置正确路由。

**背景**：`forge-spec` 现行 §2 Step 3 在 lock 前调用 `scripts/check-spec-contract.sh` 校验每条 Acceptance Criteria 的 `Verify-By` / `Evidence` 字段；§10 调用 `detectSpecLeak` 扫描 banned-patterns。三文件下输入位置变更，必须显式声明。

#### Acceptance Criteria

- 当三文件 lock 触发 Contract Validation Gate 时，系统应当对 `requirements.md` 中所有 `#### Acceptance Criteria` 块下的条目执行 `Verify-By`（白名单：vitest / bash / forge_git / forge_exec / manual）与 `Evidence`（非空、非占位符）校验；任一缺失 P0 阻断 lock。
- 当 spec 含 frontmatter `contract_legacy: true` 时，系统应当跳过 Contract 校验（与现行 §2 Step 3 兼容性策略一致）。
- 当三文件 lock 触发 Spec Leak Detection 时，系统应当对 `requirements.md` 与 `design.md` 全文执行 banned-patterns 扫描；`design.md` 因记录技术架构需要会含类名、函数名等实现细节，对 design 文件的扫描词典应当采用更宽松的白名单（仅检测明显的代码片段泄露而非结构化技术名词）。
- 当扫描发现违例时，系统应当输出 `[spec-leak]` 前缀提示并 P0 阻断 lock，沿用现行违例处理路径。

### Requirement 12: EARS 句式的生成端约束

**User Story:** 作为评审者，我希望 `requirements.md` 中每条 Acceptance Criteria 在生成时就采用 EARS 句式，而不是事后由 Analyze 检查后再返工。

#### Acceptance Criteria

- 当系统生成 `requirements.md` 的 `#### Acceptance Criteria` 段时，每条条目应当为 `当 <条件> 时 系统应当 <行为>` 句式（含历史"当...则..."兼容句式）。
- 当生成器输出不符合 EARS 句式的条目时，系统应当在写入磁盘前自动重写为 EARS；重写次数累计 ≥ 3 次仍失败时，写入并依靠 Analyze 预检（Requirement 3，规则 ANL-01）作为兜底门禁。
- 当 Analyze 预检 ANL-01 检出非 EARS 条目时，系统应当输出问题位置（行号 + 原文）并 P1 阻断进入 design。

### Requirement 13: 默认变体配置（兜底用）

**User Story:** 作为开发者，我希望在 tier=Standard 行为信号与架构信号打平的边界情况下，能在 `.forge/config.md` 设一个项目级默认变体作为兜底。

#### Acceptance Criteria

- 当 `.forge/config.md` 设置 `default_workflow_variant: requirements-first | design-first | quick-plan` 时，系统应当在 `resolveSpecVariant` 计算 behaviorScore 与 architectureScore 比值落在 `[0.67, 1.5]` 区间（信号打平）时使用该值作为兜底返回。
- 当配置缺失时，系统应当在打平区间内默认返回 Requirements-First（与 Requirement 2 一致）。
- 当 tier=Light 或 tier=Full 时，配置不生效（Light 强制 Quick Plan，Full 强制 Requirements-First），与 Requirement 2 的强制规则一致。
- 当事件流写入 `spec_variant_resolved` 时，系统应当在 `source` 字段标注 `auto-tied-fallback` 以区分纯自动判定与配置兜底。

### Requirement 14: Bugfix Spec 升级为三文件（bugfix.md / design.md / tasks.md）

**User Story:** 作为运行 `/forge fix` 修复缺陷的开发者，我希望 Bugfix Spec 与 Feature Spec 共享同一套三文件目录结构、frozen zone、dossier 索引、refine 机制，但保留 Bugfix 特有的 Current / Expected / Unchanged 三段语义；作为评审者，我希望 review subagent 能直接复用同一套 `loadSpecBundle()` 接口处理两种 spec。

**背景**：Forge 现行 `/forge fix` 产物为单文件提议（`.forge/proposals/<topic>.md` 或类似路径，含 Current / Expected / Unchanged 三段）；Kiro Bugfix Specs 用 `bugfix.md` + `design.md` + `tasks.md` 三文件，与 Feature Spec 同形但首文件命名不同。本特性把 Forge `/forge fix` 升级为同一三文件结构，bugfix.md 替代 requirements.md 作为首文件，复用 Feature Spec 的所有基础设施。

#### Acceptance Criteria

- 当用户运行 `/forge fix <bug-description>` 或路由器进入 fix 阶段时，系统应当在 `.forge/specs/<topic>/` 下产出 `bugfix.md`、`design.md`、`tasks.md` 三个文件，与 Feature Spec 共用同一目录与同一 frozen zone 规则。
- 当三文件 frontmatter 中 `kind` 字段为 `"bugfix"` 时，系统应当识别为 Bugfix Spec；缺省或为 `"feature"` 时识别为 Feature Spec；`kind` 字段是 SpecBundle 的核心区分字段。
- 当 Bugfix Spec 的首文件被生成时，系统应当命名为 `bugfix.md`（不是 `requirements.md`），含 `## Current Behavior`、`## Expected Behavior`、`## Unchanged Behavior` 三段固定章节，每段下用 EARS 句式描述。
- 当 `bugfix.md` 三段中任一段为空或仅含占位符（"TODO" / "待补充" / 空行）时，系统应当在 spec 阶段自检阶段报告 P0 错误并阻断 lock。
- 当 `bugfix.md` 中 Current 与 Expected 段下的 EARS 条目逐字相同时，系统应当报告 P0 错误（缺陷未被定义）。
- 当 `bugfix.md` 中 Unchanged 段与 Expected 段在同一 `当 X 时` 条件下输出相反行为时，系统应当报告 P0 错误（防回归边界与正确行为冲突）。
- 当 `design.md` 在 Bugfix Spec 模式下生成时，系统应当包含 `## Root Cause Analysis`、`## Fix Strategy`、`## Test Properties`（PBT 派生策略）三段固定章节，与 Feature Spec 的 design 章节集合互斥共存。
- 当系统识别 spec 类型时，应当先检测 `bugfix.md` 是否存在：存在 → `kind: "bugfix"`；否则 → `kind: "feature"`（默认）；二者目录不并存（同一 topic 下要么是 bugfix 要么是 feature）。
- 当历史 `/forge fix` 单文件提议存在（`.forge/proposals/<topic>.md` 或仓内既有形态）时，系统应当在用户触达对应 topic 时自动迁移为 `.forge/specs/<topic>/bugfix.md` + `design.md` + `tasks.md`，原文件改名为 `<original>.legacy.md` 备份，与 Requirement 7 自动迁移机制对齐。
- 当 dossier / review / living-doc / health 链路读取 SpecBundle 时，系统应当对 `kind: "bugfix"` 与 `kind: "feature"` 用同一接口处理，仅在渲染层与 prompt 模板上区分两种产物形态。
- 当 `/forge fix` 启动时，系统应当跳过 Feature Spec 的工作流变体判定（Requirement 2），直接走 Bugfix 专用单一流程：bugfix.md lock → design.md lock → tasks.md lock → /forge build；不存在 RF / DF / Quick Plan 区分。

### Requirement 15: Bugfix 三文件下的 Unchanged → PBT 派生与 §2.4 联动

**User Story:** 作为依赖 §2.4 三振重排铁律的修复执行者，我希望 `bugfix.md` 中 Unchanged 段的每一条 EARS 自动派生为 `tasks.md` 中的 property-based test（PBT）回归任务；当回归测试连续 3 次失败时，自动触发 §2.4 reroute 进入 `/forge debug`。

**背景**：Kiro Bugfix Specs 的 PBT 联动是核心防回归机制：Unchanged 段的每条不可变行为都映射为可执行的 property test，修复一旦越界立刻被捕获。本特性把这条机制写进 Forge，并与既有 §2.4 三振重排铁律对接。

#### Acceptance Criteria

- 当 `/forge plan` 阶段对 Bugfix Spec 升级 `tasks.md` 时，系统应当为 `bugfix.md` Unchanged 段每一条 EARS 子句生成至少一条标记为 `category: regression-test`、`verification: pbt`（或 `verification: manual` 当条目以 `[manual]` 结尾时）的任务条目，每条的 `source_clause` 字段指向 `bugfix.md#unchanged-<index>`。
- 当 Unchanged 段为空或仅含占位符时，系统应当在 Bugfix Spec lock 阶段就阻断（Requirement 14），从而保证 plan 阶段必能派生至少一条回归任务。
- 当生成的 regression-test 任务依赖修复实现任务时，系统应当为其设置 `depends_on: [<最后一条 fix-implementation 任务编号>]`，确保回归测试在所有修复任务完成后执行。
- 当某条 Unchanged EARS 无法机器化为 PBT（例如纯人工核对的 UX 行为）时，系统应当生成 `verification: manual` 任务，并要求开发者在执行时填写 `verified_by` 与 `verified_at` ISO 时间字段，缺失则视为门禁失败。
- 当 `/forge build` 推进 regression-test 任务时，系统应当按 §2.4 三振重排逻辑统计失败签名（`fail_signature = sha1(test_name + first_line_of_stacktrace)`）；同签名连续 3 次失败 → 立即停止当前修复方向，自动调用 `/forge debug` 并把 `bugfix.md` 路径作为上下文传入。
- 当 §2.4 三振触发时，系统应当在 `.forge/debug/<topic>.md` 写入诊断模板，包含 Unchanged 段全文与失败签名，便于人工或后续 LLM 回路定位。
- 当所有 regression-test 任务为 `completed`（自动或 manual）时，系统应当允许 `/forge ship` 推进；任一未完成 → 阻断 ship，与 §2.2 Pre-build Gates 风格一致。
- 当 review 阶段读取 Bugfix Spec 的三文件时，系统应当把 `bugfix.md` Unchanged 段作为 spec-check 的"防回归边界检查表"输入，让 spec-check Subagent 对照 build diff 判断是否越界；越界即报 P0。
- 当 `bugfix.md` 在 lock 后被修改（用户解锁追加 Unchanged 条目）时，系统应当自动触发 Refine（Requirement 5）：design.md 的 Test Properties 段、tasks.md 的 regression-test 任务集都会按差异重生，已确认部分保留。

## Non-functional Requirements

- **零新依赖**：不得引入新的 npm 包；解析继续使用现有 `frontmatter`、`yaml` 体系。
- **性能**：三文件生成总耗时不应超过当前单文件生成耗时的 1.3 倍。
- **可观测性**：变体选择、Analyze 预检结果、Refine 触发、迁移工具执行均写入 `.forge/runs/<run-id>/events.jsonl`，与既有事件格式一致。
- **本地化**：三文件章节标题统一中文（章节正文）；EARS 关键字（"当 ... 时 系统应当 ..."）使用中文；保留对历史"当...则..."场景的兼容解析。
- **测试覆盖率**：新增解析器、迁移工具、Analyze 预检子集均 ≥ 90%；端到端工作流变体集成测试齐备。
- **零新 CLI flag**：不得引入用户可见的新命令行开关；所有变体决策、迁移、refine、analyze 由 Forge 内部自动判定。

## Out of Scope

- **不替换 review 三层评审**：本特性只重整 spec 阶段产物布局与工作流变体；§3.2 三层评审矩阵保持不变。
- **不动 `.forge/decisions/` 与 ADR 流程**：`/forge decide` 与跨 feature ADR 的位置、模板、生命周期不变；本特性仅明确 design.md 与 ADR 的边界（Requirement 8）。
- **不引入新的用户 CLI flag**：所有变体选择、Refine 触发、迁移、Analyze 重跑均由 Forge 内部决策（Requirement 2、5、7、8），保留单入口原则。
- **不引入跨 spec 复用机制**：每个 spec 的三文件仅在自身范围生效，跨 spec 共享 requirements 或 design 暂不在本特性内。
- **不动 Knowledge Discipline (§4)**：learn 阶段读取 spec 的方式按"读目录下所有 *.md"实现即可，不需要专门改造。
- **不引入新的并发模型**：Wave 并行执行（Requirement 4）复用现有 `max_parallel_agents` 与 §6 HTTP 429 降级阶梯，不新建调度器。
- **不引入架构图导入 / 可视化预览**：Kiro 提供的 Lucidchart 导入、design 预览/编辑切换属 IDE 范畴，CLI 流程不复制；用户可手动在 `design.md` 内嵌入 mermaid 代码块。
