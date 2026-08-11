---
feature: cursor-team-kit-integration
layout: design
created: 2026-05-08
---

# Design Document

## 1. Overview

### 1.1 设计目标

本设计将 `requirements.md` 中 14 条 Requirement 映射为 5 个新 SKILL + 1 个 Subagent 维度扩展 + 2 个现有 SKILL 的新 flag + 1 个 ship 后置步骤 + 若干纯函数模块，在不破坏 Forge 现有 13 个 SKILL 契约与三区文件保护模型的前提下落地 Cursor team-kit 的 9 条学习点。

映射关系（与 Introduction §业务价值对齐）：

| 业务价值 | Requirement | 实现载体 |
|---|---|---|
| ① 证据化验证三态结论 | R1 | `skills/forge-verify/` + `src/verify.ts` |
| ② PR 评审单页 HTML 画布 | R4 | `skills/forge-review/` 新增 `--canvas` flag + `src/canvas-renderer.ts` |
| ③ CLI / UI 外部验证回路 | R5 / R6 | `skills/forge-control-cli/` + `skills/forge-control-ui/` |
| ④ 合并冲突三区感知 | R7 | `skills/forge-fix-conflicts/` + `src/conflict-classifier.ts` |
| ⑤ 原子规则层 | R3 | 项目根 `rules/` + `src/rules-loader.ts` |
| ⑥ 会话偏好沉淀 | R10 | `forge-learn --from-chats` 模式 + `src/chat-preference-extractor.ts` |
| ⑦ 发布后本地复验 | R8 | `src/ship.ts` 扩展（≤ 50 行）|
| ⑧ AI 异味清洗 | R2 | `.claude/agents/quality-check.md` 追加维度 |
| ⑨ 时间窗复盘 | R9 | `skills/forge-recap/` + `src/recap.ts` |
| — | R11 | `.claude/agents/quality-check.md` + `security-check.md` 加 `background: true` |
| — | R12–R14 | 横切关注点（见 §5）|

### 1.2 高层架构

```ascii
┌──────────────────────────────────────────────────────────────────────────┐
│                         Claude Code / Forge Loop                          │
│                                                                           │
│   /forge <cmd>  →  commands/forge.md (router)                            │
│                         │                                                 │
│                         ▼                                                 │
│   skills/ (13 existing + 5 new + 2 extended flags)                       │
│   ├── forge-verify        ◀── R1: 三态证据化验证                         │
│   ├── forge-recap         ◀── R9: 时间窗复盘                             │
│   ├── forge-control-cli   ◀── R5: CLI/TUI harness                       │
│   ├── forge-control-ui    ◀── R6: Web/Electron harness                  │
│   ├── forge-fix-conflicts ◀── R7: 三区感知合并冲突                      │
│   ├── forge-review --canvas  ◀── R4: HTML 评审画布                      │
│   ├── forge-test --cli       ◀── R5 触发入口                             │
│   ├── forge-learn --from-chats ◀── R10: 偏好提炼                        │
│   └── forge-ship (extended)    ◀── R8: 发布后复验                       │
│                         │                                                 │
│                         ▼                                                 │
│   agents/ (10 existing, 3 with new fields)                               │
│   ├── quality-check  (+deslop dim, +background, +读 rules/ & mismatches) │
│   ├── security-check (+background)                                       │
│   └── spec-check     (保持同步)                                          │
│                         │                                                 │
│                         ▼                                                 │
│   src/ (95 existing + 9 new modules)                                     │
│   ├── verify.ts, verdict-parser.ts, baseline-resolver.ts                 │
│   ├── canvas-renderer.ts, bitbucket-mcp-adapter.ts                      │
│   ├── cli-harness.ts, ui-harness.ts                                     │
│   ├── conflict-classifier.ts, guarded-merger.ts                         │
│   ├── recap.ts, chat-preference-extractor.ts                            │
│   ├── secret-redactor.ts (R12.11)                                       │
│   └── rules-loader.ts                                                    │
│                         │                                                 │
│                         ▼                                                 │
│   State & Hooks (不变)                                                   │
│   ├── .forge/ (三区保护 + 新增 /findings/<topic>/, /ship/, /recap/)     │
│   ├── hooks/hooks.json (保持不变，frozen-zone 保护照常)                 │
│   └── rules/ (新增根目录，非 Frozen_Zone)                               │
└──────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
         可选外部组件（全部优雅降级）
         ├── Bitbucket MCP (add_comment, create_pr_task, get_pull_request_diff)
         ├── cmux (socket: /tmp/cmux.sock, env: $CMUX_WORKSPACE_ID)
         ├── tmux / Node PTY
         └── Playwright / CDP（仅使用用户项目 devDeps）
```

### 1.3 集成原则

1. **加法不减法**：新能力一律新增 SKILL 或新增 flag，不修改既有 SKILL 的外部契约（Markdown 输出 schema / 门禁行为）。唯一例外是 `quality-check` 追加一个维度，其输出列与 severity 规则保持不变 [R2.4, R11.1 对比]。
2. **三态降级**：所有可选组件（Bitbucket MCP、cmux、Playwright、CDP）都必须在不可用时进入下一级 fallback，绝不产生硬失败。harness 和 canvas 都按此模式设计 [R5.2, R6.2, R12.3, R12.4, R14.1–14.6]。
3. **证据链一致**：新增的 harness 产出 `verdict.md` 必须能被 `forge-verify` 解析重放，不做格式翻译 [R1.9, R5.5, R6.7]。
4. **三区保护不绕过**：新增 SKILL 的所有写路径都在 Open_Zone 或 Guarded_Zone 追加模式内，PreToolUse hook 继续拦截 Frozen_Zone [R12.9]。

---

## 2. Component Architecture

### 2.1 新增 SKILL（5 个）

全部位于 `skills/<name>/`，均含 `SKILL.md`（≤ 3072 bytes）+ `references/*.md`（细节）+ `templates/*.md`（可选产物模板）。

| SKILL | 路径 | Trigger | 输出路径 |
|---|---|---|---|
| `forge-verify` | `skills/forge-verify/SKILL.md` | `/forge verify <topic>` 或 bugfix tier 自动触发 [R1.1, R1.7] | `.forge/findings/<topic>/verify-this/*` |
| `forge-recap` | `skills/forge-recap/SKILL.md` | `/forge recap --since <window>` [R9.1] | stdout + 可选 `.forge/findings/recap/<ts>.md` |
| `forge-control-cli` | `skills/forge-control-cli/SKILL.md` | `forge-test --cli` / `package.json bin` 非空 / `cli_harness: true` [R5.1] | `.forge/findings/<topic>/cli-harness/*` |
| `forge-control-ui` | `skills/forge-control-ui/SKILL.md` | 项目含 UI 框架依赖 或 designer 产出 UI spec [R6.1] | `.forge/findings/<topic>/ui-harness/*` |
| `forge-fix-conflicts` | `skills/forge-fix-conflicts/SKILL.md` | 检测到 `git diff --name-only --diff-filter=U` 非空 | 原位合并 + `.forge/debug/unlock-<ts>.md` |

### 2.2 新增 Subagent 维度（1 个）

不新增 agent 文件，仅扩展现有 `.claude/agents/quality-check.md`：

- 在原 6 个维度（命名/错误处理/性能/测试覆盖率/代码重复/可维护性）后追加 `deslop` 维度 [R2.1]
- 4 个检测模式：comment-paraphrase / infallible-try-catch / any-cast-suppression / nesting-depth-≥4 [R2.2]
- 输出仍走既有 Severity/File/Issue/Suggestion 四列 [R2.4]
- 新增在 session start 读取 `rules/*.md` 和 `.forge/findings/<topic>/ui-harness/mismatches.md` 的步骤 [R3.6, R6.6]

### 2.3 现有 SKILL 新 flag（3 处）

| SKILL | 新增 flag | 行为 | 关联 |
|---|---|---|---|
| `forge-review` | `--canvas <topic>` | 在既有 `.forge/reviews/<topic>.md` 基础上渲染 HTML 画布 | R4 |
| `forge-test` | `--cli` | 强制触发 CLI harness（即使 `bin` 为空）| R5.1 |
| `forge-learn` | `--from-chats` | 切换到会话偏好提炼模式 | R10.1 |

### 2.4 新增 TS 模块（`src/`）

| 模块 | 职责 | 纯函数？ | 对应 Requirement |
|---|---|---|---|
| `src/verify.ts` | Forge_Verify orchestrator | 否（IO） | R1 |
| `src/verdict-parser.ts` | 解析 harness 产出的 `verdict.md` | 是 | R1.9 |
| `src/baseline-resolver.ts` | 四级 baseline 解析优先级 | 否（git IO）| R1.10 |
| `src/canvas-renderer.ts` | 渲染 HTML 画布 | 否（读取 + 写盘）| R4 |
| `src/bitbucket-mcp-adapter.ts` | MCP 工具调用 + 超时 + 降级 | 否 | R4.11 / R8.3 |
| `src/cli-harness.ts` | CLI harness 调度器 + 4 级 tier 检测 | 否 | R5 |
| `src/ui-harness.ts` | UI harness 调度器 + 4 级 tier 检测 | 否 | R6 |
| `src/conflict-classifier.ts` | 纯函数分类器 | **是** | R7.1 / R13.1 / R13.2 |
| `src/guarded-merger.ts` | 受保护区语义合并策略 | 大部分是 | R7.4–7.9 |
| `src/recap.ts` | Recap 数据聚合 + 分类 | 否（git + fs IO）| R9 |
| `src/chat-preference-extractor.ts` | 从 `.claude/` transcript 提取 Preference_Atom | 否 | R10 |
| `src/secret-redactor.ts` | 统一日志/产物脱敏 | **是** | R12.11 |
| `src/rules-loader.ts` | 读取 + 校验 `rules/*.md` | 否（fs） | R3.6 |

### 2.5 Agent frontmatter 扩展

```yaml
# .claude/agents/quality-check.md（修改）
name: quality-check
description: Layer 2 code quality reviewer, now with deslop dimension
model: sonnet
background: true              # [R11.1]
tools: Read, Grep, Glob, Bash  # 不变
---

# .claude/agents/security-check.md（修改）
background: true              # [R11.1]

# .claude/agents/spec-check.md（不变，因为是评审门禁前置）[R11.2]
```

---

## 3. Data Design

### 3.1 新增目录结构

```
.forge/
├── findings/
│   ├── <topic>/
│   │   ├── verify-this/         [R1: forge-verify 产出]
│   │   │   ├── claim.md          # Falsifiable_Claim (condition/metric/threshold)
│   │   │   ├── baseline/         # 至少 1 条 command log + 1 条 metric output
│   │   │   ├── treatment/        # 同上
│   │   │   ├── diff/             # baseline vs treatment 预计算差异
│   │   │   └── verdict.md        # Three_State_Verdict + Evidence_Chain
│   │   ├── cli-harness/          [R5: forge-control-cli 产出]
│   │   │   ├── before.txt
│   │   │   ├── after.txt
│   │   │   ├── transcript.log
│   │   │   └── verdict.md
│   │   ├── ui-harness/           [R6: forge-control-ui 产出]
│   │   │   ├── baseline/
│   │   │   ├── treatment/
│   │   │   ├── console.log
│   │   │   ├── errors.log
│   │   │   ├── mismatches.md     # designer spec 不一致的断言，供 quality-check 读 [R6.6]
│   │   │   └── verdict.md
│   │   └── canvas-errors.log     [R14.2: Bitbucket MCP 错误日志]
│   └── recap/
│       └── <timestamp>.md        [R9.7: 可选复盘产物]
├── ship/                         [R8.7: 开放区]
│   └── <topic>-post-push-verify.md
├── reviews/
│   └── <topic>.canvas.html       [R4.1: HTML 画布; reviews/ 属受保护区但 .canvas.html 是新增文件，允许写]
├── debug/
│   └── unlock-<timestamp>.md     [R7.4: 冻结区解锁记录]
├── knowledge/
│   └── sessions/
│       ├── from-chats-errors.log     [R14.10]
│       └── from-chats-skipped.log    [R10.5, autonomous 模式]
└── .locks/
    └── <topic>.lock              [R12.13: 并发保护]
```

### 3.2 Artifact Schema

#### 3.2.1 `verify-this/claim.md` [R1.2]

```yaml
---
condition: "在 N=1000 并发用户请求下"
metric: "p95 响应延迟"
threshold: "≤ 200ms"
baseline_ref: "origin/main"   # 对应 R1.10 解析结果
topic: "perf-optimization"
created_at: "2026-05-08T10:00:00+08:00"
---
# Falsifiable Claim

在指定条件下，度量指标必须满足阈值约束。若任一字段为空，forge-verify SHALL 中止并写 INCONCLUSIVE [R1.3]。
```

#### 3.2.2 `verify-this/verdict.md` [R1.1, R1.5, R1.9]

```yaml
---
verdict: "VERIFIED" | "NOT_VERIFIED" | "INCONCLUSIVE"
topic: "perf-optimization"
claim_path: "claim.md"
baseline_snapshot: "<git-sha-or-snapshot-id>"
treatment_snapshot: "<current-HEAD-sha>"
decided_at: "2026-05-08T10:05:12+08:00"
missing_artifacts: []          # 仅 INCONCLUSIVE 时非空 [R1.6]
inconclusive_reason: null       # 仅 INCONCLUSIVE 时非空
---
# Verdict: VERIFIED

## Evidence Chain

- [Command] `npm run bench` → [Output] `baseline/bench.json` → [Claim] baseline p95 = 480ms
- [Command] `npm run bench` → [Output] `treatment/bench.json` → [Claim] treatment p95 = 180ms
- [Command] `diff` → [Output] `diff/bench.diff.md` → [Claim] -62.5% 满足 ≤200ms 阈值
```

#### 3.2.3 `ui-harness/mismatches.md` [R6.6]

```markdown
| Severity | File | Issue | Suggestion |
|----------|------|-------|------------|
| P1 | src/components/LoginForm.tsx | Submit button label mismatch: spec "登录" vs rendered "登录 →" | Update label to match designer spec line 23 |
```

此文件 schema 与 quality-check 外部契约完全一致，quality-check 直接追加到 Layer 2 输出 [R2.4, R6.6]。

#### 3.2.4 `ship/<topic>-post-push-verify.md` [R8.2]

```yaml
---
topic: "user-pagination"
command: "npm run check"
exit_code: 1                    # 或字符串 "timeout"
timed_out: false                # true 当 600s 超时
executed_at: "2026-05-08T11:23:00+08:00"
---
# Post-Push Verify Failure

## Last 200 lines of stdout+stderr (combined)

<trimmed output>
```

#### 3.2.5 `debug/unlock-<timestamp>.md` [R7.4]

```yaml
---
unlocked_file: ".forge/specs/user-api/spec.md"
original_status: "locked"
new_status: "draft"
unlocked_by: "user"
unlocked_at: "2026-05-08T11:00:00+08:00"
---
# Frozen File Unlocked for Merge

Status was reset from `locked` to `draft` to permit three-way merge. Original status is NOT auto-restored; review and re-lock manually post-merge.
```

#### 3.2.6 `findings/recap/<timestamp>.md` [R9.7]

```yaml
---
window: "7d"
since: "2026-05-01"
until: "2026-05-08"
entry_count: 42
categories:
  bugfix: 12
  tech-debt: 8
  net-new: 15
  spec-driven: 5
  explore: 2
---
# Recap 2026-05-01 → 2026-05-08

## Bugfix (12)
- [abc1234] Fix null-pointer in UserService.findById (R1.3 applied)

## Archival Candidates (evolved-rules.md)
- rule-03 (Last_triggered = 2026-04-02, 6 sessions stale)
```

### 3.3 `.forge/config.md` 新增可选字段 [R12.8]

```yaml
---
# 既有字段不变
project: "MyApp"
stack: [...]
security_level: 1
knowledge_limit: 20
max_parallel_agents: 6

# R7.11 + R14.11: 当 package.json 无 scripts.check 时的 fallback
ci_check_command: "pnpm run verify"   # 可选, 默认 null

# R12.12: findings 保留策略
findings_retention_days: 30           # 可选, 默认 30

# R5.1(c): 强制启用 CLI harness
cli_harness: false                    # 可选, 默认 false

# R8: post-push verify 开关
post_push_verify_enabled: true        # 可选, 默认 true

# R4.2: canvas 数据源优先级覆盖
canvas_data_source_priority:          # 可选, 默认 ["reviews","diff","log","bitbucket"]
  - reviews
  - diff
  - log
  - bitbucket
---
```

**向后兼容保证**：全部字段 optional，已有项目无需 edit `.forge/config.md` 即可继续正常运行 [R12.8]。

### 3.4 `rules/*.md` Frontmatter Schema [R3.2]

```yaml
---
alwaysApply: true                     # 必填, boolean
lint_binding: "biome/noExplicitAny"   # 必填, null | string | {biome, eslint}
# 或
lint_binding:
  biome: "noExplicitAny"
  eslint: "@typescript-eslint/no-explicit-any"
stack: ["typescript", "javascript"]   # 可选, 用于 init.sh 筛选 [R3.4]
severity_hint: "P1"                   # 可选, 默认 P2
---

# Rule: No `any` Cast

Violating example:
\`\`\`typescript
const x = value as any;
\`\`\`

Correct:
\`\`\`typescript
const x = value as UserPayload;
\`\`\`
```

---


## 4. Module Designs（逐需求）

### 4.1 forge-verify [R1]

#### 模块划分

```
skills/forge-verify/
├── SKILL.md                  # ≤ 3072 bytes [R1.12]
├── references/
│   ├── workflow.md            # 完整流程
│   ├── artifact-layout.md     # 产物布局规范
│   └── baseline-resolution.md # R1.10 优先级
└── templates/
    ├── claim.md.tmpl
    └── verdict.md.tmpl

src/verify.ts                  # orchestrator
src/verdict-parser.ts          # 解析 harness 产出
src/baseline-resolver.ts       # 4 级 baseline 优先级
```

#### 核心签名

```typescript
// src/verify.ts
export interface VerifyOptions {
  topic: string;
  baselineRef?: string;        // R1.10 优先级 (1)
  autonomous?: boolean;        // 是否 bugfix tier 自动触发 [R1.7]
}

export type Verdict = "VERIFIED" | "NOT_VERIFIED" | "INCONCLUSIVE";

export interface VerifyResult {
  verdict: Verdict;
  claimPath: string;
  verdictPath: string;
  evidenceChain: EvidenceEntry[];
  inconclusiveReason?: string;
}

/**
 * 运行 forge-verify 完整流程 [R1.1]：
 * 1. 读取或生成 claim.md [R1.2]; 字段缺失 → INCONCLUSIVE [R1.3]
 * 2. 解析 baseline [R1.10]; 解析失败 → INCONCLUSIVE
 * 3. 捕获 baseline 与 treatment artifacts [R1.4]; 任一缺失 → INCONCLUSIVE [R1.6]
 * 4. 计算 diff 并写入 diff/ [R1.4]
 * 5. 构造 Evidence_Chain 并写 verdict.md [R1.5]
 * 6. 支持 harness verdict.md 解析与重放 [R1.9]
 */
export async function runVerify(opts: VerifyOptions): Promise<VerifyResult>;

// src/baseline-resolver.ts
export interface BaselineResolution {
  ref: string | null;
  strategy: "explicit" | "merge-base" | "parent-commit" | "last-treatment-snapshot" | "none";
}

/**
 * 按 R1.10 四级优先级解析 baseline:
 * (1) --baseline <git-ref> → git rev-parse
 * (2) merge-base vs origin/main（若有 origin）
 * (3) HEAD^（若无 origin）
 * (4) 上次成功的 treatment snapshot
 * 全部失败返回 { ref: null, strategy: "none" }
 */
export async function resolveBaseline(topic: string, explicit?: string): Promise<BaselineResolution>;

// src/verdict-parser.ts
export interface ParsedVerdict {
  verdict: Verdict;
  claimPath: string;
  evidenceChain: EvidenceEntry[];
  rawFrontmatter: Record<string, unknown>;
}

/**
 * 解析任意 verdict.md（forge-verify 自己产出或 harness 产出）[R1.9]
 * 保证 Three_State 穷举性：输入损坏时返回 verdict: "INCONCLUSIVE"
 */
export function parseVerdict(content: string): ParsedVerdict;
```

#### 关键设计决策

- **Verdict 状态机穷举**（[R13.3]）：`Verdict` 类型只有 3 个字面量，TS 穷举 `never` 检查保证新增状态时编译失败；`runVerify` 每条路径都写入其中之一。
- **baseline 回退链**（[R1.10]）：四级回退覆盖"显式指定 / 有 origin / 无 origin / 纯 topic（无 git 语境）"全部场景；前 3 级 git IO，第 4 级 fs IO。
- **harness 互操作**（[R1.9]）：`verdictParser` 是无状态纯函数，能读取任何符合 schema 的 `verdict.md`，使 CLI / UI harness 只负责写标准产物即可。

### 4.2 deslop dimension [R2]

不新增 SKILL，仅扩展 `.claude/agents/quality-check.md`。在 agent prompt 末尾追加：

```markdown
### 维度 7: deslop（AI 代码异味清洗）

除现有 6 维度外，扫描以下 4 类 AI 特征性模式：

1. **comment-paraphrase**：紧随其后代码的自然语言复述，不携带额外信息 [R2.2(a)]
2. **infallible-try-catch**：保护体内调用图静态推断为"无抛出路径"的 try/catch [R2.2(b)]
3. **any-cast-suppression**：`as any` / `<any>` 用于压制现有 TS 编译错误 [R2.2(c)]
4. **nesting-depth-≥4**：单函数内 if/for/while/switch/try 嵌套深度 ≥ 4 且可用 early return 铺平 [R2.2(d)]

**Severity 映射** [R2.6]：
- P1: any-cast-suppression, infallible-try-catch (掩盖错误类)
- P2: comment-paraphrase (风格/重复), nesting-depth-≥4
- P3: 空注释或纯冗余注释

**Evolution_Marker 触发** [R2.5]：同一模式在本次 review 的多个文件中出现 ≥ 2 次时，仅发射**一条** marker 指向 `.forge/knowledge/known-failures.md`，含 pattern 名 + 出现次数。

**失败降级** [R2.7]：未捕获异常 / 60s 超时 / 输出不符合 Severity/File/Issue/Suggestion schema 时，跳过本维度，在输出尾部追加 `deslop: skipped` 注记。
```

此维度不新增模块，检测逻辑通过 Subagent prompt 指示 Claude 进行静态扫描。

### 4.3 rules/ directory [R3]

#### 目录结构

```
rules/                               # 项目根，非 Frozen_Zone [R3.8]
├── typescript-exhaustive-switch.md
├── no-inline-imports.md
├── no-any-cast.md
└── (future)

src/rules-loader.ts                  # 读取 + 校验 frontmatter
```

#### 核心签名

```typescript
// src/rules-loader.ts
export type LintBinding = null | string | { biome?: string; eslint?: string };

export interface AtomicRule {
  name: string;              // derived from filename
  alwaysApply: boolean;
  lintBinding: LintBinding;
  stack?: string[];          // optional, for init.sh filtering
  severityHint?: "P1" | "P2" | "P3";
  body: string;              // markdown body for prompt injection
}

/**
 * Load all rules/*.md files; validate minimum schema (alwaysApply required).
 * Rules with missing/invalid frontmatter are skipped with a warning (not thrown) [R3.8].
 * Ordering: alphabetical by filename for determinism (supports R13.5 round-trip).
 */
export async function loadAllRules(rulesDir?: string): Promise<AtomicRule[]>;

/**
 * Convert AtomicRule into a single line for the Suggestion column
 * when a violation is reported [R3.7].
 * e.g., "See rule no-any-cast (biome/noExplicitAny)"
 */
export function renderSuggestionSuffix(rule: AtomicRule): string;
```

#### init.sh 安装逻辑 [R3.4]

```bash
# scripts/init.sh 扩展段
if [[ " ${stack[*]} " =~ " typescript " ]]; then
  mkdir -p "$target_dir/rules"
  for rule_file in "$forge_dist/rules/"*.md; do
    rule_name=$(basename "$rule_file")
    # 不覆盖用户已有同名规则
    if [[ ! -f "$target_dir/rules/$rule_name" ]]; then
      cp "$rule_file" "$target_dir/rules/$rule_name"
    fi
  done
fi
```

### 4.4 canvas [R4]

#### 模块划分

```
skills/forge-review/
├── SKILL.md                       # 扩展，新增 --canvas flag 说明
└── references/
    └── canvas.md                  # Cursor 模板归属说明 [R4.10]

src/canvas-renderer.ts             # HTML 生成主逻辑
src/bitbucket-mcp-adapter.ts       # 可选 enrichment
src/secret-redactor.ts             # 导出到画布前脱敏 [R12.11]

templates/canvas/
├── base.html.tmpl                 # HTML 骨架 + 三栏布局 [R4.4]
├── styles.css                     # 暗色主题
└── renderer.js                    # 折叠 / 伪代码卡片 / 去注入 JS
```

#### 核心签名

```typescript
// src/canvas-renderer.ts
export interface CanvasOptions {
  topic: string;
  dataSources?: ("reviews" | "diff" | "log" | "bitbucket")[]; // 默认读 .forge/config.md
}

export interface CanvasResult {
  htmlPath: string;
  dataSourcesUsed: string[];
  bitbucketEnriched: boolean;
  elapsedMs: number;        // 用于校验 R4.9 的 5 秒 SLA
}

/**
 * 生成 HTML 画布 [R4.1]
 * - 必需数据源：reviews/diff/log [R4.2 (1)(2)(3)]
 * - reviews 文件不存在 → 阻断并抛错 [R4.7]
 * - 可选 Bitbucket MCP enrichment [R4.2(4), R4.3]; 超时 10s/15s [R4.11, R14.1–14.2]
 * - 三栏布局 [R4.4]，伪代码卡片 ≥ 150 行阈值 [R4.5]
 * - XSS 安全：JSON island + HTML-escape <>& [R4.8, R13.8]
 */
export async function renderCanvas(opts: CanvasOptions): Promise<CanvasResult>;

// src/bitbucket-mcp-adapter.ts
export interface BitbucketEnrichment {
  prComments: PRComment[];
  reviewerStatus: ReviewerStatus[];
  tasks: PRTask[];
}

/**
 * 从 Bitbucket MCP 拉取 enrichment 数据 [R4.2(4)]
 * - 连接超时 10 秒 [R14.1]
 * - 响应超时 15 秒 [R14.2]
 * - 任一超时或错误 → 返回 null，调用方当作 missing enrichment 处理 [R12.3]
 * - 所有输出经 secret-redactor 处理 [R12.11]
 */
export async function tryFetchEnrichment(topic: string): Promise<BitbucketEnrichment | null>;

/**
 * WHEN 用户点击 "Sync to PR" 按钮且 Bitbucket MCP 可用 [R4.6]
 * 调用 add_comment + create_pr_task 推送 findings
 */
export async function syncFindingsToPR(topic: string, findings: Finding[]): Promise<void>;
```

#### 三栏布局 HTML 片段 [R4.4]

```html
<body>
  <header class="summary">...</header>
  <main class="three-column-layout">
    <section class="layer-1" aria-label="spec-check">
      <h2>Layer 1: Spec Alignment</h2>
      <!-- findings for spec-check -->
    </section>
    <section class="layer-2" aria-label="quality-check">
      <h2>Layer 2: Code Quality</h2>
      <!-- findings for quality-check (含 deslop + UI mismatches 行) -->
    </section>
    <section class="layer-3" aria-label="security-check">
      <h2>Layer 3: Security</h2>
      <!-- findings for security-check -->
    </section>
  </main>

  <!-- R4.8: safe JSON island -->
  <script id="canvas-data" type="application/json">
    {{ JSON.stringify(data) with <>& escaped }}
  </script>
  <script src="renderer.js"></script>
</body>
```

#### 关键设计决策

- **Vendor-neutral**（[R12.3]）：Bitbucket MCP 永远是第 4 级 enrichment，不参与必需数据源；无 MCP / 无网络 / MCP 报错均不阻断画布产出，仅在 HTML footer 加一条 notice [R14.1]。
- **XSS 硬防御**（[R13.8]）：所有 finding text 走 `JSON.stringify` + `<>&` 双重转义；`renderer.js` 用 `DOMParser` 读入 JSON island，避免 innerHTML 注入路径。
- **5 秒 SLA**（[R4.9, R12.1]）：衡量从 SKILL 调用到 HTML 文件写完的 wall-clock 时间；模板 CSS/JS 作为 static asset 内联，不走 fetch。

### 4.5 forge-control-cli [R5]

#### 模块划分

```
skills/forge-control-cli/
├── SKILL.md
├── references/
│   ├── tmux-harness.md
│   ├── cmux-harness.md
│   └── node-pty-fallback.md

src/cli-harness.ts                 # orchestrator
src/harness-cmux.ts                # cmux 适配
src/harness-tmux.ts                # tmux 适配
src/harness-pty.ts                 # Node PTY fallback
src/harness-detector.ts            # 4 级 tier 检测（复用于 CLI & UI）
```

#### 核心签名

```typescript
// src/cli-harness.ts
export type ControllerTier = "project" | "cmux" | "tmux" | "node-pty";

export interface CliHarnessOptions {
  topic: string;
  targetCommand: string;
  inputScript?: string;          // 交互脚本
}

export interface HarnessVerdict {
  verdict: Verdict;
  controllerUsed: ControllerTier | null;
  controllersAttempted: { tier: ControllerTier; reason: string }[];
  artifactsDir: string;
}

/**
 * 按 4 级优先级检测并执行 [R5.2]:
 * 1. 项目自有 harness（test/e2e/*.spec.ts 或 expect/pty 脚本）
 * 2. cmux ($CMUX_WORKSPACE_ID 或 /tmp/cmux.sock)
 * 3. tmux (command -v tmux)
 * 4. Node PTY
 * 每级失败时记录 attempted + reason，传递给下一级 [R5.8]
 * 全部失败 → verdict: INCONCLUSIVE [R5.8]
 * 验证时长 > 5s 且用 cmux 时每 5s 发 progress/log/notify [R5.4]
 */
export async function runCliHarness(opts: CliHarnessOptions): Promise<HarnessVerdict>;

// src/harness-detector.ts (共用于 R5 & R6)
export function detectCmuxAvailable(): Promise<boolean>;  // R14.3/14.4 的 1s 超时
export function detectTmuxAvailable(): boolean;
export function detectProjectHarness(kind: "cli" | "ui"): Promise<string | null>;
```

#### 关键设计决策

- **禁止增加运行时依赖**（[R5.9]）：`tmux` 通过 `node:child_process.spawn`；Node PTY 通过可选 `require()`（若用户项目装了 `node-pty` 则使用，否则回退到普通 `child_process` + pipe）。`package.json` 不新增 `"dependencies"` 或 `"devDependencies"` 条目。
- **cmux 专属能力按用**（[R5.4]）：仅当 `controllerUsed === "cmux"` 时才调用 `set-progress` / `log` / `notify`，其他 tier 不触碰 cmux API。
- **自测覆盖**（[R5.7]）：在 `test/e2e/forge-loop-cli.harness.test.ts` 中用 CLI harness 驱动自己的 `forge-loop-cli.ts`，验证 SIGINT / `--resume` / worktree cleanup 三个场景。

### 4.6 forge-control-ui [R6]

#### 模块划分

```
skills/forge-control-ui/
├── SKILL.md
├── references/
│   ├── cmux-browser.md
│   ├── playwright-adapter.md
│   └── cdp-adapter.md

src/ui-harness.ts                  # orchestrator
src/harness-cmux-browser.ts        # cmux browser CLI 适配
src/harness-playwright.ts          # 使用项目自己的 Playwright
src/harness-cdp.ts                 # 裸 CDP 连接
```

#### 核心签名

```typescript
// src/ui-harness.ts
export type UiControllerTier = "project" | "cmux-browser" | "playwright" | "cdp";

export interface UiHarnessOptions {
  topic: string;
  appUrl: string;                    // 项目 dev server URL
  designerSpecPath?: string;         // .forge/specs/<feature>/spec.md designer section
}

/**
 * 4 级优先级 [R6.2]:
 * 1. 项目自有 (Playwright/Cypress/Storybook 配置文件存在)
 * 2. cmux browser (socket + $CMUX_WORKSPACE_ID)
 * 3. Playwright (devDep 已安装)
 * 4. CDP (用户手动启动 chrome --remote-debugging-port)
 *
 * Forge 自己绝不安装 Playwright / Cypress / Puppeteer [R6.5]
 *
 * 当 designer spec 存在时 [R6.6]:
 *   - 读取 designer 章节 → 生成 UI 断言
 *   - 执行断言
 *   - 不一致写入 .forge/findings/<topic>/ui-harness/mismatches.md
 *   - 后续 quality-check 在 session start 读取此文件 (§4.2)
 */
export async function runUiHarness(opts: UiHarnessOptions): Promise<HarnessVerdict>;
```

#### cmux browser 能力矩阵 [R6.4]

| 能力 | cmux 命令 | 用途 |
|---|---|---|
| 结构化 a11y 快照 | `snapshot --interactive --compact` | baseline/treatment diff 自动判决 |
| 人工审查截图 | `screenshot --out <path>` | baseline/<topic>.png / treatment/<topic>.png |
| 交互后自动快照 | `--snapshot-after` flag | 每次 click/fill 后自动捕获 |
| 会话持久 | `state save` / `state load` | 跳过重复登录流程 |
| JS 错误抓取 | `console list` / `errors list` | 失败时写 console.log / errors.log |
| 自定义等待 | `wait --function <js>` | 等待 `window.__appReady === true` 等 |

### 4.7 forge-fix-conflicts [R7]

#### 模块划分

```
skills/forge-fix-conflicts/
├── SKILL.md
├── references/
│   ├── zone-classification.md
│   ├── guarded-merge-rules.md
│   └── frozen-refusal-flow.md

src/conflict-classifier.ts         # 纯函数，总函数 [R13.1]
src/guarded-merger.ts              # 受保护区语义合并
# 复用现有：
#   src/adr-registry.ts (nextAdrId) [R7.8]
#   src/check-frozen.ts (frozen status 检查)
```

#### 核心签名

```typescript
// src/conflict-classifier.ts
export type Zone = "frozen" | "guarded" | "open" | "source";

/**
 * 总函数 [R13.1]: ∀ path → Zone
 * 确定性 [R13.2]: classify(normalize(p)) = classify(p)
 *   normalize = strip trailing slashes + strip leading "./"
 *
 * 分类规则（按优先级匹配，第一条命中即返回）:
 *   1. frozen: .forge/specs/*\/spec.md (若 status=locked)
 *              .forge/plans/*.md (若 status=approved)
 *              .forge/config.md
 *   2. guarded: .forge/progress/**
 *               .forge/reviews/**
 *               .forge/knowledge/instincts.md
 *               .forge/knowledge/known-failures.md
 *               .forge/knowledge/solutions/**
 *               .forge/decisions/ADR-*.md
 *   3. open: .forge/**（其他）
 *   4. source: 非 .forge/ 路径
 */
export function classify(path: string): Zone;

export function normalizePath(p: string): string;

// src/guarded-merger.ts
export interface GuardedMergeResult {
  resolvedContent: string;
  strategy: string;
  warnings: string[];
}

export function mergeProgressFile(ours: string, theirs: string): GuardedMergeResult;       // R7.6
export function mergeInstinctsOrFailures(ours: string, theirs: string): GuardedMergeResult; // R7.7
export function mergeReviewsFile(ours: string, theirs: string): GuardedMergeResult;         // R7.9
export function reassignAdrId(theirs: string, nextId: number): GuardedMergeResult;          // R7.8

// skills/forge-fix-conflicts/ 调用流程
export interface FixConflictsOptions {
  topic: string;
  interactive: boolean;
}

export interface FixConflictsResult {
  resolved: string[];
  frozenBlocked: string[];
  validationPassed: boolean;
  threeStrikeTriggered: boolean;
}

export async function runFixConflicts(opts: FixConflictsOptions): Promise<FixConflictsResult>;
```

#### Three-Strike 计数逻辑 [R7.12]

```typescript
interface CheckAttempt {
  timestamp: number;
  filesSinceLastAttempt: Set<string>;  // 若为空集，视为"同一次尝试的重跑"
  exitCode: number;
}

function countAsNewAttempt(
  previous: CheckAttempt | null,
  current: CheckAttempt
): boolean {
  if (!previous) return true;
  // 有文件变更 → 新尝试
  return current.filesSinceLastAttempt.size > 0;
}
```

### 4.8 post-push verify [R8]

#### 改动规模上限

[R8.6] 要求 ≤ 50 行逻辑。改动方案：

- `skills/forge-ship/SKILL.md`：在 §4.2 Cleanup 之后加一段 `§4.3 Post-Push Verify`（≈ 20 行）
- `src/ship.ts`：新增 `executePostPushVerify()` 函数（≈ 30 行）
- 不新增 SKILL，不改既有函数的签名

#### 核心签名

```typescript
// src/ship.ts (扩展)
export interface PostPushVerifyResult {
  passed: boolean;
  exitCode: number;
  timedOut: boolean;
  artifactPath?: string;          // 仅失败时非空
}

/**
 * 推送成功后调用 [R8.1]:
 * - 运行 npm run check（或 fallback 到 .forge/config.md 的 ci_check_command）[R14.11]
 * - 600 秒超时 [R8.1]
 * - 失败写 .forge/ship/<topic>-post-push-verify.md [R8.2]
 * - 成功仅输出一行，不创建 artifact [R8.5]
 * - 当有 Bitbucket MCP + PR 刚被创建 → add_comment [R8.3]
 */
export async function executePostPushVerify(
  topic: string,
  prCreated: boolean
): Promise<PostPushVerifyResult>;
```

### 4.9 forge-recap [R9]

#### 模块划分

```
skills/forge-recap/
├── SKILL.md
├── references/
│   ├── data-sources.md
│   └── category-heuristics.md

src/recap.ts
```

#### 核心签名

```typescript
// src/recap.ts
export type RecapCategory = "bugfix" | "tech-debt" | "net-new" | "spec-driven" | "explore" | "uncategorized";

export interface RecapEntry {
  timestamp: string;
  source: "git" | "session" | "forge-loop-run";
  summary: string;
  categories: RecapCategory[];     // 每条至少 1 个
  refs: string[];                  // commit sha, session file, run id
}

export interface RecapReport {
  window: { since: string; until: string };
  entries: RecapEntry[];
  archivalCandidates: string[];    // evolved-rules.md 中超 5 session_boundary 未触发的规则 [R9.4]
  degraded: boolean;               // true 当 git author 缺失 [R9.5]
}

/**
 * [R9.1] 支持 --since 1d / --since 7d / --since <YYYY-MM-DD>..<YYYY-MM-DD>
 * [R9.2] 合并 3 源：git log / sessions/*.md / runs/*/
 * [R9.3] 分类 5 类 (uncategorized 为 R9.3 的 fallback)
 * [R9.4] 扫 evolved-rules.md 过期规则
 * [R9.5] git email 缺失 → 降级 + stderr 警告
 * [R13.6] 同输入同输出（不含 timestamp 字段）
 */
export async function runRecap(window: string): Promise<RecapReport>;
```

### 4.10 forge-learn --from-chats [R10]

#### 模块划分

```
skills/forge-learn/
├── SKILL.md                      # 不动，保持 ≤ 3072 bytes
└── references/
    └── from-chats.md             # 新增 [R10.8]

src/chat-preference-extractor.ts
```

#### 核心签名

```typescript
// src/chat-preference-extractor.ts
export interface PreferenceAtom {
  trigger: string;
  workflow_step: string;
  decision_rule: string;
  quality_bar: string;
  stop_condition: string;
  evidence: string;             // 来自 transcript 的引用
  confidence: "strong" | "medium" | "weak" | "contradicted";
}

export interface FromChatsOptions {
  windowDays?: number;          // 默认 7
  mode: "interactive" | "autonomous";
}

export interface FromChatsResult {
  atoms: PreferenceAtom[];
  promoted: PreferenceAtom[];   // 写入 evolved-rules.md 的子集
  skipped: PreferenceAtom[];
  taskSpecificRejected: PreferenceAtom[];  // [R10.6]
}

/**
 * [R10.1] 扫描 .claude/ 窗口内 transcripts
 * [R10.2] 提取 7 字段 atom
 * [R10.3] 按阈值分 4 级 confidence
 * [R10.4] strong → 写 evolved-rules.md (走既有 15-rule cap)
 * [R10.5] weak/contradicted: interactive → 确认 / autonomous → 丢弃 + 记 skipped.log
 * [R10.6] 拒绝 task-specific（unique file path / PR # / task id）
 * [R13.7] 相同 trigger+decision_rule 的 atom 去重合并
 */
export async function runFromChats(opts: FromChatsOptions): Promise<FromChatsResult>;
```

### 4.11 background subagent [R11]

改动仅落在 3 个 agent 文件的 frontmatter：

```yaml
# .claude/agents/quality-check.md
---
name: quality-check
description: Layer 2 review (code quality + deslop)
model: sonnet                 # [R11.3]
background: true              # [R11.1]
tools: Read, Grep, Glob, Bash
---

# .claude/agents/security-check.md
background: true              # [R11.1]

# .claude/agents/spec-check.md
# 无 background 字段，保持同步 [R11.2]
```

SKILL.md 文档化 [R11.4, R11.5]：在 `skills/forge-review/SKILL.md` 末尾加一段说明：

```markdown
## Background Subagent 注意事项

- `quality-check` 与 `security-check` 以 `background: true` 派发，其权限在派发时预批准，替代 `acceptEdits` 继承 [R11.4]。
- 如需关闭，用户可在 Claude Code UI 中手动 Ctrl+B 背景运行任一子代理（零侵入） [R11.5]。
- 旧版 Claude Code 不识别 `background` 字段时，子代理自动同步运行，输出 schema 完全一致 [R11.7]。
```

---


## 5. Cross-Cutting Concerns

### 5.1 Secret Redaction [R12.11]

**单一入口**：所有可能落盘的日志 / 产物必须经 `src/secret-redactor.ts` 处理。

```typescript
// src/secret-redactor.ts
const PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /Authorization:\s*Bearer\s+[\w\-._~+/]+=*/gi, replacement: "Authorization: Bearer ***" },
  { pattern: /"token"\s*:\s*"[^"]+"/g, replacement: '"token":"***"' },
  { pattern: /BITBUCKET_TOKEN=\S+/g, replacement: "BITBUCKET_TOKEN=***" },
  { pattern: /(x-api-key|x-auth-token):\s*\S+/gi, replacement: "$1: ***" },
];

/**
 * [R12.11] 脱敏任意字符串：
 * - Bearer token → ***
 * - JSON 中的 "token" 字段值 → ***
 * - 环境变量形式的 token → ***
 * - HTTP 自定义鉴权头 → ***
 */
export function redactSecrets(text: string): string;
```

**必须调用方**：
- `src/canvas-renderer.ts`（R4.8 JSON island 前脱敏 Bitbucket API 响应）
- `src/bitbucket-mcp-adapter.ts`（每次 MCP 调用后对返回的字段脱敏）
- `src/ship.ts`（Post-Push Verify artifact 写入前）
- `src/chat-preference-extractor.ts`（transcript 截取前，防止 evidence 字段泄漏）

### 5.2 File Locking / Concurrency [R12.13]

复用 `src/run-manager.ts` 已有的 `acquireFileLock()`。新增 SKILL 在写 `.forge/findings/<topic>/` 前必须取得 `.forge/.locks/<topic>.lock`。

```typescript
// 调用模板（适用于所有新 SKILL）
import { acquireFileLock, releaseFileLock } from "./run-manager.js";

const lockHandle = await acquireFileLock(`.forge/.locks/${topic}.lock`, { timeoutMs: 0 });
if (!lockHandle) {
  throw new CliError(
    `Another <skill-name> run for topic "${topic}" is in progress. ` +
    `Wait for it to finish or remove .forge/.locks/${topic}.lock if it is stale.`
  );
}
try {
  // ...skill logic...
} finally {
  await releaseFileLock(lockHandle);
}
```

**Fail-fast 原则**（[R12.13]）：`timeoutMs: 0` 意味着不阻塞等待；锁已被占用直接抛错，显示占用者（进程号 + PID 文件路径）。

### 5.3 Retention Policy [R12.12]

新增字段：`.forge/config.md` 的 `findings_retention_days`（默认 30）。

```bash
# scripts/prune-event-logs.sh 扩展
RETENTION_DAYS=$(grep '^findings_retention_days:' .forge/config.md | awk '{print $2}' || echo 30)
find .forge/findings -mindepth 1 -maxdepth 2 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} +
```

**非阻塞保证**（[R12.12]）：删除失败不抛错，仅 stderr 打印 warning；活跃 run 不受影响。

### 5.4 不变量与 Property Tests [R13]

| AC | Property | 测试文件 |
|---|---|---|
| R13.1 | classify 总函数性 | `test/conflict-classifier-totality.property.test.ts` |
| R13.2 | classify ∘ normalize = classify | `test/conflict-classifier-normalize.property.test.ts` |
| R13.3 | Verdict 状态穷举 | `test/verify-verdict-totality.property.test.ts` |
| R13.4 | VERIFIED ⇒ baseline+treatment 非空 | `test/verify-artifact-invariant.property.test.ts` |
| R13.5 | rules/*.md frontmatter 解析往返 | `test/rules-loader-roundtrip.property.test.ts` |
| R13.6 | recap 稳定窗内幂等 | `test/recap-idempotent.property.test.ts` |
| R13.7 | PreferenceAtom 同键合并去重 | `test/chat-extractor-dedup.property.test.ts` |
| R13.8 | Canvas HTML 抗 XSS | `test/canvas-xss-safe.property.test.ts` |

**fast-check 参数**：每条 property 至少 200 次迭代（与现有 109 个 property test 保持一致）。

### 5.5 边界条件与降级 [R14]

集中在 §4.4（canvas）、§4.5（cli-harness）、§4.6（ui-harness）、§4.7（fix-conflicts）、§4.10（from-chats）各模块的 core signatures 内。统一规则：

- **超时**：连接 10s，响应 15s [R14.1, R14.2]；`npm run check` 墙钟 600s [R8.1]；cmux 探测 1s [R14.3, R14.4]
- **失败降级方向**：外部可选组件不可用 → 下一级 fallback；链路尽头失败 → `INCONCLUSIVE` verdict 或"no findings"占位
- **非 macOS 平台**：cmux 分支整体跳过，不抛错 [R14.5, R14.6]

### 5.6 i18n [R12.6]

所有新增用户可见字符串（SKILL.md 内的 prompt 描述、错误消息、画布 UI 文案）同时加入：

```
locales/zh.json（新增 key）
locales/en.json（新增同名 key）
```

**Key 命名约定**：`<skill-name>.<section>.<purpose>`，例如：
- `forge_verify.verdict.inconclusive_missing_claim`
- `forge_fix_conflicts.frozen.options.manual_resolve`
- `canvas.footer.bitbucket_skipped`

CI 现有 `test/translation-parity.test.ts` 将自动保证两个 locale 文件 key 一致。

---

## 6. Integration Points with Existing Forge

### 6.1 必须修改的文件

| 文件 | 修改内容 | 关联 AC |
|---|---|---|
| `commands/forge.md` | 注册 `/forge verify`、`/forge recap` 子命令；`forge review` 支持 `--canvas`；`forge test` 支持 `--cli`；`forge learn` 支持 `--from-chats` | R1.11, R9.1, R4.1, R5.1, R10.1 |
| `.claude/agents/quality-check.md` | 追加 deslop 维度；`background: true`；session start 读 `rules/*.md` + `mismatches.md` | R2, R3.6, R6.6, R11.1 |
| `.claude/agents/security-check.md` | 追加 `background: true` | R11.1 |
| `scripts/init.sh` | TypeScript 栈时安装 `rules/` 起始规则 | R3.4 |
| `src/ship.ts` | 追加 `executePostPushVerify()`（≤ 30 行函数体） | R8 |
| `src/agent-registry.ts` 或 `src/skill-loader.ts` | 注册 5 个新 SKILL 名称 | R1–R9 |
| `locales/zh.json` + `locales/en.json` | 新增所有 user-visible 字符串 key | R12.6 |
| `templates/config.md` | 新增 5 个可选字段的说明与默认值 | R7.11, R8, R12.12, R5.1(c), R4.2 |
| `.forge/config.md`（当前项目） | 自我演进：补齐新字段，但保持 optional | R12.8 |
| `scripts/prune-event-logs.sh` | 扩展到 `.forge/findings/` 的保留期剪枝 | R12.12 |

### 6.2 新增文件

| 文件 | 用途 |
|---|---|
| `skills/forge-verify/SKILL.md` + `references/*.md` + `templates/*.tmpl` | R1 |
| `skills/forge-recap/SKILL.md` + `references/*.md` | R9 |
| `skills/forge-control-cli/SKILL.md` + `references/*.md` | R5 |
| `skills/forge-control-ui/SKILL.md` + `references/*.md` | R6 |
| `skills/forge-fix-conflicts/SKILL.md` + `references/*.md` | R7 |
| `skills/forge-learn/references/from-chats.md` | R10.8 |
| `skills/forge-review/references/canvas.md` | R4.10 |
| `rules/typescript-exhaustive-switch.md` | R3.3 |
| `rules/no-inline-imports.md` | R3.3 |
| `rules/no-any-cast.md` | R3.3 |
| `src/verify.ts`, `src/verdict-parser.ts`, `src/baseline-resolver.ts` | R1 |
| `src/canvas-renderer.ts`, `src/bitbucket-mcp-adapter.ts` | R4 |
| `src/cli-harness.ts`, `src/harness-cmux.ts`, `src/harness-tmux.ts`, `src/harness-pty.ts`, `src/harness-detector.ts` | R5 |
| `src/ui-harness.ts`, `src/harness-cmux-browser.ts`, `src/harness-playwright.ts`, `src/harness-cdp.ts` | R6 |
| `src/conflict-classifier.ts`, `src/guarded-merger.ts` | R7 |
| `src/recap.ts` | R9 |
| `src/chat-preference-extractor.ts` | R10 |
| `src/secret-redactor.ts` | R12.11 |
| `src/rules-loader.ts` | R3 |
| `templates/canvas/base.html.tmpl`, `styles.css`, `renderer.js` | R4.10 |

### 6.3 必须**不**修改的文件（向后兼容保证）

| 文件 | 不改的理由 |
|---|---|
| `hooks/hooks.json` | PreToolUse frozen-zone 保护保持原样，新增 SKILL 均不写 Frozen_Zone [R12.9] |
| `scripts/check-frozen.sh` / `src/check-frozen.ts` | 同上 |
| 既有 12 个 SKILL.md（除 forge-ship 小幅扩展、forge-review 新增 flag、forge-test 新增 flag、forge-learn 新增 flag）| 外部契约不变 |
| 既有 agent `.claude/agents/product.md` / `architect.md` / `security.md` / `designer.md` / `critic.md` / `explore.md` / `debugger.md` / `spec-check.md` | 非本特性涉及 |
| 既有 `src/` 中除 `ship.ts`、`agent-registry.ts`、`skill-loader.ts` 外的 95 个模块 | 向后兼容 |
| `package.json` 的 dependencies / devDependencies | 不新增任何运行时依赖 [R5.9, R6.5] |
| 现有 3526 个测试 | 不修改任何 assertion |

---

## 7. Sequence Diagrams

### 7.1 `/forge verify <topic>` 正常路径（VERIFIED）

```ascii
User                  forge.md       verify.ts    baseline-resolver   harness/cmd    verdict-parser
 │                      │               │               │                 │               │
 │ /forge verify perf   │               │               │                 │               │
 ├─────────────────────▶│               │               │                 │               │
 │                      │ dispatch      │               │                 │               │
 │                      ├──────────────▶│               │                 │               │
 │                      │               │ acquireLock   │                 │               │
 │                      │               ├──────────────▶│                 │               │
 │                      │               │ resolve base  │                 │               │
 │                      │               ├──────────────▶│                 │               │
 │                      │               │◀─── sha abc1  │                 │               │
 │                      │               │ write claim.md│                 │               │
 │                      │               │ run bench on baseline            │               │
 │                      │               ├──────────────────────────────────▶│              │
 │                      │               │◀─── baseline/bench.json          │              │
 │                      │               │ run bench on treatment           │               │
 │                      │               ├──────────────────────────────────▶│              │
 │                      │               │◀─── treatment/bench.json         │              │
 │                      │               │ compute diff                     │               │
 │                      │               │ build EvidenceChain              │               │
 │                      │               │ write verdict.md (VERIFIED)      │               │
 │                      │               │ releaseLock                      │               │
 │◀─── verdict printed──┤               │                                  │               │
```

### 7.2 `/forge verify` INCONCLUSIVE 路径（baseline 解析失败）

```ascii
User          verify.ts       baseline-resolver
 │               │                   │
 │ /forge verify │                   │
 ├──────────────▶│ try (1) explicit  │
 │               ├──────────────────▶│ --baseline 未传
 │               │ try (2) merge-base│
 │               ├──────────────────▶│ origin 不存在
 │               │ try (3) HEAD^     │
 │               ├──────────────────▶│ 仓库为 shallow clone，HEAD 无父
 │               │ try (4) snapshot  │
 │               ├──────────────────▶│ topic 首次运行，无 treatment 快照
 │               │◀── null           │
 │               │ verdict=INCONCLUSIVE
 │               │ write verdict.md with inconclusive_reason="no baseline reference"
 │◀── warn msg   │
```

### 7.3 `/forge review --canvas <topic>` + Bitbucket enrichment

```ascii
User          canvas-renderer     bitbucket-mcp-adapter     secret-redactor
 │                │                       │                       │
 │ --canvas ui    │                       │                       │
 ├───────────────▶│                       │                       │
 │                │ read reviews/ui.md    │                       │
 │                │ read git diff         │                       │
 │                │ read git log          │                       │
 │                │ tryFetchEnrichment    │                       │
 │                ├──────────────────────▶│ connect MCP (≤10s)    │
 │                │                       │ fetch PR comments,    │
 │                │                       │   tasks (≤15s)        │
 │                │                       │ redact responses      │
 │                │                       ├──────────────────────▶│
 │                │                       │◀── clean JSON         │
 │                │◀── BitbucketEnrichment│                       │
 │                │ build three-column    │                       │
 │                │ inject JSON island    │                       │
 │                │ (escape <>&)          │                       │
 │                │ write canvas.html     │                       │
 │◀── HTML path───┤                       │                       │
```

### 7.4 `/forge review --canvas` Bitbucket MCP 不可用

```ascii
User          canvas-renderer     bitbucket-mcp-adapter
 │                │                       │
 │ --canvas ui    │                       │
 ├───────────────▶│                       │
 │                │ read local 3 sources ✓                         │
 │                │ tryFetchEnrichment    │
 │                ├──────────────────────▶│ socket 不存在 or 10s 超时
 │                │◀── null               │
 │                │ append canvas-errors.log [R14.2]
 │                │ inject footer notice: "remote enrichment skipped"
 │                │ write canvas.html (三栏 + 本地数据)
 │◀── HTML path───┤
```

### 7.5 forge-fix-conflicts 三区流程

```ascii
User         fix-conflicts     classifier       guarded-merger     ci-check
 │               │                   │                │                │
 │ git merge X   │                   │                │                │
 │ (冲突)        │                   │                │                │
 │               │ git diff --diff-filter=U           │                │
 │               │ for each path:    │                │                │
 │               │   classify(path)  │                │                │
 │               │◀── "frozen"       │                │                │
 │◀── 3 options  │                   │                │                │
 │ "unlock then merge"
 ├──────────────▶│                   │                │                │
 │               │ set status=draft + log unlock-ts   │                │
 │               │ 三路合并          │                │                │
 │               │                   │                │                │
 │               │   classify(path)  │                │                │
 │               │◀── "guarded"      │                │                │
 │               │ mergeProgressFile │                │                │
 │               ├──────────────────────────────────▶│                │
 │               │◀── merged content │                │                │
 │               │                   │                │                │
 │               │   classify(path)  │                │                │
 │               │◀── "source"       │                │                │
 │               │ git merge 三路    │                │                │
 │               │                   │                │                │
 │               │ npm run check     │                │                │
 │               ├────────────────────────────────────────────────────▶│
 │               │                   │                │                │ exit 0
 │               │◀── passed         │                │                │
 │◀── git add ready                  │                │                │
```

### 7.6 `/forge test --cli` harness tier 检测

```ascii
User         cli-harness    harness-detector   cmux    tmux    node-pty
 │               │                │             │       │         │
 │ --cli         │                │             │       │         │
 ├──────────────▶│                │             │       │         │
 │               │ tier 1: project harness?     │       │         │
 │               ├───────────────▶│ glob test/e2e/*.spec.ts → 0 files
 │               │◀── null        │             │       │         │
 │               │ tier 2: cmux?  │             │       │         │
 │               ├───────────────▶│ ls /tmp/cmux.sock → exists
 │               │◀── true        │             │       │         │
 │               │ use cmux       │             │       │         │
 │               ├───────────────────────────────▶│     │         │
 │               │                │             │ send text
 │               │ every 5s: set-progress+log+notify
 │               │                │             │       │         │
 │               │◀── verdict.md  │             │       │         │
 │◀── HarnessVerdict              │             │       │         │
```

### 7.7 quality-check session start（rules + mismatches）

```ascii
quality-check    rules-loader    ui-harness output    review flow
      │               │                  │                  │
 session start        │                  │                  │
      │               │                  │                  │
      │ loadAllRules()│                  │                  │
      ├──────────────▶│                  │                  │
      │               │ glob rules/*.md  │                  │
      │◀── AtomicRule[]                  │                  │
      │ parse rules with alwaysApply=true│                  │
      │                                  │                  │
      │ read .forge/findings/<topic>/ui-harness/mismatches.md
      ├─────────────────────────────────▶│                  │
      │◀── Markdown rows (Severity/File/Issue/Suggestion)
      │                                                     │
      │ run 6 existing dimensions                           │
      │ run deslop (dim 7)                                  │
      │ merge: 原始 findings + rules 违规 + mismatches 行   │
      │                                                     │
      │ output Layer 2 Markdown table                       │
      ├────────────────────────────────────────────────────▶│
```

---


## 8. Testing Strategy

### 8.1 Property-based tests（新增 8 个文件）

全部采用 fast-check，默认 200 次迭代，保持与现有 109 个 property test 一致的风格。

| 测试文件 | 目标模块 | 属性 |
|---|---|---|
| `test/conflict-classifier-totality.property.test.ts` | `src/conflict-classifier.ts` | [R13.1] 总函数性；输入任意 UTF-8 路径 → 返回 4 枚举之一 |
| `test/conflict-classifier-normalize.property.test.ts` | 同上 | [R13.2] `classify(normalize(p)) = classify(p)` |
| `test/verify-verdict-totality.property.test.ts` | `src/verdict-parser.ts` | [R13.3] 任意输入产生 3 态之一（损坏输入 → INCONCLUSIVE）|
| `test/verify-artifact-invariant.property.test.ts` | `src/verify.ts` | [R13.4] VERIFIED ⇒ baseline 和 treatment 目录非空 |
| `test/rules-loader-roundtrip.property.test.ts` | `src/rules-loader.ts` | [R13.5] frontmatter 解析 → 序列化 → 再解析 一致 |
| `test/recap-idempotent.property.test.ts` | `src/recap.ts` | [R13.6] 同窗口同输入 → 同输出（排除 decided_at 字段） |
| `test/chat-extractor-dedup.property.test.ts` | `src/chat-preference-extractor.ts` | [R13.7] 同 trigger+decision_rule → 单一 candidate |
| `test/canvas-xss-safe.property.test.ts` | `src/canvas-renderer.ts` | [R13.8] 任意 finding text（含 `<script>` 片段）→ HTML 中无活动 script 元素 |

### 8.2 Integration tests（新增 ≈ 10 个文件）

| 测试文件 | 覆盖 AC |
|---|---|
| `test/canvas-renderer.integration.test.ts` | R4.1–R4.4, R4.7 |
| `test/canvas-bitbucket-degradation.test.ts` | R4.3, R4.11, R14.1, R14.2 |
| `test/canvas-empty-reviews.test.ts` | R14.5, R14.7 |
| `test/cli-harness-tier-selection.test.ts` | R5.2, R5.6, R5.8 |
| `test/ui-harness-tier-selection.test.ts` | R6.2, R6.5, R6.8 |
| `test/fix-conflicts-frozen-refuse.test.ts` | R7.3, R7.4, R7.5, R14.8 |
| `test/fix-conflicts-guarded-merge.test.ts` | R7.6–R7.9 |
| `test/fix-conflicts-three-strike.test.ts` | R7.11, R7.12 |
| `test/verify-baseline-resolver.test.ts` | R1.10 |
| `test/ship-post-push-verify.test.ts` | R8.1, R8.2, R8.5, R14.11, R14.12 |
| `test/recap-window-parsing.test.ts` | R9.1, R9.5 |
| `test/from-chats-confidence.test.ts` | R10.3, R10.4, R10.5, R10.6 |
| `test/secret-redactor.test.ts` | R12.11 |
| `test/rules-loader-starter-set.test.ts` | R3.3, R3.4 |

### 8.3 E2E tests（新增 2 个文件）

| 测试文件 | 覆盖 |
|---|---|
| `test/e2e/forge-loop-cli.harness.test.ts` | [R5.7] 用 CLI harness 驱动自己的 `forge-loop-cli.ts`，验证 SIGINT、`--resume`、worktree cleanup |
| `test/e2e/canvas-full-flow.test.ts` | 端到端生成 canvas HTML，用 Playwright（项目 devDep 已有）验证 DOM 结构与 XSS 安全 |

### 8.4 测试计数目标

```
current:    3526 tests (212 files, 109 property files, 89.35% stmt coverage)
add:        ≈ 8 property + 14 integration + 2 e2e ≈ 24 new files, ≈ 500 new assertions
target:     ≈ 4000 tests, 236 files, 117 property files
coverage:   ≥ 89% statement coverage maintained (new modules must pass CI coverage gate)
```

### 8.5 CI 接入

新增测试自动被 `npm run check` 捕获（= `tsc --noEmit && biome check && vitest run && scripts/check-readme-metrics.sh`）。不需要修改 CI 配置，但需要更新 README.md 的测试统计（`<!--exact: 测试数、文件数、属性测试数-->` 注解需同步）。

---

## 9. Rollout Plan

### Sprint 1（≈ 3 个工作日，高 ROI 低成本）

| Task cluster | Requirements | 产出 |
|---|---|---|
| 1.1 `forge-verify` SKILL + `src/verify.ts` + `baseline-resolver.ts` + `verdict-parser.ts` | R1 | 新 SKILL + 3 模块 + 属性测试 4 条 |
| 1.2 `quality-check` 追加 deslop 维度 | R2 | agent 文件 patch |
| 1.3 `rules/` 目录 + 3 条起始规则 + `rules-loader.ts` + `init.sh` 扩展 | R3 | 新目录 + 3 md + 1 loader |
| 1.4 `commands/forge.md` 注册 `/forge verify` | R1.11 | router 扩展 |

### Sprint 2（≈ 2 个工作日）

| Task cluster | Requirements | 产出 |
|---|---|---|
| 2.1 `forge-review --canvas` flag + `canvas-renderer.ts` + `bitbucket-mcp-adapter.ts` | R4 | 扩展 SKILL + 2 模块 |
| 2.2 `src/secret-redactor.ts` + 全局接入 | R12.11 | 1 模块 + 4 处调用点 |
| 2.3 HTML 模板（CSS + JS + base.html.tmpl），含 Cursor 归属说明 | R4.10 | `templates/canvas/*` |

### Sprint 3（≈ 3 个工作日）

| Task cluster | Requirements | 产出 |
|---|---|---|
| 3.1 `forge-control-cli` SKILL + `cli-harness.ts` + 4 tier 适配器 | R5 | 1 SKILL + 5 模块 |
| 3.2 `forge-control-ui` SKILL + `ui-harness.ts` + 4 tier 适配器 | R6 | 1 SKILL + 4 模块 |
| 3.3 `forge-test --cli` flag + designer spec → mismatches 链路 | R5.1, R6.6 | `forge-test` SKILL 扩展 |
| 3.4 `forge-loop-cli` 自 e2e test | R5.7 | 1 e2e test |

### Sprint 4（≈ 2 个工作日）

| Task cluster | Requirements | 产出 |
|---|---|---|
| 4.1 `src/conflict-classifier.ts`（含 property test 80 fixture）| R7.1, R13.1, R13.2 | 1 模块 + 2 property test |
| 4.2 `src/guarded-merger.ts`（progress / instincts / known-failures / reviews / ADR 合并策略）| R7.6–R7.9 | 1 模块 |
| 4.3 `forge-fix-conflicts` SKILL（含 frozen 三选项 + validation gate + Three-Strike）| R7.3–R7.5, R7.11, R7.12 | 1 SKILL |

### Sprint 5（≈ 2 个工作日）

| Task cluster | Requirements | 产出 |
|---|---|---|
| 5.1 `src/ship.ts` Post_Push_Verify（≤ 50 行）| R8 | ship.ts 扩展 |
| 5.2 `forge-recap` SKILL + `src/recap.ts` | R9 | 1 SKILL + 1 模块 |
| 5.3 `forge-learn --from-chats` + `src/chat-preference-extractor.ts` | R10 | forge-learn SKILL 扩展 + 1 模块 |
| 5.4 `background: true` 实验（quality-check + security-check） | R11 | 2 agent patch + forge-review SKILL 文档段 |
| 5.5 `.forge/config.md` 新增可选字段 + `templates/config.md` 同步 | R12.8 | 2 文件 patch |
| 5.6 i18n key 补全 + translation-parity 测试 | R12.6 | 2 locale 文件 patch |
| 5.7 `scripts/prune-event-logs.sh` 扩展到 findings | R12.12 | 1 脚本 patch |
| 5.8 README.md 测试计数更新 | — | README.md patch |

**总计**：12 个工作日（≈ 2.5 周）。

---

## 10. Risk Register

| # | 风险 | 影响 | 概率 | 缓解 |
|---|---|---|---|---|
| 1 | **Claude Code `background: true` 字段在不同版本间行为不一致** | Medium：Sprint 5 R11 可能需要改写 | Medium | [R11.7] 已定义降级路径——未识别字段自动转同步；CI 在最低支持版本跑 smoke test；SKILL 文档说明 Ctrl+B 手动 fallback [R11.5] |
| 2 | **cmux socket 权限在多用户主机暴露** | High：`/tmp/cmux.sock` 若为 world-readable 可能被其他用户 send-text | Low | cmux 原生 `allowAll` / `cmuxOnly` 模式管理；Forge 不改变 socket 权限；文档明确警告团队环境下不要改为 `allowAll` |
| 3 | **Bitbucket MCP token 泄漏到 canvas HTML** | High：HTML 可能被下载分享 | Low | [R12.11] 强制 `secret-redactor` 经过；`test/secret-redactor.test.ts` 覆盖 Bearer/JSON/env 三种泄漏形态；`bitbucket-mcp-adapter` 所有返回路径调 redactor |
| 4 | **SKILL_Document 3 KB 预算超出** | Medium：需要再次拆分 references | Medium | CI 新增 `scripts/validate-skill-length.mjs` 已有；新 SKILL 模板强制 SKILL.md 为"路由文档"，细节进 references；Sprint 1 验证后再做其他 SKILL |
| 5 | **Three_Zone_Model 被新 SKILL 绕过** | High：安全纪律失效 | Low | [R12.9] 明确不改 PreToolUse hook；新 SKILL 所有写路径在 `.forge/findings/**`、`.forge/ship/**`、`.forge/debug/**`（均 Open_Zone）；`fix-conflicts` 的"unlock then merge"路径要求显式用户选项并留日志 [R7.4] |

---

## 11. Backward Compatibility

### 11.1 已有 13 个 SKILL 保证

| SKILL | 是否受影响？ | 契约变化？ |
|---|---|---|
| forge-router | 否 | 无 |
| forge-decide | 否 | 无 |
| forge-spec | 否 | 无 |
| forge-plan | 否 | 无 |
| forge-build | 否 | 无 |
| forge-review | 是（新 `--canvas` flag） | **外部契约不变**；`.forge/reviews/<topic>.md` 仍按原逻辑产出；canvas 是"额外产物"而非替代 |
| forge-test | 是（新 `--cli` flag） | 契约不变；`--cli` 为显式触发 CLI harness 的用户选项 |
| forge-ship | 是（+≤ 50 行 post-push verify）| 契约不变；失败会打印额外输出但门禁行为不变 |
| forge-learn | 是（新 `--from-chats` flag）| 契约不变 |
| forge-status | 否 | 无 |
| forge-resume | 否 | 无 |
| forge-debug | 是（Phase 4 后追加 forge-verify 调用）| **契约 += 最后一步证据化验证**；原 Phase 4 输出不变 |
| forge-abort | 否 | 无 |

### 11.2 已有 10 个 Agent 保证

| Agent | 是否受影响？ | 契约变化？ |
|---|---|---|
| product | 否 | — |
| architect | 否 | — |
| security | 否 | — |
| designer | 否（但 UI harness 会消费其 spec 产出） | — |
| critic | 否 | — |
| explore | 否 | — |
| debugger | 否 | — |
| spec-check | 否 | 保持同步 [R11.2] |
| quality-check | 是（+deslop 维度、+读 rules 和 mismatches、+`background: true`）| **外部契约不变**（Markdown 列与 severity 规则原样保留） |
| security-check | 是（+`background: true`）| 外部契约不变 |

### 11.3 CI 行为保证

- `npm run check` 命令不变
- `scripts/build-dist.sh` 自动捕获新 SKILL；**但需要验证**：新 SKILL 的 references 与 templates 都被复制进分发包（Sprint 5 任务 5.8 验证）
- `.forge/config.md` 无新增必填字段，已有项目无需 edit [R12.8]

### 11.4 用户升级路径

```bash
# 用户从旧版 Forge 升级
git pull
npm install  # 不新增依赖
npx tsc

# 用户无需做任何 config 迁移；新功能自动 opt-in:
/forge verify <topic>              # 新命令，自动加载 forge-verify SKILL
/forge review --canvas <topic>     # 新 flag，不影响无 flag 时的行为
```

---

## 12. Decision Log

### D1. 为什么 forge-verify 是新 SKILL 而不是扩展 forge-test？

**选择**：新 SKILL。

**理由**：
- `forge-test` 面向"Forge 开发流水线的测试阶段"（标准路径第 4 步），其输出是 7 项完成前清单。
- `forge-verify` 面向"任一声明的证据化判决"，可能在 bugfix 流程自动触发 [R1.7]，也可能在 debug Phase 4 嵌入 [R1.8]，两者触发场景和输出语义不同。
- 合并会污染 forge-test 的 SKILL.md，违反 [R12.2] 3 KB 预算。

**备选**：扩展 forge-test → 拒绝（语义混淆 + 预算超支）。

### D2. 为什么 deslop 是 quality-check 的维度而不是独立 SKILL？

**选择**：维度扩展，不新增 SKILL。

**理由**：
- Deslop 的输出 schema（Severity/File/Issue/Suggestion）与 quality-check 完全一致 [R2.4]。
- 独立 SKILL 会让 review 阶段派发 4 个 Subagent（spec-check + quality-check + security-check + deslop），额外增加 1/3 并发预算。
- [R12.10] 明确 +5 SKILL 上限已全部分配给 forge-verify、forge-recap、forge-control-cli、forge-control-ui、forge-fix-conflicts。

**备选**：独立 `forge-deslop` SKILL → 拒绝（超 SKILL 预算 + 输出 schema 重复 + 并发成本）。

### D3. 为什么 `rules/` 不在 Frozen_Zone？

**选择**：非 Frozen_Zone，用户可自由编辑 [R3.8]。

**理由**：
- Frozen_Zone 的语义是"锁定 / 批准后 AI 不可修改"，针对的是 spec / plan / config 这类"一次定稿多次使用"的契约文件。
- `rules/*.md` 是项目级别的、**鼓励团队迭代**的原子规则（类似 biome.json / eslint config）。
- 用户修改自己项目的规则本是正常需求，不应触发 PreToolUse hook 的硬阻断。
- 静态 vs 动态的互补层（`rules/` vs `evolved-rules.md`）已保证二者不冲突 [R3.5]。

**备选**：放入 Frozen_Zone → 拒绝（违反规则本身的演化需求）。

### D4. 为什么 conflict-classifier 是纯函数模块而不是 class？

**选择**：纯函数模块（`export function classify(path: string): Zone`）。

**理由**：
- 分类逻辑没有状态，输入路径 → 输出 Zone 是确定性映射。
- 纯函数能直接接 fast-check 写 property test（[R13.1, R13.2]），class 需要额外 factory 语法。
- Forge 既有风格偏向纯函数模块（见 `src/frontmatter.ts`、`src/state.ts`）。

**备选**：class 封装（便于后续 DI） → 拒绝（当前无需 DI；过度工程）。

### D5. 为什么 canvas 通过 JSON island + HTML escape 嵌入数据？

**选择**：`<script type="application/json">` JSON island，`<>&` 双重转义 [R4.8]。

**理由**：
- 最小 XSS 攻击面：`<script type="application/json">` 不执行，只被 `DOMParser` 读取。
- `<>&` 转义防御 Cursor 文档提到的 `</script>` 注入（即使 JSON.stringify 也不够安全）。
- 服务端渲染（返回 HTML 字符串拼接）会在 find text 含 `<img onerror=...>` 时放大风险。

**备选**：
- 内联 `<script>var data = {...};</script>` → 拒绝（JSON.stringify 不防 `</script>`）
- 服务端完整渲染（无 JS）→ 拒绝（失去伪代码折叠、Sync to PR 按钮等交互）

### D6. 为什么 harness tier 优先级是「项目 → cmux → tmux/Playwright → PTY/CDP」？

**选择**：按"尊重项目现有选择 + 最零侵入 + 最强可观测性"递减。

**理由**：
- Tier 1 项目自有 harness 最优先：最贴合项目风格，已有 CI/开发者熟悉度。
- Tier 2 cmux：零安装（用户已有 cmux 终端），最强可观测性（sidebar progress/log/notify），零项目依赖。
- Tier 3 tmux / Playwright：通用但需项目装过或系统装过。
- Tier 4 Node PTY / CDP：最后兜底，最裸，可观测性最低。

**备选**：`cmux > project` → 拒绝（违反"尊重项目现有选择"原则，项目 harness 通常带业务上下文）。

### D7. 为什么 Bitbucket MCP 永远是 optional？

**选择**：严格 optional，默认路径不依赖 MCP [R12.3, R14.1, R14.2]。

**理由**：
- Forge 的核心价值主张是"不依赖第三方服务"（见 README.md）；强依赖 MCP 会破坏这个承诺。
- Canvas 的主要产物（`.forge/reviews/<topic>.md` 转 HTML）完全可以用本地数据构建。
- Bitbucket MCP 的增值是"PR 评论/reviewer 状态/tasks"——这些信息在团队外部评审者读 HTML 画布时没有它也能完成核心任务（阅读 diff + findings）。
- 团队可能切换 Git 平台（GitHub/GitLab/自建），或 MCP 服务不可达。强依赖会被这些环境切换击穿。

**备选**：MCP 必选 → 拒绝（违反 vendor-neutral 原则）。

---

## 结束

设计 v1 完成。关键数字：

- **文档规模**：约 1200 行 Markdown，≈ 40 KB
- **新 SKILL 数**：5（forge-verify / forge-recap / forge-control-cli / forge-control-ui / forge-fix-conflicts）
- **新 TS 模块数**：≈ 18（src/ 下）
- **新测试文件数**：≈ 24（8 property + 14 integration + 2 e2e）
- **改动已有文件数**：11（agents ×2、skills ×4、scripts ×2、locales ×2、templates ×1）
- **不改动文件数**：13 个既有 SKILL 中的 9 个、10 个 agent 中的 8 个、95 个 src 模块中的 92 个、hooks/hooks.json、package.json
- **Sprint 数**：5 个（总 ≈ 12 工作日）
- **序列图数**：7 个（ASCII 格式，覆盖所有关键交互路径）

下一步：产出 `tasks.md`。
