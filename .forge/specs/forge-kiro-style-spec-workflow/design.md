---
feature: forge-kiro-style-spec-workflow
status: locked
date: 2026-05-23
workflow_variant: requirements-first
---

# Design Document

主题：将 Forge spec 流程改造为 Kiro 风格三文件 + 工作流变体（保持单入口原则）。

## Overview

本设计在 Forge 既有命令链 `decide → spec → plan → build → review → test → ship → learn` 内**只动 spec 阶段与 plan 阶段产物**，外加配套的下游兼容点（frozen zone、dossier、review、living doc、health check）。整体改动侵入面小、可灰度、可回滚：通过 `.forge/config.md` 的 `spec_three_file_layout: legacy | experimental | enforced` 开关控制行为，experimental 为新默认值。

设计目标：

1. 把 `spec.md` 拆为 `requirements.md` / `design.md` / `tasks.md`，每个文件可独立 lock / refine。
2. 引入 Requirements-First / Design-First / Quick Plan 三种工作流变体，**由 Forge 内部根据 router tier 与任务描述信号自动判定**，不暴露任何用户 CLI flag。
3. 在 Requirements-First 与 Design-First 中加入 Analyze Requirements 预检，把 review 阶段的需求级返工前置。
4. 让 `tasks.md` 成为任务清单的唯一来源：spec 阶段写种子、`/forge plan` 在同一文件内升级状态、`/forge build` 直接更新；`.forge/plans/<topic>.md` 进入退役期，过渡可读不可写。
5. `.forge/decisions/` 不动，跨 feature ADR 的位置和生命周期保持原状；spec 内 `design.md` 与 ADR 边界由 design.md 明示。
6. 不破坏 §2.1 / §2.2 / §2.7 / §3 / §4 任何铁律；不引入新依赖；保留至少一个发布周期的单文件兼容。

## Architecture

### 单入口原则与变体自动判定

用户与 Forge 的唯一交互点保持为 `/forge <任务描述>`。任务进入 `forge-router` 后：

```
                      /forge <任务描述>
                              │
                              ▼
                       forge-router 分析
                  ┌──────────┴──────────┐
                  │  tier ∈ { Light,    │
                  │           Standard, │
                  │           Full }    │
                  └──────────┬──────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │ resolveSpecVariant(          │
              │   tier, behaviorScore,       │
              │   architectureScore)         │
              └──────────────┬───────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  Quick Plan         Requirements-First       Design-First
  (Light)            (Standard 行为侧 / Full)  (Standard 架构侧)
        │                    │                    │
        └────────────────────┴────────────────────┘
                             ▼
                      自动写事件
                spec_variant_resolved
                             │
                             ▼
                    生成三文件 → 自动推进
```

`resolveSpecVariant` 是纯函数。判定信号：

| 维度 | 来源 | 含义 |
|---|---|---|
| `tier` | router 既有判定 | Light / Standard / Full |
| `behaviorScore` | 任务描述关键词扫描 | "用户"/"应当"/"显示"/"返回"等行为词命中权重 |
| `architectureScore` | 任务描述关键词扫描 | 具名服务名、技术栈名词、性能指标命中权重 |

判定矩阵：

```
tier == Light                                                  → quick-plan
tier == Full                                                    → requirements-first（强制）
tier == Standard && architectureScore > behaviorScore × 1.5     → design-first
tier == Standard && otherwise                                   → requirements-first
```

每次判定都写事件 `spec_variant_resolved` 到 `.forge/runs/<run-id>/events.jsonl`，含 `{ variant, tier, behaviorScore, architectureScore, source: "auto" | "user-override" }` 字段，便于事后回看。

用户在 spec lock 之前可在聊天中说"切换到 design-first"等指令，spec skill 解析后重做生成，事件记录 `source: "user-override"`。这不是新的 CLI flag，是聊天层覆盖。

### 命令编排（每变体内部步骤）

```
   Requirements-First         Design-First                Quick Plan
            │                        │                         │
            ▼                        ▼                         ▼
     requirements.md         design.md                 单轮澄清（一次性问答）
     (Analyze 预检)          (lock)                          │
     (lock)                         │                          ▼
            │                        ▼                  requirements.md / design.md / tasks.md
            ▼                requirements.md           (三件套同时 draft → 用户统一锁定)
     design.md               (Analyze 子集 ANL-01/04)
     (lock)                  (lock)
            │                        │
            ▼                        ▼
     tasks.md                tasks.md
     (lock = plan 阶段)      (lock = plan 阶段)
            │                        │
            └────────────┬───────────┘
                         │
                         ▼
                 §2.7 自动推进 → /forge build
```

每个 Lock 之后按 §2.7 自动推进到下一步，禁止"是否继续"提示，禁止静默 idle。

### tasks.md 单源与 plans/ 退役

`tasks.md` 在 spec 阶段 draft 化、`/forge plan` 阶段 lock 化，是同一文件的两个生命周期阶段，不再有并行的 `.forge/plans/<topic>.md`：

```
spec 阶段 (variant 路径)         /forge plan                /forge build / ship
        │                            │                            │
        ▼                            ▼                            ▼
   tasks.md                      tasks.md                      tasks.md
   status: draft                 status: locked                每条任务 status 字段
   - 列出任务标题、依赖草稿     + 任务编号                    pending → in-progress
                                + JSON wave 块                → completed
                                + 估时                        ship 时全部 completed
                                + DoD
```

`/forge plan` 不再向 `.forge/plans/<topic>.md` 写入。读取路径：

| 状态 | 行为 |
|---|---|
| 仅 `.forge/specs/<topic>/tasks.md` 存在 | 直接读，权威源 |
| 仅 `.forge/plans/<topic>.md` 存在 | 兼容回退，输出 P1 迁移建议 |
| 两者并存 | `tasks.md` 为权威源，`plans/<topic>.md` 视为遗留快照，提示删除 |

`.forge/decisions/` 不在本特性范围；保持现状。design.md 中如有跨 feature 决策（新依赖、全局错误处理变更等），由 design.md 显式标注并提示开发者另行通过 `/forge decide` 写入 ADR。

### Wave 并行执行（Requirement 4）

`/forge build` 读取 `tasks.md` 中的 JSON wave 块作为依赖图，按 wave 串行、wave 内并行调度：

```
parseWaves(tasks.md)               // [{ wave: 1, tasks: [...] }, ...]
        │
        ▼
for each wave in waves:
  schedule wave.tasks → forge-build sub-agents
       │  并发上限 = config.max_parallel_agents (默认 6)
       │  HTTP 429 → 按 AGENTS.md §6 降级（6 → 3 → 2 → 1）
       │
       ▼
  await all tasks in wave
       │
       ├─ 任一任务 status="blocked"  → 整体停止，等待人工干预
       ├─ 任一任务 status="failed"   → §2.4 三振计数 + 1
       └─ 全部 status="completed"    → 进入下一 wave
```

并发模型复用现有 `max_parallel_agents`；本特性不新建调度器。`/forge build <task-id>` 单任务模式：从 wave 块向上遍历依赖闭包，仅运行该闭包内的任务，依赖图解析复用同一份 `parseWaves` 输出。

### Brownfield 自动判定与章节落点（Requirement 9）

Brownfield 信号检测在 spec 启动时与变体判定并行执行：

```
detectBrownfieldSignals(featureDir, taskDescription, projectRoot):
  signals = []
  if (exists projectRoot/.git/refs/heads)            signals.push("git-history")
  if (existsAny .forge/specs/<topic>/spec.legacy.md
              || .forge/specs/<topic>/spec.md
              || .forge/specs/<topic>/requirements.md存在历史lock)
                                                      signals.push("prior-spec")
  if (taskDescription matches /改造|重构|修改既有|fix|update existing/i)
                                                      signals.push("keyword")
  return { brownfield: signals.length > 0, signals }
```

判定为 brownfield 时，三文件章节扩展如下：

| 文件 | greenfield 章节 | brownfield 追加章节 |
|---|---|---|
| `requirements.md` | Introduction / Glossary / Requirements / Non-functional / Out of Scope | `## Delta`（含 `### 新增` / `### 修改` / `### 不变` 三小节） |
| `design.md` | Overview / Architecture / Components and Interfaces / Data Models / Correctness Properties / Error Handling / Testing Strategy / Rollout / Open Questions | `## Current State`（file:line 引用）/ `## Proposed Change`（变更点 + 不变点）/ `## Reversibility`（回滚清单 + 挂载点） |
| `tasks.md` | （无差异） | （无差异） |

Brownfield 自检（5 项）在三文件 lock 时执行，对应规则：

| 自检项 | 应用文件 | 失败级别 |
|---|---|---|
| Brownfield Compat（Delta 三小节齐备且非空） | requirements.md | P0 |
| Two-part Structure（Current State 含 file:line；Proposed Change 含变更/不变） | design.md | P0 |
| Reversibility（回滚清单 + 挂载点齐备） | design.md | P0 |
| Anti-drift（主目标 + 非目标信号 + 验证材料角色） | requirements.md + design.md | P1 |
| Spec Leak（详见 Requirement 11） | requirements.md + design.md | P0 |

边界场景（信号歧义）按 brownfield 处理（宁重勿轻），事件 `brownfield_mode_inferred` 写入 `.forge/runs/<run-id>/events.jsonl`。

### 外部 spec 导入（Requirement 10）

Spec skill 在启动时识别位置参数是否为已存在的文件路径：

```
parseSpecArgs(argv) returns:
  - { mode: "feature", feature }     when argv[0] is a feature name (not a path)
  - { mode: "import", path }         when argv[0] is an existing file path
  - { mode: "default" }              when argv is empty (router 路径)
```

import 模式流程：

```
runImportMode(externalPath):
  text = read(externalPath)
  bundle = parseExternalSpec(text)   // 解析需求 / 场景 / 设计段
  variant = scoreImportedContent(bundle)
            // 行为为主 → RF；架构为主 → DF；都缺 → quick-plan 走澄清
  brownfield = detectBrownfieldSignals(...)
  bundle.frontmatter.import_source = externalPath
  bundle.frontmatter.workflow_variant = variant
  bundle.frontmatter.brownfield = brownfield.brownfield
  apply(五项自检 + Analyze 预检)     // 复用 Requirement 3 / 9 / 11 / 12
  writeSpecBundle(bundle, .forge/specs/<feature>/)
```

无 CLI flag；`/forge spec <path>` 用位置参数语义即可。

### Validation Contract Gate 与 Spec Leak（Requirement 11）

两项 lock 前检测在三文件下的输入路由：

```
validateContractGate(bundle):
  if (bundle.frontmatter.contract_legacy === true) return { skip: true }
  for each clause in bundle.requirements.earsCriteria:
    require clause.verifyBy ∈ { vitest, bash, forge_git, forge_exec, manual }
    require clause.evidence !== "" && clause.evidence !== "TODO" && ...
    on failure → P0 阻断 lock，输出缺失字段定位

detectSpecLeak(bundle):
  banned = loadBannedPatterns()
  // requirements 全量扫描
  scan(bundle.requirements.fullText, banned.strict)
  // design 用宽松词典（允许结构化技术名词，仅查代码片段）
  scan(bundle.design.fullText,        banned.lenient)
  on hit → P0 阻断 lock，输出 [spec-leak] <position> 提示
```

`banned.lenient` 词典在词典加载时由 `loadBannedPatterns({ scope: "design" })` 派生：剔除"类名"/"函数名"维度的词条，保留"完整代码片段"/"具体函数体"等强信号。

### EARS 句式生成端约束（Requirement 12）

`renderRequirementsMarkdown` 生成 Acceptance Criteria 时强制 EARS：

```
function emitEarsClause(condition, behavior):
  return `当 ${condition} 时 系统应当 ${behavior}`

// 生成器内部循环
let attempt = 0
while (attempt < 3):
  output = llmGenerateClause(input)
  if (matchesEarsRegex(output) || matchesLegacyZeroDelimiter(output)):
    break
  attempt++
  prompt += "请改写为 EARS 句式"
// 累计 3 次仍失败 → 写盘，由 ANL-01 兜底报警
```

兼容句式：`当 X 时 Y` 与 `当 X 则 Y`（Forge 历史"当...则..."）。

### 默认变体配置兜底（Requirement 13）

`resolveSpecVariant` 的边界判定改写：

```
function resolveSpecVariant({ tier, behaviorScore, architectureScore, defaultVariant }):
  if (tier === "Light") return { variant: "quick-plan", source: "auto" }
  if (tier === "Full")  return { variant: "requirements-first", source: "auto" }

  ratio = architectureScore / max(behaviorScore, 1)
  if (ratio > 1.5)         return { variant: "design-first", source: "auto" }
  if (ratio < 0.67)        return { variant: "requirements-first", source: "auto" }

  // 信号打平区间 [0.67, 1.5]
  return {
    variant: defaultVariant ?? "requirements-first",
    source: defaultVariant ? "auto-tied-fallback" : "auto"
  }
```

`defaultVariant` 来源于 `.forge/config.md` 的 `default_workflow_variant` 字段；缺省时按 Requirement 2 兜底为 Requirements-First。事件流 `source` 字段新增 `auto-tied-fallback`。

### Bugfix Spec 三文件结构（Requirement 14, 15）

Bugfix Spec 与 Feature Spec 共用同一目录布局、frozen zone、dossier、refine、migrate 基础设施，仅在以下三处分叉：

1. **首文件命名**：`bugfix.md` 而非 `requirements.md`。
2. **首文件章节蓝本**：固定三段 Current Behavior / Expected Behavior / Unchanged Behavior，所有条目均为 EARS 句式。
3. **design.md 章节蓝本**：固定三段 Root Cause Analysis / Fix Strategy / Test Properties，与 Feature Spec 的 Architecture / Components / Data Models 等章节集合互斥共存。

`SpecBundle.kind` 字段是核心区分点。`kind: "feature"` 与 `kind: "bugfix"` 走不同的 lock 检查和不同的 plan 阶段任务派生规则；二者共享同一份解析器、frontmatter、frozen 规则、refine 流水线。

#### Bugfix Spec 启动路径

```
/forge fix <bug-description>     或     router 路由入 bugfix
       │
       ▼
detectSpecKind(featureDir):
  if (exists bugfix.md)       return "bugfix"
  if (exists requirements.md) return "feature"
  // 全新 topic：根据用户命令 / 路由器信号决定
  return commandIntent === "fix" ? "bugfix" : "feature"
       │
       ├─ kind = "feature" → 走 Requirement 2 变体判定
       └─ kind = "bugfix"  → 跳过变体判定，进入 Bugfix 单一流程
                              │
                              ▼
                     生成 bugfix.md（Current/Expected/Unchanged）
                              │
                              ▼ lock + 自检（见下）
                     生成 design.md（Root Cause/Fix Strategy/Test Properties）
                              │
                              ▼ lock
                     生成 tasks.md（含 Unchanged → PBT 派生）
                              │
                              ▼ lock = /forge plan 阶段
                     §2.7 自动推进 → /forge build
```

#### Bugfix Spec lock 自检

`bugfix.md` lock 前调用 `runBugfixSelfChecks(bundle)` 跑以下规则（与 Feature Spec 的 Analyze 子集互斥共存）：

| 规则 | 等级 | 检查内容 |
|---|---|---|
| BFX-01 | P0 | Current / Expected / Unchanged 三段必须全部存在 |
| BFX-02 | P0 | 三段中任一段不得为空或仅含占位符 |
| BFX-03 | P0 | Current 与 Expected 段下任一条 EARS 不得逐字相同（缺陷未定义） |
| BFX-04 | P0 | Unchanged 与 Expected 段不得在同一 `当 X 时` 条件下输出相反行为 |
| BFX-05 | P1 | 每条条目必须匹配 EARS 正则 `^- 当 .+ 时 系统(应当)? .+$` 或兼容句式 |
| BFX-06 | P1 | Unchanged 段至少含 1 条非 `[manual]` 标注的条目（保证至少 1 条 PBT） |

P0 阻断 lock，P1 阻断进入 design，P2/P3 仅告警，与 Analyze 处理风格一致。

#### Unchanged → PBT 派生

`/forge plan` 在 Bugfix Spec 模式下额外执行 `derivePbtTasksFromUnchanged(bundle)`：

```
function derivePbtTasksFromUnchanged(bundle):
  for each (clause, idx) in bundle.bugfix.unchanged:
    if (clause.raw.endsWith("[manual]")):
      verification = "manual"
    else:
      verification = "pbt"

    emit task {
      id: nextRegressionTaskId(),
      title: "回归测试：" + clause.raw,
      category: "regression-test",
      verification,
      source_clause: `bugfix.md#unchanged-${idx}`,
      depends_on: [findLastFixImplementationTaskId()],
      status: "pending"
    }
```

每条 PBT 任务在 build 阶段会被 `forge-build` 引导生成 fast-check property test，断言"修复后该条 Unchanged 行为依旧成立"。

#### §2.4 三振联动

`/forge build` 在 regression-test 任务执行失败时按既有 §2.4 规则计数：

```
fail_signature = sha1(test_name + first_line_of_stacktrace)
counter[fail_signature] += 1
if (counter[fail_signature] >= 3):
  triggerThreeStrikeReroute({
    skill: "/forge debug",
    context: { bugfix_path, unchanged_clauses, fail_signature }
  })
  // 写诊断模板到 .forge/debug/<topic>.md
```

reroute 后禁止第 4 次同方向修复尝试，与 AGENTS.md §2.4 铁律一致。

#### Bugfix Spec 数据模型

```ts
export type SpecKind = "feature" | "bugfix";

export interface BugfixDocument {
  frontmatter: SpecFileFrontmatter & { kind: "bugfix" };
  /** "## Current Behavior" 段 */
  current: EarsClause[];
  /** "## Expected Behavior" 段 */
  expected: EarsClause[];
  /** "## Unchanged Behavior" 段 — 驱动 PBT 派生 */
  unchanged: EarsClause[];
}

export interface BugfixDesignDocument {
  frontmatter: SpecFileFrontmatter & { kind: "bugfix" };
  /** "## Root Cause Analysis" — 根因分析 */
  rootCause: string;
  /** "## Fix Strategy" — 修复策略 */
  fixStrategy: string;
  /** "## Test Properties" — PBT 派生策略说明 */
  testProperties: string;
}
```

`SpecBundle` 扩展为：

```ts
export interface SpecBundle {
  feature: string;
  kind: SpecKind;                                // 新增
  layout: "three-file" | "legacy-single";
  variant: WorkflowVariant;                      // bugfix 时为占位 "requirements-first"
  /** kind="feature" 时为 RequirementsDocument；kind="bugfix" 时为 BugfixDocument */
  primary: RequirementsDocument | BugfixDocument;
  /** kind="feature" 时为 DesignDocument；kind="bugfix" 时为 BugfixDesignDocument */
  design?: DesignDocument | BugfixDesignDocument;
  tasks?: TasksSeedDocument;
}
```

类型守卫函数 `isBugfixBundle(b)` / `isFeatureBundle(b)` 用于下游消费方分支处理。

```
src/spec.ts
  ├ parseRequirementsMarkdown(text): RequirementsDocument
  ├ parseDesignMarkdown(text): DesignDocument
  ├ parseTasksMarkdown(text): TasksSeedDocument
  ├ loadSpecBundle(featureDir): SpecBundle             // 优先三文件，回退 spec.md
  ├ writeSpecBundle(bundle, featureDir): void
  ├ migrateLegacySpec(specMdPath): SpecBundle          // Requirement 7
  ├ analyzeRequirements(req): AnalyzeResult            // Requirement 3
  ├ confirmSpecBundle(bundle): ConfirmSpecResult       // 替换 confirmSpec 三文件版
  └ refineDownstream(bundle, target): SpecBundle

src/conflict-classifier.ts
  └ FROZEN_PATTERNS 扩展三文件名

src/feature-dossier.ts
  ├ deriveTopicFromPath: 增加 requirements|design|tasks 匹配
  ├ matchStageFiles("specs"): 返回三文件 + spec.md 任意子集
  └ dossier 渲染聚合：同 topic 三文件折叠为单 entry

scripts/check-spec-contract.sh
  └ 改读 requirements.md 中的 EARS clauses（兼容 spec.md）

skills/forge/lib/spec/instructions.md
  └ Three-step Flow 升级为分支：variant=requirements-first|design-first|quick-plan

skills/forge/lib/spec/references/spec-format.md
  └ 由"单文件 8 章节"改为"三文件章节蓝本 + 兼容章节切片表"
```

下游 plan / build / review / health / living-doc 全部通过 `loadSpecBundle()` 接入，对外旧 API（`SpecDocument` / `confirmSpec`）保留至少一个发布周期。

## Components and Interfaces

### Spec engine（src/spec.ts）

新增以下纯函数，按 §2.1 TDD：

| 函数 | 输入 | 输出 | 副作用 |
|---|---|---|---|
| `parseRequirementsMarkdown` | `text: string` | `RequirementsDocument \| ParseError[]` | 无 |
| `parseDesignMarkdown` | `text: string` | `DesignDocument \| ParseError[]` | 无 |
| `parseTasksMarkdown` | `text: string` | `TasksSeedDocument \| ParseError[]` | 无 |
| `loadSpecBundle` | `featureDir: string` | `SpecBundle` | 读 fs |
| `writeSpecBundle` | `bundle, featureDir` | `void` | 写 fs |
| `migrateLegacySpec` | `featureDir: string` | `SpecBundle \| MigrationError` | 读写 fs，重命名旧文件 |
| `analyzeRequirements` | `req: RequirementsDocument` | `AnalyzeResult` | 无 |
| `refineDownstream` | `bundle, target: "design" \| "tasks"` | `SpecBundle` | 读 snapshot |
| `resolveSpecVariant` | `{ tier, behaviorScore, architectureScore, defaultVariant? }` | `{ variant, source }` | 无 |
| `detectSpecTriggers` | `featureDir: string` | `{ migrationNeeded, refineTarget? }` | 读 fs / mtime |
| `detectBrownfieldSignals` | `featureDir, taskDescription, projectRoot` | `{ brownfield, signals }` | 读 fs |
| `parseSpecArgs` | `argv: string[]` | `{ mode: "feature" \| "import" \| "default", ... }` | 读 fs（路径 stat） |
| `runImportMode` | `externalPath: string` | `SpecBundle` | 读外部文件 + 写 spec 目录 |
| `parseWaves` | `tasks: TasksSeedDocument` | `Wave[]` | 无 |
| `validateContractGate` | `bundle: SpecBundle` | `ContractGateResult` | 无 |
| `detectSpecLeak` | `bundle, scope: "strict" \| "lenient"` | `SpecLeakResult` | 读词典 |
| `enforceEarsSyntax` | `clause: string, retries: number` | `string \| EarsRetryFailure` | 无 |
| `detectSpecKind` | `featureDir: string, commandIntent?: string` | `SpecKind` | 读 fs |
| `parseBugfixMarkdown` | `text: string` | `BugfixDocument \| ParseError[]` | 无 |
| `parseBugfixDesignMarkdown` | `text: string` | `BugfixDesignDocument \| ParseError[]` | 无 |
| `renderBugfixMarkdown` | `BugfixDocument` | `string` | 无 |
| `renderBugfixDesignMarkdown` | `BugfixDesignDocument` | `string` | 无 |
| `runBugfixSelfChecks` | `bundle: SpecBundle` | `BugfixSelfCheckResult` | 无 |
| `derivePbtTasksFromUnchanged` | `bundle: SpecBundle` | `TaskSeed[]` | 无 |
| `isBugfixBundle` / `isFeatureBundle` | `bundle: SpecBundle` | `bundle is ...` | 无（type guard） |

`detectSpecTriggers` 在 `forge-spec` 启动时调用，决定是否需要自动迁移或自动 refine。规则：

```
if (exists spec.md && !exists requirements.md)             → migrationNeeded: true
if (exists plans/<topic>.md && !exists tasks.md)           → migrationNeeded: true
if (requirements.locked && design.mtime < requirements.lockedAt)  → refineTarget: "design"
if (design.locked && tasks.mtime < design.lockedAt)               → refineTarget: "tasks"
```

判定结果驱动后续步骤，不需要用户提供任何 flag。

### Workflow orchestration

`runRequirementsFirst` / `runDesignFirst` / `runQuickPlan` 三个编排函数仅做控制流，不直接调用 LLM，LLM 调用通过依赖注入注入；这样工作流逻辑可单元测试，LLM 行为可在 e2e 测试中替换为固定 fixture。

### Frozen zone（src/conflict-classifier.ts）

`FROZEN_PATTERNS` 增补：

```ts
/^\.forge\/specs\/[^/]+\/spec\.md$/                              // legacy
/^\.forge\/specs\/[^/]+\/(?:requirements|design|tasks)\.md$/      // new
```

`spec.legacy.md` 不进 frozen，留给迁移后清理。

### Dossier（src/feature-dossier.ts）

- `deriveTopicFromPath` 增加 `specs/<topic>/{requirements|design|tasks}.md` 反映射。
- `matchStageFiles("specs", topic, files)` 改为返回 `["requirements.md", "design.md", "tasks.md", "spec.md"]ᗒ files`。
- 渲染时同 topic 多文件折叠为一个 entry，列出存在的子文件。

### Review subagent input（src/review*.ts）

review 阶段读取 spec 的入口切到 `loadSpecBundle()`：

- spec-check：以 `requirements` 为主，参考 `design` 的 architecture / dataModel。
- quality-check：以 `design` + `tasks` 为主，对照 build diff。
- security-check：以 `design.errorHandling` + `requirements.outOfScope` 为主。

ADR-0005（review-subagent-prompt-diff-context）的 prompt 模板需追加"三文件 vs 单文件兼容"段。

### Plan（src/plan.ts）

- `/forge plan` 直接读取 `.forge/specs/<topic>/tasks.md`，**就地升级**（补编号、依赖图 JSON wave 块、估时、状态字段、DoD），最后把 `status` 切到 `locked`。不再向 `.forge/plans/<topic>.md` 写入。
- 当只有 `.forge/plans/<topic>.md`（兼容路径）时，把它当作只读输入材料合并到 `tasks.md`，并由 `detectSpecTriggers` 触发的自动迁移流程一并改名为 `.legacy.md`。
- `tasks.md` 与 `.forge/plans/<topic>.md` 共存时，`tasks.md` 为权威源；plans 文件视为遗留快照，不参与新生成。

### Build（src/build.ts）

- `/forge build` 启动时调用 `parseWaves(tasks)`，得到分波任务列表。
- 同 wave 内任务由现有 sub-agent 并发执行，并发上限受 `config.max_parallel_agents` 控制；HTTP 429 触发既有降级阶梯（6 → 3 → 2 → 1），降级记录到 `.forge/knowledge/tool-health.md`。
- `/forge build <task-id>` 单任务模式：以 task-id 为终点，向上遍历依赖闭包，按闭包内的 wave 子序列调度（不跑闭包外任务）。
- 任务推进时直接更新 `tasks.md` 中对应任务条目的 `status` 字段（pending / in-progress / completed / blocked），不写入额外文件。
- 任务失败 → 计入 §2.4 三振计数（按 `fail_signature = sha1(test_name + first_line_of_stacktrace)`），3 次同签名 → 自动进入 `/forge debug`。

### Validation Contract & Spec Leak（src/spec-validation.ts）

- `validateContractGate(bundle)` 在 `confirmSpecBundle` 内部调用：迭代 `bundle.requirements.earsCriteria`，校验每条的 `verifyBy` 与 `evidence` 字段；任一缺失或 `evidence` 为占位符 → P0。
- `detectSpecLeak(bundle, scope)` 用两套词典：
  - `scope: "strict"` 应用于 `requirements.md`，沿用现行 banned-patterns。
  - `scope: "lenient"` 应用于 `design.md`，由 `loadBannedPatterns({ scope: "design" })` 派生（剔除"类名/函数名"，保留"完整代码片段"等强信号）。
- `bundle.frontmatter.contract_legacy === true` 时跳过 Contract Gate（兼容性策略）。

### Brownfield self-checks（src/spec-brownfield.ts）

- `detectBrownfieldSignals(featureDir, taskDescription, projectRoot)` 在 spec 启动时与变体判定并行执行；触发任一信号即视为 brownfield。
- `runBrownfieldSelfChecks(bundle)` 在 `confirmSpecBundle` 内部、Contract Gate 之后调用：依次跑 Brownfield Compat / Two-part Structure / Reversibility / Anti-drift / Spec Leak（lenient）；任一 P0 失败 → 阻断 lock。
- 边界场景按 brownfield 处理（宁重勿轻），事件 `brownfield_mode_inferred` 写 events.jsonl。

### EARS 句式生成约束（src/spec-render.ts）

- `enforceEarsSyntax(clause, retries=3)` 在 `renderRequirementsMarkdown` 的每条 Acceptance Criteria 输出前调用：不匹配 EARS 正则 → 按"请改写为 EARS 句式"重提示；累计 3 次仍失败 → 写盘并依靠 ANL-01（Analyze 预检）兜底。
- 兼容句式：`当 X 时 系统应当 Y` 与 `当 X 则 Y`。

### Bugfix engine（src/spec-bugfix.ts）

- `detectSpecKind(featureDir, commandIntent?)` 在 spec / fix skill 启动时调用：存在 `bugfix.md` → `"bugfix"`；存在 `requirements.md` → `"feature"`；全新目录按 `commandIntent` 兜底（`"fix"` → bugfix；其余 → feature）。
- `parseBugfixMarkdown(text)` 解析 `## Current Behavior` / `## Expected Behavior` / `## Unchanged Behavior` 三段；缺段或非法 EARS → 结构化错误。
- `renderBugfixMarkdown(doc)` 反向序列化，与 parser 形成 round-trip。
- `parseBugfixDesignMarkdown` / `renderBugfixDesignMarkdown` 处理 `## Root Cause Analysis` / `## Fix Strategy` / `## Test Properties` 三段。
- `runBugfixSelfChecks(bundle)` 在 `confirmSpecBundle` 内部、Contract Gate 之前调用：跑 BFX-01 ~ BFX-06 六条规则；P0 阻断 lock，P1 阻断进入 design。
- `derivePbtTasksFromUnchanged(bundle)` 在 `/forge plan` 阶段对 Bugfix Bundle 执行：每条 Unchanged EARS 派生一条 `category: regression-test` 任务，verification = pbt（默认）或 manual（条目以 `[manual]` 结尾）；任务依赖最后一条 fix-implementation 任务。
- `isBugfixBundle` / `isFeatureBundle` 类型守卫在所有下游模块（review / dossier / living-doc / health）作为分支判定使用。

### Bugfix → /forge fix 入口接入

- `skills/forge/lib/fix/instructions.md`（既有）改写：
  1. 调用 `detectSpecKind(featureDir, "fix")` → 强制 `kind: "bugfix"`。
  2. 调用 `runBugfixOrchestration(bundle)` 走 bugfix.md → design.md → tasks.md 三步 lock，每步遵守 §2.7 自动推进。
  3. 跳过 Feature Spec 的 `resolveSpecVariant`、Brownfield 章节、Validation Contract Gate（保留 Spec Leak）。
- `/forge fix` 仍是 Forge 现有 skill 入口，命令本身不变；只是产物形态升级为三文件。

### §2.4 三振重排联动（src/build.ts 扩展）

- `/forge build` 在执行 `category: regression-test` 任务失败时按既有 `fail_signature` 计数；同签名累计 3 次 → 调用 `triggerThreeStrikeReroute({ skill: "/forge debug", context: { bugfix_path, unchanged_clauses, fail_signature } })`。
- 写诊断模板到 `.forge/debug/<topic>.md`，含 Unchanged 段全文 + 失败签名 + 修复任务编号。
- reroute 后禁止第 4 次同方向修复尝试，沿用既有 §2.4 实现。

### Living doc & health

- `src/living-doc/generator.ts` 切到 `loadSpecBundle()`；渲染层增加 `workflow_variant` 徽章。
- `checkSpecHealth` 输入改为 `SpecBundle`；hash 计算为三文件文本拼接后的 sha1（顺序固定 requirements → design → tasks）。

## Data Models

```ts
export type SpecStatus = "draft" | "locked";

export type SpecKind = "feature" | "bugfix";

export type WorkflowVariant = "requirements-first" | "design-first" | "quick-plan";

export interface SpecFileFrontmatter {
  feature: string;
  status: SpecStatus;
  date: string;
  workflow_variant: WorkflowVariant;
  /** Distinguishes Feature Spec ("feature") from Bugfix Spec ("bugfix") */
  kind?: SpecKind;
  /** Set when migrated from legacy spec.md by detectSpecTriggers; references spec.legacy.md */
  migrated_from?: string;
  /** Set when imported from external spec via Requirement 10; references original path */
  import_source?: string;
  /** Set when this spec is brownfield (Requirement 9); drives self-check selection */
  brownfield?: boolean;
  /** Opt-out of Validation Contract Gate (Requirement 11) for legacy specs */
  contract_legacy?: boolean;
}

export interface SpecBundle {
  feature: string;
  /** Default "feature"; "bugfix" when bugfix.md is present */
  kind: SpecKind;
  layout: "three-file" | "legacy-single";
  /** Bugfix specs use "requirements-first" as a placeholder; variant routing is feature-only */
  variant: WorkflowVariant;
  /** kind="feature" → RequirementsDocument; kind="bugfix" → BugfixDocument */
  primary: RequirementsDocument | BugfixDocument;
  /** kind="feature" → DesignDocument; kind="bugfix" → BugfixDesignDocument */
  design?: DesignDocument | BugfixDesignDocument;
  tasks?: TasksSeedDocument;
}

export interface BugfixDocument {
  frontmatter: SpecFileFrontmatter & { kind: "bugfix" };
  /** "## Current Behavior" 段 */
  current: EarsClause[];
  /** "## Expected Behavior" 段 */
  expected: EarsClause[];
  /** "## Unchanged Behavior" 段 — 驱动 PBT 派生 */
  unchanged: EarsClause[];
}

export interface BugfixDesignDocument {
  frontmatter: SpecFileFrontmatter & { kind: "bugfix" };
  /** "## Root Cause Analysis" — 根因分析 */
  rootCause: string;
  /** "## Fix Strategy" — 修复策略 */
  fixStrategy: string;
  /** "## Test Properties" — PBT 派生策略说明 */
  testProperties: string;
}

export interface RequirementsDocument {
  frontmatter: SpecFileFrontmatter;
  intro: string;
  glossary: GlossaryEntry[];
  userStories: UserStory[];
  earsCriteria: EarsClause[];
  nonFunctional: string[];
  outOfScope: string[];
  /** Brownfield only (Requirement 9) */
  delta?: { added: string[]; modified: string[]; unchanged: string[] };
}

export interface DesignDocument {
  frontmatter: SpecFileFrontmatter;
  overview: string;
  architecture: string;
  componentInterfaces: string[];
  dataModel: string;
  errorHandling: string;
  testingStrategy: string;
  rollout: string;
  openQuestions: string[];
  /** Brownfield only (Requirement 9) */
  currentState?: string;
  /** Brownfield only (Requirement 9) */
  proposedChange?: string;
  /** Brownfield only (Requirement 9) */
  reversibility?: string;
}

export interface TasksSeedDocument {
  frontmatter: SpecFileFrontmatter;
  tasks: TaskSeed[];
  /** Filled in by /forge plan when status -> locked; absent in spec-stage drafts */
  waves?: Wave[];
}

export interface TaskSeed {
  id: string;                  // T-01 / T-09.4 / etc
  title: string;
  goal: string;
  related_requirements: string[];
  depends_on?: string[];
  estimate?: string;           // plan 阶段补
  status: "pending" | "in-progress" | "completed" | "blocked" | "failed";
  category?: "implementation" | "regression-test" | "doc" | "config";
  verification?: "auto" | "manual";
  verified_by?: string;
  verified_at?: string;
}

export interface Wave {
  wave: number;                // 1-indexed
  tasks: string[];             // task ids
}

export interface EarsClause {
  line: number;
  when: string;
  shall: string;
  raw: string;
  /** Required by Validation Contract Gate (Requirement 11) */
  verifyBy?: "vitest" | "bash" | "forge_git" | "forge_exec" | "manual";
  /** Required by Validation Contract Gate (Requirement 11); non-empty, non-placeholder */
  evidence?: string;
}
```

`SpecDocument`（既有类型）保留为单文件适配视图，并新增 `toBundle(): SpecBundle` 转换器，`layout="legacy-single"`。

## Correctness Properties

### Property 1: Bundle round-trip

对任意 `SpecBundle b`，`loadSpecBundle(write(b)) ≡ b`（除 frontmatter `date` 字段）。fast-check PBT 覆盖。

**Validates: Requirements 1, 6**

### Property 2: Layout 兼容性

对任意只含 `spec.md` 的目录，`loadSpecBundle().layout === "legacy-single"` 且解析结果与 `parseSpec(text)` 内容一致（snapshot 锁定）。

**Validates: Requirements 1, 6**

### Property 3: Frozen 单调性

当任一文件 status=locked，对应路径 `classify(p) === "frozen"`。fast-check PBT 覆盖。

**Validates: Requirements 6**

### Property 4: Analyze 单调性

新增 EARS 句式只增不减地降低 P0 数量；删除歧义只减不增地降低 P1 数量。

**Validates: Requirements 3**

### Property 5: Variant resolution 决定性

`resolveSpecVariant({ tier, behaviorScore, architectureScore, defaultVariant })` 是纯函数，相同输入始终返回相同变体。该函数只接收路由器与关键词扫描的产出，不读 process.argv，不依赖文件系统。

**Validates: Requirements 2, 8, 13**

### Property 6: Wave 调度无环

`parseWaves(tasks)` 输出的 wave 列表对依赖图是拓扑排序：对任意任务 T 在 wave N，T.depends_on 中的每条依赖都属于 wave < N。fast-check PBT 覆盖随机依赖图。

**Validates: Requirements 4**

### Property 7: 单任务依赖闭包正确性

`computeDependencyClosure(taskId, tasks)` 返回的任务集合是 taskId 上游所有依赖的传递闭包，含 taskId 自身；闭包内不含闭包外任务。

**Validates: Requirements 4**

### Property 8: Brownfield 信号单调性

`detectBrownfieldSignals` 在新增任意一条信号（git history / prior spec / keyword）时，`brownfield` 字段只能从 false → true，不会反向。

**Validates: Requirements 9**

### Property 9: EARS 重写收敛

`enforceEarsSyntax(clause, retries=3)` 每次重试只能减少或保持非 EARS 行数，不能引入新的非 EARS 行数。fast-check PBT 覆盖。

**Validates: Requirements 12**

### Property 10: Bugfix 三段必备

`runBugfixSelfChecks(bundle)` 对任意 `BugfixDocument`：当 Current / Expected / Unchanged 任一段为空或 EARS 句式不合规时返回 `pass=false`；三段齐备且 EARS 合规时返回 `pass=true`。fast-check PBT 在三段独立扰动下验证（移除任一段 → P0；新增任意合规条目 → 单调不变）。

**Validates: Requirements 14**

### Property 11: Unchanged → PBT 计数

`derivePbtTasksFromUnchanged(bundle)` 对任意 `BugfixDocument`：派生的 regression-test 任务数量 = unchanged 段条目数；每条任务的 `source_clause` 字段唯一指向一条 unchanged 条目；任意条目以 `[manual]` 结尾时对应任务的 verification = "manual"，否则 = "pbt"。

**Validates: Requirements 15**

## Error Handling

| 错误类型 | 处理 |
|---|---|
| 三文件 frontmatter `feature` 与目录名不一致 | spec 阶段自检 P0 阻断 |
| Analyze P0 失败 | 阻断进入 design；问题清单写 `.forge/findings/spec-analyze-<topic>.md` |
| Quick Plan 用户中途 abort | 三文件保留为 draft，下次 spec 启动时自动检测并继续 |
| 自动迁移解析失败 | 保留原 `spec.md` / `plans/<topic>.md` 不动，输出 `spec_migration_failed` 事件，本次 spec 调用回退到 legacy 路径 |
| 三文件与 `spec.md` 同时存在 | 优先三文件，输出 P2 迁移建议 |
| `tasks.md` 与 `plans/<topic>.md` 同时存在 | `tasks.md` 为权威源，输出 P2 提示删除遗留 plans 文件 |
| frozen 文件被修改而未先解锁 | 沿用既有 frozen-refuse 路径 |
| 自动 Refine 时缺少 snapshot | 回退为整体重生，输出告警事件 `refine_fallback_to_full_regen` |
| 用户在聊天层覆盖变体（"切换到 design-first"） | spec skill 解析后重做生成；事件流标 `source: "user-override"` |
| Brownfield 自检 P0 失败（Delta 缺失 / Current State 无 file:line / Reversibility 不全） | 阻断 lock；问题清单输出到终端，等待开发者补全 |
| 外部 spec 导入解析失败 | 不写入 spec 目录；输出 `spec_import_failed` 事件，提示用户检查文件格式 |
| Validation Contract Gate 失败（Verify-By 缺失 / Evidence 占位符） | P0 阻断 lock；输出每条缺失字段的位置（行号 + 原文） |
| Spec Leak 检测命中 | P0 阻断 lock；按文件 scope 输出 `[spec-leak] requirements.md:行号` 或 `[spec-leak] design.md:行号` |
| EARS 重写 3 次仍失败 | 写盘但记录 `ears_enforcement_exhausted` 事件；ANL-01 兜底报警 |
| `default_workflow_variant` 配置非法值 | 跳过该值，按 RF 兜底；输出 `invalid_default_variant_config` 事件 |
| Wave 块 JSON 解析失败 | 阻断 build；输出 `tasks.md` JSON 错误行号；不退化为串行执行（避免静默丢失依赖关系） |
| 单任务模式（`/forge build <task-id>`）传入未知 task-id | 阻断；列出 tasks.md 中可选的 task-id |
| Bugfix Spec 自检 P0 失败（三段缺失 / Current=Expected / Unchanged 与 Expected 冲突） | 阻断 lock；问题清单输出到终端 |
| Bugfix design.md 缺三段（Root Cause / Fix Strategy / Test Properties） | P0 阻断 lock |
| Unchanged 段为空或仅含 `[manual]` 标注 | BFX-06 P1 阻断进入 design（保证至少 1 条 PBT） |
| §2.4 三振重排在 regression-test 失败时触发 | 自动调用 `/forge debug`，写诊断模板到 `.forge/debug/<topic>.md`；禁止第 4 次同方向修复 |
| `/forge fix` 路径下 `bugfix.md` 与 `requirements.md` 同时存在 | P0 阻断；要求开发者删除其中一个（同一目录不允许两种 kind） |

## Testing Strategy

| 层级 | 内容 |
|---|---|
| 单元 | `parseRequirementsMarkdown` / `parseDesignMarkdown` / `parseTasksMarkdown` / `analyzeRequirements` / `migrateLegacySpec` / `resolveSpecVariant` / `parseWaves` / `validateContractGate` / `detectSpecLeak` / `enforceEarsSyntax` / `detectBrownfieldSignals` / `parseBugfixMarkdown` / `parseBugfixDesignMarkdown` / `runBugfixSelfChecks` / `derivePbtTasksFromUnchanged` / `detectSpecKind` 各自纯函数测试 |
| PBT | bundle round-trip / frozen 单调性 / Analyze 单调性 / wave 拓扑（Property 6）/ 单任务闭包（Property 7）/ brownfield 单调（Property 8）/ EARS 重写收敛（Property 9）/ Bugfix 三段必备（Property 10）/ Unchanged → PBT 计数（Property 11） |
| 集成 | 三种 Feature 工作流变体端到端跑通；外部 spec 导入端到端；brownfield 自动判定端到端；wave 并行 build 端到端；Bugfix Spec 三文件端到端（含 §2.4 三振触发模拟） |
| 回归 | 现有所有 `.forge/specs/*/spec.md` 均能被 `loadSpecBundle()` 正确返回 layout="legacy-single"；既有 `/forge fix` 单文件提议在 enforced 配置下输出 P1 迁移建议 |
| 兼容 | `spec_three_file_layout: legacy` 时 Feature/Bugfix 均不生成三文件；`enforced` 时对单文件报 P1；`experimental` 时双布局并存 |
| 兜底配置 | `default_workflow_variant` 在 ratio ∈ [0.67, 1.5] 区间生效；其余区间不生效；非法值降级为 RF |

## Rollout

灰度方案：

1. **Phase 0**（数据契约 + 解析器）：引入 `SpecBundle` 与解析器，不改默认行为，layout 仍为 legacy。
2. **Phase 1**（默认切到 experimental）：下游兼容点全部上线。新 `/forge spec` 默认产出三文件；旧 `spec.md` 仍可被读。
3. **Phase 2**（默认切到 enforced）：一个发布周期之后，对仓内残留 `spec.md` / `plans/<topic>.md` 在 spec 阶段启动时输出 P1 迁移建议清单；自动迁移在用户触达对应 topic 时透明触发（Requirement 7），无需用户输入命令。

回滚：把 `.forge/config.md` 的 `spec_three_file_layout` 切回 `legacy`，三文件不再生成；既有三文件仍可被 `loadSpecBundle()` 读取，不会丢数据。

## 与既有铁律的边界

- **§2.1 TDD**：本设计本身按 TDD 实现，三文件解析器和迁移工具先写测试再写实现。
- **§2.2 Pre-build Gates**：spec-lock 门禁迁移到三文件 status 全 locked 才视为锁定；任意一份未锁定 → 阻断 build。`tasks.md` 在 `/forge plan` 后切到 locked，作为 plan 批准门禁的等价物。
- **§2.7 No Mid-step Confirmation**：Requirements-First 与 Design-First 在 Lock → 下一阶段之间禁止"是否继续"，Quick Plan 把所有澄清问题压到生成前一轮，符合铁律。
- **§3.1 执行-评审分离**：Analyze Requirements 是执行 Agent 自检，不替代 review 阶段独立 Subagent 评审。
- **§3.2 三层评审**：review 输入更结构化但层级不变。
- **§4 Knowledge Discipline**：learn 阶段读 `.forge/specs/<topic>/*.md` 即可，无新依赖。
- **单入口原则**：本特性不引入用户可见的新 CLI flag；变体选择、迁移、refine 均由 Forge 内部决策；用户唯一可见命令仍为 `/forge <任务描述或子命令>`。
- **`.forge/decisions/` 不动**：跨 feature ADR 与决策记录由 `/forge decide` 写入；spec 内 `design.md` 仅记录当前 feature 的技术设计，不替代 ADR。设计中如有跨 feature 影响，design.md 显式标注并提示开发者另行通过 `/forge decide` 沉淀。

## Open Questions

1. Quick Plan 的"澄清问题集"是否做成模板可配置？倾向暂用内置模板，待真实使用反馈后再开放。
2. Refine 触发的 snapshot 是否要进 git？倾向落到 `.forge/runs/` 下不进 git，避免 spec 目录污染。
3. 是否给 design 引入 high-level / low-level 两档粒度（对齐 Kiro Design-First）？倾向 v1 不做，简化交互。
4. 行为/架构信号的关键词词典是否需要做成 `.forge/config.md` 可配置？v1 内置一份合理默认；后续按反馈迭代。
5. Brownfield 信号检测中"任务描述关键词"的词典是中英混合还是仅中文？v1 内置中英混合默认词典；可在 v2 暴露配置。
6. Spec Leak `lenient` 词典与 `strict` 词典的差集是手动维护还是自动派生？v1 选自动派生（剔除"类名/函数名"维度），手动可覆盖。
7. 单任务模式（`/forge build <task-id>`）是否允许多 task-id 并集？v1 仅支持单 task-id，后续按需求扩展。
8. `/forge fix` 历史单文件提议的真实路径是 `.forge/proposals/<topic>.md` 还是其他位置？需读 `skills/forge/lib/fix/instructions.md` 确认；T-08 自动迁移逻辑视确认结果细化。
