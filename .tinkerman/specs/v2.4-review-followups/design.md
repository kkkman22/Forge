---
feature: v2.4-review-followups
layout: design
created: 2026-05-07
---

# 设计文档：v2.4 技术评审后续

## Overview

本设计将 8 个需求按依赖关系拆为 3 个 phase，共 ~3-4 周工作量。整体原则：

1. **零新运行时依赖**：不引入新 npm 包（保持 5 个 runtime 依赖）
2. **渐进迁移**：所有 breaking 变更先发 warning 过渡版（v2.3.1），主切换在 v2.4.0
3. **纯函数优先**：新增核心逻辑全部走 pure function + 属性测试
4. **失败显式化**：所有原先 silent 的失败路径改为显式 error 或 CI 失败

### Phase 规划

| Phase | 需求 | 预期工作量 | 依赖 |
|-------|------|-----------|------|
| Phase 1 | 需求 1（Hook 阻断）、需求 6（Console 迁移）、需求 7（execFileSync）| ~1 周 | 无 |
| Phase 2 | 需求 2（E2E）、需求 3（API 收敛）、需求 8（Plan 注入） | ~1.5 周 | Phase 1 的 console 链 |
| Phase 3 | 需求 4（覆盖率）、需求 5（SKILL 映射） | ~0.5 周 | 前两个 Phase 完成（含测试） |

---

## Architecture

### 改动总览

```
┌─────────────────────────────────────────────────────────────────┐
│                   v2.4 Review Follow-ups Layer                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Hook Enforce │  │ E2E Suite    │  │ API Surface  │          │
│  │ (需求 1)     │  │ (需求 2)     │  │ (需求 3)     │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         v                 v                 v                   │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │ Coverage Gate│  │ SKILL Map    │                            │
│  │ (需求 4)     │  │ (需求 5)     │                            │
│  └──────────────┘  └──────────────┘                            │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Console→Log  │  │ execFileSync │  │ Plan Inject  │          │
│  │ (需求 6)     │  │ (需求 7)     │  │ (需求 8)     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│              Existing Forge Core (unchanged)                    │
│   orchestrator.ts | sdk-driver.ts | effect-executor.ts | ...   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components and Interfaces

### 需求 1 — Hook 阻断强化

#### 改动点

```
src/sdk-driver.ts                     修改 run() 启动路径
src/sdk-hooks-validation.ts           保持现有纯函数不变
src/forge-loop-cli.ts                 新增 --force-no-hooks flag
src/forge-error.ts                    新增 HooksProtectionMissingError
hooks/hooks.json                      check-frozen 命令加 trap
test/sdk-driver.hooks-enforcement.property.test.ts   新增
```

#### 关键代码路径

```typescript
// src/sdk-driver.ts 修改片段
async run(): Promise<SdkDriverResult> {
  // 门禁前置（优先于任何 agent 调用）
  const hooksResult = validateHooksPresence(this.config.cwd);
  if (!hooksResult.valid) {
    if (!this.config.forceNoHooks) {
      throw new HooksProtectionMissingError(
        hooksResult.reason ?? "unknown",
        this.config.cwd,
      );
    }
    // opt-in 路径：显式写 flag 文件 + 结构化警告
    this.logger.log(createLogEntry(
      "hooks_protection_bypassed",
      "warn",
      this.t("driver.warning.hooksBypassedExplicit", { reason: hooksResult.reason }),
      { runId: this.config.runId },
    ));
    await this.writeForceNoHooksFlag();
  }
  // ... 后续不变
}
```

```typescript
// src/forge-error.ts 新增
export class HooksProtectionMissingError extends ForgeError {
  readonly code = "HOOKS_PROTECTION_MISSING" as const;
  constructor(reason: string, cwd: string) {
    super(
      "HOOKS_PROTECTION_MISSING",
      `Hooks protection is missing (${reason}). Either run scripts/init.sh to restore hooks, ` +
      `or pass --force-no-hooks to explicitly bypass. cwd: ${cwd}`,
    );
  }
}
```

#### Hook 命令 exit 2 trap

```bash
# hooks/hooks.json 中 check-frozen 命令改写为 wrapper 脚本
# scripts/hook-check-frozen.sh
#!/bin/sh
set -e
FILE="$1"

# Node 缺失
if ! command -v node >/dev/null 2>&1; then
  echo "[forge-hook] FATAL: node not in PATH" >&2
  exit 2
fi

# dist 缺失
for candidate in "forge/dist/src/check-frozen.js" "$HOME/.claude/skills/forge/dist/src/check-frozen.js"; do
  if [ -f "$candidate" ]; then
    exec node "$candidate" "$FILE"
  fi
done

echo "[forge-hook] FATAL: check-frozen.js not found in any known location" >&2
exit 2
```

#### 属性测试（伪代码）

```typescript
// test/sdk-driver.hooks-enforcement.property.test.ts
describe("SdkDriver hooks enforcement", () => {
  it.prop([arbSdkDriverConfigWithoutHooks()])("rejects start when hooks missing and not forced", async (config) => {
    const driver = new SdkDriver({ ...config, forceNoHooks: false });
    await expect(driver.run()).rejects.toThrow(HooksProtectionMissingError);
    // 确保 agent 从未被调用
    expect(mockAgent.invocationCount).toBe(0);
  });
});
```

---

### 需求 2 — E2E 测试套件

#### 目录结构

```
test/e2e/
├── helpers/
│   ├── temp-repo.ts            创建临时 git 仓库
│   ├── mock-agent.ts           可编程 Agent mock
│   └── snapshot.ts             git log / status 断言工具
├── e2e-success-path.test.ts
├── e2e-soft-failure.test.ts
├── e2e-hard-failure.test.ts
├── e2e-worktree.test.ts
└── e2e-resume.test.ts
```

#### 核心 Helper

```typescript
// test/e2e/helpers/temp-repo.ts
export async function createTempRepo(seed?: string): Promise<{ cwd: string; cleanup: () => Promise<void> }> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "forge-e2e-"));
  await execFile("git", ["init"], { cwd });
  await execFile("git", ["config", "user.email", "e2e@forge.test"], { cwd });
  await execFile("git", ["config", "user.name", "E2E"], { cwd });
  if (seed) await fs.writeFile(path.join(cwd, "README.md"), seed);
  await execFile("git", ["add", "."], { cwd });
  await execFile("git", ["commit", "-m", "initial"], { cwd });
  // 初始化 .forge / hooks
  await copyForgeSkeleton(cwd);
  return { cwd, cleanup: () => fs.rm(cwd, { recursive: true, force: true }) };
}
```

```typescript
// test/e2e/helpers/mock-agent.ts
export interface ScriptedResponse {
  kind: "success" | "failure" | "stop" | "abort";
  summary?: string;
  tokenUsage?: { inputTokens: number; outputTokens: number };
  errorMessage?: string;
}

export class ScriptedAgent implements AgentInterface {
  private callCount = 0;
  constructor(private script: ScriptedResponse[]) {}

  async invoke(_ctx: AgentInvocationContext): Promise<AgentInvocationResult> {
    const response = this.script[this.callCount++] ?? this.script.at(-1)!;
    // 翻译为 AgentInvocationResult
    switch (response.kind) {
      case "success": return { kind: "success", summary: response.summary ?? "ok", tokenUsage: response.tokenUsage };
      case "failure": return { kind: "failure", errorMessage: response.errorMessage ?? "mock failure", tokenUsage: response.tokenUsage };
      case "stop": return { kind: "stop", reason: "target_reached" };
      case "abort": return { kind: "abort", reason: "fatal" };
    }
  }

  get invocationCount() { return this.callCount; }
}
```

#### 成功路径样例

```typescript
// test/e2e/e2e-success-path.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTempRepo } from "./helpers/temp-repo.js";
import { ScriptedAgent } from "./helpers/mock-agent.js";
import { assertGitLog } from "./helpers/snapshot.js";

describe("e2e success path", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => { await cleanup?.(); });

  it("completes happy path → commit → exit 0", async () => {
    const { cwd, cleanup: c } = await createTempRepo("# test");
    cleanup = c;

    const agent = new ScriptedAgent([{ kind: "success", summary: "done" }]);
    const driver = buildDriverForTest({ cwd, agent, runId: "e2e-success" });

    const result = await driver.run();

    expect(result.exitCode).toBe(0);
    await assertGitLog(cwd, [/forge\(loop\).*done/, /initial/]);
  }, 60_000);
});
```

#### CI job 设计

```yaml
# .github/workflows/ci.yml 新增
e2e:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-node@v6
      with:
        node-version: 22
        cache: npm
    - run: npm ci
    - run: npm run test:e2e
    - name: Upload temp dirs on failure
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: e2e-temp-dirs
        path: /tmp/forge-e2e-*
```

---

### 需求 3 — API 面收敛

#### 目录调整

```
src/
├── index.ts                 ← 仅保留 @public，≤ 20 exports
├── internal/                ← 新增，不在 barrel
│   ├── index.ts            ← re-export internal 集合
│   └── ...                 ← (按需迁入 error-recovery 等内部工具)
└── (现有文件保持位置不动)
```

**策略**：不实际移动文件（避免大规模 import 路径变动），而是通过 `src/index.ts` 的 barrel 仅保留必要 export，其余内部导入继续使用 `src/<module>.js` 相对路径。

#### 公共 API 判定

```typescript
// scripts/check-public-api.mjs 伪代码
const publicSymbols = parsePublicFromBarrel("src/index.ts");
const taggedPublic = scanTsDocTags("src/**/*.ts", "@public");
const taggedInternal = scanTsDocTags("src/**/*.ts", "@internal");

// 规则 1：所有 @public 必须在 barrel 中
for (const sym of taggedPublic) {
  if (!publicSymbols.has(sym.name)) fail(`@public ${sym.name} not in barrel`);
}

// 规则 2：所有 barrel exports 必须有 @public
for (const sym of publicSymbols) {
  if (!taggedPublic.has(sym.name)) fail(`barrel export ${sym.name} missing @public`);
}

// 规则 3：@internal 不可出现在 barrel
for (const sym of taggedInternal) {
  if (publicSymbols.has(sym.name)) fail(`@internal ${sym.name} leaked to barrel`);
}
```

#### 保留符号的决策表（初稿，最终由维护者 review）

| 符号 | 保留理由 |
|------|---------|
| `SdkDriver`, `SdkDriverConfig`, `SdkDriverResult` | npm 消费者主入口 |
| `AgentInterface`, `AgentInvocationContext`, `AgentInvocationResult` | 替换 SDK 的扩展点 |
| `createInitialState`, `transition`, `OrchestratorEvent`, `OrchestratorEffect`, `OrchestratorState` | 纯函数状态机对外 |
| `validateHooksPresence` | 调用方独立使用 |
| `createLogEntry`, `LogSink`, `LogEntry` | 自定义日志输出扩展点 |
| `ForgeError`（及少数特定子类） | 错误识别需要 |

**移除候选**（示例）：
- `error-recovery` 23 个函数 → 全部移除（仅内部 fix/recovery 路径使用）
- `pattern-stats`、`episode` → 移除（自进化内部实现）
- `orphan-detector` → 移除
- `process-registry` → 移除
- `status-resolver` → 移除

#### Deprecated re-export 过渡

```typescript
// src/index.ts（过渡期）
/**
 * @deprecated Internal API, will be removed in v2.5.0.
 * See [migration guide](https://github.com/.../v2.4-migration.md).
 */
export { classifyRecoveryContext } from "./error-recovery.js";
// ... 其他过渡 re-export
```

typedoc 配置 `excludeInternal: true`、`excludeTags: ["@deprecated"]`，过渡符号不生成文档。

---

### 需求 6 — Console 迁移

#### 新增 ConsoleSink

```typescript
// src/logger/console-sink.ts
import type { LogEntry, LogSink } from "./types.js";

export interface ConsoleSinkOptions {
  format: "text" | "json";
  minLevel?: "debug" | "info" | "warn" | "error";
}

export function createConsoleSink(opts: ConsoleSinkOptions): LogSink {
  return {
    write(entry: LogEntry) {
      if (!shouldEmit(entry.level, opts.minLevel ?? "info")) return;
      const line = opts.format === "json" ? JSON.stringify(entry) : formatText(entry);
      const stream = entry.level === "error" || entry.level === "warn" ? "stderr" : "stdout";
      if (stream === "stderr") {
        // biome-ignore lint/suspicious/noConsole: ConsoleSink is the single exit point for user-visible output
        console.error(line);
      } else {
        // biome-ignore lint/suspicious/noConsole: ConsoleSink is the single exit point for user-visible output
        console.log(line);
      }
    }
  };
}
```

#### Biome 规则

```json
// biome.json 修改片段
{
  "linter": {
    "rules": {
      "suspicious": {
        "noConsole": {
          "level": "error",
          "options": { "allow": [] }
        }
      }
    }
  },
  "overrides": [
    {
      "include": ["test/**"],
      "linter": { "rules": { "suspicious": { "noConsole": "off" } } }
    }
  ]
}
```

#### 迁移顺序

1. `src/logger/log-sink.ts`（根因，优先迁移）
2. `src/forge-loop-cli.ts`（CLI 入口，改走 ConsoleSink）
3. 其他 10 个文件按 call graph 依赖关系批量迁移

---

### 需求 7 — execFileSync 统一

```typescript
// src/orphan-detector.ts 改动
import { execFileSync } from "node:child_process";

function listProcesses(): string {
  return execFileSync("ps", ["-eo", "pid,ppid,etime,command"], {
    encoding: "utf-8",
    timeout: 5000,
  });
}
```

CI 防退化规则（shell script）：

```bash
# scripts/check-no-execsync.sh
#!/bin/bash
set -e
matches=$(grep -rn "\bexecSync\b" src/ | grep -v "biome-ignore" || true)
if [ -n "$matches" ]; then
  echo "::error::execSync usage found in src/ (use execFileSync instead):"
  echo "$matches"
  exit 1
fi
```

---

### 需求 8 — Plan 注入脚本

```javascript
// scripts/inject-plan-context.mjs
#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PLANS_DIR = ".tinkerman/plans";
const MAX_PLANS = 3;
const MAX_LINES_PER_PLAN = 50;
const MAX_CHARS_PER_PLAN = 2000;
const MAX_TOTAL_CHARS = 8000; // ~2000 tokens

function isActive(content) {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return false;
  return /^status:\s*active\b/m.test(fm[1]);
}

function extractHead(content) {
  const lines = content.split("\n").slice(0, MAX_LINES_PER_PLAN);
  const body = lines.join("\n");
  return body.length > MAX_CHARS_PER_PLAN ? body.slice(0, MAX_CHARS_PER_PLAN) + "\n[... truncated]" : body;
}

try {
  const entries = readdirSync(PLANS_DIR)
    .filter(f => f.endsWith(".md"))
    .map(f => ({ path: join(PLANS_DIR, f), mtime: statSync(join(PLANS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const active = [];
  for (const e of entries) {
    if (active.length >= MAX_PLANS) break;
    const content = readFileSync(e.path, "utf-8");
    if (isActive(content)) active.push({ path: e.path, body: extractHead(content) });
  }

  if (active.length === 0) process.exit(0);

  let output = "=== Forge Context ===\n";
  let total = output.length;
  for (const p of active) {
    const chunk = `\n--- ${p.path} ---\n${p.body}\n`;
    if (total + chunk.length > MAX_TOTAL_CHARS) {
      output += `\n[... ${active.length - active.indexOf(p)} plans truncated due to token budget]\n`;
      break;
    }
    output += chunk;
    total += chunk.length;
  }

  process.stdout.write(output);
} catch (err) {
  // fail-open：不注入优于报错
  process.exit(0);
}
```

#### hooks.json 修改

```json
"UserPromptSubmit": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "node scripts/inject-plan-context.mjs 2>/dev/null || true"
      }
    ]
  }
]
```

#### 单元测试策略

`test/inject-plan-context.test.ts` 使用 temp dir + 构造多个 mock plan 文件测试上述脚本；由于脚本为 `.mjs` 不在 `src/`，使用 `execFile` 调用实际进程验证 stdout。

---

## Data Models

### HooksProtectionMissingError

```typescript
interface HooksProtectionMissingErrorFields {
  code: "HOOKS_PROTECTION_MISSING";
  message: string;                // 含 reason + 建议
  reason: "hooks.json not found" | "PreToolUse section missing" | "hooks.json parse failed";
  cwd: string;
}
```

### force-no-hooks.flag 文件内容

```json
{
  "timestamp": "2026-05-10T14:23:45.123Z",
  "cliArgs": ["--force-no-hooks", "--worktree"],
  "reason": "hooks.json not found",
  "runId": "forge-loop-abc123"
}
```

---

## Error Handling

| 错误类 | code | 触发场景 |
|--------|------|---------|
| `HooksProtectionMissingError` | `HOOKS_PROTECTION_MISSING` | hooks 缺失且未 --force-no-hooks |
| `HookScriptError` | `HOOK_SCRIPT_ERROR` | check-frozen wrapper exit 2 |
| `E2ETimeoutError`（测试 helper 内部）| N/A | E2E 超过 60s 墙钟 |

### Fail-Open 约定

以下情况采用 fail-open（不报错、不注入）：
- `scripts/inject-plan-context.mjs` 任意异常（plan 注入失败不应阻塞用户 prompt）

以下情况采用 fail-closed（报错阻断）：
- `validateHooksPresence` 失败（需求 1 的核心）
- `check-frozen` wrapper 的 Node/dist 缺失（exit 2）
- 覆盖率门禁不达标（需求 4）---

## Testing Strategy

### 需求 1 — Hook 阻断

- **Property test**：任意 `SdkDriverConfig` 在 hooks 缺失时必抛 `HooksProtectionMissingError`
- **Unit test**：`--force-no-hooks` 路径必须写 `force-no-hooks.flag` 文件
- **Integration test**：删除 `hooks/hooks.json` 运行 forge-loop，stderr 包含原因与建议
- **Hook script test**：构造 `node` 不在 PATH 的环境，验证 wrapper exit 2

### 需求 2 — E2E

- **5 条路径各一个测试文件**，每个至少 git 快照 + StatusFile 快照
- **重试策略**：CI 中 E2E job 允许 1 次自动重试（应对偶发 git 竞争）
- **Flaky 检测**：若同一 E2E 在 10 次连续运行中失败 ≥ 2 次，标记为需要调研

### 需求 3 — API 面

- **Unit test**：`scripts/check-public-api.mjs` 对构造的违规样本（@internal 泄漏、缺 @public 标注）必须失败
- **Regression test**：在 CI 中运行 `check-public-api.mjs`
- **Snapshot test**：`src/index.ts` 的 barrel export 列表以快照固定，任何新增/移除都需要测试更新（给审查者强提醒）

### 需求 4 — 覆盖率

- 无额外测试（覆盖率门禁本身即测试）
- 但需 **一次性宽限**：在 main 合并前运行 `vitest run --coverage` 确认实际值达标

### 需求 5 — SKILL 映射

- **Integration test**：`scripts/check-skill-function-refs.sh --strict` 在现状下失败、在映射补齐后通过
- **Unit test**：脚本对构造的"audit 标 ✅ 但 SKILL 中无调用示例"样本必须失败

### 需求 6 — Console 迁移

- **Lint test**：Biome 在 `src/` 中存在未豁免 console 时失败
- **Snapshot test**：`ConsoleSink` 对给定 `LogEntry` 输出格式快照（text/json 模式分别）

### 需求 7 — execFileSync

- **Lint test**：`scripts/check-no-execsync.sh` 在 `src/` 中存在 execSync 时失败
- **Unit test**：`orphan-detector.ts` 对模拟 ps 输出（通过 mock `child_process`）解析正确

### 需求 8 — Plan 注入

- **Unit test**（通过 execFile 调用 .mjs 脚本）：
  - 空 plans 目录 → 空输出
  - 3 个 active plan → 输出包含全部
  - 5 个 active plan → 输出最多 3 个（按 mtime）
  - 超长 plan → 截断到 2000 字符且附 `[... truncated]`
  - 无 frontmatter 的 plan → 视为非 active 跳过
  - 总字符超 8000 → 部分截断并附总量提示

---

## Implementation Order

```
Phase 1（并行）：
  需求 1（Hook 阻断）────┐
  需求 6（Console）    ├─> all merged to main
  需求 7（execFileSync）─┘

Phase 2（可并行）：
  需求 2（E2E）   ─────┐
  需求 3（API 面） ────┼─> all merged to main
  需求 8（Plan 注入）──┘

Phase 3（全部依赖前两个 Phase）：
  需求 4（覆盖率）─────┐
  需求 5（SKILL 映射）─┘─> v2.4.0 release
```

### 版本发布节奏

- **v2.3.1**：需求 1 的 warning 过渡版（新行为 opt-in，老行为默认）
- **v2.4.0-beta**：Phase 1 + Phase 2 完成
- **v2.4.0**：Phase 3 完成 + 全部验收门禁通过，breaking changes 生效

---

## Migration Guide (for v2.4.0 consumers)

### Breaking Changes

1. **hooks 缺失默认阻断**：若在 v2.3.x 习惯 hooks 缺失 warn 继续运行，v2.4.0 需要显式 `--force-no-hooks`
2. **API 面收缩**：若直接 import 了 `error-recovery` / `pattern-stats` / `orphan-detector` / `process-registry` / `status-resolver`，在 v2.5.0 会完全移除。v2.4.0 有 deprecated re-export 作为过渡
3. **覆盖率门禁提升**：fork 的项目需自行调整测试覆盖

### Non-Breaking Changes

- console 日志输出格式在 text 模式下保持兼容
- Plan 注入内容格式（`=== Forge Context ===` 头）保持兼容
- `execFileSync` 改动用户不可见
