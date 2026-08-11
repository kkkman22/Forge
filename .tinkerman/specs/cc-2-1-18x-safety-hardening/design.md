---
feature: cc-2-1-18x-safety-hardening
layout: design
created: 2026-06-23
tier: standard
---

# Design — Claude Code 2.1.18x 安全护栏借鉴

## Overview

四个独立但同源的防护层增强,都落在 Forge 的 src 纯函数层 + SKILL 编排层:

- **R1** 新增 `src/destructive-guard.ts`(纯函数)+ 挂到现有 `src/check-sandbox.ts` PreToolUse 链。
- **R2** 新增 `src/spawn-policy.ts`(纯函数)+ 在 `src/forge/agents-dispatcher.ts` / `src/forge-dispatcher.ts` 的 dispatch 前置一关。
- **R3** 扩展 `src/spawn-policy.ts` 的 depth 校验 + `src/config-store.ts` 增字段。
- **R4** 纯 SKILL 层改动,在 `skills/forge/lib/learn/` 增 near-limit 检测输出。

四者共享一个设计原则:**所有 guard 是纯函数,失败 fail-open(可用性优先),destructive guard 例外(fail-secure,保护不可逆)**。这与 Forge 既有 `sandbox-policy.ts`、`review_model_tier_map` 的 fail-open 哲学一致。

## Architecture

```
                    ┌─────────────────────────────────────┐
  PreToolUse hook   │  src/check-sandbox.ts               │
  (Bash/Write)      │   ├─ checkCommandPolicy  (现有)      │
       │            │   ├─ checkFilesystemPolicy(现有)     │
       │            │   └─ checkDestructiveGuard ★ R1 新增 │
       ▼            └──────────────┬──────────────────────┘
   [deny → 阻断工具]                │
                                    │ (agent-initiated rollback 走 bypass)
   subagent dispatch                │
       │            ┌───────────────▼────────────────────┐
       └───────────►│  src/forge-dispatcher.ts           │
                    │  src/forge/agents-dispatcher.ts    │
                    │   └─ checkSpawnPolicy ★ R2/R3 新增  │
                    │       ├─ forbidden 合并              │
                    │       └─ depth 校验                  │
                    └──────────────┬──────────────────────┘
                                   │
   /forge learn                    │
       │            ┌──────────────▼─────────────────────┐
       └───────────►│  skills/forge/lib/learn/            │
                    │   └─ checkKnowledgeNearLimit ★ R4   │
                    └─────────────────────────────────────┘
```

新增三个纯函数模块,不改动既有模块的对外契约,只在既有的 hook / dispatch / learn 入口"加挂"。

## Component Interfaces

### R1: `src/destructive-guard.ts` (v3 — 白名单 + fail-closed)

v1(空白 split)漏引号/env/路径/bash -c;v2(规范化引擎)修了这些但规则用精确等值,被 shell 元字符(`;` `&` `|` `$()`)逃逸;且 design 的"解析失败→allow"对不可逆操作方向错误。**v3 放弃全识别,改白名单 + fail-closed**:只对"简单裸命令"精确匹配破坏性规则,任何含元字符/嵌入引号/wrapper 的复杂形态一律 deny。

```typescript
/** shell 元字符集:出现任一即触发 fail-closed(复杂形态 → deny)。 */
export const SHELL_METACHARS: ReadonlySet<string>;  // {";","&","|","`","$","(",")",">","<","\\","&&","||"}

/**
 * 判定一条 shell 命令是否含 shell 元字符 / 嵌入引号 / wrapper。
 * 纯函数,无 I/O。true = 复杂形态(guard 应 fail-closed)。
 */
export function isComplexCommand(command: string): boolean;

/**
 * 最小归一化(仅 env 前缀 + 绝对路径 basename)。
 * 不展开 bash -c、不处理嵌入引号——遇到这些由 isComplexCommand 兜住 fail-closed。
 */
export function normalizeCommand(command: string): string[];

/** 破坏性命令判定结果。 */
export interface DestructiveDecision {
  allowed: boolean;
  matchedRule?: string;
  reason: string;
  verdict: "deny" | "allow-bypass" | "allow";
  bypassReason?: "rollback-active" | "user-single-allow" | "guard-disabled";
}

/** 判定上下文。bypass 凭 nonce 文件(装配层读文件 + HMAC,纯判定不读文件)。 */
export interface DestructiveContext {
  rollbackActive: boolean;
  userSingleAllow: boolean;
  guardEnabled: boolean;
}

/**
 * 判定一条 shell 命令(原始字符串)是否应被阻断。纯函数,无 I/O。
 * 判定顺序:
 *   1. guardEnabled=false → allow (guard-disabled)
 *   2. isComplexCommand → deny (fail-closed,提示用裸命令或签 nonce)
 *   3. normalizeCommand → 命中规则 → 看 bypass;未命中 → allow
 */
 * 内部先 normalizeCommand 再匹配规则。
 */
export function checkDestructive(
  command: string,
  ctx: DestructiveContext,
): DestructiveDecision;

/** 规则 registry(匹配在归一化后的 token 上)。 */
export const DESTRUCTIVE_RULES: ReadonlyArray<{
  id: string;
  matches: (normalized: readonly string[]) => boolean;
  category: "git" | "infra";
}>;
```

**nonce 装配层**(`src/destructive-nonce.ts`,v3 加固):
```typescript
/**
 * HMAC secret:不来自仓库可读/可改属性(config mtime——失控 agent 能 stat 重算)。
 * v3:来自一次性随机生成的 .tinkerman/.guard-secret(0600,首次自动生成,后续不变);
 * FORGE_DESTRUCTIVE_SECRET env 作显式覆盖。
 */
export function getGuardSecret(projectRoot: string): string;

/** 生成一次性 nonce + HMAC,写入受信文件。由回滚/授权 skill 在操作前调用。 */
export function issueRollbackNonce(projectRoot: string): string;  // 写 .tinkerman/.rollback-nonce
export function issueAllowNonce(projectRoot: string): string;     // 写 .tinkerman/.allow-destructive-nonce

/**
 * 校验 nonce 文件 + HMAC,返回装配好的 DestructiveContext。
 * v3 加固(AC3a):
 *   - 原子即焚:用 rename(nonce → .consumed/<nonce>) 而非 unlinkSync+catch;
 *     rename 失败(已被并发消费/权限)→ return false(视为未消费,拒绝本次 bypass)。
 *   - 并发安全:rename 是原子操作,天然防 TOCTOU 双消费。
 */
export function contextFromNonce(
  env: NodeJS.ProcessEnv,
  projectRoot: string,
  configContent: string,
): DestructiveContext;
```

**挂载点与组合规则**: `src/check-sandbox.ts` Bash 分支末尾调 `checkDestructive(command, contextFromNonce(process.env, projectRoot, configContent))`。短路 deny。**check-sandbox 入口新增读 config.md**(经共享 `extractScalarField` helper,从 frontmatter.ts 提取)以传导 `destructive_guard: off`。

**loop/事务回滚 skill 接入**: `skills/forge/lib/loop/instructions.md` 回滚步骤改为:执行 `git reset --hard` 前 `issueRollbackNonce(projectRoot)`,回滚后 nonce 自然即焚(guard 放行后删除)。

### R2/R3: `src/spawn-policy.ts` (v2 修订接入点)

```typescript
/** spawn 前校验结果。 */
export interface SpawnPolicyDecision {
  allowed: boolean;
  /** "blocked" | "max-depth-exceeded" | "ok" */
  verdict: "blocked" | "max-depth-exceeded" | "ok";
  /** blocked 时命中的规则,如 "Agent-spawn-forbidden"。 */
  rule?: string;
  /** blocked 时命中的链路层级(agent name),便于诊断。 */
  blockedAt?: string;
  reason: string;
}

/**
 * 链路:从 leader( depth 0 )到当前父级的每一级 disallowedTools。
 * 例如 review 主 agent dispatch spec-check:[{ agent: "review-main", disallowed: [...] }, ...]
 */
export interface LineageEntry {
  agent: string;
  /** 该层级的 disallowedTools 工具名集合(来自 frontmatter)。 */
  disallowed: ReadonlySet<string>;
}

export interface SpawnContext {
  /** 即将 spawn 的 subagent identity(对应 agents/*.md 文件名)。 */
  subagentIdentity: string;
  /** 从 leader 到当前父级的链路。 */
  lineage: LineageEntry[];
  /** 当前链路深度,leader=0,直接子=1。 */
  depth: number;
  /** 来自 config.md 的深度上限。 */
  maxDepth: number;
}

/**
 * 校验是否允许 spawn 一个 subagent。纯函数,无 I/O。
 *
 * 校验项(顺序):
 *  1. depth >= maxDepth → max-depth-exceeded(P1-5 边界:depth=maxDepth 时子将超限,拒绝)
 *  2. lineage 任一级 disallowed 含 spawn 工具名集合中任一 → blocked (spawn-tool-forbidden)
 *  3. 其余 → ok
 *
 * fail-open:任何内部异常由调用方捕获后放行(不在此函数内)。
 */
export function checkSpawnPolicy(ctx: SpawnContext): SpawnPolicyDecision;

/** CC 已知 spawn 工具名集合(可随 CC 演进维护)。lineage disallowed 含任一即禁 spawn。 */
export const SPAWN_TOOL_NAMES: ReadonlySet<string>;  // {"Agent","Task","dispatch_agent",...}
```

**挂载点(P0-4 接入决议)**: review/decide 经 SDK Agent 工具自然语言 spawn,不经过 `src/forge-dispatcher.ts` 的 `dispatch()`。故 spawn-policy 定性为**`dispatch()` 函数契约**:经 `dispatch()` 的 spawn 才受保护。`dispatch()` 调用处用 try/catch 包裹实现 fail-open(NFR-2):抛错 → 记 `tool-health.md` 的 `spawn-policy-error` → 放行。

**lineage 可信源(P1-7)**: lineage 从 leader/父 agent 的 frontmatter `disallowedTools` 经解析得到(非 caller 自报);caller 缺失 lineage 时 fail-secure(block)。需在真实 dispatch caller 接入处从 frontmatter 解析 lineage(若接入 SDK 路径则需额外钩子,超出本 spec 范围,记为 follow-up)。

**R3 tool-health(P1-2)**: depth 超限拒绝时,`dispatch()` SHALL 调 `appendToolHealthRecord({ event: "max-depth-exceeded" })`。

**与运行时 PreToolUse 的职责边界**: spawn-policy 只判"能否 spawn";subagent 启动后它实际调哪些工具,由各 agent 自己的 `disallowedTools` frontmatter + 运行时 PreToolUse(check-sandbox / frozen-zone-hook)负责。本模块不重复运行时职责。

### R4: SKILL 层函数(嵌入 learn)

R4 不新增 src 模块——它在 `skills/forge/lib/learn/` 的实现里调用一个已有的计数能力(扫 `.tinkerman/knowledge/solutions/` 文件数),与 `knowledge_limit` 比较后输出 `[knowledge-near-limit]` 提醒。为可测,把判定抽成纯函数放 `src/knowledge-quota.ts`:

```typescript
/** knowledge 逼近上限判定。纯函数。 */
export interface KnowledgeQuotaInput {
  currentCount: number;
  limit: number;          // config.md knowledge_limit
  thresholdRatio?: number; // 默认 0.9
}

export interface KnowledgeQuotaDecision {
  nearLimit: boolean;
  threshold: number;      // ceil(limit * ratio)
  message?: string;       // nearLimit 时的提醒文案模板
}

export function checkKnowledgeNearLimit(
  input: KnowledgeQuotaInput,
): KnowledgeQuotaDecision;
```

## Data Model

v2 新增受信 nonce 文件(单次有效,即焚):

- **`.tinkerman/.rollback-nonce`** — loop/事务回滚 skill 执行 `git reset --hard` 前由 `issueRollbackNonce()` 写入(内容:nonce 值 + HMAC)。guard 的 `contextFromNonce` 校验文件存在 + HMAC 合法后置 `rollbackActive=true`,**校验后删除文件**(即焚,确保单次有效且不可重放)。
- **`.tinkerman/.allow-destructive-nonce`** — 用户单次放行,同理即焚。
- **环境变量(仅传 nonce 值,非可信判定源)**:
  - `FORGE_ROLLBACK_NONCE=<nonce>` — 传 nonce 值供 guard 与文件比对。
  - guard **不**仅凭 env 布尔放行(P0-3 修复);env nonce 必须与文件 nonce + HMAC 三者匹配。
- `.tinkerman/config.md` — frontmatter 字段(check-sandbox 入口新增读取):
  - `destructive_guard: on` (默认 on;持久 off 会被 forge-doctor 标 P1 告警)
  - `max_subagent_depth: 5` (默认 5,范围 1-10)
- `agents/*.md` frontmatter 的 `disallowedTools` — 不改动,仅由 spawn-policy 读取其中是否含 `Agent`。
- `.tinkerman/knowledge/tool-health.md` — 追加 spawn-policy-error / max-depth-exceeded 事件类型。

## Error Handling

| 错误场景 | 处理 |
|---------|------|
| R1: env 标记缺失/未置位 | 视为未授权 → deny(fail-secure,保护不可逆操作) |
| R1: config `destructive_guard` 解析失败 | 默认 on(fail-secure) |
| R1: 命令 token 解析失败 | 视为不可识别 → allow(交回既有 sandbox 判定,destructive guard 不越权拦未知命令) |
| R2: `checkSpawnPolicy` 抛错 | fail-open:记 tool-health 后放行(可用性优先,不阻断 review/decide) |
| R3: `max_subagent_depth` 字段缺失 | 用默认 5 |
| R4: solutions 目录不存在 | `currentCount=0`,不触发提醒 |
| R4: `knowledge_limit` 解析失败 | 用默认 20 |

**fail-secure vs fail-open 取舍**: R1 保护的是**不可逆**操作(reset --hard 丢工作),所以 guard 自身故障时偏向 deny;但 R1 的 bypass 走 env token 而非文件读取,消除了"events.ndjson 读失败 → Forge loop 无法回滚 → 护栏 DoS 自己"的风险。R2/R4 保护的是"编排 hygiene",故障时偏向 allow 以保可用性。R3 深度上限虽属编排 hygiene,但其 check 与 R2 共享同一个 try/catch fail-open 容器——深度超限会记 tool-health 但不硬阻断(避免成为 review 的可用性瓶颈)。这个区分写在 NFR-2。

## Testing Strategy

- **R1**: property-based test(`test/destructive-guard.property.test.ts`)对 `DESTRUCTIVE_RULES` 每条规则 × {有 intent / 无 intent / agent-rollback / amend 本任务 / amend 他人} 笛卡尔积生成用例。fail-secure 场景专项覆盖。
- **R2**: 表驱动测试,覆盖 inherited ∩ declared 的并集语义 + 无声明 fallback + fail-open 异常路径。
- **R3**: depth 边界(depth=max-1 allow / depth=max deny)+ 并发链路 depth 隔离(property test,`fast-check` 两个独立链路不串扰)。
- **R4**: 表驱动(当前数 × limit × ratio)。
- **回归**: 现有 `test/sandbox-policy.*.test.ts`、`test/contract/skill-disallowed-tools.test.ts` 全绿。
- **契约**: 新增 AC 的 Verify-By 标注遵循 ADR-0006 分层白名单。

## Rollout

1. 先落 src 纯函数 + 单测(R1/R2/R3/R4 各自可独立 GREEN)。
2. 挂载到 check-sandbox / dispatcher(接线层,薄)。
3. 更新 `forge-doctor` 展示三个新 guard 的状态(R1 关闭告警、R2 fail-open 计数、R4 near-limit 当前值)。
4. 文档:更新 `docs/claude-code-compatibility.md` 增 2.1.18x 借鉴条目。

## Reversibility

**回滚清单**:
- [ ] 删除 `src/destructive-guard.ts` + `src/spawn-policy.ts` + `src/knowledge-quota.ts`
- [ ] 还原 `src/check-sandbox.ts` 对 `checkDestructive` 的调用
- [ ] 还原 `src/forge-dispatcher.ts` / `src/forge/agents-dispatcher.ts` 对 `checkSpawnPolicy` 的调用
- [ ] 还原 loop/事务回滚 skill 对 `FORGE_ROLLBACK_IN_PROGRESS` 的设置点
- [ ] 还原 `src/config-store.ts` 的 `destructive_guard` / `max_subagent_depth` 解析
- [ ] 还原 learn skill 对 `checkKnowledgeNearLimit` 的调用
- [ ] 删除新增测试文件
- [ ] 还原 docs 更新

**挂载点清单**(改动集中、可逆):
- `src/check-sandbox.ts`(R1 接线,1 处,短路 deny)
- `src/forge-dispatcher.ts` + `src/forge/agents-dispatcher.ts`(R2/R3 接线,各 1 处)
- `skills/forge/lib/loop/instructions.md` 及事务回滚实现(R1 的 `FORGE_ROLLBACK_IN_PROGRESS` 设置点)
- `src/config-store.ts`(2 个字段解析)
- `skills/forge/lib/learn/instructions.md`(R4 输出)
- `src/forge-doctor.*`(状态展示)

**不动**: 所有既有模块的对外契约、frozen zone 分区、execution-mode 枚举(不新增 ConfirmationPoint)、git 事务回滚逻辑本身、三击检测、运行时 PreToolUse 对工具调用的判定。

## Open Questions(已决议)

- **OQ-1 ✅ 已决议**:R1 的 bypass 通道用 **env token**(`FORGE_ROLLBACK_IN_PROGRESS` 由回滚 skill 设置 + `FORGE_ALLOW_DESTRUCTIVE` 用户单次放行),**不**解析自然语言 intent,也**不**依赖 events.ndjson 读取(避免单点故障 DoS Forge loop 回滚)。依据:check-sandbox hook 进程继承父 env,O(1) 读取。
- **OQ-2 ✅ 已决议**:R3 的 depth 用 **dispatcher 显式参数透传**,不用 env/全局可变状态(保证并发链路不串扰,与 NFR-1 并发约束一致)。
- **OQ-3 ✅ 已决议**:首版只覆盖 changelog 点名的 git(reset --hard / clean -fd / stash drop / checkout -- .)+ infra destroy,`rm -rf` / `chmod -R` 等非 git 破坏性命令留 follow-up(避免范围 creep,Out of Scope 已声明)。
