---
feature: forge-router-intent-signals
status: locked
date: 2026-05-23
workflow_variant: requirements-first
---

# Requirements Document

主题：在 `/forge` 单入口下，把用户在自然语言任务描述里表达的执行偏好
（"深思熟虑"、"严格 TDD"、"深度安全审计"等）识别为 **router intent
signals**，作为现有 `RouteHint[]` 的子类注入，由下游 SKILL 自决是否
消费；不引入 mode 概念、不新增 dispatcher 步骤、不暴露新 CLI flag。

## Introduction

`src/router.ts` 当前已经有 `tier × taskType × projectPhase × workNature`
四维输出和 `RouteHint[]` 行为提示通道（`HINT_RULES` 已映射 frontend /
backend / data / infra 等 hint 规则）。下游 SKILL 已经在消费 hints。

唯一缺失的输入维度是"用户在自然语言里直接表达的执行偏好"。本特性把这一类
输入识别为 **intent signals**，作为 `source: 'intent'` 的 RouteHint
注入 `hints[]`，复用现有通道；SKILL 自决是否消费、不消费即零回归。

设计决策与理由见 `.forge/decisions/ADR-0006-router-intent-signals.md`。
本特性**显式拒绝** mode 系统（全局执行模式调节器）、新增 CLI flag
（`--mode=ultrathink` 类）、`UserPromptSubmit` 钩子级关键词监听三种
替代方案，理由见 ADR-0006 §Rejected Alternatives。

## Glossary

- **Intent**：用户在 `/forge <自然语言>` 里表达的执行偏好语义条目。
  当前候选词典：`ultrathink`（深度推理）、`tdd-strict`（严格 TDD）、
  `security-deep`（深度安全审计）。
- **Intent 词典**：`templates/router-intents.md`，外置的中英双语关键词到
  intent 的映射表，开 PR 可调，纳入 evolved-rules 评估面。
- **Intent Hint**：由 router 识别 intent 后注入 `hints[]` 的 RouteHint
  条目，标记 `source: 'intent'`；与 taskType / projectPhase 等其他来源
  的 hint 在数据形态上完全一致。
- **Intent Tag**：Intent Hint 的机器可读标签，例如 `reasoning-deep` /
  `tdd-strict` / `security-deep`，作为 SKILL 消费时的识别键。
- **正向命中规则**：触发逻辑只允许"关键词命中即注入 hint"，**禁止**任何
  反向去噪规则（剥离 markdown 代码块、XML、URL、引用文本等）。这是
  Forge 单入口设计的复利：触发面已经被 `/forge args` 窄化。
- **SKILL 自决消费**：SKILL 自行决定是否识别并响应某个 intent tag；不识别
  的 tag 永远不阻断 dispatch，确保零回归。
- **零回归约束**：（i）当任务描述未命中任何 intent 关键词时，router 输出
  的 `ClassificationResult` 所有字段（含 `hints[]`）应与本特性引入前
  完全一致；（ii）任何新增 intent 不得引发既有 SKILL 行为变化（即未升级
  SKILL 不消费即不变化）。
- **既有基线 CLI 表面**：`/forge --help` 等本特性引入前已存在的 Forge
  flag 与子命令属于既有基线，不在本特性"不暴露新 CLI flag"承诺范围内。
  本承诺仅约束本特性**新增**的 flag（如 `--mode=`），与 ADR-0003 单入口
  收敛承诺方向一致。
- **`MAX_DICT_INTENTS` / `MAX_RUNTIME_INTENT_HINTS`**：词典治理的两个
  软警告阈值常量。前者指词典中 intent 总数（建议 ≤ 8），后者指 router
  单次输出中 `source: 'intent'` 的 hint 条目数（建议 ≤ 5）。两个阈值
  独立、不互相派生。
- **取消语义关键词集**：用于判定用户在 router Step 3 确认环节希望取消
  intent 识别的关键词清单：`取消` / `忽略` / `不要` / `跳过` / `撤销` /
  `cancel` / `skip` / `no intent` / `ignore`，case-insensitive 全词匹配。
- **Intent Hints 小节**：SKILL `instructions.md` 中的可选小节，按建议
  列出该 SKILL 识别的 intent tag 与对应行为差异。文档约定，**非 CI
  强制项**。

## Requirements

### Requirement 1: 数据形态扩展（不新增类型）

**User Story:** 作为 router 维护者，我希望 intent 信号复用现有 `RouteHint`
类型，避免引入新数据形态，降低下游 SKILL 与审计/可观测系统的认知与改动
成本。

#### Acceptance Criteria

- 当 router 输出 `ClassificationResult.hints[]` 时，每个条目应当为
  `RouteHint` 类型；该类型新增可选字段
  `source: 'taskType' | 'projectPhase' | 'workNature' | 'intent'`。
- 当 router 输出 hint 但未显式设置 `source` 字段时，序列化层应当将其
  填充为 `'taskType'`；当 SKILL 读取 hint 且 `source` 字段缺失时，
  应当容错按 `'taskType'` 处理。两侧默认值一致。
- 当 router 识别到 intent 关键词时，对应的 `RouteHint` 条目 `source` 字段
  应当为 `'intent'`，其余字段（`command` / `tag` / `description`）形态与
  现有 hints 一致。
- 当本特性引入后任何新增类型出现在 `src/router.ts`（例如 `Mode` /
  `IntentResult` / `RouterDecision` 等）时，CI 守门
  `scripts/check-router-no-new-types.mjs` 应当以非零退出阻断。
- 当 SKILL 读取 hints 时，未升级 SKILL 应当能不区分 source 字段地遍历
  整个数组；`source` 字段缺失或未识别值不得引发解析失败。
- 当任务描述未命中任何 intent 关键词时，`ClassificationResult` 所有字段
  应当与本特性引入前完全一致；CI 守门 `scripts/check-router-zero-regression.mjs`
  应当对一组 ≥ 20 条 golden 任务描述（不含 intent 关键词）执行 router 并
  对输出做 snapshot 比对，任何字段差异以非零退出阻断。

### Requirement 2: 触发位置（不新增 dispatcher 步骤）

**User Story:** 作为 dispatcher 维护者，我希望本特性不动 9 步骨架，避免
ADR-0004 的修订与回归测试范围扩大。

#### Acceptance Criteria

- 当 dispatcher 启动时，9 步骨架应当与本特性引入前完全一致：
  `resolveDispatcherMode → validateTopic → resolveLibPath → checkIntegrity
  → resolveAllowedTools → resolveDispatchMode → wrapWorkspaceContext →
  dispatch → appendAuditLog`。
- 当 router skill（`skills/forge/lib/router/instructions.md`）执行时，
  intent 识别应当合并到 Step 1（分析任务描述）内部，不新增独立步骤。
- 当 `src/forge-dispatcher.ts` 在本特性提交后被修改时，CI 守门
  `scripts/check-dispatcher-skeleton.mjs` 应当对 `dispatchForgeSubcommand`
  主函数的步骤数与步骤名做快照对比，任何步骤增删/重命名应当以非零退出
  阻断。
- 当 router 在 Step 1 中识别 intent 失败（关键词表加载错误、词典
  解析失败等）时，应当回退为不发出 intent hint，不阻断 router 流程；
  写入告警事件 `intent_dictionary_load_failed`。

> **Implementation Note (R2-3)**：步骤增删/重命名通过 ADR-0004 修订流程
> 解决，不在 CI acceptance 范围内；CI 仅做快照阻断。

### Requirement 3: 词典与正向命中规则

**User Story:** 作为开发者，我希望 intent 词典外置可读、跨语言支持、命中
规则简单，避免重蹈 OMC 反向去噪化石层的覆辙。

#### Acceptance Criteria

- 当本特性首次落地时，应当在 `templates/router-intents.md` 维护词典；
  schema 至少包含 `intent_name`、`triggers[]`（中英双语）、`emit_hints[]`
  （形如 `{ command, tag }`）三字段。
- 当 router 解析任务描述时，关键词匹配应当为 case-insensitive + unicode
  NFC normalize 的全词匹配；不应当对 markdown 代码块、XML、URL、引用
  文本做任何剥离或过滤。
- 当 `src/router.ts` 或 `src/router-intents.ts` 被修改时，CI 守门
  `scripts/check-router-no-anti-noise.mjs` 应当通过 AST 扫描判定剥离类
  语义，对任何在 router 输入预处理阶段对 `args` 字符串做内容剥除的代码
  模式（含 `String.prototype.replace` 含通配/标签/URL 模式、`split` +
  `slice` 链式截取、自定义剥离辅助函数等）以非零退出阻断；判定不依赖纯
  文本正则匹配，避免被链式调用绕过。
- 当一个关键词在词典中映射到多个 intent 时，CI 应当以非零退出阻断（一个
  关键词只能属于一个 intent，避免歧义）。
- 当词典中某 intent 的 `triggers[]` 为空数组时，CI 应当阻断（任何 intent
  必须至少有一个触发关键词）。
- 当词典中某 intent 的 `emit_hints[]` 为空数组时，CI 应当阻断（任何
  intent 必须至少注入一条 hint，否则识别即无效）。

### Requirement 4: SKILL 消费契约（建议而非强制）

**User Story:** 作为 SKILL 维护者，我希望识别新 intent 是渐进式可选项，
不识别也不破坏现有行为。

#### Acceptance Criteria

- 当 SKILL `instructions.md` 收到含 `source: 'intent'` 的 hint 时，是否
  消费由 SKILL 自决；不消费的 SKILL 行为应当与不传该 hint 时完全一致。
- 当词典新增一个 intent 时，所有未升级 SKILL 应当不需要任何代码或文档
  改动；该 intent 在新 SKILL 升级前自然处于"识别但未消费"状态。
- 当 SKILL 决定消费某 intent tag 时，应当在自身 `instructions.md` 增加
  一段"Intent Hints"小节（参见 Glossary），列出识别的 tag 与对应行为
  差异。
- 当 dispatcher 步骤 7 `wrapWorkspaceContext` 把 `hints[]` 注入 SKILL
  上下文时，应当保留原有结构（每个 hint 含 `command` / `tag` /
  `description` / `source`），不为 intent 类 hint 做特殊渲染。

### Requirement 5: 透明性与用户控制

**User Story:** 作为开发者，我希望在 router 启动序列前能看到识别到的
intent 信号，并能取消错误识别。

#### Acceptance Criteria

- 当 router Step 3"建议档位 + 维度"环节展示 hints 时，应当把
  `source: 'intent'` 的条目独立分组显示，标题为"识别到的执行偏好
  (Intent Signals)"，与 taskType / projectPhase 来源的 hint 视觉上可区分。
- 当用户在 Step 3 确认环节回答的文本经 NFC normalize 后命中
  Glossary 定义的"取消语义关键词集"时，router 应当从 `hints[]` 中剔除
  全部 `source: 'intent'` 条目；当回答文本同时命中某具体 intent 名称
  （如 `ignore ultrathink`）时，应当仅剔除该 intent 注入的条目；其他
  来源的 hint 不受影响。
- 当用户回答未命中"取消语义关键词集"时，router 应当保留全部 intent
  hints 进入下一阶段。
- 当 router 输出 `hints[]` 时，audit log 应当复用现有 hints 字段记录
  完整数组（含 source）；不新增 audit schema。
- 当 audit log 中 30 天内某 intent 命中次数 < 5 时，`/forge learn` 应当
  把该 intent 标记为退役候选并写入 evolved-rules 评估面。
- 当用户调用 `/forge --help` 或 `/forge` 帮助路径时，输出应当包含当前
  词典中所有 intent 的名称与简介，让用户知晓可用偏好；无需展示完整
  关键词清单（避免"教模型 SQL 注入"式的负反馈）。`--help` 是既有基线
  CLI 表面（参见 Glossary），不与"不暴露新 CLI flag"承诺冲突。

### Requirement 6: 词典扩张治理（不设硬上限）

**User Story:** 作为产品负责人，我希望 intent 词典随项目演化能自然增长，
但有软约束防止失控。

#### Acceptance Criteria

- 当 `templates/router-intents.md` 中 intent 总数 > `MAX_DICT_INTENTS`
  （= 8，参见 Glossary）时，CI 应当输出 P2 警告（非阻断），提示考虑
  合并相近 intent 或退役低使用率条目。
- 当 `templates/router-intents.md` 中单 intent 的 `triggers[]` 长度
  > 20 时，CI 应当输出 P2 警告（非阻断），提示考虑拆分语义。
- 当 `templates/router-intents.md` 修改提交时，
  `scripts/lint-evolved-rules.mjs` 应当将 diff 写入 rule-changelog 渲染
  输入。
- 当 router 输出 hints 时，单次输出 `source: 'intent'` 条目数 >
  `MAX_RUNTIME_INTENT_HINTS`（= 5，参见 Glossary）应当触发运行时告警
  事件 `intent_overload`（非阻断），写入 audit log。

> **Process Note (PR template, not CI-enforced)**：新增 intent 的 PR
> 描述应当（i）标注预期 SKILL 消费方与覆盖场景，（ii）至少声明一个
> 已上线或同 PR 落地的 SKILL 消费方。该约束在 PR 模板与 evolved-rules
> 评审流程中执行，不进入 acceptance criteria。

### Requirement 7: 与现有维度的优先级与冲突处理

**User Story:** 作为 router 维护者，我希望 intent 信号与已有四维信号
（tier / taskType / projectPhase / workNature）以及 prompt-defense
警告通道协同工作，规则清晰。

#### Acceptance Criteria

- 当 intent 信号与 tier 决策冲突（例如 intent 暗示"深思熟虑"但 tier 为
  light）时，router 应当**保留 tier 不变**，仅把 intent hint 注入对应
  command 的 hints；tier 升级仅遵循现有信号优先级（用户覆盖 > 全量信号
  > 标准信号 > 轻量信号 > 默认标准）。
- 当 intent hint 的 `command` 字段不在 tier 对应的 `commandSequence` 中
  （例如 light tier 不含 `decide`，但 intent 注入了 `command: 'decide'`
  的 hint）时，router 应当丢弃该 hint 并写入告警事件
  `intent_hint_unreachable`，不阻断流程。
- 当多个 intent 命中并对同一 `(command, tag)` 注入重复 hint 时，
  router 应当去重保留一份；`description` 取首次命中的 intent 名。
- 当用户自然语言中既含 intent 关键词、又含明确 tier 覆盖语句（如"用 full
  档位"）时，router 应当（i）按用户覆盖设定 `tier`；（ii）独立按
  R7 第 2 条规则处理 intent hint 的可达性，不因 tier 覆盖而抑制 intent
  匹配。
- 当 router 单次调用识别到 ≥ 1 个 intent 时，`ClassificationResult.reason`
  字段应当在原文末尾追加一行简介（例如 `intent: ultrathink (深思熟虑命中)`），
  保持向后兼容的字符串结构。
- 当 `scanInput`（prompt-defense）对任务描述返回 `severity: 'critical'` 或
  `severity: 'high'` 警告时，router 应当**先按 prompt-defense 既有路径
  处理**（中止 / 净化 / 警告 hint），不应当将该任务描述送入 intent
  关键词匹配；intent hints 数组应当为空。
- 当 `scanInput` 返回 `severity: 'medium'` 警告时，router 应当继续 intent
  匹配，但 audit log 应当同时记录 `prompt-defense-warning` hint 与
  `source: 'intent'` hint 两类信号，以便事后审查。
- 当 `scanInput` 返回 `severity: 'low'` 或无警告时，intent 匹配按 R3 正常
  执行，无额外约束。
