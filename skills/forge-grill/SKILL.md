---
name: forge-grill
description: "Grill the user with one-question-at-a-time Socratic decision tree resolution. Use when user starts full-tier task, says grill me, replies dig deeper during decide phase, or before locking an ambiguous spec."
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge grill — 苏格拉底质询引擎

> **触发方式**：全量档位的可选前置步骤，或用户直接输入 `/forge grill [topic]` / 回复 `grill me` / `再挖深点`
> **职责**：通过一次一个问题的决策树追问，在 `/forge decide` 之前把功能、边界、依赖、假设、非目标全部说清楚
> **输出路径**：`.forge/findings/grill-<topic>.md`

---

## 1. Overview

`/forge grill` 补齐 forge-decide 之前的"用户侧澄清"环节。decide 回答的是"四视角评估后的推荐方案"，grill 回答的是"用户已经想清楚的东西"。

五类决策树根节点：functionality、boundary、dependency、assumption、non_goal。每轮只问一个问题，用户可接受 AI 建议 / 覆盖答案 / 要求继续下钻。

**核心原则**：对齐缺失是头号失败模式。一次问一个问题，挖到底再进入 decide。

**Not For**：已完全明确需求且无歧义的任务 · 轻量档位（成本不划算） · 纯技术风险决策（交给 decide）

---

## 2. Triggers

| 入口 | 条件 |
|------|------|
| `/forge grill [topic]` | 用户主动调用 |
| 路由器全量档位前置 | `tier === "full"` 自动建议 grill，用户可跳过 |
| `grill me` / `再挖深点` / `dig deeper` | 任意 skill 执行中用户提出 |
| 歧义 spec 锁定前 | spec Round 输出 `ambiguity_score` 高时建议 grill |

---

## 3. Core Loop

Six-step loop implemented by pure functions in `src/grill.ts`. Driver layer orchestrates IO (user prompt, findings write, status.md bump).

1. **Generate tree** — `generateDecisionTree(description, glossary)` 产出五类根节点，glossary 命中项挂到 `dependency` 分支
2. **Select next** — `selectNextQuestion(tree)` 深度优先返回第一个 `pending` 且祖先 `resolved` 的节点；返回 `null` 即终止
3. **Ask** — 展示节点 question + 可选 `aiSuggestion`；若问题可从代码库回答（已有实现 / 现存术语），派发 explore subagent 代替追问用户
4. **Apply answer** — `applyAnswer(tree, nodeId, answer)` 纯函数返回新树，原树不变
5. **Conflict check** — 每轮 `applyAnswer` 后调用 `checkGrillGlossaryConflicts(tree, glossary)`（封装 `detectConflict`）；`hasConflict === true` 时暂停 grill，把 `renderGrillConflictPrompt(result)` 的输出发给用户，按 R1.7 澄清（保留 / 替换 / 新增别名）后再续跑
6. **Repeat until complete** — `isComplete(tree) === true` 后退出循环，进入 §5 输出

---

## 4. Function Calls

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

所有函数 IO-free。Driver 层负责读 glossary、写 findings、更新 `.forge/status.md`。

---

## 5. Output

**Path**: `.forge/findings/grill-<topic>.md`

Four fixed sections produced by `renderGrillFindings`:

1. `# Grill Findings: <title>` — 首个非空行作为标题
2. `## Decision Tree` — 嵌套列表，每行 `- [STATUS] <category>/<id>: <question>`，`userAnswer` 缩进为 `Answer: ...`
3. `## Q&A Pairs` — 仅 `resolved` 节点，`- Q: <question>` / `  A: <userAnswer>`；无则 `none`
4. `## Alignment Summary` — 调用方产出的对齐摘要；空则 `none`
5. `## New Glossary Candidates` — `- <term> (<frequency>)`；无则 `none`（供 forge-learn 阶段回写 glossary）

→ 决策树格式规范详见 references/decision-tree-format.md
→ 问题生成策略详见 references/question-strategies.md
→ 端到端会话示例详见 references/examples.md

---

## 6. Resume Support

中途关闭会话时，driver 将当前决策树序列化到 findings 文件，并把 `.forge/status.md` 的 `phase` 置为 `grill_abandoned`。

`/forge resume` 识别此 phase 后：

1. 读 `.forge/findings/grill-<topic>.md` 反序列化 `DecisionTree`
2. 继续调用 `selectNextQuestion(tree)` 定位下一个 pending 节点
3. 从该节点恢复 grill 循环

同一问答序列 replay 产出同一终态（`applyAnswer` 纯函数保证幂等）。详见需求 R4.10。

---

## 7. Edge Cases

| 情况 | 处理 |
|------|------|
| 描述为空 | 拒绝启动，提示"先描述任务再 grill" |
| Glossary 冲突 | 暂停 grill → 按 R1.7 澄清（保留 / 替换 / 新增别名）→ 续跑 |
| 用户主动终止 | 保存部分决策树为 `grill_abandoned`，下次 resume 继续 |
| 决策树全部 skipped | `isComplete` 返回 `true`，输出空 Q&A 段，不追问 |
| 代码库可回答的问题 | 派发 explore subagent（只读）替代追问用户 |
| 新术语候选过多 | `filterCandidates` 的 `maxCandidatesPerSession`（默认 10）截断 |

---

## 8. Boundary with forge-decide

| Skill | 产出物 | 对比 |
|-------|--------|------|
| `/forge grill` | 用户已经想清楚的边界与假设 | 用户侧澄清 |
| `/forge decide` | 四视角（product/architect/security/designer）推荐方案 | Agent 侧评估 |

grill 的 findings 可直接喂给 decide 作为 Round 1 上下文，减少视角之间的重复提问。

---

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "我已经想清楚了不需要 grill" | grill 的价值是暴露你没意识到的盲点；跳过 = 把盲点留给 decide 或 build |
| "一次问一个问题太慢" | 批量追问会让用户用一个回答覆盖多个问题，对齐精度反而下降 |
| "grill 和 decide 功能重叠" | grill 逼用户澄清，decide 让 agent 评估。两者互补非替代 |
