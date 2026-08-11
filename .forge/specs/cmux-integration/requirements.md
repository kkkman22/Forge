---
status: retired-partial
feature: cmux-integration
layout: requirements
created: 2026-05-08
tier: standard
status_note: "R1–R10/R13/R15 delivered (scripts/cmux-mirror/ fully present: mirror.mjs, sync-once.mjs, lib/{availability,budget,dedupe,payload,session,respawn,push-server,reviews,events}.mjs; check-frozen hook-notify; review frontmatter layers_status/completed_at; templates/cmux.json). R11.9 delivered 2026-06-13: the 5 cmux_* config flags added to .forge/config.md. R14 (events.ndjson writer) PARTIALLY SUPERSEDED: spec named src/sdk-driver.ts as the writer, but that file was deleted by forge-loop-native-fusion; the writer moved to src/event-writer.ts (still append-only NDJSON + redaction), invoked by spec-*.ts modules — R14 loop-side emission delivered 2026-06-14: loop skill §7b documents writeEvent integration for all 6 event types (session_started/iter_started/iter_committed/iter_rolled_back/circuit_breaker_tripped/loop_terminated) with redaction per R14.8. Zero-Impact invariant holds: cmux absent → mirror no-ops."
---
# Requirements Document

## Introduction

本特性在不新增任何运行时依赖、不修改既有 13 个 SKILL 外部契约的前提下，为 Forge 增加一层"可选的 cmux 集成"，把 Forge 生命周期中的关键状态（路由、阶段、DAG 进度、评审结果、Forge Loop 迭代、冻结拦截）以结构化形式投射到 cmux 的侧边栏、通知和浏览器 surface 上，并允许用户通过项目级 `.cmux/cmux.json` 一键拉起 Forge 专属工作区。

问题陈述：Forge 当前的状态可见性主要依赖 `.forge/status.md`、`.forge/progress/*.md` 等文件 + 终端日志。开发者要盯多个 Subagent（`/forge decide` 四视角、`/forge review` 三层、DAG 并行 wave）或长时间无人值守的 Forge Loop 时，缺少系统级的"谁在运行、卡在哪、是否需要我介入"的视觉化信号。同时 `/forge test` 的 Layer 2 浏览器 QA 在没有 Playwright 等依赖时无法自动化执行。

价值来源：cmux 的 CLI + Unix socket API + 侧边栏元数据命令（`set-status` / `set-progress` / `log`）+ 通知系统（`notify` / OSC 777 / OSC 99）+ 浏览器自动化（`snapshot` / `click` / `fill` / `wait` / `state save`）+ 自定义命令 / 布局（`.cmux/cmux.json` 的 `actions` / `commands` / 布局树），与 Forge 的三维路由、DAG 并行、三层评审、Forge Loop 迭代、三区文件保护等结构性概念天然对齐。

业务价值：

1. 让 Forge 各阶段状态实时进入 cmux 侧边栏，多任务切换时一眼看出哪个工作区在 `build`、哪个在 `review`、哪个空闲。
2. 让长时间 `/forge build` 的 DAG wave 进度、`/forge review` 的三层并行评审、`forge-loop` 的每轮迭代以原生通知提醒，减少轮询。
3. 让 `/forge test` 的 Layer 2 浏览器 QA 在 cmux 可用时获得零安装的执行路径，不要求用户安装 Playwright。
4. 让冻结文件被 PreToolUse 阻断、Forge Loop 熔断等关键失败事件从"静默 exit code"升级为"桌面通知 + 侧边栏日志"。
5. 让团队协作中"新人加入 Forge 项目"的仪式从"读 README + 手动开几个 tail -f 终端"简化为"⌘P 选 Forge Workflow 布局"。

架构选择（Observer Pattern）：本特性采用**观察者架构**，不让 Forge 主动调用 cmux 适配器。替代方案是一个独立的守护进程 Mirror_Daemon（`scripts/cmux-mirror/mirror.mjs`）通过 `fs.watch(.forge/)` 观察 Forge 写入的状态文件与事件流 `Events_NDJSON`，在内部翻译为 cmux CLI 调用。强制守护通过 `.cmux/cmux.json` 的 Forge Workflow / Loop Monitor / Dev 三种布局里各预留一个 Mirror Pane 自动拉起；hook 侧保留 `scripts/cmux-mirror/sync-once.mjs` 作为 mirror 未启动或崩溃时的防御性二次同步。这个选择把 Zero-Impact 从"Forge 每个调用点加守卫"降级为"cmux 不可用时 mirror 根本不启动"，契合 Forge 既有的"文件系统是 source of truth"哲学。

关键约束（贯穿所有需求）：

- **Zero-cmux-zero-impact**：在未安装 cmux 的机器上，Mirror_Daemon SHALL 不被启动；hook 侧的 `sync-once.mjs` 在检测到 cmux_Available = false 时第一行即 exit 0。Forge 核心代码路径（`src/*.ts`、既有 13 个 SKILL）不包含任何 cmux 条件分支。
- **不修改既有 SKILL 外部契约**：本特性 SHALL 仅通过新增 `scripts/cmux-mirror/` 目录 + 扩展 `hooks/hooks.json` + 对 `src/sdk-driver.ts` 追加 `Events_NDJSON` 写入 + 对 `src/check-frozen.ts` 追加 1 行 bash wrapper 调用 + 对 `src/review.ts` 追加 `.forge/reviews/<topic>.md` frontmatter 2 个字段的方式落地。既有 SKILL.md 的字节数零变化。
- **可选增强层**：与 `cursor-team-kit-integration` spec 中把 cmux 作为 CLI/UI harness 一个 controller 的定位互补，本 spec 专注"Forge 全流程 → cmux 外放信号"的通用集成层，不与其重叠。

## Glossary

- **Forge**：本项目，Claude Code 的 AI 编码工作流 skill 包，以 `/forge` 命令族驱动 decide → spec → plan → build → review → test → ship → learn 八阶段。
- **Forge_Loop**：`forge-loop` CLI，基于 Claude Agent SDK 的自主循环执行引擎，与 `/forge` 互补。
- **cmux**：Manaflow 开源的 Ghostty-based macOS 原生终端，提供 Unix socket / CLI 控制、浏览器自动化、侧边栏元数据、桌面通知等能力。
- **cmux_Available**：一个布尔判定，为真当且仅当满足以下两条之一：(a) 环境变量 `$CMUX_WORKSPACE_ID` 非空；(b) `${CMUX_SOCKET_PATH:-/tmp/cmux.sock}` 路径上存在可连接的 Unix socket 文件。
- **cmux_CLI**：`cmux` 可执行文件，需满足 `command -v cmux` 成功；在 cmux 终端内自动可用，cmux 外需通过 `sudo ln -sf /Applications/cmux.app/Contents/Resources/bin/cmux /usr/local/bin/cmux` 安装。
- **Workspace_Ref**：cmux 工作区引用，格式为 `workspace:<n>`（其中 `<n>` 为正整数），由 cmux 在创建工作区时分配；在 cmux 终端内可通过 `$CMUX_WORKSPACE_ID` 环境变量读取，也可通过 `cmux identify --json` 查询。
- **Sidebar_Key**：cmux 侧边栏状态条目的 key，命名空间以 `forge.` 开头，具体取值见 Requirement 2。
- **Sidebar_Snapshot**：cmux `set-status` / `set-progress` / `log` 三类命令在单个工作区上累积的侧边栏元数据集合，可通过 `cmux sidebar-state --json` 导出，用作属性测试的验证通道。
- **OSC_Notification**：通过终端 OSC 777 或 OSC 99 转义序列发起的通知，与 `cmux notify` CLI 等价但无需 `cmux` 命令在 PATH 中。
- **Cmux_Adapter**：本特性的核心翻译层，**位于 `scripts/cmux-mirror/lib/` 下**（非 `src/`），把 Forge 状态转换为 cmux CLI 调用。在观察者架构下，Cmux_Adapter 是 Mirror_Daemon 和 sync-once 共享的库代码，不是 Forge 核心调用的对象。
- **Mirror_Daemon**：本特性新增的守护进程 `scripts/cmux-mirror/mirror.mjs`，通过 `fs.watch` / chokidar 观察 `.forge/status.md`、`.forge/progress/`、`.forge/reviews/`、`.forge/runs/<id>/events.ndjson` 的变化，在 500ms 内把变化翻译为 cmux CLI 调用。强制守护：由 `.cmux/cmux.json` 的 Forge Workflow / Loop Monitor / Dev 三种布局各预留一个 Mirror Pane 自动拉起；用户可通过 `node scripts/cmux-mirror/mirror.mjs` 手动启动。
- **Mirror_Pane**：`.cmux/cmux.json` 工作区布局中专门承载 Mirror_Daemon 的面板，占用 15% 高度或宽度，命令为 `node scripts/cmux-mirror/mirror.mjs`。
- **Sync_Once**：本特性新增 `scripts/cmux-mirror/sync-once.mjs`，由 hooks 触发，一次性读取 `.forge/` 状态并推到 cmux 侧边栏，作为 Mirror_Daemon 崩溃或尚未启动时的防御性二次同步。与 Mirror_Daemon 共享 `scripts/cmux-mirror/lib/` 下的核心翻译逻辑。
- **Events_NDJSON**：本特性新增事件流文件 `.forge/runs/<id>/events.ndjson`，由 Forge Loop（`src/sdk-driver.ts`）追加写入，每行一条 JSON 事件，schema 见 Requirement 14。这份数据对 `/forge learn --from-runs`、`/forge debug` 等非 cmux 消费者同样有价值，不是 cmux 专属投资。
- **Forge_Session**：一次完整的 Forge 工作会话。`/forge` 会话边界 = UserPromptSubmit hook 触发 → Stop hook 触发；`forge-loop` 会话边界 = Events_NDJSON 的 `session_started` 事件 → `session_ended` / `session_interrupted` 事件。用于定义 Process_Notification_Budget 的 reset 时机（见 Requirement 16）。
- **Cmux_Sync_Script**：历史术语，指 `sync-once.mjs`；保留此别名避免 Requirement 文本大面积改动。
- **Forge_Workspace_Layout**：`.cmux/cmux.json` 中定义的 Forge 专属 workspace 命令，至少包含 Forge Workflow / Forge Loop Monitor / Forge Dev 三种布局，**每种均包含 Mirror_Pane**。
- **DAG_Wave**：`.forge/plans/*.md` 解析出的 DAG 中同一 wave 的并行任务集合；当前实现参见 `src/task-graph.ts`。本 spec 中 wave 索引一律使用 1-indexed 呈现（人读友好）。
- **Loop_Iteration**：Forge Loop 的一轮迭代（一次 Agent SDK 调用 + Orchestrator 状态转换 + 可能的 git commit/rollback）。
- **Frozen_Interception**：PreToolUse hook 通过非零退出码阻断对 Frozen Zone 文件的写入的事件。
- **Canonical_Sidebar_Payload**：本特性规范化的侧边栏字段集合，由 6 个字段构成：`phase`（驱动 R2.2 `forge.phase` 与图标）、`tier`（驱动 R2.2 `forge.tier` 与颜色）、`current_topic`（驱动 R2.2 `forge.task`）、`dag_progress`（驱动 R3 进度条）、`loop_state`（驱动 R4 `forge.loop`）、`review_verdict`（驱动 R5 聚合摘要）。Payload 之外的 Forge 状态字段 SHALL NOT 被投射到 cmux。
- **Browser_QA_Fallback**：`/forge test` Layer 2 在既无 Playwright 也无项目自定义 harness 时，若 cmux_Available 则启用的基于 `cmux browser` 的替代执行路径。
- **Zero_Impact_Invariant**：在 cmux_Available 为 false 的机器上，本特性任何调用 SHALL 不改变 Forge 的退出码、stdout/stderr 内容（允许打印一次性提示除外）、`.forge/` 文件内容。
- **Feature_Flag**：`.forge/config.md` **YAML frontmatter** 顶层字段 `cmux_integration`，取值 `auto`（默认）| `on`（强制启用并在不可用时警告）| `off`（完全禁用）。
- **Process_Notification_Budget**：在单个 Forge_Session 内生效的内存计数器，用于限制 `cmux notify` 调用次数；适用于 R4（Forge Loop）与 R5（评审聚合）。默认 5 条，可由 `.forge/config.md` 的 `cmux_notification_budget` 字段覆盖。作用域从旧定义的"process lifetime"改为"Forge_Session lifetime"，由 Mirror_Daemon 通过 session 边界推断来 reset（见 Requirement 16）。
- **Hook_Dedupe_Window**：在**短生命周期 hook 进程**（PreToolUse 等每次独立派生的 shell 调用）使用的文件系统 TTL 去重机制，默认 5 秒，去重 key 为目标文件路径的 sha1 哈希，状态文件位于 `.forge/.cmux-dedupe/<sha1>.ts`；适用于 R6（冻结拦截）。与 Process_Notification_Budget 独立运作。
- **Sidebar_Log**：cmux 侧边栏日志条目，通过 `cmux log --level <info|progress|success|warning|error> --source forge` 写入。
- **OSC_777_Passthrough**：在 tmux 会话嵌套时通过 `printf '\ePtmux;\e\e]777;notify;Title;Body\a\e\\'` 使通知穿透 tmux 到达 cmux 的协议。
- **CTK_Background_Subagent**：`cursor-team-kit-integration` spec Requirement 11 中定义的 `background: true` Subagent 派发模式；本特性不修改该机制，但 SHALL 在其完成时同步 Sidebar_Snapshot。
- **Mirror_Push_Socket**：Mirror_Daemon 启动时监听的 Unix socket `.forge/.cmux-mirror.sock`，接受 JSON line 协议的"立即投影"请求；用于观察者路径（fs.watch）不够快的极端实时场景（如 spec 锁定瞬间），作为逃生通道。本通道是可选增强：Forge 核心与既有 SKILL 的运行不依赖它，SKILL 作者在确有需要时才通过 `scripts/cmux-mirror/push.sh` 调用。
- **Mirror_Push_Event**：通过 Mirror_Push_Socket 传入的一条事件，形如 `{"schema_version":1,"type":"<name>","payload":{...}}`；合法 `type` 取值见 Requirement 17。
- **Respawn_Budget**：在单个 Forge_Session 内 Mirror_Daemon 被 Sync_Once 检测到挂掉后允许自动重启的最大次数，默认 3；超出后 Sync_Once 不再尝试重启并在 sidebar log 中告警，由用户手动介入。

## Requirements

### Requirement 1: cmux 可用性检测与零影响降级

**User Story:** As a Forge user who does not run cmux, I want every cmux integration point to silently no-op, so that installing or updating Forge on a plain Ghostty / iTerm / VSCode terminal never changes any existing Forge behavior or produces errors.

#### Acceptance Criteria

1. THE Cmux_Adapter library (`scripts/cmux-mirror/lib/availability.mjs`) SHALL expose a `cmuxAvailable()` function that returns `true` if and only if at least one of the following conditions holds without throwing: (a) `process.env.CMUX_WORKSPACE_ID` is a non-empty string; (b) the path `process.env.CMUX_SOCKET_PATH ?? '/tmp/cmux.sock'` exists on disk AND its file type is a Unix socket (`S_IFSOCK`).
2. IF the detection steps in AC 1 throw or the underlying `fs.stat` exceeds a 200 ms wall-clock timeout, THEN `cmuxAvailable()` SHALL return `false` without propagating the exception.
3. WHEN Mirror_Daemon or Sync_Once invokes any Cmux_Adapter method, THE method SHALL first call `cmuxAvailable()`; IF it returns `false`, THE method SHALL return immediately with no side effects and no exceptions. Forge core code SHALL NOT invoke Cmux_Adapter methods; this defense is a second-line guard for the scripts layer.
4. WHEN `cmuxAvailable()` returns `true` but an underlying `cmux` CLI invocation or socket write fails (non-zero exit code, EPIPE, ECONNREFUSED, timeout), THE Cmux_Adapter SHALL catch the failure, record it at debug level only, flip the process-local availability to `false` per R13.9, and return normally without propagating the exception to the caller.
5. THE Zero_Impact_Invariant SHALL hold: on a machine where `cmuxAvailable()` returns `false`, THE Mirror_Daemon SHALL NOT be spawned by the Forge_Workspace_Layout (because the layout's Mirror Pane command performs detection and immediately exits 0 if unavailable); Sync_Once SHALL exit 0 on the first line; and the Cmux_Adapter library's methods SHALL make no cmux CLI calls. No file under `.forge/` SHALL be modified by cmux-related code paths in this state, Forge's exit code SHALL be unchanged, and nothing SHALL be written to stdout/stderr except at most one single line per Mirror_Daemon startup: `cmux: not detected, mirror will not start` — emitted only when the user has explicitly set `cmux_integration: on` in `.forge/config.md` frontmatter (see AC 7).
6. THE Feature_Flag `cmux_integration` SHALL live in `.forge/config.md` **YAML frontmatter** (the top `---...---` block at the file head), alongside existing fields such as `status` and `locked`; it SHALL NOT be read from the markdown body.
7. WHEN the frontmatter contains `cmux_integration: off`, Mirror_Daemon SHALL NOT be started by the Mirror_Pane command, Sync_Once SHALL exit on its first line, and the Cmux_Adapter library SHALL short-circuit `cmuxAvailable()` to return `false` without performing any detection I/O.
8. WHEN the frontmatter contains `cmux_integration: on` AND `cmuxAvailable()` returns `false`, THE Mirror_Pane command SHALL emit exactly one warning line to stderr and exit 0; Sync_Once SHALL behave identically and Forge itself SHALL NOT be affected.
9. WHEN the frontmatter contains `cmux_integration: auto` OR the field is absent, THE Mirror_Pane command SHALL run detection normally and start Mirror_Daemon only when `cmuxAvailable()` returns `true`; no warning SHALL be emitted if cmux is not detected.
10. THE `cmux_integration` field SHALL NOT be a required field in `.forge/config.md`; its absence SHALL be equivalent to `cmux_integration: auto` per AC 9.

### Requirement 2: Forge 阶段状态 → cmux 侧边栏同步

**User Story:** As a Forge user running multiple workspaces simultaneously, I want each workspace's cmux sidebar to show the current Forge phase, tier, and task metadata, so that I can identify at a glance which workspace is in `build`, which is in `review`, and which is idle.

#### Acceptance Criteria

1. THE Cmux_Sync_Script (`scripts/cmux-sync.mjs`) SHALL read the current Forge state from these sources in this order and merge into a Canonical_Sidebar_Payload: (1) `.forge/status.md` frontmatter fields `phase`, `tier`, `current_topic`; (2) the newest file under `.forge/progress/*.md` to compute `dag_progress`; (3) the newest file under `.forge/reviews/*.md` to compute `review_verdict`; (4) `.forge/runs/*/` latest run directory for `loop_state`.
2. WHEN the Cmux_Sync_Script executes, THE script SHALL write the Canonical_Sidebar_Payload to the cmux sidebar using these key bindings under the `forge.` namespace: `cmux set-status forge.phase <phase_value>`, `cmux set-status forge.tier <tier_value>`, `cmux set-status forge.task "<current_topic>"`, and WHEN a parseable DAG progress snapshot exists, emit `cmux set-progress <ratio> --label "Wave <w>/<W> · <done>/<total>"` where `<ratio>` is a float in `[0.0, 1.0]` computed as `done / total` (clamped).
3. THE Canonical_Sidebar_Payload `phase` field SHALL map to exactly one cmux status icon from this fixed set: `decide → brain`, `spec → doc.text`, `plan → list.bullet`, `build → hammer`, `review → checkmark.seal`, `test → testtube.2`, `ship → paperplane`, `learn → book`, `debug → ant`, `idle → circle`. Values outside this domain SHALL map to `circle` (per R12.3 totality invariant).
4. THE Canonical_Sidebar_Payload `tier` field SHALL map to exactly one cmux status color from this fixed set: `light → #22c55e`, `standard → #3b82f6`, `full → #ef4444`. Values outside this domain SHALL be emitted without the `--color` flag (no color applied), and SHALL NOT raise an error.
5. WHEN the Cmux_Sync_Script determines that any Canonical_Sidebar_Payload field has changed since the last sync within the same Workspace_Ref (tracked via `.forge/.cmux-last-sync.json` keyed on `workspace_ref`), THE script SHALL additionally emit one `cmux log --level info --source forge "<phase>: <current_topic>"` entry; IF no field has changed since the last sync, THE script SHALL skip the log emission to avoid sidebar clutter.
6. THE Cmux_Sync_Script SHALL complete within 500 ms of wall-clock time on a project with `.forge/progress/*.md` containing up to 100 task entries, and SHALL NOT block the triggering hook's continuation.
7. THE primary sync mechanism SHALL be the Mirror_Daemon: mirror.mjs uses `fs.watch` (or chokidar for recursion) on `.forge/status.md`, `.forge/progress/`, `.forge/reviews/`, `.forge/runs/` to detect changes and emit cmux CLI calls within 500 ms of the filesystem event. THE hook-driven Sync_Once (`scripts/cmux-mirror/sync-once.mjs`) SHALL be invoked from `hooks/hooks.json` as additional non-blocking entries in UserPromptSubmit, PostToolUse (matcher Write|Edit), and Stop **solely as a defensive second-line sync** for the case where Mirror_Daemon has not yet started or has crashed. Existing hook entries SHALL NOT be removed or reordered, and failure of Sync_Once SHALL NOT propagate to other hooks.
8. WHEN the Forge router writes `.forge/status.md` at the start of `/forge`, THE resulting filesystem event SHALL be observed by Mirror_Daemon within 500 ms, which SHALL emit the first phase transition to cmux sidebar. THE Forge router itself SHALL NOT invoke Sync_Once or any cmux adapter — integration is purely observational from Forge's perspective.
9. WHEN the current directory is not a Forge-initialized project (`.forge/status.md` does not exist), THE Sync_Once script SHALL exit with code 0 without emitting any cmux call; THE Mirror_Daemon SHALL detect the absence at startup and exit with code 0 without starting the watcher.
10. WHEN multiple Forge processes invoke Sync_Once concurrently in the same Workspace_Ref, THE script SHALL acquire the existing advisory file lock at `.forge/.locks/cmux-sync.lock` with a 1-second timeout; IF the lock cannot be acquired, THE later invocation SHALL skip the sync without error because the concurrent invocation will publish the latest state. Mirror_Daemon SHALL acquire a separate exclusive lock `.forge/.locks/cmux-mirror.lock` at startup; IF that lock is already held, THE new mirror instance SHALL exit with code 0 and a single stderr line indicating an existing instance is running.

### Requirement 3: DAG 并行进度 → cmux 进度条

**User Story:** As a Forge user running `/forge build` with a DAG that fans out multiple parallel Subagents, I want the cmux sidebar progress bar to reflect wave-level completion in real time, so that I can tell at a glance whether I am waiting on wave 1 or wave 3.

#### Acceptance Criteria

1. WHEN `/forge build` creates `.forge/progress/<topic>.md` and the corresponding `.forge/plans/<topic>.md` contains a parseable DAG with `dependsOn` declarations, Mirror_Daemon SHALL observe the progress file creation and call `cmux set-progress 0.0 --label "Starting · 0/<total>"` once, where `<total>` is the total number of tasks across all waves parsed from the progress file.
2. WHEN `.forge/progress/<topic>.md` is updated (task `status` transitions to `done` or `failed`), Mirror_Daemon SHALL update the progress bar with `ratio = completed / total` (float in `[0.0, 1.0]`) and a label `"Wave <current>/<W> · <completed>/<total>"`, where `<current>` is the 1-indexed position of the highest wave whose at-least-one task has started, `<W>` is the total wave count, `<completed>` is the count of tasks in `done` status, and `<total>` is the total task count.
3. Mirror_Daemon progress updates SHALL coalesce within a 250 ms debounce window: when multiple filesystem events on the same progress file arrive within 250 ms, only the final state SHALL be emitted as a single `cmux set-progress` call.
4. WHEN a task transitions to `failed` (detected by frontmatter or status block diff), Mirror_Daemon SHALL additionally call `cmux log --level error --source forge-build "task <task_id> failed: <failure_reason_first_line>"` exactly once per failure, independent of the debounce in AC 3.
5. WHEN all tasks in the DAG reach terminal states (`done`, `failed`, or `blocked`), Mirror_Daemon SHALL call `cmux set-progress 1.0 --label "Done · <done>/<total>"` as its final progress emission; Mirror_Daemon SHALL NOT call `cmux clear-progress` — cmux sidebar SHALL retain the final `1.0` frame until the next workspace state update overwrites it.
6. IF `.forge/progress/<topic>.md` is unreadable or its DAG structure cannot be parsed, THEN Mirror_Daemon SHALL skip progress updates for the current topic without raising an exception, continue to watch for subsequent changes, and continue with other side effects (such as phase sync from Requirement 2).
7. THE progress update logic SHALL respect the Feature_Flag: WHEN `cmux_integration: off`, Mirror_Daemon SHALL NOT be started by the Mirror_Pane command, so no progress-related cmux call SHALL occur.

### Requirement 4: Forge Loop → cmux 长时运行信号

**User Story:** As a Forge user running `forge-loop` unattended on a long-running objective, I want cmux to show iteration progress and push a desktop notification on terminal events (circuit breaker, natural termination, Ctrl+C), so that I can leave the machine and trust that I will be alerted when input or attention is required.

#### Acceptance Criteria

1. WHEN `forge-loop` starts, `src/sdk-driver.ts` SHALL append a `loop_started` event to `.forge/runs/<id>/events.ndjson` per the Events_NDJSON schema (Requirement 14); Mirror_Daemon SHALL observe this event and call `cmux set-status forge.loop "running" --icon arrow.triangle.2.circlepath --color "#3b82f6"` and `cmux set-progress 0.0 --label "Iteration 0 · <objective_first_40_chars>"` exactly once.
2. WHEN a Loop_Iteration completes with a successful git commit, `src/sdk-driver.ts` SHALL append an `iter_committed` event to events.ndjson; Mirror_Daemon SHALL call `cmux set-progress <ratio> --label "Iter <n>/<limit> · <short_commit_subject>"` AND `cmux log --level success --source forge-loop "iter <n> committed: <short_commit_subject>"`, where `<ratio>` is computed per AC 3.
3. THE progress `<ratio>` SHALL be computed by Mirror_Daemon from the `loop_started` event fields: IF `max_iterations` is a positive integer `<m>`, `<ratio> = min(n / m, 1.0)` and `<limit> = m`; ELSE `<ratio>` SHALL remain constant at `0.5` (indeterminate indicator) and `<limit>` SHALL render as `"∞"` — because cmux's progress bar requires a `[0.0, 1.0]` float and has no native indeterminate mode, `0.5` is the agreed visual convention for "running, no end in sight".
4. WHEN a Loop_Iteration soft-fails and is rolled back, `src/sdk-driver.ts` SHALL append an `iter_rolled_back` event; Mirror_Daemon SHALL call `cmux log --level warning --source forge-loop "iter <n> rolled back: <reason_first_line>"` and leave the progress bar unchanged.
5. WHEN the Forge Loop circuit breaker triggers (per `src/failure-handler.ts` consecutive-failure threshold, default 3), `src/sdk-driver.ts` SHALL append a `circuit_breaker_tripped` event; Mirror_Daemon SHALL call `cmux notify --title "Forge Loop 熔断" --subtitle "<objective_first_60_chars>" --body "连续 <n> 次失败，已中止"` exactly once.
6. WHEN the Forge Loop terminates naturally (reaching `--max-iterations`, `--max-tokens`, `--max-budget-usd`, or `--stop-when` condition satisfied), `src/sdk-driver.ts` SHALL append a `loop_terminated` event with `reason: "natural"`; Mirror_Daemon SHALL call `cmux notify --title "Forge Loop 完成" --subtitle "<objective_first_60_chars>" --body "总计 <n> 轮 · <commits> 次提交"` exactly once.
7. WHEN the Forge Loop terminates via SIGINT or SIGTERM, `src/sdk-driver.ts` SHALL append a `loop_terminated` event with `reason: "interrupted"`; Mirror_Daemon SHALL call `cmux set-status forge.loop "interrupted" --icon xmark.octagon --color "#ef4444"` and SHALL NOT emit a `cmux notify` (to honor user intent to abort).
8. THE Mirror_Daemon notification calls in AC 5 and AC 6 SHALL count toward the Process_Notification_Budget (Requirement 7) scoped to the Forge_Session (Requirement 16); IF the budget is exhausted, Mirror_Daemon SHALL fall back to `cmux log --level <error|success>` without emitting a desktop notification.
9. WHERE multiple `forge-loop` processes run concurrently in different cmux worktrees, EACH events.ndjson file lives at a path `.forge/runs/<id>/events.ndjson` that is unique per run; Mirror_Daemon SHALL append `--workspace <workspace_ref>` to every sidebar call, where `<workspace_ref>` is read from `process.env.CMUX_WORKSPACE_ID` at Mirror_Daemon startup (per Workspace_Ref definition, format `workspace:<n>`); IF `CMUX_WORKSPACE_ID` is unset, Mirror_Daemon SHALL omit `--workspace` and let cmux apply the update to the currently focused workspace.
10. WHEN `forge-loop` exits (any reason), `src/sdk-driver.ts` SHALL flush a final `loop_terminated` event within 2 seconds; Mirror_Daemon SHALL call `cmux clear-status forge.loop` within 2 seconds of observing that event, so stale "running" status does not persist across runs.

### Requirement 5: 评审结果 → cmux 侧边栏与通知

**User Story:** As a Forge reviewer waiting for `/forge review` three-layer fan-out to complete, I want each layer's verdict to surface in the cmux sidebar log as it lands and a single desktop notification when all three layers finish, so that I can continue other work and be alerted when review output is ready for consumption.

#### Acceptance Criteria

1. WHEN Mirror_Daemon observes a state change to `.forge/reviews/<topic>.md` frontmatter `layers_status.<layer>` transitioning from `pending` to a terminal state (`done` or `failed`), Mirror_Daemon SHALL call exactly one `cmux log --level <mapped> --source forge-review "<layer>: <verdict_summary>"` entry, where `<mapped>` is `success` when the layer reports zero P1 findings, `warning` when it reports only P2/P3 findings, and `error` when it reports at least one P1 finding. P1/P2/P3 align with the existing Forge severity scheme used in `skills/forge-review/`; no new severity is introduced. `<verdict_summary>` is parsed from the review body section for that layer (first line of findings summary or "0 findings" default).
2. THE `/forge review` SKILL SHALL extend `.forge/reviews/<topic>.md` frontmatter with two additional fields per Requirement 15: `layers_status` (object mapping `spec_check` / `quality_check` / `security_check` each to one of `done` / `failed` / `pending`) and `completed_at` (ISO 8601 string, set when all three layer statuses are in terminal state). Mirror_Daemon SHALL observe this file and detect review completion by reading these frontmatter fields; THE SKILL SHALL NOT call any adapter entrypoint directly.
3. WHEN Mirror_Daemon observes that `.forge/reviews/<topic>.md` has transitioned to a state where `layers_status.{spec_check, quality_check, security_check}` are all in terminal state (`done` or `failed`) and `completed_at` is set, AND the topic has not been previously notified within the current Forge_Session, THE Mirror_Daemon SHALL call exactly one `cmux notify --title "/forge review 完成" --subtitle "<topic>" --body "<agg_summary>"` where `<agg_summary>` lists one line per layer with the count of P1/P2/P3 findings parsed from the review body.
4. IF one or more layers fail (CTK_Background_Subagent non-zero exit, unreadable output, or timeout), THE `/forge review` SKILL SHALL set the failing layer's `layers_status.<layer>` to `failed`; Mirror_Daemon SHALL include a `failed: <layer>` line in the notification body rather than suppressing the notification entirely.
5. WHEN the user has set `.forge/config.md` frontmatter field `cmux_review_notify: off`, THE Mirror_Daemon SHALL skip the aggregate notification in AC 3 but SHALL still emit the per-layer log entries in AC 1.
6. THE review integration SHALL NOT modify any existing `.claude/agents/*.md` file's frontmatter or output schema; `/forge review` SKILL changes are limited to extending the output file's frontmatter per Requirement 15, documented in `skills/forge-review/references/cmux.md`.
7. WHEN `/forge review --canvas` (as defined in the `cursor-team-kit-integration` spec Requirement 4) produces `.forge/reviews/<topic>.canvas.html`, Mirror_Daemon SHALL observe the file creation event and call `cmux log --level info --source forge-review "canvas ready: <absolute_path>"`. THE `/forge review` SKILL SHALL NOT invoke any adapter entrypoint for this.

### Requirement 6: 冻结拦截 → cmux 侧边栏与通知

**User Story:** As a Forge user who hits a frozen-zone write interception during a `/forge` run, I want cmux to surface the interception as a sidebar error log and a single desktop notification, so that I do not miss the block in a noisy terminal and can act on it immediately.

#### Acceptance Criteria

1. WHEN `scripts/hook-check-frozen.sh` (or its TypeScript equivalent `src/check-frozen.ts`) exits with non-zero code to block a Write/Edit/Bash attempt on a Frozen Zone file, THE hook script SHALL additionally invoke `cmux log --level error --source forge-hook "frozen interception: <file_path> (status=<frontmatter_status>)"` before exiting.
2. WHEN the same Frozen_Interception event occurs, THE hook script SHALL consult the Hook_Dedupe_Window at `.forge/.cmux-dedupe/<sha1(file_path)>.ts`; IF the timestamp in that file is newer than `now - 5000 ms`, THE hook SHALL emit the sidebar log in AC 1 but SHALL skip `cmux notify`; ELSE THE hook SHALL call `cmux notify --title "Forge 冻结拦截" --subtitle "<file_path_basename>" --body "文件 status=<frontmatter_status>，写入被阻断"` exactly once and write `now` as a unix-millis integer to the dedupe file.
3. THE Hook_Dedupe_Window SHALL be a file-system-based mechanism (not memory-based), because each PreToolUse hook invocation is a short-lived process; the dedupe file persists across hook invocations while the window (5 s) prevents notification storms on batch writes.
4. THE `.forge/.cmux-dedupe/` directory SHALL be garbage-collected by `scripts/prune-event-logs.sh` (extended or new logic) at most once per day: files older than 1 hour SHALL be removed. THE adapter SHALL NOT trigger this GC synchronously within the hook path.
5. IF `cmux` is not on PATH, THE hook script SHALL continue to exit with the same non-zero code without any additional output, preserving the existing interception behavior (Zero_Impact_Invariant).
6. THE Frozen_Interception cmux calls SHALL NOT change the hook's exit code nor delay its completion by more than 300 ms; IF the 300 ms budget is exceeded, THE cmux call SHALL be aborted and the hook SHALL proceed with its original non-zero exit.
7. THE Hook_Dedupe_Window SHALL operate independently of Process_Notification_Budget (Requirement 7); these two mechanisms SHALL NOT share state because they target different process lifetimes (short hook vs. long `/forge` session).

### Requirement 7: Forge Session 通知预算

**User Story:** As a Forge user running a long `/forge` session or `forge-loop` run, I want a hard cap on how many desktop notifications a single session can emit, so that noisy runs do not train me to ignore cmux notifications.

#### Acceptance Criteria

1. Mirror_Daemon SHALL maintain an in-memory counter named Process_Notification_Budget scoped to the current Forge_Session (Requirement 16); the counter SHALL reset on every session boundary transition.
2. THE Process_Notification_Budget SHALL default to 5 desktop notifications per Forge_Session; the value SHALL be configurable via `.forge/config.md` frontmatter optional field `cmux_notification_budget` (positive integer); Mirror_Daemon SHALL re-read this value on every session reset.
3. WHEN the counter has reached the budget, any further `cmux notify` call within the same Forge_Session SHALL be downgraded to `cmux log --level info --source forge "notification suppressed: <title>"` without raising an error.
4. THE Process_Notification_Budget SHALL NOT cover hook-process notifications (Requirement 6); hook dedup is governed by Hook_Dedupe_Window (R6.3) because hook invocations are separate short-lived processes and file-system-based dedup is the correct mechanism.
5. WHEN the user sets `cmux_notification_budget: 0`, ALL `cmux notify` calls in Mirror_Daemon SHALL be downgraded to log entries; sidebar status and progress calls SHALL remain unaffected.
6. THE Process_Notification_Budget SHALL NOT persist across Mirror_Daemon restarts or Forge_Session boundaries; each new session starts with a fresh budget.
7. WHEN a Forge Loop run triggers both a circuit-breaker notification (R4.5) and a natural-termination notification (R4.6) in the same session — an impossibility by design but enforced as a guard — Mirror_Daemon SHALL emit only the first of the two.

### Requirement 8: 浏览器 QA 回退（cmux browser harness）

**User Story:** As a Forge user running `/forge test` on a UI-bearing project without Playwright installed, I want cmux browser to serve as a zero-install fallback so that browser-side assertions from the designer spec can still be executed end-to-end.

#### Acceptance Criteria

1. WHEN `/forge test` is invoked AND the project meets either of: (a) its dependencies include `react` / `vue` / `next` / `electron`, (b) `.forge/specs/<feature>/spec.md` contains a designer section with UI assertions — AND no Playwright / Cypress / Storybook interaction test config file is present, THE Browser_QA_Fallback SHALL check `cmux_Available`; IF true, the fallback SHALL engage.
2. WHEN the Browser_QA_Fallback engages, THE fallback SHALL first call `cmux browser open <target_url>` to open the application under test, then **immediately** call `cmux browser identify --json` to read the newly created surface's `Workspace_Ref` and `surface_id`; THE fallback SHALL persist `surface_id` in process memory and use it as the `surface:<n>` prefix for all subsequent browser subcommands (e.g., `cmux browser surface:<n> snapshot --interactive --compact`, `cmux browser surface:<n> click <selector>`, `cmux browser surface:<n> fill <selector> --text <value>`, `cmux browser surface:<n> wait --text <marker>`).
3. THE Browser_QA_Fallback SHALL persist artifacts under `.forge/findings/<topic>/browser-qa/` containing at minimum: `snapshot-<step>.json` per `snapshot` call, `screenshot-<step>.png` per mutation step (via `--snapshot-after`), `console.log` from `cmux browser surface:<n> console list`, `errors.log` from `cmux browser surface:<n> errors list`, and `verdict.md` conforming to the Three_State_Verdict schema defined in the `cursor-team-kit-integration` spec Requirement 1.
4. IF any cmux browser command fails (non-zero exit, socket error), THE Browser_QA_Fallback SHALL record the failure in `.forge/findings/<topic>/browser-qa/errors.log` and produce an `INCONCLUSIVE` verdict rather than blocking `/forge test`; other Layer 2 test categories SHALL continue to run.
5. IF `cmux browser identify` (AC 2) fails to return a parseable `surface_id` within 5 seconds of `cmux browser open`, THEN THE Browser_QA_Fallback SHALL produce `INCONCLUSIVE` verdict with reason `"surface id acquisition failed"` and exit gracefully without attempting further browser commands.
6. WHEN the target URL is not reachable within 30 seconds of `cmux browser open` (the subsequent `cmux browser surface:<n> wait --load-state complete --timeout-ms 30000` fails), THE Browser_QA_Fallback SHALL produce `INCONCLUSIVE` verdict stating `"target not reachable"` and exit gracefully.
7. THE Browser_QA_Fallback SHALL NOT add any runtime or devDependency to Forge itself; it SHALL invoke `cmux browser` solely via shell subprocess.
8. WHEN the `cursor-team-kit-integration` UI_Harness (its Requirement 6) is already installed AND cmux is its selected controller, THE Browser_QA_Fallback in the present spec SHALL NOT run independently; instead it SHALL yield to the UI_Harness to avoid double execution.
9. THE Browser_QA_Fallback SHALL produce a single `cmux log --level <success|error> --source forge-test "browser qa: <verdict>"` entry when complete.

### Requirement 9: Forge 专属 cmux 工作区布局

**User Story:** As a new Forge contributor, I want project-local `.cmux/cmux.json` defining Forge-specific workspace layouts so that `⌘N` → "Forge Workflow" opens a ready-to-use layout with Claude Code, status tail, and progress tail panes without manual terminal arrangement.

#### Acceptance Criteria

1. THE Forge distribution SHALL include a starter `templates/cmux.json` that `scripts/init.sh` copies to newly initialized projects as `.cmux/cmux.json` only when the target file does not already exist; THE top-level Forge repository's own `.cmux/cmux.json` is dogfood-only and SHALL NOT be installed into user projects automatically.
2. THE starter `templates/cmux.json` SHALL define at minimum these three `commands` entries, AND each SHALL include a Mirror_Pane (bottom-most pane, 15% height) running `node scripts/cmux-mirror/mirror.mjs` as its command, because Mirror_Daemon is the strongly-coupled load-bearing component of this integration:
   - (a) `"Forge Workflow"`: Claude Code (left, 50%), `tail -f .forge/status.md` (top-right, ~21%), `tail -c 20000 -f .forge/progress/*.md 2>/dev/null` (mid-right, ~21%), **Mirror Pane** (bottom, 15% height); note the use of `tail -c 20000 -f` which shows the last 20 KB then continues streaming, unlike a broken `tail -f | head -c` pipeline;
   - (b) `"Forge Loop Monitor"`: `forge-loop --help` prompt (left, 40%), `tail -f .forge/knowledge/sessions/*.md` (top-right, ~25%), `watch -n 2 'git log --oneline -10 2>/dev/null'` (mid-right, ~25%), **Mirror Pane** (bottom, 15% height);
   - (c) `"Forge Dev"`: Claude Code (left, 50%), `npm test -- --watch` (top-right, ~21%), `npm run typecheck -- --watch` (mid-right, ~21%), **Mirror Pane** (bottom, 15% height).
3. THE starter `templates/cmux.json` SHALL define one `actions` entry with id `forge.newClaudeCode` that launches `claude --dangerously-skip-permissions` in a new tab of the current pane, keywords `["claude", "forge"]`, keyboard shortcut `cmd+shift+c`, and icon `{"type":"symbol","name":"sparkles"}`.
4. THE starter `templates/cmux.json` SHALL include a `ui.surfaceTabBar.buttons` entry that **replaces** the default button list (cmux semantic: `buttons` overrides defaults, not appends) with exactly `["cmux.newTerminal", "cmux.newBrowser", "cmux.splitRight", "cmux.splitDown", "forge.newClaudeCode"]`; this preserves all four built-in buttons in their standard order and adds Forge's Claude Code action as the fifth entry.
5. WHEN `scripts/init.sh --force` is passed, THE script SHALL overwrite an existing `.cmux/cmux.json` after printing a diff; without `--force`, an existing file SHALL NOT be touched.
6. WHEN a user runs `scripts/init.sh --no-cmux`, THE init step SHALL skip copying `templates/cmux.json` entirely.
7. THE starter `templates/cmux.json` SHALL NOT reference any absolute path other than those expanding from `$HOME` or relative paths rooted at the project, so the layout works across user machines.
8. IF the user's `.cmux/cmux.json` contains a schema error, THE error SHALL be the user's responsibility; Forge SHALL NOT auto-repair user-edited `.cmux/cmux.json`.
9. THE CI pipeline SHALL include a smoke test that parses `templates/cmux.json` as JSON and validates required top-level keys (`commands`, `actions`, `ui`) exist, to catch syntax regressions before release.

### Requirement 10: Cmux Forge 技能包（可选）

**User Story:** As a Forge user who wants their coding agent to actively drive cmux (not only receive signals from Forge), I want an optional skills bundle that teaches the agent how to use cmux CLI commands in a Forge-idiomatic way, so that the agent can proactively open browser splits, annotate the sidebar, and orchestrate layouts.

#### Acceptance Criteria

1. THE Forge distribution SHALL include an optional skills bundle at `cmux-skills/` containing at minimum: `cmux-skills/forge-sidebar-sync/SKILL.md`, `cmux-skills/forge-browser-qa/SKILL.md`, `cmux-skills/forge-loop-signals/SKILL.md`, `cmux-skills/install.sh`.
2. THE `cmux-skills/install.sh` script SHALL install skills to `~/.claude/skills/` (for Claude Code) by default, with an optional `--dest <path>` flag supporting `~/.codex/skills/` (for Codex) or any other directory.
3. THE `cmux-skills/install.sh` SHALL default to dry-run mode (print what would be copied) UNLESS `--apply` is passed, to prevent accidental installation.
4. THE `cmux-skills/install.sh` SHALL support a `--uninstall` flag that removes previously installed skills by reading a manifest at `<dest>/.cmux-skills-manifest.json`; IF the manifest is absent, `--uninstall` SHALL print the expected removal list and exit without deleting anything.
5. EACH `cmux-skills/*/SKILL.md` file SHALL be under 3072 bytes per the existing SKILL_Document constraint.
6. THE `forge-sidebar-sync` SKILL SHALL teach the agent to call `cmux set-status`, `cmux set-progress`, and `cmux log` under the `forge.` namespace during Forge phases, matching the Canonical_Sidebar_Payload defined in Requirement 2.
7. THE `forge-browser-qa` SKILL SHALL teach the agent the cmux browser command set (`open`, `identify --json` for surface acquisition, `snapshot`, `click`, `fill`, `wait`, `screenshot`, `console list`, `errors list`) sufficient to drive Browser_QA_Fallback (Requirement 8) without further context lookup.
8. THE `forge-loop-signals` SKILL SHALL teach the agent how to emit Forge Loop progress signals (R4) and how to read back `cmux sidebar-state --json` for self-diagnosis during long-running objectives.
9. THE skills bundle installation SHALL NOT be invoked from `scripts/init.sh` automatically; users SHALL opt in by running `./cmux-skills/install.sh --apply` explicitly.
10. WHEN the user removes the installed skills via `./cmux-skills/install.sh --uninstall --apply` OR a manual `rm -rf`, THE Forge core SHALL continue to function unchanged (Zero_Impact_Invariant).

### Requirement 11: 非功能性约束（性能、兼容性、i18n、安全）

**User Story:** As a Forge maintainer, I want explicit non-functional guarantees so that the cmux integration ships without regressing existing constraints.

#### Acceptance Criteria

1. WHEN `cmuxAvailable()` returns `false` on cold start, THE detection overhead SHALL be under 10 ms on macOS with SSD storage; on Linux or Windows, under 20 ms. THE detection SHALL hard-abort at 200 ms (per R1.2) rather than block Forge startup.
2. WHEN `cmuxAvailable()` returns `true`, Mirror_Daemon SHALL achieve a p95 end-to-end latency under 500 ms from a filesystem event on any watched `.forge/` path to the corresponding `cmux` CLI command being emitted, excluding the time cmux takes to render the sidebar.
3. THE Cmux_Adapter library SHALL be platform-agnostic: on non-macOS platforms (Linux, Windows, WSL), the library SHALL function if the user has somehow compiled / installed cmux there; otherwise `cmuxAvailable()` returns `false` and Mirror_Daemon does not start (Zero_Impact_Invariant).
4. THE i18n scope introduced by this feature SHALL cover: (a) `cmux notify` `--title`, `--subtitle`, `--body` values; (b) `cmux log` message bodies; (c) `cmux set-progress --label` values; (d) `.cmux/cmux.json` `commands[].name` and `commands[].description` values. THE following SHALL NOT be i18n'd because they are identifiers, not user-visible prose: `cmux log --source <name>` source names (e.g., `forge-loop`), `cmux set-status <key>` keys (e.g., `forge.phase`), action IDs in `actions` (e.g., `forge.newClaudeCode`). Each i18n'd string SHALL have entries in `locales/zh.json` and `locales/en.json`.
5. THE Cmux_Adapter library SHALL NOT store any secrets; it SHALL NOT write to `CMUX_SOCKET_PATH` any content derived from `.env` files, `.git/config` credentials, or MCP access tokens.
6. THE Cmux_Adapter library SHALL NOT call `cmux` commands that modify cmux configuration (`cmux reload-config`, editing `cmux.json`); read / write scope is limited to sidebar metadata, notifications, and browser automation commands.
7. THE core translation modules under `scripts/cmux-mirror/lib/` SHALL ship with fast-check property tests verifying: (a) `cmuxAvailable()` idempotence within a single process (same env + fs state → same return value); (b) Process_Notification_Budget monotonicity (every call either decrements available budget or is a no-op); (c) Canonical_Sidebar_Payload → cmux-key mapping totality (every valid phase produces a valid status icon; every out-of-domain phase produces `circle`); (d) Hook_Dedupe_Window idempotence (second call within 5 s returns the same decision); (e) Events_NDJSON parser tolerance (a single malformed line does not abort parsing of subsequent lines, per Requirement 14).
8. THE test suite SHALL include a mock-socket integration test harness at `test/cmux-mirror/mock-socket.ts` that simulates cmux's Unix-socket JSON-RPC responses, covering at minimum: availability detection, `set-status` / `set-progress` / `log` / `notify` round-trip via `cmux sidebar-state --json`, and stale-socket (ECONNREFUSED) handling. CI SHALL run these tests on Linux using a Unix-socket mock; native cmux is not required in CI.
9. THE cmux integration SHALL add no more than 5 new optional frontmatter fields to `.forge/config.md`: `cmux_integration`, `cmux_notification_budget`, `cmux_review_notify`, `cmux_session_idle_minutes`, `cmux_respawn_budget`; no required fields SHALL be added.
10. THE cmux integration SHALL add no new top-level SKILL directory (`skills/<name>/SKILL.md`). New functionality SHALL primarily live under `scripts/cmux-mirror/` (Mirror_Daemon, Sync_Once, shared library) and the optional `cmux-skills/` bundle. The only `src/` touchpoints SHALL be: (a) `src/sdk-driver.ts` gains Events_NDJSON append-only writes (Requirement 14); (b) `src/check-frozen.ts` gains exactly one line invoking `scripts/cmux-mirror/hook-notify.sh` after an interception decision; (c) `src/review.ts` extends `.forge/reviews/<topic>.md` frontmatter with the two fields defined in Requirement 15. No other `src/` module SHALL be modified.
11. THE cmux integration SHALL be compatible with the `cursor-team-kit-integration` spec's cmux references (its Requirements 5, 6, 12, 14); where both specs reference cmux behavior, the present spec's definitions SHALL be authoritative for the detection layer and the Cmux_Adapter library.
12. THE total Forge distribution size increase from this feature SHALL be under 80 KB for the core (excluding the optional `cmux-skills/` bundle and the starter `templates/cmux.json`); the additional 30 KB budget versus a pure-adapter design reflects the Mirror_Daemon's bundled dependencies such as a minimal file-watching shim.

### Requirement 12: 不变量与正确性属性

**User Story:** As a Forge contributor writing property tests, I want explicit invariants that must hold so that fast-check tests can be written directly from the requirements document.

#### Acceptance Criteria

1. THE `cmuxAvailable()` function SHALL be pure with respect to its environment inputs: for a fixed `process.env` and file-system state, two consecutive calls SHALL return identical values.
2. THE Process_Notification_Budget (maintained by Mirror_Daemon, per Requirement 7) SHALL be monotone non-increasing within a Forge_Session: each `cmux notify` call either decrements the remaining budget by 1 or leaves it unchanged (when the call is a no-op due to `cmuxAvailable()` being false or budget exhaustion); it SHALL never increase within a session. At session boundaries the counter resets to its configured default (R7.6).
3. THE Canonical_Sidebar_Payload → icon mapping (Requirement 2.3) SHALL be total over the domain `{decide, spec, plan, build, review, test, ship, learn, debug, idle}`: every value in the domain maps to exactly one icon; inputs outside the domain SHALL map to `circle`. THE mapping table lives in the Cmux_Adapter library (`scripts/cmux-mirror/lib/payload.mjs`) and is pure.
4. THE Canonical_Sidebar_Payload → color mapping (Requirement 2.4) SHALL be total over the domain `{light, standard, full}`; tier strings outside this domain SHALL cause the adapter to emit `set-status` without the `--color` flag (no color applied).
5. WHEN `cmuxAvailable()` is false, THE Mirror_Daemon SHALL NOT be started AND the Cmux_Adapter library methods SHALL satisfy the "observational no-op" property: for any sequence of library method calls, the observable behavior (return values, stdout, stderr, files written) SHALL be equivalent to calling no library methods at all.
6. THE Sync_Once script SHALL be idempotent when `.forge/status.md` and `.forge/progress/*.md` have not changed between invocations (no change-log side effect), as constrained by Requirement 2.5; Mirror_Daemon SHALL only emit cmux calls on observed filesystem changes.
7. THE Frozen_Interception integration (Requirement 6) SHALL preserve the existing hook exit-code invariant: for any (file, tool, tool_input) tuple, the exit code of `scripts/hook-check-frozen.sh` / `src/check-frozen.ts` SHALL be identical with and without cmux installed. THE single line appended to `src/check-frozen.ts` (per R11.10.b) SHALL be positioned after the interception decision has been made and SHALL NOT change that decision or its exit status.
8. THE Hook_Dedupe_Window SHALL be idempotent within its 5-second window: two consecutive hook invocations on the same file path within 5 s SHALL result in exactly one `cmux notify` call and exactly two `cmux log` calls.
9. THE starter `templates/cmux.json` (Requirement 9) SHALL parse successfully as valid JSON and contain the three required top-level keys (`commands`, `actions`, `ui`); Requirement 9.9 makes this a CI smoke test.
10. THE DAG progress ratio mapping (Requirement 3.2) SHALL satisfy: for all non-negative integers `(completed, total)` with `total > 0`, `ratio = clamp(completed / total, 0.0, 1.0)`; when `total == 0`, Mirror_Daemon SHALL NOT call `cmux set-progress` (no-op).
11. THE Events_NDJSON parser in Mirror_Daemon SHALL satisfy the tolerance property (Requirement 14): for any input file with some lines being valid JSON and others being malformed or partial, the parser SHALL yield all valid events in order and SHALL NOT abort on malformed lines; malformed lines SHALL be logged at debug level and skipped.
12. THE Forge_Session boundary detection (Requirement 16) SHALL satisfy totality: for any sequence of observed filesystem events, Mirror_Daemon SHALL classify the current session state as exactly one of `active` / `inactive` / `unknown`, where `unknown` is the safe default applied on Mirror_Daemon startup before the first boundary event is observed.

### Requirement 13: 边界条件与失败模式

**User Story:** As a Forge user, I want explicit behavior defined for edge cases such as stale sockets, concurrent sync, tmux nesting, and remote SSH sessions, so that the integration degrades predictably.

#### Acceptance Criteria

1. WHEN `/tmp/cmux.sock` exists but the cmux process has crashed (socket is stale, connect returns ECONNREFUSED), THE Cmux_Adapter library SHALL treat this as cmux_Available = false for the remainder of the Mirror_Daemon / Sync_Once process lifetime after the first failed connect, avoiding repeated connect attempts (sticky degradation).
2. WHEN two `/forge` invocations run concurrently in the same Workspace_Ref, EACH process SHALL apply its own sidebar updates; the last-writer-wins semantic of cmux's `set-status` is accepted, and Forge SHALL NOT attempt distributed coordination beyond the advisory lock in Requirement 2.10.
3. WHEN Mirror_Daemon is running inside a tmux session nested inside cmux, Mirror_Daemon SHALL prefer OSC_777_Passthrough for notifications (wrapping in `\ePtmux;\e\e…\e\\`) WHEN it detects `$TMUX` is set AND `$CMUX_WORKSPACE_ID` is also set.
4. WHEN Mirror_Daemon is running inside a remote SSH session launched via `cmux ssh user@remote`, Mirror_Daemon SHALL detect the remote scenario via `$CMUX_SOCKET_PATH` pointing to a socket forwarded from the local machine OR the absence of a local socket with `$CMUX_WORKSPACE_ID` still set; on mismatch, Mirror_Daemon SHALL degrade to OSC_777 notifications only and skip sidebar metadata calls.
5. WHEN `cmux` CLI is found on PATH, Mirror_Daemon SHALL invoke `cmux capabilities --json` once at startup to read the list of supported methods; WHEN a planned subcommand (e.g., `browser identify`, `set-progress`) is absent from the capabilities list, Mirror_Daemon SHALL skip that specific feature and continue with the rest. Mirror_Daemon SHALL NOT perform semantic-version comparisons against cmux releases because cmux is pre-1.0 and its versioning scheme is not yet stable.
6. WHEN the `.forge/.cmux-last-sync.json` tracking file is unreadable or corrupted, Sync_Once SHALL overwrite it with a fresh snapshot instead of failing; Mirror_Daemon SHALL treat an unreadable tracking file as "first sync" (full payload emission).
7. WHEN the Mirror_Daemon's stdout is redirected to a file (non-tty), Mirror_Daemon SHALL still function for CLI-driven operations but SHALL skip OSC-escape-based emissions that rely on a tty.
8. IF the user deletes `.cmux/cmux.json` during a Forge session, THE running Mirror_Daemon SHALL NOT be affected (cmux.json is consumed by cmux at workspace creation time, not by Mirror_Daemon or Forge).
9. WHEN `cmuxAvailable()` flips from true to false mid-process (cmux quits while Mirror_Daemon is running), Mirror_Daemon SHALL detect the first EPIPE / ECONNREFUSED on a CLI invocation, record it once at debug level, enter sticky-unavailable mode for the remainder of its process lifetime, and exit gracefully within 5 seconds instead of retrying.
10. WHEN the Forge_Workspace_Layout's `tail -c 20000 -f` target does not exist (e.g., `.forge/progress/*.md` is empty), THE pane SHALL still open and display a "no such file" message from the shell; Forge SHALL NOT pre-create placeholder files merely to satisfy the layout.
11. WHEN `.forge/.cmux-dedupe/` directory creation fails (e.g., `.forge` is read-only), THE hook SHALL fall through to emit the `cmux notify` call unconditionally (no dedup) and record the failure in `.forge/debug/cmux-dedupe-errors.log` if the directory is creatable there; otherwise silently continue.
12. WHEN Mirror_Daemon crashes unexpectedly (unhandled exception, OOM, OS-level kill), Sync_Once invocations from hooks SHALL detect the missing PID file (`.forge/.cmux-mirror.pid` stale or absent while expected) and SHALL attempt to respawn Mirror_Daemon at most Respawn_Budget times per Forge_Session (default 3, configurable via `.forge/config.md` frontmatter optional field `cmux_respawn_budget`). Sync_Once SHALL maintain a counter file at `.forge/.cmux-respawn-count`, incrementing atomically before each respawn attempt and resetting on session-start boundary events. IF the budget is exhausted, Sync_Once SHALL skip respawn, emit `cmux log --level warning --source forge-mirror "respawn budget exhausted (<n>/<budget>); manual restart required"` exactly once per session, and continue the one-shot sync without the daemon.
13. WHEN Sync_Once performs a respawn attempt within budget, it SHALL emit `cmux log --level warning --source forge-mirror "respawning after crash (<n>/<budget>)"` exactly once per respawn.
14. THE Respawn_Budget counter SHALL reset to 0 on Forge_Session start boundaries (Requirement 16.5), so transient crashes in a prior session do not constrain a fresh session.

### Requirement 14: Events_NDJSON 事件流规范

**User Story:** As a Forge maintainer, I want a structured event stream at `.forge/runs/<id>/events.ndjson` to be the source of truth for Forge Loop progress so that multiple consumers (Mirror_Daemon, `/forge learn --from-runs`, `/forge debug`) can read the same stream without additional Forge-side plumbing.

#### Acceptance Criteria

1. `src/sdk-driver.ts` SHALL append-only write to `.forge/runs/<id>/events.ndjson`, where `<id>` is the existing Run_Id managed by `src/run-manager.ts`; each event SHALL be written as exactly one line of JSON terminated by `\n`, and the write SHALL use `fs.appendFileSync` with `O_APPEND` semantics so concurrent appenders are safe.
2. Every event SHALL include these required fields: `ts` (ISO 8601 string), `type` (enum, see AC 3), `run_id` (string), and `schema_version` (integer, currently `1`).
3. THE event `type` enum SHALL be: `session_started` (emitted at Forge Loop startup, includes `objective`, `max_iterations`, `max_tokens`, `max_budget_usd`, `stop_when`, `worktree_mode`), `iter_started` (includes `iteration`, a positive integer), `iter_committed` (includes `iteration`, `commit_sha`, `subject`), `iter_rolled_back` (includes `iteration`, `reason`), `circuit_breaker_tripped` (includes `consecutive_failures`), `loop_terminated` (includes `reason` one of `natural` / `interrupted` / `error`, `total_iterations`, `total_commits`), `session_ended` (same as `loop_terminated` with `reason: "natural"`), `session_interrupted` (same with `reason: "interrupted"`).
4. IF `fs.appendFileSync` fails (disk full, permission error), THEN `src/sdk-driver.ts` SHALL catch the error, log it once to Forge's existing logger at warning level, and continue operation; Event writing is "best-effort, never fatal" — Forge Loop SHALL NOT exit or change behavior because event logging failed.
5. THE Events_NDJSON file SHALL NOT be truncated mid-file; when run cleanup happens (via existing `RunManager` retention), the entire `.forge/runs/<id>/` directory is removed together.
6. Mirror_Daemon's parser SHALL tolerate malformed lines: a JSON parse failure on line `n` SHALL log at debug level and continue parsing line `n+1` (per R12.11 tolerance property).
7. Mirror_Daemon SHALL maintain an in-memory cursor (byte offset) per watched events.ndjson file so it only parses new bytes on each `fs.watch` change event; THE cursor SHALL be rebuilt on Mirror_Daemon restart by re-parsing from the start of file.
8. Events_NDJSON SHALL NOT contain secrets: `objective`, `subject`, and `reason` fields SHALL be passed through the same redaction logic used by `scripts/prune-event-logs.sh` before being written; at minimum, any value matching common secret patterns (e.g., `sk-`, `ghp_`, `ATATT`) SHALL be replaced with `[REDACTED]`.
9. THE Events_NDJSON schema MAY be extended in future Forge versions by adding new event types or new optional fields; removing an event type or required field constitutes a `schema_version` bump that Mirror_Daemon SHALL detect and refuse to parse at older-than-supported versions.
10. THE Events_NDJSON file SHALL be treated as Open_Zone content per Forge's Three_Zone_Model; no PreToolUse hook intercepts it.

### Requirement 15: Reviews Frontmatter 扩展

**User Story:** As Mirror_Daemon's review-completion detector, I want `.forge/reviews/<topic>.md` frontmatter to contain explicit layer status and completion timestamp fields so that review completion can be detected observationally without the SKILL needing to call any adapter entrypoint.

#### Acceptance Criteria

1. `src/review.ts` SHALL write `.forge/reviews/<topic>.md` frontmatter with two new fields in addition to existing fields: `layers_status` (object with keys `spec_check`, `quality_check`, `security_check`, each with value `pending` | `done` | `failed`) and `completed_at` (ISO 8601 string or `null`).
2. WHEN `/forge review` starts the three-layer fan-out, `src/review.ts` SHALL initialize `layers_status` with all three keys set to `pending` and `completed_at: null`; THE initial file SHALL exist even before any layer has completed, so Mirror_Daemon can subscribe to it from its creation.
3. WHEN a single layer Subagent completes with a valid output, `src/review.ts` SHALL update `layers_status.<layer>` from `pending` to `done` via an atomic frontmatter rewrite (read, parse, mutate, write to tmp, rename).
4. WHEN a single layer Subagent fails (non-zero exit / timeout / unreadable output per CTK_Background_Subagent semantics), `src/review.ts` SHALL update `layers_status.<layer>` to `failed`.
5. WHEN all three `layers_status` values are in terminal state (`done` or `failed`), `src/review.ts` SHALL set `completed_at` to the current ISO 8601 timestamp in the same atomic rewrite as the final layer transition, so Mirror_Daemon can detect completion via the presence of a non-null `completed_at`.
6. THE atomic rewrite SHALL preserve all other frontmatter fields verbatim and SHALL NOT modify the markdown body.
7. Reviews files written by older Forge versions that lack `layers_status` / `completed_at` SHALL be tolerated by Mirror_Daemon: the file SHALL be skipped for review-completion notification (R5.3 guard), but per-layer log emission (R5.1) falls back to detecting body-section additions rather than frontmatter transitions.
8. CI SHALL include a test that verifies `.forge/reviews/<topic>.md` produced by `/forge review` always contains both frontmatter fields with valid schema.

### Requirement 16: Forge_Session 边界定义

**User Story:** As Mirror_Daemon maintaining Process_Notification_Budget, I want a well-defined Forge_Session boundary so that the notification counter resets at predictable points and a long-running mirror does not exhaust its budget across logically distinct user sessions.

#### Acceptance Criteria

1. A Forge_Session SHALL be defined as the period between a session-start boundary and a session-end boundary, where boundaries are observable filesystem events as specified in AC 2 and AC 3.
2. `/forge` session boundaries SHALL be derived from `.forge/status.md` frontmatter: session-start is a write that transitions `phase` from `idle` to any non-idle value OR a write where `current_topic` changes from one non-empty value to a different non-empty value; session-end is a write that transitions `phase` back to `idle` OR a period of 15 minutes of no writes to `.forge/status.md` (inactivity timeout).
3. `forge-loop` session boundaries SHALL be derived from Events_NDJSON (Requirement 14): session-start is the `session_started` event; session-end is either `session_ended` or `session_interrupted`.
4. Mirror_Daemon SHALL subscribe to both boundary sources concurrently and SHALL track the current session state as one of `active` / `inactive` / `unknown` (the `unknown` state is the boot-time default before any boundary event is observed, per R12.12).
5. WHEN a session-start boundary is observed, Mirror_Daemon SHALL reset the Process_Notification_Budget counter to its configured default (`cmux_notification_budget` or 5) and re-read the `.forge/config.md` frontmatter values (so budget changes during an `idle` period take effect on the next session).
6. WHEN a session-end boundary is observed, Mirror_Daemon SHALL keep the existing counter value until the next session-start event, so any notifications emitted during the "between sessions" window draw from the last session's budget; this keeps the definition simple and avoids a third counter state.
7. THE inactivity timeout (AC 2, 15 minutes) SHALL be configurable via `.forge/config.md` optional field `cmux_session_idle_minutes` (positive integer, default 15); this brings the total of optional frontmatter fields added by this feature to 5 (including `cmux_respawn_budget` from R13.12) — R11.9 SHALL be read with this 5-field total.
8. WHEN Mirror_Daemon starts while a Forge_Session is already in progress (e.g., user starts `/forge build` first, then opens the Forge Workflow layout), Mirror_Daemon SHALL detect the in-progress session by reading the current `.forge/status.md` and initializing its session state to `active` with a fresh budget.
9. Concurrent `/forge` invocations in different Workspace_Refs SHALL be treated as independent sessions; Mirror_Daemon maintains a per-Workspace_Ref counter map so budget exhaustion in one workspace does not affect another.

### Requirement 17: Mirror Push 通道（主动推送逃生口）

**User Story:** As a Forge SKILL author facing a moment where fs.watch-based observation is too slow to reflect a state change in cmux's sidebar (for example, the instant a spec is locked and the user needs the sidebar to update before their next keystroke), I want an optional push endpoint so the SKILL can explicitly ask Mirror_Daemon to project the latest state immediately, without giving up the observer architecture's default zero-impact property.

#### Acceptance Criteria

1. WHEN Mirror_Daemon starts, it SHALL additionally bind a Unix domain socket at `.forge/.cmux-mirror.sock` in addition to its `fs.watch` loop. THE socket SHALL be created with mode `0600` (owner read/write only) so other users on the machine cannot inject events.
2. THE socket SHALL accept newline-delimited JSON (NDJSON) requests, one Mirror_Push_Event per line; Mirror_Daemon SHALL parse each line and route it to the same event handlers used by `fs.watch` (phase change, progress update, review completion, etc.).
3. THE Mirror_Push_Event `type` field SHALL be one of: `resync_now` (payload is ignored; triggers a full `.forge/` state resync equivalent to Sync_Once), `phase_changed` (payload: `{phase, current_topic}`; triggers an immediate sidebar phase update), `layer_completed` (payload: `{topic, layer, status}`; triggers the per-layer review log emission early). Unknown `type` values SHALL be logged at debug and silently skipped.
4. Mirror_Daemon SHALL NOT accept any Mirror_Push_Event `type` that can emit cmux notifications (e.g., there is no `force_notify` type). Notification emission remains governed by observed state transitions and Process_Notification_Budget; the push channel is for latency optimization, not as a notification generator.
5. WHEN Mirror_Daemon is not running (PID file absent, socket not created), push attempts SHALL fail silently on the caller side (EPIPE/ENOENT on connect); `scripts/cmux-mirror/push.sh` wrapper SHALL swallow these errors and exit 0, so Forge SKILLs that use push opportunistically are not broken by a missing daemon.
6. SKILL authors SHALL invoke push via `bash scripts/cmux-mirror/push.sh <type> [json-payload]`; the wrapper SHALL handle JSON escaping, socket connection, and error suppression. Direct socket protocol details SHALL NOT be part of any SKILL's public contract — only the `push.sh` CLI is stable.
7. Push invocation SHALL be opt-in: no SKILL SHALL fail or degrade if it does not call push.sh. The default observer path (fs.watch + Sync_Once) remains the authoritative mechanism; push only **accelerates** propagation for a subset of state changes, it does not **replace** observation.
8. Mirror_Daemon SHALL rate-limit push acceptance at a sustained rate of no more than 20 events/second per connection to guard against runaway loops; over-rate events SHALL be dropped with a debug log. This rate is not user-configurable because any legitimate use case fits well under it.
9. THE Mirror_Push_Socket SHALL be an Open_Zone artifact (not Frozen_Zone), tracked by `scripts/prune-event-logs.sh`'s existing cleanup path only for orphaned socket files (socket exists but PID file is stale or PID is dead).
10. IF push.sh is invoked in a process lifetime where `cmuxAvailable()` returns false, it SHALL exit 0 immediately without attempting socket connection, consistent with Zero_Impact_Invariant.

## Out of Scope

Explicitly out of scope for this feature:

1. **非 macOS 平台的 cmux 支持** — cmux is macOS-only; this spec does not attempt Linux / Windows equivalents, though adapter code remains portable and dormant on those platforms.
2. **修改 cmux 自身代码** — this feature does not fork, patch, or require changes to the upstream cmux project; all integration is one-directional (Forge → cmux).
3. **Electron / VS Code 内嵌终端集成** — Cursor, VS Code, JetBrains in-editor terminals do not expose cmux's socket API; this feature does not provide analogous integration for those environments.
4. **跨 workspace 全局仪表盘** — aggregating sidebar state across multiple cmux workspaces into a single "Forge dashboard" view is not in scope; Mirror_Daemon operates per-workspace with a per-Workspace_Ref counter map (R16.9).
5. **通过 cmux MCP 暴露 Forge 控制面** — exposing Forge control as an MCP server that cmux consumes is not in scope; the integration direction is one-way (Forge → cmux CLI / socket via Mirror_Daemon), not bidirectional.
6. **Forge 内部 Subagent 切换为 cmux claude-teams 模式** — `cmux claude-teams` is referenced as documentation only; migrating Forge's existing Agent-tool fan-out to claude-teams mode is a separate v3.0 roadmap item tracked under Agent Teams migration.
7. **替换现有 `.forge/status.md` 为 cmux 侧边栏单一数据源** — `.forge/status.md` remains the source of truth; cmux sidebar is a projection produced by Mirror_Daemon, not a replacement. Removing `.forge/status.md` would break non-cmux users and is not in scope.
8. **端到端真实 cmux 测试** — fast-check property tests over `scripts/cmux-mirror/lib/` and mock-socket integration tests (R11.7, R11.8) are in scope; running end-to-end tests against a real running cmux instance in CI is not in scope (CI runs headless without macOS / cmux).
9. **Mirror_Daemon 以外的消费者** — Events_NDJSON (R14) is designed to also serve `/forge learn --from-runs` and `/forge debug`, but implementing those consumer-side features is out of scope for this spec and is tracked in ROADMAP.
10. **守护进程跨机器同步** — the mirror is local-only; syncing sidebar state across multiple machines via SSH forwarding, Tailscale, or other tunnels is not in scope (cmux's own `cmux ssh` handles this at the cmux layer, and R13.4 covers adaptation to that scenario).
