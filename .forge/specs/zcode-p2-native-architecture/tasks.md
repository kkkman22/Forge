---
status: draft
feature: zcode-p2-native-architecture
layout: tasks
created: 2026-07-31
tier: full
supersedes:
  - "zcode-p1-base-integration (non-goals only: '不建 shim' / '不动治理逻辑')"
---

# Forge × ZCode P2 原生架构 — 任务拆解

## 任务总览

| Task | 类型 | 对应 Req | TDD | 依赖 |
|---|---|---|---|---|
| T1 ModelCapabilities + GovernancePolicy 类型与契约常量 | 新增型 | R1/R2 | 是 | - |
| T2 HostAdapter 接口 + Claude 实现 | 新增型 | R1 | 是 | T1 |
| T3 HostAdapter Zcode 实现 | 新增型 | R1 | 是 | T1/T2 |
| T4 capability→governance 派生函数 | 新增型 | R2 | 是 | T1 |
| T5 探测函数 + 失败安全 + 单例注入 | 新增型 | R3 | 是 | T2/T3 |
| T6 path-resolve 收敛到 adapter | 改动型 | R4 | 是 | T5 |
| T7 session-id 收敛到 adapter | 改动型 | R4 | 是 | T5 |
| T8 compatibility Zcode 旁路 | 改动型 | R4 | 是 | T5 |
| T9 `.zcode-plugin/plugin.json` | 新增型 | R5 | 是 | - |
| T10 顶层 `marketplace.json` | 新增型 | R5 | 是 | T9 |
| T11 capability-adaptation（V13）回归 | 验证型 | R6 | 是 | T4 |
| T12 聚合透明回归 + P1 继承 | 横切 | R6 | 是 | 全部 |

每个 task 独立 build → review → test，按 TDD（RED→GREEN→REFACTOR）推进。

---

## T1: ModelCapabilities + GovernancePolicy 类型与契约常量

**目标**：定义模型能力与治理策略的 TS 类型，以及 Claude/GLM-5.2 两份能力常量（数据契约）。

**TDD**：
1. RED：写测试——断言 `CLAUDE_CAPABILITIES.contextWindow===200000`、`GLM52_CAPABILITIES.contextWindow===1000000`、`supportsLongHorizon` 两值、`maxOutput` 两值；断言 GovernancePolicy 类型字段齐全（contextBudget/sliceThreshold/workerIsolation/maxParallelAgents/decideDispatchMode/reasoningEffort）。
2. GREEN：新增类型文件，导出类型 + 两份常量。
3. REFACTOR：数值集中为常量，附 JSDoc 注明契约来源（design.md R1 表）。

**Done**：R1 AC3、R2 AC1 数据契约满足。

---

## T2: HostAdapter 接口 + Claude 实现

**目标**：定义 HostAdapter 接口，实现 ClaudeAdapter（结构性属性 + 模型能力）。

**TDD**：
1. RED：写测试——ClaudeAdapter 实例断言 `platform==="claude-code"`、`hookEvents()` 含 PreCompact/SubagentStop、`subagentTier()==="workspace"`、`modelCapabilities()` 返回 CLAUDE_CAPABILITIES；模拟 `CLAUDE_PLUGIN_ROOT` env 断言 `paths().pluginRoot` 正确；模拟 session env 断言 `sessionId()` 走优先级链。
2. GREEN：实现接口 + ClaudeAdapter，paths/sessionId 读 Claude env（委托现有 resolveSessionId）。
3. REFACTOR：env 读取集中为私有方法。

**Done**：R1 AC1/AC2/AC5/AC6/AC7（Claude 侧）满足。

---

## T3: HostAdapter Zcode 实现

**目标**：实现 ZcodeAdapter，优先读 ZCODE_* 信号，兼容回退 CLAUDE_*。

**TDD**：
1. RED：写测试——ZcodeAdapter 断言 `platform==="zcode"`、`hookEvents()` 是七事件子集（不含 PreCompact/SubagentStop）、`subagentTier()==="global-only"`、`modelCapabilities()` 返回 GLM52_CAPABILITIES；模拟 `ZCODE_PLUGIN_ROOT` 断言 paths 正确；无 ZCODE_* 但有 CLAUDE_* 断言兼容回退；`hostVersion()` 不施加 CC 门禁。
2. GREEN：实现 ZcodeAdapter，paths 优先 ZCODE_* 回退 CLAUDE_*，sessionId 链首加 ZCODE_SESSION_ID。
3. REFACTOR：与 ClaudeAdapter 共享 paths 解析逻辑（提取基类或工具函数）。

**Done**：R1 AC2/AC5/AC7（Zcode 侧）满足。

---

## T4: capability→governance 派生函数

**目标**：实现 `deriveGovernance(cap, cfg)`，按 design R2 规则派生，config override 生效。

**TDD**：
1. RED：写测试——三场景契约快照：(a) Claude(200K)→{budget:160000,slice:144000,worker:required,parallel:6,dispatch:auto,reasoning:undefined}；(b) GLM-5.2(1M)→{budget:800000,slice:720000,worker:optional,parallel:8,dispatch:inline-lean,reasoning:{...}}；(c) 未来 Claude 1M→同 (b)。config override：`cfg.contextBudgetOverride=999999`→budget=999999；`cfg.maxParallelAgents=3`→parallel=3。
2. GREEN：实现派生函数，按 design 规则。
3. REFACTOR：阈值常量（0.8/0.9/500000）集中，附 JSDoc 说明派生理由。

**Done**：R2 AC1-AC10 满足。

---

## T5: 探测函数 + 失败安全 + 单例注入

**目标**：实现 `detectPlatform()` + `getHostAdapter()` 单例 + reset（test）。

**TDD**：
1. RED：写测试——env 组合：(a) 仅 ZCODE_PLUGIN_ROOT→"zcode"；(b) 仅 CLAUDE_*→"claude-code"；(c) 全无→"claude-code"（失败安全）；(d) ZCODE_SESSION_ID 存在→"zcode"；单例：两次 getHostAdapter()===同一实例；reset 后重新探测。
2. GREEN：实现探测（信号清单与 P1 `zcode-platform.mjs` 的 ZCODE_ENV_SIGNALS 一致）+ 单例 + reset。
3. REFACTOR：信号常量导出，供 mjs 侧同步（或测试断言两边一致）。

**Done**：R3 AC1-AC7 满足。

---

## T6: path-resolve 收敛到 adapter

**目标**：`src/forge-dispatcher/path-resolve.ts` 改读 `adapter.paths().pluginRoot`，Claude env 下 byte-equal。

**TDD**：
1. RED：写测试——录 P1 后基线：模拟 CLAUDE_PLUGIN_ROOT 下 resolveLibPath 结果快照；收敛后同 env 断言结果 byte-equal；无 env 时回退 cwd（同现状）。
2. GREEN：path-resolve 的 pluginRoot 来源改为 adapter.paths().pluginRoot（缺省回退 cwd，逻辑不变）。
3. REFACTOR：无（仅换数据入口）。

**Done**：R4 AC1/AC4 满足（path-resolve 部分）。

---

## T7: session-id 收敛到 adapter

**目标**：session-id 数据入口经 adapter，保留优先级链与一致性语义。

**TDD**：
1. RED：写测试——录基线：各 env 组合下 resolveSessionId 结果；经 adapter.sessionId() 后断言一致；一致性校验（mismatch）行为不变。
2. GREEN：Adapter.sessionId() 内部委托 resolveSessionId（ClaudeAdapter 直接，ZcodeAdapter 链首加 ZCODE_SESSION_ID）；调用方改读 adapter。
3. REFACTOR：无。

**Done**：R4 AC2/AC4 满足（session-id 部分）。

---

## T8: compatibility Zcode 旁路

**目标**：CC semver 硬门禁在 Zcode 宿主下旁路（Claude 仍门禁）。

**TDD**：
1. RED：写测试——Claude 平台 + 低版本→fail（门禁生效）；Zcode 平台 + 任意版本→不 fail（旁路，可 warn）；Claude 平台 + 达标→pass。
2. GREEN：compatibility 的 fail 判定前查 adapter.platform()，Zcode 跳过 fail（保留信息性 warn）。
3. REFACTOR：旁路判定集中一处。

**Done**：R4 AC3/AC4 满足（compatibility 部分）。

---

## T9: `.zcode-plugin/plugin.json`

**目标**：产出 Zcode 插件 manifest，共享源目录，声明 userConfig 三项。

**TDD**：
1. RED：写测试——读 `.zcode-plugin/plugin.json`，断言合法 JSON；断言 commands/skills/agents/hooks/mcpServers 路径与 `.claude-plugin/plugin.json` 一致；断言 userConfig 含 max_parallel_agents/safety_level/context_budget_override；断言 description 含 "Zcode" 与 "GLM-5.2"。
2. GREEN：写 manifest（对齐 design R5 + docs §4.2）。
3. REFACTOR：与 Claude manifest 共享字段抽 common（若易漂移）。

**Done**：R5 AC1/AC2/AC4/AC5 满足。

---

## T10: 顶层 `marketplace.json`

**目标**：产出 Zcode marketplace，forge 条目指向仓库。

**TDD**：
1. RED：写测试——读 `marketplace.json`，断言合法 JSON；顶层 name/plugins/pluginRoot 存在；plugins[0].name==="forge"；source 指向 kkkman22/Forge。
2. GREEN：写 marketplace（对齐 design R5 + docs §4.3）。
3. REFACTOR：无。

**Done**：R5 AC3/AC4 满足。

---

## T11: capability-adaptation（V13）回归

**目标**：证明 capability-driven 对未来模型零代码改动自适应。

**TDD**：
1. RED：写测试——构造"未来 Claude 1M 模型"能力对象（contextWindow=1000000, supportsLongHorizon=true, supportsReasoningEffort=true, supportsThinkingMode=true, maxOutput=128000, contextCacheEfficiency=0.85），调 deriveGovernance，断言输出 == GLM-5.2 场景（budget=800000/worker optional/parallel 8/dispatch inline-lean/含 reasoningEffort）。附注释说明这是 V13 决定性证据。
2. GREEN：测试通过（派生已在 T4 实现）。
3. REFACTOR：无。

**Done**：R6 AC3 满足。

---

## T12: 聚合透明回归 + P1 继承

**目标**：聚合 R1-R5 回归 + P1 透明性继承，CI 可跑。

**TDD**：
1. RED：写/补测试——Claude env 下：探测→Claude、派生→P1 基线、path/session/version→byte-equal；断言 P1 `zcode-p1-verify.mjs` 仍可跑（不回滚）。
2. GREEN：确保 `npm run check`（vitest 全量）含 host-adapter/governance-derived/capability-adaptation/host-detect 测试；P1 verify 脚本未被破坏。
3. REFACTOR：测试归类到 `test/host/` 或 `test/zcode-p2-*` 命名，便于定位。

**Done**：R6 AC1/AC2/AC4/AC5/AC6 满足。

---

## 执行顺序

T1 → T2 → T3（R1 链）；T4（R2，可与 R1 并行，依赖 T1）；T5（R3，依赖 T2/T3）；T6/T7/T8（R4，可并行，依赖 T5）；T9 → T10（R5，独立）；T11（R6 验证，依赖 T4）；T12（横切，依赖全部）。

**TDD 铁律**：每个 task 先 RED（测试失败）→ GREEN（最小实现通过）→ REFACTOR。每完成一个 task 运行 `npm run check` 相关子集，全部完成后跑全量 + P1 verify。
