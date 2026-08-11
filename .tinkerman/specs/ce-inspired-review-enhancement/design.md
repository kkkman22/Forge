---
feature: ce-inspired-review-enhancement
layout: design
created: 2026-06-04
---

# Design Document: CE-Inspired Review Enhancement

## 一、背景与动机

### 为什么现在做这个

Forge 的 `/forge review` 当前有 3 层并行 review（spec-check / quality-check / security-check），产出 P0–P3 严重度分级。这在 v2.1–v2.4 已足够。但两个趋势推动我们升级：

1. **假阳性问题**：review 输出中 P2/P3 finding 约占 60–70%，其中相当部分是"看起来像问题但实际不是"。开发者开始忽略整个 review 输出，导致真正的 P0 也被漏掉。
2. **缺少系统级视角**：现有三个 reviewer 各自检查已知模式（需求覆盖、代码质量、安全漏洞），但**组合失败**（每个组件单独正确但组合后崩溃）和**假设违反**（代码对环境的假设被打破）从未被检查。

CE 的 `ce-code-review` 用 6 阶段 pipeline + 5 级置信度 + 独立验证通道解决了同类问题。我们可以选择性地引入其最有效的模式。

### CE 的关键参考实现

| CE 模式 | 规模 | 我们取什么 |
|---------|------|-----------|
| 5 级置信度锚定 | 50+ agents 使用 | 完整引入 |
| 跨 reviewer 协议提升 | 12+ 并行 reviewer | 完整引入 |
| 对抗性审查 | 独立 agent | 完整引入 |
| Model 分层 | 每个 reviewer 声明 model | 完整引入 |
| 独立验证通道 | Stage 5b，P0 必须 | 引入但默认 Full tier only |
| 双轨知识系统 | bug + knowledge 两条轨道 | 完整引入 |
| 重叠检测 | 5 维度评分 | 完整引入 |
| 6 阶段 pipeline | Scope→Intent→Select→Spawn→Merge→Synthesize | 仅借鉴 Merge/Dedup 阶段 |

---

## 二、变更剧本

### 剧本 A — 置信度锚定如何改变 review 体验

**pre-change**（今天的 Forge）：

```
/forge review output:
  P0: [security] SQL injection in user query    ← 真正严重
  P1: [quality] Missing error handling           ← 需要修复
  P2: [quality] Variable name 'data' too vague   ← 可能不是问题
  P2: [quality] Missing JSDoc on public method   ← 噪声
  P3: [spec] Consider adding edge case test       ← 建议
```

开发者看到 5 个 finding，不知道该优先处理哪个。P2 的"Variable name"和"Missing JSDoc"可能是 reviewer 的风格偏好而非真正问题。

**change**（本 spec 落地后）：

```
/forge review output:
  [P0|100] R-001: SQL injection in user query           ← 机械验证，确定性
           ↑ cross-validated by 2 reviewers (security + adversarial)
  [P1|75]  R-002: Missing error handling for null user   ← 证据充分
  [P2|75]  R-003: Variable name 'data' shadows outer     ← 证据充分，保留
  ── suppressed (confidence gate) ──
  [P2|50]  Missing JSDoc on public method                ← 被抑制
  [P3|50]  Consider adding edge case test                ← 被抑制
```

开发者只看到 3 个 finding，每个都有足够的置信度。P0 被 2 个独立 reviewer 交叉验证。

**post-change**：review 输出信噪比大幅提升。开发者信任度恢复。

### 剧本 B — 对抗性审查发现什么

**pre-change**（今天的 Forge）：

```
代码变更：添加了一个 "用户登出" 功能
- spec-check: ✅ 需求覆盖完整
- quality-check: 命名规范、错误处理 OK
- security-check: 无注入风险

→ review 通过，ship
```

但生产环境出了问题：用户快速连续点击"登出"按钮，导致 session 被部分清理——session storage 的 key A 被删除但 key B 没被删除，用户再登录时读到残留的旧 session 数据。

**change**（本 spec 落地后）：

```
代码变更：添加了一个 "用户登出" 功能
- spec-check: ✅ 需求覆盖完整
- quality-check: 命名规范、错误处理 OK
- security-check: 无注入风险
- adversarial-check:
    [P1|75] R-004: Composition failure — logout clears session key A
            but key B depends on A's existence; rapid repeated logout
            leaves orphaned key B → stale session on re-login.
            Scenario: user clicks logout 3x in <500ms

→ review 拦截，修复后 ship
```

**post-change**：组合失败在 ship 前被发现。

### 剧本 C — Model 分层如何省钱

**pre-change**：4 个 reviewer 全部用 Opus 4.8（$15/M input + $75/M output）。一次 review 约 50K input + 20K output per reviewer × 4 reviewers = 200K input + 80K output。

成本：200K × $15/M + 80K × $75/M = $3.0 + $6.0 = **$9.0 / review**

**change**：

- spec-check（Opus）：50K × $15/M + 20K × $75/M = $2.25
- security-check（Opus）：50K × $15/M + 20K × $75/M = $2.25
- quality-check（Sonnet）：50K × $3/M + 20K × $15/M = $0.45
- adversarial-check（Sonnet）：50K × $3/M + 20K × $15/M = $0.45

成本：**$5.4 / review**（降低 40%）

如果 Validation_Pass 启用（2–4 个 finding × sonnet）：+ $0.9 ≈ **$6.3 / review**（仍比原来低 30%）

### 剧本 D — 双轨知识让 `/forge learn` 更精准

**pre-change**：

```
/forge learn after fixing a null pointer crash:
Output: 一个通用知识文档，包含 5 个维度但结构松散，
        "问题模式"段和"解决方案"段混在一起
```

**change**（Bug 轨）：

```markdown
---
track: bug
problem_type: null_propagation
component: user-service
root_cause: assumption_violation
confidence: 0.8
created: 2026-06-04
---

# UserService.getUser() Null Pointer

## Problem
`getUser()` assumed `db.find()` always returns a result; when user
doesn't exist, returns null, and downstream code dereferences without
null check.

## Symptoms
- 500 error on `/api/users/:id` when ID doesn't exist
- Error stack trace points to `user.name.toUpperCase()`

## What Didn't Work
- Try-catch at controller level → too broad, hides real errors
- Default value in db.find → hides data integrity issues

## Solution
Guard clause pattern: check null immediately, return early with 404.

## Why This Works
Guard clause makes the null case explicit and handled at the right
abstraction level. Callers don't need to know about db semantics.

## Prevention
- ALL db query results SHALL be null-checked before dereferencing
- ESLint rule `no-unnecessary-type-assertion` enabled
- Test: `it('returns 404 for non-existent user')`
```

### 剧本 E — 重叠检测防止知识库膨胀

**pre-change**：

```
知识库中有：
  solutions/null-check-pattern.md — "数据库查询后要检查 null"

新的 /forge learn 也提取了：
  "UserService.getUser() 没有检查 null"
  → 创建 user-service-null-fix.md

结果：两个文档说同一件事，知识库浪费一个名额。
```

**change**：

```
新的 /forge learn 执行 Overlap_Detection:
  problem_statement: High（都是 null pointer）
  root_cause: High（都是 assumption_violation）
  solution_approach: High（都是 guard clause）
  referenced_files: Low（不同文件）
  prevention_rules: Moderate（部分重叠）

3+ 维度 High → 更新现有文档

user-service-null-fix 被追加到 null-check-pattern.md 的 "实例" 段，
frontmatter updated: 2026-06-04，changelog 加条目。

知识库仍然只有 1 个文档，但内容更丰富。
```

---

## 三、架构变更

### 3.1 Agent 系统变更

```
现有（v2.5）:
  .claude/agents/
    spec-check.md        — model: (未指定，默认 inherit)
    quality-check.md     — model: (未指定，默认 inherit)
    security-check.md    — model: (未指定，默认 inherit)
    forge-review.md      — review orchestrator

新增/修改:
  .claude/agents/
    spec-check.md        — model: inherit, + 置信度校准指南
    quality-check.md     — model: sonnet, + 置信度校准指南
    security-check.md    — model: inherit, + 置信度校准指南
    adversarial-check.md — [新增] model: sonnet, 四种技术 + 深度校准
    validation-pass.md   — [新增] model: sonnet, 独立验证 agent
    forge-review.md      — 重写 merge 阶段，增加 confidence gate / 去重 / 验证
```

### 3.2 Review Pipeline 变更

```
现有（v2.5）:
  ┌──────────┐    ┌───────────────────────────────┐    ┌──────────┐
  │ Dispatch │───▶│ spec-check │ quality │ security │───▶│   Merge  │──▶ Report
  │ (parallel)│    │ (parallel, no confidence)     │    │ (simple) │
  └──────────┘    └───────────────────────────────┘    └──────────┘

新增后:
  ┌──────────┐    ┌─────────────────────────────────────────┐    ┌───────────────┐    ┌──────────┐
  │ Dispatch │───▶│ spec-check │ quality │ security │ advers. │───▶│ Merge/Dedup   │───▶│ Validation│──▶ Report
  │ (parallel)│    │ (parallel, each with confidence anchor) │    │ + Cross-Review│    │ Pass      │
  │ + tiering │    │ + model tiering                         │    │ + Conf Gate   │    │ (optional)│
  └──────────┘    └─────────────────────────────────────────┘    └───────────────┘    └──────────┘
```

### 3.3 Finding 数据结构

```typescript
interface Finding {
  id: string;              // "R-001", stable across rounds
  title: string;
  severity: "P0" | "P1" | "P2" | "P3";
  confidence: 0 | 25 | 50 | 75 | 100;  // Confidence_Anchor
  file: string;
  line: number;
  reviewer: string;        // "spec-check" | "quality-check" | "security-check" | "adversarial-check"
  evidence: string[];
  suggested_fix?: string;
  autofix_class: "safe_auto" | "gated_auto" | "manual" | "advisory";
  owner: "human" | "review-fixer" | "downstream-resolver";
  requires_verification: boolean;
  cross_validated?: {
    by: string[];          // ["security-check", "adversarial-check"]
    promoted_from: number; // original confidence before promotion
  };
  validation?: {
    confirmed: boolean;
    reason: string;
    adjusted_confidence?: number;
  };
  suppressed: boolean;
  suppression_reason?: string;
}
```

### 3.4 Knowledge 文档结构变更

```
现有（v2.5）:
  .tinkerman/knowledge/solutions/<name>.md
    ---
    name: <name>
    confidence: 0.3-0.9
    ---
    # 5 维提取（自由格式 markdown）

新增后:
  .tinkerman/knowledge/solutions/<name>.md
    ---
    name: <name>
    track: bug | knowledge
    problem_type: <enum>
    component: <string>
    confidence: 0.3-0.9
    created: YYYY-MM-DD
    updated: YYYY-MM-DD
    changelog:
      - date: YYYY-MM-DD
        action: created | updated
        summary: <string>
    overlap_refs:
      - <other-solution-name>.md  # 被检测为重叠的文档
    ---
    # Bug 轨 OR 知识轨结构化模板（见 Req 6）
```

---

## 四、Blueprint Delta

### 新增文件

| 路径 | 用途 |
|------|------|
| `.claude/agents/adversarial-check.md` | 对抗性审查 agent 定义 |
| `.claude/agents/validation-pass.md` | 独立验证 agent 定义 |
| `.tinkerman/docs/living/review-confidence-guide.md` | 置信度系统使用指南 |

### 修改文件

| 路径 | 改动内容 |
|------|---------|
| `.claude/agents/spec-check.md` | 增加 confidence 校准指南 + model: inherit 声明 |
| `.claude/agents/quality-check.md` | 增加 confidence 校准指南 + model: sonnet 声明 |
| `.claude/agents/security-check.md` | 增加 confidence 校准指南 + model: inherit 声明 |
| `.claude/agents/forge-review.md` | 重写 merge 阶段：去重 + 跨 reviewer 提升 + confidence gate + 验证通道 + stable ID |
| `skills/forge-review/SKILL.md` | 增加 `--autofix` 参数 + `--compact-safe` 参数 |
| `skills/forge-learn/SKILL.md` | 增加双轨模板 + 重叠检测逻辑 |
| `CLAUDE.md` | §3.2 Review 表格增加 adversarial-check 行 + confidence 说明 |
| `.tinkerman/config.md` | 增加 `review_force_model` 和 `context_budget` 配置项 |

### 文件数净变化

- 新增：**3 个**
- 修改：**8 个**
- 删除：**0 个**

---

## 五、各 Reviewer 的置信度校准指南

### spec-check 校准

| Anchor | 含义 |
|--------|------|
| 100 | 需求文档中的验收标准可以**机械匹配**到代码变更——该加的 API 加了，该有的参数有了 |
| 75 | 验收标准的覆盖可以从 diff 和上下文代码**直接推断**——不需要额外假设 |
| 50 | 需求可能被覆盖，但需要**推断**跨文件的影响链——如"这个需求可能影响 middleware" |
| 25 | 纯推测性的 scope creep 或遗漏——**抑制** |
| 0 | 与需求无关的发现——**抑制** |

### quality-check 校准

| Anchor | 含义 |
|--------|------|
| 100 | 机械可验证：dead code on unreachable branch、explicit `any` in new code、file crosses 1K lines |
| 75 | diff 中直接可见：新 wrapper 无新增行为、special-case branch in shared function |
| 50 | 判断型（命名、边界放置）——**默认抑制**（仅 P1 structural regression 可保留） |
| 25 | 纯风格偏好——**抑制** |

### security-check 校准（低阈值）

| Anchor | 含义 |
|--------|------|
| 100 | 可构造攻击 payload 并在 diff 中追踪完整利用路径 |
| 75 | 已知漏洞模式（SQL injection、XSS）且有 concrete input 触发 |
| 50 | 有风险信号但需要外部条件（如特定配置）——**P0 保留**，P1+ 抑制 |
| 25 | 理论风险无证据——**抑制** |

### adversarial-check 校准（深度调整）

| Anchor | 含义 |
|--------|------|
| 100 | 失败场景**机械可构造**：每一步可从 diff 和周围代码验证 |
| 75 | 可构造完整场景："给定这个输入/状态，执行沿这条路径，到达这行，产生这个错误" |
| 50 | 场景可构造但某一步依赖无法完全确认的条件（如外部 API 返回格式） |
| 25 | 需要多个不太可能的条件同时成立——**抑制** |

---

## 六、风险地图

### 风险 A — 置信度阈值导致真问题被抑制

**现象**：security-check 的 P1 finding 在 confidence=50 被抑制，但后来在生产环境中被证实。

**降险**：
1. P0 finding 在 confidence=50 就保留（安全例外）
2. 被抑制的 finding 记录在 `.tinkerman/progress/<slug>-review-suppressed.jsonl`，可追溯
3. `/forge learn` 可以从 suppressed findings 中提取"被抑制但后来证实"的模式，调整阈值

**回滚**：confidence gate 的阈值可通过 `.tinkerman/config.md` 的 `review_confidence_threshold` 配置调整，默认 75 可降到 50。

### 风险 B — adversarial-check 产出过多 advisory finding

**现象**：adversarial-check 对每个变更都构造 5+ 个"可能的失败场景"，大部分是理论性的，报告变得冗长。

**降险**：
1. adversarial-check 的深度校准限制 finding 数量：Quick ≤3, Standard proportional, Deep 无硬限制但 confidence gate 过滤
2. advisory 类 finding 默认折叠在报告中（仅显示标题，需展开看详情）
3. model: sonnet（不继承 Opus）减少过度推理

**回滚**：`.tinkerman/config.md` 增加 `review_enable_adversarial: false` 开关。

### 风险 C — Validation Pass 延误 ship 时间

**现象**：Full tier 的 review 在 Validation Pass 阶段额外花 2–5 分钟，开发者等不及。

**降险**：
1. Validation Pass 默认仅 Full tier 启用
2. 可通过 `--no-validation` flag 跳过
3. Validation sub-agent 并行运行（每个 finding 一个 agent）

**回滚**：`.tinkerman/config.md` 增加 `review_enable_validation: false`。

### 风险 D — 双轨知识模板与现有格式不兼容

**现象**：已有的 20 个知识文档使用旧的 5 维格式，新的双轨模板无法解析它们。

**降险**：
1. 新模板是旧格式的**超集**——旧文档的 5 维内容可映射到双轨字段
2. `/forge learn` 对旧文档**不强制迁移**，仅新创建的文档使用新模板
3. `.tinkerman/config.md` 增加 `knowledge_template_version: 2` 标记，区分新旧

**回滚**：设置 `knowledge_template_version: 1` 回退到旧模板。

### 风险 E — Model 分层导致 quality-check 质量下降

**现象**：Sonnet 模型在某些复杂代码模式下不如 Opus 敏锐，漏掉一些 finding。

**降险**：
1. quality-check 的 finding 本身多为 P2/P3，漏掉的代价较低
2. adversarial-check（也用 sonnet）和 spec-check（用 opus）提供第二道防线
3. 可通过 `review_force_model: inherit` 强制所有 reviewer 使用高端模型

**回滚**：quality-check.md 的 model 字段改回 `inherit`。

---

## 七、与后续 Spec 的接口

| 留白 | 后续 spec |
|------|----------|
| Strategy 锚定物（STRATEGY.md） | 独立新 spec |
| CE 的 `/ce-optimize` 迭代优化循环 | 独立新 spec |
| CE 的 brainstorm 需求发现 | 与 `/forge decide` 融合 spec |
| CE 的 intent discovery（Stage 2） | 可在本 spec 稳定后追加 |
| Review 产物的 CI 集成 | `ultrareview-ci-integration`（已起草） |
| Plugin 分发 | `plugin-distribution`（已起草） |

---

## 八、设计决策

### D1 — 为什么用 5 级离散锚定而非连续百分比？

**选择**：5 个离散值（0, 25, 50, 75, 100）

**理由**：
- CE 实践证明离散值比连续百分比更容易让 agent 校准——"这个是 70 还是 75"比"这个是 72 还是 73"更容易判断
- 5 级足够表达"抑制 / 可能 / 大概率 / 确定"的语义梯度
- 离散值让 Cross_Reviewer_Promotion 的"提升一档"操作简单明确

**权衡**：精度略低于连续值，但 review finding 本身就是定性判断，不需要数值精度。

### D2 — 为什么 adversarial-check 用 sonnet 而非 inherit？

**选择**：`model: sonnet`

**理由**：
- adversarial-check 的 finding 大多是 advisory（不需要最强推理来构造失败场景）
- 降低成本（sonnet 比 opus 便宜约 80%）
- 如果需要更强推理，用户可以通过 `review_force_model` 覆盖

**权衡**：可能在极端复杂的 diff 中遗漏一些 subtle 的级联失败。接受。

### D3 — 为什么 Validation Pass 默认仅 Full tier 启用？

**选择**：Full tier only，Standard/Light 跳过

**理由**：
- Validation Pass 增加 ~30% review 时间和成本
- Standard tier 的变更规模通常较小，persona 偏见风险低
- Light tier 只涉及 1 个文件 20 行以内，validation 没有意义

### D4 — 为什么不完整引入 CE 的 6 阶段 pipeline？

**选择**：仅借鉴 Merge/Dedup 阶段的精细度

**理由**：
- CE 的 Stage 1（Scope）和 Stage 2（Intent Discovery）增加了约 20% 的 overhead，但 Forge 的 spec 系统已经提供了等效的上下文（locked spec → plan → review 知道在审什么）
- CE 的 Stage 3（Select Reviewers）是条件性选择——Forge 已经通过 tier 路由实现了类似功能
- 完整引入 6 阶段会大幅增加 forge-review.md 的复杂度，ROI 不高

### D5 — 为什么不直接使用 CE 的知识库目录结构（`docs/solutions/`）？

**选择**：保持 Forge 的 `.tinkerman/knowledge/solutions/`

**理由**：
- Forge 的 `.tinkerman/` 目录是受保护区，知识文档不会被 git 忽略
- `docs/solutions/` 更面向人类阅读，`.tinkerman/knowledge/solutions/` 更面向 agent 检索
- 迁移目录结构会破坏现有用户的 `.gitignore` 和 CI 配置

### D6 — 为什么 Overlap_Detection 用 5 维度而非语义相似度？

**选择**：5 个结构化维度 + 规则评分

**理由**：
- 语义相似度需要 embedding 模型，增加外部依赖和延迟
- 结构化维度（问题描述、根因、方案、文件、预防规则）是知识文档中已有的字段
- 规则评分可解释、可调试——用户能理解"为什么被认为重叠"

**权衡**：可能遗漏语义相似但结构不同的文档。未来可升级为混合方法。
