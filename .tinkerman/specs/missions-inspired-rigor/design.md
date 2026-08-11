---
feature: missions-inspired-rigor
layout: design
created: 2026-05-16
---

# Design Document

## Overview

把 Factory Missions 演讲中四条与 Forge 高度对齐的设计原则落地，让 review 评审从"主观对照"升级为"机械可验证"，让 build 的多原子任务交接从"靠对话历史"升级为"靠机器可读 schema"，让 review 阶段成为 KB 持续累积的入口而不只是收尾后才追忆，让 forge-loop 具备跨数小时甚至跨天的真实长周期能力。

**核心约束**：

- **不破坏既有 spec / progress 文件**：所有 schema 增量都是兼容追加，旧文件可继续 lock / build。
- **不引入新的外部依赖**：复用 forge-spec / forge-build / forge-review / forge-loop 既有 SKILL 文件 + `.tinkerman/` 状态目录 + `forge-context` MCP。
- **可独立合并**：四条需求之间通过状态文件 schema 解耦，单独合并任一条都能独立产生价值。
- **TDD 兜底**：所有可机器验证的 acceptance criteria 都先写测试再实现。

## Architecture

### 整体数据流

```
                    ┌────────────────────────────────────────┐
                    │  /forge spec        ← R1 落地点         │
                    │   ├─ 起草 contract（Verify-By/Evidence) │
                    │   └─ lock 时强制 schema 校验            │
                    └─────────────────┬──────────────────────┘
                                      │ 写入
                                      ▼
                    ┌────────────────────────────────────────┐
                    │  .tinkerman/specs/<topic>/spec.md           │
                    │   含 Validation Contract 章节           │
                    └─────────────────┬──────────────────────┘
                                      │ 读取
                                      ▼
                    ┌────────────────────────────────────────┐
                    │  /forge plan → /forge build  ← R2 落地点│
                    │   每个原子任务完成后追加 5 字段 handoff │
                    └─────────────────┬──────────────────────┘
                                      │ 写入
                                      ▼
                    ┌────────────────────────────────────────┐
                    │  .tinkerman/progress/<topic>.md             │
                    │   含 N 个 handoff block (yaml)          │
                    └─────────────────┬──────────────────────┘
                                      │ 读取
                                      ▼
                    ┌────────────────────────────────────────┐
                    │  /forge review                          │
                    │   ├─ Step 0: forge_git diff-content     │
                    │   ├─ R3: 读 known-failures 检测复发     │
                    │   └─ R3: P0/P1 → 输出 append-block      │
                    └─────────────────┬──────────────────────┘
                                      │ 写入（去重）
                                      ▼
                    ┌────────────────────────────────────────┐
                    │  .tinkerman/knowledge/known-failures.md     │
                    │   append-only, 受保护区                 │
                    └─────────────────┬──────────────────────┘
                                      │ 后续 review 自动检索
                                      ▼
                    ┌────────────────────────────────────────┐
                    │  /forge loop  ← R4 落地点               │
                    │   每个 SKILL 调用 = fresh-context 子会话│
                    │   状态全部走文件，会话不携历史          │
                    └────────────────────────────────────────┘
```

### 四条需求之间的依赖

```
R1 (contract)  ── 提供 Verify-By/Evidence ──► R3 (known-failures)
                                              （spec-check 用 Verify-By 判断时
                                               更准，能减少误报）

R2 (handoff)   ── 提供原子任务级状态 ───────► R4 (mission-grade loop)
                                              （fresh-context 子会话之间
                                               靠 handoff 而不是对话历史接续）

R3 (KB)        ── 提供历史模式检索 ─────────► R4 (mission-grade loop)
                                              （loop 跑得越久，KB 越值钱）

R4 (loop)      ── 不依赖前三条即可独立落地，但 R1-R3 的 schema 让 R4 wall-clock 拉长后
                  仍保持质量稳定
```

## Components and Interfaces

### Component 1：forge-spec SKILL 增加 Validation Contract 章节（R1）

**位置**：`skills/forge-spec/SKILL.md` + `skills/forge-spec/templates/requirements.md.template`

**接口变更**：

```markdown
## 起草阶段（Section 3）

当 AI 起草 requirements.md 时，必须为每个 Requirement 的每条 Acceptance Criteria
追加两个字段：

  - **Verify-By**: 必须是 `vitest` / `bash` / `forge_git` / `forge_exec` / `manual` 之一
  - **Evidence**: 1-2 行非空字符串，描述验证产物

模板示例（templates/requirements.md.template）：

  ### Requirement N: <短标题>

  **User Story**: ...

  #### Acceptance Criteria

  1. WHEN ... THEN ... SHALL ...
     **Verify-By**: vitest
     **Evidence**: test/<feature>/<acN>.test.ts 测试 `should ...` 通过

## 锁定阶段（Section 4）

forge-spec SKILL 在 lock 前调用 scripts/check-spec-contract.sh 校验：
  - 每条 AC 必须有 Verify-By 和 Evidence
  - Verify-By 必须在白名单
  - Evidence 必须非空且不含 placeholder
```

**新增脚本** `scripts/check-spec-contract.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail
spec_file="$1"
[[ -f "$spec_file" ]] || { echo "ERROR: spec not found"; exit 1; }

# 提取所有 Acceptance Criteria block 并检查 Verify-By + Evidence
node scripts/check-spec-contract.js "$spec_file"
```

`scripts/check-spec-contract.js` 主要逻辑：用 markdown AST（已用 `unified` 库）解析 `#### Acceptance Criteria` 章节，逐条校验。

**Legacy 兜底**：spec frontmatter 含 `contract_legacy: true` 时跳过校验（用于 lock 时间早于本 spec 上线日的旧 spec）。

### Component 2：spec-check agent 升级为契约驱动（R1）

**位置**：`.claude/agents/spec-check.md`

**接口变更**（增量）：

```markdown
## Check Method（修订）

Step 0（强制首步）保持不变：调用 `forge_git(subcommand="diff-content")`。

新增 **Step 0.5**：从 spec 中提取 Validation Contract 章节，构建 `Map<AC-id, {VerifyBy, Evidence}>`。

Step 2（修订）：基于 diff 内容分析变更时，**优先**按 contract 表逐条匹配：
  - 找到 `Verify-By: vitest` 的 AC → 在 diff 中找到对应测试文件，检查测试名是否匹配 Evidence
  - 找到 `Verify-By: bash` 的 AC → 在 diff 中找到对应脚本变更，或验证脚本存在
  - 找到 `Verify-By: forge_git` 的 AC → 必须在实现 diff 中能通过该工具调用验证

新增 **Stub Detection** 触发条件（在已有 R8 stub 检测之上）：
  - AC 标注 `Verify-By: vitest` 但对应测试文件 diff 中只有 `expect(true).toBe(true)` 或类似空断言 → 判 P0

新增 P1：contract incomplete
  - 任一 AC 缺 Verify-By 或 Evidence → 输出 P1 issue（spec 应被退回 lock 阶段）
```

### Component 3：forge-build SKILL 强制 Handoff Block（R2）

**位置**：`skills/forge-build/SKILL.md` Section 3.4 / 3.5

**接口变更**：

```markdown
## 3.5 原子任务完成 → 写 Handoff（新增）

每完成一个原子任务并准备 commit 前，build agent 必须在 `.tinkerman/progress/<topic>.md`
对应任务条目下追加一份 handoff block：

\`\`\`yaml handoff
task_id: T-<n>
completed:
  - <做了什么 1>
  - <做了什么 2>
not_completed:
  - <留给后续的 1>  # 如果完整完成则填 []
commands_executed:
  - cmd: "npm run check"
    exit_code: 0
  - cmd: "git diff --stat"
    exit_code: 0
issues_found:
  - <发现的边角问题或潜在 bug>  # 没有就填 []
procedure_compliance: |
  RED: test/<file>.test.ts 新增失败用例 X
  GREEN: src/<file>.ts 实现满足
  REFACTOR: <提取了什么 / 没必要重构则填 'skipped'>
\`\`\`

下一个原子任务启动前，build agent 必须先读取上一任务的 handoff block 作为接续输入。

light tier：
  - handoff 字段降级为可选；最低必填 commands_executed + procedure_compliance
standard / full tier：
  - 5 字段全部必填
```

**Self-Check 增量**：

`skills/forge-build/references/self-check.md` 增加 case：

```markdown
- [ ] 已 commit 的每个原子任务都对应一份 handoff block
- [ ] 每份 handoff block 包含 5 个字段（standard/full tier）
- [ ] commands_executed 数组中至少有一条 cmd
- [ ] procedure_compliance 包含 RED/GREEN/REFACTOR 三关键词或 `skipped`
```

不通过即输出 P1，build 不结束。

### Component 4：review 三层 agent 输出 known-failures append-block（R3）

**位置**：`.claude/agents/spec-check.md` / `quality-check.md` / `security-check.md` Output Format 章节

**接口变更**（每个 agent 都加同一段）：

```markdown
## Output Format（增量）

每输出一条 P0 或 P1 issue 时，**额外**输出一段 known-failures append-block：

\`\`\`yaml known-failure
pattern_id: <slug>            # 自动生成：<reviewer>-<short-hash-of-signature>
severity: P0|P1
first_seen_commit: <sha>      # 当前 HEAD
signature: <1 行特征描述>      # 如 "stub function returns {} for non-empty input"
fix_required: <修复建议>
\`\`\`

报告头部新增"本次 diff 命中的历史失败模式"段：

  ## 本次命中历史模式

  | pattern_id | last_seen | occurrences | fix_in_diff? |
  |------------|-----------|-------------|--------------|
  | spec-stub-empty-default | 2026-05-10 | 3 | ❌ → P1 recurrence |
```

**位置**：`skills/forge-review/SKILL.md`

**新增 Section** 4.5: known-failures 合并：

```markdown
## 4.5 known-failures 累积

forge-review SKILL 在收到三层评审输出后：
  1. 提取所有 known-failure append-block
  2. 读取 .tinkerman/knowledge/known-failures.md
  3. 按 pattern_id 去重：
     - 不存在 → append 新条目
     - 已存在 → 仅更新 last_seen_commit 和 occurrence_count
  4. 在 review 报告末尾输出："本次新增 N 条、更新 M 条 known-failures"

文件格式（known-failures.md）：

\`\`\`yaml
- pattern_id: spec-stub-empty-default
  severity: P1
  first_seen: 2026-05-10
  last_seen: 2026-05-16
  occurrence_count: 3
  signature: "stub function returns {} for non-empty input"
  fix_required: "implement actual logic or mark as Zero-Pack no-op"
\`\`\`

retention：超过 100 条时按 last_seen 升序自动归档到
`.tinkerman/archive/known-failures-<date>.md`，known-failures.md 保留最近 80 条。
```

**位置**：所有三个 review agent 的 Step 0 之后

```markdown
## Step 0.5（新增）：读取 known-failures 检测复发

读取 .tinkerman/knowledge/known-failures.md，对当前 diff 中的代码模式检索匹配。
若命中且 diff 中没有针对该 pattern 的修复痕迹 → 输出 P1 issue：
  "known-failure recurrence — pattern <pattern_id>, last seen at <commit>"
```

### Component 5：forge-loop 升级为 fresh-context 子会话编排（R4）

**位置**：`skills/forge-loop/SKILL.md`

**接口变更**：

#### 5.1 子会话隔离（新增 Section 4.x）

```markdown
## 4.X Fresh-Context Subsession Discipline

forge-loop 调度下一个 SKILL 阶段时，必须通过 `Skill(skill="forge", args="<phase>")`
触发新的 fresh-context 子会话。**禁止**在同一会话内串联多个 SKILL 实例。

理由：每次 SKILL 调用都从状态文件读取上下文，避免单一会话因长度膨胀超时。
（Factory Missions: median trajectory 51 turns / 30 turns，靠 fresh-context 重启
  撑长周期。）

状态文件清单（白名单）：
  - .tinkerman/status.md
  - .tinkerman/specs/<topic>/spec.md
  - .tinkerman/plans/<topic>.md
  - .tinkerman/progress/<topic>.md
  - .tinkerman/findings/<topic>.md
  - .tinkerman/knowledge/known-failures.md
  - .tinkerman/runs/<run-id>/events.ndjson

禁止依赖的"状态"：
  - 上一阶段会话的对话历史
  - agent 的"记忆"
  - 任何不在白名单中的内存变量
```

#### 5.2 events.ndjson 事件流增强（修订 Section 9）

```markdown
## 9 events.ndjson 事件流（增量）

每次 SKILL 调用前后写入两条事件：

\`\`\`json
{"type":"phase_start","ts":"2026-05-16T10:00:00Z","phase":"build",
 "iteration":3,"session_id":"<uuid>","wall_clock_elapsed_seconds":1234,
 "token_budget_used":234500}

{"type":"phase_end","ts":"2026-05-16T10:42:31Z","phase":"build",
 "iteration":3,"session_id":"<uuid>","exit_code":0,
 "wall_clock_elapsed_seconds":3785,"token_budget_used":456789}
\`\`\`

events.ndjson 是 forge-resume 的恢复源：始终读最后一条 phase_end（或最后一条
phase_start 如果没有匹配的 end）来决定从哪里继续。
```

#### 5.3 mission summary（修订 Section 7）

```markdown
## 7 关机序列（增量）

forge-loop 正常或异常结束时输出运行总结，对齐 Missions 演讲指标维度：

  ## Mission Summary

  - **Total wall-clock**: 4h 23m
  - **Total skill invocations**: 14（plan×1, build×4, review×3, test×2, ship×1, learn×1, retry×2）
  - **Total iterations**: 6
  - **Token budget used**: 1.2M / 5M（24%）
  - **Cache hit rate**: 87%
  - **Milestones completed**: 3/3
  - **Known-failures matched / new**: 5 / 2
```

### Component 6：契约测试增量（R1-R4）

**位置**：`test/`

**新增测试文件**：

```
test/
├── forge-spec/
│   └── contract-validation.test.ts        # R1: Verify-By/Evidence 校验
├── forge-build/
│   └── handoff-schema.test.ts             # R2: 5 字段 schema 校验
├── forge-review/
│   ├── known-failures-append.test.ts      # R3: P0/P1 输出 append-block
│   └── known-failures-recurrence.test.ts  # R3: 复发检测
└── forge-resume/
    └── events-cursor-resume.test.ts       # R4: events.ndjson cursor 恢复
```

每个测试文件覆盖对应 Acceptance Criteria 的 vitest 类条目（参考 requirements.md 的 Validation Contract 章节）。

## Data Models

### Validation Contract Schema

```typescript
interface AcceptanceCriterion {
  id: string;                    // 自动生成: 1.1, 1.2 ...
  text: string;                  // WHEN ... THEN ... SHALL ...
  verifyBy: 'vitest' | 'bash' | 'forge_git' | 'forge_exec' | 'manual';
  evidence: string;              // 非空字符串，1-2 行
}

interface SpecContract {
  requirements: Array<{
    id: string;                  // R1, R2, ...
    title: string;
    userStory: string;
    criteria: AcceptanceCriterion[];
  }>;
  validationContract: Array<{    // 显式 VAL-* 章节，可选
    valId: string;               // VAL-R1-001
    verifyBy: AcceptanceCriterion['verifyBy'];
    evidence: string;
    covers: string[];            // [1.1, 1.2]
  }>;
}
```

### Handoff Block Schema

```typescript
interface HandoffBlock {
  task_id: string;                // T-1, T-2.3, ...
  completed: string[];            // 必填，至少 1 项
  not_completed: string[];        // 必填，可为 []
  commands_executed: Array<{      // 必填，至少 1 项
    cmd: string;
    exit_code: number;
  }>;
  issues_found: string[];         // 必填，可为 []
  procedure_compliance: string;   // 必填，多行字符串，包含 RED/GREEN/REFACTOR 或 'skipped'
}
```

### known-failures.md Schema

```typescript
interface KnownFailure {
  pattern_id: string;             // <reviewer>-<short-hash>
  severity: 'P0' | 'P1';
  first_seen: string;             // ISO date
  last_seen: string;              // ISO date
  occurrence_count: number;
  signature: string;              // 1 行
  fix_required: string;           // 1-3 行
}
```

### events.ndjson Phase Event

```typescript
type PhaseEvent =
  | {
      type: 'phase_start';
      ts: string;
      phase: 'plan' | 'build' | 'review' | 'test' | 'ship' | 'learn' | 'decide' | 'spec' | 'debug';
      iteration: number;
      session_id: string;
      wall_clock_elapsed_seconds: number;
      token_budget_used: number;
    }
  | {
      type: 'phase_end';
      ts: string;
      phase: PhaseEvent['phase'];
      iteration: number;
      session_id: string;
      exit_code: number;
      wall_clock_elapsed_seconds: number;
      token_budget_used: number;
    };
```

## Correctness Properties

### Property 1: spec lock 不会通过不完整 contract

**Validates: Requirements 1.2, 1.4**

任何缺少 `Verify-By` 或 `Evidence` 字段的 spec 在 lock 时阻断；frontmatter 含 `contract_legacy: true` 的 spec 例外。

**验证方法**：构造一个缺字段的 spec，调用 lock，应失败；加 `contract_legacy: true` 后应通过。

### Property 2: 每个原子任务都有 handoff block

**Validates: Requirements 2.1, 2.7, 2.8**

build SKILL 完成后，已 commit 的每个原子任务条目下都对应一份合法的 5 字段 handoff block。

**验证方法**：解析 `.tinkerman/progress/<topic>.md`，校验 commit 数 = handoff block 数；schema 校验通过。

### Property 3: known-failures.md append-only

**Validates: Requirements 3.3**

review 阶段对 known-failures.md 的所有写入都是 append 或 in-place update，**不删除**任何已有条目。

**验证方法**：在两次 review 之间 snapshot known-failures.md，diff 仅包含新增行或 `last_seen`/`occurrence_count` 字段更新行。

### Property 4: forge-loop 跨子会话状态守恒

**Validates: Requirements 4.2, 4.6, 4.7**

forge-loop 每次 SKILL 调用前后 `.tinkerman/status.md` + events.ndjson 都构成状态完整快照；`/forge resume` 在新会话内能从最新 cursor 完整恢复。

**验证方法**：人为在某次 SKILL 调用之间杀掉进程，运行 `/forge resume <run-id>`，新会话状态与中断前一致。

## Error Handling

### E1：旧 spec 缺 Validation Contract 触发 lock 失败

**原因**：本 spec 上线前 lock 的 spec 没有 Verify-By/Evidence 字段。

**处理**：在旧 spec 的 frontmatter 加 `contract_legacy: true`，跳过 R1 校验。批量加标记的脚本：

```bash
bash scripts/mark-legacy-contracts.sh  # 扫描 .tinkerman/specs/*/spec.md
                                       # 对 status: locked 且 lock_date < today 的加标记
```

### E2：light tier 任务量大导致 handoff schema 写不全

**原因**：light tier 改动小（≤1 文件 ≤20 行），但 5 字段 schema 仍要求填写。

**处理**：light tier 降级为最低 commands_executed + procedure_compliance 两字段必填，其他 3 个字段可填 `[]` 或 `'n/a'`。

### E3：known-failures.md 增长失控

**原因**：长期累积超过 100 条；每次 review 检索成本上升。

**处理**：超过 100 条时自动归档：按 `last_seen` 升序，归档最旧 20 条到 `.tinkerman/archive/known-failures-<date>.md`，正文保留最新 80 条。归档动作由 forge-review SKILL 在每次 review 结束时执行（仅在 count > 100 时触发）。

### E4：forge-loop fresh-context 调用导致 cache miss 暴增

**原因**：每次 SKILL 调用都重新加载状态文件，prefix cache 命中可能下降。

**处理**：forge-loop 在 phase_end 事件中记录 `token_budget_used` 和 `cache_hit_rate`（如 SDK 暴露）。监控指标进入 `.tinkerman/knowledge/metrics.md`。若实测 cache 命中率 < 70%，重新评估状态文件分区策略。

### E5：events.ndjson cursor 损坏

**原因**：进程异常退出导致最后一行 JSON 不完整。

**处理**：forge-resume 解析时容错：跳过最后一行损坏的 NDJSON，从倒数第二条事件继续。在 events.ndjson 写入时使用 `O_APPEND` + 单行 flush 模式减少损坏概率。

## Testing Strategy

### 单元测试

| 测试文件 | 覆盖需求 | 测试数量预估 |
|---|---|---|
| `test/forge-spec/contract-validation.test.ts` | 1.1-AC6 | 8-10 |
| `test/forge-build/handoff-schema.test.ts` | 2.1-AC8 | 10-12 |
| `test/forge-review/known-failures-append.test.ts` | 3.1-AC3, AC6 | 6-8 |
| `test/forge-review/known-failures-recurrence.test.ts` | 3.4-AC5 | 4-6 |
| `test/forge-resume/events-cursor-resume.test.ts` | 4.6-AC7 | 6-8 |

### 集成测试

`test/integration/missions-rigor.test.ts`：

- 端到端跑一次 light tier `/forge build → /forge review` 流程，验证 handoff block 写入 + known-failures append-block 生成
- 模拟 review 命中历史模式 → 输出 P1 recurrence

### 端到端（手动 dogfooding）

1. 用本 spec 自身做 dogfooding：跑完整的 standard tier `decide → plan → build → review → test → ship`
2. 在过程中故意引入一个 stub function 触发 spec-stub-empty-default 模式
3. 后续运行同 topic 的另一个改动，观察 review 是否检测到 known-failure recurrence
4. 跑一次 forge-loop，wall-clock 应 ≥1 小时（先达成 4.5 的入门目标），观察 events.ndjson 中 phase_start/phase_end 的 session_id 不重复

### Property-based Testing

- handoff schema 解析的 round-trip：`parse(serialize(handoff)) === handoff`
- known-failures.md 解析的 round-trip
- events.ndjson 解析的 cursor 单调性：`events[i+1].ts >= events[i].ts`
