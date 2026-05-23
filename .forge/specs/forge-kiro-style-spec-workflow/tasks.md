---
feature: forge-kiro-style-spec-workflow
status: locked
date: 2026-05-23
workflow_variant: requirements-first
---

# Implementation Plan: forge-kiro-style-spec-workflow

主题：将 Forge spec 流程改造为 Kiro 风格三文件 + 工作流变体。

## Overview

执行总览：T-01 → T-02 → T-03（数据契约与解析器）→ T-04 / T-04b / T-05（生成器与变体路由）→ T-06（Analyze 预检）→ T-07（Refine）→ T-08（迁移）→ T-13 ~ T-17（brownfield / import / contract+leak / EARS / 默认变体）→ T-20 ~ T-23（Bugfix 数据契约 / 解析器 / render / 自检）→ T-09 / T-18 / T-19 / T-24 / T-25（下游兼容、Wave 调度、单任务模式、`/forge fix` 接入、PBT 派生）→ T-10（spec instructions 升级）→ T-11 / T-26（端到端集成测试，含 Bugfix）→ T-12（配置开关与文档）。

T-04 / T-04b / T-05 可并行；T-13 ~ T-17 可并行；T-20 ~ T-23 可并行；T-09 子任务 + T-18 + T-19 + T-24 + T-25 可并行。所有任务遵守 §2.1 TDD：先写测试 → 失败 → 实现 → 通过 → 重构。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["T-01"] },
    { "wave": 2, "tasks": ["T-02"] },
    { "wave": 3, "tasks": ["T-03"] },
    { "wave": 4, "tasks": ["T-04", "T-04b", "T-05"] },
    { "wave": 5, "tasks": ["T-06"] },
    { "wave": 6, "tasks": ["T-07"] },
    { "wave": 7, "tasks": ["T-08"] },
    { "wave": 8, "tasks": ["T-13", "T-14", "T-15", "T-16", "T-17"] },
    { "wave": 9, "tasks": ["T-20", "T-21", "T-22", "T-23"] },
    { "wave": 10, "tasks": ["T-09.1", "T-09.2", "T-09.3", "T-09.4", "T-09.5", "T-09.6", "T-18", "T-19", "T-24", "T-25"] },
    { "wave": 11, "tasks": ["T-10"] },
    { "wave": 12, "tasks": ["T-11", "T-26"] },
    { "wave": 13, "tasks": ["T-12"] }
  ]
}
```

各 wave 内任务可并行执行；wave 间按编号顺序串行。

ASCII 视图（便于阅读）：

```
T-01 ──► T-02 ──► T-03 ──┬─► T-04 ──┐
                         │          │
                         ├─► T-04b ─┤
                         │          │
                         └─► T-05 ──┴─► T-06 ──► T-07 ──► T-08
                                                            │
                                                            ▼
                                T-13 ║ T-14 ║ T-15 ║ T-16 ║ T-17
                                                            │
                                                            ▼
                                       T-20 ║ T-21 ║ T-22 ║ T-23
                                                            │
                                                            ▼
   T-09.1 ║ T-09.2 ║ T-09.3 ║ T-09.4 ║ T-09.5 ║ T-09.6 ║ T-18 ║ T-19 ║ T-24 ║ T-25
                                                            │
                                                            ▼
                                                          T-10
                                                            │
                                                            ▼
                                                  T-11 ║ T-26
                                                            │
                                                            ▼
                                                          T-12
```

水平 ║ 表示该层子任务可并行。

## Tasks

### T-01 数据契约定义

- 在 `src/spec.ts` 新增 `SpecBundle`、`RequirementsDocument`、`DesignDocument`、`TasksSeedDocument`、`SpecFileFrontmatter`、`WorkflowVariant`、`EarsClause` 类型。
- 给现有 `SpecDocument` 增加 `toBundle(): SpecBundle` 适配方法，layout="legacy-single"。
- 通过 `npm run typecheck` 验证。
- 验收：相关测试可 import 上述类型；与既有 `confirmSpec` 兼容。
- 关联需求：Requirement 1。

### T-02 三文件解析器（TDD）

- 写测试：`parseRequirementsMarkdown` 能识别简介、术语、用户故事、EARS 验收、非功能、边界 6 段；非法输入返回结构化错误。
- 写测试：`parseDesignMarkdown` 能识别概览、架构、数据模型、模块边界、错误处理、测试策略、部署与回滚、未决问题。
- 写测试：`parseTasksMarkdown` 能识别任务标题、目标、关联需求、TDD 步骤、验收。
- 实现三个纯函数，不做 I/O。
- 用 fast-check 添加 PBT：随机段落顺序、随机缩进、混入额外章节，仍稳定解析。
- 验收：单元测试覆盖率 ≥ 90%。
- 关联需求：Requirement 1。

### T-03 SpecBundle 装载与序列化

- 写测试：`loadSpecBundle(featureDir)` 在三文件齐备时返回 layout="three-file"；只有 `spec.md` 时返回 layout="legacy-single"；二者共存时返回 three-file 并附 `migrationHint=true`。
- 写测试：`writeSpecBundle(bundle, featureDir)` 按 layout 写回；frontmatter 中 `feature` 与目录名一致校验。
- 实现 `loadSpecBundle` / `writeSpecBundle`。
- 验收：兼容现有所有 `.forge/specs/*/spec.md` fixture；snapshot 测试锁定。
- 关联需求：Requirement 1、Requirement 6。

### T-04 工作流变体自动判定（TDD）

- 写测试：`resolveSpecVariant({ tier: "Light", ... })` → quick-plan；`tier: "Full"` → requirements-first（强制）；`tier: "Standard"` 且 architectureScore > behaviorScore × 1.5 → design-first；其余 → requirements-first。
- 写测试：`scoreTaskDescription(text)` 对包含"用户/应当/显示/返回"的输入返回 behaviorScore > architectureScore；对包含具名服务和性能指标的输入返回 architectureScore > behaviorScore。
- 实现 `resolveSpecVariant`（纯函数）和 `scoreTaskDescription`（关键词扫描，词典内置）。
- 实现三种变体的步骤编排函数 `runRequirementsFirst` / `runDesignFirst` / `runQuickPlan`，仅做控制流，不直接调用 LLM（注入式）。
- 在编排开始时写事件 `spec_variant_resolved`，含 `{ variant, tier, behaviorScore, architectureScore, source }`。
- 验收：单元测试覆盖三 tier × 多任务描述样本（≥ 12 用例）；事件流写入校验。
- 关联需求：Requirement 2、Requirement 8。

### T-04b 聊天层覆盖解析

- 写测试：`parseVariantOverride("切换到 design-first")` → "design-first"；同义词覆盖（"换成 quick"/"用 design first"）。
- 实现 `parseVariantOverride` 与 spec skill 的覆盖路径：检测到覆盖意图时丢弃当前变体输出、用新变体重生、事件流标 `source: "user-override"`。
- 验收：fixture 对话流跑通"自动选 → 用户覆盖 → 重生"。
- 关联需求：Requirement 2、Requirement 8。

### T-05 三文件生成器骨架

- 写测试：generator 在 RequirementsDocument 注入下能产出符合 §spec-format 蓝本的 `requirements.md` markdown。
- 实现 `renderRequirementsMarkdown` / `renderDesignMarkdown` / `renderTasksMarkdown`，输入结构 → 输出 markdown 文本。
- 验收：渲染再解析 round-trip 无信息损失（fast-check round-trip 测试）。
- 关联需求：Requirement 1。

### T-06 Analyze Requirements 预检（TDD）

- 写测试覆盖 ANL-01 到 ANL-05 五条规则，正反例各 ≥ 2。
- 实现 `analyzeRequirements(req: RequirementsDocument): AnalyzeResult`。
- 集成到 Requirements-First 与 Design-First 路径：requirements 锁定前调用；P0 阻断 lock，P1 阻断进入 design，P2/P3 仅告警。
- 集成失败时把问题清单写 `.forge/findings/spec-analyze-<feature>.md`。
- 与 §2.7 自动推进对齐：通过则立即推进，失败则停下等待修复。
- 验收：fixture 中故意制造 P0 / P1 输入 → 分别被预期阻断；P2 仅告警继续。
- 关联需求：Requirement 3。

### T-07 自动 Refine 检测与执行（TDD）

- 写测试：`detectSpecTriggers(featureDir)` 在 `requirements.locked` 且 `design.mtime < requirements.lockedAt` 时返回 `{ refineTarget: "design" }`；同理 design → tasks。
- 写测试：`refineDownstream(bundle, "design")` 在 requirements snapshot diff 仅影响某章节时，design 输出仅该章节被替换，其余原样。
- 写测试：`refineDownstream(bundle, "tasks")` 同理基于 design diff。
- 写测试：snapshot 缺失 → 退化为整体重生，输出 `refine_fallback_to_full_regen` 事件。
- 实现 `detectSpecTriggers` 与 `refineDownstream`。
- 在 `runRequirementsFirst` / `runDesignFirst` 启动时调用 `detectSpecTriggers`，按返回值自动触发 refine（不需要 CLI flag）。
- 在 `runRequirementsFirst` / `runDesignFirst` 中接入"上一次 lock 时打 snapshot 到 `.forge/runs/<spec-run>/snapshot/`"。
- 验收：单元测试覆盖 ≥ 90%；端到端 fixture 改 requirements 后重跑 `/forge` 自动触发 design refine。
- 关联需求：Requirement 5、Requirement 8。

### T-08 自动迁移逻辑（TDD）

- 写测试：`migrateLegacySpec(featureDir)` 检测 `spec.md` 存在且无三文件时执行迁移；按章节切分；frontmatter 写入 `migrated_from: spec.md`；原文件改名为 `spec.legacy.md`。
- 写测试：`migrateLegacySpec` 检测 `plans/<topic>.md` 存在且无 `tasks.md` 时把 plan 内容并入 tasks.md，原文件改名为 `plans/<topic>.legacy.md`。
- 写测试：解析失败时不写新文件、不重命名原文件，只输出 `spec_migration_failed` 事件。
- 写测试：迁移后跑 P0-only Analyze，失败回滚（删除新文件、恢复原文件名）。
- 写测试：单文件 `spec.md` 含 brownfield Delta 段时，迁移后 `requirements.md` 末尾出现 `## Delta`，`design.md` 出现 `## Current State` / `## Proposed Change` / `## Reversibility`。
- 实现 `migrateLegacySpec`。
- 在 `forge-spec` 启动路径接入 `detectSpecTriggers` → 若 `migrationNeeded` 为真则在进入变体编排之前先跑 `migrateLegacySpec`，整个过程对用户透明（无 CLI flag、无确认提示）。
- 验收：在仓内挑 3 个真实 `spec.md`（含 brownfield Delta 的）跑迁移，结果通过 P0 Analyze；单独跑迁移 `plans/<topic>.md` 也成功。
- 关联需求：Requirement 7、Requirement 8、Requirement 9。

### T-13 Brownfield 自动判定与章节落点（TDD）

- 写测试：`detectBrownfieldSignals(featureDir, taskDescription, projectRoot)` 在三类信号（git history / prior spec / 关键词）任一存在时返回 brownfield=true；全部缺失时返回 false。
- 写测试：fast-check PBT 验证信号单调性（Property 8）：在已有信号上叠加新信号不会让 brownfield 由 true 翻 false。
- 写测试：`runBrownfieldSelfChecks(bundle)` 对 Delta 缺失 / Current State 无 file:line / Reversibility 不全的 fixture 返回 P0 失败；齐备 fixture 返回 pass。
- 实现 `detectBrownfieldSignals` 与 `runBrownfieldSelfChecks`。
- 在 `confirmSpecBundle` 中接入：检测到 brownfield → 自动追加 Delta / Current State / Proposed Change / Reversibility 章节模板（生成器侧）；lock 前调用 `runBrownfieldSelfChecks`。
- 在生成器 `renderRequirementsMarkdown` / `renderDesignMarkdown` 中按 brownfield 标志插入对应章节，与 spec-format 蓝本对齐。
- 写事件 `brownfield_mode_inferred` 到 `.forge/runs/<run-id>/events.jsonl`。
- 验收：fixture 跑通 brownfield 自动判定 → 章节齐备 → 自检通过；同 fixture 故意缺章节 → P0 阻断。
- 关联需求：Requirement 9。

### T-14 外部 spec 导入（TDD）

- 写测试：`parseSpecArgs(argv)` 对 `["my-feature"]` 返回 `mode: "feature"`；对 `["./external-spec.md"]`（路径存在）返回 `mode: "import"`；对 `[]` 返回 `mode: "default"`。
- 写测试：`parseExternalSpec(text)` 对 PM 风格 markdown（可能含 user stories / scenarios / design 段）能抽取出主要内容；对纯描述性文档返回信息不全，触发 quick-plan 兜底。
- 写测试：`scoreImportedContent(bundle)` 在行为段为主时返回 RF；架构段为主时返回 DF；都缺时返回 quick-plan。
- 写测试：导入失败时不写入 spec 目录，输出 `spec_import_failed` 事件。
- 实现 `parseSpecArgs`、`parseExternalSpec`、`scoreImportedContent`、`runImportMode`。
- 在 `forge-spec` 启动路径根据 `parseSpecArgs` 结果分支：`mode: "import"` → `runImportMode`；其他走原有流程。
- 验收：fixture 中 PM 风格 markdown 导入后产出三文件含 `import_source` frontmatter 字段；变体选择正确；五项自检 + Analyze 通过。
- 关联需求：Requirement 10。

### T-15 Validation Contract Gate 与 Spec Leak（TDD）

- 写测试：`validateContractGate(bundle)` 对每条 EARS clause 缺失 `verifyBy` / `evidence` 时返回 P0；对 `evidence` 为占位符（"TODO" / "待补充"）时同样 P0；齐备时 pass。
- 写测试：`bundle.frontmatter.contract_legacy === true` 时 Contract Gate 跳过校验。
- 写测试：`detectSpecLeak(bundle, "strict")` 对 requirements.md 含类名 / 函数名 / 库名时命中 P0；`detectSpecLeak(bundle, "lenient")` 对 design.md 含同样内容时不命中（仅命中代码片段 / 函数体）。
- 实现 `validateContractGate` / `detectSpecLeak`（含 `loadBannedPatterns({ scope: "design" })` 派生 lenient 词典）。
- 在 `confirmSpecBundle` 中按顺序调用：Analyze（Req 3）→ Brownfield 自检（Req 9）→ Contract Gate（Req 11）→ Spec Leak（Req 11）。任一 P0 失败 → 阻断 lock。
- 更新 `scripts/check-spec-contract.sh`：读 `requirements.md` 而非 `spec.md`；保留对单文件 `spec.md` 的兼容路径。
- 验收：fixture 中 contract 缺失 / leak 命中分别被预期阻断；现行 spec.md fixture 在 lenient design 词典下不退化。
- 关联需求：Requirement 11。

### T-16 EARS 句式生成端约束（TDD）

- 写测试：`enforceEarsSyntax(clause, retries=3)` 对非 EARS 输入触发重写；正则匹配后立即返回；3 次失败后返回原文 + `EarsRetryFailure` 标记。
- 写测试：fast-check PBT 验证收敛性（Property 9）：每次重试只能减少非 EARS 行数。
- 写测试：兼容句式 `当 X 时 系统应当 Y` 与 `当 X 则 Y` 均通过校验。
- 实现 `enforceEarsSyntax`。
- 在 `renderRequirementsMarkdown` 的 Acceptance Criteria 输出循环中调用；失败累计写事件 `ears_enforcement_exhausted`。
- 验收：fixture 生成器对故意非 EARS 的 LLM 模拟输出能在 3 次内重写为 EARS；累计失败时 ANL-01 兜底报警生效。
- 关联需求：Requirement 12。

### T-17 默认变体配置兜底（TDD）

- 写测试：`resolveSpecVariant({ tier: "Standard", behaviorScore: 1, architectureScore: 1, defaultVariant: "design-first" })` → variant=design-first, source=auto-tied-fallback。
- 写测试：`resolveSpecVariant({ tier: "Standard", ratio: 0.8, defaultVariant: undefined })` → variant=requirements-first, source=auto。
- 写测试：`resolveSpecVariant({ tier: "Light", defaultVariant: "design-first" })` → variant=quick-plan, source=auto（强制规则不被覆盖）。
- 写测试：`resolveSpecVariant` 在配置非法值（"foo"）时返回 RF + 事件 `invalid_default_variant_config`。
- 在 `resolveSpecVariant` 中接入 `defaultVariant` 参数；spec skill 启动时从 `.forge/config.md` 读取 `default_workflow_variant` 字段并传入。
- 验收：单元测试覆盖打平 / 非打平 / Light / Full 边界；事件流字段正确。
- 关联需求：Requirement 13。

### T-20 Bugfix 数据契约扩展（TDD）

- 在 `src/spec.ts` 新增 `SpecKind` 类型与 `BugfixDocument` / `BugfixDesignDocument` 接口。
- 重构 `SpecBundle`：移除 `requirements` 字段，新增 `kind: SpecKind` 与 `primary: RequirementsDocument | BugfixDocument`，`design` 字段类型扩为联合类型。
- 实现类型守卫 `isFeatureBundle` / `isBugfixBundle`，确保 TypeScript 在下游消费方收窄类型。
- 给 `SpecFileFrontmatter` 增加可选字段 `kind?: SpecKind`。
- 通过 `npm run typecheck` 验证；现有所有 `bundle.requirements` 调用点改为 `bundle.kind === "feature" ? bundle.primary : ...`，编译失败列表用作 T-09 / T-24 / T-25 子任务的清单。
- 验收：类型定义通过；既有 Feature Spec 测试在新数据契约下不退化（snapshot 锁定）。
- 关联需求：Requirement 14。

### T-21 Bugfix 三文件解析器与渲染器（TDD）

- 写测试：`parseBugfixMarkdown` 能识别 `## Current Behavior` / `## Expected Behavior` / `## Unchanged Behavior` 三段；缺段或非 EARS 句式返回结构化错误。
- 写测试：`parseBugfixDesignMarkdown` 能识别 `## Root Cause Analysis` / `## Fix Strategy` / `## Test Properties` 三段。
- 写测试：`renderBugfixMarkdown` / `renderBugfixDesignMarkdown` 与 parser 形成 round-trip。
- 用 fast-check 添加 PBT：随机三段顺序、随机条目数量、随机 EARS 输入，仍稳定 round-trip。
- 实现四个纯函数。
- 验收：单元测试覆盖率 ≥ 90%；round-trip PBT 通过 200 次迭代。
- 关联需求：Requirement 14。

### T-22 detectSpecKind 与 loadSpecBundle 兼容（TDD）

- 写测试：`detectSpecKind(featureDir, "fix")` 当 `bugfix.md` 存在 → "bugfix"；当 `requirements.md` 存在 → "feature"；都不存在 → 按 `commandIntent` 兜底（fix → bugfix；其他 → feature）。
- 写测试：`loadSpecBundle(featureDir)` 当 `bugfix.md` 存在时返回 `kind: "bugfix"`，`primary` 字段为 `BugfixDocument`；当 `requirements.md` 存在时返回 `kind: "feature"`，`primary` 字段为 `RequirementsDocument`。
- 写测试：`bugfix.md` 与 `requirements.md` 同时存在时抛错（同一目录不允许两种 kind）。
- 实现 `detectSpecKind` 与 `loadSpecBundle` 的 bugfix 分支。
- 验收：单元测试覆盖三条路径与异常路径；PBT 验证 kind 分支独立性。
- 关联需求：Requirement 14。

### T-23 Bugfix lock 自检（TDD）

- 写测试覆盖 BFX-01 ~ BFX-06 六条规则，正反例各 ≥ 2：
  - BFX-01：三段缺失 P0
  - BFX-02：三段为空 / 占位符 P0
  - BFX-03：Current 与 Expected 逐字相同 P0
  - BFX-04：Unchanged 与 Expected 同条件相反行为 P0
  - BFX-05：非 EARS 句式 P1
  - BFX-06：Unchanged 段全 `[manual]` 或为空 P1
- 写 PBT 测试 Property 10：三段独立扰动下自检结果单调可预测。
- 实现 `runBugfixSelfChecks(bundle)`。
- 集成到 `confirmSpecBundle`：`isBugfixBundle(bundle)` 时调用，置于 Analyze 之前；P0 阻断 lock，P1 阻断进入 design。
- 验收：fixture 中故意制造各类违例 → 分别被预期阻断；齐备 fixture 通过 lock。
- 关联需求：Requirement 14。

### T-09 下游兼容（并行子任务）

每个子任务独立 PR 或 commit。

#### T-09.1 frozen zone

- 在 `src/conflict-classifier.ts` `FROZEN_PATTERNS` 增补三文件正则。
- 在 `test/conflict-classifier.fixtures.test.ts` 追加三文件 frozen 用例与"其他文件 open"用例（每类 ≥ 5 条）。
- 验收：现有 64 个测试 + 新追加用例全绿。
- 关联需求：Requirement 6。

#### T-09.2 dossier 索引

- `deriveTopicFromPath` 增加 `specs/<topic>/{requirements|design|tasks}.md` 反映射；写正反测试。
- `matchStageFiles("specs", topic, files)` 改为返回三文件 + spec.md 任意子集。
- dossier 渲染：同 topic 多文件聚合到一个 entry。
- 验收：`test/feature-dossier.test.ts` 已有用例不退化，新增用例覆盖三文件场景。
- 关联需求：Requirement 6。

#### T-09.3 review Subagent 输入

- 把 review 阶段读取 spec 的入口切到 `loadSpecBundle()`。
- 给 spec-check / quality-check / security-check 的 prompt 模板（参考 ADR-0005 prompt-diff-context）追加"如果 layout=three-file，分别引用 requirements / design / tasks"段。
- 验收：fixture 仓内分别用 single 与 three-file 两种布局跑 `/forge review`，输出引用对应文件。
- 关联需求：Requirement 6。

#### T-09.4 plan 阶段：tasks.md 单源 + plans/ 退役

- 把 `src/plan.ts` 改为：直接读取 `.forge/specs/<topic>/tasks.md`（draft），就地补全任务编号、JSON wave 块、估时、状态字段、DoD，并把 `status` 切到 `locked`。
- `/forge plan` 不再向 `.forge/plans/<topic>.md` 写入；新建 spec 一律走单源路径。
- 当 `tasks.md` 不存在但 `plans/<topic>.md` 存在时，作为兼容回退：以 plans 文件作为只读种子合成 tasks.md，触发 T-08 自动迁移流程把 plans 文件改名为 `.legacy.md`。
- 当二者并存时，`tasks.md` 为权威源，`plans/<topic>.md` 视为遗留快照，输出 P2 提示。
- 写集成测试：spec 阶段写入 5 条 tasks.md 种子 → `/forge plan` 就地升级 → frontmatter status 变为 locked → tasks 含 wave 块；既有 plan 文件 fixture 在 enforced 配置下输出 P1 迁移提示。
- 验收：集成测试通过；既有 plan fixture 在 legacy 配置下行为不变。
- 关联需求：Requirement 4、Requirement 7。

#### T-09.5 living-doc

- `src/living-doc/generator.ts` 切到 `loadSpecBundle()`；渲染层增加 `workflow_variant` 徽章。
- 验收：`generateLivingDoc` 在三文件目录与单文件目录均产出有效页面。
- 关联需求：非功能要求（可观测性）。

#### T-09.6 health check

- `checkSpecHealth` 输入改为 `SpecBundle`；hash 计算为三文件文本拼接后的 sha1（顺序固定 requirements → design → tasks）。
- 写测试：单文件场景 hash 不变（向后兼容）；三文件场景 hash 稳定。
- 验收：health 字段写回 requirements.md frontmatter（layout=three-file）或 spec.md frontmatter（layout=legacy-single）。
- 关联需求：Requirement 1、Requirement 6。

#### T-18 Wave 并行执行（TDD）

- 写测试：`parseWaves(tasks)` 对合法 JSON wave 块返回拓扑排序的 Wave[]；非法 JSON 抛错。
- 写测试：fast-check PBT 覆盖 Property 6 wave 拓扑无环。
- 写测试：`scheduleWave(wave, runner)` 在并发上限 N 下，最多同时运行 N 个任务；HTTP 429 触发降级（6 → 3 → 2 → 1）。
- 写测试：任一任务 status="failed" 时 §2.4 三振计数 +1；同签名 3 次 → reroute。
- 实现 `parseWaves` 与 `scheduleWave`，集成到 `src/build.ts`。
- `tasks.md` 任务推进时直接更新条目 status 字段（pending / in-progress / completed / blocked / failed），不写额外文件。
- 验收：fixture 含 2 wave × 每 wave 3 任务，并发 3 时端到端跑通；并发 1 时退化串行；429 模拟生效。
- 关联需求：Requirement 4。

#### T-19 单任务模式（`/forge build <task-id>`）

- 写测试：`computeDependencyClosure(taskId, tasks)` 返回 taskId 的传递依赖闭包 + taskId 自身，闭包内不含外部任务。
- 写测试：fast-check PBT 覆盖 Property 7（闭包外不含任意非依赖任务）。
- 写测试：未知 task-id 触发阻断，输出可选 task-id 列表。
- 实现 `computeDependencyClosure` 与 `forge-build` 的单任务分支。
- 在 `skills/forge/lib/build/instructions.md` 增"位置参数 task-id 单任务模式"段。
- 验收：fixture 中 `/forge build T-09.4` 仅运行 T-09.4 + 其依赖，不影响其他任务。
- 关联需求：Requirement 4。

#### T-24 `/forge fix` 接入 Bugfix 三文件（TDD）

- 写测试：`runBugfixOrchestration(bundle)` 按 bugfix.md → design.md → tasks.md 三步串联，每步 lock 后按 §2.7 自动推进。
- 写测试：`/forge fix` 入口跳过 `resolveSpecVariant` 与 brownfield 章节，直接走 bugfix 流程；保留 Spec Leak（lenient design 词典）。
- 写测试：`bugfix.md` Refine（用户解锁追加 Unchanged 条目）→ design.md / tasks.md 自动回退为 draft，按差异重生。
- 重写 `skills/forge/lib/fix/instructions.md`：
  1. 调用 `detectSpecKind(featureDir, "fix")` 强制 kind=bugfix；
  2. 调用 `runBugfixOrchestration`；
  3. 跳过 Variant 判定 / Brownfield / Validation Contract Gate（保留 Spec Leak）。
- 在 spec skill 入口处理 `kind=bugfix` 分支（不仅限于 `/forge fix`，路由器路径也走同一处理）。
- 验收：fixture 中 `/forge fix` 端到端跑通；产出 `.forge/specs/<topic>/bugfix.md` + `design.md` + `tasks.md` 三文件；frontmatter `kind: bugfix`。
- 关联需求：Requirement 14。

#### T-25 Unchanged → PBT 派生与 §2.4 联动（TDD）

- 写测试：`derivePbtTasksFromUnchanged(bundle)` 对 fixture bundle（Unchanged 含 5 条，其中 1 条以 `[manual]` 结尾）→ 生成 5 条 regression-test 任务，4 条 verification=pbt，1 条 verification=manual。
- 写测试：每条任务的 `source_clause` 字段唯一指向一条 unchanged 条目（Property 11）。
- 写测试：每条任务 `depends_on` 含最后一条 fix-implementation 任务编号。
- 写测试：fast-check PBT 验证 Property 11 计数与映射对应。
- 在 `src/plan.ts` 接入：`isBugfixBundle(bundle)` 时在 plan 阶段额外调用 `derivePbtTasksFromUnchanged` 追加任务。
- 在 `src/build.ts` 接入 §2.4 三振重排：`category: regression-test` 任务失败时计算 `fail_signature`，同签名累计 3 次 → 调用 `triggerThreeStrikeReroute({ skill: "/forge debug", context: { bugfix_path, unchanged_clauses, fail_signature } })`，写诊断模板到 `.forge/debug/<topic>.md`。
- 写测试：模拟连续 3 次同签名失败 → reroute 触发；第 4 次同方向尝试被禁止。
- `verification: manual` 任务在 build 阶段需开发者填写 `verified_by` / `verified_at`，缺失视为门禁失败（阻断 ship）。
- 验收：fixture 端到端跑通 PBT 派生 + 连续失败 reroute；既有 §2.4 实现复用，无新依赖。
- 关联需求：Requirement 15。

### T-10 spec instructions 与 spec-format 升级

- 把 `skills/forge/lib/spec/instructions.md` §2 Three-step Flow 改为：
  1. `detectSpecTriggers` 检查迁移与 Refine 需求；
  2. `resolveSpecVariant` 自动选择变体；
  3. 按变体走 Requirements-First / Design-First / Quick Plan 编排；
  4. 每个 Lock 后按 §2.7 自动推进。
- **不引入任何新 CLI flag**；保留 `/forge spec` 与 `/forge spec <feature>` 既有用法。补充"聊天层覆盖"段说明用户如何用自然语言切换变体。
- 把 `skills/forge/lib/spec/references/spec-format.md` 从"单文件 8 章节"重写为"三文件章节蓝本 + 兼容章节切片表"。
- 把 `tasks.md` 中描述的 plan 阶段升级行为加入 `skills/forge/lib/plan/instructions.md`：plan 不再产出独立文件，仅就地升级 `tasks.md`。
- 验收：手动跑通 `/forge` 任务路由 → 三种变体；输出符合蓝本，过程中无 flag 出现在用户视野。
- 关联需求：Requirement 2、Requirement 4、Requirement 5、Requirement 7、Requirement 8。

### T-11 端到端集成测试

在 `tests/e2e/` 新增 `spec-kiro-style.spec.ts`：

- 子任务 11.1 自动 Requirements-First：用户输入产品风格任务描述（含"用户应当..."关键词）→ Forge 路由 tier=Standard → `resolveSpecVariant` 输出 requirements-first → requirements lock → analyze pass → design lock → tasks lock（即 plan 阶段）→ 自动推进 build → review → test → ship 全部通过。
- 子任务 11.2 自动 Design-First：用户输入架构风格任务描述（含具名服务和性能指标）→ tier=Standard → `resolveSpecVariant` 输出 design-first → design lock → requirements lock → tasks lock → 后续链路同 11.1。
- 子任务 11.3 自动 Quick Plan：用户输入 Light tier 任务（≤1 文件 ≤20 行）→ 单轮澄清 → 三文件齐 draft → 用户统一锁定 → 自动推进 plan。
- 子任务 11.4 自动 Refine：requirements lock 后修改文件 → 下次 `/forge` 调用自动检测 mtime → 自动 refine design 受影响章节，无 CLI flag。
- 子任务 11.5 自动迁移：fixture 含 legacy `spec.md` 与 `plans/<topic>.md` → 用户输入触及该 topic 的 `/forge` 任务 → spec skill 自动检测并迁移；三文件生成、P0 Analyze 通过、`spec.legacy.md` / `plans/<topic>.legacy.md` 备份存在。
- 子任务 11.6 兼容路径：legacy `spec.md` 在 `spec_three_file_layout: legacy` 配置下流程不变；experimental 下双布局共存优先三文件。
- 子任务 11.7 聊天层覆盖：自动选择 design-first → 用户在聊天中输入"切换到 quick plan" → spec skill 重做生成；事件流 `source: "user-override"`。
- 子任务 11.8 Brownfield 自动判定：fixture 项目已有 `.git` 历史 + 同 topic 历史 spec → spec skill 自动判定为 brownfield → 三文件含 Delta + Current State + Proposed Change + Reversibility → 五项 brownfield 自检通过。
- 子任务 11.9 外部 spec 导入：`/forge spec ./external-pm-spec.md` → 自动选 RF（行为为主）→ 三文件含 `import_source` frontmatter → Analyze + Contract + Leak 自检通过。
- 子任务 11.10 Validation Contract & Spec Leak：fixture 故意制造 EARS 缺 `Verify-By` / `Evidence` → P0 阻断 lock；故意在 requirements 中泄露类名 → strict 词典命中；同名内容在 design 中 → lenient 词典不命中。
- 子任务 11.11 EARS 生成端约束：模拟 LLM 输出非 EARS 句式 → `enforceEarsSyntax` 3 次内重写为 EARS；累计失败时 ANL-01 兜底报警。
- 子任务 11.12 默认变体兜底：tier=Standard 且 ratio=1.0（信号打平）+ `default_workflow_variant: design-first` → 选 DF + source=auto-tied-fallback；改 ratio=2.0 → 选 DF + source=auto（强制规则不被打平兜底覆盖）。
- 子任务 11.13 Wave 并行 build：fixture tasks.md 含 2 wave × 3 任务 / 并发上限 3 → wave 1 三任务并行 → wave 2 三任务并行；模拟一条 429 → 并发降级到 2；fixture 全部完成。
- 子任务 11.14 单任务模式：`/forge build T-09.4` → 仅运行 T-09.4 与其依赖闭包；无关任务保持 pending。
- 验收：14 个子任务全绿；过程全程无 CLI flag；事件流字段齐备。
- 关联需求：所有 Feature Spec 相关需求。

### T-26 Bugfix Spec 端到端集成测试

在 `tests/e2e/` 新增 `spec-bugfix-three-file.spec.ts`：

- 子任务 26.1 `/forge fix` 完备路径：用户输入缺陷描述 → `detectSpecKind` 输出 bugfix → bugfix.md（Current/Expected/Unchanged 三段）lock → BFX-01~06 自检通过 → design.md（Root Cause/Fix Strategy/Test Properties）lock → tasks.md（含 Unchanged → PBT 派生）lock → 自动推进 build → review → test → ship 全部通过。
- 子任务 26.2 BFX 自检阻断：fixture 故意制造 Current=Expected / Unchanged 与 Expected 冲突 / 三段缺失 → 分别被 BFX-03 / BFX-04 / BFX-01 阻断 lock。
- 子任务 26.3 Unchanged → PBT 派生：fixture Unchanged 含 4 条 EARS（其中 1 条 `[manual]`）→ tasks.md 含 4 条 regression-test 任务，3 条 verification=pbt，1 条 verification=manual；source_clause 字段一一对应。
- 子任务 26.4 §2.4 三振触发：模拟 regression-test 连续 3 次同签名失败 → 自动调用 `/forge debug`；写入 `.forge/debug/<topic>.md` 含 Unchanged 全文 + 失败签名；第 4 次同方向尝试被禁止。
- 子任务 26.5 manual 任务签名校验：fixture 含 `verification: manual` 任务 → build 完成时未填 `verified_by` / `verified_at` → 阻断 ship；填好后通过。
- 子任务 26.6 Bugfix Refine：bugfix.md lock 后追加 Unchanged 条目 → design.md / tasks.md 自动回退为 draft → refine 后 design Test Properties 段补充新条目 / tasks.md 追加新 PBT 任务，已确认条目保留。
- 子任务 26.7 historical proposal 自动迁移：fixture 含 `.forge/proposals/<topic>.md`（或确认后的真实路径）→ 用户运行 `/forge fix <topic>` → 自动迁移为 bugfix 三文件，原文件改名 `.legacy.md`。
- 子任务 26.8 与 Feature Spec 隔离：同一仓内 Feature Spec 与 Bugfix Spec 共存 → 各自的 lock / review / health / dossier 路径互不干扰；`isBugfixBundle` / `isFeatureBundle` 类型守卫在所有下游模块工作正确。
- 验收：8 个子任务全绿；过程全程无 CLI flag；§2.4 三振铁律得以执行。
- 关联需求：Requirement 14、Requirement 15。

### T-12 配置开关与文档

- 在 `.forge/config.md` 添加：
  - `spec_three_file_layout: experimental`（默认值）
  - `default_workflow_variant: requirements-first`（仅作为 tier=Standard 行为/架构信号打平时的兜底，不暴露为用户开关）
  - `behavior_keywords` / `architecture_keywords`：内置词典，提供给 `scoreTaskDescription`，可在 v2 开放配置。
  - 说明文字描述 legacy / experimental / enforced 三个值的含义与切换建议。
- 更新 `.claude/commands/forge.md` 的 spec 子命令说明：明确**不引入新 flag**；列出"聊天层覆盖"用法。
- 更新 `AGENTS.md`：
  - §1 路由表脚注：Standard tier 内部按行为/架构信号自动选 RF 或 DF；Light → Quick Plan；Full → RF 强制。
  - §3.2 三层评审脚注（如有需要）：标注 spec 阶段产物升级到三文件且 plan 阶段产物为 tasks.md。
- 在 `.forge/decisions/` 写一条 ADR `2026-05-23-spec-three-file-layout.md`，记录：
  - 为何选择三文件而非保持单文件；
  - Quick Plan 与 §2.7 的兼容论证；
  - Analyze Requirements 与 §3.1 执行-评审分离的边界；
  - **单入口原则下的零 CLI flag 设计与聊天层覆盖机制**；
  - **`tasks.md` 单源 + `.forge/plans/` 退役**的论证、过渡期、回滚条件；
  - `.forge/decisions/` 与 spec 内 design.md 的边界；
  - **Brownfield 自动判定与五项自检在三文件下的章节落点**（Requirement 9）；
  - **外部 spec 导入复用现行 Import Mode 能力**（Requirement 10）；
  - **Validation Contract Gate 与 Spec Leak 在三文件下的输入路由**（lenient design 词典派生方案，Requirement 11）；
  - **EARS 句式生成端约束 + ANL-01 兜底**（Requirement 12）；
  - **Wave 并行执行复用 max_parallel_agents + 单任务模式位置参数**（Requirement 4）；
  - **default_workflow_variant 兜底配置仅在信号打平区间生效**（Requirement 13）；
  - **Bugfix Spec 升级为三文件（bugfix.md / design.md / tasks.md），首文件命名保留 bugfix.md 而非 requirements.md，与 Feature Spec 共享所有基础设施仅在 kind 字段分叉**（Requirement 14）；
  - **Unchanged → PBT 派生 + §2.4 三振重排联动**（Requirement 15）。
- 验收：开关切到 enforced 时对单文件 spec / 残留 plans 文件输出 P1 迁移建议；切回 legacy 时三文件不再生成、plans 文件仍按旧路径写入。
- 关联需求：Requirement 4、Requirement 7、Requirement 8、Requirement 9、Requirement 10、Requirement 11、Requirement 12、Requirement 13、Requirement 14、Requirement 15、非功能要求。

## Notes

- 所有任务按 §2.1 TDD 推进；先写测试再实现，测试先红后绿。
- T-09 内的子任务彼此独立，可由不同开发者并行实施；合并顺序不敏感。
- 灰度顺序：Phase 0（数据契约 + 解析器，layout=legacy）→ Phase 1（默认 experimental）→ Phase 2（默认 enforced）。
- 任意阶段失败可通过 `.forge/config.md` 把 `spec_three_file_layout` 切回 `legacy` 完成快速回滚。

## Definition of Done

- 所有任务勾选完成。
- `npm run lint && npm run typecheck && npm run test` 全绿，覆盖率不退化。
- `npm run build` 产物落到 `dist/`。
- 真实仓内挑选 3 个 spec 在用户触达对应 topic 时自动迁移，成功率 100%（迁移逻辑在 spec skill 启动路径透明触发，无 CLI flag）。
- 三种 Feature 变体在 fixture 仓内跑通完整 `decide → spec → plan → build → review → test → ship → learn`，无人工干预。
- Bugfix Spec 在 fixture 仓内跑通完整 `/forge fix → spec → plan → build → review → test → ship` 链路，含 §2.4 三振触发模拟与 manual 任务签名校验，无人工干预。
- ADR 落档；`.forge/config.md` 新开关默认值为 `experimental`。
- 既有所有现有 spec 在 experimental 默认值下仍能被 review / plan / build / dossier / living-doc / health 正常处理；`/forge fix` 历史单文件提议在 enforced 配置下输出 P1 迁移建议。
