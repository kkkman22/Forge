---
status: draft
feature: cmux-extension-sidebar
layout: requirements
created: 2026-06-13
tier: full
depends_on: [cmux-integration]
status_note: "Data-contract layer delivered 2026-06-13: R2 Render_Model is a pure-function module at scripts/cmux-mirror/lib/render-model.mjs (buildRenderModel maps Forge_State_Snapshot → 5 regions: phase/dag/review/loop/attention; reviewVerdictColor) with 9 passing property tests (phase totality, region folding on missing data, verdict color, build totality over arbitrary snapshots). R1 capabilities probe + Zero-Impact degrade reuse scripts/cmux-mirror/lib/availability.mjs. R3 Data_Source reuses scripts/cmux-mirror/lib/reader.mjs (file-watch) + payload.mjs. STILL BLOCKED on Implementation_Gate (kept draft): the Swift authoring syntax (SwiftUI primitives, data-binding, lifecycle hooks) + sidebar discovery/install mechanism depend on cmux 0.64.15's undocumented Beta sidebar interpreter API — not implementable until cmux documents it. R4/R5 (install/live-reload/CLI-validate + process isolation) depend on the Swift layer."
---

# Requirements Document

## Introduction

本特性为 Forge 提供一个 **cmux 原生自定义侧边栏**（custom sidebar extension），把 Forge 生命周期状态以富 UI 形式直接渲染在 cmux 工作区侧栏，**取代** `cmux-integration` spec 中 Mirror_Daemon 的 `set-status` / `set-progress` / `log` CLI 轮询投影（R2–R5）作为首选呈现通道，CLI 投影降级为 fallback。

问题陈述：当前 Forge → cmux 的状态可见性依赖 Mirror_Daemon 周期性调用 `cmux set-status`/`set-progress`/`log`，本质是"把结构化数据压扁成侧边栏 pill + 进度条 + 日志行"的有损投影，且受 Process_Notification_Budget、500ms 去抖、CLI 子进程开销约束。cmux 自 0.64.13 起提供 **Vibe-Codable Custom Sidebars**（运行时 Swift interpreter，0.64.14 进程外隔离，0.64.15 默认 in-process + Settings 面板 + CLI 校验 + live reload），允许第三方用原生 SwiftUI 组件绘制侧栏。Forge 的状态模型（phase/tier/DAG wave/review verdict/loop 迭代）天然适合比 pill 更丰富的呈现（wave 进度条、review verdict chips、loop 时间线、attention queue）。

价值来源：cmux 0.64.10–0.64.15 的 custom sidebar 能力（in-process 渲染、进程外隔离防崩溃、SwiftUI primitives、CLI 校验、live reload、example sidebars）+ Forge 已有的稳定状态源（`.tinkerman/status.md`、`.tinkerman/progress/*.md`、`.tinkerman/reviews/*.md`、`.tinkerman/runs/<id>/events.ndjson`）+ 已存在的 Mirror_Push_Socket（`cmux-integration` R17）。三者组合让 Forge 能拥有一个原生、富 UI、零新运行时依赖的状态侧栏。

业务价值：

1. Forge DAG 并行 wave、三层评审、Loop 迭代在侧栏以**结构化 UI**（而非压扁的 pill）呈现，多 workspace 切换时信息密度与可读性显著提升。
2. **复用** `cmux-integration` 已建立的观察者架构与 .tinkerman/ 状态源——sidebar 是 Mirror_Daemon 的"渲染前端"，不引入新的状态 source of truth。
3. capabilities 降级：cmux < 0.64.13 或 Beta 关闭时，自动回退到既有 CLI 投影，Zero-Impact 不变量不变。
4. 把"侧栏呈现"从 CLI 子进程调用（每次 set-status fork 一个 cmux 进程）升级为 in-process 渲染，降低长会话开销。

**关键架构约束（贯穿所有需求）**：

- **API-Deferral 原则**：cmux custom sidebar 的 Swift authoring 面（interpreter 暴露的 SwiftUI primitive 集合、数据绑定 API、生命周期钩子）截至 0.64.15 仍为 **Beta 且无独立官方文档**（changelog 为唯一来源）。本 spec **锁定稳定的数据契约与渲染模型**，**不锁定 Swift authoring 语法**——后者标记为 Implementation_Gate（待 cmux 发布稳定 sidebar API 文档后对齐，并用 capabilities 探测守卫）。这是 `templates/cmux.json` schema 漂移教训的直接应用：不基于未稳定面写实现契约。
- **Data_Source 稳定性**：sidebar 的唯一数据来源是 `.tinkerman/` 文件系统状态（已稳定）+ 可选的 Mirror_Push_Socket（R17，已存在）。sidebar **不得**引入新的 Forge 状态出口或要求 `src/*.ts` 新增导出。
- **Zero-Impact 不变量继承**：未装 cmux、cmux < 0.64.13、或 Beta Features 关闭时，sidebar SHALL 不渲染、不报错、不改变 Forge 行为；状态呈现回退到 `cmux-integration` R2 的 CLI 投影。

## Glossary

- **Custom_Sidebar**：cmux 0.64.13+ 的 Beta 特性，允许第三方用运行时 Swift interpreter 编写原生 SwiftUI 侧栏扩展；0.64.14 起进程外隔离（崩溃不影响 cmux），0.64.15 起默认 in-process 渲染 + Settings 面板 + CLI 校验 + live reload。
- **Sidebar_Source**：本特性产出的 Swift sidebar 源文件（及其可选 JSON 清单），由 cmux custom sidebar interpreter 加载。物理位置由 cmux 的 sidebar 发现机制决定（Implementation_Gate）。
- **Render_Model**：sidebar 的抽象渲染模型——把 Forge 状态映射到一组原生 UI 元素（见 Requirement 2），与 Swift authoring 语法解耦。本 spec 定义 Render_Model，Implementation_Gate 把它翻译成 Swift。
- **Data_Source**：sidebar 读取的稳定数据通道，二选一或组合：(a) 直接 file-watch `.tinkerman/status.md` / `.tinkerman/progress/*.md` / `.tinkerman/reviews/*.md` / `.tinkerman/runs/<id>/events.ndjson`；(b) 订阅 `cmux-integration` R17 的 Mirror_Push_Socket（`.tinkerman/.cmux-mirror.sock`）接收结构化 Mirror_Push_Event。
- **Sidebar_Capability_Probe**：运行时探测 cmux 是否支持 custom sidebar（`cmux capabilities --json` 含 sidebar 相关方法，或 Beta Features 开启）。复用 `cmux-integration` R13.5 的 capabilities 机制。
- **CLI_Projection_Fallback**：当 Sidebar_Capability_Probe 返回 false 时，状态呈现回退到 `cmux-integration` R2 的 `set-status`/`set-progress`/`log` CLI 投影（由既有 Mirror_Daemon / sync-once 提供）。本特性 SHALL NOT 修改该回退路径的既有行为。
- **Implementation_Gate**：本 spec 中标记为"待 cmux 稳定 sidebar API 后实现"的开放点，集中在 Swift authoring 语法与 sidebar 发现/安装机制。Render_Model、Data_Source、降级策略、验收属性在此 spec 内锁定，不受 Implementation_Gate 影响。
- **Attention_Queue**：sidebar 顶部置顶区，列出需要用户介入的 Forge 事件（冻结拦截、P0/P1 评审发现、Loop 熔断、三连失败 reroute）。对齐 cmux 0.64.10 prototype 的 "attention queue"。
- **Forge_State_Snapshot**：sidebar 一次渲染所依据的 .tinkerman/ 状态切片，schema 复用 `cmux-integration` 的 Canonical_Sidebar_Payload（phase/tier/current_topic/dag_progress/loop_state/review_verdict）并扩展为 Render_Model 所需的字段集（见 Requirement 2）。

## Requirements

### Requirement 1: capabilities 探测与降级到 CLI 投影

**User Story:** 作为未开启 cmux Beta Features 或运行 cmux < 0.64.13 的用户，我希望 Forge sidebar 在不可用时静默回退到既有 CLI 侧栏投影，不报错、不改变 Forge 行为。

#### Acceptance Criteria

1. THE Sidebar_Capability_Probe SHALL 在 sidebar 加载时调用既有 `cmux capabilities --json`（`cmux-integration` R13.5），判定 custom sidebar 是否可用；探测 SHALL 在 2 秒内完成并缓存结果（进程内 sticky）。
2. WHEN Sidebar_Capability_Probe 返回 false（cmux 不可用 / 版本 < 0.64.13 / Beta 关闭 / capabilities 缺 sidebar 方法），THE Custom_Sidebar SHALL 不渲染任何 Forge UI、不抛错、不向 stderr 写诊断；状态呈现 SHALL 完全由 `cmux-integration` R2 的 CLI_Projection_Fallback 承担。
3. THE Zero_Impact_Invariant（继承自 `cmux-integration` R1.5）SHALL 成立：Sidebar_Capability_Probe 返回 false 时，本特性不改变 Forge 退出码、stdout/stderr（允许一次性 Beta 提示除外）、`.tinkerman/` 文件内容。
4. THE Feature_Flag `cmux_sidebar`（新增 `.tinkerman/config.md` YAML frontmatter 字段，取值 `auto`（默认）| `on` | `off`）SHALL 控制本特性：`off` 时即使 cmux 支持也不渲染 sidebar；`on` 且不可用时 SHALL 输出一次性 stderr 警告。本字段计入 `cmux-integration` R11.9 的"≤5 个可选 frontmatter 字段"预算，需相应复核。
5. WHEN Sidebar_Capability_Probe 返回 true 但 sidebar 渲染运行时抛错（Swift interpreter 异常），THE 进程外隔离（cmux 0.64.14+）SHALL 保证 cmux 主进程不崩溃；sidebar SHALL 自动回退到 CLI_Projection_Fallback 并在 sidebar log 记录一次错误。

### Requirement 2: Render_Model — Forge 状态到原生 UI 元素的映射

**User Story:** 作为在多个 Forge workspace 间切换的开发者，我希望 cmux 侧栏以结构化 UI（而非压扁的 pill）展示当前 phase/tier、DAG wave 进度、review verdict、loop 迭代与 attention queue，一眼看出谁在运行、卡在哪、是否需要我介入。

#### Acceptance Criteria

1. THE Render_Model SHALL 由 5 个区域构成，每个区域绑定 Forge_State_Snapshot 的稳定字段（字段来源标注）：
   - **Phase_Region**：当前 phase（图标 + 文本，图标映射复用 `cmux-integration` R2.3 的 decide→brain…idle→circle 表）+ tier 色标（复用 R2.4 light/standard/full 色映射）+ current_topic。来源 `.tinkerman/status.md` frontmatter。
   - **DAG_Region**：当前 wave 的任务列表与完成态（done/failed/blocked/in_progress 着色），整体 ratio 进度条。来源 `.tinkerman/progress/<topic>.md`（复用 `cmux-integration` R3.2 的 ratio 计算）。
   - **Review_Region**：三层（spec/quality/security）verdict chips（绿=0 P1 / 黄=仅 P2/P3 / 红=≥1 P1）+ P0/P1/P2/P3 计数。来源 `.tinkerman/reviews/<topic>.md` frontmatter `layers_status`（`cmux-integration` R15）。
   - **Loop_Region**：Forge Loop 迭代时间线（每轮 commit subject + 成功/回滚着色）+ 当前 ratio。来源 `.tinkerman/runs/<id>/events.ndjson`（`cmux-integration` R14 schema）。
   - **Attention_Queue**：置顶需要介入的事件（frozen interception / P0/P1 评审 / Loop 熔断 / three-strike reroute），每项可点击跳转对应 surface。
2. THE Render_Model SHALL NOT 投射 Forge_State_Snapshot 之外的任何字段（totality 约束，对齐 `cmux-integration` Canonical_Sidebar_Payload 的"payload 之外不投射"原则）。
3. THE Render_Model 元素 → cmux SwiftUI primitive 的具体映射（如进度条用 `ProgressView`、chips 用带色 `Label`）SHALL 集中在 Sidebar_Source 中，标注为 Implementation_Gate（primitive 集合随 cmux 版本扩展，0.64.14 起 "broader SwiftUI primitives"）。
4. WHEN 某区域数据源缺失（如非 build 阶段无 DAG、非 loop 运行无 events.ndjson），THE 该区域 SHALL 折叠/隐藏而非显示空状态错误。
5. THE sidebar 渲染延迟（Forge_State_Snapshot 变化 → 侧栏像素更新）SHALL p95 ≤ 500ms（与 `cmux-integration` R11.2 的 CLI 投影延迟对齐），在 in-process 模式下预期显著优于该值。

### Requirement 3: Data_Source — 复用 .tinkerman/ 状态与 Mirror_Push_Socket

**User Story:** 作为 Forge 维护者，我希望 sidebar 复用既有的稳定状态源与观察者架构，而不是要求 Forge 新增状态导出或重新实现 .tinkerman/ 解析逻辑。

#### Acceptance Criteria

1. THE Custom_Sidebar SHALL 通过以下之一获取 Forge_State_Snapshot（二选一，由 Implementation_Gate 根据 cmux sidebar interpreter 能力决定）：
   - (a) **File_Watch 模式**：sidebar interpreter 直接 file-watch `.tinkerman/status.md` / `.tinkerman/progress/*.md` / `.tinkerman/reviews/*.md` / `.tinkerman/runs/<id>/events.ndjson`，复用 `cmux-integration` lib/reader.mjs 的解析逻辑（若 interpreter 可调用既有 .mjs）或在 Swift 中重实现等价解析（标注为 Implementation_Gate）。
   - (b) **Push_Subscribe 模式**：sidebar 订阅 `cmux-integration` R17 的 Mirror_Push_Socket（`.tinkerman/.cmux-mirror.sock`），接收已结构化的 Mirror_Push_Event，sidebar 仅做渲染。此模式优先（复用 Forge TS 解析、sidebar 最薄）。
2. THE Data_Source 选择 SHALL 在 Sidebar_Source 中声明并可通过 capabilities 探测切换；Push_Subscribe 不可用时回退 File_Watch，File_Watch 不可用时回退 CLI_Projection_Fallback（Requirement 1）。
3. THE Custom_Sidebar SHALL NOT 要求 `src/*.ts` 新增任何导出、事件、或 hook；`cmux-integration` R10（"仅 sdk-driver.ts / check-frozen.ts / review.ts 三个 src touchpoint"）的约束在本特性中继续生效——本特性 SHALL 零 `src/*.ts` 改动。
4. WHEN sidebar 与既有 Mirror_Daemon 同时运行（CLI 投影 + sidebar 渲染并存），THE 两者 SHALL 不冲突：sidebar 是只读消费者，不写 `.tinkerman/`、不调用 `cmux set-status`；Mirror_Daemon 继续按 `cmux-integration` R2 工作。
5. THE sidebar 对 events.ndjson 的解析 SHALL 满足 `cmux-integration` R12.11 / R14.6 的容错属性（单行 malformed 不中止后续解析）。

### Requirement 4: 安装、发现与 live reload

**User Story:** 作为 Forge 用户，我希望安装 Forge 后 sidebar 自动可用、源码变更时 live reload、且能用 cmux CLI 校验 sidebar 源正确性。

#### Acceptance Criteria

1. THE Forge 分发包 SHALL 包含 Sidebar_Source（Swift 源 + 可选清单）于 `cmux-sidebar/` 目录；`scripts/cmux-mirror/install-template.sh`（或并列安装器）SHALL 在 cmux 可用时把它安装到 cmux 的 sidebar 发现位置（具体路径为 Implementation_Gate，依赖 cmux sidebar 发现机制文档化）。
2. THE 安装 SHALL 遵循 `cmux-integration` R1 的 Zero-Impact：cmux 不可用时不安装、不报错（除 `cmux_sidebar: on` 时一次性警告）。
3. THE Sidebar_Source SHALL 可经 cmux CLI 校验（0.64.13 "validate it from the CLI"）；本特性的 CI smoke test SHALL 在 cmux 可用时调用该校验命令，断言 sidebar 源有效（对齐 `cmux-integration` R9.9 的 doctor smoke 模式）。
4. THE Sidebar_Source 编辑后 SHALL 经 cmux live reload（0.64.13 "reload it live without rebuilding the app"）即时生效；本特性 SHALL NOT 要求重启 cmux 或 Forge。
5. THE 安装器 SHALL 支持 `--uninstall` 移除 sidebar，移除后 Forge 核心行为不变（对齐 `cmux-integration` R10.10）。
6. WHEN cmux 升级导致 sidebar interpreter API 不兼容（primitive 重命名/移除），THE Sidebar_Capability_Probe 或 CLI 校验 SHALL 捕获并把 sidebar 标记为 unavailable，回退 CLI_Projection_Fallback；本特性 SHALL NOT 因 sidebar 损坏阻断 Forge。

### Requirement 5: 安全、性能与不变量

**User Story:** 作为 Forge 维护者，我希望 sidebar 扩展不引入安全风险（进程外隔离、无 secret 泄露）、不回退既有性能/不变量保证。

#### Acceptance Criteria

1. THE Sidebar_Source SHALL 运行于 cmux 0.64.14+ 的进程外隔离 interpreter 中；损坏的 sidebar SHALL NOT 崩溃或挂起 cmux 主进程（依赖 cmux 0.64.14 能力，capability 不足时不启用 sidebar）。
2. THE sidebar SHALL NOT 读取或渲染 secret（`cmux-integration` R14.8 的 redaction 逻辑 SHALL 适用于 sidebar 渲染的 events.ndjson / status 字段）；any `objective`/`subject`/`reason` 字段 SHALL 经同一 redaction。
3. THE sidebar SHALL NOT 调用任何修改 cmux 配置的命令（对齐 `cmux-integration` R11.6：不调 `reload-config`、不编辑 cmux.json）；只读渲染。
4. THE 本特性 SHALL 新增 ≤ 1 个可选 `.tinkerman/config.md` frontmatter 字段（`cmux_sidebar`），不新增 required 字段；SHALL 复核 `cmux-integration` R11.9 的 5 字段预算。
5. THE 本特性 SHALL 满足以下属性测试（对齐 `cmux-integration` R12 风格）：(a) Sidebar_Capability_Probe 幂等性（同 env+fs → 同结果）；(b) Render_Model totality（每个合法 phase → 合法图标；域外 → circle）；(c) Data_Source 容错（events.ndjson 单行 malformed 不中止渲染）。
6. THE 本特性 SHALL NOT 移除或弱化 `cmux-integration` 的 CLI 投影路径（R2–R6）——它是 fallback 与非 sidebar 用户的唯一呈现通道；sidebar 是其**前端增强**，非替代品（"取代"仅指首选呈现通道，CLI 投影保留）。

## Out of Scope

1. **Swift authoring 语法的稳定化** — cmux sidebar interpreter 的 SwiftUI primitive 集、数据绑定 API、生命周期钩子在 0.64.15 仍为 Beta 且无独立文档；本 spec 不锁定其语法，留给 Implementation_Gate 对齐 cmux 稳定 API。
2. **跨 workspace 全局 dashboard** — sidebar 是 per-workspace 渲染（对齐 `cmux-integration` Out of Scope #4），不聚合多 workspace。
3. **sidebar 内的交互式 Forge 控制**（点按钮触发 /forge build 等）— 本特性仅做状态呈现；把 sidebar 作为 Forge 控制面是后续 spec。
4. **非 cmux 平台的等价侧栏** — cmux-only（对齐 `cmux-integration` Out of Scope #1）。
5. **替换 events.ndjson / .tinkerman/ 状态源** — sidebar 是消费者，不改 source of truth（对齐 `cmux-integration` Out of Scope #7）。
6. **在 CI 中跑真实 cmux sidebar 渲染** — CI 仅做 Sidebar_Source 的 CLI 校验 + 属性测试（对齐 `cmux-integration` Out of Scope #8）；端到端 sidebar 渲染测试不在 CI。
