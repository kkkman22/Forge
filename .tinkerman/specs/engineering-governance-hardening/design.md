---
feature: engineering-governance-hardening
layout: design
created: 2026-05-05
---

# 设计文档：工程治理能力加固

## Overview

本设计将 6 项治理能力组织为一个分阶段的演进包，分 3 个 phase 落地，阶段间依赖清晰。整体原则：

1. **零外部服务**：所有能力本地可运行，不引入 HNSW / AgentDB / 神经网络
2. **纯函数优先**：每个新增核心函数都是 pure function，延续 Forge 的 FCIS 架构
3. **渐进迁移**：不做大爆炸式重写，按模块替换，每步可独立上线
4. **测试对齐**：新增 property-based tests 与现有 90 个 PBT 文件风格一致

### Phase 规划

| Phase | 需求 | 预期工作量 | 依赖 |
|---|---|---|---|
| Phase 1 | 需求 1（ADR）、需求 6（Security 信号） | ~1 周 | 无 |
| Phase 2 | 需求 5（Prompt Defense）、需求 2（Schema validation） | ~2 周 | Phase 1 的 ADR 机制 |
| Phase 3 | 需求 3（Event Sourcing）、需求 4（Performance Budget） | ~2 周 | Phase 2 的 schema + security |

---

## Architecture

### 模块总览

```
┌─────────────────────────────────────────────────────────────────┐
│                    Engineering Governance Layer                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ ADR Registry │  │ Schema       │  │ Event Log    │          │
│  │ (需求 1)     │  │ Validation   │  │ (需求 3)     │          │
│  │              │  │ (需求 2)     │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         v                 v                 v                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Prompt       │  │ Performance  │  │ Security     │          │
│  │ Defense      │  │ Budgets      │  │ Signals      │          │
│  │ (需求 5)     │  │ (需求 4)     │  │ (需求 6)     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│              Existing Forge Core (unchanged)                    │
│  orchestrator.ts | effect-executor.ts | router.ts | state.ts   │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

```
用户输入
   │
   v
[Prompt Defense scanInput] ← 需求 5：拒绝 critical 威胁
   │
   v (通过)
[Router classifyTask] ← 需求 1：加载相关 ADR 提示
   │
   v
[Orchestrator transition] ← 需求 3：追加 write_event_log effect
   │
   v
[Effect Executor] ← 需求 3：写 .tinkerman/runs/<id>/events.jsonl
   │
   v
[State File I/O] ← 需求 2：Zod schema 校验
   │
   v
完成
```

---

## Components and Interfaces

### Phase 1.1 — ADR Registry (需求 1)

#### 文件组织

```
.tinkerman/decisions/
├── ADR-TEMPLATE.md           新增模板文件
├── ADR-0001-...md            已有决策 (重命名/编号)
└── ADR-NNNN-...md            新 ADR

.tinkerman/knowledge/adr-index.md 新增索引文件

src/adr-registry.ts           新增核心模块
```

#### 核心接口

```typescript
// src/adr-registry.ts
export interface AdrFrontmatter {
  id: string;           // "ADR-0042"
  title: string;
  status: "proposed" | "accepted" | "superseded" | "deprecated";
  date: string;         // ISO 8601
  deciders: string[];
  related_adrs?: string[];
  supersedes?: string;
  superseded_by?: string;
}

export interface AdrEntry extends AdrFrontmatter {
  filePath: string;
}

/** 扫描 decisions/ 目录，解析所有 ADR frontmatter（纯函数，IO 注入） */
export function loadAllAdrs(
  entries: string[],
  readFile: (path: string) => string | undefined,
): AdrEntry[];

/** 生成下一个 ADR 编号（纯函数） */
export function nextAdrId(existing: AdrEntry[]): string;

/** 基于关键词匹配相关 ADR（纯函数，Jaccard 相似度） */
export function findRelatedAdrs(
  taskDescription: string,
  adrs: AdrEntry[],
  limit: number,
): AdrEntry[];

/** 渲染索引文件内容（纯函数） */
export function renderAdrIndex(adrs: AdrEntry[]): string;

/** 处理 superseded 关系（纯函数，返回需要更新的 AdrEntry 列表） */
export function applySupersession(
  newAdr: AdrEntry,
  allAdrs: AdrEntry[],
): AdrEntry[];
```

#### 集成点

- `src/decide.ts` 的 `confirmDecision()` 函数末尾调用 `nextAdrId()` + 写入 ADR 文件 + 调用 `renderAdrIndex()` 更新索引
- `forge-decide/SKILL.md` 启动时调用 `findRelatedAdrs()` 展示相关历史决策
- `scripts/init.sh` 在项目初始化时创建 `ADR-TEMPLATE.md` 模板

---

### Phase 1.2 — Security Signals (需求 6)

这是纯文档 + CI 改动，无新代码模块。

#### 变更清单

```
README.md                    新增"安全与信任"章节（第 2-3 章之间）
SECURITY.md                  新增漏洞报告流程与 SLA
CONTRIBUTING.md              新增"安全贡献指南"小节
CHANGELOG.md                 启用 [SECURITY] 标签约定
.github/workflows/ci.yml     新增 security-audit job
```

#### README "安全与信任"章节结构

```markdown
## 🛡️ 安全与信任

Forge 从第一天起把安全视为工程纪律。

### 防御分层

| 层级 | 机制 | 位置 |
|---|---|---|
| 1. 工具调用层 | PreToolUse Hook 冻结区硬阻断 | hooks/hooks.json |
| 2. Shell 注入预防 | Git transaction builder 白名单 | src/git-transaction.ts |
| 3. 输入威胁检测 | Prompt injection scanInput | src/prompt-defense.ts |
| 4. 依赖供应链 | 精确版本锁定 + npm audit CI | package.json + CI |
| 5. 不变量验证 | 90 个 property-based test 文件 | test/*.property.test.ts |

### 安全审计与 CVE 追溯

- [SECURITY.md](SECURITY.md) 提供漏洞报告渠道与 SLA
- [CHANGELOG.md](CHANGELOG.md) 使用 [SECURITY] 标签突出所有安全修复
- 每条修复关联至少一个 ADR，提供决策追溯
```

#### CI security-audit job

```yaml
# .github/workflows/ci.yml（新增 job）
security-audit:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-node@v6
      with:
        node-version: 22
    - run: npm ci
    - name: npm audit
      run: npm audit --audit-level=high
    - name: check dependency typosquatting
      run: node scripts/check-deps.mjs
```

---

### Phase 2.1 — Prompt Defense (需求 5)

#### 模块结构

```
src/prompt-defense.ts              核心 scanInput 纯函数
src/prompt-defense-patterns.ts     威胁模式库（frozen zone 保护）
test/prompt-defense.property.test.ts   property-based test
```

#### 核心类型

```typescript
// src/prompt-defense.ts
export type ThreatType =
  | "instruction_override"
  | "jailbreak"
  | "role_switching"
  | "context_manipulation"
  | "encoding_attack"
  | "pii_exposure";

export type ThreatSeverity = "critical" | "high" | "medium" | "low";

export interface Threat {
  type: ThreatType;
  severity: ThreatSeverity;
  confidence: number;       // 0-1
  pattern: string;           // 模式名，不是匹配内容
  location?: { start: number; end: number };
}

export interface ScanResult {
  safe: boolean;
  threats: Threat[];
  detectionTimeMs: number;
}

/** 扫描输入文本（纯函数，无 IO） */
export function scanInput(text: string): ScanResult;
```

#### 模式库结构

```typescript
// src/prompt-defense-patterns.ts
interface ThreatPattern {
  id: string;                // 唯一标识
  pattern: RegExp;
  type: ThreatType;
  severity: ThreatSeverity;
  baseConfidence: number;
  description: string;       // 仅用于报告，不用于匹配
}

export const PATTERNS: ReadonlyArray<ThreatPattern> = [
  // instruction_override
  { id: "io-001", pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i, type: "instruction_override", severity: "critical", baseConfidence: 0.95, description: "..." },
  // ... ≥30 条

  // PII — 注意不回显原文
  { id: "pii-001", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, type: "pii_exposure", severity: "medium", baseConfidence: 0.90, description: "email" },
  { id: "pii-002", pattern: /\b\d{3}-\d{2}-\d{4}\b/, type: "pii_exposure", severity: "high", baseConfidence: 0.85, description: "SSN-like" },
  { id: "pii-003", pattern: /\bsk-(ant-)?[A-Za-z0-9_-]{20,}\b/, type: "pii_exposure", severity: "critical", baseConfidence: 0.95, description: "anthropic api key" },
];
```

#### 集成到 router

```typescript
// src/router.ts 修改
import { scanInput } from "./prompt-defense.js";

export function classifyTask(
  description: string,
  signals: TaskSignals,
  // ...
): ClassificationResult {
  const scan = scanInput(description);

  // Critical 威胁直接拒绝
  const critical = scan.threats.filter(t => t.severity === "critical");
  if (critical.length > 0) {
    throw new PromptDefenseError(
      `Input rejected: ${critical.length} critical threat(s) detected`,
      critical.map(t => ({ type: t.type, pattern: t.pattern, location: t.location })),
    );
  }

  // High/Medium 转为 RouteHint
  const warnings = scan.threats.filter(t => t.severity === "high" || t.severity === "medium");
  const defenseHints: RouteHint[] = warnings.map(t => ({
    command: "*",
    tag: "prompt-defense-warning",
    description: `${t.type} detected (${t.severity})`,
  }));

  // ... 原有逻辑 ...
  return { /* ... */, hints: [...existingHints, ...defenseHints] };
}
```

---

### Phase 2.2 — Schema-driven Validation (需求 2)

#### 模块结构

```
src/schemas/
├── status-file.ts      StatusFileSchema + 类型
├── config-file.ts      ConfigFileSchema + 类型
├── review-report.ts    ReviewReportSchema（第二阶段迁移）
└── index.ts            统一导出
```

#### 核心 schema

```typescript
// src/schemas/status-file.ts
import { z } from "zod";

export const PhaseSchema = z.enum([
  "decide", "spec", "plan", "build", "build-light",
  "review", "test", "ship", "learn", "debug", "fix", "refactor"
]);

export const TierSchema = z.enum(["light", "standard", "full"]);

export const LoopFieldsSchema = z.object({
  mode: z.enum(["interactive", "autonomous"]),
  loop_run_id: z.string(),
  loop_iteration: z.number().int().nonnegative(),
  skill_sequence: z.array(z.string()).optional(),
}).strict();

export const StatusFileSchema = z.object({
  current_task: z.string().optional(),
  tier: TierSchema.optional(),
  task_type: z.string().optional(),
  project_phase: z.string().optional(),
  phase: PhaseSchema.optional(),
  hints: z.string().optional(),
  assumptions: z.array(z.string()).optional(),
  updated: z.string().optional(),
  loop_fields: LoopFieldsSchema.optional(),
}).passthrough(); // 允许未知字段（兼容宽松语义）

export type StatusFile = z.infer<typeof StatusFileSchema>;

/** 宽松解析：失败时返回 partial 结果 + 错误列表 */
export interface SafeParseResult {
  value: Partial<StatusFile>;
  errors: string[];
}

export function safeParse(raw: unknown): SafeParseResult {
  const result = StatusFileSchema.safeParse(raw);
  if (result.success) {
    return { value: result.data, errors: [] };
  }
  const errors = result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`);
  // 尝试部分提取有效字段
  const partial = extractValidFields(raw, result.error);
  return { value: partial, errors };
}
```

#### 迁移策略

- **Stage A**：新 schema 与旧 parser 并行存在，新 schema 作为 staging 路径由 feature flag 控制
- **Stage B**：通过 shadow comparison 运行 1-2 个版本，对比 schema 解析与旧 parser 结果，不一致处记录
- **Stage C**：移除旧 parser，迁移完成

#### 向后兼容

```typescript
// state.ts 保持原 parseStatusFileGraceful 签名
import { safeParse } from "./schemas/status-file.js";

export function parseStatusFileGraceful(content: string | undefined): {
  fields: StatusFields;
  errors: string[];
} {
  if (!content) return { fields: {}, errors: [] };
  const raw = extractFrontmatterYaml(content);
  const result = safeParse(raw);
  return {
    fields: result.value as StatusFields,
    errors: result.errors,
  };
}
```

---

### Phase 3.1 — Event Sourcing (需求 3)

#### 事件流存储

```
.tinkerman/runs/<runId>/
├── events.jsonl            事件流（append-only）
├── state-final.json        最终状态快照（用于校验）
└── notes.md                已有的 notes document
```

#### 核心类型

```typescript
// src/event-log.ts
export interface EventLogEntry {
  timestamp: string;             // ISO 8601 with ms
  runId: string;
  iteration: number;
  event: OrchestratorEvent;      // 已有类型
  stateHashBefore: string;       // 16 位 hex
  stateHashAfter: string;
  effects: OrchestratorEffect[];
}

/** 计算状态哈希（纯函数） */
export function hashState(state: OrchestratorState): string;

/** 构建日志 entry（纯函数） */
export function buildEntry(
  runId: string,
  iteration: number,
  event: OrchestratorEvent,
  stateBefore: OrchestratorState,
  stateAfter: OrchestratorState,
  effects: OrchestratorEffect[],
): EventLogEntry;

/** 序列化为 JSON Line（纯函数） */
export function serializeEntry(entry: EventLogEntry): string;

/** 解析 JSON Lines 事件流（纯函数） */
export function parseEventLog(jsonl: string): EventLogEntry[];

/** 重放事件流得到最终状态（纯函数） */
export function replay(
  initial: OrchestratorState,
  events: EventLogEntry[],
): OrchestratorState;
```

#### 新增 Effect 类型

```typescript
// loop-types.ts 扩展
export type OrchestratorEffect =
  | { type: "commit"; message: string }
  | { type: "rollback" }
  | { type: "schedule_iteration"; iterationNumber: number }
  | { type: "start_backoff"; durationMs: number }
  | { type: "abort"; reason: string }
  | { type: "stop" }
  | { type: "ship_merge"; targetBranch: string; featureBranch: string }
  | { type: "ship_push_pr"; remote: string; branch: string; title: string; body: string }
  | { type: "ship_discard"; branch: string }
  | { type: "write_event_log"; entry: EventLogEntry };  // 新增
```

#### SdkDriver 集成

```typescript
// SdkDriver.executeIteration 伪代码改动
const stateBefore = this.state;
const { state: stateAfter, effects } = transition(stateBefore, event, limits);

const logEntry = buildEntry(
  this.runId,
  stateBefore.currentIteration,
  event,
  stateBefore,
  stateAfter,
  effects,
);

const allEffects: OrchestratorEffect[] = [
  ...effects,
  { type: "write_event_log", entry: logEntry },
];

await this.executeEffects(allEffects);
this.state = stateAfter;
```

#### Resume 校验

```typescript
// forge-loop-cli.ts --resume 路径增强
async function resumeRun(runId: string) {
  const events = parseEventLog(await readFile(`.tinkerman/runs/${runId}/events.jsonl`));
  const replayed = replay(createInitialState(), events);
  const persisted = JSON.parse(await readFile(`.tinkerman/runs/${runId}/state-final.json`));

  if (hashState(replayed) !== hashState(persisted)) {
    throw new CliError(
      `Event log replay mismatch: replayed hash ${hashState(replayed)} != persisted ${hashState(persisted)}. ` +
      `Run may be corrupted. Use --force-resume to proceed with persisted state.`,
    );
  }
  // ... 继续
}
```

---

### Phase 3.2 — Performance Budgets (需求 4)

#### 目录结构

```
test/benchmarks/
├── orchestrator-transition.bench.ts
├── state-parse.bench.ts
├── router-classify.bench.ts
├── context-budget.bench.ts
├── skill-loader.bench.ts
├── frontmatter.bench.ts
└── prompt-defense.bench.ts
```

#### benchmark 文件约定

```typescript
// test/benchmarks/orchestrator-transition.bench.ts
//
// BUDGET: p99 < 1ms, ops/sec > 10000
//
import { bench, describe } from "vitest";
import { createInitialState, transition } from "../../src/orchestrator.js";

describe("orchestrator.transition", () => {
  const state = createInitialState();
  const event = { type: "iteration_success", tokenUsage: { inputTokens: 100, outputTokens: 200 }, summary: "done" } as const;

  bench("iteration_success happy path", () => {
    transition(state, event, { maxIterations: 100 });
  });

  // ... 更多场景
});
```

#### CI 比较脚本

```
scripts/bench-compare.sh
scripts/extract-bench-json.mjs
```

```bash
# scripts/bench-compare.sh
#!/bin/bash
set -euo pipefail

# 1. 在 PR 分支运行 benchmark
npm run bench -- --reporter=json > /tmp/pr-bench.json

# 2. checkout main，运行基线
git stash && git checkout main
npm run bench -- --reporter=json > /tmp/main-bench.json
git checkout - && git stash pop

# 3. 对比
node scripts/extract-bench-json.mjs /tmp/main-bench.json /tmp/pr-bench.json --threshold 1.20
```

#### baseline 更新流程

```yaml
# .github/workflows/update-baseline.yml（新增，仅 main push 触发）
on:
  push:
    branches: [main]

jobs:
  update-baseline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - run: npm ci
      - run: npm run bench -- --reporter=json > bench-result.json
      - run: node scripts/append-baseline.mjs bench-result.json
      - name: commit baseline
        run: |
          git add .tinkerman/knowledge/metrics.md
          git commit -m "ci: update performance baseline [skip ci]"
          git push
```

---

## Data Models

### ADR Frontmatter

```yaml
---
id: "ADR-0042"
title: "Adopt Zod for state file validation"
status: accepted
date: "2026-05-10"
deciders: ["@maintainer-a", "@maintainer-b"]
related_adrs: ["ADR-0008", "ADR-0023"]
supersedes: "ADR-0015"  # 可选
superseded_by: ""       # 为空或省略表示未被取代
---
```

### Event Log Entry (JSON Lines)

```json
{"timestamp":"2026-05-10T14:23:45.123Z","runId":"forge-loop-abc123","iteration":5,"event":{"type":"iteration_success","tokenUsage":{"inputTokens":1234,"outputTokens":567},"summary":"implement auth"},"stateHashBefore":"a1b2c3d4e5f60718","stateHashAfter":"b2c3d4e5f6071829","effects":[{"type":"commit","message":"forge(loop): iteration 5 — implement auth"}]}
```

### Benchmark Result (JSON)

```json
{
  "file": "test/benchmarks/orchestrator-transition.bench.ts",
  "benchmarks": [
    {
      "name": "iteration_success happy path",
      "mean": 0.023,
      "p50": 0.021,
      "p95": 0.034,
      "p99": 0.042,
      "opsPerSec": 43478,
      "samples": 10000,
      "budget": { "p99_ms": 1.0, "ops_per_sec_min": 10000 },
      "budgetMet": true
    }
  ]
}
```

---

## Error Handling

### Prompt Defense 错误

```typescript
export class PromptDefenseError extends ForgeError {
  readonly threats: ReadonlyArray<Pick<Threat, "type" | "pattern" | "location">>;
  constructor(message: string, threats: Threat[]) {
    super("PROMPT_DEFENSE_REJECTED", message);
    this.threats = threats.map(t => ({ type: t.type, pattern: t.pattern, location: t.location }));
  }
}
```

### Event Log 重放错误

```typescript
export class EventLogReplayError extends ForgeError {
  constructor(public readonly expectedHash: string, public readonly actualHash: string) {
    super("EVENT_LOG_REPLAY_MISMATCH", `replay hash ${actualHash} != expected ${expectedHash}`);
  }
}
```

### Schema 校验错误

```typescript
// 复用 zod 的 ZodError，包装为 ForgeError
export class SchemaValidationError extends ForgeError {
  constructor(public readonly issues: z.ZodIssue[]) {
    const summary = issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    super("SCHEMA_VALIDATION_FAILED", summary);
  }
}
```

---

## Testing Strategy

### 需求 1 — ADR

- Property test: `nextAdrId(adrs).length === 8 && 以 "ADR-" 开头 && 编号递增`
- Property test: `renderAdrIndex(adrs)` 输出包含所有 adrs 的 id 且不重复
- Integration test: `/forge decide` 端到端生成 ADR 文件 + 更新索引

### 需求 2 — Schema

- Property test: 对任意合法 StatusFile 对象 `x`，`safeParse(serialize(x)).value` 等价于 `x`
- Property test: 任意 unknown 字段存在时 `safeParse` 不抛出
- Shadow comparison test: 旧 parser 与新 schema 对同一输入的结果在预定容差内一致

### 需求 3 — Event Log

- Property test: `replay(initial, buildSequence(events))` 的 hash 等于最后 entry 的 stateHashAfter
- Property test: JSONL round-trip：`parseEventLog(entries.map(serializeEntry).join("\n"))` 等价于 `entries`
- Integration test: forge-loop 运行一次 → 解析 events.jsonl → replay → 与最终 state 比较

### 需求 4 — Benchmark

- Budget compliance test: 每个 bench 文件在 CI 上运行一次实际 benchmark，验证结果满足头部注释中的 BUDGET
- Regression test: 构造故意慢 10x 的测试分支，验证 CI 正确失败

### 需求 5 — Prompt Defense

- Property test: 100 条良性样本 `safe === true`
- Property test: 50 条已知恶意样本 `safe === false` 且类型正确
- Property test: `scanInput(text).detectionTimeMs < 5` 对 ≤ 10KB 输入
- Fuzzing test: 使用 fast-check 生成随机字符串，验证 scanInput 不抛出

### 需求 6 — Security Signals

- Doc test: `scripts/check-readme-security-section.sh` 验证 README 包含"安全与信任"章节
- CI test: security-audit job 在已知含漏洞的测试分支上失败

---

## Implementation Order

Phase 1.1（ADR）→ Phase 1.2（Security 信号，部分依赖 ADR 机制展示）→ Phase 2.1（Prompt Defense）→ Phase 2.2（Schema）→ Phase 3.1（Event Sourcing）→ Phase 3.2（Performance Budgets）

每个 phase 独立可发布。phase 间仅通过公开模块接口耦合，不共享内部状态。
