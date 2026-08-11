---
status: locked
feature: workflows-integration
layout: design
created: 2026-05-25
---

# Technical Design — workflows-integration

## Overview

本设计文档描述如何将 Claude Code 原生 Workflows 能力集成到 Forge 框架，并将 `forge-loop` 驱动层从 `@anthropic-ai/claude-agent-sdk` 切换为 `claude --print --output-format stream-json` 子进程。

设计分为两个工作包：
- **工作包 A**：分发层与 fallback 集成（R1–R4）
- **工作包 B**：forge-loop 驱动层换芯（R5–R10）
- **跨工作包**：受保护区兼容、并发上限兼容、市场分发回归（R11–R13）

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Claude Code Runtime (binary)                      │
│  ┌─────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ Workflow     │  │ stream-json      │  │ Tool Runtime          │  │
│  │ Runtime     │  │ Protocol         │  │ (Read/Write/Bash/...) │  │
│  │ (bp/phase/  │  │ (stdout NDJSON)  │  │                       │  │
│  │  parallel)  │  │                  │  │                       │  │
│  └──────┬──────┘  └────────┬─────────┘  └───────────────────────┘  │
│         │                   │                                        │
└─────────┼───────────────────┼────────────────────────────────────────┘
          │                   │
          │ L0 path           │ forge-loop path
          │                   │
┌─────────┼───────────────────┼────────────────────────────────────────┐
│         │    Forge Framework │                                        │
│  ┌──────▼──────┐     ┌──────▼──────────────┐                        │
│  │ Workflow     │     │ CLI Subprocess      │                        │
│  │ Dispatcher  │     │ Driver              │                        │
│  │ (L0/L1/L2/ │     │ (spawn claude       │                        │
│  │  L3 ladder) │     │  --print ...)       │                        │
│  └──────┬──────┘     └──────┬──────────────┘                        │
│         │                   │                                        │
│  ┌──────▼───────────────────▼──────────────┐                        │
│  │         Stream JSON Adapter              │                        │
│  │  (event mapping / partial merge / usage) │                        │
│  └──────────────────┬──────────────────────┘                        │
│                     │                                                │
│  ┌──────────────────▼──────────────────────┐                        │
│  │     Orchestrator State Machine           │                        │
│  │  (transition / effects / limits check)   │                        │
│  └──────────────────┬──────────────────────┘                        │
│                     │                                                │
│  ┌──────────────────▼──────────────────────┐                        │
│  │     Effect Executor + Audit Writer       │                        │
│  │  (git / frozen-zone / .forge/ writes)    │                        │
│  └─────────────────────────────────────────┘                        │
│                                                                      │
│  ┌─────────────────────────────────────────┐                        │
│  │     IPC Emitter (stdout NDJSON)          │                        │
│  │  → Desktop App / CI consumers            │                        │
│  └─────────────────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

| 模块 | 文件路径 | 职责 | 覆盖 Requirement |
|------|----------|------|------------------|
| **WorkflowDispatcher** | `src/workflow-dispatcher.ts` (新建) | L0/L1 路径选择、并发探测、dispatch.jsonl 写入、status.md 更新 | R2, R3, R11, R12 |
| **WorkflowAuditWriter** | `src/workflow-audit-writer.ts` (新建) | 双写产物到 `.forge/` 审计区、frozen-zone 校验、mkdir-p | R4, R11 |
| **ConcurrencyBridge** | `workflows/lib/concurrency.js` (新建) | `chunkedParallel` wrapper、env 读取、429 降级 | R12 |
| **CliSubprocessDriver** | `src/cli-subprocess-driver.ts` (新建) | spawn claude 子进程、stdin NDJSON 写入、信号转发、背压检测 | R5, R9, R10 |
| **StreamJsonAdapter** | `src/stream-json-adapter.ts` (新建) | 行缓冲解析、事件分类、partial merge、usage 累加、error 路由 | R6 |
| **IpcEmitter** | `src/ipc-emitter.ts` (新建) | 版本握手帧、事件格式化、forward-compat 保证 | R8 |
| **SdkDriver** (改造) | `src/sdk-driver.ts` | 替换 `agentAdapter.run()` 为 `CliSubprocessDriver.iterate()` | R5 |
| **forge-loop-cli** (改造) | `src/forge-loop-cli.ts` | 移除 `startup()` 调用、改用 warm-up spawn、新增 `--no-warmup` | R7, R9 |
| **plugin.json** (改造) | `.claude-plugin/plugin.json` | 新增 `"workflows"` 字段 | R1 |
| **Workflow files** (迁移) | `workflows/multi-agent-review.js` | 从 `.claude/workflows/` 迁移到插件根 | R1 |
| **Fallback ladder rule** | `.claude/rules/workflow-fallback-ladder.md` (新建) | L0–L3 规则文档 | R3 |
| **Plugin manifest tests** | `test/plugin-manifest.test.ts` (扩展) | workflows 字段契约测试 | R13 |
| **IPC baseline** | `apps/forge-loop-desktop/test/fixtures/ipc-baseline.ndjson` (新建) | record-replay baseline | R8 |

## Data Models

### DispatchRecord Schema (dispatch.jsonl)

每条 dispatch.jsonl 记录的 JSON Schema：

```json
{
  "type": "object",
  "required": ["subcommand","mode","run_id","session_id","workflow_state_id","gate_enabled","workflow_available","chosen_level","exit_code","duration_ms","timestamp","frozen_zone_blocked"],
  "properties": {
    "subcommand": { "type": "string", "enum": ["review","decide","learn"] },
    "mode": { "type": "string", "enum": ["interactive","loop"] },
    "run_id": { "type": "string" },
    "session_id": { "type": "string" },
    "workflow_state_id": { "type": "string", "pattern": "^wsid_" },
    "workflow_version": { "type": "string" },
    "gate_enabled": { "type": "boolean" },
    "workflow_available": { "type": "boolean" },
    "chosen_level": { "type": "string", "enum": ["L0","L1","L2","L3"] },
    "l1_trigger_reason": { "type": "string" },
    "l0_failure_signature": { "type": "string" },
    "exit_code": { "type": "integer" },
    "duration_ms": { "type": "integer" },
    "timestamp": { "type": "string", "format": "date-time" },
    "frozen_zone_blocked": { "type": "boolean" }
  }
}
```

### IPC Frame Schema (stdout NDJSON)

```json
{
  "type": "object",
  "required": ["event","run_id","schema","ts"],
  "properties": {
    "event": { "type": "string" },
    "run_id": { "type": "string" },
    "schema": { "type": "integer", "minimum": 1 },
    "ts": { "type": "string", "format": "date-time" }
  },
  "additionalProperties": true
}
```

### TokenUsage (累加模型)

```typescript
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}
```

`cost_usd` 优先使用 stream-json 事件中的 `cost_usd` 字段；缺失时按 token 类型分别累加，`cache_read_input_tokens` 不与 `input_tokens` 合并。

---

## 工作包 A：分发层与 fallback 集成

### 3.1 插件打包路径迁移 (R1)

**变更清单**：
1. `mv .claude/workflows/multi-agent-review.js → workflows/multi-agent-review.js`
2. 在 `plugin.json` 顶层加 `"workflows": ["./workflows"]`
3. 在 `workflows/lib/concurrency.js` 放置并发 wrapper（R12 需要）
4. 删除 `.claude/workflows/multi-agent-review.js`（或留 redirect 注释）
5. `test/plugin-manifest.test.ts` 新增 4 条 workflows 字段用例

**目录结构**：
```
Forge/                          (plugin root)
├── .claude-plugin/
│   ├── plugin.json             ← 新增 "workflows" 字段
│   └── marketplace.json
├── workflows/                  ← 新目录（插件级）
│   ├── multi-agent-review.js
│   ├── forge-decide.js         (后续 sprint)
│   ├── forge-learn.js          (后续 sprint)
│   └── lib/
│       └── concurrency.js      ← chunkedParallel helper
├── .claude/
│   ├── rules/
│   │   └── workflow-fallback-ladder.md  ← 新建
│   └── workflows/              ← 删除或留 redirect
└── src/
    ├── workflow-dispatcher.ts   ← 新建
    ├── workflow-audit-writer.ts ← 新建
    └── ...
```

### 3.2 Workflow Dispatcher 状态机 (R2)

```typescript
// src/workflow-dispatcher.ts — 核心接口

export interface DispatchContext {
  subcommand: 'review' | 'decide' | 'learn';
  runId: string;
  sessionId: string;
  mode: 'interactive' | 'loop';
  forgeRoot: string;        // .forge/ 目录绝对路径
  pluginRoot: string;       // ${CLAUDE_PLUGIN_ROOT}
}

export interface DispatchRecord {
  subcommand: string;
  mode: 'interactive' | 'loop';
  run_id: string;
  session_id: string;
  workflow_state_id: string;
  workflow_version: string;
  gate_enabled: boolean;
  workflow_available: boolean;
  chosen_level: 'L0' | 'L1' | 'L2' | 'L3';
  l1_trigger_reason?: string;
  l0_failure_signature?: string;
  exit_code: number;
  duration_ms: number;
  timestamp: string;        // ISO-8601
  frozen_zone_blocked: boolean;
}

export type L1TriggerReason =
  | 'gate_disabled'
  | 'env_unset'
  | 'non_interactive'
  | 'workflow_missing'
  | 'workflow_syntax_error'
  | 'concurrency_uncontrolled'
  | 'unmatched_state';

export type L0FailureSignature =
  | 'bp_exception'
  | 'schema_validation_failed'
  | 'subprocess_crash'
  | 'stuck_timeout'
  | 'frozen_zone_blocked';
```

**状态机决策流程**：

```
dispatch(ctx) →
  ┌─ probeL0Eligibility(ctx) ─────────────────────────────────┐
  │  1. process.env.CLAUDE_CODE_WORKFLOWS === '1'?            │
  │  2. ctx.mode === 'interactive'?                           │
  │  3. workflowFile exists && node --check passes?           │
  │  4. concurrencyProbe passes (3-step)?                     │
  │  5. tengu_workflows_enabled gate? (inferred from bp()     │
  │     availability at runtime — if bp() throws              │
  │     ReferenceError, gate is off)                          │
  └───────────────────────────────────────────────────────────┘
       │ all true              │ any false
       ▼                       ▼
  tryL0(ctx)              chooseL1(ctx, reason)
       │                       │
       │ success               │
       ▼                       ▼
  writeAudit()            runFallbackLadder(ctx)
  writeDispatch(L0)            │
  advancePhase()               │ L1/L2/L3
       │                       ▼
       │                  writeAudit()
       │                  writeDispatch(L1|L2|L3)
       │                  advancePhase() or blockShip()
       ▼
  return result
```

**L0 失败降级路径**：
```
tryL0(ctx) →
  try {
    result = await bp(workflowPath)  // Claude Code runtime 执行
  } catch (err) {
    signature = classifyError(err)   // → L0FailureSignature
    isolatePartialFindings(ctx)      // → .forge/runs/<runId>/l0-partial/
    return chooseL1(ctx, 'l0_runtime_failure', signature)
  }
```

### 3.3 并发桥接 (R12)

```javascript
// workflows/lib/concurrency.js

const MAX_PARALLEL = parseInt(
  process.env.FORGE_MAX_PARALLEL_AGENTS_RUNTIME
  || process.env.FORGE_MAX_PARALLEL_AGENTS
  || '6', 10
);

/**
 * 分批并行执行 — 替代 workflow runtime 内置 parallel()。
 * @param {Array<() => Promise<T>>} fns  待执行的异步函数数组
 * @param {object} opts
 * @param {number} opts.maxConcurrency  并发上限（默认从 env 读取）
 * @returns {Promise<T[]>}
 */
export async function chunkedParallel(fns, opts = {}) {
  const cap = opts.maxConcurrency ?? MAX_PARALLEL;
  const results = [];
  for (let i = 0; i < fns.length; i += cap) {
    const chunk = fns.slice(i, i + cap);
    const batch = await parallel(chunk.map(fn => () => fn()));
    results.push(...batch);
  }
  return results;
}
```

**三步并发可控性探测**（在 `WorkflowDispatcher.probeL0Eligibility` 中执行）：
1. `process.env.CLAUDE_CODE_WORKFLOWS === '1'`
2. `existsSync(path.join(pluginRoot, 'workflows/lib/concurrency.js'))` && `execSync('node --check ...')`
3. `readFileSync(workflowPath).includes("from './lib/concurrency'")`

**429 降级链路**：
- Dispatcher 在 stream-json 输出层 post-hoc 观察 `tool_result`/`result` 事件
- 检测 `status_code=429` 或 `subtype=rate_limit`
- 第 1 次：`FORGE_MAX_PARALLEL_AGENTS_RUNTIME = Math.floor(current / 2)`
- 第 2 次：`= 2`
- 第 3 次：`= 1`（串行）
- 注入到下一个子进程 env；本次 `/forge` 子命令结束后清零

### 3.4 审计双写 (R4)

```typescript
// src/workflow-audit-writer.ts — 核心接口

export interface AuditWriteTarget {
  subcommand: 'review' | 'decide' | 'learn';
  runId: string;
  topic: string;
  payload: Record<string, unknown>;  // workflow return value
}

export class WorkflowAuditWriter {
  constructor(
    private forgeRoot: string,
    private frozenZoneChecker: (path: string) => boolean,
  ) {}

  async write(target: AuditWriteTarget): Promise<void> {
    const destPath = this.resolveDestPath(target);

    // Step 1: frozen-zone pre-check
    if (this.frozenZoneChecker(destPath)) {
      throw new FrozenZoneViolation([destPath]);
    }

    // Step 2: mkdir -p
    await fs.mkdir(path.dirname(destPath), { recursive: true });

    // Step 3: append-only write
    const existing = await safeRead(destPath);
    const newContent = existing + formatPayload(target);
    await fs.writeFile(destPath, newContent);
  }

  private resolveDestPath(target: AuditWriteTarget): string {
    switch (target.subcommand) {
      case 'review':
        return path.join(this.forgeRoot, 'reviews', `${target.topic}.md`);
      case 'decide':
        return path.join(this.forgeRoot, 'decisions',
          `${isoDate()}-${slugify(target.topic)}.md`);
      case 'learn':
        return path.join(this.forgeRoot, 'knowledge/sessions',
          `${target.runId}.md`);
    }
  }
}
```

### 3.5 Fallback Ladder 规则文件 (R3)

文件位置：`.claude/rules/workflow-fallback-ladder.md`

```markdown
---
inclusion: always
---

# Workflow Fallback Ladder

Cross-reference: ADR 2026-05-18-review-fallback-ladder.md

| Level | 触发条件 | methodology 字段值 | 阻断 ship |
|-------|---------|-------------------|-----------|
| L0 | 交互模式 + CLAUDE_CODE_WORKFLOWS=1 + gate 开 + workflow 可加载 + 并发可控 | workflow | 否 |
| L1 | L0 任一条件不满足 OR L0 运行时失败 | subagent-parallel / workflow-then-subagent | 否 |
| L2 | L1 subagent teams 不可用 → 串行单 agent | subagent-serial | 否 |
| L3 | 所有级别不可用 | unavailable | **是** |

<HARD-GATE name="l3-no-main-agent-substitute">
L3 禁止主 agent 顶替评审/决策。
</HARD-GATE>
```

## 工作包 B：forge-loop 驱动层换芯

### 4.1 CLI Subprocess Driver (R5)

```typescript
// src/cli-subprocess-driver.ts — 核心类

import { spawn, type ChildProcess } from 'node:child_process';
import { StreamJsonAdapter } from './stream-json-adapter.js';
import type { AgentInterface, AgentResult, AgentRunOptions } from './loop-types.js';

export interface CliDriverConfig {
  cwd: string;
  runId: string;
  runDir: string;
  permissionMode: string;
  dangerouslySkipPermissions: boolean;
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpConfig?: string;
  additionalDirs?: string[];
  systemPromptFile?: string;
  maxTurns: number;
  resumeSessionId?: string;
  sessionId?: string;
  noWarmup?: boolean;
}

export class CliSubprocessDriver implements AgentInterface {
  readonly name = 'claude-cli';
  private config: CliDriverConfig;
  private child: ChildProcess | null = null;
  private adapter: StreamJsonAdapter;

  constructor(config: CliDriverConfig) {
    this.config = config;
    this.adapter = new StreamJsonAdapter(config.runDir);
  }

  /** 构建 claude CLI 参数数组 */
  private buildArgs(prompt?: string): string[] {
    const args = [
      '--print',
      '--output-format=stream-json',
      '--include-partial-messages',
      '--input-format=stream-json',
      `--permission-mode=${this.config.permissionMode}`,
      `--max-turns=${this.config.maxTurns}`,
    ];
    if (this.config.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }
    if (this.config.allowedTools?.length) {
      args.push(`--allowed-tools=${this.config.allowedTools.join(',')}`);
    }
    if (this.config.disallowedTools?.length) {
      args.push(`--disallowed-tools=${this.config.disallowedTools.join(',')}`);
    }
    if (this.config.mcpConfig) {
      args.push(`--mcp-config=${this.config.mcpConfig}`);
    }
    for (const dir of this.config.additionalDirs ?? []) {
      args.push(`--add-dir=${dir}`);
    }
    if (this.config.systemPromptFile) {
      args.push(`--system-prompt-file=${this.config.systemPromptFile}`);
    }
    if (this.config.resumeSessionId) {
      args.push(`--resume=${this.config.resumeSessionId}`);
    } else if (this.config.sessionId) {
      args.push(`--session-id=${this.config.sessionId}`);
    }
    return args;
  }

  /** 构建 env 对象 */
  private buildEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      CLAUDE_CODE_WORKFLOWS: process.env.CLAUDE_CODE_WORKFLOWS ?? '1',
      FORGE_MAX_PARALLEL_AGENTS: String(/* from config */ 6),
      FORGE_REVIEW_CONCURRENCY: String(/* from config */ 3),
    };
  }

  /** 执行单次迭代 */
  async run(prompt: string, cwd: string, options?: AgentRunOptions): Promise<AgentResult> {
    const args = this.buildArgs(prompt);
    const env = this.buildEnv();

    this.child = spawn('claude', args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // stdin: write NDJSON frame then close
    this.child.stdin!.write(
      JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } }) + '\n'
    );
    this.child.stdin!.end();

    // stdout: pipe through StreamJsonAdapter
    const result = await this.adapter.consume(this.child.stdout!, options);

    // stderr: capture to file
    this.captureStderr(this.child.stderr!);

    // Wait for exit
    const exitCode = await this.waitForExit();

    this.child = null;
    return { ...result, exitCode };
  }

  /** 信号转发链 (R5.8) */
  async shutdown(signal: NodeJS.Signals): Promise<void> {
    if (!this.child) return;
    this.child.kill('SIGINT');
    await delay(10_000);
    if (!this.child?.killed) this.child?.kill('SIGTERM');
    await delay(5_000);
    if (!this.child?.killed) this.child?.kill('SIGKILL');
  }
}
```

### 4.2 Stream JSON Adapter (R6)

```typescript
// src/stream-json-adapter.ts — 核心接口

import type { Readable } from 'node:stream';
import type { AgentResult, TokenUsage } from './loop-types.js';

/** stream-json 事件类型分类 */
type ExposedType = 'system' | 'assistant' | 'user' | 'tool_use' | 'tool_result' | 'result';
type HiddenType = 'message_start' | 'message_delta' | 'message_stop'
  | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'ping';
type SpecialType = 'error';

export interface AdapterConfig {
  runDir: string;           // .forge/runs/<runId>/
  maxLineBytes: number;     // 默认 64 MiB
  highWaterMark: number;    // 默认 16 MiB
  lowWaterMark: number;     // 默认 4 MiB
}

export class StreamJsonAdapter {
  private partialBuffer: Map<string, object[]> = new Map();  // message.id → partial events
  private deliveredIds: Set<string> = new Set();             // dedup
  private usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  private costUsd = 0;
  private lastEventType: string | null = null;

  /** 消费 stdout 流，返回最终 AgentResult */
  async consume(stdout: Readable, options?: AgentRunOptions): Promise<AgentResult> {
    // readline-style 行缓冲
    // 每行 JSON.parse → classify → route
    // partial events → buffer until message_stop → merge → deliver
    // error events → throw IterationFailedError
    // unknown types → passthrough + log to unknown-events.jsonl
    // EOF without result → synthesize stream-truncated
  }
}
```

**事件路由表**：

| 事件 type | 处理 | 下发给消费端 |
|-----------|------|-------------|
| system | 映射为 `init` message | ✅ |
| assistant | 映射为 assistant message | ✅ |
| user | 映射为 user message | ✅ |
| tool_use | 映射为 tool_use block | ✅ |
| tool_result | 映射为 tool_result block + 429 检测 | ✅ |
| result | 提取 usage/cost → 标记迭代完成 | ✅ |
| message_start/delta/stop | partial merge 内部使用 | ❌ |
| content_block_* | partial merge 内部使用 | ❌ |
| ping | 忽略 | ❌ |
| error | 抛 IterationFailedError | ❌（走 R10 重试） |
| 未知 type | 透传 + log unknown-events.jsonl | ✅ |

### 4.3 IPC Emitter (R8)

```typescript
// src/ipc-emitter.ts

export interface IpcFrame {
  event: string;
  run_id: string;
  schema: number;       // 单调递增版本号
  ts: string;           // ISO-8601
  [key: string]: unknown;
}

export const IPC_SCHEMA_VERSION = 1;

export const SUPPORTED_EVENTS = [
  'forge_loop_run_started', 'iteration_start', 'iteration_end',
  'progress', 'message', 'tool_use', 'tool_result',
  'completion', 'run_completed', 'error', 'warning', 'version',
] as const;

export class IpcEmitter {
  constructor(private runId: string) {}

  /** 启动时发送版本握手帧 */
  emitVersion(): void {
    this.emit({
      event: 'version',
      schema: IPC_SCHEMA_VERSION,
      supported_events: [...SUPPORTED_EVENTS],
    });
  }

  /** 通用发送 — 截断到 1024 字节 */
  emit(frame: Partial<IpcFrame> & { event: string }): void {
    const full: IpcFrame = {
      run_id: this.runId,
      schema: IPC_SCHEMA_VERSION,
      ts: new Date().toISOString(),
      ...frame,
    };
    const line = JSON.stringify(full);
    process.stdout.write(line.slice(0, 1024) + '\n');
  }
}
```

### 4.4 Warm-up 替代 (R9)

```typescript
// 在 forge-loop-cli.ts main() 中

if (!opts.noWarmup) {
  const warmupArgs = [
    '--print', '--output-format=stream-json', '--max-turns=1',
    '--permission-mode=bypassPermissions', '--dangerously-skip-permissions',
  ];
  const warmup = spawn('claude', warmupArgs, { cwd, env: buildEnv(), stdio: ['pipe','pipe','pipe'] });
  warmup.stdin!.write(JSON.stringify({ type: 'user', message: { role: 'user', content: '_' } }) + '\n');
  warmup.stdin!.end();

  const exitCode = await waitForExit(warmup, 30_000);
  if (exitCode !== 0) {
    process.stderr.write(`Warm-up failed (exit ${exitCode})\n`);
    process.exit(1);
  }
  // Record warm-up stats (not counted toward --max-tokens)
  writeFileSync(path.join(runDir, 'warm-up.json'), JSON.stringify({ exitCode, durationMs }));
}
```

### 4.5 错误处理与降级 (R10)

**退出码分类**：

| 退出码 | 含义 | 行为 |
|--------|------|------|
| 0 | 正常完成 | 标记 success，继续主循环 |
| 1 | 一般错误 | 指数退避重试 ≤ 3 次 |
| 2 | 用法错误 | 指数退避重试 ≤ 3 次 |
| 137 | SIGKILL (OOM) | 指数退避重试 ≤ 3 次 |
| 143 | SIGTERM | 指数退避重试 ≤ 3 次 |
| 其他 | SIGSEGV / 未知 | 立即中止，不重试 |

**超时检测**：
- `stuckTimeoutMs` = 600,000ms（10 分钟无 stdout 事件）
- 触发后：SIGTERM → 30s → SIGKILL
- 写入 `signal_chain.jsonl`

**退避公式**：
```
delay = DEFAULT_BACKOFF_BASE_MS * 2^(attempt - 1)
     = 60_000 * 2^0 = 60s (第 1 次)
     = 60_000 * 2^1 = 120s (第 2 次)
     = 60_000 * 2^2 = 240s (第 3 次)
```

## Correctness Properties

### Property 1: 状态机无黑洞

**Validates: Requirements 2.1, 2.2, 2.9**

对于 (mode × gate × workflow_available × runtime_failure × concurrency × frozen_zone) 的任意状态向量组合，WorkflowDispatcher 必须命中 L0 或 L1 路径之一，不存在无主路径的状态。不命中 L0 条件且不命中 L1 显式触发条件的状态全部走 `l1_trigger_reason: unmatched_state` 兜底。

### Property 2: 审计追加不变量

**Validates: Requirements 4.5, 11.2**

对于 `.forge/reviews/`、`.forge/knowledge/sessions/` 中的任何文件，WorkflowAuditWriter 写入后旧内容的字符级 prefix 不变：`assert(new_content.startsWith(old_content))`。

### Property 3: 并发度上限

**Validates: Requirements 12.1, 12.2**

在任意时刻，通过 `chunkedParallel` 调度的并行 agent 数量 ≤ `min(items.length, FORGE_MAX_PARALLEL_AGENTS_RUNTIME ?? FORGE_MAX_PARALLEL_AGENTS)`。review 子命令内进一步 ≤ `FORGE_REVIEW_CONCURRENCY`。

### Property 4: Session_Boundary 隔离

**Validates: Requirements 12.4**

跨 `/forge` 子命令调用产生的 `workflow_state_id` 互不相同；workflow 子进程间不通过 env / 文件 / runtime 全局变量共享状态。

### Property 5: stream-json 事件顺序保持

**Validates: Requirements 5.3, 6.1**

StreamJsonAdapter 向消费端下发的业务事件顺序与子进程 stdout 输出顺序严格一致（FIFO）。

### Property 6: IPC forward-compat

**Validates: Requirements 8.5, 8.6**

旧版 desktop 收到新版 forge-loop 输出的 IPC 帧时，对未知字段忽略、对未知 event 降级为 warning，不 crash 不 panic。

### 5.1 与 §config 受保护区的兼容性 (R11)

**写入路径分类**：

| 目标路径 | Zone | 允许操作 | 违规处理 |
|----------|------|---------|---------|
| `.forge/reviews/*.md` | Guarded | append-only | 覆盖 → FrozenZoneViolation |
| `.forge/decisions/<date>-*.md` | Open | create new file | — |
| `.forge/knowledge/sessions/*.md` | Open | create new file | — |
| `.forge/specs/*/spec.md` (locked) | Frozen | **禁止** | FrozenZoneViolation |
| `.forge/plans/*.md` (approved) | Frozen | **禁止** | FrozenZoneViolation |
| `.forge/config.md` | Frozen | **禁止** | FrozenZoneViolation |
| `.forge/runs/<runId>/*` | Open | free write | — |
| `.forge/knowledge/tool-health.md` | Open | append-only | — |

**校验链路**：
```
WorkflowAuditWriter.write(target)
  → frozenZoneChecker(destPath)        // 路径匹配
  → hook-check-frozen.sh (PreToolUse)  // 现有 hook 兜底
  → 写入 or 抛 FrozenZoneViolation
```

### 5.2 与 §6 并发上限的兼容性 (R12)

**环境变量传递链**：
```
forge-loop-cli.ts
  → 读 .forge/config.md: max_parallel_agents=6, review.subagent_concurrency=3
  → spawn claude 子进程 env:
      FORGE_MAX_PARALLEL_AGENTS=6
      FORGE_REVIEW_CONCURRENCY=3
      FORGE_MAX_PARALLEL_AGENTS_RUNTIME=<动态降级值 or 空>
  → workflow runtime 加载 workflows/multi-agent-review.js
      → import { chunkedParallel } from './lib/concurrency.js'
      → chunkedParallel 读 env 决定 cap
```

### 5.3 Session_Boundary 隔离 (R12.4)

每次 `/forge <子命令>` 调用生成唯一 `workflow_state_id = wsid_<runId>_<subcommand>_<utc-ms>`。

**隔离保证**：
- workflow 文件内禁止 `Date.now()` / `Math.random()`（runtime 约束，支持 resume）
- 跨子命令不共享 env 中的 `FORGE_MAX_PARALLEL_AGENTS_RUNTIME`（每次清零）
- dispatch.jsonl 中相邻两条记录的 `workflow_state_id` 必须不同

## Data Flow

### 6.1 交互模式 `/forge review` 数据流

```
用户输入 "/forge review"
  → forge.md command dispatcher
  → Skill(forge-review)
  → WorkflowDispatcher.dispatch({ subcommand: 'review', mode: 'interactive' })
  → probeL0Eligibility() → all true
  → bp('workflows/multi-agent-review.js')
    → phase('Scan') → agent(scan-diff)
    → phase('Review') → chunkedParallel([spec, quality, security, arch], { maxConcurrency: 3 })
    → phase('Verify') → pipeline(findings, verifyEach)
    → phase('Synthesize') → agent(synthesis)
    → return { summary, stats, findings, ship_ready, recommendation }
  → WorkflowAuditWriter.write({ subcommand: 'review', payload: result })
    → append to .forge/reviews/<topic>.md
  → writeDispatchRecord(L0)
  → updateStatusMd({ dispatch_chosen_level: 'L0', ... })
  → advancePhase() → 自动进入下一阶段
```

### 6.2 forge-loop 自主模式数据流

```
forge-loop --objective "..." --max-iterations 10
  → warm-up spawn (claude --print --max-turns 1)
  → main loop iteration N:
    → CliSubprocessDriver.run(prompt, cwd)
      → spawn('claude', [...args], { env })
      → stdin.write(NDJSON frame) + stdin.end()
      → StreamJsonAdapter.consume(stdout)
        → 逐行 JSON.parse
        → partial merge → deliver complete messages
        → usage accumulate
        → result event → return AgentResult
      → stderr → .forge/runs/<runId>/stderr.log
    → orchestrator.transition(event)
    → effectExecutor.execute(effects)
    → IpcEmitter.emit({ event: 'iteration_end', ... })
    → check limits (maxIterations / maxTokens / stopWhen)
  → IpcEmitter.emit({ event: 'run_completed', ... })
  → cleanup (PID / worktree / sleep-prevent)
```

## Migration Strategy

### 7.1 SdkDriver 改造路径

现有 `SdkDriver` 通过 `this.agentAdapter.run(prompt, cwd, options)` 调用 `SdkAgentAdapter`。

**改造方案**：保持 `SdkDriver` 的 orchestrator 循环不变，仅替换 `agentAdapter` 实现：

```typescript
// 改造前
const agentAdapter = agentRegistry.resolve('claude', { cwd, budgetUsd });
// 改造后
const agentAdapter = new CliSubprocessDriver(cliConfig);
```

`CliSubprocessDriver` 实现同一个 `AgentInterface`：
```typescript
interface AgentInterface {
  readonly name: string;
  run(prompt: string, cwd: string, options?: AgentRunOptions): Promise<AgentResult>;
}
```

这样 `SdkDriver`、`EffectExecutor`、`orchestrator` 状态机、`RunManager` 全部不动。

### 7.2 agent-sdk 移除范围

| 文件 | 当前 import | 改造后 |
|------|------------|--------|
| `forge-loop-cli.ts` | `import { startup } from '@anthropic-ai/claude-agent-sdk'` | 删除，改用 warm-up spawn |
| `sdk-agent-adapter.ts` | `import { query, ... } from '@anthropic-ai/claude-agent-sdk'` | 整个文件标记 deprecated，不再被 runtime 引用 |
| `agent-registry.ts` | `import type { WarmQuery } from '@anthropic-ai/claude-agent-sdk'` | 保留 `import type` |
| `sandbox-profile.ts` | `import type { SandboxSettings } from '@anthropic-ai/claude-agent-sdk'` | 保留 `import type` |
| `frozen-zone-hook.ts` | `import type { ... } from '@anthropic-ai/claude-agent-sdk'` | 保留 `import type` |

### 7.3 Desktop App IPC 兼容

**record-replay 测试流程**：
1. 换芯前：跑固定 objective，录制 stdout NDJSON → `ipc-baseline.ndjson`
2. 换芯后：跑同 objective，逐帧比对
3. 比对规则：事件类型集合 ⊇ baseline；已有字段名+类型完全匹配；允许新增字段/事件

## Testing Strategy

| 层级 | 覆盖范围 | 工具 |
|------|---------|------|
| unit-test | WorkflowDispatcher 状态机、StreamJsonAdapter 事件路由、IpcEmitter 帧格式、ConcurrencyBridge 分批逻辑 | vitest |
| property-based-test | dispatch.jsonl schema 完整性（1000 次随机状态向量）、stream-json 事件映射正确性、并发度上限 | fast-check |
| integration-test | 端到端 `/forge review` L0 路径、forge-loop 单次迭代、desktop IPC record-replay | vitest + spawn |
| regression-test | plugin-manifest 契约（≥13 条）、`--help` snapshot、IPC baseline diff | vitest snapshot |
| static-check | agent-sdk runtime import 检查、dispatcher 无确认提示词、workflow 文件含 concurrency import | rg / grep scripts |

## Error Handling

| 风险 | 缓解机制 | 对应 Requirement |
|------|---------|-----------------|
| workflow runtime 不可用 | L0→L1 自动降级 + dispatch.jsonl 审计 | R2.2 |
| bp() 运行时异常 | try-catch + partial 隔离 + L1 重跑 | R2.4, R2.8 |
| 子进程死锁 | 600s stuck timeout + SIGTERM/SIGKILL 链 | R10.1 |
| 子进程 OOM | 退出码 137 → 指数退避 ≤ 3 次 | R10.2 |
| stdout 背压 | 4 MiB / 5s 检测 → 60s 持续 → kill + retry | R5.9 |
| 429 rate limit | 并发减半阶梯 + tool-health.md 记录 | R12.5 |
| frozen-zone 误写 | 双重校验（路径匹配 + hook-check-frozen.sh） | R4.7, R11.4 |
| 插件升级破坏 hooks | cross-version 回归测试 + CI 阻断 | R13.5 |
| desktop IPC 不兼容 | record-replay baseline + schema diff 工具 | R8.2, R8.8 |

## Implementation Sequence

```
Phase 1 (Week 1): 工作包 A 前置改造
  T1: 插件打包迁移 (R1) — 移文件 + plugin.json + 测试
  T2: concurrency.js helper (R12.1) — 写 wrapper + 改 multi-agent-review.js
  T3: fallback ladder 规则文件 (R3) — 写 .claude/rules/ 文件
  T4: WorkflowDispatcher 骨架 (R2) — 状态机 + dispatch.jsonl

Phase 2 (Week 2): 工作包 B 核心换芯
  T5: StreamJsonAdapter (R6) — 行缓冲 + 事件路由 + partial merge
  T6: CliSubprocessDriver (R5) — spawn + stdin/stdout/stderr + 信号链
  T7: IpcEmitter (R8) — 版本握手 + 事件格式化
  T8: SdkDriver 改造 — 替换 agentAdapter 为 CliSubprocessDriver

Phase 3 (Week 3): 集成与回归
  T9: WorkflowAuditWriter (R4) — 双写 + frozen-zone 校验
  T10: warm-up 替代 (R9) — spawn --max-turns 1
  T11: 错误处理 (R10) — 超时/退避/cleanup
  T12: Desktop IPC 回归 (R8.8) — record baseline + replay test
  T13: 市场分发回归 (R13) — plugin-validate CI job 扩展
```
