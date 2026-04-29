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

## 1. 概述

`/forge review` 通过三层评审（Spec 对齐 → 代码质量 → 安全与风险）对 build 阶段的产出进行独立验证。评审通过独立 Subagent 并行运行，三个评审者各司其职、交叉验证，最终输出结构化的评审报告。

**核心原则**：执行与评估分离。写代码的人不评审自己的代码。build 阶段的 Agent 和 review 阶段的 Agent 是不同的角色，拥有不同的上下文和关注点。

---

## 2. Subagent 并行执行

使用 Agent tool 独立启动评审 Subagent，无需创建 Agent Team。

**成员**（3 个 Subagent）：

| Subagent 名称 | 定义文件 | 职责 |
|---------|--------------|------|
| spec-check | `.claude/agents/spec-check.md` | Layer 1 — Spec 对齐检查 |
| quality-check | `.claude/agents/quality-check.md` | Layer 2 — 代码质量检查 |
| security-check | `.claude/agents/security-check.md` | Layer 3 — 安全与风险检查 |

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

**结果合并管线**：
1. `filterByConfidence` — 过滤置信度 < 0.8 的发现
2. `deduplicateFindings` — 指纹去重（±3 行容差）
3. `applyCrossValidation` — 跨评审者一致性验证（+0.10 置信度）

---

## 3. 三层评审

### 评审者动态选择

| 变更信号 | 评审调整 |
|---------|---------|
| 涉及认证/授权代码 | security-check 升级为深度审查（OWASP Top 10 逐条对照） |
| 涉及数据库 schema 变更 | quality-check 增加迁移一致性检查 |
| 涉及 API 接口变更 | spec-check 增加向后兼容性检查 |
| 涉及前端 UI 变更 | quality-check 增加可访问性检查 |
| 仅涉及内部重构 | spec-check 降级为快速扫描（无新需求时） |

### Layer 1 — Spec 对齐（spec-check）

**检查项**：

| 检查项 | 说明 |
|--------|------|
| **需求覆盖** | Spec 中每个需求是否有对应实现 |
| **场景覆盖** | Spec 场景汇总表中每个场景是否有对应测试 |
| **Scope Creep** | 是否存在超出 Spec 范围的实现 |
| **Delta 一致性** | 棕地项目 Delta "不变"列表中的文件是否未被修改 |

**方法**：读取 Spec → 逐条对照代码变更确认实现 → 逐条对照测试确认覆盖 → 扫描识别 Scope Creep → 检查 Delta "不变"文件。

### Layer 2 — 代码质量（quality-check）

| 维度 | 检查内容 |
|------|---------|
| **命名一致性** | 变量、函数、类命名是否遵循项目约定 |
| **错误处理** | 未捕获异常、空 catch 块、缺失错误边界 |
| **性能热点** | N+1 查询、不必要循环、大数据量未分页、同步阻塞 |
| **测试覆盖率** | 新增代码是否有对应测试、边界条件是否覆盖 |
| **代码重复** | 可提取为公共函数的重复逻辑 |
| **可维护性** | 函数过长（>50 行）、嵌套过深（>3 层）、职责不单一 |

### Layer 3 — 安全与风险（security-check）

| 维度 | 检查内容 |
|------|---------|
| **硬编码密钥** | API Key、密码、Token、连接字符串 |
| **注入风险** | SQL 注入、XSS、命令注入、路径遍历 |
| **不安全依赖** | 已知漏洞、非可信源 |
| **权限边界** | 越权访问、缺失鉴权检查、过宽权限 |
| **敏感数据泄露** | 日志打印敏感信息、错误响应暴露内部细节 |

---

## 4. 严重度分级

→ 遵循 CLAUDE.md §3.3 P0/P1 必须修复。评审特定分级原则：安全问题默认 P0/P1；Spec 未实现为 P1，超出 Spec 为 P2；代码质量通常 P2/P3，影响正确性时升级。

---

## 5. 修复路由分类

| 修复类别 | 默认处理者 | 含义 |
|---------|-----------|------|
| **safe_auto** | 评审者自动修复 | 局部确定性修复，不改变行为契约 |
| **gated_auto** | 开发者确认后修复 | 涉及行为/权限/契约变更，需确认 |
| **manual** | 开发者手动修复 | 需设计决策或上下文判断 |
| **advisory** | 仅记录 | 观察性输出、学习建议、残余风险 |

**路由规则**：P0/P1 只能 `gated_auto` 或 `manual`；P2 可 `safe_auto`（确定性修复时）；P3 默认 `advisory`。

---

## 6. 置信度过滤

每个评审发现附带置信度评分（0.1-1.0）。**低于 0.8 的发现被过滤**。

| 置信度 | 处理 |
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

## 7. 发现合并与质量门

### 7.1 发现去重

**去重规则**：指纹 = `normalize(文件路径) + line_bucket(行号, ±3) + normalize(问题描述)`。匹配时合并，保留最高严重度、最高置信度、最保守修复路由，标注所有发现者。

**示例**：
```
合并前：
  [spec-check]    P1, conf 0.85, src/routes/export.ts:42 — 缺少错误处理
  [quality-check] P2, conf 0.90, src/routes/export.ts:43 — 异常未捕获导致 500
合并后：
  [spec-check, quality-check] P1, conf 0.90, src/routes/export.ts:42 — 缺少错误处理（异常未捕获导致 500）
```

### 7.2 跨评审者一致性验证

2 个以上独立评审者发现同一问题（去重后同一指纹有多个来源）→ **置信度提升 0.10**（上限 1.0）。独立收敛到同一问题是最强信号。输出标注 `↑` 表示跨评审者提升。

### 7.3 报告质量门

输出最终报告前，对报告执行 **6 项质量自检**：

| # | 检查项 | 不通过时的处理 |
|---|--------|--------------|
| 1 | **可操作性** | 模糊建议改写为具体操作 |
| 2 | **误报排除** | 重新阅读上下文确认问题存在 |
| 3 | **严重度校准** | 风格标 P0 或安全标 P3 时重新校准 |
| 4 | **行号准确性** | 核对文件修正行号 |
| 5 | **不与 Linter 重复** | 删除 Linter 能捕获的发现 |
| 6 | **受保护文件** | 丢弃对 `.forge/` 状态文件的误标 |

任一项不通过则自动修正后重新检查，直到全部通过。

---

## 8. 门禁：P0/P1 存在 → 阻断 `/forge ship`

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

## 9. 评审报告格式

**输出路径**：`.forge/reviews/<topic>.md`

**YAML Frontmatter**：

```yaml
---
topic: "<主题>"
date: "YYYY-MM-DD"
result: "pass" | "fail"
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 0
---
```

**正文结构**：三层 Layer 章节（各自含发现表格）+ 总结（结果 + 各级计数）。`result` 为 `pass`（无 P0/P1）或 `fail`（有 P0/P1）。

---

## 10. 执行流程

1. **前置检查**（§13）：检查 `.forge/` 目录、代码变更、锁定 Spec
2. **启动 Subagent 并行评审**：根据路径选择 3 个或 2 个 Subagent，`Promise.allSettled` 等待
3. **合并管线**（§7）：`filterByConfidence` → `deduplicateFindings` → `applyCrossValidation`
4. **报告质量门**（§7.3）：6 项自检，不通过则自动修正
5. **P0/P1 判定**：存在则阻断 ship，不存在则通过
6. **输出报告**：写入 `.forge/reviews/<topic>.md` 并展示摘要

### Step 0：前置检查

检查 `.forge/` 目录存在 → 检查代码变更 → 读取锁定 Spec 作为评审基准。

### Step 1：启动 Subagent 并行评审

通过 Agent tool 并行启动评审 Subagent（§2）。

### Step 2：合并与质量门

收集所有 Subagent 输出，执行发现合并管线（§7）。

### Step 3：输出报告

写入 `.forge/reviews/<topic>.md`，展示摘要。

---

## 11. 边界情况处理

| 情况 | 行为 |
|------|------|
| 无 Spec（轻量路径） | 不启动 spec-check，仅 quality-check + security-check，Layer 1 标注"已跳过" |
| 标准路径无 Spec | Plan 标注 `spec_ref: "none"` 时同轻量路径处理 |
| 无代码变更 | 提示：`⚠️ 未检测到代码变更。请先运行 /forge build` |
| 评审者输出过长 | 截断并提示完整报告见文件 |
| 无 `.forge/` 目录 | 提示先运行 `forge init` |

---

## 12. 示例

### 评审通过

```
$ /forge review

🔍 启动三层评审...
━━━ Layer 1 — Spec 对齐 ━━━ ✅ 所有 5 个场景均已实现，无 Scope Creep
━━━ Layer 2 — 代码质量 ━━━ P2: src/services/export.ts — 重复的日期校验逻辑
━━━ Layer 3 — 安全与风险 ━━━ ✅ 无安全问题
📋 评审结果：✅ 通过 | P0: 0 | P1: 0 | P2: 1 | P3: 0
报告已写入：.forge/reviews/order-batch-export.md
```

### 评审未通过

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

## 13. 前置检查

在启动评审前逐条验证。**任一不满足则输出拒绝信息并路由到正确命令**。

### 检查清单

| # | 检查条目 | 验证方法 | 不通过路由 |
|---|---------|---------|-----------|
| 1 | **是否有代码变更待评审** | 检查 git diff 或 `.forge/progress/` 已完成 build 任务 | → `/forge build` |
| 2 | **build 阶段是否已完成** | 检查 `.forge/progress/` build 状态或 `status.md` current_phase | → `/forge build` |

### 拒绝输出格式

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

### Autonomous 模式行为

前置检查不通过时返回 JSON：`{ success: false, summary, evidence, suggested_route, reentry_condition }`，触发 Forge Loop 的 `soft_failure` 处理。

---

## 上下文预算管理

| 信息源 | 生命周期 | 裁剪策略 |
|--------|---------|---------|
| 评审者完整输出 | Write-and-discard | 写入 `.forge/reviews/<topic>.md`，context 只保留摘要 |
| 评审结果摘要 | Ephemeral | Review_Summarizer：severity 分布 + findings 列表 + 文件路径引用，≤400 tokens |

零 findings 时保留单行确认消息。

---

## 14. 已知 AI 失败模式

> 逐条对照以下列表，确认没有正在犯这些错误。

| # | 失败模式 | 错误行为 | 正确做法 |
|---|---------|---------|---------|
| 1 | 全 PASS 无建议 | 每项标"通过"，无具体改进建议 | 即使质量高也应提 P2/P3 建议；确实无问题需说明检查了哪些维度及理由 |
| 2 | 只看风格不看逻辑 | 仅报告命名/缩进/注释格式，忽略逻辑正确性和安全风险 | 优先检查逻辑和安全（Layer 1/3），语义问题数量应多于风格问题 |
| 3 | 模板未填充 | 保留占位符文本或复制 SKILL.md 示例作为实际结果 | 每行基于实际代码变更，文件路径/行号/描述必须真实 |
| 4 | 不读 Spec 就评审 | 跳过 `.forge/specs/`，基于"代码看起来合理"评审 | 先读取 Spec 提取需求场景，逐条对照代码变更；轻量路径明确标注"已跳过" |
