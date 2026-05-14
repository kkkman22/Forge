---
name: forge-spec
description: "Specify requirements as reviewable, testable, lockable spec documents before planning. Use when user runs `/forge spec`, imports external PM spec, or building a new feature and lacks a locked spec."
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge spec — 规格引擎

> **触发方式**：全量路径第二步 / 用户输入 `/forge spec` / `/forge spec <file-path>` 导入外部规格
> **职责**：将需求固化为可审阅、可测试、可锁定的规格文档，锁定后成为 build 和 review 的唯一真理源
> **输出路径**：`.forge/specs/<feature>/spec.md`

---

## 1. Overview

`/forge spec` 通过三步流程（Propose → Review → Lock）将模糊的需求转化为结构化的规格文档。规格文档是 Forge 工作流的核心合同——锁定后，build 按它实现，review 按它验收，任何偏离都会被拦截。

**核心原则**：规格描述行为，不描述实现。写"当用户提交表单时，系统返回成功提示"，不写"调用 FormService.submit() 方法"。

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

自检未通过 → 自动修正并重新自检，直到全部通过。全部通过后提示用户确认锁定。

→ 每项检查的合格标准与反例详见 references/quality-standards.md

### Step 3: Lock

用户确认后：frontmatter `status` → `"locked"`，写入 `.forge/specs/<feature>/spec.md`。修改需先解锁（status → draft）重走 Review → Lock。用户不确认则保持 draft 可继续修改。

---

## 3. Spec Document Format

YAML frontmatter（feature/status/date/import_source）+ Body 八章节（目的/需求/场景汇总/Current State/Proposed Change/不做什么/Reversibility/反漂移声明/Delta）。

→ 详见 references/spec-format.md（完整模板）

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

1. **前置检查**：`.forge/` 目录是否存在。不存在 → 提示先运行 `forge init`
2. **读取上下文**：`.forge/decisions/`（如有）→ `.forge/config.md` → `.forge/specs/`
3. **Propose**：基于上下文生成规格草案（详见 §2 Step 1）
4. **Review**：执行自检（详见 §2 Step 2），未通过则自动修正并重新自检
5. **用户确认或修改**：确认 → 进入 Lock；修改意见 → 更新草案回到 Review；拒绝 → 保持 draft
6. **Lock**：锁定规格（详见 §2 Step 3）
7. **Glossary-miss 扫描**：读取 `.forge/glossary.md` 的术语表，对生成/导入的 spec 文本调用 `detectGlossaryMiss`。如发现未定义术语，输出 `[glossary-miss] 未定义术语：[...]` 提示用户在 learn 阶段回写。不阻断 lock 流程。Step 7 调用 `runGlossaryCheck({ phase: 'spec' })` 进行术语漂移检测。Autonomous 模式下，冲突写入 `getAdvisoryPath('spec', topic)` 指定路径，并将路径添加到 spec frontmatter `pending_glossary_advisories: [...]` 字段。

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
