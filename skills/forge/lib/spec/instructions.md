---
description: "Use when user runs `/forge spec`, imports external PM spec, or building a new feature and lacks a locked spec"
updated: 2026-06-05

dispatch_mode: fork
allowed_tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Write
---

# /forge spec — 规格引擎

> **触发方式**：全量路径第二步 / 用户输入 `/forge spec` / `/forge spec <file-path>` 导入外部规格
> **职责**：将需求固化为可审阅、可测试、可锁定的规格文档，锁定后成为 build 和 review 的唯一真理源
> **输出路径**：`.forge/specs/<feature>/requirements.md` + `design.md` + `tasks.md`（三文件布局）或 `.forge/specs/<feature>/spec.md`（legacy 兼容）

---

## 1. Overview

`/forge spec` 通过三步流程（Propose → Review → Lock）将模糊的需求转化为结构化的规格文档。规格文档是 Forge 工作流的核心合同——锁定后，build 按它实现，review 按它验收，任何偏离都会被拦截。

**核心原则**：规格描述行为，不描述实现。写"当用户提交表单时，系统返回成功提示"，不写"调用 FormService.submit() 方法"。

**三文件布局（Kiro-style）**：默认输出 `requirements.md` + `design.md` + `tasks.md` 三个文件到 `.forge/specs/<feature>/` 目录。使用 `loadSpecBundle()` 读取，`resolveSpecVariant()` 自动选择工作流变体（requirements-first / design-first / quick-plan）。聊天层可通过自然语言覆盖（如"切换到 design-first"），不引入任何新 CLI flag。

**Not For**：单行修复 / typo 纠正 / 需求已明确且自包含的变更 / 已有外部 PM 交付完整 spec（用导入模式）

## 1.5. Import Mode

当开发者从产品经理处收到外部规格文档时，使用导入模式：

```
/forge spec path/to/external-spec.md
```

自动读取外部文档，提取需求/场景，转化为 Forge SpecDocument 格式，复用五项自检（可测试性/边界清晰度/人类可读性/棕地兼容性/反漂移完整性），写入 `.forge/specs/<feature>/spec.md` 并在 frontmatter 标注 `import_source`。

→ 详见 references/import-mode.md（适用场景、转化规则、质量保证、边界情况）

---

## 2. Three-step Flow

### Step 0: Pre-check

1. 调用 `detectSpecTriggers(featureDir)` 检查迁移与 Refine 需求
   - Legacy `spec.md` 存在但无三文件 → 自动触发 T-08 迁移
   - Requirements mtime > Design mtime → 自动触发 T-07 Refine
2. 调用 `resolveSpecVariant(input)` 自动选择变体
   - 行为关键词为主 → requirements-first
   - 架构关键词为主 → design-first
   - Light tier → quick-plan
3. 聊天层覆盖：用户输入"切换到 design-first"等自然语言时，`parseVariantOverride(text)` 捕获并覆盖变体选择
4. Bugfix 模式：`/forge fix` 入口直接走 bugfix 流程，跳过变体判定和 brownfield 检测

### Step 0.5: Clarification Gate (需求澄清门控)

在 Step 1 正式编写需求前，根据 tier 和 spec 主题执行需求澄清，暴露隐藏要求和约束。

→ 执行协议详见 `shared/gate-protocol.md`（参数：gate_name=Clarification Gate, max_questions=5, time_budget=2 min, injection_label=Clarification Context, log_filename=\*-clarification.jsonl, skip_option_text=跳过）。协议内含 `shouldTriggerInlineGrill`、`renderInlineGrillConfirmPrompt`、`renderInlineGrillAdvisory`、`formatInlineGrillInjection` 调用流程。

#### Charter 感知

读取 `.forge/charter.md`（如果存在），避免提出 charter 已回答的问题（如技术选型、团队规模等已记录信息）。Charter 不可读或格式异常时输出警告并跳过 charter 感知（不影响 Gate 执行）。

**维度覆盖检测**：通过 charter 的 section header 匹配判断已覆盖维度（如存在 `## 技术选型` section → 跳过"依赖关系"问题；存在 `## 目标用户` → 跳过"用户价值"问题）。无对应 section header 的维度正常提问。

#### 问题选择算法

分析 spec 主题，按以下维度选择 2–5 个问题：

1. **用户价值**（必问）：当 spec 主题包含"功能"、"特性"、"新增" → "这个功能的核心用户价值是什么？如果只保留一个场景，是哪个？"
2. **边界条件**：当 charter 不存在或无排除范围章节 → "什么情况下这个功能不应该工作？"
3. **依赖关系**：当 spec 主题涉及外部交互（API、服务、数据库） → "这个功能依赖什么已有功能或外部服务？它们准备好了吗？"
4. **成功标准**：兜底 → "你怎么知道这个功能成功了？可衡量的指标是什么？"
5. **替代方案**：兜底 → "有没有更简单的方式达到同样的目标？"

**规则**：2–5 个问题，已回答维度不重复，charter 已覆盖维度跳过。

### Step 1: Propose (Generate Draft)

读取以下上下文，生成规格草案：

| Input Source | Description |
|--------|------|
| `.forge/decisions/` | 决策文档（产品定义、技术方案、安全评估） |
| `.forge/config.md` | 项目配置（技术栈、安全级别） |
| `.forge/specs/` | 现有规格，避免重复、确保一致 |
| User Input | 当前需求描述 |

**生成规则**：

1. **先读代码再写 spec**：AI 必须先读取相关代码文件理解模块结构和行为，不允许未读代码就填写 Current State
2. 从决策文档提取已确认方向，不重复讨论
3. 从现有 specs 识别相关功能，确保不冲突
4. 需求拆解为独立条目，每条至少一个可测试场景
5. 棕地开发自动包含 Delta 章节

草案生成后，向用户展示完整草案内容，进入 Review 步骤。

### Step 2: Review (Self-check)

对草案执行以下自检，逐项报告结果：

| Check | Pass Criteria |
|--------|---------|
| Testability | 所有需求均有"当...则..."格式场景 |
| Boundary Clarity | 无模糊用语（"适当的"、"合理的"、"等等"） |
| Human Readability | 无类名/函数名/库名等实现细节 |
| Brownfield Compat | 棕地项目有完整新增/修改/不变章节 |
| Anti-drift | 主目标、非目标代理信号、验证材料角色三项已填写 |
| Two-part Structure | Current State 有 file:line 引用；Proposed Change 有变更/不变声明 |
| Reversibility | 回滚清单和挂载点清单已填写 |
| Spec Leak Check | 无实现细节泄露（通过 detectSpecLeak 扫描，需有 banned-patterns） |
| Scenario Lint | 所有 Gherkin 场景通过 SCN001-SCN004 规则检查 |
| **Validation Contract** | 每条 Acceptance Criteria 附 `Verify-By`（分层白名单：`vitest:unit` / `vitest:component` / `bash:contract` / `forge_exec:e2e` / `manual`，ADR-0006）和 `Evidence`（非空字符串）|

自检未通过 → 自动修正并重新自检，直到全部通过。全部通过后提示用户确认锁定。

**Analyze Pre-check**：Requirements lock 后、Design 生成前，调用 `analyzeRequirements(req)` 执行 ANL-01~05 五项规则（EARS 合规、一致性、歧义、冲突、完整性）。P0 阻断 Design 生成，P1 建议修正。

After Step 2 Review completes, call `checkSpecHealth(input)` and write result to spec frontmatter `health: { score, verdict, spec_hash, generated_at }`. This caches the health assessment for downstream skills (plan/build/debug/review).

### Step 2a: Inline Grill Trigger (conditional)

After Step 2 Review completes:

→ 执行协议详见 `shared/gate-protocol.md`（参数：gate_name=Clarification Gate, max_questions=5, time_budget=2 min, injection_label=Clarification Context, log_filename=\*-clarification.jsonl, skip_option_text=跳过）。协议内含 `shouldTriggerInlineGrill`、`renderInlineGrillConfirmPrompt`、`renderInlineGrillAdvisory`、`formatInlineGrillInjection` 调用流程。

**触发条件**（这是 spec 唯一不同的部分）：

1. If `ambiguity_score >= threshold`:
   - reason: `"spec_high_ambiguity"`
   - 问题选择：全类别（`generateDecisionTree` / `selectNextQuestion` / `applyAnswer`）
   - 注入后重新执行：re-generate draft → re-run Step 2 Review
2. If `ambiguity_score < threshold`: Skip directly to Step 3 Lock

**Constraints**:
- Inline grill does NOT write `findings/grill-<topic>.md`
- Spec frontmatter: set `inline_grill_applied: true` when grill completed

→ 每项检查的合格标准与反例详见 references/quality-standards.md

### Step 3: Lock

用户确认后：frontmatter `status` → `"locked"`，写入 `.forge/specs/<feature>/spec.md`。修改需先解锁（status → draft）重走 Review → Lock。用户不确认则保持 draft 可继续修改。

**Contract Validation Gate**: Lock 前调用 `bash scripts/check-spec-contract.sh <spec-file>` 校验所有 Acceptance Criteria 都带分层 `Verify-By`（`vitest:unit` / `vitest:component` / `bash:contract` / `forge_exec:e2e` / `manual`）和 `Evidence`（非空无 placeholder）。校验失败 → 阻断 lock，输出缺失字段列表与合法取值。`contract_legacy: true` 的 spec 跳过校验（grandfathering，NFR-2）。可选 `--check-evidence` 对路径形态的 Evidence token 做磁盘存在性校验（AC7）。

---

## 3. Spec Document Format

**三文件布局**（默认）：`requirements.md`（EARS 验收标准 + Glossary + Delta）+ `design.md`（架构 + 数据模型 + 错误处理）+ `tasks.md`（任务列表 + Wave 块 + DoD）。

**Legacy 兼容**：单文件 `spec.md`（八章节），通过 `layout: "legacy-single"` 在 SpecBundle 中标记。迁移由 T-08 自动执行。

→ 详见 references/spec-format.md（完整三文件蓝本 + 兼容切片表）

---

## 4. Quality Standards

Testability / Behavior-not-Implementation / Brownfield Delta / Two-part Structure / Reversibility / Anti-drift 六项自检标准的合格判定、反例、棕地信号识别：

→ 详见 references/quality-standards.md

---

## 5. Gate: Spec Not Locked → Block `/forge build`

<HARD-GATE name="spec-lock">

→ 遵循 CLAUDE.md §2.2 前置检查。status 非 `"locked"` → 阻断 build，提示运行 `/forge spec`。轻量路径例外。

</HARD-GATE>

---

## 6. Execution Flow

1. **前置检查**：`.forge/` 目录是否存在。不存在 → 提示先运行 `/forge init`
2. **入口路由**：调用 `routeSpecEntry(argv, featureDir, outputDir, existingBundle?)`（`src/spec.ts`）按 argv 分发：
   - `mode: "import"` → 自动调用 `runImportMode(path, outputDir)` 写齐三文件并返回；
   - `mode: "bugfix"` → `detectSpecKind` 命中 `bugfix.md` 时自动调 `runBugfixOrchestration(bundle)`；
   - `mode: "feature" | "default"` → 走下面标准流程。
3. **读取上下文**：`.forge/decisions/`（如有）→ `.forge/config.md` → `.forge/specs/`
4. **Pre-check**：`detectSpecTriggers()` 检查迁移/Refine。`migrationNeeded === true` 时**必须立即调用** `migrateLegacySpec(featureDir)` 把 legacy `spec.md` + `plans/<topic>.md` 透明迁移成三文件后再继续。`refineTarget` 命中时调 `refineDownstream(bundle, target)`。然后 `resolveSpecVariant()` 选择变体。
5. **Propose**：基于上下文和变体生成三文件草案（详见 §2 Step 1）
6. **Review**：执行自检 + `analyzeRequirements()` 预检（详见 §2 Step 2），未通过则自动修正并重新自检
7. **用户确认或修改**：确认 → 进入 Lock；修改意见 → 更新草案回到 Review；拒绝 → 保持 draft
8. **Lock**：锁定规格（详见 §2 Step 3）。三文件各自独立 lock，写入 `requirements.md` + `design.md` + `tasks.md`
9. **Glossary-miss 扫描**：读取 `.forge/glossary.md` 的术语表，对生成/导入的 spec 文本调用 `detectGlossaryMiss`。如发现未定义术语，输出 `[glossary-miss] 未定义术语：[...]` 提示用户在 learn 阶段回写。不阻断 lock 流程。Step 7 调用 `runGlossaryCheck({ phase: 'spec' })` 进行术语漂移检测。Autonomous 模式下，冲突写入 `getAdvisoryPath('spec', topic)` 指定路径，并将路径添加到 spec frontmatter `pending_glossary_advisories: [...]` 字段。
9.5. **Charter 合规性章节**：当 `.forge/charter.md` 存在且 `status: active` 时，在 `requirements.md` 中增加 `## Charter 合规性` 章节，每个需求标注对应的 charter invariant ID（如 `R1 → INV-002, INV-005`）。需求与 invariant 有潜在冲突时标注 `⚠ 需通过 <boundary>`。Charter 不存在时跳过此章节。
10. **自动推进（铁律）**：Lock 成功后，输出 `✅ spec 完成 → 自动进入 plan`，然后**立即调用** `Skill(skill="forge", args="plan")`。不输出"是否继续？"等确认文本。静默 idle（无输出、等待用户输入）与显式询问同罪。（→ 详见 shared/next-step-protocol.md）

---

## 7. Edge Case Handling

→ 详见 references/edge-cases.md

---

## 8. Examples

Greenfield Canonical Example（`order-batch-export`）与 Brownfield Variant（含 Current State / Proposed Change / Delta）：

→ 详见 references/examples.md

---

## 9. Known AI Failure Modes

| Failure Mode | Wrong Behavior | Correct Approach |
|---------|---------|---------|
| 不读现有代码就写 spec | Current State 凭推测填写或留空 | 先用工具读取相关代码文件，确认模块结构和行为后用 file:line 引用填写 |
| spec 与代码实际结构不一致 | 引用的文件路径、函数名、行号与实际代码不匹配 | 每个 file:line 引用都经过实际读取验证 |
| 遗漏"明确不做"边界 | 只写"要做什么"，没有写"不做什么"和"明确不改变什么" | 在 Proposed Change 中明确列出"明确不改变的"条目，在"不做什么"章节列出用户可能期望但本次不实现的功能 |

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "需求很明确不需要写 spec" | 明确的需求也有隐含假设。spec 的价值是把假设显式化，15 分钟的 spec 能避免数小时的返工 |
| "先写代码再补 spec" | 那是文档不是规格。spec 的价值在于编码前强制厘清需求，事后补写无法发现前置假设错误 |
| "这个功能太小了不值得写 spec" | 小功能不需要长 spec，但仍需要验收标准。两行 spec 也是 spec |

---

## 10. Living Doc Generation (`--living-doc`)

When `/forge spec --living-doc` is invoked:

1. Call `generateLivingDoc(specsDir, acceptanceDir)` from `src/living-doc/generator.ts` — scans `.forge/specs/` for spec files, parses frontmatter and scenarios, merges acceptance verdicts from `.forge/acceptance/`
2. Call `renderLivingDoc(data, outputDir)` from `src/living-doc/renderer.ts` — generates index.html + per-context pages + CSS
3. Output: `✅ Living doc generated at .forge/docs/living/index.html (N scenarios)`

**Output directory**: `.forge/docs/living/`

**Zero-Pack behavior**: When no specs exist, `generateLivingDoc` returns empty data with 0 scenarios. `renderLivingDoc` produces a skeleton index page with zero stats. Exit 0.

**Standalone script**: `node scripts/generate-living-doc.mjs`

## Gotchas
- **Ambiguous acceptance criteria**: Spec says "works correctly" → untestable → criteria must be falsifiable (specific input → specific output)
- **Scope creep in spec**: Spec includes implementation details → constrains solution space → spec describes WHAT not HOW
- **Unlocked spec edited**: Spec modified after lock → plan/code built against wrong spec → warn on post-lock edits
