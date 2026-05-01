---
name: forge-review
description: "评审引擎。以 Subagent 并行模式运行三层独立评审（Spec 对齐、代码质量、安全与风险）。"
disable-model-invocation: true
---

# /forge review — 评审引擎

> **触发方式**：标准路径的第三步，全量路径的第五步，轻量路径的第二步，或用户直接输入 `/forge review`
> **职责**：独立于实现过程的三层评审，确保代码与规格对齐、质量达标且无安全风险
> **输出路径**：`.forge/reviews/<topic>.md`

---

## 1. Overview

`/forge review` 通过三层评审（Spec 对齐 → 代码质量 → 安全与风险）对 build 阶段的产出进行独立验证。评审通过独立 Subagent 并行运行，三个评审者各司其职、交叉验证，最终输出结构化的评审报告。

**核心原则**：执行与评估分离。写代码的人不评审自己的代码。build 阶段的 Agent 和 review 阶段的 Agent 是不同的角色，拥有不同的上下文和关注点。

---

**Not For**：
- 无代码变更（纯文档/配置）
- build 阶段尚未完成

## 2. Subagent Parallel Execution

使用 Agent tool 独立启动评审 Subagent，无需创建 Agent Team。

**成员**（3 个 Subagent）：

| Subagent Name | Definition File | Responsibility |
|---------|--------------|------|
| spec-check | `.claude/agents/spec-check.md` | Layer 1 — Spec Alignment Check |
| quality-check | `.claude/agents/quality-check.md` | Layer 2 — Code Quality Check |
| security-check | `.claude/agents/security-check.md` | Layer 3 — Security & Risk Check |

**启动方式**：

标准/全量路径（三层评审）— 并行启动 3 个 Subagent：
```
Agent(prompt="spec-check 评审指令", subagent_type="spec-check")
Agent(prompt="quality-check 评审指令", subagent_type="quality-check")
Agent(prompt="security-check 评审指令", subagent_type="security-check")
使用 Promise.allSettled 等待所有 Subagent 完成，确保单个失败不阻断其他评审。
```

轻量路径或无 Spec 模式 — 仅启动 quality-check + security-check 两个 Subagent。

**容错**：使用 `Promise.allSettled` 而非 `Promise.all`。失败 Subagent 记录错误，标注对应 Layer 为"评审失败"；全部失败则评审终止。

**输出不完整处理**：当 Subagent 返回但输出被截断（缺少结构化评审报告、只有片段文本、无法解析 severity 分布）时：

| 情况 | 处理 |
|------|------|
| 输出被截断但可解析部分发现 | 标注 `⚠️ Layer N — 输出不完整（已解析 X 个发现）`，使用已解析部分 |
| 输出被截断且无法解析 | 标注 `❌ Layer N — 评审输出不完整，需重新执行`，**重新启动该 Subagent**（最多重试 1 次） |
| 重试后仍不完整 | 标注 `⚠️ Layer N — 评审不完整（重试后仍截断）`，在报告中明确标注，**不得标记为"检查完成"** |

**禁止行为**：不得将截断的评审输出标记为"检查完成"或"无阻断问题"。不完整的评审 ≠ 通过的评审。如果无法获取完整评审结果，必须在报告中明确标注该 Layer 状态为 `incomplete`，并建议重新运行 `/forge review`。

**结果合并管线**：
1. `filterByConfidence` — 过滤置信度 < 0.8 的发现
2. `deduplicateFindings` — 指纹去重（±3 行容差）
3. `applyCrossValidation` — 跨评审者一致性验证（+0.10 置信度）

---

## 3. Three-Layer Review

### Reviewer Dynamic Selection

| Change Signal | Review Adjustment |
|---------|---------|
| 涉及认证/授权代码 | security-check 升级为深度审查（OWASP Top 10 逐条对照） |
| 涉及数据库 schema 变更 | quality-check 增加迁移一致性检查 |
| 涉及 API 接口变更 | spec-check 增加向后兼容性检查 |
| 涉及前端 UI 变更 | quality-check 增加可访问性检查 |
| 仅涉及内部重构 | spec-check 降级为快速扫描（无新需求时） |

### Layer 1 — Spec Alignment (spec-check)

**检查项**：

| Check Item | Description |
|--------|------|
| **需求覆盖** | Spec 中每个需求是否有对应实现 |
| **场景覆盖** | Spec 场景汇总表中每个场景是否有对应测试 |
| **Scope Creep** | 是否存在超出 Spec 范围的实现 |
| **Delta 一致性** | 棕地项目 Delta "不变"列表中的文件是否未被修改 |

**方法**：读取 Spec → 逐条对照代码变更确认实现 → 逐条对照测试确认覆盖 → 扫描识别 Scope Creep → 检查 Delta "不变"文件。

### Layer 2 — Code Quality (quality-check)

| Dimension | Check Content |
|------|---------|
| **命名一致性** | 变量、函数、类命名是否遵循项目约定 |
| **错误处理** | 未捕获异常、空 catch 块、缺失错误边界 |
| **性能热点** | N+1 查询、不必要循环、大数据量未分页、同步阻塞 |
| **测试覆盖率** | 新增代码是否有对应测试、边界条件是否覆盖 |
| **代码重复** | 可提取为公共函数的重复逻辑 |
| **可维护性** | 函数过长（>50 行）、嵌套过深（>3 层）、职责不单一 |

### Layer 3 — Security & Risk (security-check)

| Dimension | Check Content |
|------|---------|
| **硬编码密钥** | API Key、密码、Token、连接字符串 |
| **注入风险** | SQL 注入、XSS、命令注入、路径遍历 |
| **不安全依赖** | 已知漏洞、非可信源 |
| **权限边界** | 越权访问、缺失鉴权检查、过宽权限 |
| **敏感数据泄露** | 日志打印敏感信息、错误响应暴露内部细节 |

---

## 4. Severity Classification

→ 遵循 CLAUDE.md §3.3 P0/P1 必须修复。评审特定分级原则：安全问题默认 P0/P1；Spec 未实现为 P1，超出 Spec 为 P2；代码质量通常 P2/P3，影响正确性时升级。

---

## 5. Fix Routing Classification

| Fix Category | Default Handler | Description |
|---------|-----------|------|
| **safe_auto** | 评审者自动修复 | 局部确定性修复，不改变行为契约 |
| **gated_auto** | 开发者确认后修复 | 涉及行为/权限/契约变更，需确认 |
| **manual** | 开发者手动修复 | 需设计决策或上下文判断 |
| **advisory** | 仅记录 | 观察性输出、学习建议、残余风险 |

**路由规则**：P0/P1 只能 `gated_auto` 或 `manual`；P2 可 `safe_auto`（确定性修复时）；P3 默认 `advisory`。

---

## 6. Confidence Filtering

每个评审发现附带置信度评分（0.1-1.0）。**低于 0.8 的发现被过滤**。

| Confidence | Action |
|--------|------|
| ≥ 0.8 | 写入评审报告 |
| 0.5-0.7 | 记录到 `.forge/reviews/<topic>-low-confidence.md`，不阻断 |
| < 0.5 | 丢弃 |

**评审者输出格式**（每个发现使用 P5 证据链）：

```
[severity: P1] [confidence: 0.9] [fix: gated_auto]
文件：src/routes/export.ts 第 42 行
[Evidence] 代码：`router.get('/export', exportHandler)` — 无鉴权中间件
[Claim] 缺少鉴权中间件，任何用户都能访问导出接口
建议：添加 authMiddleware 到路由链
```

---

## 7. Finding Deduplication and Quality Gate

### 7.1 Finding Deduplication

**去重规则**：指纹 = `normalize(文件路径) + line_bucket(行号, ±3) + normalize(问题描述)`。匹配时合并，保留最高严重度、最高置信度、最保守修复路由，标注所有发现者。

**示例**：
```
合并前：
  [spec-check]    P1, conf 0.85, src/routes/export.ts:42 — 缺少错误处理
  [quality-check] P2, conf 0.90, src/routes/export.ts:43 — 异常未捕获导致 500
合并后：
  [spec-check, quality-check] P1, conf 0.90, src/routes/export.ts:42 — 缺少错误处理（异常未捕获导致 500）
```

### 7.2 Cross-Reviewer Consistency Validation

2 个以上独立评审者发现同一问题（去重后同一指纹有多个来源）→ **置信度提升 0.10**（上限 1.0）。独立收敛到同一问题是最强信号。输出标注 `↑` 表示跨评审者提升。

### 7.3 Report Quality Gate

输出最终报告前，对报告执行 **6 项质量自检**：

| # | Check Item | Action on Failure |
|---|--------|--------------|
| 1 | **可操作性** | 模糊建议改写为具体操作 |
| 2 | **误报排除** | 重新阅读上下文确认问题存在 |
| 3 | **严重度校准** | 风格标 P0 或安全标 P3 时重新校准 |
| 4 | **行号准确性** | 核对文件修正行号 |
| 5 | **不与 Linter 重复** | 删除 Linter 能捕获的发现 |
| 6 | **受保护文件** | 丢弃对 `.forge/` 状态文件的误标 |

任一项不通过则自动修正后重新检查，直到全部通过。

---

## 8. Gate: P0/P1 Present — Block `/forge ship`

**阻断输出**（示例）：
```
🚫 Ship 阻断：评审未通过

P0（阻塞发布）：
  1. [security-check] src/config/db.ts 第 12 行：硬编码数据库密码 → 使用环境变量替代

P1（高影响）：
  1. [spec-check] 需求 2 场景 S3 未实现 → 补充异步导出逻辑

请修复以上问题后运行 /forge review 重新评审。
```

**放行条件**：仅 P2/P3 时允许 `/forge ship`：
```
✅ 评审通过
P2: 1 个 | P3: 1 个（不阻塞发布）
可以继续执行 /forge ship，或先修复以上问题。
```

---

## 9. Review Report Format

**输出路径**：`.forge/reviews/<topic>.md`

**YAML Frontmatter**：

```yaml
---
topic: "<主题>"
date: "YYYY-MM-DD"
result: "pass" | "fail" | "incomplete"
reviewed_at_commit: "<git rev-parse HEAD>"
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 0
layers:
  spec_check: "pass" | "fail" | "skipped" | "incomplete"
  quality_check: "pass" | "fail" | "incomplete"
  security_check: "pass" | "fail" | "incomplete"
---
```

**正文结构**：三层 Layer 章节（各自含发现表格）+ 总结（结果 + 各级计数）。`result` 为 `pass`（无 P0/P1 且所有 Layer 完成）、`fail`（有 P0/P1）或 `incomplete`（有 Layer 未完成评审）。`incomplete` 状态**不允许进入 ship**，必须重新运行 `/forge review`。

---

## 10. Execution Flow

1. **前置检查**（§13）：检查 `.forge/` 目录、代码变更、锁定 Spec
2. **启动 Subagent 并行评审**：根据路径选择 3 个或 2 个 Subagent，`Promise.allSettled` 等待
3. **Subagent 状态确认**（Step 1.1）：跟踪每个 Subagent 状态，处理截断/错误/超时，确认全部返回
4. **合并管线**（§7）：`filterByConfidence` → `deduplicateFindings` → `applyCrossValidation`
5. **报告质量门**（§7.3）：6 项自检，不通过则自动修正
6. **P0/P1 判定**：存在则阻断 ship，不存在则通过
7. **输出报告**：写入 `.forge/reviews/<topic>.md` 并展示摘要。写入 frontmatter 时，执行 `git rev-parse HEAD` 获取当前 commit hash，填入 `reviewed_at_commit` 字段

### Step 0：前置检查

检查 `.forge/` 目录存在 → 检查代码变更 → 读取锁定 Spec 作为评审基准。

### Step 1：启动 Subagent 并行评审

通过 Agent tool 并行启动评审 Subagent（§2）。

**并发控制**：并行 Subagent 数量受 `.forge/config.md` 中 `max_parallel_agents`（默认 6）限制。收到 HTTP 429 时按降级策略减少并发数。详见 CLAUDE.md §6 Session Boundaries。

### Step 1.1：Subagent 状态确认

启动 Subagent 后，主 Agent **必须主动跟踪每个 Subagent 的状态**，不得假设"启动即完成"。

**状态跟踪协议**：

| 阶段 | 主 Agent 行为 |
|------|-------------|
| **启动后** | 确认每个 Subagent 已成功启动（收到启动确认），记录启动时间 |
| **等待中** | 等待所有 Subagent 的 completion notification。如果某个 Subagent 超过预期时间（默认 120s）未返回，输出 `⏳ Layer N — 评审 Subagent 仍在运行...` |
| **收到返回** | 逐个检查返回状态，按下方状态表处理 |
| **全部返回** | 确认 3 个（或 2 个）Subagent 全部返回后，才进入 Step 2 合并阶段 |

**Subagent 返回状态处理**：

| 返回状态 | 处理 |
|---------|------|
| **正常完成**（含结构化评审报告） | ✅ 提取发现，进入合并管线 |
| **完成但输出截断** | 按 §2 输出不完整处理规则执行（重试 1 次） |
| **错误退出**（异常/崩溃） | 标注 `❌ Layer N — 评审失败（错误：<原因>）`，重试 1 次 |
| **429 限流退出** | 按 CLAUDE.md §6 降级策略等待后重试，不计为评审失败 |
| **超时未返回** | 超过 180s 未收到 completion notification → 标注 `⚠️ Layer N — 评审超时`，不重试，标记为 `incomplete` |

**关键约束**：
- **不得在 Subagent 仍在运行时就开始合并结果**——必须等待所有 Subagent 返回或超时
- **不得跳过未返回的 Subagent**——未返回的 Layer 标记为 `incomplete`，不是 `pass`
- **每个 Layer 的最终状态必须明确**：`pass` / `fail` / `incomplete` / `skipped`，不允许模糊状态

### Step 2：合并与质量门

**前置条件**：Step 1.1 确认所有 Subagent 已返回（或超时标记为 incomplete）。

收集所有 Subagent 输出，执行发现合并管线（§7）。仅合并状态为"正常完成"的 Layer 的发现；`incomplete` 和 `failed` 的 Layer 不参与合并，但其状态会写入最终报告。

### Step 3：输出报告

写入 `.forge/reviews/<topic>.md`，展示摘要。

### Step 4：提示下一步

评审完成后**必须**输出下一步指引，不得静默结束：

| 评审结果 | 下一步提示 |
|---------|-----------|
| ✅ 通过（无 P0/P1） | `→ 下一步：/forge test`（标准/全量路径）或 `→ 下一步：/forge ship`（轻量路径） |
| 🚫 未通过（有 P0/P1） | `→ 请修复以上问题后运行 /forge review 重新评审` |

**路径判断**：从 `.forge/status.md` 的 `tier` 字段读取当前路径。轻量路径无 test 阶段，直接提示 ship。

**示例输出**（通过时）：
```
✅ 评审通过 | P0: 0 | P1: 0 | P2: 1 | P3: 0
→ 下一步：/forge test
```

---

## 11. Edge Case Handling

| Condition | Behavior |
|------|------|
| 无 Spec（轻量路径） | 不启动 spec-check，仅 quality-check + security-check，Layer 1 标注"已跳过" |
| 标准路径无 Spec | Plan 标注 `spec_ref: "none"` 时同轻量路径处理 |
| 无代码变更 | 提示：`⚠️ 未检测到代码变更。请先运行 /forge build` |
| 评审者输出过长 | 截断并提示完整报告见文件 |
| 无 `.forge/` 目录 | 提示先运行 `forge init` |

---

## 12. Examples

### Review Passed

```
$ /forge review

🔍 启动三层评审...
━━━ Layer 1 — Spec 对齐 ━━━ ✅ 所有 5 个场景均已实现，无 Scope Creep
━━━ Layer 2 — 代码质量 ━━━ P2: src/services/export.ts — 重复的日期校验逻辑
━━━ Layer 3 — 安全与风险 ━━━ ✅ 无安全问题
📋 评审结果：✅ 通过 | P0: 0 | P1: 0 | P2: 1 | P3: 0
报告已写入：.forge/reviews/order-batch-export.md
```

### Review Failed

```
$ /forge review

🔍 启动三层评审...
━━━ Layer 1 — Spec 对齐 ━━━ P1: 需求 2 场景 S3 未实现
━━━ Layer 2 — 代码质量 ━━━ P1: src/routes/export.ts — 缺少错误处理 | P2: src/services/export.ts — 重复逻辑
━━━ Layer 3 — 安全与风险 ━━━ P0: src/config/db.ts 第 12 行 — 硬编码数据库密码
📋 评审结果：🚫 未通过 | P0: 1 | P1: 2 | P2: 1 | P3: 0
🚫 Ship 阻断：存在 P0/P1 问题，必须修复后重新评审。
```

---

## 13. Pre-checks

在启动评审前逐条验证。**任一不满足则输出拒绝信息并路由到正确命令**。

### Checklist

| # | Check Item | Verification Method | Failure Route |
|---|---------|---------|-----------|
| 1 | **是否有代码变更待评审** | 检查 git diff 或 `.forge/progress/` 已完成 build 任务 | → `/forge build` |
| 2 | **build 阶段是否已完成** | 检查 `.forge/progress/` build 状态或 `status.md` current_phase | → `/forge build` |

### Rejection Output Format

```
🚫 评审前置检查未通过
命中检查：<检查条目名称>
证据：<文件路径、状态值或命令输出>
建议路由：<应先执行的命令>
重入条件：<满足什么条件后可重新运行 /forge review>
```

**示例 — 无代码变更**：
```
🚫 评审前置检查未通过
命中检查：是否有代码变更待评审
证据：git diff 为空，.forge/progress/ 中无已完成的 build 任务
建议路由：/forge build — 先完成代码实现
重入条件：build 阶段完成并产出代码变更后，重新运行 /forge review
```

其他不通过情况（build 未完成等）使用相同格式，替换对应字段。

### Autonomous Mode Behavior

前置检查不通过时返回 JSON：`{ success: false, summary, evidence, suggested_route, reentry_condition }`，触发 Forge Loop 的 `soft_failure` 处理。

---

## Context Budget Management

| Information Source | Lifecycle | Pruning Strategy |
|--------|---------|---------|
| 评审者完整输出 | Write-and-discard | 写入 `.forge/reviews/<topic>.md`，context 只保留摘要 |
| 评审结果摘要 | Ephemeral | Review_Summarizer：severity 分布 + findings 列表 + 文件路径引用，≤400 tokens |

**函数调用**：`serializeReviewSummary(summary)`
- 参数：`summary` — 评审者输出（需解析为 `ReviewSummary` 类型，包含 severity 分布、findings 列表、文件路径）
- 返回：结构化摘要字符串（≤400 tokens）
- 用途：替换 context 中的评审完整输出。评审者完整输出写入 `.forge/reviews/<topic>.md` 后，context 中仅保留此摘要

零 findings 时保留单行确认消息。

---

## 14. Known AI Failure Modes

> 逐条对照以下列表，确认没有正在犯这些错误。

| # | Failure Mode | Wrong Behavior | Correct Approach |
|---|---------|---------|---------|
| 1 | 全 PASS 无建议 | 每项标"通过"，无具体改进建议 | 即使质量高也应提 P2/P3 建议；确实无问题需说明检查了哪些维度及理由 |
| 2 | 只看风格不看逻辑 | 仅报告命名/缩进/注释格式，忽略逻辑正确性和安全风险 | 优先检查逻辑和安全（Layer 1/3），语义问题数量应多于风格问题 |
| 3 | 模板未填充 | 保留占位符文本或复制 SKILL.md 示例作为实际结果 | 每行基于实际代码变更，文件路径/行号/描述必须真实 |
| 4 | 不读 Spec 就评审 | 跳过 `.forge/specs/`，基于"代码看起来合理"评审 | 先读取 Spec 提取需求场景，逐条对照代码变更；轻量路径明确标注"已跳过" |

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "测试都过了代码肯定没问题" | 测试通过是必要条件不是充分条件。测试不检查架构问题、安全漏洞和可读性 |
| "是我自己写的代码我知道没问题" | 作者对自己的假设是盲目的。每个变更都受益于另一双眼睛 |
| "AI 生成的代码应该没问题" | AI 代码需要更多审查而非更少。它自信且看似合理，即使是错的 |
