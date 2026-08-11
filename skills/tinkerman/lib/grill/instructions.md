---
updated: 2026-08-11
description: "Use when user starts full-tier task, says grill me, replies dig deeper during decide phase, or before locking an ambiguous spec"
context: fork

dispatch_mode: fork
allowed_tools:
  - Read
  - Agent
---

# /tinkerman grill — 苏格拉底质询引擎

> **触发方式**：全量档位的可选前置步骤，或用户直接输入 `/tinkerman grill [topic]` / 回复 `grill me` / `再挖深点`
> **职责**：通过一次一个问题的决策树追问，在 `/tinkerman decide` 之前把功能、边界、依赖、假设、非目标全部说清楚
> **输出路径**：`.forge/findings/grill-<topic>.md`

---

## 1. Overview

`/tinkerman grill` 补齐 forge-decide 之前的"用户侧澄清"环节。decide 回答的是"四视角评估后的推荐方案"，grill 回答的是"用户已经想清楚的东西"。

**核心原则**：对齐缺失是头号失败模式。一次问一个问题，挖到底再进入 decide。

**Not For**：已完全明确需求且无歧义的任务 · 轻量档位（成本不划算） · 纯技术风险决策（交给 decide）

> **Inline Mode**: The core functions of this skill (`generateDecisionTree`, `selectNextQuestion`, `applyAnswer`, etc.) can be invoked directly by `forge-spec` and `forge-decide` as inline sub-processes. Inline invocations do not write `findings/grill-<topic>.md` and are invisible to the explicit grill session state. The explicit `/tinkerman grill` entry point and all existing trigger paths remain unchanged.

---

## 2. Triggers

| 入口 | 条件 |
|------|------|
| `/tinkerman grill [topic]` | 用户主动调用 |
| 路由器全量档位前置 | `tier === "full"` 自动建议 grill，用户可跳过 |
| `grill me` / `再挖深点` / `dig deeper` | 任意 skill 执行中用户提出 |
| 歧义 spec 锁定前 | spec Round 输出 `ambiguity_score` 高时建议 grill |

---

## 3. Core Loop — Goals & Constraints

**Goal**: Walk a five-category decision tree (functionality, boundary, dependency, assumption, non_goal) one question at a time until every node is resolved, then produce a findings file.

**Constraints**:
- Each round presents exactly one question; batch questioning is forbidden
- Questions answerable from the codebase must be resolved via explore subagent rather than asked of the user
- Every answer application must produce a new tree (immutable, original unchanged)
- Glossary conflicts must be detected after each answer and surfaced to the user for clarification before continuing（内部使用 `runGlossaryCheck({ phase: 'grill' })`）
- 术语澄清时**立即更新** `.forge/glossary.md`，不要批量累积。
  当 grill 过程中：
  - 用户使用了一个不在 glossary 中的新术语 → 追加新条目（来源: grill）
  - 用户澄清了一个模糊术语 → 更新该条目的定义
  - 用户否定了某个同义词 → 追加 **避免** 字段
  - 发现两个术语的边界不清晰 → 追加 **歧义记录**
  - 揭示了术语间的新关系 → 追加 **关系** 字段
  不要耦合到实现细节——只包含对领域专家有意义的术语。
- Loop terminates only when all nodes are non-pending
- User may accept AI suggestions, override answers, request deeper probing, or skip nodes

**Approach**: Your choice of traversal strategy, conflict resolution ordering, and answer persistence — provided the constraints above hold. Reference implementations exist as pure functions in `src/grill.ts` with a driver layer handling IO (user prompts, findings writes, status.md updates).

**Available pure functions** (all IO-free; driver layer handles reads/writes):

| Function | Parameters | Returns |
|----------|-----------|---------|
| `generateDecisionTree(description, glossary, now?)` | 任务描述、现有 Glossary、可选时间戳 | 新 `DecisionTree`（五根节点 + glossary 命中挂载） |
| `selectNextQuestion(tree)` | 当前决策树 | `DecisionTreeNode \| null`；null → 循环终止 |
| `applyAnswer(tree, nodeId, answer, now?)` | 决策树、节点 id、用户答案、可选时间戳 | 新决策树；未命中 id 时原样返回（引用相等） |
| `isComplete(tree)` | 当前决策树 | `boolean`；所有节点非 pending 时为 `true` |
| `checkGrillGlossaryConflicts(tree, glossary, now?)` | 决策树、现有 Glossary、可选时间戳 | `GrillConflictCheckResult`（`hasConflict` 为 true 时暂停 grill） |
| `renderGrillConflictPrompt(result)` | 冲突结果 | 用户可见的澄清 prompt 字符串；无冲突返回 "" |
| `extractNewGlossaryCandidates(tree, glossary)` | 决策树、现有 Glossary | `TermCandidate[]`（已排除现有术语） |
| `renderGrillFindings(tree, summary)` | 决策树、对齐摘要字符串 | findings 文件 Markdown 正文（4 段） |

---

## 4. Output

**Path**: `.forge/findings/grill-<topic>.md`

Four fixed sections produced by `renderGrillFindings`:

1. `# Grill Findings: <title>` — 首个非空行作为标题
2. `## Decision Tree` — 嵌套列表，每行 `- [STATUS] <category>/<id>: <question>`，`userAnswer` 缩进为 `Answer: ...`
3. `## Q&A Pairs` — 仅 `resolved` 节点，`- Q: <question>` / `  A: <userAnswer>`；无则 `none`
4. `## Alignment Summary` — 调用方产出的对齐摘要；空则 `none`
5. `## Glossary Updates` — 本次 grill 期间对 glossary 的变更列表
   - `+ <新术语>` / `~ <更新术语>` / `! <歧义记录>`
   无变更则 `none`
6. `## New Glossary Candidates` — `- <term> (<frequency>)`；无则 `none`（供 forge-learn 阶段回写 glossary）

→ 决策树格式规范详见 references/decision-tree-format.md
→ 问题生成策略详见 references/question-strategies.md
→ 端到端会话示例详见 references/examples.md

---

## 5. Resume Support

**Goal**: Restore an interrupted grill session to the exact point of abandonment and continue seamlessly.

**Constraints**:
- On session interruption, the current decision tree must be serialized to the findings file and `.forge/status.md` phase set to `grill_abandoned`
- Resume must deserialize the tree and locate the next pending node
- Replay of the same Q&A sequence must produce the same terminal state (`applyAnswer` is a pure function guaranteeing idempotency)

**Approach**: Your choice of serialization format and resume detection — provided the constraints above hold. See requirement R4.10.

---

## 6. Edge Cases

| 情况 | 处理 |
|------|------|
| 描述为空 | 拒绝启动，提示"先描述任务再 grill" |
| Glossary 冲突 | 暂停 grill → 按 R1.7 澄清（保留 / 替换 / 新增别名）→ 续跑 |
| 用户主动终止 | 保存部分决策树为 `grill_abandoned`，下次 resume 继续 |
| 决策树全部 skipped | `isComplete` 返回 `true`，输出空 Q&A 段，不追问 |
| 代码库可回答的问题 | 派发 explore subagent（只读）替代追问用户 |
| 新术语候选过多 | `filterCandidates` 的 `maxCandidatesPerSession`（默认 10）截断 |

---

## 7. Boundary with forge-decide

| Skill | 产出物 | 对比 |
|-------|--------|------|
| `/tinkerman grill` | 用户已经想清楚的边界与假设 | 用户侧澄清 |
| `/tinkerman decide` | 四视角（product/architect/security/designer）推荐方案 | Agent 侧评估 |

grill 的 findings 可直接喂给 decide 作为 Round 1 上下文，减少视角之间的重复提问。

---

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "我已经想清楚了不需要 grill" | grill 的价值是暴露你没意识到的盲点；跳过 = 把盲点留给 decide 或 build |
| "一次问一个问题太慢" | 批量追问会让用户用一个回答覆盖多个问题，对齐精度反而下降 |
| "grill 和 decide 功能重叠" | grill 逼用户澄清，decide 让 agent 评估。两者互补非替代 |

## Gotchas
- **Premature resolution**: User gives vague answer, grill marks resolved → ambiguity carried forward → ask follow-up before accepting
- **Question overload**: Ask 5 questions at once → user gives shallow answers → one question at a time
- **Circular questioning**: Re-ask same question in different words → user frustrated → track asked questions, don't repeat
