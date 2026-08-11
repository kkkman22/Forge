---
feature: pms-pack-v1
layout: design
created: 2026-05-09
---

# Design Document

## 1. Overview

本设计把 15 条 Requirement 落到 **`packs/pms/` 领域包实体 + 3 个 Core 新模块 + 2 个 Core 模块扩展 + 1 个新 skill + 2 个现有 skill 的微调**。遵循 Sprint 1 建立的**"引擎在 Core，数据在 Pack"**原则：状态机、Forced Acceptance 门禁、Mutation Testing 包装器属于 Core；PMS 8 Context、术语、禁用词、状态机 YAML、20 场景、BusinessDayClock 属于 Pack。

映射关系：

| Requirement | 主要实现载体 |
|---|---|
| R1 PMS Pack 基础骨架 | `packs/pms/pack.yaml` + `contexts/` 8 文件 + `_map.yaml` + README |
| R2 PMS 分 Context 统一语言 | `packs/pms/glossary/` 9 文件（含 `_shared.md`） |
| R3 PMS 禁用词清单 | `packs/pms/banned-patterns.yaml` |
| R4 状态机引擎 | `src/state-machine/loader.ts` + `validator.ts` + `property-derivation.ts` |
| R5 PMS 4 核心状态机 | `packs/pms/state-machines/` 4 YAML 文件 |
| R6 Forced Acceptance 门禁 | `src/accept-gate.ts` + 集成到 `src/ship.ts` |
| R7 Mutation Testing 引擎 | `skills/forge-mutate/SKILL.md` + `src/mutate.ts` Stryker 封装 |
| R8 PMS Mutation 关键模块 | `packs/pms/pack.yaml` feature_flags |
| R9 单任务 Spec Micro-Review | `src/build.ts` 扩展 + `src/build-micro-review.ts` |
| R10 XML 铁律标签 | 批量修改 `CLAUDE.md` 与各 skill 的铁律段落 + `scripts/check-iron-laws.sh` |
| R11 Rationalization Catalog 扩展 | `skills/forge-build/references/tdd-rules.md` 追加 |
| R12 BusinessDayClock 工具 | `packs/pms/utils/business-day-clock.ts` + 测试 |
| R13 PMS Init Template | `scripts/init.sh` 扩展 + `templates/pms-init/` |
| R14 PMS 预置场景 | `packs/pms/scenarios/` 20+ feature 文件 |
| R15 NFR | property tests + 扩展 zero-pack-invariant test + TSDoc |

## 2. High-Level Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                            Forge Core（Sprint 1 完成 + Sprint 2 新增）      │
│                                                                           │
│  Sprint 1 引擎：pack/ context/ glossary/ spec-leak-detector scenario-linter│
│                                                                           │
│  Sprint 2 新增引擎：                                                       │
│  ├── src/state-machine/                 状态机定义加载/校验/property 派生  │
│  ├── src/accept-gate.ts                  Forced Acceptance 门禁引擎         │
│  ├── src/mutate.ts                       Stryker.js 封装                    │
│  ├── src/build-micro-review.ts           任务级 spec 对齐（Micro_Review）   │
│  └── scripts/check-iron-laws.sh          Iron Law / Hard Gate 唯一性校验   │
│                                                                           │
│  扩展点：                                                                  │
│  ├── src/build.ts      + Micro_Review 调用（每任务完成后）                 │
│  ├── src/ship.ts       + shouldBlockShip 调用（Forced Acceptance）         │
│  └── scripts/init.sh   + --pack <n> 参数支持                            │
│                                                                           │
│  新 skill：                                                                │
│  └── skills/forge-mutate/SKILL.md                                         │
└───────────────────────────────────────────────────────────────────────────┘
                                │  消费 Pack 数据
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                        PMS Domain Pack（新增，opt-in）                      │
│                                                                           │
│  packs/pms/                                                                │
│  ├── pack.yaml                                                             │
│  │   └── feature_flags: forced_acceptance_contexts, mutation_*, business_* │
│  ├── README.md                                                             │
│  ├── contexts/                          8 BC + _map.yaml                   │
│  │   ├── reservations.md                                                   │
│  │   ├── front-desk.md                                                     │
│  │   ├── housekeeping.md                                                   │
│  │   ├── folio-billing.md                                                  │
│  │   ├── night-audit.md                                                    │
│  │   ├── rate-inventory.md                                                 │
│  │   ├── channel-integration.md                                            │
│  │   ├── reporting.md                                                      │
│  │   └── _map.yaml                                                         │
│  ├── glossary/                          9 文件，含 _shared.md              │
│  ├── banned-patterns.yaml                                                  │
│  ├── state-machines/                    4 YAML 文件                         │
│  │   ├── reservation.yaml                                                  │
│  │   ├── folio.yaml                                                        │
│  │   ├── room-status.yaml                                                  │
│  │   └── housekeeping-task.yaml                                            │
│  ├── scenarios/                         20+ feature 文件                    │
│  │   ├── check-in/                                                         │
│  │   ├── check-out/                                                        │
│  │   ├── night-audit/                                                      │
│  │   ├── reservation/                                                      │
│  │   └── folio/                                                            │
│  ├── utils/                                                                │
│  │   ├── business-day-clock.ts                                             │
│  │   └── business-day-clock.test.ts                                        │
│  ├── templates/                         （Sprint 2 留空，Sprint 3 填充）   │
│  ├── lint-rules/                        （Sprint 2 留空，Sprint 3 填充）   │
│  └── agents/                            （Sprint 2 留空，Sprint 3 填充）   │
└───────────────────────────────────────────────────────────────────────────┘
```

## 3. Data Model

### 3.1 `packs/pms/pack.yaml`

```yaml
name: pms
display_name: "Hotel PMS Domain Pack"
description: "酒店前台管理系统（Property Management System）领域知识包"
forge_min_version: "2.4.0"  # 或实际当前版本

extends:
  contexts: ./contexts
  glossary: ./glossary
  scenarios: ./scenarios
  state_machines: ./state-machines
  banned_patterns: ./banned-patterns.yaml
  utils: ./utils
  templates: ./templates     # Sprint 2 预留
  lint_rules: ./lint-rules   # Sprint 2 预留
  agents: ./agents           # Sprint 2 预留

feature_flags:
  forced_acceptance_contexts:
    - reservations
    - folio-billing
    - night-audit

  mutation_critical_modules:
    - "src/domain/folio/**/*.ts"
    - "src/domain/night-audit/**/*.ts"
    - "src/domain/pricing/**/*.ts"
    - "src/domain/reservation/state/**/*.ts"

  mutation_score_threshold: 85

  business_day_defaults:
    cutoff_hour: 4
    timezone: "Asia/Shanghai"
```

### 3.2 State Machine Definition Schema

```yaml
# packs/pms/state-machines/reservation.yaml
schema_version: 1
name: reservation
description: 预订聚合的生命周期状态机

states:
  - name: Booked
    description: 预订已创建，等待确认
  - name: Confirmed
    description: 预订已确认，可入住
  - name: CheckedIn
    description: 客人已入住
  - name: CheckedOut
    terminal: true
    description: 客人已退房，预订完成
  - name: NoShow
    terminal: true
    description: 到店截止时间未到店
  - name: Cancelled
    terminal: true
    description: 预订已取消

initial: Booked

transitions:
  - from: Booked
    to: Confirmed
    event: ConfirmReservation
    guards:
      - "payment_captured"

  - from: Confirmed
    to: CheckedIn
    event: CheckIn
    guards:
      - "arrival_date_reached"
      - "room_assigned"
    side_effects:
      - "allocate_room"
      - "issue_key_card"

  - from: CheckedIn
    to: CheckedOut
    event: CheckOut
    guards:
      - "folio_settled"
    side_effects:
      - "release_room"
      - "trigger_housekeeping"

  # ... 继续至少 10 个 transitions

invariants:
  - expression: "terminal_state_has_no_outgoing_transitions"
    description: 终态不得有出边
  - expression: "cancelled_before_check_in_only"
    description: Cancelled 只能从 Booked 或 Confirmed 达到
  - expression: "no_show_requires_arrival_cutoff_passed"
    description: NoShow 需满足到店截止条件
```

### 3.3 Acceptance Report Frontmatter

```yaml
---
topic: "<spec-name>"
context: "reservations"
timestamp: "2026-05-09T10:23:45Z"
commit: "<git sha>"
verdicts_summary:
  pass: 5
  fail: 0
  skip: 0
  warn: 1
runner_info:
  type: "api"
  duration_ms: 1240
---
```

### 3.4 Mutation Result Artifact

```yaml
---
timestamp: "2026-05-09T11:00:00Z"
pack_source: "pms"
targeted_globs:
  - "src/domain/folio/**/*.ts"
  - "src/domain/pricing/**/*.ts"
total: 234
killed: 210
survived: 18
no_coverage: 3
runtime_errors: 3
mutation_score: 91.7
threshold: 85
verdict: "pass"
duration_ms: 28500
---
```

### 3.5 Micro_Review Output Entry (in `.forge/progress/<topic>.md`)

```markdown
### Task <N>: <name>

**Micro Review**:

- Covered:
  - [acceptance criterion 1] → <file:line> <evidence>
  - [acceptance criterion 2] → <file:line> <evidence>
- Over-built: none
- Missing: none
- Verdict: ✅ task complete

<atomic task body...>
```

## 4. Component Design

### 4.1 `src/state-machine/loader.ts`

```ts
/** Load and parse a state machine YAML definition. */
export function loadStateMachineDefinition(
  yamlContent: string,
  filePath?: string,
): StateMachineDefinition;

export interface StateMachineDefinition {
  name: string;
  description: string;
  states: Array<{ name: string; description: string; terminal?: boolean }>;
  initial: string;
  transitions: Array<{
    from: string;
    to: string;
    event: string;
    guards?: string[];
    sideEffects?: string[];
  }>;
  invariants: Array<{ expression: string; description: string }>;
}
```

使用 `yaml` 库（Sprint 1 已引入）。`filePath` 仅用于错误消息。

### 4.2 `src/state-machine/validator.ts`

```ts
export function validateDefinition(def: StateMachineDefinition): ValidationReport;

export interface ValidationReport {
  valid: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
}
```

校验规则（对应 R4.3）：
- `ST001`: `initial` 在 `states` 中
- `ST002`: 所有 `transitions.from` 和 `to` 引用已声明状态
- `ST003`: 终态无出边
- `ST004`: 从 `initial` 可达所有非终态状态（警告，不 error）
- `ST005`: `{from, event}` 无重复组合

### 4.3 `src/state-machine/property-derivation.ts`

```ts
export function deriveStatePropertyTests(def: StateMachineDefinition): string;
```

返回 TypeScript 代码片段（字符串），可直接粘入项目测试文件：

```ts
// 派生输出示例
import fc from "fast-check";
import { ReservationMachine } from "./reservation-machine";

describe("Reservation State Machine — derived properties", () => {
  it("terminal states have no outgoing transitions", () => {
    fc.assert(fc.property(
      fc.constantFrom("CheckedOut", "NoShow", "Cancelled"),
      (state) => {
        const m = new ReservationMachine(state as any);
        expect(() => m.transition("Any" as any))
          .toThrow(/terminal|no.*transition/i);
      },
    ));
  });

  it("cancelled only reachable from Booked/Confirmed", () => {
    // ... 派生自 R5.6 invariant "cancelled_before_check_in_only"
  });

  // ... 更多 property 自 invariants 派生
});
```

派生策略：
- 对每个 invariant 的 expression 匹配预设模板（v1 支持 4 类：`terminal_state_has_no_outgoing_transitions`、`<state>_before_<state>_only`、`no_<state>_requires_<condition>_passed`、`<state>_requires_<condition>`）
- 未识别的 invariant 生成占位注释 `// TODO: manually implement test for: <description>`
- 不自动执行测试，发布给开发者贴入测试文件

### 4.4 `src/accept-gate.ts`

```ts
export interface AcceptGateInput {
  spec: { filePath: string; frontmatter: Record<string, unknown>; body: string };
  enabledPacks: EnabledPacks;                    // Sprint 1
  acceptanceArtifactPath: string | null;         // .forge/acceptance/<topic>/report.md
}

export interface AcceptGateDecision {
  block: boolean;
  reason?: string;
  warning?: string;
}

export function shouldBlockShip(input: AcceptGateInput): AcceptGateDecision;
```

逻辑：
1. 从 `input.spec.frontmatter.context` 读当前 spec 的 context；缺省为 `null`
2. 从 `enabledPacks.entries[*].featureFlags.forced_acceptance_contexts` union 所有 packs 的强制列表
3. 若 `context` 不在强制列表 → `{ block: false }`
4. 若 spec body 不含 `## Scenarios` → `{ block: false, warning: "..." }` (R6.7)
5. 读 artifact：不存在 → `{ block: true, reason: "acceptance 未运行" }`
6. 解析 artifact frontmatter：`verdicts_summary.fail > 0` → `{ block: true, reason: "<N> 个 scenarios FAIL" }`
7. 否则 `{ block: false }`

### 4.5 `src/mutate.ts`

```ts
export async function runMutation(
  projectRoot: string,
  options: { targetGlobs?: string[]; threshold?: number; outputDir?: string },
): Promise<MutationArtifact>;

export interface MutationArtifact {
  filePath: string;
  summary: MutationSummary;
}
```

实现：
1. 合并 `targetGlobs`（来自 enabled packs union + 命令行 override）
2. 生成临时 `stryker.conf.json`：`mutate: targetGlobs`、`testRunner: "vitest"`、`reporters: ["json"]`
3. `spawn("npx", ["stryker", "run", "--configFile", tmpPath])`
4. 读 Stryker 输出 JSON
5. 计算 `mutation_score = killed / (killed + survived) × 100`（排除 `no_coverage` 和 `runtime_errors`）
6. 判定 verdict：`score >= threshold` → `pass`；否则 `warn`（Sprint 2 不 fail）
7. 原子写 `.forge/mutation/<timestamp>.md`（frontmatter + body 汇总）

### 4.6 `src/build-micro-review.ts`

```ts
export interface MicroReviewInput {
  task: PlanTask;                 // Sprint 1 已定义
  gitDiff: string;                // 最近 commit 的 diff
  verifyOutput: string;           // Verify GREEN 步骤的输出
  planVersion: "v1" | "legacy";   // legacy = 无 Expected Output 字段
}

export interface MicroReviewResult {
  covered: Array<{ criterion: string; evidence: string }>;
  overBuilt: string[];
  missing: string[];
  verdict: "pass" | "needs_iteration";
}

export function runMicroReview(input: MicroReviewInput): MicroReviewResult;
```

算法：
- `legacy` plan：只检查 `gitDiff` 非空 + `verifyOutput` 含 PASS 指示符 → `pass`
- `v1` plan：
  - 对每条 `task.acceptance_criteria`，在 `gitDiff` 中匹配 file:line 作为 evidence；找不到则 `missing`
  - 扫描 `gitDiff` 中的新增文件/方法，对照 `task.files` 声明；超出声明 → `overBuilt`
  - `missing.length === 0 && overBuilt.length === 0` → `pass`；否则 `needs_iteration`

### 4.7 `packs/pms/utils/business-day-clock.ts`

```ts
export interface BusinessDayClockConfig {
  cutoffHour: number;    // 0-23
  timezone: string;      // IANA timezone name
}

export class BusinessDayClock {
  constructor(config: BusinessDayClockConfig);

  getBusinessDay(instant: Date): string;       // "YYYY-MM-DD"
  nextCutoff(from: Date): Date;
  isSameBusinessDay(a: Date, b: Date): boolean;
  addBusinessDays(from: Date, delta: number): Date;
}

export function withBusinessDay<T>(
  clock: BusinessDayClock,
  day: string,
  fn: () => Promise<T>,
): Promise<T>;
```

实现依赖：使用 Node.js 原生 `Intl.DateTimeFormat` 处理时区，不引入 `moment` / `date-fns` 新依赖。DST 边界测试覆盖 3 个时区。

算法要点：
- `getBusinessDay(instant)`:
  1. 将 `instant` 转换为配置时区的本地日期时间
  2. 如果本地小时 < `cutoffHour`，business day = 前一天；否则当天
- `isSameBusinessDay(a, b)` = `getBusinessDay(a) === getBusinessDay(b)`
- `addBusinessDays(from, delta)` = 相对于 `getBusinessDay(from)` 的日历日加减，再回到 `cutoffHour` 的本地时间

### 4.8 `skills/forge-mutate/SKILL.md`

主体 ≤150 行，结构：
- frontmatter（name / description / disable-model-invocation: true）
- `## 1. Overview` — mutation testing 概念 + 3 层验证模型（WHAT / HOW / REAL?）
- `## 2. Prerequisites` — enabled pack 含 `mutation_critical_modules` / 测试套件已 green
- `## 3. Subcommands`
  - `/forge mutate run [<target-glob>]`
  - `/forge mutate kill-survivors`
  - `/forge mutate report`
- `## 4. The 8 Core Mutation Categories` — 表格
- `## 5. Integration with /forge ship` — verdict 处理
- `## 6. Examples`
- `→ 详见 references/frameworks.md` — Stryker 配置细节

### 4.9 `scripts/check-iron-laws.sh`

Shell 脚本，在 CI 中运行：

```bash
#!/bin/bash
set -euo pipefail

# 提取所有 <IRON-LAW name="..."> 的 name
names=$(rg -o '<IRON-LAW name="([^"]+)"' -r '$1' -t md .)

# 检查唯一性
duplicates=$(echo "$names" | sort | uniq -d)
if [[ -n "$duplicates" ]]; then
  echo "❌ Duplicate IRON-LAW names:"
  echo "$duplicates"
  exit 1
fi

# 同样检查 HARD-GATE
# ...

echo "✅ All iron laws and hard gates have unique names"
```

## 5. Execution Flow

### 5.1 `/forge ship` 含 Forced Acceptance 门禁

```
现有 ship 门禁：
  Review P0/P1 pass → Test Layer 1-3 pass → Progress all done → [NEW] AcceptGate → delivery

新增步骤（在 Progress all done 之后）：
  1. 读 spec frontmatter.context
  2. shouldBlockShip({ spec, enabledPacks, acceptanceArtifactPath })
  3. 若 block → 阻断 ship，格式化消息
  4. 若 warning → 在 ship 输出中显示 notice
  5. 若不 block → 继续到 delivery

同时读最新 mutation artifact：
  - verdict=fail → 阻断 ship
  - verdict=warn → notice
  - 无 artifact → skip
```

### 5.2 `/forge build` 单任务 Micro_Review

```
每个 atomic task：
  1. RED Verification Gate（Sprint 1）
  2. GREEN step
  3. Verify GREEN
  4. [NEW] runMicroReview({ task, gitDiff, verifyOutput, planVersion })
  5. 若 needs_iteration：回到 RED/GREEN 修复 missing/overBuilt；最多 3 轮，超出触发 Three-Strike
  6. 若 pass：写 Micro_Review 到 progress，进入下一任务

Three-Strike 触发条件扩展：Micro_Review 连续 needs_iteration 3 次也触发 debugger（与现有 TDD 失败计数独立）。
```

### 5.3 `/forge init --pack=pms`

```
1. 执行现有 init 流程
2. 解析 --pack 参数
3. 对每个 pack：
   - 检查 packs/<name>/ 存在，不存在则警告但继续（R13.5）
   - 读 pack.yaml feature_flags 提取默认值
4. 写 .forge/config.md frontmatter：
   packs: [pms, ...]
5. 若 pms 启用，交互提示：
   - business_day_cutoff_hour (default 4)
   - business_day_timezone (default Asia/Shanghai)
   写入 .forge/config.md frontmatter
6. 创建 .forge/custom/ 空目录
7. 打印欢迎消息：
   "PMS Pack enabled. 8 Bounded Contexts, 4 state machines, 20 scenarios ready.
    See packs/pms/README.md for usage. Start with: /forge spec <your-feature>"
```

## 6. Testing Strategy

### 6.1 Unit Tests

- `src/state-machine/*.test.ts`：loader / validator / property-derivation 各自覆盖正反路径
- `src/accept-gate.test.ts`：6 种 block/no-block 组合
- `src/mutate.test.ts`：mock Stryker output 解析、阈值判定、artifact 写入
- `src/build-micro-review.test.ts`：v1 / legacy / covered / missing / overBuilt 场景
- `packs/pms/utils/business-day-clock.test.ts`：DST、时区、cutoff 边界

### 6.2 Property Tests (fast-check)

- `state-machine/validator`: 同输入同输出 idempotence
- `state-machine/loader`: 任意合法 YAML → 可成功 load
- `accept-gate`: monotonicity（更多 failing scenarios 只会更 block，不会 unblock）
- `business-day-clock`:
  - `isSameBusinessDay(a, b)` 反身对称
  - `addBusinessDays(from, 0) = from` (up to timezone normalization)
  - `addBusinessDays(addBusinessDays(from, n), -n)` round-trip

### 6.3 Integration Tests

- `test/pms-pack/integration.test.ts`：
  - 启用 pms pack 后，`detectSpecLeak` 在 PMS banned patterns 下正确识别 leakage
  - `detectContextTermMismatch` 对跨 context "Room" 术语报 mismatch
  - 4 个状态机 property 派生代码能编译
- `test/pack/zero-pack-invariant.test.ts`（扩展）：
  - Forced Acceptance gate 无 pack 时 no-block
  - Mutation 无 pack 时 no-op warn-exit
  - Micro_Review 对 legacy plan loose mode

### 6.4 Fixtures

- `test/pms-pack/fixtures/specs/` — 含 PMS 实际泄露的 spec / 干净的 spec 各 3 份
- `test/pms-pack/fixtures/plans/` — v1 / legacy plan 各 1 份
- `test/pms-pack/fixtures/acceptance-reports/` — pass / fail / partial 各 1 份

## 7. Security Considerations

- **状态机 YAML 不执行代码**：`guards` 和 `side_effects` 是字符串标识符，由业务代码解释，状态机引擎不 `eval`
- **Mutation Testing 沙箱**：Stryker 本身已在独立进程运行，Forge 不额外执行 mutated 源码
- **BusinessDayClock 无 IO**：纯函数时间计算，不读系统时间除非通过参数注入

## 8. Migration & Backward Compatibility

### 8.1 既有项目（无 PMS Pack）

- Zero-Pack-Zero-Impact 继续成立
- 状态机引擎、mutation 引擎、Micro_Review、accept-gate 均在无 pack 输入时 no-op

### 8.2 已 locked 的 spec

- 不自动跑新的 leak/linter 检查；保持 locked 状态
- 用户显式解锁重 lock 才走新流程

### 8.3 已 approved 的 plan（无 Expected Output）

- Micro_Review 自动识别为 legacy，走 loose 模式（R9.6）

### 8.4 渐进采用

- PMS Pack v1 的 20 个 scenarios 预置不阻断已有 spec；用户按需 copy 进自己的 spec
- Mutation Testing v1 所有 verdict 最多 warn 不 fail，观察期 1-2 个 Sprint 后再升级

## 9. Open Questions / Deferred

- **Stryker.js 备用方案**：如果 Stryker 对 vitest 集成不稳定，考虑 atdd 库推荐的自建 AST-level mutator；Sprint 2 先用 Stryker，监控结果质量
- **DDD 战术模板**：Sprint 3 交付；Sprint 2 不实现 `Aggregate/VO/DomainEvent/Repo/Saga` 代码模板
- **跨 Context 依赖 hook**：Sprint 3 交付
- **活文档生成**：Sprint 3 交付
- **PMS 业务规则引擎**：如 Overbooking Policy / Yield Policy 的可配置实现，超出 Sprint 2/3 范围
