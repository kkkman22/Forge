---
feature: subagent-hook-context-budget
layout: design
created: 2026-05-16
---

# Subagent Hook Context Budget Bugfix Design

## Overview

`/forge review` 启动 spec-check / quality-check / security-check 三个 subagent 时，每个
subagent 的 `SessionStart` 与 `UserPromptSubmit` hook 都会触发**未受预算约束**的载荷
注入：三份配置文件（`.claude/settings.json`、`.claude-plugin/plugin.json`、
`hooks/hooks.json`）各自 `cat .forge/knowledge/evolved-rules.md` 全量内容，
`.claude/settings.json` 还残留一段 `head -50 .forge/plans/*.md + tail -20
.forge/progress/*.md`。所有 hook 命令对"调用方是主 agent 还是 subagent"完全不感知，
导致 subagent 在 `maxTurns: 6` 内就被 prompt 噪声耗尽预算，输出被截断。

修复策略遵循 bug condition 方法：

- **C(X)**：hook 调用方为 subagent（stdin JSON 含 `agent_id` 字段）—— 短路、零注入。
- **¬C(X)**：hook 调用方为主 agent —— 行为完全不变（仅给 SessionStart `cat` 套
  字节上限，其它逻辑保持现状）。
- **F → F'**：在两个 `.mjs` hook 入口加 stdin 路由短路；把 SessionStart 的内联 cat
  抽出为新脚本 `scripts/inject-evolved-rules.mjs`（共用 router）；删除
  `.claude/settings.json` 的 UserPromptSubmit head/tail 段；非注入类 hook
  （`PreToolUse` / `PostToolUse` / `Stop` / `TeammateIdle` / `PreCompact` /
  `PostCompact` / `TaskCompleted`）一行不动。

修复采用三段式 rollout：先叠加 router + 入口短路（纯增量、不影响行为），再删除
settings.json 重复源 + 套字节上限，最后改写 plugin.json / hooks.json 的 SessionStart
入口。每段独立可合并、独立可回滚。

## Glossary

- **Bug_Condition (C)**：hook 命令在 subagent 上下文中执行，等价于 stdin JSON 含
  `agent_id` 字段（来自 Claude Code 官方 hook 输入约定，参见
  https://code.claude.com/docs/en/hooks#common-input-fields）。
- **Property (P)**：当 C(X) 成立，hook 命令必须 `exit 0` 且不向 stdout 写入任何
  字节（"零注入"），不论被注入的是 plan 上下文、cmux 同步消息、还是 evolved-rules。
- **Preservation**：当 ¬C(X) 成立，hook 命令的 stdout 字节流必须与修复前等价
  （唯一例外：SessionStart `cat` → `head -c 4096`，主 agent 与 subagent 共享该
  字节上限）。
- **F**：修复前的 hook 命令集合（含三份配置文件 SessionStart cat、settings.json
  UserPromptSubmit head/tail、`inject-plan-context.mjs` 与
  `cmux-mirror/sync-once.mjs`）。
- **F'**：修复后的 hook 命令集合 + `scripts/lib/hook-stdin-router.mjs` +
  `scripts/inject-evolved-rules.mjs`，两个 .mjs 脚本入口在 router 短路后才进入主路径。
- **Router**：`scripts/lib/hook-stdin-router.mjs` 模块，导出
  `shouldSkipForSubagent(): Promise<boolean>`，封装非阻塞 stdin 读取（500ms 超时）+
  JSON 解析 + `agent_id` 检测 + fail-safe（解析失败/超时/不确定 → 短路）。
- **EVOLVED_RULES_MAX_BYTES**：4096（4KB）。SessionStart 注入 evolved-rules 的硬上限。
- **PLAN_CONTEXT_MAX_BYTES**：8192（8KB）。`inject-plan-context.mjs` 现有上限，沿用。
- **CALLER_KIND**：router 返回的调用方分类，取值 `"main"` / `"subagent"` /
  `"unknown"`，三者中只有 `"main"` 走原注入路径。

## Bug Details

### Bug Condition

The bug manifests when a hook command (`SessionStart` or `UserPromptSubmit`) fires
inside a subagent session (即 stdin JSON 含 `agent_id` 字段)，并把以下载荷之一注入到
subagent 上下文中：(a) `.forge/knowledge/evolved-rules.md` 的无界全文，
(b) `.forge/plans/*.md` 的 head -50、`.forge/progress/*.md` 的 tail -20 全文叠加，
(c) `inject-plan-context.mjs` 的 8KB plan 上下文（在主 agent 路径合理，但在 subagent
路径属于多余注入），(d) `cmux-mirror/sync-once.mjs` 的同步反馈输出。

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type HookStdinJSON
         (Claude Code hook stdin payload per
          https://code.claude.com/docs/en/hooks#common-input-fields)
  OUTPUT: boolean

  // Subagent 调用 → agent_id 字段必然存在
  isSubagent := (input.agent_id IS NOT NULL AND input.agent_id != "")

  // 任一注入入口在 subagent 路径上写入 stdout
  injectsInSubagent :=
       sessionStartCatEvolvedRules(input) writes > 0 bytes
    OR userPromptSubmitHeadTail(input) writes > 0 bytes
    OR injectPlanContext(input) writes > 0 bytes
    OR cmuxSyncOnce(input) writes > 0 bytes

  RETURN isSubagent AND injectsInSubagent
END FUNCTION
```

### Examples

- **Example 1 — SessionStart 全量 cat**：spec-check subagent 启动时，
  `.claude/settings.json` 的 SessionStart 第二段执行
  `cat .forge/knowledge/evolved-rules.md` 把全文（>4KB 时不止 4KB）注入到 subagent
  启动上下文。期望：`exit 0`，零字节输出。
- **Example 2 — UserPromptSubmit head/tail**：spec-check 在评审循环中第二次
  `UserPromptSubmit` 触发，`.claude/settings.json` UserPromptSubmit 段把
  `.forge/plans/*.md`（10+ 历史文件）的 head -50 与 `.forge/progress/*.md` 的 tail -20
  全部 dump，单次注入 100KB+。期望：`.claude/settings.json` 该段已被删除，
  hook 不输出任何字节。
- **Example 3 — inject-plan-context.mjs**：quality-check subagent UserPromptSubmit
  触发 `node inject-plan-context.mjs`，脚本读取 `.forge/plans/*.md` 输出 8KB plan
  headers。期望：脚本入口先调用 router，检测到 `agent_id` 立即 `process.exit(0)`，
  不读 `.forge/plans/`。
- **Example 4 — cmux-mirror/sync-once.mjs**：security-check subagent
  UserPromptSubmit 触发 `node cmux-mirror/sync-once.mjs .forge`，脚本走完 9 步
  sync 流程并输出反馈到 stdout。期望：脚本入口（`if (args.length > 0 && args[0]
  !== "--test")` 分支）在 `syncOnce` 之前调用 router，subagent 路径直接 `exit 0`。
- **Edge Case — stdin 超时**：hook 触发但 stdin 关闭/无数据/部分读，500ms 后仍未读到完整
  JSON。期望：fail-safe `exit 0`，等同 subagent 路径（不注入）；绝不退化成"不确定时
  注入完整载荷"。

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- 主 agent 路径下 `inject-plan-context.mjs` 的输出格式（`=== Forge Context ===`
  头 + `--- <path> ---` 分隔符 + `[... truncated]` / `[... N plans truncated due
  to token budget]` 标记 + 8KB 总上限）byte-equal 修复前。
- 主 agent 路径下 SessionStart `auto-resume.sh` 的全部行为（命令字符串、timeout、
  fallback 链）保持不变。
- 主 agent 路径下 `cmux-mirror/sync-once.mjs` 的 9 步流程（availability →
  forge-dir check → lock → respawn → read → emit → diff → dispatch → snapshot）与
  CLI 退出码语义完全不变。
- `PreToolUse` / `PostToolUse` / `Stop` / `TeammateIdle` / `PreCompact` /
  `PostCompact` / `TaskCompleted` 全部 hook 命令保持当前 hooks.json /
  plugin.json / settings.json 中的字符串与 timeout 配置，不被本次修复改写。
- 三个评审 subagent（spec-check / quality-check / security-check）的 frontmatter、
  Read 预算、`maxTurns: 6`、`forge_git(diff-content)` 首步契约不受影响（修复仅改入口
  hook，不改 subagent 自身）。
- `Subagent_Summary_Protocol`（出口摘要协议）不变，本次修复仅改入口注入路径。

**Scope:**

All inputs that do NOT involve subagent hook calls 应当**完全不受**本次修复影响。
具体包括：

- 主 agent 在所有 7 类 hook（含 `UserPromptSubmit` / `SessionStart`）上的注入字节流。
- 任意 subagent 的 `PreToolUse` / `PostToolUse` / `Stop` 等非注入类 hook（这些 hook
  的命令字符串与超时配置不被改动）。
- subagent 自身的工具调用、`forge_git` 调用、Read 预算等运行时行为。
- 现有 `Subagent_Summary_Protocol` 出口路径。

**Note:** Property 1 / Property 2 / Property 3 / Property 4 / Property 5（见
"Correctness Properties"）共同覆盖上述保持不变 + 短路两类语义。

## Hypothesized Root Cause

Based on the bug description (which has been fact-calibrated against the three
config files and Claude Code's official hook stdin schema)，最可能的成因是：

1. **三份独立的 hook 配置都存在 SessionStart 全量 cat**：`.claude/settings.json`、
   `.claude-plugin/plugin.json`、`hooks/hooks.json` 各自有一段
   `cat .forge/knowledge/evolved-rules.md`，无字节上限。每个 subagent 是独立
   session，因此 SessionStart 在每个 subagent 启动时被触发；三份配置中至少一份
   会被 Claude Code 加载并执行，全文注入到 subagent 上下文。

2. **`.claude/settings.json` 残留 UserPromptSubmit head/tail 段未跟进迁移**：
   `inject-plan-context.mjs`（plugin.json + hooks.json）已在 v2.4-review-followups
   Task 29 引入 8KB 上限并替代了原始 head/tail 行为，但 `.claude/settings.json`
   未同步删除该段，造成"双源叠加 + 老源无界"。

3. **hook 命令对调用方完全不感知**：所有 hook 命令（`cat`、`head/tail`、`node
   inject-plan-context.mjs`、`node sync-once.mjs`）都不读取 stdin JSON，无法分辨
   主 agent 与 subagent；Claude Code 官方文档显式提供 `agent_id` 字段用于这一区分，
   但项目代码未使用该信号。

4. **缺少集中的 stdin 路由模块**：每个 .mjs hook 入口若各自实现 stdin 解析逻辑，
   会重复 fail-safe 边界处理（超时、partial read、JSON 解析失败），增加回归面。
   集中到一个 router 模块可以统一语义、降低重复。

## Correctness Properties

Property 1: Bug Condition - Subagent Short-Circuit Zero Injection

_For any_ hook stdin JSON input where the `agent_id` field is present (即 hook 在
subagent 上下文中触发)，新增的 `shouldSkipForSubagent()` SHALL return `true`，
hook 脚本（`inject-plan-context.mjs` / `cmux-mirror/sync-once.mjs` /
`inject-evolved-rules.mjs`）SHALL 在不读 `.forge/knowledge/`、`.forge/plans/`、
`.forge/progress/` 任何文件的前提下立即 `process.exit(0)` 且向 stdout 写入零字节。

**Validates: Requirements 2.1, 2.2, 2.5**

Property 2: Preservation - Main Agent Injection Byte-Equal

_For any_ hook stdin JSON input where the `agent_id` field is **absent**（即 hook
在主 agent 上下文中触发），`shouldSkipForSubagent()` SHALL return `false`，
hook 脚本 SHALL 进入原注入路径并产生与修复前 byte-equal 的 stdout（仅例外：
SessionStart 的 evolved-rules 注入新增 4096 字节硬上限，主 agent 与 subagent 共享该
上限——但 subagent 已被 Property 1 短路在前，因此该上限只对主 agent 路径生效），
且总输出字节数 ≤ 现有上界（plan 注入 ≤ 8192 字节，evolved-rules 注入 ≤ 4096 字节）。

**Validates: Requirements 3.1, 3.2, 3.7**

Property 3: Preservation - Fail-Safe On Ill-Formed Stdin

_For any_ hook stdin that is ill-formed（管道关闭、stdin 在 500ms 内未给出完整 JSON、
JSON 解析抛错、JSON 缺少 `hook_event_name` 但又非典型主 agent 形态），
`shouldSkipForSubagent()` SHALL return `true`（与 subagent 路径合并），
hook 脚本 SHALL `process.exit(0)` 且不向 stdout 写入任何字节；任何情况下都不得退化为
"在不确定状态下仍执行完整注入"。

**Validates: Requirements 2.6**

Property 4: Preservation - No Settings.json Re-injection

_For any_ time `.claude/settings.json` 在被删除 UserPromptSubmit head/tail 段后被
重新加载或被新提交修改，主 agent 收到的 plan 注入 SHALL 仍来自
`inject-plan-context.mjs`（plugin.json + hooks.json 两份配置共享该入口），且每个 plan
文件 SHALL 在主 agent 单次 UserPromptSubmit 注入中至多出现一次（无双源叠加）；
配置文件层面 SHALL NOT 引入任何匹配模式 `head|tail|cat .forge/(plans|progress)/.*`
但缺少字节上限的命令。

**Validates: Requirements 2.3, 3.7**

Property 5: Preservation - Idempotency Across Repeated Invocations

_For any_ subagent 内连续两次 `UserPromptSubmit` 触发，两次 hook 脚本输出 SHALL
都为零字节（与 Property 1 一致）。_For any_ 主 agent 内连续两次 `UserPromptSubmit`
触发（在被注入文件未变更的前提下），两次 hook 脚本的 stdout SHALL byte-equal。
该性质来自现有 `inject-plan-context.mjs` 的纯函数语义（仅依赖 `.forge/plans/*.md`
mtime 与内容）的延续，本次修复不得引入新的非确定性。

**Validates: Requirements 2.7, 3.1**

## Architecture

### Hook Injection Entry-Point Map

修复点分布在 5 个文件、6 个具体注入入口（SessionStart × 3 配置文件 +
UserPromptSubmit 3 段：settings.json head/tail、plugin.json/hooks.json
inject-plan-context、plugin.json/hooks.json cmux-mirror）：

```
                    ┌─────────────────────────────────────────────────┐
                    │       Claude Code Hook Dispatcher (external)    │
                    │  - 加载 .claude/settings.json + plugin.json +    │
                    │    hooks/hooks.json 的 hooks 段                  │
                    │  - 在 SessionStart / UserPromptSubmit 时把 stdin │
                    │    JSON 注入到 hook command 的 stdin             │
                    └─────────────────────────────────────────────────┘
                                       │
       ┌───────────────────────────────┼───────────────────────────────────┐
       ▼                               ▼                                   ▼
 [SessionStart × 3]             [UserPromptSubmit × 3]                [其它 hooks]
                                                                  PreToolUse/PostToolUse/
                                                                  Stop/TeammateIdle/...
                                                                  ┃
                                                                  ┃ 不动（preservation）
                                                                  ▽

 SessionStart 入口 1                UserPromptSubmit 入口 A
 (.claude/settings.json:14-22)      (.claude/settings.json:25-32)
   cat .forge/knowledge/             head -50 .forge/plans/*.md
       evolved-rules.md              tail -20 .forge/progress/*.md
 ┃                                   ┃
 ┃ 修改点 ①                          ┃ 修改点 ②（DELETE 整段）
 ▼                                   ▼
   node inject-evolved-rules.mjs       (空 — 由 plugin.json/hooks.json 的
   (含 router 短路 + 4KB 上限)          inject-plan-context.mjs 单源承担)


 SessionStart 入口 2                UserPromptSubmit 入口 B
 (.claude-plugin/plugin.json)        (.claude-plugin/plugin.json + hooks/hooks.json)
   cat .forge/knowledge/               node inject-plan-context.mjs
       evolved-rules.md
 ┃                                   ┃
 ┃ 修改点 ③                          ┃ 修改点 ⑤ (脚本入口加 router 短路)
 ▼                                   ▼
   node inject-evolved-rules.mjs       inject-plan-context.mjs
   (统一调用同一脚本)                    └── import shouldSkipForSubagent()
                                            └── 短路 → exit 0
                                            └── 否则继续现有 8KB 注入逻辑


 SessionStart 入口 3                UserPromptSubmit 入口 C
 (hooks/hooks.json)                  (.claude-plugin/plugin.json + hooks/hooks.json)
   cat .forge/knowledge/               node cmux-mirror/sync-once.mjs .forge
       evolved-rules.md
 ┃                                   ┃
 ┃ 修改点 ④                          ┃ 修改点 ⑥ (脚本入口加 router 短路)
 ▼                                   ▼
   node inject-evolved-rules.mjs       cmux-mirror/sync-once.mjs
                                       └── 在 syncOnce(...) 之前 router 短路
                                       └── 否则继续现有 9 步 sync 流程


           ┌────────────────────────────────────────────────┐
           │  scripts/lib/hook-stdin-router.mjs (NEW)       │
           │  export shouldSkipForSubagent(): Promise<bool> │
           │  - 非阻塞 stdin 读取（500ms timeout）           │
           │  - JSON.parse                                   │
           │  - 检测 agent_id ⇒ true                         │
           │  - 任何异常 ⇒ true（fail-safe）                 │
           └────────────────────────────────────────────────┘
                            ▲
                            │  共用此模块
            ┌───────────────┼────────────────┐
            │               │                │
   inject-plan-      cmux-mirror/      inject-evolved-
   context.mjs       sync-once.mjs     rules.mjs (NEW)
```

### Modification Inventory（5 修改点）

| # | File | Section / Function | Change Kind |
|---|------|--------------------|-------------|
| ① | `.claude/settings.json` | UserPromptSubmit 段（lines 25-32 in `head -50` + `tail -20`） | DELETE 整段（双源去重） |
| ② | `.claude/settings.json` | SessionStart 第二段 `cat evolved-rules.md` | 改写为 `node ${...}/inject-evolved-rules.mjs ...`（含 fallback） |
| ③ | `.claude-plugin/plugin.json` | SessionStart 第二段 `cat evolved-rules.md` | 同 ② |
| ④ | `hooks/hooks.json` | SessionStart 第二段 `cat evolved-rules.md` | 同 ② |
| ⑤ | `scripts/inject-plan-context.mjs` | 文件最顶端 main 路径 | 在第一行实际逻辑前 `await shouldSkipForSubagent()` 短路 |
| ⑥ | `scripts/cmux-mirror/sync-once.mjs` | CLI entry point（`if (args.length > 0 && args[0] !== "--test")` 分支） | 在 `syncOnce(...)` 之前 router 短路 |

新增文件（非修改点，纯增量）：

- `scripts/lib/hook-stdin-router.mjs` — router 模块，被 ⑤ ⑥ 与新脚本共用。
- `scripts/inject-evolved-rules.mjs` — SessionStart 注入器（取代三份配置中的内联
  `cat`），内部调用 router + 受 4KB 字节上限约束读取
  `.forge/knowledge/evolved-rules.md`。

## Components

### Component 1: `scripts/lib/hook-stdin-router.mjs` (NEW)

封装 stdin 读取 + JSON 解析 + agent_id 检测 + fail-safe 边界处理。

**Public API:**

```javascript
// scripts/lib/hook-stdin-router.mjs

/**
 * @typedef {Object} RouterDecision
 * @property {boolean} shouldInject
 *   - true  当且仅当调用方判定为 "main"（主 agent）
 *   - false 当判定为 "subagent" 或 "unknown"
 * @property {"main"|"subagent"|"unknown"} callerKind
 * @property {string} [agentType]
 *   - 仅当 callerKind === "subagent" 时存在；来自 stdin JSON `agent_type` 字段
 *   - 仅供 telemetry / debug，不参与短路判定
 */

/**
 * 非阻塞从 stdin 读取 JSON 并判定调用方。
 * 不会抛出异常；任何错误都进入 fail-safe 路径（callerKind="unknown"）。
 *
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs=500] stdin 读取超时
 * @returns {Promise<RouterDecision>}
 */
export async function classifyHookCaller(opts = {}) { ... }

/**
 * 便捷封装：调用方为非主 agent（subagent 或 unknown）即返回 true。
 * 用于 hook 脚本入口的早期短路：
 *   if (await shouldSkipForSubagent()) process.exit(0);
 *
 * @param {Object} [opts]
 * @returns {Promise<boolean>}
 */
export async function shouldSkipForSubagent(opts = {}) {
  const decision = await classifyHookCaller(opts);
  return !decision.shouldInject;  // unknown 也短路（fail-safe）
}
```

**Implementation contract:**

- 使用 `process.stdin.isTTY` 与 `Promise.race` + `setTimeout(500)` 实现非阻塞读取。
- 不读取超过 64KB 的 stdin（防御性上限，正常 hook payload 远小于此）。
- 任何异常路径（stdin 关闭、partial read、`JSON.parse` 抛错、字段缺失但 `agent_id`
  也缺失）→ `callerKind: "unknown"` → `shouldInject: false`（即 `shouldSkipForSubagent`
  返回 `true`，与 subagent 路径合并）。这是 fail-safe 的关键：宁可主 agent 偶尔少注入
  一次，也不让 subagent 被注入。
- 模块本身无副作用，不写文件、不调用任何 hook 子系统、不依赖 `.forge/`。

### Component 2: `scripts/inject-evolved-rules.mjs` (NEW)

替代三份配置文件中内联的 `cat .forge/knowledge/evolved-rules.md`。

**取舍分析（inline shell vs 抽出新脚本）：**

| 维度 | 方案 A：保留 inline shell（套字节上限 + agent_id 短路） | 方案 B：抽出新 .mjs 脚本 |
|------|-----------------------------------------------|--------------------|
| 复杂度 | inline shell 解析 stdin JSON 检测 `agent_id` 字段需要 `jq` 或脆弱的 grep 启发式；脚本字符串嵌入在 JSON 配置中需要二次转义 | 一行 node 调用，所有逻辑在 .mjs 中 |
| 重复 | 同样的 inline shell 在 3 份配置文件中复制粘贴 3 次 | 三份配置共享同一脚本 |
| 与 router 一致性 | shell + .mjs 两套 stdin 解析语义，fail-safe 边界容易漂移 | 与 ⑤ ⑥ 共用 `hook-stdin-router.mjs`，语义统一 |
| 测试 | inline shell 难以单元测试；只能端到端 | 普通 .mjs 脚本，单测覆盖 P1/P2/P3 |
| 字节上限 | 需 `head -c 4096` 或 `awk`，shell 字节计数在多字节字符下不一定准 | 直接 `Buffer.slice(0, 4096)`，确定性 |

**推荐方案 B（抽出 `scripts/inject-evolved-rules.mjs`）**：与项目现有
`inject-plan-context.mjs` 风格一致，复用 router，单测覆盖率可控。

**Pseudocode:**

```javascript
// scripts/inject-evolved-rules.mjs
#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { shouldSkipForSubagent } from "./lib/hook-stdin-router.mjs";

const RULES_PATH = ".forge/knowledge/evolved-rules.md";
const MAX_BYTES = 4096;

(async () => {
  if (await shouldSkipForSubagent()) process.exit(0);  // Property 1 + 3
  try {
    statSync(RULES_PATH);
    const buf = readFileSync(RULES_PATH);
    process.stdout.write("=== Evolved Rules ===\n");
    if (buf.length <= MAX_BYTES) {
      process.stdout.write(buf);
    } else {
      process.stdout.write(buf.subarray(0, MAX_BYTES));
      process.stdout.write(`\n[... ${buf.length - MAX_BYTES} bytes truncated]\n`);
    }
  } catch {
    process.exit(0);  // 文件不存在或不可读 → fail-open
  }
})();
```

### Component 3: `scripts/inject-plan-context.mjs` (MODIFY)

仅改入口：在文件第一行可执行代码前注入 router 短路；其余逻辑保持不变。

**Pseudocode (changes only):**

```javascript
// scripts/inject-plan-context.mjs (existing, with prepended short-circuit)
import { shouldSkipForSubagent } from "./lib/hook-stdin-router.mjs";

if (await shouldSkipForSubagent()) process.exit(0);

// ... 现有 53 行逻辑完全不变 ...
```

注意：现有脚本是顶层 `try { ... }` 包住同步逻辑。改造后顶层成为 async IIFE 或使用
top-level await（Node.js 14.8+ ESM 支持）。建议使用 top-level await 保持文件结构最小
扰动。

### Component 4: `scripts/cmux-mirror/sync-once.mjs` (MODIFY)

仅改 CLI 入口分支：

```javascript
// scripts/cmux-mirror/sync-once.mjs
import { shouldSkipForSubagent } from "../lib/hook-stdin-router.mjs";

// ... existing imports + syncOnce()/syncOnceWithRespawn() exports unchanged ...

// CLI entry point
const args = process.argv.slice(2);
if (args.length > 0 && args[0] !== "--test") {
  if (await shouldSkipForSubagent()) process.exit(0);   // ← 新增
  const forgeDir = args[0] || ".forge";
  if (forgeDir.includes("..")) process.exit(0);
  // ... 现有 syncOnce 调用与 .catch(() => process.exit(0)) 保持 ...
}
```

`syncOnce()` / `syncOnceWithRespawn()` 作为可导入的纯函数完全不变；router 短路只
影响 hook CLI 入口。这保证测试和其它内部调用方不受影响。

## Data Models

### Claude Code Hook Stdin JSON Schema (excerpt)

来源：https://code.claude.com/docs/en/hooks#common-input-fields。仅列举与本次修复
相关的字段：

```typescript
interface HookStdinJSON {
  /** 全局唯一会话 ID，主 agent 与每个 subagent 各有独立值 */
  session_id: string;
  /** 触发当前 hook 的事件名，如 "SessionStart" / "UserPromptSubmit" / ... */
  hook_event_name: string;
  /**
   * **仅** 在 hook 在 subagent 上下文中触发时存在。
   * 主 agent 触发的 hook 调用中此字段缺失（undefined）。
   * 这是判定 subagent 路径的权威信号。
   */
  agent_id?: string;
  /**
   * subagent 的类型；对于自定义 subagent，等于 frontmatter `name` 字段。
   * 仅供 telemetry / debug，不参与本次修复的短路判定。
   */
  agent_type?: string;
  /** 仅 UserPromptSubmit 触发时存在 */
  prompt?: string;
  /** 其它字段（PreToolUse 的 tool_name / tool_input 等）— 与本次修复无关 */
}
```

### Router Return Type

```typescript
type CallerKind = "main" | "subagent" | "unknown";

interface RouterDecision {
  /**
   * - true  ⇔ callerKind === "main"（注入完整载荷）
   * - false ⇔ callerKind === "subagent" | "unknown"（短路）
   */
  shouldInject: boolean;
  callerKind: CallerKind;
  /** 仅当 callerKind === "subagent" 且 stdin JSON 含 agent_type 时填充 */
  agentType?: string;
}
```

### Byte Budget Constants

| Constant | Value | Defined In | Applies To |
|----------|------:|-----------|------------|
| `EVOLVED_RULES_MAX_BYTES` | 4096 | `scripts/inject-evolved-rules.mjs` | SessionStart evolved-rules 注入 |
| `PLAN_CONTEXT_MAX_BYTES` | 8192 | `scripts/inject-plan-context.mjs` (existing `MAX_TOTAL_CHARS`) | UserPromptSubmit plan 注入 |
| `STDIN_TIMEOUT_MS` | 500 | `scripts/lib/hook-stdin-router.mjs` | router 等待 stdin 完整 JSON 的硬上限 |
| `STDIN_MAX_BYTES` | 65536 | `scripts/lib/hook-stdin-router.mjs` | router 单次读取 stdin 的防御性上限 |

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct, implement modifications across 5
files + 2 new files:

**File**: `scripts/lib/hook-stdin-router.mjs` (NEW)

**Function**: `classifyHookCaller()`, `shouldSkipForSubagent()`

**Specific Changes**:
1. **新建文件**：导出 `classifyHookCaller` 与 `shouldSkipForSubagent`。
2. **stdin 读取**：使用 `Promise.race([readAllChunks(), sleep(500)])`，
   不阻塞 process。
3. **JSON 解析**：`try { JSON.parse(buf) } catch { → "unknown" }`。
4. **agent_id 检测**：`obj.agent_id != null && obj.agent_id !== ""`
   → `"subagent"`；缺失但 `hook_event_name` 存在 → `"main"`；其它 → `"unknown"`。
5. **fail-safe 合并**：`shouldInject` 仅在 `"main"` 时为 true。

**File**: `scripts/inject-evolved-rules.mjs` (NEW)

**Function**: 默认导出 IIFE。

**Specific Changes**:
1. **router 短路**：第一行逻辑 `if (await shouldSkipForSubagent()) process.exit(0)`。
2. **字节上限**：`Buffer.slice(0, 4096)` 后接截断标记。
3. **fail-open**：文件不存在时 silent exit 0（与现有内联 `if [ -f ... ]` 等价）。

**File**: `scripts/inject-plan-context.mjs` (MODIFY，1 处修改)

**Function**: 文件顶层。

**Specific Changes**:
1. **顶部 import**：`import { shouldSkipForSubagent } from "./lib/hook-stdin-router.mjs";`
2. **顶层 await 短路**：在 `try { ... }` 之前加 `if (await shouldSkipForSubagent())
   process.exit(0);`。
3. **现有逻辑零改动**：8KB plan 截断、active 检测、mtime 排序、输出格式全部保留。

**File**: `scripts/cmux-mirror/sync-once.mjs` (MODIFY，1 处修改)

**Function**: CLI entry point 分支（文件末尾的 `if (args.length > 0 && args[0]
!== "--test")` 块）。

**Specific Changes**:
1. **顶部 import**：`import { shouldSkipForSubagent } from
   "../lib/hook-stdin-router.mjs";`
2. **CLI 短路**：在 `args[0] !== "--test"` 分支内、`syncOnce()` 调用前插入
   `if (await shouldSkipForSubagent()) process.exit(0);`。
3. **`syncOnce` / `syncOnceWithRespawn` 不变**：作为可导入函数保持纯净，便于单测复用。

**File**: `.claude/settings.json` (MODIFY，2 处修改)

**Specific Changes**:
1. **DELETE UserPromptSubmit 整段** (修改点 ①)：移除 `head -50 .forge/plans/*.md
   2>/dev/null; ... tail -20 .forge/progress/*.md ...` 的整个 entry。该段不再
   存在，主 agent 的 plan 注入仍由 plugin.json + hooks.json 的
   `inject-plan-context.mjs` 提供。
2. **改写 SessionStart 第二段** (修改点 ②)：把内联 `cat .forge/knowledge/
   evolved-rules.md` 替换为 `node forge/scripts/inject-evolved-rules.mjs
   2>/dev/null || node ~/.claude/skills/forge/scripts/inject-evolved-rules.mjs
   2>/dev/null || true`，沿用现有 fallback 链与 `timeout: 5`。

**File**: `.claude-plugin/plugin.json` (MODIFY，1 处修改)

**Specific Changes**:
1. **改写 SessionStart 第二段** (修改点 ③)：替换为 `node "${CLAUDE_PLUGIN_ROOT}/
   scripts/inject-evolved-rules.mjs" 2>/dev/null || node forge/scripts/
   inject-evolved-rules.mjs 2>/dev/null || true`，与现有 plugin.json 风格一致。

**File**: `hooks/hooks.json` (MODIFY，1 处修改)

**Specific Changes**:
1. **改写 SessionStart 第二段** (修改点 ④)：替换为 `node forge/scripts/
   inject-evolved-rules.mjs 2>/dev/null || node ~/.claude/skills/forge/scripts/
   inject-evolved-rules.mjs 2>/dev/null || true`。

**File**: `test/non-frozen-hook-preservation.property.test.ts` (MODIFY，1 处修改)

该 baseline 快照测试当前断言 `EXPECTED_SESSION_START_HOOKS[1]` 包含原始 `cat
.forge/knowledge/evolved-rules.md` 字符串，因此需要在 Step 3 同步更新 baseline，
让它反映新的 `inject-evolved-rules.mjs` 命令。这不属于回归——它是 baseline 的
合法迁移。Step 1（router + 入口短路）阶段不动该 baseline；Step 3 与改写
SessionStart cat 同一 PR 一并更新。

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples
that demonstrate the bug on UNFIXED code, then verify the fix works correctly and
preserves existing behavior. We use four test artifacts that map 1:1 to
Properties 1-5.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing
the fix. Confirm or refute the root cause analysis. If we refute, we will need to
re-hypothesize.

**Test Plan**: 在 router 与脚本入口短路尚未引入时，写一组测试模拟 hook stdin JSON
注入到三个目标脚本（`inject-plan-context.mjs` / `cmux-mirror/sync-once.mjs` / 待
新建的 `inject-evolved-rules.mjs`），断言"含 `agent_id` 时输出为零字节"。这些测试在
UNFIXED 代码上**应该全部 RED**，从而把 bug 的存在性以可执行形式固化。

**Test Cases**:
1. **Inject-plan-context Subagent Test**：以 `{"session_id": "...",
   "hook_event_name": "UserPromptSubmit", "agent_id": "spec-check"}` 喂给
   `inject-plan-context.mjs` 的 stdin，断言 stdout 为空（will fail on unfixed
   code，因为脚本不读 stdin）。
2. **Cmux Sync Subagent Test**：同上 stdin，断言 `sync-once.mjs .forge` 不向
   stdout 写入任何同步反馈（will fail on unfixed code，因脚本同样不读 stdin）。
3. **Evolved Rules Subagent Test**：当 `inject-evolved-rules.mjs` 尚未存在时，
   该测试不可运行；测试在 Step 3 引入新脚本后立即添加（initial RED on missing
   script，next-iteration GREEN）。
4. **Settings.json head/tail Counterexample (config-level)**：构造一个 fixture
   `.forge/plans/` 含 5 个大 plan 文件、`.forge/progress/` 含 3 个，断言
   `.claude/settings.json` 的 UserPromptSubmit 段命令在执行后输出字节数 > 50KB
   （will pass on unfixed config, fail after deletion — 这是反向用法，作为删除该段
   的契约证据）。

**Expected Counterexamples**:
- `inject-plan-context.mjs` / `sync-once.mjs` 在 stdin 含 `agent_id` 时仍输出
  非零字节 plan/sync 内容。
- 可能的根因：脚本完全不读 stdin（最可能）、或读了但没解析 JSON、或解析了但没检测
  `agent_id`。

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed
function produces the expected behavior.

**Pseudocode:**

```
FOR ALL stdinPayload WHERE isBugCondition(stdinPayload) DO
  result := fixedHookScript(stdinPayload)  // inject-plan-context / sync-once /
                                           // inject-evolved-rules
  ASSERT expectedBehavior(result):
      result.exitCode == 0
      AND result.stdoutBytes == 0
      AND no .forge/* file was read
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the
fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL stdinPayload WHERE NOT isBugCondition(stdinPayload) DO
  ASSERT stdout(originalScript(stdinPayload))
       = stdout(fixedScript(stdinPayload))
       (with the single documented exception: SessionStart evolved-rules
        injection now caps at 4096 bytes for both main and subagent paths;
        in main-agent path the cap kicks in only when evolved-rules.md > 4KB)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation
checking because:
- 它能在主 agent 路径上自动生成大量 stdin payload（不同 session_id /
  hook_event_name 组合），覆盖所有"agent_id 缺失"的边界。
- 它能在 plan / progress 文件的内容、文件数、mtime 排列上生成多样化输入，验证
  `inject-plan-context.mjs` 输出的稳定性。
- 它能在配置文件层面（plugin.json / hooks.json / settings.json）扫描所有 hook
  命令，断言不引入未受预算约束的 `head|tail|cat .forge/(plans|progress)/.*` 模式。

**Test Plan**: Observe behavior on UNFIXED code first for 主 agent 路径下的 plan
注入与 cmux-mirror 同步反馈（这些已被 `inject-plan-context.test.ts` 与
`non-frozen-hook-preservation.property.test.ts` 部分覆盖），然后扩展 PBT 覆盖 P2 / P4 /
P5 三条 preservation 性质。

**Test Cases**:
1. **Main Agent Plan Injection Preservation**：在主 agent 路径（stdin 不含
   `agent_id`）上 byte-equal 比较 fixed vs current `inject-plan-context.mjs` 输出，
   覆盖空 plans / 1 个 plan / 多个 plan / 超 8KB 的 4 类输入。
2. **Main Agent Cmux Sync Preservation**：同样在主 agent 路径上断言
   `syncOnceWithRespawn` 的 9 步流程各步行为不变（lock 行为、snapshot 文件、
   commandsEmitted 计数）。
3. **Settings.json Re-injection Prevention**：扫描 plugin.json + hooks.json +
   settings.json 的 UserPromptSubmit 段，断言不存在匹配 `head|tail|cat
   .forge/(plans|progress)/.*` 但缺少字节上限 (`-c 数字` / `node .*max=数字`) 的
   命令字符串（Property 4）。

### Unit Tests

- **`test/hook-stdin-router.test.ts`** (NEW)：手工构造 6 类 stdin payload —
  (a) 含 `agent_id` 的合法 JSON、(b) 不含 `agent_id` 的主 agent JSON、
  (c) 完全空白的 stdin（管道关闭）、(d) 部分 JSON（未闭合花括号）、
  (e) 超 64KB 的恶意 payload、(f) `JSON.parse` 抛错的二进制脏数据。
  断言 `classifyHookCaller` 与 `shouldSkipForSubagent` 在每类输入上的输出符合
  Property 1 / 2 / 3。
- **现有 `test/inject-plan-context.test.ts`** (EXTEND)：新增两个场景 —
  "stdin 含 agent_id → 零字节输出"、"stdin 不含 agent_id → 与未传 stdin 时 byte-equal"。
- **`test/cmux-sync-once.subagent-skip.test.ts`** (NEW)：通过 `execFileSync` 喂
  含 `agent_id` 的 stdin，断言 `syncOnce` 不被调用、stdout 为空、且 `.cmux-snapshot.json`
  与 `.cmux-sync.lock` 不被创建（验证短路在 `syncOnce` 之前）。
- **`test/inject-evolved-rules.test.ts`** (NEW)：覆盖三类场景 — 文件不存在 silent
  exit 0、文件 ≤ 4KB byte-equal 注入、文件 > 4KB 触发 `[... N bytes truncated]`
  尾标记。

### Property-Based Tests

- **`test/hook-stdin-router.property.test.ts`** (NEW)：使用 `fast-check` 生成
  任意 JSON-like stdin payload，断言 router 在所有路径上 fail-safe（永不抛出，
  返回值始终是合法的 `RouterDecision`）。这是 Property 3 的 PBT 形式。
- **`test/hooks-config-integrity.property.test.ts`** (NEW)：用 `fast-check`
  生成"任意修改后的 hooks 配置 fragment"，断言新配置的 UserPromptSubmit 段
  不引入匹配 `head|tail|cat .forge/(plans|progress)/.*` 但缺少字节上限的命令；
  这是 Property 4 的 PBT 形式，作为防回归契约（后续修改 hook 配置也得过该测试）。
- **现有 `test/non-frozen-hook-preservation.property.test.ts`** (UPDATE BASELINE
  in Step 3)：把 `EXPECTED_SESSION_START_HOOKS[1]` 的命令字符串从内联 `cat` 改为
  `node ... inject-evolved-rules.mjs ...`，UserPromptSubmit baseline 不变（hooks.json
  这一份仍是 inject-plan-context.mjs + cmux-mirror 两段，settings.json 不在该测试
  覆盖范围内）。
- **现有 `test/contract.hooks.test.ts`** (检查兼容性)：确认契约测试不依赖被删除/
  改写的 settings.json UserPromptSubmit 段或 SessionStart cat 字符串。

### Integration Tests

- **End-to-end Subagent Injection Drill**：在 `.forge/plans/` 放 5 个 ≥ 4KB plan
  文件、`.forge/knowledge/evolved-rules.md` 放 ≥ 8KB 内容，手工构造 stdin JSON
  `{"hook_event_name": "UserPromptSubmit", "agent_id": "spec-check", ...}`，
  逐个执行三份配置文件的 UserPromptSubmit + SessionStart hook 命令，断言每个
  命令 stdout 为空、退出码为 0。
- **End-to-end Main Agent Injection Drill**：相同 fixture，但 stdin 不含
  `agent_id`，断言 `inject-plan-context.mjs` 输出 ≤ 8192 字节、`inject-evolved-rules.mjs`
  输出 ≤ 4096 字节 + 截断标记、cmux-mirror sync 流程正常完成。
- **Forge Review Smoke Test**：在 dogfood 环境运行 `/forge review`，验证三个
  subagent 不再收到 `total_tokens: 0` 异常计数，且主 agent 收到完整结构化 Layer N
  报告。该步骤在 Step 3 完成后作为发版前 smoke。

## Migration / Rollout

修复采用三段式 rollout，每段独立合并、独立可回滚。

### Step 1: Router + Script Entry Short-Circuits（纯叠加，零行为变化）

**Scope**:
- 新增 `scripts/lib/hook-stdin-router.mjs`。
- 修改 `scripts/inject-plan-context.mjs` 入口加 router 短路。
- 修改 `scripts/cmux-mirror/sync-once.mjs` CLI 入口加 router 短路。
- 新增 `test/hook-stdin-router.test.ts` + `test/hook-stdin-router.property.test.ts`。
- 扩展 `test/inject-plan-context.test.ts` 覆盖 P1 / P2。
- 新增 `test/cmux-sync-once.subagent-skip.test.ts`。

**为什么独立**：此 PR 不删除任何现有 hook 命令、不改任何配置文件，仅在两个 .mjs
脚本入口插入 router 短路 — 主 agent 路径完全不变，subagent 路径开始受益（plan
注入与 cmux-sync 不再注入 subagent）。可以独立观察一段时间确认无回归。

**Verification commands**:

```
npx vitest run test/hook-stdin-router.test.ts \
                test/hook-stdin-router.property.test.ts \
                test/inject-plan-context.test.ts \
                test/cmux-sync-once.subagent-skip.test.ts
npx vitest run test/non-frozen-hook-preservation.property.test.ts
npx vitest run test/contract.hooks.test.ts
```

### Step 2: Settings.json Cleanup（删除重复源 + 套字节上限）

**Scope**:
- 删除 `.claude/settings.json` UserPromptSubmit head/tail 整段。
- 改写 `.claude/settings.json` SessionStart 第二段为
  `node ... inject-evolved-rules.mjs ...`。
- 新增 `scripts/inject-evolved-rules.mjs` + `test/inject-evolved-rules.test.ts`。
- 新增 `test/hooks-config-integrity.property.test.ts`（Property 4 防回归）。

**为什么独立**：此 PR 触及配置文件 + 一个新脚本，但不动 plugin.json / hooks.json
（它们仍保留旧 inline `cat`）。Step 1 已就绪的 router 让本步对 subagent 自然
fail-safe；主 agent 仅多走一次新脚本（输出在 4KB 以内 byte-equal 旧 cat 行为）。

**Verification commands**:

```
npx vitest run test/inject-evolved-rules.test.ts \
                test/hooks-config-integrity.property.test.ts
npx vitest run test/non-frozen-hook-preservation.property.test.ts
# (settings.json 不在 non-frozen-hook-preservation snapshot 范围内，无需更新该 baseline)
```

### Step 3: plugin.json + hooks.json SessionStart Migration

**Scope**:
- 改写 `.claude-plugin/plugin.json` SessionStart 第二段。
- 改写 `hooks/hooks.json` SessionStart 第二段。
- 更新 `test/non-frozen-hook-preservation.property.test.ts` 的
  `EXPECTED_SESSION_START_HOOKS[1]` baseline，反映新的 inject-evolved-rules.mjs
  命令字符串。
- 端到端 dogfood：跑一次 `/forge review`，确认三个 subagent 输出结构化 Layer N 报告。

**为什么独立**：此 PR 触及 plugin distribution 表面（plugin.json）与本地 hooks.json，
两份配置必须一起改以保持 SessionStart 字节上限的一致性。Step 1 + Step 2 完成后，
Step 3 是收尾 — 把内联 cat 全部消灭。

**Verification commands**:

```
npx vitest run test/non-frozen-hook-preservation.property.test.ts \
                test/hooks-config-integrity.property.test.ts \
                test/contract.hooks.test.ts
npx vitest run test/hook-stdin-router.test.ts \
                test/hook-stdin-router.property.test.ts \
                test/inject-plan-context.test.ts \
                test/inject-evolved-rules.test.ts \
                test/cmux-sync-once.subagent-skip.test.ts
# Smoke：手工运行 /forge review，确认 spec-check / quality-check / security-check
# 三个 subagent 收到完整 Layer N 结构化输出，total_tokens 非零。
```

### Rollback Strategy

- Step 1 回滚：仅删除 `scripts/lib/hook-stdin-router.mjs`、还原两个 .mjs 入口。
  零行为差异。
- Step 2 回滚：恢复 `.claude/settings.json` 两段，删除 `inject-evolved-rules.mjs`。
- Step 3 回滚：恢复 plugin.json + hooks.json 的 SessionStart 内联 cat，回退
  `non-frozen-hook-preservation` baseline 改动。

每步回滚都不影响其它步骤已经合并的产物（router / settings.json 删除等都是独立可逆
的原子改动）。

## Error Handling

| 错误场景 | 行为 | 验证位置 |
|---------|------|---------|
| stdin 管道关闭 / 完全无数据 | router 等待 500ms 超时后 → `callerKind: "unknown"` → `shouldSkipForSubagent: true` → 脚本 `process.exit(0)` 不注入 | `test/hook-stdin-router.test.ts` 场景 (c) |
| stdin 在 500ms 内仅给出半段 JSON（partial read） | 同上 fail-safe | 场景 (d) |
| stdin JSON 解析抛错（脏数据 / 二进制） | `try { JSON.parse } catch → "unknown"` → 短路 | 场景 (f) |
| stdin payload > 64KB（防御性上限触发） | router 截断后仍尝试解析；解析失败 → 短路；解析成功（极不可能）→ 按字段判定 | `test/hook-stdin-router.property.test.ts` |
| `agent_id` 字段为空字符串 | 等价于"主 agent"（按 Claude Code schema，subagent 必填非空 `agent_id`） | router unit test |
| `inject-evolved-rules.mjs` 找不到 `.forge/knowledge/evolved-rules.md` | `try { statSync } catch → process.exit(0)` 不输出（与现有内联 `if [ -f ... ]` 等价） | `test/inject-evolved-rules.test.ts` 场景 1 |
| hook 配置文件被外部修改成无效 JSON | hook dispatcher（外部）报错；脚本本身不受影响。当前各 hook 命令尾部的 `2>/dev/null \|\| true` fail-open 语义保留不变 | `test/contract.hooks.test.ts` |
| `inject-plan-context.mjs` 抛错（fs 异常等） | 现有顶层 `try { ... } catch { process.exit(0) }` 保留，fail-open 语义不动 | `test/inject-plan-context.test.ts` |
| `cmux-mirror/sync-once.mjs` 任一步抛错 | 现有 `.catch(() => process.exit(0))` 保留 | `test/cmux-sync-once.subagent-skip.test.ts` 主 agent 路径 |
| router 模块 import 失败（罕见，包损坏） | hook 命令尾部 `\|\| true` 兜底，hook 整体不阻塞会话；同时 `2>/dev/null` 吞掉错误日志 | hook dispatcher 行为，无需脚本侧处理 |

**Fail-safe principle**：在任何不确定情况下（解析失败、超时、配置不完整、
依赖损坏），系统的默认决策始终是"不注入"。这与 subagent 路径合并，最坏情况是主
agent 偶尔少一次注入；绝不会出现"在不确定状态下把完整载荷注入到 subagent"的退化路径。
