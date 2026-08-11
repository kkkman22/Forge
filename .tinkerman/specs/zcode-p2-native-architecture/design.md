---
status: draft
feature: zcode-p2-native-architecture
layout: design
created: 2026-07-31
tier: full
supersedes:
  - "zcode-p1-base-integration (non-goals only: '不建 shim' / '不动治理逻辑')"
---

# Forge × ZCode P2 原生架构 — 技术设计

## 设计总览

P2 六项分三类 task：

| 项 | 类型 | 改什么 | 双平台影响 |
|---|---|---|---|
| R1 HostAdapter 抽象 | **新增型** | 内核新增 host 抽象层 + Claude/Zcode 实现 | Claude 侧行为不变（实现读原 env） |
| R2 governance 派生 | **新增型** | 新增 capability→governance 派生函数 | Claude 能力下输出 P1 后基线值 |
| R3 探测 + 注入 | **新增型** | 新增运行期探测 + 单例注入 | 失败安全返回 Claude |
| R4 耦合收敛 | **改动型** | path-resolve/session-id/compatibility 改经 adapter | Claude env 下 byte-equal |
| R5 Zcode 产物 | **新增型** | `.zcode-plugin/` + 顶层 marketplace.json | Claude manifest 不变 |
| R6 透明回归 | **横切回归** | 聚合 R1-R5 + V13 自适应 | 守护 Claude 侧 + 自适应证明 |

核心设计原则：**新增型不侵入 Claude 路径；改动型在 Claude env 下 byte-equal；所有治理派生走模型能力非平台名。**

> 本 Spec 禁止类名/函数名/具体文件路径作为 AC（detectSpecLeak）。下文出现的标识符是**实现建议**，非验收条件；数据契约字段名（`contextWindow` 等）允许。

---

## R1: HostAdapter 抽象（结构性属性 + 模型能力）

### 分层

```
进程启动 → 探测宿主(detectHost) → 注入 Adapter 单例
                                        ↓
        ┌───────────────────────────────┴───────────────────────────────┐
        │  结构性属性（平台驱动）              模型能力（capability）       │
        │  platform / paths / sessionId       contextWindow / maxOutput   │
        │  hostVersion / hookEvents           supportsLongHorizon         │
        │  subagentTier / hookInputReader     supportsReasoningEffort     │
        │                                     supportsThinkingMode        │
        │                                     contextCacheEfficiency      │
        └───────────────────────────────┬───────────────────────────────┘
                                        ↓
                          governance() = deriveGovernance(modelCapabilities, cfg)
```

### 接口数据契约（字段名固定，方法名实现自定）

```ts
// 结构性属性
type Platform = "claude-code" | "zcode";
type SubagentTier = "workspace" | "global-only";
type HookEvent = "SessionStart" | "UserPromptSubmit" | "PreToolUse"
  | "PermissionRequest" | "PostToolUse" | "PostToolUseFailure" | "Stop"
  | "PreCompact" | "PostCompact" | "SubagentStop" | "Task*" | "Worktree*"
  | "TeammateIdle";

interface HostPaths {
  pluginRoot: string | null;      // CLAUDE/ZCODE_PLUGIN_ROOT
  pluginData: string | null;      // CLAUDE/ZCODE_PLUGIN_DATA
  projectDir: string | null;      // CLAUDE/ZCODE_PROJECT_DIR / cwd fallback
}

// 模型能力（数据契约，数值在两实现中固定）
interface ModelCapabilities {
  contextWindow: number;           // Claude=200000, GLM-5.2=1000000
  maxOutput: number;               // Claude=64000, GLM-5.2=128000
  supportsLongHorizon: boolean;    // Claude=false, GLM-5.2=true
  supportsReasoningEffort: boolean;// Claude=false, GLM-5.2=true
  supportsThinkingMode: boolean;   // Claude=false, GLM-5.2=true
  contextCacheEfficiency: number;  // 0-1, Claude=0.5, GLM-5.2=0.85
}

interface HostVersion { name: string; version: string | null; }

interface HostAdapter {
  readonly platform: Platform;
  paths(): HostPaths;
  sessionId(): string;                      // 保留 P1 优先级链语义
  hostVersion(): HostVersion;
  hookEvents(): ReadonlySet<HookEvent>;
  subagentTier(): SubagentTier;
  modelCapabilities(): ModelCapabilities;
  governance(): GovernancePolicy;           // 见 R2
}
```

### 两实现的固定数据契约

| 字段 | ClaudeAdapter | ZcodeAdapter |
|------|---------------|--------------|
| `platform` | `"claude-code"` | `"zcode"` |
| `paths().pluginRoot` | `CLAUDE_PLUGIN_ROOT` | `ZCODE_PLUGIN_ROOT`（兼容回退 `CLAUDE_PLUGIN_ROOT`） |
| `paths().pluginData` | `CLAUDE_PLUGIN_DATA` | `ZCODE_PLUGIN_DATA`（兼容回退 `CLAUDE_PLUGIN_DATA`） |
| `paths().projectDir` | `CLAUDE_PROJECT_DIR`/cwd | `ZCODE_PROJECT_DIR`/cwd |
| `sessionId()` | hook→`CLAUDE_CODE_SESSION_ID`→`CLAUDE_SESSION_ID`→pid | 同链 + 优先 `ZCODE_SESSION_ID` |
| `hostVersion()` | CC semver（读 `claude --version` 或 env） | Zcode 版本（无 CC 门禁） |
| `hookEvents()` | 全集（含 PreCompact/SubagentStop/Task*/Worktree*/TeammateIdle） | 子集（七事件：SessionStart/UserPromptSubmit/PreToolUse/PermissionRequest/PostToolUse/PostToolUseFailure/Stop） |
| `subagentTier()` | workspace | global-only |
| `modelCapabilities().contextWindow` | 200000 | 1000000 |
| `modelCapabilities().maxOutput` | 64000 | 128000 |
| `modelCapabilities().supportsLongHorizon` | false | true |
| `modelCapabilities().supportsReasoningEffort` | false | true |
| `modelCapabilities().supportsThinkingMode` | false | true |
| `modelCapabilities().contextCacheEfficiency` | 0.5 | 0.85 |

> 路径变量缺失时返回 `null`（非空串），由消费方决定 fallback（如 path-resolve 回退 cwd，plugin-data-path 回退 `~/.claude/plugins/data/forge/`）。这与 P1 后行为一致。

### sessionId 优先级链（继承 P1）

保留 `src/session-id.ts` 现有语义：hook stdin → Claude env 链 → pid fallback + 一致性校验。Adapter 的 `sessionId()` 内部委托现有 `resolveSessionId`，ZcodeAdapter 在链首增加 `ZCODE_SESSION_ID` 探测。**不重写一致性逻辑**，只换数据入口。

### hostVersion 与 CC 门禁旁路

`src/compatibility.ts` 的 CC semver 硬门禁仅在 `platform==="claude-code"` 时施加；Zcode 宿主下 `hostVersion()` 返回 Zcode 版本，消费方（如 doctor/status）展示但不门禁。具体：compatibility 的 `checkVersion` 调用方先查 `adapter.platform()`，Zcode 跳过 fail 判定（保留 warn 信息性提示）。

---

## R2: GovernancePolicy capability-driven 派生（核心创新）

### 派生规则（字段名固定，数值契约见 AC）

```ts
function deriveGovernance(cap, cfg): GovernancePolicy {
  const w = cap.contextWindow;
  return {
    contextBudget:   cfg.contextBudgetOverride ?? Math.floor(w * 0.8),
    sliceThreshold:  Math.floor(w * 0.8 * 0.9),
    workerIsolation: cap.supportsLongHorizon ? "optional" : "required",
    maxParallelAgents: cfg.maxParallelAgents ?? (w >= 500_000 ? 8 : 6),
    decideDispatchMode: w >= 500_000 ? "inline-lean" : "auto",
    reasoningEffort: cap.supportsReasoningEffort ? {
      decide: "max", spec: "max", plan: "high",
      build: "medium", review: "high", ship: "medium",
    } : undefined,
    // gate 阈值不在此派生（铁律边界）
  };
}
```

### 三场景契约快照（回归基线）

| 字段 | Claude(200K) | GLM-5.2(1M) | 未来 Claude 1M（V13 自适应） |
|------|--------------|-------------|------------------------------|
| contextBudget | 160000 | 800000 | **800000**（零代码改动） |
| sliceThreshold | 144000 | 720000 | **720000** |
| workerIsolation | required | optional | **optional** |
| maxParallelAgents | 6 | 8 | **8** |
| decideDispatchMode | auto | inline-lean | **inline-lean** |
| reasoningEffort | undefined | {decide:max,...} | **{decide:max,...}** |

> V13 是 capability-driven 优于配置开关的**决定性证据**：模拟未来 Claude 发 1M 模型（contextWindow=1000000, supportsLongHorizon=true），派生自动放宽，无需改任何代码。

### config override 语义

- `cfg.contextBudgetOverride`（来自 `.zcode-plugin` userConfig `context_budget_override`，0=自动）非零时覆盖派生默认。
- `cfg.maxParallelAgents`（来自 config.md `max_parallel_agents`）存在时覆盖派生默认。
- override 优先于能力派生，但**派生默认值仍是能力的函数**（非散落 if/else）。

### 铁律边界（不派生）

gate 阈值（`review_confidence_threshold` 等）、TDD、验证、三振、隔离评审、P0-P1 阻断、Knowledge —— 全部不进 `deriveGovernance`，由宪法 §5.6 锁定。

### 与现有 config-store 的关系

`src/config-store.ts` 已解析 `max_parallel_agents`/`context_budget` 等。设计：`deriveGovernance` 接收已解析的 `ConfigFields`（或其子集）作为 `cfg` 参数，**不重写 config 解析**，只在其上叠加能力派生层。`context_budget_override` 是新增字段（userConfig 引入），config-store 解析时若缺失则视为 0（自动）。

---

## R3: 平台探测与失败安全（运行期 shim）

### 探测信号（与 P1 `zcode-platform.mjs` 一致）

```ts
const ZCODE_SIGNALS = [
  "ZCODE_PLUGIN_ROOT", "ZCODE_PROJECT_DIR", "ZCODE_SESSION_ID", "ZCODE_PLUGIN_DATA",
];
function detectPlatform(): Platform {
  const isZcode = ZCODE_SIGNALS.some(s => isNonEmpty(process.env[s]));
  return isZcode ? "zcode" : "claude-code";  // 失败安全：无信号→Claude
}
```

**信号清单必须与 `scripts/lib/zcode-platform.mjs` 的 `ZCODE_ENV_SIGNALS` 逐字一致**，否则 HostAdapter 与 P1 fallback 判定会漂移。实现时**从同一常量源导出**（或 HostAdapter 导出常量供 mjs import），消除重复。

### 单例注入

```ts
let _instance: HostAdapter | null = null;
function getHostAdapter(): HostAdapter {
  if (_instance) return _instance;
  _instance = detectPlatform() === "zcode" ? new ZcodeAdapter() : new ClaudeAdapter();
  return _instance;
}
```

进程内多次调用返回同一实例（探测开销摊销到一次，<1ms）。测试用 `resetHostAdapter()` 重置单例（仅 test 导出）。

### 与 P1 fallback 的关系

P1 的 `zcode-platform.mjs` `isZCodeRuntime()` 是 HostAdapter 探测的**前身**。本 Spec 不删它——hook 输出裁剪仍由它服务（mjs 侧，无 TS 编译）。HostAdapter（TS 侧）服务内核模块。两者信号一致，判定不漂移。若 HostAdapter 探测异常（理论上不会，因同信号），hook 侧仍走 P1 路径。

---

## R4: CLAUDE_* 耦合收敛

### 收敛目标（内核 TS 模块）

| 模块 | 现状 | 收敛动作 | Claude env 行为 |
|------|------|----------|----------------|
| `src/forge-dispatcher/path-resolve.ts` | `process.env.CLAUDE_PLUGIN_ROOT` | 改读 `adapter.paths().pluginRoot`（缺省回退 cwd，同现状） | byte-equal |
| `src/session-id.ts` | 直读 `CLAUDE_*_SESSION_ID` | Adapter 委托现有 `resolveSessionId`，数据入口换 | byte-equal |
| `src/compatibility.ts` | CC semver 硬门禁 | 调用方查 `adapter.platform()`，Zcode 跳过 fail | byte-equal（Claude 仍门禁） |
| `src/mcp/project-root.ts` | env + cwd 回退 | 改读 `adapter.paths().projectDir` | byte-equal |

### 不收敛（本 Spec 范围外）

- `hooks/hooks.json` 的 `${CLAUDE_PLUGIN_ROOT}` 静态模板展开（host 行为，P1 R4 验证）。
- `scripts/*.mjs` 的 `process.env.CLAUDE_PLUGIN_ROOT`（mjs 侧，保留 P1 `zcode-platform.mjs` 服务）。
- `scripts/init.sh` 的 bootstrap env 注入（后续 Spec）。
- 168 处字面量中的其余（静态文本/模板）。

### 收敛的 byte-equal 保证

Claude env 下：`adapter.paths().pluginRoot` 返回 `CLAUDE_PLUGIN_ROOT` 原值 → path-resolve 结果与现状一致；`sessionId()` 委托原 `resolveSessionId` → 结果一致；compatibility 在 Claude 平台仍施加门禁 → 一致。回归测试录 P1 后基线快照，每次比对。

---

## R5: Zcode 插件产物

### `.zcode-plugin/plugin.json`

字段对齐 `docs/zcode-dual-platform-adaptation.md` §4.2：name/version/description（双平台+GLM-5.2）/keywords/commands/skills/agents/hooks/mcpServers/userConfig（max_parallel_agents/safety_level/context_budget_override）。**共享** commands/skills/agents/hooks/.mcp 与 Claude manifest 同一路径。

### 顶层 `marketplace.json`

对齐 §4.3：顶层 name/description/pluginRoot/plugins[]，forge 条目 source 指向 `kkkman22/Forge`。

### 与 Claude manifest 隔离

`.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` 内容**不变**（diff 为空）。两套 manifest 独立，共享源目录（commands/skills/agents 是相对路径，天然共享）。

---

## R6: 双平台透明回归 + V13 自适应

### 聚合回归入口

复用 `npm run check`（vitest 全量）+ P1 的 `node scripts/zcode-p1-verify.mjs`。新增测试文件：

- `test/host-adapter.test.ts` —— R1 接口契约 + 两实现数据。
- `test/governance-derived.test.ts` —— R2 三场景契约快照 + config override。
- `test/capability-adaptation.test.ts` —— R6.3 V13 自适应（未来 Claude 1M）。
- `test/host-detect.test.ts` —— R3 探测失败安全 + 单例。

### Claude 透明性保证

- 探测：Claude env → ClaudeAdapter（失败安全）。
- 派生：Claude 能力 → P1 后基线值（160000/required/6/auto/无 reasoningEffort）。
- 路径/会话/版本：Claude env → byte-equal。
- init 产物：除 `.zcode/` 外 byte-equal（继承 P1 R6）。

### V13 决定性证据

`capability-adaptation.test.ts` 构造一个"未来 Claude 1M 模型"能力对象（contextWindow=1000000, supportsLongHorizon=true, supportsReasoningEffort=true），调 `deriveGovernance`，断言输出与 GLM-5.2 场景一致（800000/optional/inline-lean/含 reasoningEffort）。**这证明 capability-driven 对未来模型零代码改动自适应**——配置开关方案（A）与 Strategy 方案（B）做不到。

---

## 风险与应对

| 风险 | 等级 | 应对 |
|------|------|------|
| Adapter 探测与 P1 mjs 信号漂移 | 中 | 信号常量同源导出（TS 导出，mjs import 或手动同步+测试断言一致） |
| capability 数值不准（模型实际窗口<声明） | 中 | 派生保守（0.8 系数）+ config override 兜底 |
| 收敛引入 Claude 侧回归 | 中 | 每模块收敛前录 P1 后基线快照，byte-equal 断言守护 |
| Zcode 不注入 `CLAUDE_*` 兼容变量 | 中 | 失败安全→ClaudeAdapter；ZcodeAdapter 优先读 `ZCODE_*` |
| 单例在测试间污染 | 低 | 导出 reset 函数（仅 test），setupFiles 已有 env-isolation |
| supersedes P1 non-goals 需批准 | 中 | Spec frontmatter 显式声明；走 §5 协议；P1 代码保留 fallback |

## 非目标（重申）

- 不改 iron laws、不改 hooks.json 静态模板、不改 agent body、不改 worker 隔离实现、不全覆盖 168 处字面量、不改 P1 已落地三项验证、不做完整 compact 补偿。
