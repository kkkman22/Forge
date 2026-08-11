---
status: draft
feature: zcode-p2-native-architecture
layout: requirements
created: 2026-07-31
tier: full
supersedes:
  - "zcode-p1-base-integration (non-goals only: '不建 shim' / '不动治理逻辑' / '不做完整 compact 补偿')"
adr: "ADR-0009"
---

# Forge × ZCode P2 原生架构 — 需求文档

## 背景

P1（`zcode-p1-base-integration`，status: locked）验证了"插件格式兼容"可行：工作区配置生成、hook 输出裁剪、三项验证、双平台透明回归全部落地。P1 的 non-goals（`requirements.md` "不建 shim / 不动 plan/build/review/ship 治理逻辑"）是当时的硬约束，把"内核解耦 + 治理参数化"推迟到 P2。

本 Spec 正式 **supersede** P1 的两条 non-goals（仅 non-goals，P1 已落地的 R1–R6 实现保留为 fallback 安全网，不回滚），引入 **运行期 HostAdapter 架构 + 模型能力驱动的治理派生（capability-driven）**。设计依据见 `docs/zcode-dual-platform-adaptation.md`（§0–§5）。

## 目标

1. **一套内核 + 运行期 HostAdapter**：内核不再直接 `process.env.CLAUDE_*` 或 `if(isZcode)`，而是向注入的 HostAdapter 要"路径 / 会话 / 版本 / hook 事件集 / 模型能力 / 治理策略"。
2. **capability-driven 治理派生**：`budget` / `并发` / `worker 隔离` / `dispatch` 等参数由 `modelCapabilities()` 单源派生，非平台名硬编码。Claude 200K 与 GLM-5.2 1M 自动适配，未来 Claude 发 1M 零代码改动。
3. **失败安全**：平台探测失败 → 保守返回 ClaudeAdapter，绝不破坏 Claude 侧行为（继承 P1 R2 AC3）。
4. **双平台透明（capability-equal 升级）**：能力相同的平台行为相同；Claude 路径因 200K 能力保持 P1 后的 byte-equal 基线。
5. **铁律不可改**：TDD / 验证 / 三振 / 隔离评审 / P0-P1 阻断 / Knowledge / Spec 系统属宪法 §5.6 immutable，本 Spec 不碰。

## 术语

- **HostAdapter**：运行期注入的抽象，封装"宿主结构性属性 + 模型能力 + 派生治理策略"。具体类名由实现决定（Spec 禁止类名作 AC，防 detectSpecLeak 误判）。
- **capability-driven**：治理参数由模型能力（`contextWindow` / `supportsLongHorizon` 等）派生，非平台名。平台名仅用于结构性差异（hook 事件可用性）。
- **capability-equal**：若两个平台的模型能力相同，则派生出的治理参数与行为相同（比 P1 的 byte-equal 更强的保证）。
- **运行期 shim**：进程启动时探测宿主、实例化对应 Adapter，注入内核。这是 P1 禁止、本 Spec 显式 supersede 的行为。
- **失败安全**：探测信号全部缺失 → 返回 ClaudeAdapter。

## 约束

- **显式 supersede P1 non-goals**：本 Spec frontmatter `supersedes` 字段声明仅 supersede P1 的"不建 shim"与"不动治理逻辑"两条 non-goal；P1 的实现（`.zcode/config.json` 生成、`zcode-platform.mjs` 裁剪、三项验证脚本、透明回归）保留为 fallback 安全网。
- **写行为不写实现**：本 spec 禁止类名/函数名/具体文件路径作为验收条件（detectSpecLeak 会检查）。接口字段名（`contextWindow` 等）作为数据契约允许出现。
- **铁律边界（§0.3）**：operational governance（budget/并发/worker/dispatch/gate 阈值）可经 HostAdapter 策略注入并派生；iron laws（TDD/验证/三振/隔离评审/P0-P1/Knowledge/Frozen Zone/Spec 系统）不可改。
- **Claude 路径不漂移**：所有派生在 Claude 能力（contextWindow=200000）下，必须输出与 P1 后基线一致的治理参数（capability-equal）。
- **探测基于环境信号**：平台探测读运行时 env 信号，不依赖配置文件、不依赖用户手动开关；探测失败保守按 Claude。
- **保留 fallback 安全网**：P1 的 `zcode-platform.mjs`（探测 + 裁剪）不删除，作为 HostAdapter 的前身/最小子集保留；若 HostAdapter 探测异常，可经 P1 路径降级。

## 需求

### Requirement 1: HostAdapter 抽象（结构性属性 + 模型能力）

**User Story:** 作为 Forge 内核模块，我希望通过一个统一的抽象获取宿主路径、会话、版本、hook 事件集与模型能力，而非各处直接读 `process.env.CLAUDE_*` 或 `if(isZcode)`。

#### 验收标准

1. THE Spec SHALL 定义一个 HostAdapter 抽象，提供：(a) 结构性属性——平台标识、插件路径、会话 id、宿主版本、可用 hook 事件集、subagent 层级；(b) 模型能力——contextWindow、maxOutput、是否支持 Long Horizon、是否支持 reasoning_effort、是否支持 thinking mode、上下文缓存效率系数。
2. THE 抽象 SHALL 至少有两个实现：一个对应 Claude Code（contextWindow≈200000，含 PreCompact/SubagentStop 等 hook 事件，subagent workspace 级），一个对应 Zcode+GLM-5.2（contextWindow=1000000，hook 事件子集无 PreCompact/SubagentStop，subagent global-only）。
3. THE 两个实现的模型能力字段 SHALL 反映真实差异（Claude 200K vs GLM-5.2 1M/128K/Long Horizon），数值作为数据契约固定。
4. THE 抽象 SHALL 不依赖具体平台名作治理派生分支（治理派生走模型能力，见 R2）；平台名仅用于结构性差异（hook 事件集等）。
5. THE 路径解析 SHALL 在 ClaudeAdapter 读 Claude 注入的 plugin 路径变量、在 ZcodeAdapter 读 Zcode 注入的路径变量（并兼容 Claude 注入的 fallback）。
6. THE 会话 id 解析 SHALL 经抽象提供，保留 P1 后的优先级链与一致性校验语义（hook → Claude env 链 → pid fallback）。
7. THE 宿主版本 SHALL 经抽象提供，Zcode 实现不施加 Claude semver 硬门禁（旁路 compatibility 的 CC 版本校验）。

**Verify-By:** 单元测试断言两个实现的结构性属性与模型能力字段符合契约（Claude 200K / GLM-5.2 1M）；路径/会话/版本解析在模拟 env 下返回正确值；抽象上不存在 `if(platform===...)` 形式的治理分支。

### Requirement 2: GovernancePolicy capability-driven 派生

**User Story:** 作为 Forge 治理层，我希望 budget/并发/worker 隔离/dispatch 等参数由模型能力单源派生，使 Claude 与 GLM-5.2 自动适配，未来任意模型零代码改动。

#### 验收标准

1. THE Spec SHALL 提供一个治理策略派生函数，输入模型能力（+ 可选 config override），输出 governance 字段：contextBudget、sliceThreshold、workerIsolation、maxParallelAgents、decideDispatchMode、（支持时）reasoningEffort 按阶段映射。
2. THE contextBudget SHALL 派生为 `0.8 × contextWindow`（留 20% 余量），且可被 config 的显式 override 覆盖。
3. THE sliceThreshold SHALL 派生为 contextBudget 的 90%。
4. THE workerIsolation SHALL 在 `supportsLongHorizon` 为真时派生为 optional（降级），否则 required。
5. THE maxParallelAgents SHALL 在 `contextWindow >= 500000` 时派生为 8，否则 6；可被 config override 覆盖。
6. THE decideDispatchMode SHALL 在 `contextWindow >= 500000` 时派生为 inline-lean，否则 auto。
7. THE reasoningEffort SHALL 仅在 `supportsReasoningEffort` 为真时输出按阶段映射（decide/spec=max, plan/review=high, build/ship=medium），否则为空。
8. THE 派生 SHALL 在 Claude 能力（contextWindow=200000, supportsLongHorizon=false）下输出与 P1 后治理基线一致的参数（capability-equal：budget=160000、worker required、并发 6、dispatch auto、无 reasoningEffort）。
9. THE 派生 SHALL 在 GLM-5.2 能力下输出 budget=800000、worker optional、并发 8、dispatch inline-lean、含 reasoningEffort。
10. THE gate 阈值（confidence 等）SHALL 不被本派生修改（铁律边界）。

**Verify-By:** 单元测试对 Claude 与 GLM-5.2 两份能力跑派生，断言字段值符合契约；模拟"未来 Claude 1M 模型"能力跑派生，断言自动放宽到 800000/optional/inline-lean（零代码改动自适应，V13）；config override 断言显式值覆盖派生默认。

### Requirement 3: 平台探测与失败安全（运行期 shim）

**User Story:** 作为运行中的 Forge 进程（hook 脚本 / phase worker / MCP），我希望启动时探测宿主并注入对应 HostAdapter，探测失败时保守按 Claude。

#### 验收标准

1. THE Spec SHALL 提供一个运行期探测函数，读宿主环境信号判定 Claude vs Zcode。
2. THE 探测 SHALL 优先识别 Zcode 专属信号（Zcode 注入、Claude 不注入的变量）；任一存在即判 Zcode。
3. THE 探测 SHALL 在无任何 Zcode 信号时判 Claude（失败安全）。
4. THE 探测 SHALL 在信号矛盾/全部缺失时保守返回 ClaudeAdapter（继承 P1 R2 AC3）。
5. THE Spec SHALL 提供一个单例注入点，进程内多次调用返回同一 Adapter 实例（避免重复探测开销）。
6. THE 探测 SHALL 不依赖配置文件、不依赖用户手动开关。
7. THE 探测语义 SHALL 与 P1 `zcode-platform.mjs` 的 `isZCodeRuntime()` 一致（同一信号清单），保证 P1 fallback 路径与 HostAdapter 判定不漂移。

**Verify-By:** 单元测试模拟各 env 组合（仅 Zcode 信号、仅 Claude 信号、两者皆无、矛盾），断言探测返回正确平台且失败安全返回 Claude；断言单例注入返回同一实例。

### Requirement 4: CLAUDE_* 耦合收敛到 adapter.paths()

**User Story:** 作为 Forge 维护者，我希望内核中对 `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` / 会话 env 的直接读取收敛到 HostAdapter，减少散落耦合点，同时 Claude 侧行为零变化。

#### 验收标准

1. THE 内核路径解析模块 SHALL 经 HostAdapter 获取 pluginRoot/projectDir，而非直接读 env（保留 env 作 Adapter 内部读取源）。
2. THE 会话 id 解析模块 SHALL 经 HostAdapter 获取会话来源，保留 P1 后的优先级链与一致性语义。
3. THE Claude 版本门禁模块 SHALL 在 Zcode 宿主下旁路 CC semver 硬门禁（经 adapter.hostVersion()），Claude 宿主下保持原校验。
4. THE 收敛 SHALL 使 Claude 宿主下所有上述模块的行为与 P1 后基线一致（capability-equal / byte-equal）。
5. THE 收敛 SHALL 不删除 P1 的 `zcode-platform.mjs`（保留为 fallback 安全网）。
6. THE 收敛 SHALL 不要求一次性覆盖全部 168 处 `CLAUDE_PLUGIN_ROOT` 字面量（hooks.json 静态模板展开不在本 Spec 范围，见 R6 非目标）；本 Spec 收敛内核 TS 模块的直接 env 读取。

**Verify-By:** 回归测试在 Claude env 下断言路径/会话/版本解析结果与 P1 后基线一致；在 Zcode env 下断言路径解析到 Zcode 注入值、版本门禁旁路；grep 断言目标内核模块不再直接 `process.env.CLAUDE_PLUGIN_ROOT`（收敛到 Adapter）。

### Requirement 5: Zcode 插件产物（.zcode-plugin + marketplace）

**User Story:** 作为 Zcode 用户，我希望经 Zcode marketplace 一键安装 Forge，插件 manifest 声明双平台能力与 GLM-5.2 优化。

#### 验收标准

1. THE Spec SHALL 产出一份 Zcode 插件 manifest（`.zcode-plugin/plugin.json`），声明 name/version/commands/skills/agents/hooks/mcpServers/userConfig，且与 Claude manifest 共享同一 commands/skills/agents/hooks/mcp 源目录。
2. THE manifest SHALL 在 userConfig 声明 `max_parallel_agents`、`safety_level`、`context_budget_override`（0=capability-driven 自动派生）三项配置点。
3. THE Spec SHALL 产出一份顶层 Zcode marketplace.json，含 forge 插件条目（source 指向仓库）。
4. THE manifest 与 marketplace SHALL 是合法 JSON，字段符合 Zcode 规范（marketplace 顶层 name/plugins/pluginRoot）。
5. THE manifest SHALL 在 description/keywords 体现 Claude Code + Zcode 双平台与 GLM-5.2 Long Horizon 优化。
6. THE 产物 SHALL 不破坏 Claude 侧 `.claude-plugin/` 的现有契约（两套 manifest 独立，共享源目录）。

**Verify-By:** JSON schema 校验两份产物合法；字段断言 userConfig 三项存在、marketplace 含 forge 条目、commands/skills/agents 路径与 Claude manifest 一致；Claude 侧 `.claude-plugin/` 内容未变（diff 为空）。

### Requirement 6: 双平台透明回归 + capability 自适应验证（横切）

**User Story:** 作为 Forge 维护者，我要确保 P2 所有改动对 Claude 侧行为零影响，并有回归保护防漂移，同时证明 capability-driven 能自动适应未来模型。

#### 验收标准

1. THE Spec SHALL 提供聚合回归入口，一键跑 HostAdapter / governance 派生 / 探测失败安全 / Claude 透明性 / capability 自适应（V13）全部断言。
2. THE 回归 SHALL 在 Claude env 下断言：探测返回 Claude、治理派生与 P1 后基线一致、路径/会话/版本解析 byte-equal。
3. THE 回归 SHALL 包含 V13 用例：模拟"未来 Claude 1M 模型"能力（contextWindow=1000000, supportsLongHorizon=true），断言派生自动放宽到 budget=800000/worker optional/dispatch inline-lean，零代码改动（证明 capability-driven 优于配置开关）。
4. THE 回归 SHALL 继承 P1 R6 的透明性断言（init 产物除 `.zcode/` 外 byte-equal），不回滚 P1 已有保护。
5. THE 聚合回归 SHALL 在 CI 或本地可重复运行（`npm run check` 内含），失败时清晰指出哪一项回归。
6. THE 回归 SHALL 覆盖 governance 字段的 Claude 与 GLM-5.2 两份契约快照，防派生逻辑漂移。

**Verify-By:** `npm run check`（含 vitest）全部通过；V13 自适应断言通过；P1 透明回归（`node scripts/zcode-p1-verify.mjs`）仍通过。

### Requirement 7: capability-driven worker 隔离决策（supersede P1 "不动治理"）

**User Story:** 作为 Full/Standard tier 的调用方，我希望是否隔离 phase worker 由 capability-driven 派生（而非硬编码 tier），使 GLM-5.2 Long Horizon 下 Full tier 可 inline，Claude 仍 required。

#### 验收标准

1. THE Spec SHALL 提供一个 worker 隔离决策函数，输入 governance + tier，输出是否隔离。
2. THE 决策 SHALL 在 `workerIsolation==="required"`（Claude，无 Long Horizon）且 tier 为 standard/full 时返回 true（隔离）。
3. THE 决策 SHALL 在 `workerIsolation==="optional"`（GLM-5.2，Long Horizon）时返回 false（不强制隔离，可 inline），含 Full tier。
4. THE 决策 SHALL 在 light tier 下永远返回 false（light 单文件改动不需 worker）。
5. THE 决策 SHALL 在未来 Claude 1M 模型（supportsLongHorizon=true）下自动放宽 Full tier 隔离（V13 worker 维度）。

**Verify-By:** 单元测试对 Claude/GLM-5.2/未来1M × light/standard/full 七组合断言；测试覆盖 capability-driven 而非 tier 硬编码。

### Requirement 8: 完整 compact 补偿链验证（supersede P1 "不做完整 compact 补偿"）

**User Story:** 作为双平台用户，我要确认 compact 补偿链在 Claude 与 Zcode 两侧都完整，且 capability-driven（GLM-5.2 Long Horizon 减轻 compact 影响）。

#### 验收标准

1. THE Claude 侧 SHALL 有 PreCompact hook（写 checkpoint）+ PostCompact hook（compact-inject 注入 budgeted snapshot）两环补偿。
2. THE Zcode 侧 SHALL 有 Stop hook 注入 status.md 作为 PreCompact 缺失的补偿（P1 R1 已落地）。
3. THE 验证 SHALL 锁定三脚本（hook-precompact.sh / hook-postcompact.sh / compact-inject.mjs / stop-additional-context.mjs）存在。
4. THE 验证 SHALL 断言 GLM-5.2 的 sliceThreshold 远大于 Claude（≥4×），证明 Long Horizon + 大窗口使 compact 触发频率显著降低。
5. THE 验证 SHALL 断言 GLM-5.2 supportsLongHorizon=true（跨 compact 边界保持判断），Claude=false（PreCompact 不可少）。

**Verify-By:** 回归测试断言脚本存在 + capability-driven relief（sliceThreshold 比值 + supportsLongHorizon 差异）。

### Requirement 9: host 模板层平台中立（CLAUDE_* 双平台 SSOT 决策）

**User Story:** 作为维护者，我要确认 hooks.json / .mcp.json 静态模板以 CLAUDE_* 为单一变量（Zcode 兼容注入），不在模板层双写 ZCODE_*，保持平台中立 + Claude byte-equal。

#### 验收标准

1. THE hooks.json SHALL 使用 `${CLAUDE_PLUGIN_ROOT}` 作为脚本路径变量（Zcode 兼容注入，P1 R4 已验证）。
2. THE hooks.json SHALL NOT 双写 `${ZCODE_PLUGIN_ROOT}`（避免 2× 字面量维护 + byte-equal 破坏）。
3. THE 平台感知 SHALL 集中在 host-adapter 层（src/host/），不在静态模板层分支。
4. THE 决策 SHALL 由测试锁定（防后续误改 hooks.json 引入 ZCODE_* 双写）。
5. THE agent body prose SHALL 用宿主中立表述（"宿主 subagent 派发原语"），不硬绑单一宿主 tool 名。

**Verify-By:** 回归测试断言 hooks.json 含 CLAUDE_PLUGIN_ROOT、不含 ZCODE_*；agent body 无单一宿主 tool 名硬绑。

## 验收标准（整体）

- [ ] R1: HostAdapter 抽象 + Claude/Zcode 两实现，结构性属性与模型能力契约正确。
- [ ] R2: capability-driven 派生，Claude/GLM-5.2/未来1M 三场景自适应，config override 生效，铁律边界不动。
- [ ] R3: 探测失败安全 + 单例注入，与 P1 信号语义一致。
- [ ] R4: 内核 CLAUDE_* 直接读取收敛到 adapter，Claude 侧行为零变化。
- [ ] R5: `.zcode-plugin/plugin.json` + 顶层 marketplace.json 合法，Claude manifest 不变。
- [ ] R6: 聚合回归全绿，含 V13 自适应 + P1 透明回归继承。

## 依赖

- `docs/zcode-dual-platform-adaptation.md`（架构方案，§0–§5）。
- P1 Spec `.tinkerman/specs/zcode-p1-base-integration/`（fallback 安全网来源）。
- Forge 现有 `src/compatibility.ts` / `src/session-id.ts` / `src/forge-dispatcher/path-resolve.ts` / `src/config-store.ts`。
- `scripts/lib/zcode-platform.mjs`（探测信号语义基准）。

## 非目标

- **不**改宪法 §5.6 iron laws（TDD/验证/三振/隔离评审/P0-P1/Knowledge/Frozen Zone/Spec 系统）。
- **不**改 `hooks/hooks.json` 静态模板的 `${CLAUDE_PLUGIN_ROOT}` 展开机制（那是 host 行为，P1 R4 已验证；hooks 运行期注册器是后续 Spec）。
- **不**改 agent body prose 模板化（25 agent 去除 Claude tool 名，后续 Spec）。
- **不**改 phase-worker-runtime 的 worker 隔离实现（仅提供 `workerIsolation` 派生值，消费方接入是后续 Spec）。
- **不**一次性覆盖全部 168 处 `CLAUDE_PLUGIN_ROOT` 字面量（仅收敛内核 TS 直接 env 读取；scripts/ 静态模板展开不在范围）。
- **不**改 P1 已落地的 `.zcode/config.json` 生成与三项验证脚本（保留为 fallback）。
- **不**做完整 compact 补偿（P4）。
