---
feature: ddd-tactical-bdd-collaboration
layout: design
created: 2026-05-09
---

# Design Document

## 1. Overview

本设计将 12 条 Requirement 落到 **6 个 Core 新模块 + 1 个新 skill + 1 个新 agent + 若干 Pack 扩展**，全部依赖 Sprint 1 的 Pack 基础设施和 Sprint 2 的 PMS Pack。遵循"引擎在 Core，数据与规则在 Pack"原则：战术模板渲染器、Living Doc 生成器、Context Boundary Hook、Pack Lint Rule 加载器在 Core；具体 PMS 战术模板、Money/Time lint 规则、场景库在 Pack。

映射关系：

| Requirement | 主要实现载体 |
|---|---|
| R1 Core 战术模板 | `templates/ddd/` 6 模板 + `src/template-renderer.ts` |
| R2 PMS Pack 战术模板覆盖 | `packs/pms/templates/ddd/` 4 模板 |
| R3 forge-storm | `skills/forge-storm/SKILL.md` + `src/storm.ts` |
| R4 Context Boundary Hook | `hooks/hooks.json` + `scripts/check-context-boundary.sh` + `src/context-boundary.ts` |
| R5 business-analyst agent | `.claude/agents/business-analyst.md` + `src/spec.ts` 扩展 |
| R6 活文档 | `src/living-doc/generator.ts` + `src/living-doc/renderer.ts` + `/forge spec --living-doc` flag |
| R7 Money Lint | `packs/pms/lint-rules/money/` + `src/lint/pack-rules.ts` |
| R8 Time Lint | `packs/pms/lint-rules/time/` + 共用 Pack Lint 加载器 |
| R9 PMS 场景库扩展 | `packs/pms/scenarios/` 新增 5 子目录 × 5 场景 = 25+ |
| R10 Customization Sample | `packs/pms-marriott-sample/` |
| R11 core_subdomains 声明 | Sprint 1 PackManifest 扩展 + PMS Pack 配置 |
| R12 NFR | property tests + 扩展 zero-pack-invariant test + TSDoc |

## 2. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           Forge Core（Sprint 3 扩展）                       │
│                                                                            │
│  Sprint 3 新增：                                                            │
│  ├── src/template-renderer.ts        DDD 战术模板占位符替换引擎             │
│  ├── src/storm.ts                    事件风暴交互引导 + 文件输出            │
│  ├── src/context-boundary.ts         跨 Context 依赖判定引擎                │
│  ├── src/lint/pack-rules.ts          Pack-provided lint 规则加载器          │
│  ├── src/living-doc/generator.ts     活文档数据聚合                         │
│  └── src/living-doc/renderer.ts      HTML 渲染（无框架）                    │
│                                                                            │
│  Sprint 3 扩展点：                                                          │
│  ├── src/spec.ts          + business-analyst 并行触发（Core 子域）          │
│  ├── src/pack/types.ts    + core_subdomains 字段                            │
│  ├── hooks/hooks.json     + Write/Edit PreToolUse context boundary         │
│  └── scripts/init.sh      （已支持 --pack，Sprint 2）                       │
│                                                                            │
│  Sprint 3 新 skill / agent：                                                │
│  ├── skills/forge-storm/SKILL.md                                           │
│  └── .claude/agents/business-analyst.md                                    │
└────────────────────────────────────────────────────────────────────────────┘
                                  │  消费 Pack 数据
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           PMS Pack 扩展                                     │
│                                                                            │
│  packs/pms/                                                                │
│  ├── pack.yaml                        + core_subdomains 字段                │
│  ├── templates/ddd/                    Sprint 3 填充 4 个 PMS 战术模板      │
│  │   ├── reservation-aggregate.ts.template                                 │
│  │   ├── folio-aggregate.ts.template                                       │
│  │   ├── room-value-object.ts.template                                     │
│  │   └── guest-profile-value-object.ts.template                            │
│  ├── lint-rules/                                                           │
│  │   ├── money/                        Sprint 3 填充                         │
│  │   │   ├── no-number-for-money.ts                                        │
│  │   │   ├── require-money-factory.ts                                      │
│  │   │   └── explicit-currency-exchange.ts                                 │
│  │   └── time/                                                             │
│  │       ├── no-raw-date-in-domain.ts                                      │
│  │       └── prefer-business-day-clock.ts                                  │
│  ├── scenarios/                                                            │
│  │   ├── check-in/     (Sprint 2) ← 5                                      │
│  │   ├── check-out/    (Sprint 2) ← 3                                      │
│  │   ├── night-audit/  (Sprint 2) ← 4                                      │
│  │   ├── reservation/  (Sprint 2) ← 4                                      │
│  │   ├── folio/        (Sprint 2) ← 4                                      │
│  │   ├── overbooking/  (Sprint 3) ← 5                                      │
│  │   ├── corporate/    (Sprint 3) ← 5                                      │
│  │   ├── pos-integration/ (Sprint 3) ← 5                                   │
│  │   ├── invoice-tax/  (Sprint 3) ← 5                                      │
│  │   └── loyalty/      (Sprint 3) ← 5                                      │
│  └── agents/                           Sprint 3 预留（当前 Sprint 不新增）   │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│                 Customization Sample（新 Pack）                              │
│                                                                            │
│  packs/pms-marriott-sample/                                                │
│  ├── pack.yaml                         depends_on: [pms], experimental: true│
│  ├── README.md                                                             │
│  ├── contexts/bonvoy-loyalty.md        新 Bounded Context                   │
│  ├── glossary/folio-billing.md         追加章节（非覆盖），union             │
│  ├── state-machines/reservation.yaml   完全覆盖（新增 AwaitingLoyaltyUpgrade）│
│  └── scenarios/bonvoy/                                                      │
│      ├── earn-points.feature                                               │
│      └── platinum-upgrade.feature                                          │
└────────────────────────────────────────────────────────────────────────────┘
```

## 3. Data Model

### 3.1 Template Placeholder Schema

```ts
interface TemplateContext {
  [placeholder: string]: string | string[] | Record<string, unknown>;
}

// 约定：{{name}} 替换字符串；{{#each items}} ... {{/each}} 循环；{{#if cond}} ... {{/if}} 条件
// 选择最简可用的替换语法，不引入 Handlebars 等依赖

interface TemplateRenderResult {
  content: string;
  unresolvedPlaceholders: string[];    // 为空表示全部替换成功
  outputSuggestedPath: string;          // 基于 AggregateName 推导，如 src/domain/reservation/reservation.ts
}
```

### 3.2 Event Storm File Format

```markdown
---
context: reservations
started_at: "2026-05-09T09:00:00Z"
last_updated: "2026-05-09T10:30:00Z"
phase_completed: read_models   # 或 events / commands / aggregates / policies / read_models
---

## Events

- **ReservationBooked** — 新预订已创建。来源：customer web booking
- **ReservationConfirmed** — 预订已支付保证金确认。来源：payment webhook
- ...

## Commands

- **BookReservation** — 客人或前台提交预订请求
- ...

## Aggregates

- **Reservation** — 由 Book/Confirm/Cancel/CheckIn 等 Command 和对应 Events 构成
- ...

## Policies

- **AutoCancelOnPaymentTimeout** — 30 分钟未支付保证金自动取消
- ...

## Read Models

- **OccupancyDashboard** — 从 CheckedIn/CheckedOut 投影实时入住率
- ...
```

### 3.3 Living Doc Data Aggregate

```ts
interface LivingDocData {
  generatedAt: string;                      // ISO
  contexts: Map<string, LivingDocContext>;  // key = context name
  globalStats: { totalScenarios: number; pass: number; fail: number; pending: number };
}

interface LivingDocContext {
  name: string;
  specs: Array<{
    topic: string;
    scenarios: LivingDocScenario[];
    specPath: string;
  }>;
  stats: { total: number; pass: number; fail: number; pending: number };
}

interface LivingDocScenario {
  title: string;
  tags: string[];
  lastVerdict: "pass" | "fail" | "pending" | "skip";
  lastRunAt: string | null;
  sourceLine: number;
  acceptanceReportPath: string | null;
}
```

### 3.4 Context Boundary Check Input/Output

```ts
interface BoundaryCheckInput {
  filePath: string;
  fileContent: string;              // proposed new content (from Write/Edit tool)
  contextMap: ContextRegistry;      // Sprint 1
  ownershipMap: Record<string, string>;  // path glob → context name
}

interface BoundaryCheckResult {
  violations: Array<{
    sourceContext: string;
    targetContext: string;
    importStatement: string;
    line: number;
    relationshipType: string | "undeclared";
    suggestion: string;
  }>;
  escapeHatchUsed: number;          // count of // @forge:allow-cross-context comments
}
```

### 3.5 Pack Lint Rule Manifest

```ts
// packs/pms/lint-rules/manifest.yaml
rules:
  - id: money/no-number-for-money
    severity: warn
    entry: ./money/no-number-for-money.ts
    target_globs: ["src/**/*.ts"]
    description: "禁止 number 类型承载金额"
  - id: money/require-money-factory
    severity: error
    entry: ./money/require-money-factory.ts
    target_globs: ["src/domain/**/*.ts"]
  - id: time/no-raw-date-in-domain
    severity: error
    entry: ./time/no-raw-date-in-domain.ts
    target_globs: ["src/domain/**/*.ts"]
```

## 4. Component Design

### 4.1 `src/template-renderer.ts`

```ts
export function renderTemplate(
  templateContent: string,
  context: TemplateContext,
): TemplateRenderResult;
```

实现：
- 简单 `{{name}}` 占位符：`templateContent.replace(/\{\{(\w+)\}\}/g, ...)`
- `{{#each items}}...{{/each}}`：正则匹配 + 内部重复 + 递归渲染
- `{{#if cond}}...{{/if}}`：正则匹配 + 条件取舍
- 不引入 Handlebars 依赖；若逻辑复杂度超出上述三种语法，考虑升级到 Handlebars（Sprint 3 范围内先用简易实现）

### 4.2 `src/storm.ts`

```ts
export interface StormState {
  context: string;
  startedAt: string;
  lastUpdated: string;
  phaseCompleted: "none" | "events" | "commands" | "aggregates" | "policies" | "read_models";
  items: {
    events: StormItem[];
    commands: StormItem[];
    aggregates: StormItem[];
    policies: StormItem[];
    readModels: StormItem[];
  };
}

export interface StormItem {
  name: string;
  description: string;
  source?: string;
}

export function loadStormState(filePath: string): StormState | null;
export function saveStormState(state: StormState, filePath: string): void;
export function nextPhase(state: StormState): StormState["phaseCompleted"] | null;
export function serializeStormMarkdown(state: StormState): string;
```

Skill (`skills/forge-storm/SKILL.md`) 驱动交互：
- 第一次调用时检查 `.tinkerman/contexts/<context>/event-storm.md` 是否存在
- 存在 → `loadStormState` 并从 `phaseCompleted` 后续阶段继续
- 不存在 → 从 Phase 1 (events) 开始
- 每阶段：AI 按 Socratic 问答引导用户，用户回答 → AI 提取 items → 写入 state → `saveStormState`
- 所有阶段完成 → 输出完整 event-storm.md + 提示 `/forge spec` 可引用它

### 4.3 `src/context-boundary.ts`

```ts
export function loadOwnershipMap(
  projectRoot: string,
  enabledPacks: EnabledPacks,
): Record<string, string>;       // glob → context name

export function resolveFileContext(
  filePath: string,
  ownershipMap: Record<string, string>,
  jsdocContext: string | null,    // 从文件首注释解析的 @context 标签
): string | null;

export function parseImports(fileContent: string): Array<{
  module: string;
  line: number;
  hasEscapeHatch: boolean;
}>;

export function checkBoundary(input: BoundaryCheckInput): BoundaryCheckResult;
```

Hook 脚本流程：
1. `node scripts/check-context-boundary.mjs <file-path>` 接收参数
2. 读 `.tinkerman/contexts/ownership.yaml`（项目级） + enabled packs 的 contexts 路径映射
3. 解析目标文件 imports（用已有 TS AST 工具或手写 regex）
4. 解析每个 import 的目标 context（根据 import path 匹配 ownership map）
5. 查 Context_Map 判定关系类型
6. 累计 violations，任一 violation → 非零退出
7. 格式化 R4.3 的阻断消息到 stderr

`jsdocContext` 解析：从文件前 200 行扫描 `@context <name>` JSDoc tag；无则 fallback 到 ownership map；都无 → 视为"未归属"，hook no-op。

### 4.4 `src/lint/pack-rules.ts`

```ts
export function loadPackLintRules(enabledPacks: EnabledPacks): PackLintRule[];

export interface PackLintRule {
  id: string;
  severity: "error" | "warn";
  entryPath: string;     // 绝对路径
  targetGlobs: string[];
  sourcePack: string;
}

export function applyLintRulesToFile(
  filePath: string,
  fileContent: string,
  rules: PackLintRule[],
): LintFinding[];
```

实现策略：
- v1 不动态 `require()` 或 `import()` 规则文件（安全考量）
- 规则以 **声明式 YAML** 形式存储（`packs/<pack>/lint-rules/<rule>.yaml`）而非可执行 TS
- YAML 规则 schema：`pattern`（regex or AST selector）+ `severity` + `message` + `fix_suggestion`
- `src/lint/pack-rules.ts` 提供执行器，按 glob 匹配文件，逐条规则应用

更新 R7/R8 为：规则以 YAML 声明式定义，执行器在 Core。这比 R7.1 写的"ESLint/Biome plugin"更适配 Forge 单仓库零依赖原则。

**修订后的规则 YAML 示例**（`packs/pms/lint-rules/money/no-number-for-money.yaml`）：

```yaml
id: money/no-number-for-money
severity: warn
description: "禁止 number 类型承载金额"
target_globs:
  - "src/**/*.ts"
patterns:
  - type: regex
    expression: "(?:const|let|var)\\s+(?:amount|price|cost|fee|charge|total|balance|subtotal|tax)\\s*:\\s*number\\b"
    message: "金额类变量应使用 Money 值对象，不应直接用 number 类型"
    fix_suggestion: "改用 Money: `const amount: Money = Money.of(100, 'CNY')`"
```

此调整需在 R7/R8 文档说明，但不改变用户可见行为（规则仍在文件编辑时生效，只是内部实现从插件转为声明式）。

### 4.5 `src/living-doc/generator.ts`

```ts
export async function generateLivingDoc(
  projectRoot: string,
  outputDir: string,
): Promise<LivingDocData>;
```

实现：
1. 扫描 `.tinkerman/specs/*/spec.md`，解析 frontmatter.context + `## Scenarios` 段
2. 解析每个 Scenario title / tags / source line（用 Sprint 1 scenario-linter 的解析能力）
3. 扫描 `.tinkerman/acceptance/*/report.md`，解析 `verdicts_summary` 和 scenario-level verdicts
4. merge per-scenario verdict（按 title 匹配，最新 report 胜出）
5. 聚合成 `LivingDocData` 按 context 分组
6. 调 `renderer.ts` 生成 HTML

### 4.6 `src/living-doc/renderer.ts`

```ts
export function renderLivingDoc(data: LivingDocData, outputDir: string): void;
```

产出：
- `<outputDir>/index.html` — landing page (模板字符串 + 数据填充)
- `<outputDir>/<context>.html` — per-context page
- `<outputDir>/assets/styles.css` — inline-safe styles
- `<outputDir>/assets/app.js` — 可选的筛选/搜索 JS（vanilla）

HTML 模板使用 ES template literal 字符串 + 数据替换；不引入 Handlebars / React / 任何渲染框架。

### 4.7 `skills/forge-storm/SKILL.md`

主体 ≤150 行，结构：
- frontmatter（name, description, disable-model-invocation: true）
- `## 1. Overview` — Event Storming 方法论简介
- `## 2. When to Use` — 新 Bounded Context 建模、核心子域探索、预 `/forge decide`
- `## 3. Five-Phase Flow` — 每阶段目标 + Socratic 问题清单
- `## 4. Interactive Patterns` — 提问节奏（one at a time）、如何辨别 event 与 command
- `## 5. Output Format` — event-storm.md 字段说明
- `## 6. Resuming Interrupted Session` — 从 `phase_completed` 继续
- `## 7. Execution Flow` — 与 `src/storm.ts` 的交互
- `## 8. Examples` — 对 PMS Reservations Context 的完整示例（摘录）
- Common Rationalizations 表
- `→ 详见 references/example-storm.md` — 一份完整 PMS 事件风暴产出示例

### 4.8 `.claude/agents/business-analyst.md`

agent 定义主体（≤200 字节前言 + 结构化指令）：

```markdown
---
name: business-analyst
description: 业务分析师视角 — 专注业务规则、边界、反例、合规性
---

# Business Analyst Agent

你是业务分析师，负责从业务视角对 feature 做结构化拆解。

## 关注点
- 核心业务规则（Business Rules）
- 边界条件与反例（Edge Cases）
- 负面路径（Unhappy Paths）
- 合规/监管考量（Compliance）
- 建议的 Given-When-Then 场景（Scenarios Proposed）

## 输出格式
结构化 markdown，按以下五段输出，不超过 600 tokens：

### Business Rules
- 规则 1：...
- 规则 2：...

### Edge Cases
- 边界 1：...

### Unhappy Paths
- 失败路径 1：...

### Compliance Considerations
- 合规 1：...（N/A 可明确写"无"）

### Scenarios Proposed
- Given ... When ... Then ...（至少 3 个，含 1 个反例）

## 约束
- 不使用类名、API 路径、数据库表等实现语言（符合 Sprint 1 Spec Leak Detector）
- 术语优先用 .tinkerman/glossary/ 和 packs/<pack>/glossary/ 已定义的术语
- 不重复 product 和 architect 的产出；聚焦业务规则独立价值
```

### 4.9 `src/spec.ts` 扩展

```ts
// 原有 Propose 阶段
async function propose(input: SpecInput): Promise<SpecDraft> {
  const contexts = loadContexts(...);
  const currentContext = input.frontmatter.context;
  const coreSubdomains = getCoreSubdomains(enabledPacks);

  const agents: string[] = ["product", "architect"];
  if (currentContext && coreSubdomains.includes(currentContext)) {
    agents.push("business-analyst");
  }

  const results = await Promise.allSettled(
    agents.map(agent => dispatchSubagent(agent, input)),
  );

  return mergeIntoSpecDraft(results);
}
```

`getCoreSubdomains(enabledPacks)` = union of all packs' `feature_flags.core_subdomains`。

## 5. Execution Flow

### 5.1 `/forge storm reservations`

```
1. 读 .tinkerman/contexts/reservations/event-storm.md（若存在）
2. 若存在 → loadStormState，从 phaseCompleted 后续 phase 继续
   若不存在 → 初始化 state，进入 Phase 1 (events)

3. 每个 phase 内：
   AI 发出 Socratic 问题（one at a time）
     "在 Reservations Context 里，哪些业务事件值得记录？举几个例子。"
   用户回答：
     "客人预订、支付保证金、确认、取消、入住..."
   AI 提取并结构化：
     events: [
       { name: "ReservationBooked", description: "...", source: null },
       { name: "ReservationConfirmed", ... },
       ...
     ]
     saveStormState
   继续追问，直到本 phase "足够"（启发式：用户明确说"差不多"或 AI 判断 5+ 个有效项）
   
4. 阶段完成 → 自动推进下一 phase（符合 no-mid-step-confirmation 铁律）

5. 5 phase 完成 → serializeStormMarkdown → 写 .tinkerman/contexts/<context>/event-storm.md
6. 提示：可用 /forge spec 基于此风暴启动 spec 生成
```

### 5.2 Context Boundary Hook 运行时

```
Claude Code 调用 Write/Edit 写 src/domain/front-desk/check-in.ts：
  → PreToolUse hook 被触发
  → scripts/check-context-boundary.mjs src/domain/front-desk/check-in.ts
  → 读 file content from tool args (proposed new content)
  → resolveFileContext('src/domain/front-desk/check-in.ts') → "front-desk"
  → parseImports 提取 imports
  → 对每个 import：
      e.g. import { Reservation } from "../reservation/reservation"
      → resolveFileContext('../reservation/reservation') → "reservations"
      → checkRelationship("front-desk" → "reservations", contextMap)
      → 若为 customer-supplier 且 front-desk 是 upstream（消费者）→ 需 ACL，阻断
      → 若为 partnership → 允许
  → violations 非空 → 格式化消息，exit 1
  → Claude Code 报错给用户
```

### 5.3 `/forge spec --living-doc`

```
1. 读 .tinkerman/specs/*/spec.md 列表
2. 对每个 spec：
   - 解析 frontmatter.context
   - 解析 ## Scenarios 段（用 scenario-linter 的 parser）
3. 读 .tinkerman/acceptance/*/report.md（若存在）
   - 按 report topic 匹配对应 spec
   - 提取 per-scenario verdicts
4. merge 成 LivingDocData
5. renderLivingDoc(data, '.tinkerman/docs/living/')
6. 输出：✅ Living doc generated at .tinkerman/docs/living/index.html (N scenarios)
```

## 6. Testing Strategy

### 6.1 Unit Tests

- `template-renderer.test.ts`：占位符、each、if 各正反例
- `storm.test.ts`：state 序列化/反序列化 / 阶段推进 / resume
- `context-boundary.test.ts`：6 种关系类型 × 允许/拒绝 矩阵
- `lint/pack-rules.test.ts`：加载规则 / glob 匹配 / pattern 应用
- `living-doc/generator.test.ts`：空输入、单 spec、多 spec、verdict merge
- `living-doc/renderer.test.ts`：HTML 字符串输出对 snapshot

### 6.2 Property Tests

- `storm.property.test.ts`：任意 item 序列 → 序列化/反序列化 round-trip 无损
- `template-renderer.property.test.ts`：空 context → 任何模板返回原样（未替换）
- `context-boundary.property.test.ts`：未声明的 context pair 总是触发 violation

### 6.3 Integration Tests

- `test/ddd-tactical/integration.test.ts`：
  - 用 template-renderer 渲染 `packs/pms/templates/ddd/reservation-aggregate.ts.template`，输出可通过 tsc
- `test/context-boundary/hook.test.ts`：
  - 构造违规 import 的新文件，模拟 hook 调用，断言非零退出 + 结构化消息
- `test/living-doc/e2e.test.ts`：
  - 准备 3 个 specs + 2 个 acceptance reports，运行 generator，验证 HTML 可打开、数据正确
- `test/pack/zero-pack-invariant.test.ts`（扩展）：
  - business-analyst 不在非核心 context 触发
  - money/time lint 规则在无 pack 不加载
  - context boundary hook 无 map 时 no-op
  - living doc 无 specs 时生成空骨架

### 6.4 Fixtures

- `test/ddd-tactical/fixtures/templates/` — 含占位符的测试模板
- `test/context-boundary/fixtures/` — 带有合法 / 非法 imports 的测试文件
- `test/living-doc/fixtures/specs/` — 3 spec 样本
- `test/living-doc/fixtures/acceptance/` — 2 acceptance report 样本

## 7. Security Considerations

- **Lint 规则声明式加载**：不 `eval` 或动态 `import()` pack 目录下的 JS/TS，规则走 YAML + Core 执行器，消除代码注入面
- **Context Boundary Hook 路径校验**：hook 收到的文件路径用 `path.resolve` + prefix check，避免路径穿越
- **Living Doc HTML 输出 escape**：用户 spec 内容可能含 `<script>`；renderer 对所有注入字符串做 HTML escape
- **Template 渲染不执行代码**：占位符替换是纯字符串操作，无 Turing-complete 求值

## 8. Migration & Backward Compatibility

### 8.1 Sprint 1/2 已 lock 的 spec

- business-analyst 不追溯触发（只在新 spec Propose 阶段参与）
- Context Boundary Hook 对已存在代码不追溯扫描（只在新 Write/Edit 时触发）
- 已有 scenarios 进入 living doc 时若无 acceptance report，标为 `pending`（不是 fail）

### 8.2 `core_subdomains` 字段

- 新 field，旧 pack manifest 无此字段 → 视为 `[]`
- PMS Pack 的 `pack.yaml` 在 Sprint 3 追加此字段（R2.2 已 Sprint 2 完成部分，Sprint 3 仅增字段）

### 8.3 Lint 规则

- PMS Pack v1（Sprint 2）无 lint-rules，Sprint 3 追加 money/time；已有 PMS 项目升级 Pack 后 lint 规则自动生效 → 可能产生新 findings
- 默认 severity 非 blocking（warn），允许用户批量修复 or 通过 escape hatch 暂时豁免

## 9. Open Questions / Deferred

- **DDD 战术模板的深度整合**：当前仅提供模板文件；未来可能增加 `/forge new aggregate <name>` 交互命令自动 scaffold（Sprint 4+）
- **Living Doc 的 CI 集成**：当前仅本地生成；未来可能推送到 GitHub Pages / 内部 Wiki（超出 Sprint 3 范围）
- **Three Amigos 人类参与**：当前 business-analyst 是 subagent；未来可能支持"发送 spec 草案给产品经理邮箱"的人机混合流程
- **Lint 规则的 AST-level 精度**：当前 regex 限制在简单模式；复杂规则（例如"跨币种必须 exchange()"）可能需要 AST 分析，v1 先用 regex + 文档说明 limitations
- **Customization Sample 的多 Pack 依赖**：`pms-marriott-sample depends_on: [pms]` 目前靠用户手动在 `packs:` 里声明顺序；自动依赖解析延后到未来
