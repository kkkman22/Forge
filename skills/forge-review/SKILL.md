---
name: forge-review
description: "Review build output through parallel subagents covering spec alignment, code quality, and security with P0/P1 ship-blocking severity classification. Use when running `/forge review`, build completes, or a multi-perspective code quality gate is needed before ship."
skeleton_exempt_legacy: true
disable-model-invocation: true
---

## Current Context

Branch: !`git branch --show-current`
Recent commits: !`git log --oneline -5 2>/dev/null || echo "no commits"`
Diff stat: !`git diff --stat HEAD~1 2>/dev/null || echo "no diff"`

# /forge review — 评审引擎

> **触发**：标准路径第三步 / 全量路径第五步 / 轻量路径第二步 / 直接输入 `/forge review`
> **输出**：`.forge/reviews/<topic>.md`

## 1. Overview

三层评审（Spec 对齐 → 代码质量 → 安全与风险）独立验证 build 产出。**核心原则**：执行与评估分离，写代码的人不评审自己的代码。

**Layer 4 — Frontend Check**（条件）：当项目包含 Vue/.vue 文件时，自动启动 frontend-check agent 进行 Tier A/B/C 审计。

## Delegation_Adapter

> 引用 `skills/shared/native-command-matrix.md` 获取完整配置

**Forge review = (可选) `/code-review` + `/security-review` + (始终) Spec_Alignment_Review**

### Delegation Flags

| Flag | Default | Effect |
|------|---------|--------|
| `--delegate-quality` | auto-detect | 委托 Layer 2 (代码质量) 给 `/code-review` |
| `--delegate-security` | auto-detect | 委托 Layer 3 (安全) 给 `/security-review` |

Auto-detect 逻辑：探测 `claude --version` ≥ 2.0.0 且对应 Native_Command 存在 → true；否则 false。

### 三层委托模型

| Layer | 委托时 | 未委托时 |
|-------|--------|----------|
| Layer 1 — Spec_Alignment_Review | **始终由 Forge 执行**（核心差异化） | 同左 |
| Layer 2 — 代码质量 | 调用 `/code-review`，消费 findings | Forge 内建 quality-check subagent |
| Layer 3 — 安全 | 调用 `/security-review`，消费 findings | Forge 内建 security-check subagent |

### 合并规则

1. Native_Command 成功 → 消费 findings + 执行 Forge Spec_Alignment_Review → 合并输出
2. Native_Command 失败(exit ≠ 0) → abort 委托层，回退到内建 subagent
3. 合并输出每条 finding 含 `source` 字段：`"claude:code-review"` | `"claude:security-review"` | `"forge:spec-alignment"`
4. `merged_summary.P0_blockers` 只计入 `source = "forge:spec-alignment"` 的 P0 条目

### 输出 Schema 扩展

```yaml
sources:
  - source: "claude:code-review"
    invocation: "/code-review"
    exit_code: 0
    findings_count: N
  - source: "forge:spec-alignment"
    invocation: "subagent:architect"
    exit_code: 0
    findings_count: N
```

**向后兼容**：原有 `.forge/reviews/*.md` 字段全部保留，`sources` 为新增字段。

### Fallback

版本不满足时：使用内建 subagent + emit Deprecation_Notice。

**Not For**：无代码变更（纯文档/配置）、build 未完成。

## 1b. CI 证据接入

开始评审前，检查是否存在 CI ultrareview 产物：

```bash
PR_NUMBER=$(git log -1 --format=%s | grep -oE '#[0-9]+' | head -1 | tr -d '#')
CI_REVIEW=".forge/reviews/${PR_NUMBER}-ci.md"
[ -f "$CI_REVIEW" ] && head -100 "$CI_REVIEW"
```

如果存在：
- 读取 frontmatter 的 `severity_counts`
- 读取 `## Findings` 各严重度列表
- 在本次评审的 summary 中首行注明："CI 评审已覆盖 N 条 finding，本地评审将补充对齐 spec 与 ADR 的深度检查"

如果不存在：按原有流程进行，不报警告。

**`[confirmed-by-ci]` 前缀规则**：当本地发现的 finding 与 CI 产物中的 finding 匹配（`file_path` 与 `category` 相同）时，输出格式为：

```
- **[confirmed-by-ci] src/foo.ts:42** — <本地描述>
```

不匹配的本地 finding 不加前缀。

**CI 产物只读**：`.forge/reviews/<pr>-ci.md` 不得被本地 `/forge review` 修改。

## 2. Subagent Parallel Execution

**Persona 覆盖**：用户可在 `.claude/agents/` 下定义同名文件（spec-check.md、quality-check.md、security-check.md）覆盖默认评审标准。用户定义优先于 Forge 默认。

使用 Agent tool 独立启动，无需 Agent Team。

| Subagent | Definition File | Layer |
|---------|--------------|------|
| spec-check | `.claude/agents/spec-check.md` | 1 — Spec Alignment |
| quality-check | `.claude/agents/quality-check.md` | 2 — Code Quality |
| security-check | `.claude/agents/security-check.md` | 3 — Security & Risk |
| frontend-check | `.claude/agents/frontend-check.md` | 4 — Frontend (conditional) |

**启动**：标准/全量路径并行启动 3 个（`Promise.allSettled`）；轻量/无 Spec 模式仅 quality-check + security-check。**Layer 4**：检测到 `src/**/*.vue` 或 `package.json` 含 `vue` 时并行启动 frontend-check agent。

**容错**：`Promise.allSettled` 等待。单个失败不阻断；全部失败则终止。失败 Layer 标注"评审失败"。

**截断处理**：可解析部分发现 → 标注不完整并使用已解析部分；无法解析 → 重试 1 次；重试仍失败 → 标注不完整，**不得标记为"检查完成"**。

**合并管线**：`filterByConfidence` → `deduplicateFindings` → `applyCrossValidation`

## 3. Three-Layer Review

**动态选择**：认证代码 → security 深度 OWASP；DB schema → quality 加迁移检查；API 变更 → spec 加兼容性检查；前端 UI → quality 加可访问性；仅重构 → spec 快速扫描。

**Layer 1 — Spec 对齐**：需求覆盖、场景覆盖、Scope Creep、Delta "不变"文件、Spec Leak 再扫。方法：读 Spec → 逐条对照代码 → 逐条对照测试 → 扫描 Scope Creep → 检查 Delta → 调用 detectSpecLeak() 对 spec 再扫一次（防止开发过程倒灌，findings 报告为 P1）。

**Layer 2 — 代码质量**：命名一致性、错误处理、性能热点（N+1/未分页/同步阻塞）、测试覆盖率、代码重复、可维护性（>50行/嵌套>3层）。

**Layer 3 — 安全与风险**：硬编码密钥、注入风险（SQL/XSS/命令/路径遍历）、不安全依赖、权限边界、敏感数据泄露。

**Layer 4 — Frontend Check**（条件触发）：Vue3 WCAG 无障碍、Core Web Vitals、路由稳定性、Console 告警。三档降级策略：Tier A 静态 grep（必跑）→ Tier B cmux browser + axe-core（条件跑）→ Tier C chrome-devtools MCP（条件跑）。→ 详见 agents/frontend-check.md

## 4. Severity Classification

遵循 CLAUDE.md §3.3。评审特定原则：安全问题默认 P0/P1；Spec 未实现 = P1，超出 Spec = P2；质量通常 P2/P3，影响正确性时升级。

## 5. Fix Routing Classification

| Category | Handler | When |
|---------|-----------|------|
| **safe_auto** | 评审者自动修复 | 局部确定性修复 |
| **gated_auto** | 开发者确认后修复 | 行为/权限/契约变更 |
| **manual** | 开发者手动 | 需设计决策 |
| **advisory** | 仅记录 | 观察/学习/残余风险 |

P0/P1 只能 `gated_auto`/`manual`；P2 可 `safe_auto`；P3 默认 `advisory`。

## 6. Confidence Filtering

发现附带置信度（0.1-1.0），低于 0.8 过滤。输出使用 P5 证据链。→ 详见 references/confidence-filtering.md

## 7. Deduplication & Quality Gate

去重 + 跨评审者一致性验证 + 6 项报告质量自检。→ 详见 references/dedup-pipeline.md、references/quality-gate.md

## 7b. Evolution 沉淀（新模式 / 已知失败命中）

评审收尾时调用 `buildReviewEvolutionArtifacts(input, now, seq)`（`src/review.ts`）产出两类产物：`newPatternSituation` 非空 → 写 failure episode 到 `sessions/` 并在 review 报告末尾追加 Evolution 标记（target=`forge-review#new_review_pattern`）；`matchedFailurePattern` 非空 → 驱动层按返回的 `patternUpdate` 调 `updatePatternStats(pattern, "success")`。所有写入失败降级为 `console.warn`，不阻断 ship 判定。

## 7c. Compaction Recovery Check

IF 本次执行是从 conversation summary 恢复（上下文压缩后继续），THEN：
1. 重新读取本 SKILL.md 完整内容
2. 确认 §2 Subagent Parallel Execution 的三层评审配置完整（spec-check + quality-check + security-check）
3. 确认 §7 Quality Gate 评估已执行
4. 从中断点继续执行

正常流程（无 compaction）忽略此段落。

## 8. Gate: P0/P1 → Block `/forge ship`

<HARD-GATE name="p0-p1-block-ship">

有 P0/P1 → 阻断 ship，输出问题清单，提示修复后重新评审。仅 P2/P3 → 放行。

</HARD-GATE>

## 9. P1 Fix Checklist

评审完成后，若存在 P0/P1 finding，则创建 `.forge/reviews/<topic>-checklist.md` 追踪修复状态。

**函数调用**: `createChecklist(findings)` — 参数：评审报告中所有 P0/P1 finding 数组；返回：`ChecklistEntry[]`（每项含 findingId、severity、filePath、lineNumber、description、status="unfixed"）；用途：生成实时追踪清单写入 `.forge/reviews/<topic>-checklist.md`

**函数调用**: `serializeChecklist(entries)` — 参数：`ChecklistEntry[]`；返回：Markdown 表格字符串；用途：持久化 checklist 到文件

**状态流转**: unfixed → in-progress → fixed → verified。`updateEntryStatus(entries, findingId, nextStatus)` 验证流转合法性（`VALID_TRANSITIONS`）。

**ship 门禁**: `allEntriesVerified(entries)` 为 false 时阻断 ship。

## 10. Review Report Format

`.forge/reviews/<topic>.md`。YAML frontmatter（topic/date/result/reviewed_at_commit/p0-p3_count/layers）+ 正文。

→ 详见 references/review-report-format.md（完整 Frontmatter 模板）

## 11. Execution Flow

1. **前置检查**（§15）→ 2. **并行启动 Subagent** → 3. **状态确认** → 4. **合并管线** → 5. **质量门** → 6. **P0/P1 判定** → 7. **输出报告**（写入 frontmatter 时执行 `git rev-parse HEAD` 记录 `reviewed_at_commit`）→ 8. **生成 P1 Fix Checklist**（§9，存在 P0/P1 时）

**Step 1.1 状态确认**：主动跟踪每个 Subagent，不假设"启动即完成"。正常完成 → 进入管线；截断 → 重试 1 次；错误 → 重试 1 次；429 → 降级等待后重试；超时(180s) → 标记 `incomplete`。**不得在 Subagent 运行中合并结果**。

**Step 4 自动推进（铁律）**：通过 → **立即调用** `Skill(skill="forge", args="<next>")`，不输出确认提示。仅输出 `✅ review 通过 → 自动进入 <下一阶段>`，然后直接调用 Skill（→ 详见 shared/next-step-protocol.md）；未通过 → 输出问题清单，停止等待用户修复后重新评审。

## 12. Examples

**通过**：`✅ 通过 | P0:0 | P1:0 | P2:1 | P3:0` → **立即调用** `Skill(skill="forge", args="<next>")`，无确认提示（→ 详见 shared/next-step-protocol.md）
**失败**：`🚫 未通过 | P0:1 | P1:2 | P2:1 | P3:0` + Ship 阻断

## 13. Edge Cases

无 Spec → 不启动 spec-check，Layer 1 标注"已跳过"。无代码变更 → 提示先 build。无 `.forge/` → 提示 `forge init`。输出过长 → 截断提示见文件。

## 14. Canvas Output (`--canvas`)

**Flag**: `/forge review --canvas <topic>`

生成可视化评审 Canvas — 单页深色 HTML 三栏布局（Spec / Quality / Security），嵌入 findings 数据为安全 JSON island。可选 Bitbucket MCP 富化（失败时优雅降级）。→ 详见 references/canvas.md

**触发条件**：review 通过后自动生成，或用户显式指定 `--canvas`。

**输出**：`.forge/reviews/<topic>.canvas.html`

## 15. Pre-checks

| # | Check | Failure Route |
|---|-------|-----------|
| 1 | 有代码变更待评审 | → `/forge build` |
| 2 | build 阶段已完成 | → `/forge build` |

不通过 → 拒绝输出（命中检查 + 证据 + 建议路由 + 重入条件）。Autonomous 模式返回 JSON 触发 `soft_failure`。

## 16. Context Budget Management

评审者完整输出 → Write-and-discard（写入文件，context 只保留摘要）。摘要使用 Review_Summarizer 协议：severity 分布 + findings 列表 + 文件路径引用，≤400 tokens。

**函数调用**: `serializeReviewSummary(reviewOutput)` — 参数：评审者输出（先解析为 `ReviewSummary`）；返回：摘要字符串；用途：替换 context 中的评审完整输出

→ 函数签名详见 references/function-contracts.md

## 17. Known AI Failure Modes

| # | Failure Mode | Correct Approach |
|---|---------|---------|
| 1 | 全 PASS 无建议 | 即使高质量也应提 P2/P3；无问题需说明检查维度及理由 |
| 2 | 只看风格不看逻辑 | 优先逻辑和安全，语义问题应多于风格问题 |
| 3 | 模板未填充 | 每行基于实际代码，路径/行号/描述必须真实 |
| 4 | 不读 Spec 就评审 | 先读 Spec 逐条对照；轻量路径标注"已跳过" |

## Common Rationalizations

| 合理化 | 反驳 |
|---|---|
| "测试都过了没问题" | 测试不查架构/安全/可读性 |
| "我自己写的没问题" | 作者对自身假设盲目 |
| "AI 代码应该没问题" | AI 代码需更多审查，自信且看似合理即使是错的 |

## 18. Background Subagent Notes [R11.4, R11.5, R11.7]

quality-check and security-check run as `background: true` agents [R11.1]. spec-check runs foreground.

- **Permission pre-approval**: background agents receive pre-approved tool list
- **Ctrl+B fallback**: if background mode unavailable, agents fall back to foreground
- **Legacy compat**: older Claude Code versions ignore `background` field gracefully
- **Failure handling**: background agent failure marked as `failed`, not abort. Markdown output schema unchanged [R11.6]

## Gotchas
- **Self-review**: Agent reviews own code → blind spots → review uses independent subagents, never same agent that wrote code
- **Checklist fatigue**: Too many check items → agent skims, misses critical ones → prioritize P0/P1 items, group P2/P3
- **Worktree-only evidence**: Review finds file exists in worktree → claims implemented → verify on main branch, not worktree
- **Stale review**: Review at commit A, code changes to commit B → review invalid → record reviewed_at_commit, warn on diff
