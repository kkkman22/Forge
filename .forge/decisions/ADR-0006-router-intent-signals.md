---
id: "ADR-0006"
title: "Router Intent Signals — extend RouteHint instead of introducing a mode system"
status: accepted
date: "2026-05-23"
deciders:
  - "@king"
related_adrs:
  - "ADR-0003" # single-entry command consolidation
  - "ADR-0004" # skills collapse and dispatcher
  - "ADR-0005" # review subagent prompt diff context
---

# ADR-0006: Router Intent Signals — extend `RouteHint` instead of introducing a mode system

## Context

调研 oh-my-claudecode (OMC) 时观察到一类需求：用户在自由文本里表达"深思熟虑"、
"严格 TDD"、"深度安全审计"等执行偏好，希望工具能识别并兑现。OMC 用一个全局
mode 系统（ultrathink / tdd / security-review …）实现，配套
`scripts/keyword-detector.mjs` + `sanitizeForKeywordDetection` +
`isReviewSeedContext` 等四个反向去噪函数，化石层显著。

第一轮设计（已撤销的 ADR-0006 草稿与 `forge-router-mode-inference` spec）
直接照搬 mode 系统并尝试用"硬上限 6 项 + CI 守门"对冲扩张风险。复盘后确认
该方案对 Forge 不成立：

1. **哲学冲突**：Forge 的 `default = correct` 哲学（IRON-LAW 风格）与"用户
   选择 mode" 之间存在张力。每加一个 mode，潜台词都是"承认默认路径有 N 种
   正确"，与 §2.1 / §2.2 / §2.7 等铁律的精神反向。
2. **真实需求缺位**：ROADMAP 与 ADR-0001 ~ 0005 中没有任一未解决问题指向
   "需要执行模式调节器"。撤销前的草案是"有解决方案在找问题"。
3. **更小解法存在**：router 已经有 `tier × taskType × projectPhase ×
   workNature` 四维输出与 `RouteHint[]` 行为提示通道（`src/router.ts`
   `RouteHint` / `HINT_RULES`），SKILL 已经会消费 hints。把"用户在自然语言
   里表达的执行偏好"作为**新一类 hint** 注入即可，不需要全局 mode 注册表，
   不需要新增 dispatcher 步骤。

需要解决的核心问题是：
**当用户在 `/forge <自然语言>` 中表达执行偏好（深思熟虑、test-first、
深度安全审计等）时，如何让 Forge 在不破坏单入口、不引入全局可选项、不
形成 OMC 式去歧义化石层的前提下，把这些偏好兑现到下游 SKILL 的实际行为里？**

## Decision

把这一类信号叫作 **Router Intent Signals**，作为现有 `RouteHint` 的子类
落地，**不引入 mode 概念**、**不新增 dispatcher 步骤**、**不暴露 CLI flag**。

### 1. 数据形态：扩展 `RouteHint`，不新增类型

`src/router.ts` 现有：

```ts
export interface RouteHint {
  command: string;     // 哪个 sub 接收
  tag: string;         // 机器可读标签
  description: string; // 人类可读描述
}
```

新增一个可选字段标记来源，便于审计与退役评估：

```ts
export interface RouteHint {
  command: string;
  tag: string;
  description: string;
  source?: 'taskType' | 'projectPhase' | 'workNature' | 'intent';
}
```

Intent 信号作为 `source: 'intent'` 的 RouteHint 进入 `hints[]` 数组。
不新增任何顶层类型、不新增 dispatcher 字段、不新增 SKILL frontmatter 字段。

### 2. Intent 词典：白名单 + SKILL 自决

`templates/router-intents.md` 维护一份**白名单词典**（中英双语，开 PR
可调，纳入 evolved-rules 评估面）：

```yaml
# templates/router-intents.md（草案，最终入库时按 evolved-rules 流程审）
ultrathink:
  triggers:   ['深思熟虑', '深度推理', '慎重决策', 'ultrathink', 'think hard']
  emit_hints: # 注入哪些 hint，由 SKILL 自决是否消费
    - { command: 'decide', tag: 'reasoning-deep' }
    - { command: 'plan',   tag: 'reasoning-deep' }
    - { command: 'debug',  tag: 'reasoning-deep' }

tdd-strict:
  triggers:   ['严格 tdd', 'test-first', '测试先行', 'tdd-strict']
  emit_hints:
    - { command: 'build', tag: 'tdd-strict' }
    - { command: 'fix',   tag: 'tdd-strict' }

security-deep:
  triggers:   ['安全审计', '威胁建模', 'security-deep', 'threat model']
  emit_hints:
    - { command: 'review', tag: 'security-deep' }
    - { command: 'decide', tag: 'security-deep' }
```

**关键差异**：

- **不是 mode**：词典条目本身没有"启用/关闭"的执行语义；它只决定 **emit
  哪些 hint**。是否兑现这些 hint，是 SKILL 的事。
- **SKILL 是消费者**：`forge-decide` 看到 `reasoning-deep` hint 时，可以
  选择把 critic 轮数从 1 加到 2；`forge-build` 看到 `tdd-strict` hint 时，
  可以选择把 RED/GREEN 强制拆成两次原子提交。**不消费就当没看见**——这是
  零回归约束的语义保障。
- **不引入反向去噪**：触发只允许"正向命中关键词"，禁止任何剥离 markdown
  代码块、XML、URL 之类的反向规则。这是因为 router 跑在 `/forge args` 这
  个窄输入面上（与 OMC 跑在 `UserPromptSubmit` 完全不同），所以不需要
  反向去噪。CI 守门 `scripts/check-router-no-anti-noise.mjs` 静态扫描
  `src/router.ts` 与新增的 `src/router-intents.ts`，任何剥离类正则都会
  阻断构建。

### 3. 触发位置：router Step 1 内部，不新增 dispatcher 步骤

`skills/forge/lib/router/instructions.md` 现有 4 步流程（分析 → 建议
档位 → 用户确认 → 启动序列）。Intent 识别合并到 Step 1（"分析任务描述"）
内部，**不新增独立步骤**，输出仍是 `ClassificationResult`，hints 数组中
增加 `source: 'intent'` 的条目。

`src/forge-dispatcher.ts` 9 步骨架完全不变，无需 ADR-0004 的修订。

### 4. 透明性：写入 hints 列表 + audit log 现有字段复用

- Router 在 Step 3"建议 + 用户确认"环节展示 hints 时，`source: 'intent'`
  的条目独立分组显示，让用户清楚哪些 hint 来自任务描述识别、哪些来自
  taskType/projectPhase 自动推断。
- 用户回答"取消 intent 信号"时，router 把所有 `source: 'intent'` 的 hint
  从 `hints[]` 中剔除后再启动序列；其他维度的 hint 不受影响。
- audit log 复用现有的 `hints` 字段，不新增 schema；`source: 'intent'`
  作为既有字段的可选枚举值出现。

### 5. SKILL 消费契约（建议而非强制）

每个被 intent 触及的 SKILL 在 `instructions.md` 增加一段
"Intent Hints"小节，明确：

- 该 SKILL 识别哪些 intent tag
- 每个 tag 的具体行为差异（例如 `tdd-strict` → "每个任务拆 RED + GREEN
  两次原子提交"）
- 不识别的 tag 直接忽略

未识别的 hint tag **永不阻断 dispatch**——这是 router 与 SKILL 的解耦
契约。新加 intent 不需要全量 SKILL 同步升级。

### 6. 词典上限与退役机制

- 词典条目数无硬上限，但有**软提示阈值**：超过 8 条时 CI 输出 P2 警告，
  提示考虑合并或退役。
- 30 天 audit log 中命中次数 < 5 的 intent 标记为退役候选，由
  `/forge learn` 写入 evolved-rules 评估面。
- 关键词跨语言（中/英）使用 case-insensitive + unicode-normalize 全词
  匹配；同一关键词只能映射到一个 intent，CI 阻断重复。

## Consequences

### Positive

- **无新概念**：复用现有 `RouteHint` + `hints[]` 通道，文档与认知负担为零。
- **零 dispatcher 改动**：9 步骨架不变，ADR-0004 不需修订。
- **SKILL 自决 = 零回归**：不消费 hint 的 SKILL 行为完全不变，老 SKILL
  即便不识别 intent tag 也无副作用。
- **天然免疫 OMC 化石层**：router 跑在 `/forge args` 窄输入面上，触发
  规则只有"正向命中"一类，不需要反向去噪函数。CI 守门强制锁定这一点。
- **可观测**：`source: 'intent'` 字段进入 audit log 后，可分析每个
  intent 的命中率、用户取消率、SKILL 消费率，形成正反馈。

### Negative

- **SKILL 消费一致性**：不同 SKILL 对同一 tag 的解释可能漂移。缓解方案
  是把每个 tag 的 SKILL 消费契约写入 `templates/router-intents.md` 作为
  规范参考，但不强制；CI 不校验"SKILL 是否真的实现了 tag"。
- **词典维护成本**：跨语言关键词需要持续维护；通过 evolved-rules 流程
  约束扩张速率。
- **首批 intent 的认知**：用户不知道某个 intent tag 存在时，无法显式调用。
  缓解方案：router Step 3 用户确认环节展示已识别 intent；`/forge` 帮助
  文档列出当前词典。

### Neutral

- 不传任何 intent 信号时，router 输出与今天完全一致；这是与 ADR-0003
  单入口承诺的对齐基准。
- 与未来"显式入口"演化路径正交：若将来用户希望直接传 `/forge ultrathink
  plan ...`，可作为 router 的 trivial parser 扩展，不影响本 ADR 决策。

## Rejected Alternatives

### Mode 系统（最初草案，已撤销）

- 形态：`MODES` 注册表 + dispatcher 6.5 步 + 全局上下文注入
- 拒绝理由：与"default = correct"哲学冲突；OMC 经验显示 mode 数量必然
  随时间增长（其他事物相同则给用户多一个开关总是诱人）；引入新 dispatcher
  步骤违反 ADR-0004 骨架稳定性约束；草案为"解决方案找问题"。

### `--mode=` flag 的轻量版本

- 形态：`/forge plan --mode=ultrathink ...`
- 拒绝理由：暴露用户面 CLI flag 与 ADR-0003 单入口承诺正面冲突；用户记忆
  面从"`/forge` 一个命令"扩到"`/forge` + N 个 mode + 何时该用哪个 mode"。

### 在 `UserPromptSubmit` 钩子里识别关键词（OMC 路线）

- 形态：每条用户消息都扫一遍关键词
- 拒绝理由：输入面太宽，必须配套反向去噪化石层；与 Forge 的窄输入面
  设计哲学反向。
