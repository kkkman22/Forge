---
description: "Use when running `/forge review`, build completes, or code changes need quality gate before ship"
updated: 2026-06-05

dispatch_mode: fork
allowed_tools:
  - Read
  - Agent
  - Bash
---

## Current Context

Branch: !`git branch --show-current`
Recent commits: !`git log --oneline -5 2>/dev/null || echo "no commits"`
Diff stat: !`git diff --stat HEAD~1 2>/dev/null || echo "no diff"`

# /forge review — 评审引擎

> **触发**：标准路径第三步 / 全量路径第五步 / 轻量路径第二步 / 直接输入 `/forge review`
> **输出**：`.forge/reviews/<topic>.md`

## CLI Parameters

| Flag | Description | Default |
|------|-------------|---------|
| `--autofix` | Enable auto-fix mode: apply safe_auto fixes one at a time with CI verification, gated_auto fixes with user confirmation | Disabled |
| `--no-validation` | Skip Validation Pass even in Full tier | Validation enabled for Full tier |
| `--compact-safe` | Force compact-safe mode: skip quality-check + adversarial-check, simplified dedup, reduced report format | Auto-detected from context budget |
| `--output-format=v1\|v2` | Report format. v2 includes `[severity\|confidence] R-NNN:` labels; v1 is legacy `P0:` prefix | v2 |
| `--from-pr <value>` | Resume review from PR context | — |

## 0. 从 PR 恢复

当用户以 `/forge review <pr-url-or-number>` 或 `/forge review --from-pr <value>` 调用时：

1. 运行 `node scripts/resume-from-pr.mjs <value>` 恢复上下文
2. 成功 → 基于 PR context 执行后续 review 流程
3. 失败 → 输出错误诊断 + 建议手动恢复步骤，中止 review

**复用现有实现**：`scripts/resume-from-pr.mjs` 不需要修改。

## 1. Overview

三层评审（Spec 对齐 → 代码质量 → 安全与风险）独立验证 build 产出。**核心原则**：执行与评估分离，写代码的人不评审自己的代码。

**Layer 4 — Frontend Check**（条件）：当项目包含 Vue/.vue 文件时，自动启动 frontend-check agent 进行 Tier A/B/C 审计。

## Delegation_Adapter

→ 详见 references/delegation-adapter.md（迁移指南：docs/slimming-migration.md）

**Not For**：无代码变更（纯文档/配置）、build 未完成。

### §1.5 Pre-flight: Branch Gate

调用 `runBranchGate({ skill: "review", mode, currentBranch, currentTask, pendingDeliveries, alreadyCheckedThisPhase, isCleanTree })`：
- `passed` / `skipped` → 继续后续 §
- `auto_fixed` → 输出 `✅ 已自动切换到 <newBranch>` 后继续
- `blocked` → 中止 skill，按 mode 输出对应提示
- `warned` → 输出警告但继续

默认严重度：block。可通过 `severityOverride` 覆盖。

## 1b. CI 证据接入

开始评审前检测 CI ultrareview 产物（`.forge/reviews/<pr>-ci.md`）。存在时读取 frontmatter 的 `severity_counts` 与 `## Findings`，在 summary 首行注明 CI 已覆盖；本地 finding 与 CI 匹配时加 `[confirmed-by-ci]` 前缀。CI 产物只读，本地评审不得修改。

→ 详见 references/ci-evidence-integration.md（完整检测脚本、前缀规则、缺失/存在分支处理）

## 2. Subagent Parallel Execution

**Persona 覆盖**：用户可在 `.claude/agents/` 下定义同名文件（spec-check.md、quality-check.md、security-check.md）覆盖默认评审标准。用户定义优先于 Forge 默认。

### 2.0 Diff Context Preparation（前置步骤）

在启动任何 Subagent 之前，编排层**必须**准备 diff 上下文。

**单一调用**：

```bash
node scripts/prepare-diff-context.mjs
```

脚本自动执行：

- 解析 BASE_BRANCH（`git merge-base main HEAD`，fallback `HEAD~1`）
- 取 diff stat 与原始 diff content
- 应用智能截断（按文件优先级 + 单文件 200 行 / 总量 1500 行上限，复用 `truncateDiffContent` pure function，零 MCP 依赖）
- 写入 `.forge/reviews/.diff-context.md`，含 frontmatter（`base/head/file_count/total_added/total_removed/truncated/source: shell_with_truncate_lib`）+ `## Diff Stat` + `## Diff Content`（含真实 unified diff hunk）

**禁止**手工拼接 narrative summary（如 "See forge_git output" / "Key changes: -..." 等）替代真实 patch hunk。脚本输出的 `## Diff Content` 段**必须**含 unified diff hunk 标记（`@@ ... @@` / `--- a/<path>` / `+++ b/<path>`）。如脚本不可用（构建未完成等极端情况）→ fallback shell：`git diff ${BASE_BRANCH}...HEAD | head -3000` 直接写入 `## Diff Content` 段，**绝不**替换为 narrative summary。

此文件作为 Subagent prompt 的一部分传入，消除 agent 逐文件 Read 的需求。截断后 agent 可对存疑项用 Read 深入验证（最多 3-5 次）。

→ 详见 references/diff-context-preparation.md（脚本契约、frontmatter 模板、`## Why Narrative Summary is Forbidden`）

使用 Agent tool 独立启动，无需 Agent Team。

### §2.0b Sandbox Advisory Checkpoint

Phase 1 advisory: **does not block**, only warns.

**Before reading any source file** during subagent execution, call `checkFilesystemPolicy(targetPath, 'read', sandboxConfig)`:

```
import { loadSandboxConfig, checkFilesystemPolicy } from "./sandbox-policy.js";
const sandboxConfig = loadSandboxConfig();
const result = checkFilesystemPolicy(targetPath, "read", sandboxConfig);
if (!result.allowed) {
  // Output warning, do NOT block the read
  console.warn(`⚠️ 沙箱策略建议阻止此操作：${result.reason}（Phase 1 advisory，不阻断）`);
}
```

**Trigger**: Any `Read` tool call targeting `src/`, `test/`, or other project files during subagent execution.
**Skip**: `.forge/` directory reads (reviews, specs, status) are exempt from sandbox checks.

| Subagent | Definition File | Layer |
|---------|--------------|------|
| spec-check | `.claude/agents/spec-check.md` | 1 — Spec Alignment |
| quality-check | `.claude/agents/quality-check.md` | 2 — Code Quality |
| security-check | `.claude/agents/security-check.md` | 3 — Security & Risk |
| frontend-check | `.claude/agents/frontend-check.md` | 4 — Frontend (conditional) |

**启动**：标准/全量路径按 `review.subagent_concurrency` 配置启动（默认 3，范围 1-10；可通过 `FORGE_REVIEW_CONCURRENCY` 环境变量覆盖），使用 `runSubagentsWithConcurrency`；轻量/无 Spec 模式仅 quality-check + security-check。**Layer 4**：检测到 `src/**/*.vue` 或 `package.json` 含 `vue` 时并行启动 frontend-check agent。**SDK 抽风时**（命中 `Error: No task found with ID` 等 task registry purge 现象，详见 `.forge/findings/agent-sdk-task-id-purge-2.1.143.md`）可临时设 `FORGE_REVIEW_CONCURRENCY=1` 完全串行。

**容错**：`Promise.allSettled` 等待。单个失败不阻断；全部失败则终止。失败 Layer 标注"评审失败"。

**Findings-Only 收集（Write-and-Discard）**：每个 Subagent 返回 findings-only 格式（severity table + `<!-- review-final -->` sentinel）。编排层收到后立即：
1. `Write` 完整 subagent 输出到 `.forge/reviews/<run-id>/<layer>.md`（L1-spec-check.md / L2-quality-check.md / L3-security-check.md）
2. Context 中只保留 severity 分布摘要（≤50 tokens/layer）：`L1: P0:0 P1:1 P2:0 P3:0 | L2: ... | L3: ...`
3. `run-id` 从 `git rev-parse --short HEAD` 生成

写入失败 → fallback：保留 findings table 在 context 中（不阻断评审），标注 `write_failed: true`。

### 2.1 Subagent 文件化返回处理

收到 subagent 结果后，按以下流程处理：

1. **解析摘要**：提取 `status` / `findings` / `p0` / `p1` / `report` 字段
2. **P0/P1 存在** → `Read report_path` 获取完整详情
3. **P0=0 且 P1=0** → **不读取**完整报告文件，仅基于摘要生成综合结论
4. 综合评审报告仍输出到 `.forge/reviews/<timestamp>-combined.md`

当 subagent 未遵循文件化返回协议（无 `report:` 字段）时，退化为原内联模式。

**截断处理**（`src/truncation-detection.ts`）：收到 subagent 结果后调用 `detectTruncation(layer, raw)` 检测 `<!-- REPORT_START -->` / `<!-- REPORT_END -->` 标记完整性。然后调用 `assessTruncationSeverity(results)` 判定全局降级策略：

| 截断层数 | 动作 | 行为 |
|---------|------|------|
| 0 | `proceed` | 正常流程 |
| 1 | `annotate` | 正常输出，该 Layer 标注 `[数据不完整]` |
| 2 | `warn` | 输出警告，建议重新运行 `/forge review` |
| 3 (全部) | `degrade` | 触发 Fallback Ladder L2 串行重试 |

`degrade` 降级时：按 L1 串行模式重试所有 truncated 层。重试结果仍经过 `detectTruncation` 验证。重试仍全部 truncated → 标记 methodology 为 `unavailable`，阻断 ship（L3）。

**合并管线**：`filterByConfidence` → `deduplicateFindings` → `applyCrossValidation`

## 2.5 Fallback Ladder

| Level | 评审者 | 触发条件 | 可信度 | 行为 |
|---|---|---|---|---|
| L0 | 三 subagent 并行（concurrency=N，默认 3）| 默认 | 高 | `methodology: subagent-parallel` |
| L1 | 三 subagent 串行（concurrency=1）| L0 全失败 | 高（同上，仅速度慢）| `methodology: subagent-serial`，自动重试 1 次 |
| L2 | CI ultrareview 异步证据 | L1 全失败 + `.forge/reviews/<pr>-ci.md` 存在 | 中 | `methodology: ci-evidence` |
| L3 | （无评审者）| L0+L1+L2 全部不可用 | — | `methodology: unavailable`、`result: blocked`、阻断 ship |

实现入口：`src/review.ts` 的 `runReviewFallbackLadder()`。

<HARD-GATE name="no-mainagent-review">

**主 Agent 在 fallback ladder 任一级失败后，禁止以以下 4 种形式接管评审**：

1. 直接 Read diff 自评：调用 Read/Grep/Bash 读源码并产出 finding
2. 调用本地工具自评：用 forge_git/forge_read 等 MCP 工具产出 finding
3. Skill 内联自评：通过 `Skill(forge, "review")` inline 路径再次进入 review SKILL 自评
4. 重写已有 subagent 报告：基于残缺 subagent output 拼凑完整 review 报告

违反此约束的 review 报告**自动判定为 invalid**，ship gate 拒绝放行。

唯一合法路径：L0 → L1 → L2 → L3。L3 之后由用户手工干预（修复 SDK / 等待上游 / 使用 `--force-skip-review` 逃生阀）。

理由：subagent 隔离的核心价值是 fresh context，不是身份。同一会话主 Agent 即使没 build 这块代码，也带有 build 阶段的上下文偏置，违反 §3.1 Execution-Assessment Separation 的设计意图。

</HARD-GATE>

## 3. Three-Layer Review

**动态选择**：认证代码 → security 深度 OWASP；DB schema → quality 加迁移检查；API 变更 → spec 加兼容性检查；前端 UI → quality 加可访问性；仅重构 → spec 快速扫描。

**Layer 1 — Spec 对齐**：需求覆盖、场景覆盖、Scope Creep、Delta "不变"文件、Spec Leak 再扫、Spec Health Check。方法：读 Spec → 逐条对照代码 → 逐条对照测试 → 扫描 Scope Creep → 检查 Delta → 调用 detectSpecLeak() 对 spec 再扫一次（防止开发过程倒灌，findings 报告为 P1）。If spec health verdict=degraded, add "spec re-validation" sub-item to Layer 1 checklist.

**Layer 2 — 代码质量**：命名一致性（调用 `runGlossaryCheck({ phase: 'review' })` 检查同一概念在多 finding 中的命名一致性）、错误处理、性能热点（N+1/未分页/同步阻塞）、测试覆盖率、代码重复、可维护性（>50行/嵌套>3层）。Commit order vs dependency graph consistency: when Plan contains dependsOn fields, verify commit sequence matches topological order (severe reversal → P2 finding).

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

## 8b. Post-Review Pipeline

三层 review 完成后，按以下顺序执行 post-review pipeline。遵循 §2.7 No Confirmation Between Steps 铁律：步骤间不暂停询问用户。

### Step 1: 三层 review（§2）

执行 §2 Subagent Parallel Execution（spec-check / quality-check / security-check）。完成后收集 findings。

### Step 2: P0/P1 处理

当三层 review 发现 P0 或 P1 findings 时：

1. **不自动 fix**：P0/P1 问题需人工审查，禁止自动执行 `/code-review --fix`
2. **输出修复建议**：包含 file:line、问题描述、建议修复方案
3. **标记 ship 阻断**：遵循 CLAUDE.md §3.3 P0/P1 Must Fix 铁律
4. **生成 P1 Fix Checklist**（§9）

`✅ Step 2 完成 — P0/P1 findings 输出，ship 阻断`

### Step 3: P2/P3 Auto-Fix

当三层 review 仅有 P2/P3 findings（无 P0/P1）时：

1. **自动执行 `/code-review --fix`**：调用 `/code-review --fix` 对 P2/P3 问题进行自动修复
2. **独立 commit**：fix 结果作为独立 commit：`fix(review): auto-fix P2/P3 findings from code-review`
3. **验证修复**：运行 `ci_check_command`（`.forge/config.md` 中配置，默认 `npm run check`）验证修复未引入新问题
4. **验证失败回退**：`npm run check` 失败时 → revert fix commit + 输出警告 + 保留 P2/P3 findings 不修复
5. **无变化时跳过**：`/code-review --fix` 未产生 diff 时 → 跳过 fix commit，继续
6. **记录**：fix 结果写入 `.forge/reviews/`

`✅ Step 3 完成 — P2/P3 auto-fix`

### Step 4: Post-Review Simplify

当三层 review 全部通过（无 P0/P1 且 P2/P3 已修复或无 findings）时：

1. **自动运行 `/simplify`**：以 cleanup-only 模式运行（不影响功能，仅做代码简化）
2. **独立 commit**：simplify 结果作为独立 commit：`refactor: simplify code after review`
3. **验证简化**：运行 `ci_check_command` 验证 simplify 未引入新问题
4. **验证失败回退**：`npm run check` 失败时 → revert simplify commit
5. **大量 diff 警告**：simplify 产生 diff 超过 50 行时 → commit 但输出 `⚠️ Simplify 产生大量 diff（<n> 行），建议人工审查。`
6. **无 findings 且 simplify 成功**：标记为"review 通过 + 代码优化完成"

`✅ Step 4 完成 — Post-review simplify`

### Pipeline 执行顺序

```
Post-Review Step 1: 三层 review（spec-check / quality-check / security-check）
    ↓
Post-Review Step 2: P0/P1 存在？→ 输出修复建议，阻断 ship（结束）
    ↓ (无 P0/P1)
Post-Review Step 3: P2/P3 存在？→ 自动 /code-review --fix + commit + 验证
    ↓ (全部通过)
Post-Review Step 4: 自动 /simplify + commit + 验证
    ↓
✅ Review 通过 + 代码优化完成
```

每步骤完成后输出 `✅ <步骤> 完成`，遵循 §2.7 不暂停询问。

## 9. P1 Fix Checklist

评审完成后，若存在 P0/P1 finding，则创建 `.forge/reviews/<topic>-checklist.md` 追踪修复状态。

**函数调用**: `createChecklist(findings)` — 参数：评审报告中所有 P0/P1 finding 数组；返回：`ChecklistEntry[]`（每项含 findingId、severity、filePath、lineNumber、description、status="unfixed"）；用途：生成实时追踪清单写入 `.forge/reviews/<topic>-checklist.md`

**函数调用**: `serializeChecklist(entries)` — 参数：`ChecklistEntry[]`；返回：Markdown 表格字符串；用途：持久化 checklist 到文件

**状态流转**: unfixed → in-progress → fixed → verified。`updateEntryStatus(entries, findingId, nextStatus)` 验证流转合法性（`VALID_TRANSITIONS`）。

**ship 门禁**: `allEntriesVerified(entries)` 为 false 时阻断 ship。

## 10. Review Report Format

`.forge/reviews/<topic>.md`。YAML frontmatter（topic/date/result/reviewed_at_commit/p0-p3_count/methodology/layers）+ 正文。methodology 缺省 `subagent-parallel`。

→ 详见 references/review-report-format.md（完整 Frontmatter 模板）

## 11. Execution Flow

1. **前置检查**（§15）→ 1.5. **Diff Context Preparation**（§2.0，写入 `.forge/reviews/.diff-context.md`）→ 2. **并行启动 Subagent**（prompt 包含 diff context 引用）→ 3. **状态确认** → 4. **合并管线** → 5. **质量门** → 6. **P0/P1 判定** → 7. **输出报告**（写入 frontmatter 时执行 `git rev-parse HEAD` 记录 `reviewed_at_commit`）→ 8. **生成 P1 Fix Checklist**（§9，存在 P0/P1 时）→ 9. **Post-Review Pipeline**（§8b）

**Step 1.1 状态确认**：主动跟踪每个 Subagent，不假设"启动即完成"。**完成判定只看两件事**：(a) 框架返回的 `status` 字段是否 `success`；(b) `output` 末尾是否带有 sentinel `<!-- review-final -->`（详见 references/final-report-contract.md）。**禁止**主 Agent 阅读或解析 subagent 的自然语言 `result` 文本来判断"是否完成"——历史事故中 subagent 把中间话（"Now let me check..."）作为 result 返回时，主 Agent 误判为"还在跑"并 idle 等待永远不来的通知。

正常完成（status=success + sentinel 存在）→ 进入管线；缺 sentinel → fallback ladder 自动重判为 `incomplete-report:missing-sentinel` 并触发 L1 重试，主 Agent 不需要也不应该自己处理；截断 → 重试 1 次；错误 → 重试 1 次；429 → 降级等待后重试；超时(180s) → 标记 `incomplete`。**不得在 Subagent 运行中合并结果**。

**Step 4 自动推进（铁律）**：通过 → **立即调用** `Skill(skill="forge", args="<next>")`，不输出确认提示。仅输出 `✅ review 通过 → 自动进入 <下一阶段>`，然后直接调用 Skill（→ 详见 shared/next-step-protocol.md）；未通过（存在 P0/P1）→ 输出报告和修复清单 → **立即**触发 `gated_auto` 流程（AskUserQuestion 询问用户是否自动修复全部 P0/P1）→ 用户确认后执行修复 → 修复完成自动 re-review。**禁止**输出问题清单后 idle 等待用户推动。静默 idle 与显式询问"是否继续"同罪。

## 12. Examples

**通过**：`✅ 通过 | P0:0 | P1:0 | P2:1 | P3:0` → **立即调用** `Skill(skill="forge", args="<next>")`，无确认提示（→ 详见 shared/next-step-protocol.md）
**失败**：`🚫 未通过 | P0:1 | P1:2 | P2:1 | P3:0` + Ship 阻断

## 13. Edge Cases

无 Spec → 不启动 spec-check，Layer 1 标注"已跳过"。无代码变更 → 提示先 build。无 `.forge/` → 提示 `/forge init`。输出过长 → 截断提示见文件。

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

评审者输出已改为 findings-only 格式（severity table only）。编排层在 §2 Findings-Only 收集步骤中 Write 到文件 + 丢弃原始输出。

**Context 预算（post findings-only）**：
- 每个 layer 的 context 占用：≤50 tokens（severity 分布摘要）
- 3 layers 合计：≤150 tokens（vs 原来 ~20k tokens）
- 完整报告路径：`.forge/reviews/<run-id>/L1-spec-check.md` / `L2-quality-check.md` / `L3-security-check.md`

**函数调用**: `serializeReviewSummary(reviewOutput)` — 参数：评审者 findings-only 输出（severity table）；返回：severity 分布摘要字符串（≤50 tokens）；用途：替换 context 中的 findings table

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

## Workflow Dispatch (R1)

When user triggers `/forge review`, follow this dispatch protocol for workflow eligibility:

### Dispatch Protocol

1. **Probe workflow eligibility** (5 conditions — all must pass for L0):
   - `process.env.CLAUDE_CODE_WORKFLOWS === '1'`
   - `mode === 'interactive'` (not autonomous/loop)
   - `${CLAUDE_PLUGIN_ROOT}/workflows/multi-agent-review.js` exists
   - `node --check` passes on workflow file
   - Concurrency bridge: `workflows/lib/concurrency.js` exists + reachable

2. **If all 5 pass → attempt L0**:
   ```
   import { createAuditWriter } from './workflow-audit-factory.js';
   const auditWriter = createAuditWriter(forgeRoot);
   Call WorkflowDispatcher.dispatch(ctx, { tryL0, runFallback, auditWriter })
   ```
   The dispatcher auto-fills 14 fields and writes `dispatch.jsonl` + updates `status.md`.

3. **If any probe fails OR L0 throws → fall back to L1**:
   ```
   runReviewFallbackLadder(...)  // existing subagent-parallel path
   ```
   Dispatcher records `chosen_level: L1` with `l1_trigger_reason` / `l0_failure_signature`.

4. **Dispatch record always written**: `.forge/runs/<runId>/dispatch.jsonl` with all 14 fields (handled by dispatcher, not SKILL).

5. **Status always updated**: `.forge/status.md` receives `dispatch_chosen_level`, `dispatch_subcommand`, `dispatch_run_id` (handled by dispatcher).

6. **No confirmation prompts**: Phase transitions follow §2.7 — `✅ review 完成 → 自动进入 <next>`.

### Reference

- Fallback ladder: `@.claude/rules/workflow-fallback-ladder.md`
- Dispatcher module: `src/workflow-dispatcher.ts`
- Audit writer module: `src/workflow-audit-writer.ts`

## 4.5 Known-failures Accumulation

After receiving three-layer review reports, forge-review SKILL:

1. Extracts all `known-failures append-block` from reviewer output
2. Reads `.forge/knowledge/known-failures.md` (creates if missing)
3. Calls `mergeKnownFailures(existing, newBlocks)` to dedup and merge
4. Writes result back to `.forge/knowledge/known-failures.md`
5. Outputs: `本次新增 N 条、更新 M 条 known-failures`

Retention: >100 entries triggers auto-archive to `.forge/archive/known-failures-<date>.md`, keeping latest 80.

## Read Dedup Iron Law

<IRON-LAW name="read-dedup">

在同一个 session 中对同一文件的 Read 调用**不得超过 2 次**。

- **第 2 次起**：必须使用 `forge_read_cached`（MCP tool）或 `Grep`（定向搜索）替代完整 Read。
- **回顾已读文件**：使用 Grep 搜索特定片段而非全量重读。

当 `forge_read_cached` MCP tool 不可用时，仍须手动控制同一文件 Read ≤2 次。

</IRON-LAW>

### Review 后 Context Budget 检查

Review 完成后，如果后续还有 test/ship 阶段且 Read 预算 >50KB（`${TMPDIR}/forge-read-budget-<session>.json`），输出：

`⚠️ Read budget >50KB after review. Suggest /clear + /forge resume before test phase.`

## Package-Aware Review

When execution packages exist, review MUST distinguish package-scoped and feature-scoped verdicts. A package-level review may pass only that package. A full-feature pass requires all execution packages to be completed.

Saved workflow backend: if `.claude/workflows/forge-review.js` is enabled and available, it MAY be used as L0 package-scoped review orchestration and MUST report `methodology: saved-workflow`. Fallback remains subagent-parallel, then subagent-serial, then unavailable/L3. Generic workflow names such as `multi-agent-review.js` are not production dispatch targets.
