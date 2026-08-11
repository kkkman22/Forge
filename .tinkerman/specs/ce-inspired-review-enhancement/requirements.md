---
status: completed
feature: ce-inspired-review-enhancement
layout: requirements
created: 2026-06-04
tier: full
status_note: "R1 confidence as 0–1 float + 0.8 threshold (equiv to discrete 75 gate; 7500+ tests depend on it). R2 cross-reviewer +0.10. R3 adversarial-check. R5 Validation Pass delivered 2026-06-14: agents/validation-pass.md (independent verifier, no reviewer identity R5.3, model sonnet R5.7, returns {confirmed,reason,adjusted_confidence} R5.4) + src/review/validation-pass.ts (applyValidationResult downgrades P0→P1/P1→P2 R5.5/R5.6, applyValidationBatch, serializeValidationRecord to .tinkerman/progress/<slug>-review-validation.jsonl R5.8) + review instructions Full-tier wiring (R5.2) + review_enable_validation config flag. R6/R7 knowledge. R8 stable R-NNN (stable-ids.ts). R9 autofix routing (autofix-router.ts). R10 compact-safe (compact-safe.ts). All 10 requirements delivered."
---
# Requirements Document — CE-Inspired Review Enhancement

## 引言

深度调研 Every Inc 的 [compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin)（以下简称 CE）后，识别出 10 项可借鉴的创新模式。本 spec 从中选取 **5 项最高 ROI 的改进**落地到 Forge 的 `/forge review` 和 `/forge learn` 流程：

1. **置信度锚定 + 跨 reviewer 协议提升**：降低 review 假阳性
2. **对抗性审查 agent（adversarial-check）**：捕获系统级组合失败
3. **Model 分层降本**：review 阶段 token 成本降低 40–60%
4. **双轨知识系统 + 重叠检测**：知识库质量提升
5. **独立验证通道（validation pass）**：抗 persona 偏见

CE 是一个 37+ skills / 50+ agents 的大型开源项目，其 `ce-code-review` 的 6 阶段 pipeline（Scope → Intent → Select → Spawn → Merge/Dedup → Synthesize）和 5 级置信度锚定系统是业界领先的 multi-agent review 参考实现。Forge 在纪律性（铁律、三振出局、fallback ladder）和状态管理（`.tinkerman/` 三区）方面已超越 CE，但在 review 精细度和知识系统深度上有差距。

**本 spec 的范围**：仅改造 `forge-review`（含 3 个现有 agent + 1 个新 agent）和 `forge-learn`（知识提取流程），不涉及 plan / build / ship 等其他阶段。

**不在范围内**：
- CE 的 Strategy 锚定物（`STRATEGY.md`）——独立 spec
- CE 的 `/ce-optimize` 迭代优化循环——独立 spec
- CE 的 `/ce-brainstorm` 需求发现——与 `/forge decide` 重叠
- CE 的 `/ce-debug` 因果链追踪——已有 `/forge debug`
- CE 的跨平台支持（Codex / Cursor / Copilot）——Forge 是 Claude Code only
- Plugin 分发机制——独立 spec

## 术语表

- **Confidence_Anchor**：CE 发明的 5 级离散置信度系统（0, 25, 50, 75, 100），每个 finding 必须标注其置信度等级。与 Forge 现有的 P0/P1/P2/P3 严重度正交——一个 finding 同时拥有 severity 和 confidence 两个维度。
- **Cross_Reviewer_Promotion**：当 2+ 个独立 reviewer 标记同一问题（通过 `normalize(file) + line_bucket(±3) + normalize(title)` 去重判定），该 finding 的 confidence 自动提升一档（50→75, 75→100）。
- **Adversarial_Check**：新增的第四层 review agent。不检查已知模式，而是**构造失败场景**：假设违反、组合失败、级联构造、滥用案例。其定位是"其他三个 reviewer 之间的空间"。
- **Model_Tier**：agent 级别的模型分层。高风险 reviewer（security-check、spec-check）使用高端模型（session model）；其他 reviewer（quality-check、adversarial-check）使用中端模型（sonnet）。
- **Validation_Pass**：merge 阶段后的独立验证环节。为每个存活 finding 分配一个全新的独立 sub-agent 重新检查，不携带原 reviewer 的分析视角。
- **Dual_Track_Knowledge**：`/forge learn` 的双轨知识提取。Bug 轨（debug 触发）：Problem → Symptoms → What Didn't Work → Solution → Why This Works → Prevention。知识轨（架构决策触发）：Context → Guidance → Why This Matters → When to Apply → Examples。
- **Overlap_Detection**：新知识与现有知识的重叠检测，按 5 个维度评分（问题描述、根因、解决方案、引用文件、预防规则），高重叠时更新而非重复创建。
- **Finding**：review 的单个发现，包含 `{id, title, severity, confidence, file, line, reviewer, evidence, suggested_fix, autofix_class, owner}` 的结构化对象。
- **Finding_ID**：稳定编号（如 `R-001`），按 severity → confidence → file → line 排序后分配，在 autofix 和 re-review 轮次中保持引用有效。
- **Autofix_Class**：四级自动修复路由：`safe_auto`（本地确定性，自动应用）、`gated_auto`（有修复但触及敏感边界）、`manual`（需人工）、`advisory`（仅报告）。

## Requirements

### Requirement 1: 置信度锚定系统

**User Story:** As a developer reviewing `/forge review` output, I want each finding to carry a confidence score so that I can prioritize high-confidence findings and ignore low-confidence noise, rather than treating every P2 with equal urgency.

#### 验收标准

1. THE `forge-review` merge 阶段 SHALL 定义一个 `Confidence_Anchor` 枚举，包含 5 个离散值：`0`（纯推测）、`25`（弱信号）、`50`（有证据但需假设）、`75`（证据充分）、`100`（机械验证）。
2. EVERY finding returned by any reviewer agent SHALL 包含一个 `confidence` 字段，值为 `Confidence_Anchor` 枚举之一。
3. EACH reviewer agent（spec-check, quality-check, security-check, adversarial-check）SHALL 在其 agent definition（`.claude/agents/*.md`）中包含 persona-specific 的置信度校准指南，明确什么证据对应什么 anchor level。
4. THE `security-check` agent SHALL 使用**较低的**有效阈值：confidence=50 且 severity=P0 的 finding SHALL 在最终报告中保留（不因低 confidence 被过滤）。
5. THE `quality-check` agent SHALL 使用**较高的**有效阈值：confidence≤50 的 P2/P3 finding SHALL 被抑制（标记为 `suppressed`），不出现在最终报告中。
6. THE merge 阶段 SHALL 实现一个 **confidence gate**：confidence < 75 的 finding 默认被抑制，但以下例外始终保留：
   - severity = P0 且 confidence ≥ 50
   - severity = P1 且 confidence ≥ 75
   - 被 Cross_Reviewer_Promotion 提升的 finding
7. THE review 报告输出 SHALL 在每个 finding 行显示 `[severity|confidence]` 标签（如 `[P0|75]`、`[P2|100]`），使用户一目了然。

### Requirement 2: 跨 Reviewer 协议提升

**User Story:** As a Forge maintainer, I want findings confirmed by multiple independent reviewers to carry higher confidence automatically, so that cross-validated issues are clearly distinguished from single-perspective concerns.

#### 验收标准

1. THE `forge-review` merge 阶段 SHALL 实现 finding 去重算法：当两个 finding 的 `normalize(file) + line_bucket(±3 lines) + normalize(title)` 匹配时，视为同一问题。
2. WHEN 2+ 个独立 reviewer 报告同一问题，THE merge 阶段 SHALL 将该 finding 的 confidence 提升一档（50→75, 75→100），并在报告中标注 `↑ cross-validated by N reviewers`。
3. WHEN reviewers 对同一问题的 severity 有分歧，THE merge 阶段 SHALL 取**最保守**的 severity（P0 > P1 > P2 > P3），并在报告中显示分歧来源（如 `security(P0), quality(P1) → kept P0`）。
4. THE 去重算法中的 `normalize(file)` SHALL 忽略 leading `./` 和 trailing whitespace；`normalize(title)` SHALL 转小写、移除标点、collapse whitespace。
5. THE 去重后的 finding SHALL 合并所有 reviewer 的 evidence 数组，按 reviewer 来源标注。

### Requirement 3: 对抗性审查 Agent（adversarial-check）

**User Story:** As a developer shipping a critical feature, I want a reviewer that actively tries to break my code through failure scenario construction, so that emergent failures from component interactions and assumption violations are caught before production.

#### 验收标准

1. THE project SHALL 新增一个 agent definition文件 `.claude/agents/adversarial-check.md`，注册为 `/forge review` 的第四层 reviewer。
2. THE adversarial-check agent SHALL 使用四种技术审查代码：
   - **假设违反**：代码对环境的假设（数据形状、时序、顺序、值域），构造假设被打破的场景
   - **组合失败**：跨组件边界交互中，每个组件独立正确但组合失败
   - **级联构造**：多步失败链（资源耗尽级联、状态腐败传播、恢复诱导失败）
   - **滥用案例**：看似正常的使用模式导致坏结果（重复滥用、时序滥用、并发修改、边界行走）
3. THE adversarial-check agent SHALL 根据变更规模动态调整审查深度：
   - **Quick**（<50 changed lines，无风险信号）：仅运行假设违反，最多 3 个 finding
   - **Standard**（50–199 changed lines 或有风险信号）：假设违反 + 组合失败 + 滥用案例
   - **Deep**（200+ changed lines 或高风险信号如 auth/payment/data mutation）：全部四种技术
4. THE adversarial-check agent SHALL 明确声明其**不覆盖**的范围：individual logic bugs（spec-check）、已知漏洞模式（security-check）、性能反模式（quality-check）、代码风格（quality-check）。
5. THE adversarial-check agent 的大部分 finding SHALL 默认为 `autofix_class: advisory` + `owner: human`——其定位是**为人类判断揭示风险**，不是自动修复。
6. THE adversarial-check agent SHALL 在 `/forge review` 的 Full tier 中默认启用；在 Standard tier 中仅当 diff ≥ 50 changed lines 或涉及高风险领域（auth、payment、data mutation、external API）时启用；在 Light tier 中不启用。
7. THE adversarial-check agent SHALL 使用 `model: sonnet`（Model_Tier 中端），不继承 session model。

### Requirement 4: Model 分层降本

**User Story:** As a Forge user paying for API tokens, I want the review stage to use expensive models only for high-stakes checks and cheaper models for routine quality checks, so that review costs drop without sacrificing critical finding quality.

#### 验收标准

1. THE Forge agent 系统 SHALL 支持 `model` frontmatter 字段，值为 `inherit`（继承 session model）或具体的模型标识（如 `sonnet`、`haiku`）。
2. THE reviewer agents SHALL 使用以下 model 分层：
   - `spec-check`：`model: inherit`（高风险，需求覆盖不能遗漏）
   - `security-check`：`model: inherit`（高风险，漏洞不能遗漏）
   - `quality-check`：`model: sonnet`（中等风险，命名/错误处理/性能检查）
   - `adversarial-check`：`model: sonnet`（中等风险，构造场景而非检查模式）
   - `validation-pass` agent：`model: sonnet`（验证不需要最强推理）
3. WHEN `model` 字段为 `inherit`，THE agent SHALL 使用调用者的 session model（如 Opus 4.8）。
4. WHEN `model` 字段为具体模型标识，THE Agent tool 调用 SHALL 使用 `model` 参数覆盖默认模型。
5. THE review 报告 SHALL 在 metadata 中记录每个 reviewer 使用的模型，方便成本审计。
6. IF 用户通过 `.tinkerman/config.md` 设置 `review_force_model: <model>`，THE 所有 reviewer SHALL 统一使用指定模型，忽略分层配置。

### Requirement 5: 独立验证通道（Validation Pass）

**User Story:** As a Forge maintainer, I want high-severity findings to be independently verified by a fresh agent with no commitment to the original reviewer's perspective, so that persona bias doesn't reach the final report.

#### 验收标准

1. THE `forge-review` merge 阶段后 SHALL 增加一个可选的 **Validation_Pass** 环节，为每个存活的 finding 分配一个独立的 validation sub-agent。
2. THE Validation_Pass SHALL 默认在 Full tier 的 review 中启用，在 Standard 和 Light tier 中跳过。
3. THE validation sub-agent SHALL 接收 finding 的 `title`、`severity`、`file`、`line`、`evidence`，但**不接收**原 reviewer 的 identity 和分析过程，以避免承诺效应。
4. THE validation sub-agent SHALL 返回 `{confirmed: boolean, reason: string, adjusted_confidence: Confidence_Anchor}`。
5. WHEN a P0 finding is **not confirmed** by the validation agent，THE finding SHALL 降级为 P1 并标注 `↓ validation: <reason>`。
6. WHEN a P1 finding is not confirmed，THE finding SHALL 降级为 P2 并标注 `↓ validation: <reason>`。
7. THE validation sub-agent SHALL 使用 `model: sonnet`（中端模型）。
8. THE validation 结果 SHALL 记录在 `.tinkerman/progress/<slug>-review-validation.jsonl` 中，供 `/forge learn` 追溯。

### Requirement 6: 双轨知识系统

**User Story:** As a developer using `/forge learn`, I want the system to automatically detect whether I'm documenting a bug fix or an architectural decision, and use the appropriate template, so that knowledge documents are consistently structured and actionable.

#### 验收标准

1. THE `/forge learn` SHALL 根据触发来源自动选择知识轨道：
   - **Bug 轨**：当触发源是 `/forge debug` 修复或 review 发现的 P0/P1 bug 时
   - **知识轨**：当触发源是架构决策、设计模式、工具选择时
   - 当无法判定时，使用知识轨作为默认
2. THE **Bug 轨**模板 SHALL 包含以下字段：
   - `problem`：问题描述（1–3 句）
   - `symptoms`：可观察的症状列表
   - `what_didnt_work`：尝试过但失败的方案
   - `solution`：最终解决方案
   - `why_this_works`：为什么这个方案有效
   - `prevention`：防止同类问题再次发生的规则
   - `root_cause`：根因分类（`logic_error` / `race_condition` / `off_by_one` / `null_propagation` / `state_corruption` / `assumption_violation` / `external_dependency`）
3. THE **知识轨**模板 SHALL 包含以下字段：
   - `context`：决策背景（为什么需要做这个决策）
   - `guidance`：具体指导（做什么、怎么做）
   - `why_this_matters`：为什么这个知识重要
   - `when_to_apply`：适用场景
   - `examples`：代码示例或参考文献
4. THE knowledge document YAML frontmatter SHALL 包含 `track` 字段（`bug` / `knowledge`）和 `problem_type` 字段（bug 轨使用 `build_error` / `test_failure` / `runtime_error` / `performance_issue` / `security_issue` / `logic_error` 等；知识轨使用 `architecture_pattern` / `design_pattern` / `tooling_decision` / `convention` / `best_practice` 等）。
5. THE `/forge learn` 输出 SHALL 与 Forge 现有的 5 维提取（问题模式、解决方案、踩坑记录、决策理由、可复用模式）兼容——新模板是现有格式的**结构化超集**，不是替代。

### Requirement 7: 知识重叠检测

**User Story:** As a Forge user whose knowledge base is approaching the 20-document limit, I want `/forge learn` to detect when new knowledge overlaps existing documents and update them instead of creating duplicates, so that the knowledge base stays lean and authoritative.

#### 验收标准

1. THE `/forge learn` SHALL 在创建新知识文档前，对 `.tinkerman/knowledge/solutions/` 中的现有文档执行 **Overlap_Detection**。
2. THE Overlap_Detection SHALL 按以下 5 个维度评分：
   - `problem_statement`：问题描述的重叠度
   - `root_cause`：根因或核心指导的重叠度
   - `solution_approach`：解决方案的重叠度
   - `referenced_files`：引用文件的重叠度
   - `prevention_rules`：预防规则的重叠度
3. EACH 维度 SHALL 评级为 `High` / `Moderate` / `Low`。
4. WHEN 3+ 维度为 `High`，THE 系统 SHALL **更新**现有文档（追加 `updated` 条目到 frontmatter，在正文中增加新发现），而不是创建新文档。
5. WHEN 1–2 维度为 `High` 且其余为 `Moderate`，THE 系统 SHALL 提示用户选择：更新现有 or 创建新文档。
6. WHEN 0 维度为 `High`，THE 系统 SHALL 创建新文档。
7. THE 更新现有文档时 SHALL 保留原始内容（追加而非替换），并更新 frontmatter 的 `updated` 日期和 `changelog` 条目。
8. IF 知识库已满（20 个文档）且新文档不与任何现有文档重叠，THE 系统 SHALL 提示用户选择：归档最旧/最低 confidence 的文档，或放弃本次学习。

### Requirement 8: 稳定发现编号

**User Story:** As a developer iterating on review findings across multiple rounds, I want finding IDs to remain stable so that I can reference "#R-003" consistently across autofix, re-review, and commit messages.

#### 验收标准

1. THE `forge-review` 报告 SHALL 为每个 finding 分配一个稳定 ID（格式 `R-NNN`，如 `R-001`、`R-015`）。
2. THE ID SHALL 按 severity 降序 → confidence 降序 → file 字典序 → line 升序 排列后分配。
3. THE ID SHALL 在同一 review session 内**永不重新编号**——即使 findings 在 autofix 过程中被修复或抑制，其余 findings 保持原 ID。
4. THE re-review 轮次 SHALL 保留上一轮的所有 finding IDs，新增 findings 追加新 ID（从上一轮最大 ID+1 开始）。
5. THE commit message 和 PR description 中引用 finding 时 SHALL 使用 `R-NNN` 格式（如 `fix(R-003): add null check for user input`）。

### Requirement 9: Autofix 路由系统

**User Story:** As a developer reviewing `/forge review` output, I want low-severity findings with clear fixes to be auto-applied while I focus on high-severity issues, so that review round-trip time drops.

#### 验收标准

1. THE `forge-review` SHALL 为每个 finding 标注 `autofix_class`：
   - `safe_auto`：本地、确定性修复（如 naming fix、missing import、trivial null check）
   - `gated_auto`：有具体修复但触及敏感边界（如 error handling change、refactor）
   - `manual`：需要人工判断（如架构决策、API 设计）
   - `advisory`：仅报告（如 adversarial findings、performance 建议）
2. WHEN 用户选择 autofix 模式（`/forge review --autofix` 或交互式选择），THE 系统 SHALL 自动应用所有 `safe_auto` finding 的修复。
3. THE `gated_auto` finding SHALL 在 autofix 模式下逐个展示给用户确认（accept/reject/edit），不被静默应用。
4. THE `manual` 和 `advisory` finding SHALL 不进入自动修复流程。
5. AFTER autofix 应用，THE 系统 SHALL 运行 `.tinkerman/config.md` 中 `ci_check_command` 指定的验证命令，确认修复未引入新问题。
6. IF 验证命令失败，THE autofix SHALL 被回滚（`git checkout` affected files），用户被告知哪些修复被回滚。
7. THE autofix 行为 SHALL 遵循 Forge 验证铁律（§2.3）：**没有运行验证命令 = 不能声明通过**。

### Requirement 10: Compact-Safe Review 模式

**User Story:** As a developer whose context window is approaching the limit during a long review session, I want the review to degrade gracefully to a compact-safe mode instead of failing or producing incomplete output.

#### 验收标准

1. THE `forge-review` SHALL 检测当前 context 大小（通过 `.tinkerman/config.md` 的 `context_budget` 配置或 heuristic）。
2. WHEN context 超过阈值（默认 100K tokens），THE review SHALL 自动切换到 **compact-safe mode**：
   - 跳过 Validation_Pass（节省 agent 调用）
   - 仅启用 spec-check 和 security-check（跳过 quality-check 和 adversarial-check）
   - Merge 阶段使用简化的去重算法（仅按 file+line 去重，不做 normalize）
   - 报告输出使用精简格式（每个 finding 仅显示 ID、severity、title、file:line）
3. WHEN compact-safe mode 被激活，THE 报告 SHALL 在开头标注 `⚠ Compact-safe mode — partial review`，列出被跳过的 reviewer。
4. THE compact-safe mode SHALL 不影响 confidence gate 的严格性——被抑制的 finding 标准不变。
