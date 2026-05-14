---
status: draft
created: "2026-05-14"
topic: grill-auto-trigger-and-inline
---

# Spec: grill 下沉为内部模块 + 自动触发机制

## 概述

将 `forge-grill` 的核心纯函数（`generateDecisionTree` / `selectNextQuestion` / `applyAnswer` / `checkGrillGlossaryConflicts` 等）正式作为内部能力库暴露给 `forge-spec` 和 `forge-decide`，由调用方在检测到需求歧义或视角分歧时自动 inline 触发 grill 子流程。同时保留 `/forge grill` 显式入口、router 全量档位前置建议以及"挖深点"关键词触发的现有路径。

不下线 grill skill，不破坏现有触发点，仅扩展自动触发覆盖面。

## 动机

`forge-grill` 当前虽然有四种触发路径（显式调用、router 前置、关键词、spec ambiguity 高时建议），但其中 spec / decide 两个最高价值的触发点目前只是"建议"——需要用户主动看到提示并跑 `/forge grill`。

实际工作流中：

- **spec 阶段** AI 生成草案后做自检，可能发现需求条目模糊，但没有机制让 spec 自动询问用户澄清，只能输出文档质量警告
- **decide 阶段** Critic 审查 4 视角输出时，可能发现"产品视角和架构视角对需求的理解不一致"，但 decide 没有机制反过来问用户该怎么定，只能在决策文档里记录"开发者最终决定"
- **autonomous 模式** 全量任务自动执行 decide → spec → plan，autonomous 模式下用户不在线，grill 跳过即可，但当前没有显式跳过策略

把 grill 作为可被其他 skill 调用的"澄清子流程能力"，能闭合上述断点，提高需求对齐率，同时避免主包 skill 数量虚高（grill 仍保留显式入口，但不需要每次都被路由器主动建议）。

## 核心设计原则

- **零侵入下沉**：grill 现有纯函数已经具备能力库特征（无 IO、签名稳定、被 PBT 覆盖），下沉过程不重写函数体
- **inline vs 显式分离**：inline 触发的 grill 子流程**不**写 `.forge/findings/grill-<topic>.md`，仅在调用方上下文内消费；显式 `/forge grill` 行为完全保留（包括落盘、resume、`grill_abandoned` 状态）
- **autonomous 模式默认跳过**：autonomous 模式下所有 inline 触发自动 skip，转为发出 advisory（写入 status/findings 提示），不阻塞流程
- **interactive 模式可拒绝**：interactive 模式下 inline 触发先询问用户是否进入 grill 子流程，用户可拒绝
- **频率控制**：每个调用方每个会话每个触发原因最多自动触发一次 inline grill，避免循环
- **触发原因可追溯**：每次 inline 触发记录原因（高 ambiguity / critic 发现需求侧分歧 / 等），写入 status 便于复盘
- **中文用户提示**：所有 interactive 模式提示使用中文表达

## 能力库下沉

### 公共契约（已存在，仅明确导出语义）

`src/grill.ts` 中以下纯函数作为正式公共 API，所有 forge-* skill 均可调用：

| 函数 | 契约 | 用途 |
|------|------|------|
| `generateDecisionTree(description, glossary, now?)` | `(string, Glossary, Date?) → DecisionTree` | 由任务描述构建初始决策树（5 类根节点） |
| `selectNextQuestion(tree)` | `(DecisionTree) → DecisionTreeNode \| null` | 选下一个 pending 节点；null 表示全部解决 |
| `applyAnswer(tree, nodeId, answer, now?)` | `(DecisionTree, string, string, Date?) → DecisionTree` | 写入用户答案，返回新树 |
| `isComplete(tree)` | `(DecisionTree) → boolean` | 判定决策树完成 |
| `checkGrillGlossaryConflicts(tree, glossary, now?)` | `(DecisionTree, Glossary, Date?) → GrillConflictCheckResult` | 检测术语冲突，hasConflict=true 时暂停 |
| `renderGrillConflictPrompt(result)` | `(GrillConflictCheckResult) → string` | 渲染冲突澄清提示 |
| `extractNewGlossaryCandidates(tree, glossary)` | `(DecisionTree, Glossary) → TermCandidate[]` | 提取候选新术语 |
| `renderGrillFindings(tree, summary)` | `(DecisionTree, string) → string` | 渲染 findings 文档（仅显式模式使用） |

不新增函数，不改函数签名。仅在 `src/index.ts` barrel 中标注它们为公共 inline API。

### 新增编排辅助函数

```ts
// src/grill-inline.ts （新增，纯函数）

export type GrillInlineMode = "spec" | "decide"
export type GrillInlineReason =
  | "spec_high_ambiguity"
  | "decide_requirement_disagreement"
  | "decide_user_hesitation"

export type GrillInlineResult =
  | { kind: "skipped"; reason: "autonomous_mode" | "user_declined" | "frequency_limit" }
  | { kind: "completed"; tree: DecisionTree; alignmentSummary: string }
  | { kind: "abandoned"; partialTree: DecisionTree }

/** 判定是否应触发 inline grill。纯函数，由调用方注入上下文。 */
export function shouldTriggerInlineGrill(input: {
  mode: "interactive" | "autonomous"
  reason: GrillInlineReason
  alreadyTriggered: { spec_high_ambiguity: boolean; decide_requirement_disagreement: boolean; decide_user_hesitation: boolean }
}): { trigger: boolean; rationale: string }

/** 渲染 interactive 模式下的中文确认提示。 */
export function renderInlineGrillConfirmPrompt(reason: GrillInlineReason): string

/** 渲染 autonomous 模式下的 advisory（写入 status / findings 的建议条目）。 */
export function renderInlineGrillAdvisory(reason: GrillInlineReason): string

/** 把 inline grill 的对齐摘要包装为可注入的上下文片段。 */
export function formatInlineGrillInjection(result: GrillInlineResult, mode: GrillInlineMode): string
```

`src/grill-inline.ts` 不执行 IO，不调用 grill 内部状态。它只生成提示串、判定布尔、格式化注入文本。实际 inline 子流程由 spec / decide 的 driver 层使用 grill 公共函数手动驱动。

## 触发点矩阵

| 触发源 | 触发条件 | 模式 | 行为 |
|--------|----------|------|------|
| 显式 `/forge grill` | 用户主动调用 | 任意 | 完整 skill 流程，落盘 findings（**不变**） |
| router 全量档位前置 | tier=full | interactive | 输出 advisory `💡 可选：先跑 /forge grill 对齐`（**不变**） |
| router 关键词 | "grill me" / "再挖深点" / "/forge grill" | 任意 | 转入 forge-grill skill（**不变**） |
| **spec 阶段 inline** | spec self-check 输出 `ambiguity_score >= threshold` | interactive | 提示用户进入 grill 子流程，用户确认后 inline 提问 |
| **spec 阶段 inline** | 同上 | autonomous | skip + 写 advisory 到 `.forge/findings/spec-ambiguity-advisory-<topic>.md` |
| **decide 阶段 inline** | Round 2 Critic 标记 `requirement_disagreement` | interactive | 提示用户进入 grill 子流程，用户确认后 inline 提问 |
| **decide 阶段 inline** | 同上 | autonomous | skip + advisory 写入决策文档 §否决记录 |
| **decide 阶段 inline** | 用户连续 3 次表达犹豫 | interactive | 同上（与 zoom-out auto-trigger 协同：grill 优先于 zoom-out 触发） |
| **decide 阶段 inline** | 同上 | autonomous | skip |

## 核心子流程：spec inline grill

### 触发判定

`forge-spec` 在 §2 Step 2 Review 自检完成后：

1. 计算 `ambiguity_score`（spec 中模糊条目数 / 总条目数，已有逻辑）
2. 调用 `shouldTriggerInlineGrill({ mode, reason: "spec_high_ambiguity", alreadyTriggered })`
3. `trigger: true` → 进入 inline 子流程；`trigger: false` → 继续 Step 3 Lock

### Inline 子流程（interactive 模式）

```
渲染中文确认提示：
  「检测到 spec 草案存在 N 处模糊点（ambiguity_score=0.X）。
   是否进入 grill 子流程逐项澄清？」

用户回复 yes：
  1. tree = generateDecisionTree(description, glossary, now)
  2. 进入 grill 主循环：
       node = selectNextQuestion(tree)
       while node !== null:
         向用户提问 node.question
         answer = 用户回答
         conflicts = checkGrillGlossaryConflicts(tree, glossary, now)
         if conflicts.hasConflict: 渲染澄清提示，等用户处理
         tree = applyAnswer(tree, node.id, answer, now)
         node = selectNextQuestion(tree)
  3. inline grill 完成 → result = { kind: "completed", tree, alignmentSummary }
  4. 注入上下文：injection = formatInlineGrillInjection(result, "spec")
  5. 重新生成 spec 草案（把 injection 作为 prompt 前缀）
  6. 重新跑 Step 2 Review

用户回复 no / decline：
  result = { kind: "skipped", reason: "user_declined" }
  spec 进入 Step 3 Lock（保留 ambiguity 警告）
```

### Inline 子流程（autonomous 模式）

```
shouldTriggerInlineGrill 返回 { trigger: false, rationale: "autonomous_mode" }
渲染 advisory：renderInlineGrillAdvisory("spec_high_ambiguity")
写入 .forge/findings/spec-ambiguity-advisory-<topic>.md：

  ---
  topic: <topic>
  reason: spec_high_ambiguity
  ambiguity_score: 0.X
  triggered_at: <ISO>
  ---

  # Spec Ambiguity Advisory

  本次 autonomous 执行检测到 spec 模糊点 N 处。建议人工 review 后，
  在交互模式下运行 /forge grill 进行需求澄清，再重新 lock spec。

  模糊条目列表：
  - <条目 1>
  - <条目 2>
  ...
```

### 落盘策略

- inline 模式（即使 completed）**不**写 `findings/grill-<topic>.md`，避免与显式 grill findings 冲突
- 对齐摘要通过 `formatInlineGrillInjection` 注入到 spec 草案重新生成的 prompt 前缀
- spec 锁定时在 frontmatter 标注 `inline_grill_applied: true` 便于追溯

## 核心子流程：decide inline grill

### 触发判定

`forge-decide` Round 2 Critic 输出后：

1. Critic 输出含 `disagreement_kind` 字段，区分 `requirement_side` / `technical_side`
2. 仅当 `requirement_side` 时考虑触发 inline grill（technical 分歧由 critic 自身处理）
3. 调用 `shouldTriggerInlineGrill({ mode, reason: "decide_requirement_disagreement", alreadyTriggered })`
4. `trigger: true` → inline grill；否则继续按 critic 反馈走 needs_revision 流程

### Inline 子流程

与 spec 路径同构，仅有以下区别：

- 决策树构建时只填充与 critic 标记的需求侧分歧相关的根节点（functionality / boundary / non_goal），跳过其他节点
- 完成后通过 `formatInlineGrillInjection(result, "decide")` 注入 Round 1 perspective Subagent 的 system context
- 触发后重新跑 Round 1（仅用户答案对应的视角，避免完全重跑）

### 与 zoom-out auto-trigger 的协同

`zoom-out-auto-trigger` spec 已定义"用户连续 3 次表达犹豫"自动触发 zoom-out。本 spec 引入新规则：

| 状况 | 优先动作 |
|------|----------|
| 用户连续 3 次犹豫 + 同时检测到需求侧分歧 | **grill 优先**，因为犹豫源于需求不明 |
| 用户连续 3 次犹豫 + critic 仅技术侧分歧 | **zoom-out** 优先（与全局位置相关） |
| 用户连续 3 次犹豫 + 无 critic 分歧 | **zoom-out**（默认） |

判定优先级写入 `shouldTriggerInlineGrill` 与 `shouldAutoTriggerZoomOut` 的协调层（在 decide driver 中）。

## 频率控制

每个会话维护：

```ts
type AlreadyTriggered = {
  spec_high_ambiguity: boolean,
  decide_requirement_disagreement: boolean,
  decide_user_hesitation: boolean,
}
```

- 每个 reason 在同一会话最多自动触发 1 次
- 显式 `/forge grill` 不计入频率限制
- 会话结束（status 转入 `completed` / `aborted`）时清零（不持久化跨会话状态）

## 文件影响

### 新增

- `src/grill-inline.ts` — 编排辅助纯函数（`shouldTriggerInlineGrill` / `renderInlineGrillConfirmPrompt` / `renderInlineGrillAdvisory` / `formatInlineGrillInjection`）
- `test/grill-inline.test.ts` — 单元测试覆盖所有判定分支
- `test/grill-inline.property.test.ts` — PBT：频率控制不变量、模式分流幂等性、advisory 渲染 round-trip
- `test/spec-inline-grill.test.ts` — spec 阶段触发的契约测试
- `test/decide-inline-grill.test.ts` — decide 阶段触发的契约测试
- `test/inline-grill-zoom-out-coordination.test.ts` — 与 zoom-out auto-trigger 的协同测试

### 修改

- `src/index.ts` — barrel 导出 `grill-inline.ts` 公共 API
- `skills/forge-spec/SKILL.md` — Step 2 Review 后增加"inline grill 触发"分支描述
- `skills/forge-decide/SKILL.md` — Round 2 Critic 后增加"requirement_disagreement → inline grill"分支
- `skills/forge-decide/references/decision-format.md` — Critic 输出 schema 增加 `disagreement_kind` 字段
- `skills/forge-grill/SKILL.md` — 标注"已支持 inline 模式被 spec/decide 调用"，主体不变
- `.forge/status.md` 写入约定 — `auto_grill_triggered` 字段记录已触发的 reason 集合

### 不变

- `skills/forge-grill/` 整个目录保留（包括 references / examples / function-contracts）
- `commands/forge-grill.md` 显式命令入口完全保留
- `src/grill.ts` 函数签名零修改
- router 全量档位前置 advisory 与"grill me / 再挖深点"关键词触发完全保留
- 所有现有 `test/grill-*.test.ts` 行为契约不变
- 显式 grill 的 findings 落盘和 resume 机制不变

## 边界与约束

- **inline 模式禁止落盘 findings**：避免和显式 grill findings 冲突。对齐摘要仅通过 prompt 注入消费
- **autonomous 模式绝不阻塞**：所有 inline 触发都转为 advisory + skip，确保 Forge Loop 流程连续
- **autonomous 模式 advisory 必须可读**：advisory 必须写到用户可见位置（spec 路径下的 advisory 文件 / decision 文档的否决记录章节），不能仅记录在 status 里
- **频率控制不跨会话持久化**：避免 `/forge resume` 后误判已触发
- **不修改 grill 核心函数**：本 spec 仅扩展调用方，不动 `src/grill.ts` 函数体
- **inline 不替代显式**：用户如认为 inline 提问深度不够，可在 spec/decide 完成后显式跑 `/forge grill`，两者结果不互斥

## 验收标准

1. spec 草案 ambiguity_score >= 阈值 + interactive 模式 → 提示用户中文确认进入 grill 子流程
2. spec 草案 ambiguity_score >= 阈值 + autonomous 模式 → 写 advisory 到 `.forge/findings/spec-ambiguity-advisory-<topic>.md`，不阻塞 spec 流程
3. decide Round 2 Critic 标记 requirement_disagreement + interactive 模式 → 提示用户进入 grill 子流程
4. decide Round 2 Critic 标记 technical_side disagreement → 不触发 inline grill，继续走原 needs_revision 路径
5. inline grill 完成后输出对齐摘要 → 注入 spec 重生成的 prompt 前缀 / Round 1 视角的 system context
6. inline grill 触发后再次满足条件 → 频率控制返回 skipped（同会话内）
7. 显式 `/forge grill` 调用与频率控制无关，行为与改造前一致
8. autonomous 模式下所有 inline 触发返回 `kind: "skipped", reason: "autonomous_mode"`
9. 用户连续 3 次犹豫 + 检测到需求侧分歧 → grill 优先于 zoom-out 触发
10. 用户连续 3 次犹豫 + 仅技术侧分歧 → zoom-out 触发，grill 不触发
11. inline grill 中途遇 glossary 冲突 → 渲染澄清提示，处理后续跑（与显式 grill 行为一致）
12. spec frontmatter 含 `inline_grill_applied: true` 标注 → 锁定后下游 plan / build 可读取该标注

## 与 ROADMAP 的关系

替代 ROADMAP v2.6 中"`forge-grill` 使用率评估，若低则并入 decide / debug"的部分：

- **结论变更**：grill skill 不下线，但能力下沉为 spec / decide 的子流程
- **R16 评估**：本 spec 实施后，grill 的实际触发覆盖面扩大（spec / decide 两个高价值触发点从"建议"变"自动"），R16 的 14 天使用率窗口判定标准应相应调整：以 inline 触发次数 + 显式触发次数合计衡量，而非仅显式触发次数

## 与其他 spec 的协同

| 相关 spec | 协同点 |
|-----------|--------|
| `zoom-out-auto-trigger` | decide 阶段双方均自动触发，本 spec 定义优先级（需求分歧 → grill；技术分歧/无分歧 → zoom-out） |
| `refactor-fix-into-build-mode` | 不直接相关。grill 仅在全量档位的 decide / spec 阶段被使用，refactor / bugfix 的 build mode 不需要 grill |
| `conflict-resolver-hook` | 不直接相关。冲突处理与需求澄清是不同生命周期的能力 |

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| spec inline grill 重新生成草案导致循环 | spec 阶段无法完成 | 频率控制 + 重新生成后强制走 Step 3 Lock，不再回 Review |
| decide inline grill 后部分视角重跑成本高 | token / 时间增加 | 仅重跑用户答案涉及的视角 Subagent，未涉及视角保留 Round 1 输出 |
| autonomous advisory 被忽略 | 模糊 spec 进入 plan/build 导致返工 | advisory 文件路径与 spec 同目录，spec frontmatter 增加 `pending_advisories: [path]` 字段引用，下游 skill 可见 |
| Critic 的 `disagreement_kind` 分类不准 | inline grill 误触发 | Critic prompt 明确分类标准 + 增加测试用例覆盖典型场景 |
| 与 zoom-out 协调层逻辑复杂 | 维护成本 | 协调层独立成纯函数 `coordinateInlineTriggers`，单元测试覆盖所有组合 |
| 用户在 inline grill 中表达不耐烦 | UX 受损 | inline grill 限制最多 N 个问题（由参数控制，默认 5），超出建议显式跑完整 grill |

## 实施顺序建议

1. **预备**：明确 `src/grill.ts` 公共 API 边界，barrel 导出，零代码改动
2. **新增编排库**：实现 `src/grill-inline.ts`（5 个纯函数）+ 单元测试 + PBT
3. **spec 接入**：`forge-spec` Step 2 Review 后增加 inline 触发分支，autonomous 写 advisory
4. **decide 接入**：`forge-decide` Round 2 Critic 输出扩展 `disagreement_kind`，增加 inline 触发分支
5. **协调层**：实现 `coordinateInlineTriggers` 处理 grill / zoom-out 优先级
6. **频率控制**：在 status.md 中维护 `auto_grill_triggered` 字段，会话结束清零
7. **文档对齐**：spec / decide / grill SKILL.md 同步更新触发点描述
8. **观察期**：14 天使用率数据采集，验证 inline 触发覆盖率与用户接受率
9. **R16 决策**：基于观察期数据决定是否进一步精简（保持现状 / 扩大触发条件 / 缩减触发条件）
