---
feature: cmux-integration
layout: design
created: 2026-05-08
---

# Design Document

## 1. Overview

### 1.1 设计目标

本设计将 `requirements.md` 中 17 条 Requirement 映射为 **1 个守护进程 + 1 个一次性同步脚本 + 1 个推送瘦包装 + 1 套共享库 + 1 个 hook 瘦封装 + 1 套 starter 布局 + 1 个可选技能包**，采用**观察者架构 + 可选主动推送**（Observer + opt-in Push）：Forge 核心对 cmux 零认知，默认由 Mirror_Daemon 通过 `fs.watch` 观察 `.tinkerman/` 状态文件与 `Events_NDJSON` 事件流并翻译为 cmux CLI 调用；在少数需要毫秒级响应的场景下，SKILL 可通过 `scripts/cmux-mirror/push.sh` 主动推送至 Mirror_Push_Socket 加速投影（R17）。

映射关系：

| Requirement | 主要实现载体 |
|---|---|
| R1 可用性检测与零影响降级 | `scripts/cmux-mirror/lib/availability.mjs` + Mirror_Pane 启动守卫 |
| R2 阶段状态 → 侧边栏同步 | `scripts/cmux-mirror/mirror.mjs`（fs.watch 主循环） + `sync-once.mjs`（hook 防御性同步） |
| R3 DAG 并行进度 | Mirror_Daemon 观察 `.tinkerman/progress/<topic>.md` + `parseProgressDag()` 纯函数 |
| R4 Forge Loop → 长时运行信号 | `src/sdk-driver.ts` 写 Events_NDJSON + Mirror_Daemon 消费事件流 |
| R5 评审聚合通知 | `src/review.ts` 写 frontmatter `layers_status` + Mirror_Daemon 观察转换 |
| R6 冻结拦截侧边栏与通知 | `scripts/cmux-mirror/hook-notify.sh` + `.tinkerman/.cmux-dedupe/` 文件系统 TTL |
| R7 Forge Session 通知预算 | Mirror_Daemon 内存计数器 + R16 会话边界 |
| R8 浏览器 QA 回退 | `scripts/cmux-mirror/browser-qa.mjs` + `skills/forge-test/references/cmux-browser.md` |
| R9 专属 cmux 工作区布局 | `templates/cmux.json`（三种布局每种含 Mirror_Pane） |
| R10 可选 cmux 技能包 | `cmux-skills/` 目录 + `install.sh --apply/--uninstall` + manifest |
| R11 NFR | 横切约束（§6） + i18n / NFR 测试 |
| R12 不变量 | fast-check property tests 针对 `scripts/cmux-mirror/lib/` 纯函数模块（§8.1） |
| R13 边界与失败模式 | Mirror_Daemon 的 sticky-unavailable 状态机（§4.2.3） |
| R17 Mirror Push 主动推送通道 | Mirror_Daemon 监听 `.tinkerman/.cmux-mirror.sock` + `scripts/cmux-mirror/push.sh` 瘦包装 |
| R14 Events_NDJSON 规范 | `src/sdk-driver.ts` 写入侧 + `lib/events.mjs` 读取侧 |
| R15 Reviews Frontmatter | `src/review.ts` 原子重写 + `lib/reviews.mjs` 读取 |
| R16 Forge Session 边界 | Mirror_Daemon 的会话状态机 + `.tinkerman/config.md` `cmux_session_idle_minutes` |

### 1.2 高层架构

```ascii
┌───────────────────────────────────────────────────────────────────────────┐
│                    Forge 主进程（/forge 或 forge-loop）                    │
│                                                                           │
│   13 SKILLs （外部契约零变化）                                            │
│   │                                                                       │
│   写入 .tinkerman/  ←── source of truth                                       │
│   ├── status.md                    (既有)                                │
│   ├── progress/<topic>.md          (既有)                                │
│   ├── reviews/<topic>.md           (既有 + 新增 2 字段 R15)              │
│   ├── runs/<id>/events.ndjson      (新增 R14)                            │
│   └── reviews/<topic>.canvas.html  (CTK spec R4 已定义)                  │
│                                                                           │
│   src/ 改动（≤ 3 个文件，R11.10）                                        │
│   ├── sdk-driver.ts       → append Events_NDJSON (R14.1–R14.8)           │
│   ├── check-frozen.ts     → 1 行：exec hook-notify.sh (R6.1)              │
│   └── review.ts           → 原子重写 layers_status / completed_at (R15)  │
└───────────────────────────────────────────────────────────────────────────┘
                            │  fs 写入
                            ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                   cmux-mirror 集成层（零运行时依赖耦合）                   │
│                                                                           │
│   scripts/cmux-mirror/                                                    │
│   ├── mirror.mjs                ◀── 守护进程；fs.watch + push socket 主循环│
│   ├── sync-once.mjs             ◀── hook 触发；防御性二次同步 + respawn   │
│   ├── push.sh                   ◀── SKILL 主动推送瘦包装（R17）           │
│   ├── hook-notify.sh            ◀── check-frozen 调用；R6 瘦封装         │
│   ├── browser-qa.mjs            ◀── /forge test 浏览器 QA 回退（R8）     │
│   ├── install-template.sh       ◀── init.sh 调用；拷贝 cmux.json         │
│   └── lib/                                                                │
│       ├── availability.mjs      ◀── cmuxAvailable() (R1.1)                │
│       ├── capabilities.mjs      ◀── cmux capabilities --json 缓存 (R13.5)│
│       ├── payload.mjs           ◀── CanonicalSidebarPayload 映射 (R2.3)  │
│       ├── reader.mjs            ◀── 纯函数：从 .tinkerman/ 读状态             │
│       ├── emitter.mjs           ◀── 纯函数：payload → cmux CLI 命令      │
│       ├── events.mjs            ◀── Events_NDJSON 解析 + cursor (R14.6)  │
│       ├── reviews.mjs           ◀── reviews frontmatter 解析 (R15)        │
│       ├── session.mjs           ◀── Forge_Session 状态机 (R16)            │
│       ├── budget.mjs            ◀── Process_Notification_Budget (R7)     │
│       ├── dedupe.mjs            ◀── HookDedupeWindow 读写 (R6.2)          │
│       ├── push-server.mjs       ◀── Mirror_Push_Socket 监听（R17）        │
│       ├── respawn.mjs           ◀── Respawn_Budget 计数（R13.12–14）      │
│       └── cli.mjs               ◀── cmux 子进程封装（timeout、捕获）     │
│                                                                           │
│   templates/cmux.json           ◀── starter 布局（含 Mirror_Pane × 3）    │
│   cmux-skills/                  ◀── 可选技能包；opt-in install            │
│                                                                           │
│   hooks/hooks.json（扩展，仅追加条目，不重排）                            │
│   ├── UserPromptSubmit → sync-once.mjs（防御）                            │
│   ├── PostToolUse (Write|Edit) → sync-once.mjs（防御）                    │
│   └── Stop → sync-once.mjs（防御）                                        │
│   已有 check-frozen 挂接：PreToolUse hook 通过 src/check-frozen.ts        │
│           结尾调用 hook-notify.sh（R6.1）                                 │
└───────────────────────────────────────────────────────────────────────────┘
                            │  cmux CLI / socket / OSC
                            ▼
         cmux（可选；未安装时 Mirror_Daemon 不被启动）
         ├── CLI: cmux {set-status|set-progress|log|notify|sidebar-state}
         ├── Socket: /tmp/cmux.sock（JSON-RPC）
         └── Browser: cmux browser {open|identify|snapshot|click|...}
```

### 1.3 集成原则

1. **观察者架构是一等公民**：Forge 写 `.tinkerman/` 是既有行为；Mirror_Daemon 只从外部观察并翻译。Forge 核心代码路径不包含任何 cmux 条件分支。
2. **推送是可选加速器，不是替代**：Mirror_Push_Socket（R17）存在是为了应对极个别"毫秒级响应"场景；默认路径仍是 fs.watch。Forge 核心代码与既有 SKILL **永不**依赖推送通道。
3. **Zero-Impact 物理化**：cmux 不可用时，Mirror_Pane 命令在启动阶段检测后直接 exit 0，Mirror_Daemon **根本不会被启动**；推送通道也因此不存在，push.sh 首次连接即 ENOENT 退出 0（R17.5、R17.10）。这比"守卫 + no-op"更彻底。
4. **强制守护 + 防御性同步 + 受限自愈三层**：Mirror_Daemon 提供秒级延迟（fs.watch），sync-once.mjs 在 hook 里兜底，Respawn_Budget（R13.12–14）限制自动重启次数避免疯狂重启掩盖问题。
5. **fs.watch + polling 双模式**：macOS 本地 SSD 上使用 `fs.watch` 原生事件；检测到在 Network Volume / Docker mount 等不稳定 FS 时降级到 chokidar 的 polling（1s 间隔，实测开销可接受）。
6. **事件流是共同资产**：Events_NDJSON 不是为 cmux 专门做的，它同时服务 `/forge learn --from-runs`、`/forge debug` 等未来消费者。
7. **能力探测取代版本号**：`cmux capabilities --json` 是权威能力清单；planned 命令不在列表就跳过。
8. **单次探测、粘性降级**：任何一次 EPIPE/ECONNREFUSED 即触发进程级粘性降级，避免 retry storm。

### 1.4 设计非目标

- **不构建 MCP 层**：Forge → cmux 是单向，不暴露 MCP 服务器（Out of Scope #5）。
- **不改写 `.tinkerman/status.md` 为 cmux 单一数据源**：status.md 仍是 SoT，cmux sidebar 是投影（Out of Scope #7）。
- **不做跨 workspace 聚合**：Mirror_Daemon per-Workspace_Ref 独立（Out of Scope #4，R16.9）。
- **不依赖真实 cmux 做 CI**：`test/cmux-mirror/mock-socket.ts` 在 Linux runner 模拟（Out of Scope #8，R11.8）。
- **不跨机器同步**：cmux 自身的 `cmux ssh` 处理远端；R13.4 仅负责适配到该场景（Out of Scope #10）。

---

## 2. Component Architecture

### 2.1 新增组件清单

| 类型 | 路径 | 职责 | Requirement | LoC 估算 |
|---|---|---|---|---|
| Node 守护 | `scripts/cmux-mirror/mirror.mjs` | 守护进程：`fs.watch` 主循环 + push-server + 会话状态机 + cmux CLI 发射 | R2, R3, R4, R5, R7, R13, R16, R17 | 500 |
| Node CLI | `scripts/cmux-mirror/sync-once.mjs` | hook 触发：一次性读 `.tinkerman/` → 推 cmux；respawn 受限自愈 | R2.7, R2.8, R13.12–14 | 160 |
| Bash | `scripts/cmux-mirror/push.sh` | SKILL 主动推送瘦包装（连接 Mirror_Push_Socket） | R17.6 | 60 |
| Bash | `scripts/cmux-mirror/hook-notify.sh` | 冻结拦截瞬时通知（含 dedupe 读写） | R6 | 80 |
| Node CLI | `scripts/cmux-mirror/browser-qa.mjs` | `/forge test` 浏览器 QA 回退 | R8 | 350 |
| Bash | `scripts/cmux-mirror/install-template.sh` | init.sh 调用：拷贝 cmux.json 到用户项目 | R9.1, R9.5, R9.6 | 70 |
| Node 纯库 | `scripts/cmux-mirror/lib/availability.mjs` | `cmuxAvailable()` + sticky cache | R1.1, R1.2, R13.1, R13.9 | 90 |
| Node 纯库 | `scripts/cmux-mirror/lib/capabilities.mjs` | `cmux capabilities --json` 读缓存 | R13.5 | 70 |
| Node 纯库 | `scripts/cmux-mirror/lib/payload.mjs` | `CanonicalSidebarPayload` + icon/color 映射表 | R2.3, R2.4, R12.3, R12.4 | 140 |
| Node 纯库 | `scripts/cmux-mirror/lib/reader.mjs` | 从 `.tinkerman/status.md`、`.tinkerman/progress/`、`.tinkerman/reviews/` 读取并合成 payload | R2.1, R12.10 | 200 |
| Node 纯库 | `scripts/cmux-mirror/lib/emitter.mjs` | payload → cmux CLI 命令序列（纯函数） | R2.2, R3.2, R4.2 | 180 |
| Node 纯库 | `scripts/cmux-mirror/lib/events.mjs` | Events_NDJSON 解析 + 字节游标 + malformed 容忍 | R14.6, R14.7, R12.11 | 180 |
| Node 纯库 | `scripts/cmux-mirror/lib/reviews.mjs` | reviews frontmatter 读取与状态差分（使用 `yaml` 库做 serialize） | R15 | 130 |
| Node 纯库 | `scripts/cmux-mirror/lib/session.mjs` | Forge_Session 边界检测与状态机 | R16, R12.12 | 180 |
| Node 纯库 | `scripts/cmux-mirror/lib/budget.mjs` | `ProcessNotificationBudget` | R7 | 80 |
| Node 纯库 | `scripts/cmux-mirror/lib/dedupe.mjs` | `HookDedupeWindow` 文件系统 TTL | R6.2, R12.8 | 90 |
| Node 纯库 | `scripts/cmux-mirror/lib/push-server.mjs` | Unix socket 监听 + rate limit + 事件分发（R17） | R17 | 150 |
| Node 纯库 | `scripts/cmux-mirror/lib/respawn.mjs` | Respawn_Budget 计数：`.tinkerman/.cmux-respawn-count` 原子读写 + session 边界重置 | R13.12–14 | 80 |
| Node 纯库 | `scripts/cmux-mirror/lib/cli.mjs` | cmux CLI 子进程封装（timeout、debug log） | R1.4, R11.2 | 120 |
| JSON | `templates/cmux.json` | Forge Workflow / Loop Monitor / Dev + Mirror_Pane × 3 | R9.2–R9.4 | 220 |
| Markdown | `cmux-skills/` | 3 个可选 SKILL + installer + manifest | R10 | 1500（文档） |
| Test mock | `test/cmux-mirror/mock-socket.ts` | cmux Unix socket JSON-RPC 模拟 | R11.8 | 220 |
| **依赖** | `yaml` (npm) | 用于 `src/review.ts` 和 `lib/reviews.mjs` 的 frontmatter 原子重写（替代字符串拼接） | R15.3 | — |

### 2.2 既有模块的最小扩展（R11.10 只允许 3 处 src/ 改动）

| 文件 | 改动 | 行数预算 | Requirement |
|---|---|---|---|
| `src/sdk-driver.ts` | 在 9 个生命周期切点追加 Events_NDJSON 写入（`session_started` / `iter_started` / `iter_committed` / `iter_rolled_back` / `circuit_breaker_tripped` / `loop_terminated` / `session_ended` / `session_interrupted` / 错误通道） | ≤ 100 行（含一个 `writeEvent(type, payload)` 辅助方法） | R4, R14 |
| `src/check-frozen.ts` | **仅在函数最末尾、判定阻断 decision 已确定后**追加一行：`exec("scripts/cmux-mirror/hook-notify.sh", [filePath, status]).catch(()=>{})`。exit code 与主逻辑完全不变。 | 1 行 + 1 个条件 | R6.1, R12.7 |
| `src/review.ts` | 在三层 Subagent fan-out 的初始化、每层完成、全部完成 3 个切点，通过新辅助函数 `updateReviewFrontmatter()` 原子重写 `layers_status` 与 `completed_at` | ≤ 80 行（含 atomic rewrite helper） | R15 |

**其他 src/ 模块零改动**。既有 92 个 src/ 模块（`src/state.ts`、`src/handoff.ts`、`src/task-graph.ts` 等）全部不改。

### 2.3 Hooks 扩展（仅追加）

`hooks/hooks.json` 追加 3 条非阻塞条目，**既有条目零改动**（R2.7）：

```json
{
  "UserPromptSubmit": [
    {
      "hooks": [
        { "type": "command", "command": "node scripts/cmux-mirror/sync-once.mjs 2>/dev/null || node ~/.claude/skills/forge/scripts/cmux-mirror/sync-once.mjs 2>/dev/null || true", "timeout": 2 }
      ]
    }
  ],
  "PostToolUse": [
    { "matcher": "Write|Edit", "hooks": [
        { "type": "command", "command": "node scripts/cmux-mirror/sync-once.mjs 2>/dev/null || node ~/.claude/skills/forge/scripts/cmux-mirror/sync-once.mjs 2>/dev/null || true", "timeout": 2 }
      ]
    }
  ],
  "Stop": [
    {
      "hooks": [
        { "type": "command", "command": "node scripts/cmux-mirror/sync-once.mjs 2>/dev/null || node ~/.claude/skills/forge/scripts/cmux-mirror/sync-once.mjs 2>/dev/null || true", "timeout": 2 }
      ]
    }
  ]
}
```

已有 PreToolUse hook 里调用 `check-frozen.ts` 的链路保持不变，check-frozen 在 TypeScript 侧尾部 exec `hook-notify.sh`。

### 2.4 SKILL references（零主文档改动）

不改任何 SKILL.md 主体，只在以下位置新建 `references/cmux.md` 描述可选的 cmux 行为（供 agent / 开发者查阅，非强制）：

| SKILL | references/cmux.md 内容 | Requirement |
|---|---|---|
| `forge-review` | 说明 Mirror_Daemon 通过 frontmatter `layers_status` 观察完成；canvas 文件出现自动 emit log；SKILL 无需调任何 adapter 入口 | R5.2, R5.7, R15 |
| `forge-test` | 说明 Browser_QA_Fallback 触发条件；当 CTK UI_Harness 已安装 + cmux 是 controller 时 yield | R8.1, R8.8 |
| `forge-build` | 说明 Mirror_Daemon 从 `.tinkerman/progress/<topic>.md` 读 DAG；SKILL 无需主动推送 | R3 |
| `forge-ship` | 提示 `/forge ship` 完成时 Mirror_Daemon 会根据 status.md `phase` → `idle` 转换推送聚合状态 | R16.2 |
| `forge-abort` | 说明 abort 触发 Mirror_Daemon 通过 session_interrupted 事件（或 status.md phase 变化）清理 sidebar | R4.7, R4.10 |

---

## 3. Data Design

### 3.1 目录结构（新增）

```
.tinkerman/                                 # 既有根目录，新增子路径
├── runs/
│   └── <run-id>/
│       └── events.ndjson              # [R14] Forge Loop 事件流（append-only）
├── reviews/
│   └── <topic>.md                     # 既有，frontmatter 增 2 字段 (R15)
├── .cmux-last-sync.json               # [R2.5] per-Workspace_Ref sync 快照
├── .cmux-mirror.pid                   # [R13.12] Mirror_Daemon PID 文件
├── .cmux-mirror.sock                  # [R17.1] Mirror_Push_Socket（mode 0600）
├── .cmux-mirror-cursor.json           # [R14.7] Events_NDJSON 字节游标
├── .cmux-respawn-count                # [R13.12] Respawn_Budget 计数（整数 ASCII）
├── .cmux-dedupe/                      # [R6.2] 冻结拦截文件系统 TTL
│   ├── <sha1>.ts                      #   文件名 = sha1(abs_path); 内容 = unix millis
│   └── ...
├── .locks/
│   ├── cmux-sync.lock                 # [R2.10] sync-once.mjs 并发锁
│   └── cmux-mirror.lock               # [R2.10] Mirror_Daemon 单例锁
├── findings/
│   └── <topic>/
│       └── browser-qa/                # [R8.3] 浏览器 QA 产物
│           ├── snapshot-<n>.json
│           ├── screenshot-<n>.png
│           ├── console.log
│           ├── errors.log
│           └── verdict.md             # CTK spec R1 Three_State_Verdict 兼容
└── debug/
    └── cmux-dedupe-errors.log         # [R13.11] 可选错误日志

.cmux/
└── cmux.json                          # [R9.1] init.sh 从 templates/cmux.json 拷贝

templates/
└── cmux.json                          # [R9.1] Forge 分发的 starter 模板

cmux-skills/
├── forge-sidebar-sync/SKILL.md        # [R10.1]
├── forge-browser-qa/SKILL.md          # [R10.1]
├── forge-loop-signals/SKILL.md        # [R10.1]
├── install.sh                         # [R10.2, R10.3, R10.4]
└── .cmux-skills-manifest.json         # [R10.4] 由 --apply 写入目标目录

scripts/cmux-mirror/
├── mirror.mjs
├── sync-once.mjs
├── push.sh
├── hook-notify.sh
├── browser-qa.mjs
├── install-template.sh
└── lib/
    ├── availability.mjs
    ├── capabilities.mjs
    ├── payload.mjs
    ├── reader.mjs
    ├── emitter.mjs
    ├── events.mjs
    ├── reviews.mjs
    ├── session.mjs
    ├── budget.mjs
    ├── dedupe.mjs
    ├── push-server.mjs
    ├── respawn.mjs
    └── cli.mjs

test/cmux-mirror/
├── mock-socket.ts
└── fixtures/
    ├── capabilities-full.json
    ├── capabilities-partial.json
    ├── status-build.md
    ├── progress-wave2.md
    ├── review-in-progress.md
    └── events-session.ndjson
```

### 3.2 Data Schemas

#### 3.2.1 `.tinkerman/runs/<id>/events.ndjson` [R14]

每行一个 JSON 对象，必须包含 `ts`、`type`、`run_id`、`schema_version` 四个字段。

```jsonl
{"schema_version":1,"ts":"2026-05-08T10:00:00.000Z","type":"session_started","run_id":"r-20260508-100000-abc","objective":"Add user pagination API","max_iterations":20,"max_tokens":500000,"max_budget_usd":5.00,"stop_when":null,"worktree_mode":false}
{"schema_version":1,"ts":"2026-05-08T10:00:12.345Z","type":"iter_started","run_id":"r-20260508-100000-abc","iteration":1}
{"schema_version":1,"ts":"2026-05-08T10:03:42.123Z","type":"iter_committed","run_id":"r-20260508-100000-abc","iteration":1,"commit_sha":"abc123d","subject":"Add pagination params to UserController"}
{"schema_version":1,"ts":"2026-05-08T10:07:00.456Z","type":"iter_rolled_back","run_id":"r-20260508-100000-abc","iteration":2,"reason":"typecheck failed"}
{"schema_version":1,"ts":"2026-05-08T10:12:00.789Z","type":"circuit_breaker_tripped","run_id":"r-20260508-100000-abc","consecutive_failures":3}
{"schema_version":1,"ts":"2026-05-08T10:15:00.012Z","type":"loop_terminated","run_id":"r-20260508-100000-abc","reason":"interrupted","total_iterations":3,"total_commits":1}
{"schema_version":1,"ts":"2026-05-08T10:15:00.013Z","type":"session_interrupted","run_id":"r-20260508-100000-abc","reason":"interrupted","total_iterations":3,"total_commits":1}
```

**写入规则**（R14.1、R14.4）：
- `fs.appendFileSync(path, line + '\n')` 使用 `O_APPEND` 保证并发安全
- 追加失败时 `logger.warn(err)` 但继续执行，**绝不** throw 到 Forge Loop 主流程
- `objective` / `subject` / `reason` 经 `src/secret-redactor.ts`（CTK spec R12.11 定义的模块）脱敏后写入

**读取规则**（R14.6、R14.7）：
- Mirror_Daemon 维护 `<cwd>/.tinkerman/.cmux-mirror-cursor.json`：
  ```json
  {
    "runs/r-20260508-100000-abc/events.ndjson": 2481,
    "runs/r-20260508-110000-def/events.ndjson": 0
  }
  ```
- 每次 `fs.watch` 事件触发，从 cursor 位置开始 `fs.createReadStream({start: offset})`，按 `\n` 切行解析
- 解析失败的行 `logger.debug(err, line)` 跳过；cursor 前进到下一行起点

#### 3.2.2 `.tinkerman/reviews/<topic>.md` frontmatter [R15]

```yaml
---
# 既有字段（不变）
topic: user-pagination
reviewers: [spec-check, quality-check, security-check]
created_at: 2026-05-08T11:00:00+08:00

# 本 spec 新增字段（R15）
layers_status:
  spec_check: done       # pending | done | failed
  quality_check: pending
  security_check: done
completed_at: null       # ISO 8601 string or null

# 其他既有字段...
---

# Review Report: user-pagination

## Layer 1 — Spec Alignment
...
```

**原子重写**（R15.3、R15.6）：`src/review.ts` 的 `updateReviewFrontmatter(topic, mutator)`：
1. `fs.readFileSync(path)`
2. `parseFrontmatter(content)` → `{raw, body}`（复用 `src/frontmatter.ts`）
3. 解析 raw 为 YAML object，调用 `mutator(obj)` 就地修改 `layers_status` / `completed_at`
4. 序列化回 YAML 文本 + body
5. 写入 `<path>.tmp`
6. `fs.renameSync(<path>.tmp, <path>)`（atomic on POSIX）

**完成检测**（R5.3、R15.5）：
- Mirror_Daemon 观察文件 change 事件后读 frontmatter
- 判定 `layers_status.{spec_check,quality_check,security_check}` 全部 ∈ `{done, failed}` 且 `completed_at` 非 null → 触发聚合通知
- 在 session 内用 topic 作为 key 去重（同一 topic 不重复发聚合通知）

#### 3.2.3 `.tinkerman/.cmux-last-sync.json` [R2.5]

按 `workspace_ref` 分段存储最近一次已发射的 payload，供下次 sync 做 diff：

```json
{
  "workspaces": {
    "workspace:2": {
      "synced_at": "2026-05-08T10:30:00.000Z",
      "payload": {
        "phase": "build",
        "tier": "standard",
        "current_topic": "user-pagination",
        "dag_progress": { "done": 3, "total": 7, "wave_current": 2, "wave_total": 3 },
        "loop_state": null,
        "review_verdict": null
      },
      "last_log_emitted": "build: user-pagination"
    }
  },
  "schema_version": 1
}
```

读失败或 JSON 损坏 → 作为"首次同步"处理（R13.6）。写入走 `fs.writeFileSync(tmp)` + `fs.renameSync`。

#### 3.2.4 `.tinkerman/.cmux-dedupe/<sha1>.ts` [R6.2]

最简形式：文件名 = `createHash('sha1').update(absPath).digest('hex')`；内容 = `Date.now().toString()`（unix millis ASCII）。

```
$ cat .tinkerman/.cmux-dedupe/3a1b2c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t.ts
1746705023412
```

**读策略**：`<now> - parseInt(content)` > 5000ms → 允许发 notify；否则只发 log。

**写策略**：每次决定发 notify 时，先 `fs.writeFileSync(tmp, now.toString())` 再 `fs.renameSync(tmp, target)`。

**GC**（R6.4）：`scripts/prune-event-logs.sh` 追加一段：
```bash
# Every 24h: remove dedupe entries older than 1 hour
if [ -d "$REPO/.tinkerman/.cmux-dedupe" ]; then
  find "$REPO/.tinkerman/.cmux-dedupe" -type f -mmin +60 -delete 2>/dev/null || true
fi
```

#### 3.2.5 `.tinkerman/findings/<topic>/browser-qa/verdict.md` [R8.3]

复用 CTK spec R1 的 Three_State_Verdict schema：

```yaml
---
verdict: VERIFIED         # VERIFIED | NOT_VERIFIED | INCONCLUSIVE
topic: user-pagination
harness: forge-browser-qa
controller: cmux-browser
decided_at: 2026-05-08T11:00:00+08:00
inconclusive_reason: null
---
# Verdict: VERIFIED

## Evidence Chain

- [Command] `cmux browser open http://localhost:3000` → [Output] `snapshot-0.json` → [Claim] page loaded
- [Command] `cmux browser surface:4 click "button.submit"` → [Output] `screenshot-1.png` → [Claim] submit triggered
- [Command] `cmux browser surface:4 wait --text "Success"` → [Output] `snapshot-2.json` → [Claim] success state reached
```

#### 3.2.6 `cmux-skills/.cmux-skills-manifest.json` [R10.4]

`install.sh --apply` 写入目标目录（如 `~/.claude/skills/.cmux-skills-manifest.json`）：

```json
{
  "schema_version": 1,
  "installed_at": "2026-05-08T11:00:00.000Z",
  "forge_version": "2.5.0",
  "files": [
    "forge-sidebar-sync/SKILL.md",
    "forge-browser-qa/SKILL.md",
    "forge-loop-signals/SKILL.md"
  ]
}
```

`--uninstall` 读清单，删除记录的文件，最后删 manifest 本身。

### 3.3 `.tinkerman/config.md` frontmatter 新增字段（4 个，R11.9 + R16.7）

```yaml
---
# 既有字段不变
project: "MyApp"
stack: [...]
security_level: 1
knowledge_limit: 20
max_parallel_agents: 6

# 本 spec 新增（全部 optional）
cmux_integration: auto              # R1.6; enum: auto | on | off; default auto
cmux_notification_budget: 5         # R7.2; positive int or 0; default 5
cmux_review_notify: on              # R5.5; enum: on | off; default on
cmux_session_idle_minutes: 15       # R16.7; positive int; default 15
cmux_respawn_budget: 3              # R13.12; positive int or 0; default 3
---
```

**向后兼容保证**：5 个字段全部 optional，已有项目无需 edit `.tinkerman/config.md`。

### 3.4 `CanonicalSidebarPayload` 类型（TS 定义用于 mock-socket 测试；运行时实际是 `scripts/cmux-mirror/lib/payload.mjs` 的 JS object）

```typescript
export type ForgePhase =
  | "decide" | "spec" | "plan" | "build" | "review"
  | "test" | "ship" | "learn" | "debug" | "idle";

export type ForgeTier = "light" | "standard" | "full";

export interface DagProgress {
  done: number;
  total: number;
  wave_current: number;    // 1-indexed
  wave_total: number;
  failed_tasks: string[];  // task_ids
}

export interface LoopState {
  run_id: string;
  iteration: number;
  max_iterations: number | null;
  phase: "running" | "interrupted" | "terminated";
}

export interface ReviewVerdict {
  topic: string;
  layers: {
    spec_check: { status: "pending" | "done" | "failed"; p1: number; p2: number; p3: number };
    quality_check: { status: "pending" | "done" | "failed"; p1: number; p2: number; p3: number };
    security_check: { status: "pending" | "done" | "failed"; p1: number; p2: number; p3: number };
  };
  completed_at: string | null;
}

export interface CanonicalSidebarPayload {
  phase: ForgePhase;
  tier: ForgeTier | null;
  current_topic: string | null;
  dag_progress: DagProgress | null;
  loop_state: LoopState | null;
  review_verdict: ReviewVerdict | null;
}
```

### 3.5 映射表（纯数据，`lib/payload.mjs` 常量）

**Phase → cmux icon**（R2.3、R12.3）：

```javascript
export const PHASE_TO_ICON = Object.freeze({
  decide: "brain",
  spec: "doc.text",
  plan: "list.bullet",
  build: "hammer",
  review: "checkmark.seal",
  test: "testtube.2",
  ship: "paperplane",
  learn: "book",
  debug: "ant",
  idle: "circle",
});
export const DEFAULT_ICON = "circle"; // 域外输入
```

**Tier → cmux color**（R2.4、R12.4）：

```javascript
export const TIER_TO_COLOR = Object.freeze({
  light: "#22c55e",
  standard: "#3b82f6",
  full: "#ef4444",
});
// 未命中 → emit 时不带 --color（no color applied）
```

**Loop state → icon/color**（R4.1、R4.7）：

```javascript
export const LOOP_STATE_TO_ICON = Object.freeze({
  running: { icon: "arrow.triangle.2.circlepath", color: "#3b82f6" },
  interrupted: { icon: "xmark.octagon", color: "#ef4444" },
  terminated: { icon: "checkmark.circle", color: "#22c55e" },
});
```

---

## 4. Module Designs

### 4.1 Availability 检测（`lib/availability.mjs`）[R1]

#### 核心签名

```javascript
// scripts/cmux-mirror/lib/availability.mjs
import { statSync } from "node:fs";

let stickyUnavailable = false;  // 粘性降级状态（R13.1/9）

/**
 * 检测 cmux 是否可用。纯函数语义：
 * - 对固定 env + fs 状态，多次调用返回相同结果（R12.1）
 * - 一旦 stickyUnavailable 被设置，立即返回 false（R13.1）
 */
export function cmuxAvailable() {
  if (stickyUnavailable) return false;
  if (process.env.CMUX_INTEGRATION === "off") return false;  // config.md 传递
  if (process.env.CMUX_WORKSPACE_ID) return true;

  const socketPath = process.env.CMUX_SOCKET_PATH ?? "/tmp/cmux.sock";
  try {
    const t0 = Date.now();
    const st = statSync(socketPath);
    if (Date.now() - t0 > 200) return false;   // R1.2 超时
    return st.isSocket();
  } catch {
    return false;
  }
}

/**
 * 由 cli.mjs 在遇到 EPIPE/ECONNREFUSED 时调用。
 * 一旦粘性，同进程永不再翻转回 true（R13.9）。
 */
export function markUnavailable(reason) {
  stickyUnavailable = true;
  // debug log only, never stdout/stderr
}

export function isStickyUnavailable() {
  return stickyUnavailable;
}

/** 仅供测试使用 */
export function __resetForTest() {
  stickyUnavailable = false;
}
```

#### 关键决策

- **不做 socket connect 检测**：仅判 `isSocket()` 即可；真正的 connect 失败在 `lib/cli.mjs` 的首次调用时自然暴露，触发 `markUnavailable`。这样把"探测"的 I/O 成本压到 10ms 以内（R11.1）。
- **`CMUX_INTEGRATION` 环境变量**是给 Mirror_Pane 启动命令用的：bash 脚本里 `grep 'cmux_integration: off' .tinkerman/config.md` 然后 `export CMUX_INTEGRATION=off` 再 `exec node mirror.mjs`；这样 availability 判断是纯函数、不读 `.tinkerman/config.md`，测试更简单。

---

### 4.2 Mirror_Daemon 主循环（`mirror.mjs`）[R2, R3, R4, R5, R7, R13, R16]

#### 4.2.1 启动流程

```ascii
mirror.mjs 启动
  │
  ├── 1. 读 .tinkerman/config.md frontmatter → 取 cmux_integration / cmux_respawn_budget / ...
  │      若 off → exit 0（R1.7）
  ├── 2. cmuxAvailable()
  │      若 false 且 cmux_integration: on → stderr 警告 + exit 0（R1.8）
  │      若 false 且 cmux_integration: auto → 静默 exit 0（R1.9）
  ├── 3. 尝试独占锁 .tinkerman/.locks/cmux-mirror.lock
  │      若失败 → stderr "existing mirror running" + exit 0（R2.10）
  ├── 4. 写 PID 文件 .tinkerman/.cmux-mirror.pid（atomic rename）
  ├── 5. cmux capabilities --json（超时 2s）缓存（R13.5）
  ├── 6. 初始化 session 状态 = unknown
  │      若 .tinkerman/status.md 已存在 phase ≠ idle → 立即转 active（R16.8）
  ├── 7. 初始化 budget（R7.1）
  ├── 8. FS watch 模式检测：
  │      stat .forge 的 device / fs-type；
  │      在 macOS APFS / Linux ext4/xfs 本地盘 → 使用原生 fs.watch；
  │      在 NFS / SMB / 9p / overlayfs / Docker volume → 降级 polling（chokidar usePolling: true，1s 间隔）；
  │      失败则按 polling 兜底。
  ├── 9. 启动文件监听主循环
  │      - watch .tinkerman/status.md（change）
  │      - watch .tinkerman/progress/（recursive）
  │      - watch .tinkerman/reviews/（recursive）
  │      - watch .tinkerman/runs/（recursive，发现新 run_id 则添加 .ndjson watch）
  ├── 10. 绑定 Mirror_Push_Socket（.tinkerman/.cmux-mirror.sock, mode 0600）
  │       创建失败（权限/路径已存在） → 警告但继续（观察者路径不受影响，R17.5）
  ├── 11. 注册信号处理器（SIGINT/SIGTERM → 清 PID 文件 + 删 socket 文件 + exit 0）
  └── 12. 如果 cmux_integration: auto 且检测到 polling 模式生效 → 发 1 条
          cmux log --level info --source forge-mirror "polling mode (fs-type: <name>)"
```

#### 4.2.2 事件分发

每个 fs.watch 回调进入 250ms 防抖队列（R3.3），每个源文件单独防抖；push-server 收到的 Mirror_Push_Event 通过**同一个** dispatch 函数处理（保证语义一致，R17.2）：

```javascript
// 伪代码
const debouncers = new Map(); // path -> timer

function onFsEvent(path) {
  clearTimeout(debouncers.get(path));
  debouncers.set(path, setTimeout(() => {
    debouncers.delete(path);
    dispatch({ source: "fs", path });
  }, 250));
}

function onPushEvent(evt) {
  // 推送事件不防抖（SKILL 主动推送意味着需要即时响应）
  // 但会经过 rate limiter (R17.8)
  dispatch({ source: "push", evt });
}

function dispatch(input) {
  if (input.source === "fs") {
    const { path } = input;
    if (path.endsWith("/status.md"))             onStatusChange();
    else if (path.includes("/progress/"))        onProgressChange(path);
    else if (path.includes("/reviews/"))         onReviewChange(path);
    else if (path.endsWith("/events.ndjson"))    onEventsChange(path);
  } else {
    const { evt } = input;
    switch (evt.type) {
      case "resync_now":       onStatusChange(); /* + progress/reviews rescan */ break;
      case "phase_changed":    onPhaseHinted(evt.payload); break;
      case "layer_completed":  onLayerHinted(evt.payload); break;
      default: /* debug log, skip (R17.3) */
    }
  }
}
```

#### 4.2.3 Sticky-Unavailable 状态机（R13.1、R13.9）

```ascii
         ┌─────────────┐
         │  unknown    │ ← boot
         └─────┬───────┘
               │ first event or timer tick
               ▼
         ┌─────────────┐
         │  available  │ ←────┐
         └─────┬───────┘      │
               │              │
               │ EPIPE        │
               │ ECONNREFUSED │
               │ (first time) │ （永不回来）
               ▼              │
         ┌─────────────┐      │
         │  sticky-    │──────┘ (not reachable)
         │  unavailable│
         └─────┬───────┘
               │ 5s 内完成清理 + exit 0 (R13.9)
               ▼
              EXIT
```

#### 4.2.4 Status / Progress / Review / Events 处理流程

参见 §7 的序列图。

#### 4.2.5 会话状态机（`lib/session.mjs`）[R16]

```javascript
// 伪代码
const MINUTE_MS = 60000;

class SessionTracker {
  constructor(config, ws) {
    this.state = "unknown";       // unknown | active | inactive (R12.12)
    this.lastStatusWrite = 0;
    this.idleMinutes = config.cmux_session_idle_minutes ?? 15;
    this.workspaceRef = ws;
  }

  onStatusChange(statusFm) {
    this.lastStatusWrite = Date.now();
    const phase = statusFm.phase ?? "idle";
    const topic = statusFm.current_topic;
    if (this.state === "unknown" || this.state === "inactive") {
      if (phase !== "idle") this._startSession();
    } else if (this.state === "active") {
      if (phase === "idle") this._endSession();
      else if (topic !== this._currentTopic) {
        this._endSession(); this._startSession();
      }
    }
    this._currentTopic = topic;
  }

  onEvent(evt) {
    if (evt.type === "session_started")     this._startSession();
    else if (evt.type === "session_ended" || evt.type === "session_interrupted")
                                             this._endSession();
  }

  tickIdle() {
    if (this.state === "active" &&
        Date.now() - this.lastStatusWrite > this.idleMinutes * MINUTE_MS) {
      this._endSession(); // R16.2 inactivity timeout
    }
  }

  _startSession() {
    this.state = "active";
    this.onBoundary?.("start", this.workspaceRef);
  }

  _endSession() {
    this.state = "inactive";
    this.onBoundary?.("end", this.workspaceRef);
  }
}
```

每个 Workspace_Ref 有独立 `SessionTracker`（R16.9）。`onBoundary("start")` 触发 `budget.reset()`。

---

### 4.3 Sync_Once 一次性同步（`sync-once.mjs`）[R2.7, R13.12–14]

```ascii
sync-once.mjs 启动（每次独立进程，由 hook 触发）
  │
  ├── 1. cmuxAvailable() == false → exit 0 立即（R1.5）
  ├── 2. .tinkerman/status.md 不存在 → exit 0（R2.9）
  ├── 3. 尝试文件锁 .tinkerman/.locks/cmux-sync.lock（1s 超时）
  │      失败 → exit 0（R2.10）
  ├── 4. 检查 .tinkerman/.cmux-mirror.pid（R13.12）
  │      - 文件不存在 OR pid 不存活 → 进入受限 respawn 流程：
  │          读 .tinkerman/.cmux-respawn-count（原子 open+read+close）
  │          读 .tinkerman/config.md frontmatter 取 cmux_respawn_budget（默认 3）
  │          IF count < budget:
  │            count++ 原子写回
  │            cmux log --level warning --source forge-mirror "respawning after crash (count/budget)"
  │            spawn Mirror_Daemon detached（不阻塞 self）
  │          ELSE:
  │            cmux log --level warning --source forge-mirror "respawn budget exhausted (count/budget); manual restart required"
  │            （exactly once per session；用 .tinkerman/.cmux-respawn-exhausted-flag 去重）
  │      - 文件存在且 pid 存活 → 不 respawn
  ├── 5. 调用 lib/reader.mjs 读 .tinkerman/ → payload
  ├── 6. 调用 lib/emitter.mjs → cmux CLI 命令序列
  ├── 7. 与 .tinkerman/.cmux-last-sync.json 做 diff（R2.5）
  ├── 8. 变更字段 → cmux set-status / set-progress / log
  └── 9. 更新 .cmux-last-sync.json + 释放锁 + exit 0
```

Respawn_Budget 计数的 session 边界重置（R13.14）由 Mirror_Daemon 在 `session.onBoundary("start")` 时通过 `fs.writeFileSync(".tinkerman/.cmux-respawn-count", "0")` 完成；Sync_Once 自己不重置（避免并发竞态）。

**关键约束**：总耗时 ≤ 500ms（R2.6）；hook timeout 配置为 2s，留出富余容忍 cmux CLI 偶尔慢响应。

---

### 4.4 Hook 通知（`hook-notify.sh`）[R6]

Bash 脚本，由 `src/check-frozen.ts` 在判定阻断后调用：

```bash
#!/bin/bash
# Called by src/check-frozen.ts after an interception decision is finalized
# Args: $1 = absolute file path, $2 = frontmatter status

set -u

FILE_PATH="${1:-}"
STATUS="${2:-unknown}"

# R6.5: cmux not on PATH → silent exit 0
command -v cmux >/dev/null 2>&1 || exit 0

# R1.1: availability check (inline, no node invocation needed here)
if [ -z "${CMUX_WORKSPACE_ID:-}" ] && [ ! -S "${CMUX_SOCKET_PATH:-/tmp/cmux.sock}" ]; then
  exit 0
fi

# Compute dedupe key
HASH=$(printf "%s" "$FILE_PATH" | shasum -a 1 | awk '{print $1}')
DEDUPE_DIR=".tinkerman/.cmux-dedupe"
DEDUPE_FILE="${DEDUPE_DIR}/${HASH}.ts"
WINDOW_MS=5000

# R13.11: dedupe dir create failure → fall through to notify unconditionally
mkdir -p "$DEDUPE_DIR" 2>/dev/null || {
  cmux notify --title "Forge 冻结拦截" --subtitle "$(basename "$FILE_PATH")" \
    --body "文件 status=${STATUS}，写入被阻断" 2>/dev/null || true
  exit 0
}

NOW=$(($(date +%s%N) / 1000000))  # millis
LAST=0
[ -f "$DEDUPE_FILE" ] && LAST=$(cat "$DEDUPE_FILE" 2>/dev/null || echo 0)

# Always emit sidebar log (R6.1)
cmux log --level error --source forge-hook \
  "frozen interception: $FILE_PATH (status=$STATUS)" 2>/dev/null || true

# Notify only outside dedup window
if [ $((NOW - LAST)) -gt $WINDOW_MS ]; then
  cmux notify --title "Forge 冻结拦截" --subtitle "$(basename "$FILE_PATH")" \
    --body "文件 status=${STATUS}，写入被阻断" 2>/dev/null || true
  # Atomic update of dedupe file
  printf "%s" "$NOW" > "${DEDUPE_FILE}.tmp" && mv -f "${DEDUPE_FILE}.tmp" "$DEDUPE_FILE"
fi

exit 0
```

**关键约束**：整段执行 ≤ 300ms（R6.6）；任何 cmux 调用失败 `|| true` 降级，exit code 永远 0 不影响主 hook（R12.7）。

---

### 4.5 Browser_QA_Fallback（`browser-qa.mjs`）[R8]

#### 核心结构

```javascript
// 伪代码
import { runCliWithTimeout } from "./lib/cli.mjs";
import { cmuxAvailable } from "./lib/availability.mjs";

export async function runBrowserQA({ topic, targetUrl, assertions }) {
  if (!cmuxAvailable()) return { verdict: "INCONCLUSIVE", reason: "cmux unavailable" };

  const artifactsDir = `.tinkerman/findings/${topic}/browser-qa`;
  await fs.mkdir(artifactsDir, { recursive: true });

  // Step 1: open browser pane (R8.2)
  const openResult = await runCliWithTimeout(
    ["browser", "open", targetUrl], 10_000
  );
  if (openResult.exitCode !== 0) {
    return writeVerdict(artifactsDir, "INCONCLUSIVE", "cmux browser open failed");
  }

  // Step 2: acquire surface_id (R8.2, R8.5)
  const ident = await runCliWithTimeout(["browser", "identify", "--json"], 5_000);
  const surfaceId = parseSurfaceId(ident.stdout);
  if (!surfaceId) {
    return writeVerdict(artifactsDir, "INCONCLUSIVE", "surface id acquisition failed");
  }

  // Step 3: wait for page load (R8.6)
  const loaded = await runCliWithTimeout(
    ["browser", `surface:${surfaceId}`, "wait", "--load-state", "complete", "--timeout-ms", "30000"],
    35_000
  );
  if (loaded.exitCode !== 0) {
    return writeVerdict(artifactsDir, "INCONCLUSIVE", "target not reachable");
  }

  // Step 4: execute assertions, capturing artifacts (R8.3)
  let step = 0;
  const evidenceChain = [];
  for (const a of assertions) {
    const result = await executeAssertion(surfaceId, a, artifactsDir, step++);
    evidenceChain.push(result);
    if (result.failure) {
      // Continue collecting rather than aborting
    }
  }

  // Step 5: capture console + errors (R8.3)
  await runCliWithTimeout(["browser", `surface:${surfaceId}`, "console", "list"],
    5_000, { stdout: `${artifactsDir}/console.log` });
  await runCliWithTimeout(["browser", `surface:${surfaceId}`, "errors", "list"],
    5_000, { stdout: `${artifactsDir}/errors.log` });

  // Step 6: compute verdict
  const failed = evidenceChain.filter(e => e.failure).length;
  const verdict = failed === 0 ? "VERIFIED" : "NOT_VERIFIED";
  return writeVerdict(artifactsDir, verdict, null, evidenceChain);
}
```

#### CTK spec 互让（R8.8）

在 `runBrowserQA` 入口前先检查：
```javascript
const ctkUiHarnessActive = await detectCtkUiHarnessCmuxController();
if (ctkUiHarnessActive) {
  // CTK UI_Harness 会完成相同工作，我们 yield
  return { verdict: "SKIPPED", reason: "CTK UI_Harness active" };
}
```

---

### 4.6 CLI 封装（`lib/cli.mjs`）[R1.4, R11.2]

```javascript
// 伪代码
import { spawn } from "node:child_process";
import { markUnavailable } from "./availability.mjs";

/**
 * 跑一条 cmux CLI 命令，超时 + 捕获。
 * 失败（EPIPE/ECONNREFUSED/non-zero）→ 触发 sticky-unavailable 并返回 null。
 */
export async function runCli(args, { timeoutMs = 2000 } = {}) {
  return new Promise(resolve => {
    const p = spawn("cmux", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", d => out += d);
    p.stderr.on("data", d => err += d);
    p.on("error", e => {
      clearTimeout(timer);
      if (e.code === "EPIPE" || e.code === "ECONNREFUSED" || e.code === "ENOENT") {
        markUnavailable(e.code);
      }
      resolve(null);
    });
    p.on("close", code => {
      clearTimeout(timer);
      if (code !== 0 && /refused|broken pipe/i.test(err)) {
        markUnavailable("cli-failure");
      }
      resolve({ exitCode: code, stdout: out, stderr: err });
    });
  });
}
```

**能力缓存**（`lib/capabilities.mjs`，R13.5）：启动时调 `cmux capabilities --json`，结果存内存对象，后续 `hasCapability("set-progress")` 纯函数查询；capabilities 缺失的命令 emitter 自动跳过发送。

---

### 4.6a Push Server（`lib/push-server.mjs` + `push.sh`）[R17]

#### 服务端（Mirror_Daemon 内嵌）

```javascript
// scripts/cmux-mirror/lib/push-server.mjs
import net from "node:net";
import { chmodSync, unlinkSync } from "node:fs";

const RATE_LIMIT_PER_SEC = 20;
const ALLOWED_TYPES = new Set(["resync_now", "phase_changed", "layer_completed"]);

export function createPushServer({ socketPath, onEvent }) {
  // Clean up stale socket from crashed previous mirror
  try { unlinkSync(socketPath); } catch {}

  const server = net.createServer(conn => {
    const buckets = { count: 0, windowStart: Date.now() };
    let buf = "";
    conn.on("data", chunk => {
      buf += chunk.toString("utf-8");
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;

        // Rate limit (R17.8)
        const now = Date.now();
        if (now - buckets.windowStart >= 1000) { buckets.count = 0; buckets.windowStart = now; }
        if (++buckets.count > RATE_LIMIT_PER_SEC) continue;

        let evt;
        try { evt = JSON.parse(line); } catch { continue; }
        if (!ALLOWED_TYPES.has(evt?.type)) continue;
        if (typeof evt.schema_version !== "number") continue;

        onEvent(evt);
      }
    });
    conn.on("error", () => { /* swallow, never crash daemon */ });
  });

  server.listen(socketPath, () => {
    chmodSync(socketPath, 0o600);  // R17.1 owner-only
  });

  return { close: () => { server.close(); try { unlinkSync(socketPath); } catch {} } };
}
```

Mirror_Daemon 启动序列 §4.2.1 的 step 10 调用 `createPushServer({ socketPath: ".tinkerman/.cmux-mirror.sock", onEvent: dispatch.bind(null, { source: "push" }) })`；SIGINT/SIGTERM 处理器里调 `close()` 清理 socket 文件。

#### 客户端（`push.sh`）

```bash
#!/bin/bash
# Usage: push.sh <type> [json-payload]
# Examples:
#   push.sh resync_now
#   push.sh phase_changed '{"phase":"review","current_topic":"user-auth"}'
#   push.sh layer_completed '{"topic":"user-auth","layer":"spec_check","status":"done"}'

set -u
TYPE="${1:-}"
PAYLOAD_JSON="${2:-{}}"

# R17.10: Zero-Impact on availability
if [ -z "${CMUX_WORKSPACE_ID:-}" ] && [ ! -S "${CMUX_SOCKET_PATH:-/tmp/cmux.sock}" ]; then
  exit 0
fi

SOCK=".tinkerman/.cmux-mirror.sock"

# R17.5: silent fail if daemon not running
[ -S "$SOCK" ] || exit 0
[ -n "$TYPE" ] || { echo "push.sh: type required" >&2; exit 2; }

# Build NDJSON line; escape via jq if available, else trust caller's JSON
LINE=$(printf '{"schema_version":1,"type":"%s","payload":%s}\n' "$TYPE" "$PAYLOAD_JSON")

# Use nc -U (Unix socket) with a short timeout; suppress errors per R17.5
if command -v nc >/dev/null 2>&1; then
  printf "%s" "$LINE" | nc -U -w 1 "$SOCK" >/dev/null 2>&1 || true
else
  # Fallback: Python one-liner
  python3 -c "import socket,sys; s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); s.settimeout(1); s.connect('$SOCK'); s.sendall(sys.stdin.buffer.read()); s.close()" \
    <<< "$LINE" >/dev/null 2>&1 || true
fi

exit 0
```

#### SKILL 使用方式

SKILL 作者只与 `push.sh` 的 3 种 type 打交道，**不暴露** socket 协议或 JSON schema 给 SKILL 契约（R17.6）：

```bash
# 在 skills/forge-spec/SKILL.md 的 "spec 锁定瞬间" 步骤里（可选）：
bash scripts/cmux-mirror/push.sh phase_changed '{"phase":"spec","current_topic":"user-auth"}'

# 在 skills/forge-review/SKILL.md 某层完成后（可选，用于比 fs.watch 更快推送 per-layer log）：
bash scripts/cmux-mirror/push.sh layer_completed '{"topic":"user-auth","layer":"spec_check","status":"done"}'
```

#### 关键约束

- **opt-in**：所有 SKILL 都**不依赖**推送通道（R17.7）；推送只是加速器。未调用 push.sh 的既有 SKILL 行为不变。
- **不发 notify**：推送通道的 `type` 白名单里没有 `force_notify`（R17.4）。通知仍由观察到的状态转换触发并受预算限制。
- **rate limit**：20 events/sec/conn 硬上限（R17.8）防止 SKILL 写 bug 导致风暴。
- **权限 0600**：socket 文件只允许 owner 访问，防止多用户主机上的注入（R17.1）。

---

### 4.7 Events_NDJSON 读写（`src/sdk-driver.ts` + `lib/events.mjs`）[R14]

#### 写入侧（`src/sdk-driver.ts`）

在现有 `SdkDriver` 类里加一个 `writeEvent` 辅助方法，并在 9 个切点各调用一次。

```typescript
// src/sdk-driver.ts（摘要）
import { appendFileSync } from "node:fs";
import path from "node:path";
import { redactSecrets } from "./secret-redactor.js";  // CTK spec R12.11 模块

interface EventBase {
  schema_version: 1;
  ts: string;
  type: string;
  run_id: string;
}

export class SdkDriver {
  // ... 既有字段

  private writeEvent(type: string, payload: Record<string, unknown>): void {
    const eventsPath = path.join(this.runDir, "events.ndjson");
    const event: EventBase & Record<string, unknown> = {
      schema_version: 1,
      ts: new Date().toISOString(),
      type,
      run_id: this.runId,
      ...this.redactPayload(payload),
    };
    try {
      appendFileSync(eventsPath, JSON.stringify(event) + "\n");
    } catch (err) {
      this.logger.warn("events.ndjson append failed", err);
      // R14.4: never rethrow
    }
  }

  private redactPayload(p: Record<string, unknown>) {
    // R14.8: redact secrets in objective/subject/reason
    const out = { ...p };
    for (const k of ["objective", "subject", "reason"]) {
      if (typeof out[k] === "string") out[k] = redactSecrets(out[k] as string);
    }
    return out;
  }

  async start() {
    // ... 既有逻辑
    this.writeEvent("session_started", {
      objective: this.objective,
      max_iterations: this.maxIterations ?? null,
      max_tokens: this.maxTokens ?? null,
      max_budget_usd: this.maxBudgetUsd ?? null,
      stop_when: this.stopWhen ?? null,
      worktree_mode: this.worktreeMode,
    });
  }

  // 其余 8 个切点：onIterStarted / onIterCommitted / onIterRolledBack /
  //                 onCircuitBreakerTripped / onLoopTerminated /
  //                 onSessionEnded / onSessionInterrupted / onFatalError
  // 每个都是一行 this.writeEvent(...)，约 8 行调用 × 几行参数。
}
```

#### 读取侧（`lib/events.mjs`）

```javascript
// scripts/cmux-mirror/lib/events.mjs
import { openSync, readSync, closeSync } from "node:fs";

const SUPPORTED_SCHEMA = 1;

/**
 * 从 cursor 位置增量读取 events.ndjson，返回新事件数组 + 新 cursor。
 * - 单行 JSON 解析失败 → debug log + 跳过（R12.11, R14.6）
 * - schema_version > SUPPORTED_SCHEMA → 跳过整条（R14.9）
 */
export function readEventsSince(path, cursor) {
  const fd = openSync(path, "r");
  try {
    const { size } = fstatSync(fd);
    if (size <= cursor) return { events: [], cursor };

    const buf = Buffer.alloc(size - cursor);
    readSync(fd, buf, 0, buf.length, cursor);
    const text = buf.toString("utf-8");

    // 最后一行可能不完整（写入中途），按最后 \n 切
    const lastNewline = text.lastIndexOf("\n");
    const consumable = lastNewline >= 0 ? text.slice(0, lastNewline) : "";
    const newCursor = cursor + Buffer.byteLength(consumable, "utf-8") + (lastNewline >= 0 ? 1 : 0);

    const events = [];
    for (const line of consumable.split("\n")) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        if (typeof evt.schema_version !== "number") continue;
        if (evt.schema_version > SUPPORTED_SCHEMA) continue;  // R14.9
        events.push(evt);
      } catch {
        // malformed line; silently skip (R12.11)
      }
    }
    return { events, cursor: newCursor };
  } finally {
    closeSync(fd);
  }
}
```

---

### 4.8 Reviews Frontmatter 读写（`src/review.ts` + `lib/reviews.mjs`）[R15]

#### 写入侧（`src/review.ts`）

使用 `yaml` npm 包做 frontmatter serialize（既有 `src/frontmatter.ts` 只做解析，不重复造序列化轮子；`yaml` 包 ≈ 50KB gzipped，被 Node 生态广泛使用）：

```typescript
// src/review.ts 摘要
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { parseFrontmatter } from "./frontmatter.js";
import * as yaml from "yaml";

type LayerStatus = "pending" | "done" | "failed";

export function initReviewFrontmatter(topic: string): void {
  const path = `.tinkerman/reviews/${topic}.md`;
  // 在创建文件时写入初始 layers_status，所有字段 pending
  const fm = {
    topic,
    reviewers: ["spec-check", "quality-check", "security-check"],
    created_at: new Date().toISOString(),
    layers_status: { spec_check: "pending", quality_check: "pending", security_check: "pending" },
    completed_at: null,
  };
  writeFileSync(path, `---\n${yaml.stringify(fm)}---\n\n# Review Report: ${topic}\n\n`);
}

export function markLayerStatus(topic: string, layer: "spec_check" | "quality_check" | "security_check", status: LayerStatus): void {
  atomicUpdateFrontmatter(`.tinkerman/reviews/${topic}.md`, fm => {
    fm.layers_status[layer] = status;
    // Check if all three are terminal → set completed_at
    const { spec_check, quality_check, security_check } = fm.layers_status;
    if ([spec_check, quality_check, security_check].every(s => s === "done" || s === "failed")
        && !fm.completed_at) {
      fm.completed_at = new Date().toISOString();
    }
  });
}

function atomicUpdateFrontmatter(filePath: string, mutator: (fm: any) => void): void {
  const content = readFileSync(filePath, "utf-8");
  const parsed = parseFrontmatter(content);
  if (!parsed) throw new Error(`no frontmatter in ${filePath}`);
  const fm = yaml.parse(parsed.raw) ?? {};
  mutator(fm);
  const newContent = `---\n${yaml.stringify(fm)}---\n${parsed.body}`;
  writeFileSync(`${filePath}.tmp`, newContent);
  renameSync(`${filePath}.tmp`, filePath);  // atomic on POSIX
}
```

#### 读取侧（`lib/reviews.mjs`）

Mirror_Daemon 调用 `parseReviewFrontmatter(path)` 返回 `{ layers_status, completed_at, hasLegacyFormat }`；遇到没有这两个字段的旧文件（R15.7）会设 `hasLegacyFormat: true`，上游跳过聚合通知但仍做 body-diff 的 per-layer log。

---

### 4.9 Browser_QA_Fallback SKILL reference（`skills/forge-test/references/cmux-browser.md`）[R8, R10]

内容大纲：
1. 触发条件（R8.1）
2. CTK UI_Harness 优先级互让（R8.8）
3. 产物约定（R8.3）
4. 退出码约定（R8.4、R8.5、R8.6）
5. 调用示例：`node scripts/cmux-mirror/browser-qa.mjs --topic user-auth --url http://localhost:3000`

---

### 4.10 可选 cmux-skills 技能包（`cmux-skills/`）[R10]

#### 目录

```
cmux-skills/
├── forge-sidebar-sync/
│   └── SKILL.md                    # ≤ 3072 bytes (R10.5)
├── forge-browser-qa/
│   └── SKILL.md
├── forge-loop-signals/
│   └── SKILL.md
└── install.sh                      # dry-run default (R10.3), --uninstall via manifest (R10.4)
```

#### `install.sh` 核心逻辑

```bash
# 伪代码
DEST=${DEST:-~/.claude/skills}
MODE=dry-run
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) MODE=apply; shift ;;
    --dest) DEST="$2"; shift 2 ;;
    --uninstall) MODE=uninstall; shift ;;
    *) echo "unknown: $1"; exit 1 ;;
  esac
done

case "$MODE" in
  dry-run)
    echo "Would install to: $DEST"
    for s in forge-sidebar-sync forge-browser-qa forge-loop-signals; do
      echo "  + $DEST/$s/SKILL.md"
    done
    echo ""
    echo "Run with --apply to execute."
    ;;
  apply)
    for s in forge-sidebar-sync forge-browser-qa forge-loop-signals; do
      mkdir -p "$DEST/$s"
      cp "$(dirname "$0")/$s/SKILL.md" "$DEST/$s/SKILL.md"
    done
    # Write manifest (R10.4)
    cat > "$DEST/.cmux-skills-manifest.json" <<EOF
{ "schema_version": 1, "installed_at": "$(date -u +%FT%TZ)", "forge_version": "$(cat package.json | jq -r .version)", "files": ["forge-sidebar-sync/SKILL.md","forge-browser-qa/SKILL.md","forge-loop-signals/SKILL.md"] }
EOF
    echo "Installed to $DEST"
    ;;
  uninstall)
    MAN="$DEST/.cmux-skills-manifest.json"
    [ -f "$MAN" ] || { echo "No manifest at $MAN"; exit 1; }
    jq -r '.files[]' "$MAN" | while read -r f; do rm -f "$DEST/$f"; done
    rm -f "$MAN"
    ;;
esac
```

---

## 5. Cross-cutting Concerns

### 5.1 Zero-Impact 分层防护

本设计让 Zero-Impact 在 5 层上同时生效：

| 层 | 防护机制 | 覆盖 Requirement |
|---|---|---|
| 1. Mirror_Pane 启动 | bash 里 grep `cmux_integration: off` → exit 0；`cmuxAvailable()` false → 条件 exit 0 | R1.5, R1.7 |
| 2. Mirror_Daemon 启动后 | capabilities 探测失败或 CLI 首次调用 EPIPE → sticky-unavailable → 5s 内清理 exit 0 | R13.9 |
| 3. Sync_Once（hook） | 第一行即检测 `cmuxAvailable()`，false → exit 0；`.tinkerman/status.md` 不存在 → exit 0 | R1.5, R2.9 |
| 4. hook-notify.sh | `command -v cmux` 失败 → exit 0；任意 cmux 调用失败 → `|| true` | R6.5 |
| 5. CLI 封装 | 所有 `runCli` 抛异常时返回 null，调用方按 nullable 处理；不会传播到 Forge | R1.4 |

任何一层漏防，下游还能兜底。

### 5.2 性能预算

| 路径 | 预算 | 来源 |
|---|---|---|
| `cmuxAvailable()` cold | < 10ms (macOS) / < 20ms (Linux) | R11.1 |
| `cmuxAvailable()` 超时硬截断 | 200ms | R1.2 |
| fs.watch event → cmux CLI emit | p95 < 500ms | R11.2 |
| Sync_Once 总耗时 | ≤ 500ms (hook timeout 2s) | R2.6, §2.3 |
| hook-notify.sh 总耗时 | ≤ 300ms | R6.6 |
| Mirror_Daemon 进程 RSS（稳态） | < 50MB（目标，非硬性 AC） | 工程约束 |

### 5.3 i18n 覆盖清单（R11.4）

**纳入 i18n**（需在 `locales/zh.json` + `locales/en.json` 添加）：

| 类别 | 具体字符串 | 示例 zh / en |
|---|---|---|
| notify title | `"Forge 冻结拦截"` / `"Forge Loop 熔断"` / `"Forge Loop 完成"` / `"/forge review 完成"` | 4 条 |
| notify body | `"文件 status=<x>，写入被阻断"` / `"连续 <n> 次失败，已中止"` / `"总计 <n> 轮 · <c> 次提交"` / review 聚合摘要 | 4 条 |
| notify subtitle | 通常是动态内容（topic、file basename），不需 i18n | — |
| log message | `"iter <n> committed"` / `"iter <n> rolled back"` / `"task <x> failed"` / `"frozen interception"` / `"canvas ready"` / `"browser qa"` / `"notification suppressed"` / `"respawning after crash"` | 8 条 |
| progress label | `"Starting · <done>/<total>"` / `"Wave <w>/<W> · <d>/<t>"` / `"Done · <d>/<t>"` / `"Iter <n>/<limit>"` | 4 条 |
| cmux.json commands | `commands[].name` / `commands[].description`（各 3 条 × 2 = 6） | 6 条 |

**不纳入 i18n**（技术标识符）：
- `cmux log --source <name>` 的 source 名（`forge-loop` 等）
- `cmux set-status <key>` 的 key（`forge.phase` 等）
- action IDs（`forge.newClaudeCode`）
- `icon name`（如 `hammer`、`brain`）

### 5.4 安全与脱敏（R11.5, R11.6, R14.8）

- `secret-redactor.ts` 复用 CTK spec R12.11 定义的模块（跨 spec 共享）。Mirror_Daemon 不直接读 `.env` / `.git/config`；所有通过 Events_NDJSON 或 reviews.md 流入的文本字段由 Forge 侧写入前脱敏。
- Mirror_Daemon 仅调用 cmux 的读写 sidebar / notify / browser 命令，**白名单**禁止调用 `reload-config` 等修改 cmux 配置的命令（R11.6）。
- `CMUX_SOCKET_PATH` 权限：Forge 不修改 socket 模式；用户在共享主机上应使用 cmux 的 `cmuxOnly` 模式（cmux 自身能力，非本 spec 范围）。

### 5.5 并发安全

| 场景 | 策略 | Requirement |
|---|---|---|
| 多 Sync_Once 并发 | `.tinkerman/.locks/cmux-sync.lock` + 1s timeout，后来者 skip | R2.10 |
| 多 Mirror_Daemon 实例 | `.tinkerman/.locks/cmux-mirror.lock` exclusive，后来者 exit 0 | R2.10 |
| 多 worktree 并发 Forge Loop | 每个 worktree 一个 `.tinkerman/runs/<id>/events.ndjson`；Mirror_Daemon 按 Workspace_Ref 分离 counter | R16.9 |
| sdk-driver 并发 appendFileSync | `O_APPEND` 原子保证行边界（POSIX） | R14.1 |
| reviews.md atomic rewrite | tmp + rename（POSIX atomic） | R15.3 |
| dedupe file write | tmp + rename | R6.2 |

### 5.6 可观测性（自检通道）

用户可运行这些命令诊断集成状态：

```bash
# 1. 看 Mirror_Daemon 是否活
cat .tinkerman/.cmux-mirror.pid  # 若 pid 存活即 running
ps -p $(cat .tinkerman/.cmux-mirror.pid) 2>/dev/null

# 2. 看 cmux sidebar 当前状态
cmux sidebar-state --json | jq '.'

# 3. 看最近事件流
jq -c '.' .tinkerman/runs/*/events.ndjson | tail -20

# 4. 看上次 sync 发送了什么
cat .tinkerman/.cmux-last-sync.json | jq '.'

# 5. 看 respawn 计数
cat .tinkerman/.cmux-respawn-count 2>/dev/null

# 6. 触发一次 sync（绕过 hook）
node scripts/cmux-mirror/sync-once.mjs

# 7. 主动推送一次 resync（测试 push socket）
bash scripts/cmux-mirror/push.sh resync_now
```

### 5.7 Push 通道与 Zero-Impact 的关系（R17）

Mirror_Push_Socket 不是 Zero-Impact 的新漏洞来源：

- **Forge 核心不调 push.sh**：R11.10 限定的 3 处 src 改动中无一处调用 push.sh。既有 13 个 SKILL 也不调用（R17.7 "opt-in"）。
- **SKILL 调 push.sh 是可选优化**：任何使用 push 的 SKILL 必须在 push.sh 返回后继续原路径（即仍要写 `.tinkerman/status.md` 等），让 fs.watch 作为权威路径兜底。
- **Daemon 不存在时无 socket**：push.sh 首行检测 `cmuxAvailable()` + socket 存在性，两项任一失败 exit 0（R17.5, R17.10）。
- **权限 0600**：即便多用户主机上 socket 泄漏，其他用户也无法连。
- **rate limit 20/s**：即便某 SKILL 写出死循环疯狂 push，最多 20 events/s 被处理，其余静默丢弃。

### 5.8 FS watch vs polling 自适应（R11.2 的达成策略）

Mirror_Daemon 启动时通过 `statfs` / `/proc/mounts` / `df -T` 判定 `.forge` 所在文件系统类型：

| FS 类型 | 策略 |
|---|---|
| macOS APFS / HFS+ | 原生 `fs.watch`（FSEvents） |
| Linux ext4 / xfs / btrfs | 原生 `fs.watch`（inotify） |
| NFS / SMB / CIFS / 9p / FUSE overlay / Docker volume | chokidar polling（1000ms 间隔） |
| 检测失败 | 默认原生 `fs.watch`，首次 ENOSPC/ENOSYS 错误再降级 polling |

polling 模式下 `onFsEvent` 路径相同，只是触发源变了。R11.2 的 p95 500ms 在 polling 模式下仍可达成（1s polling + 250ms debounce → p95 ≈ 1.25s；对绝大多数非 network mount 场景仍用原生模式 < 500ms）。

## 6. State Machines

### 6.1 Forge_Session 状态机（R16, R12.12）

```ascii
                          ┌───────────────┐
                          │    unknown    │ ← Mirror_Daemon boot
                          │  (budget: 5)  │
                          └───────┬───────┘
                                  │
           ┌──────────────────────┼─────────────────────────┐
           │                      │                         │
           │ status.md has        │ no such file            │ 15min no writes
           │ phase != idle        │ OR phase == idle        │ (idle timeout)
           ▼                      ▼                         │
   ┌───────────────┐       ┌───────────────┐               │
   │    active     │       │   inactive    │               │
   │ (budget active)│       │ (budget frozen)│              │
   └───────┬───────┘       └───────┬───────┘               │
           │                       │                        │
           │ status.md             │ status.md phase        │
           │ phase → idle          │ → non-idle OR new      │
           │ OR session_ended      │ session_started event  │
           │ OR session_interrupted│                        │
           │ OR idle timeout ──────┘                        │
           │                                                │
           ▼                                                │
       (to inactive) ───── 会话边界切换 ─── reset budget ──┘
                                           (R16.5)
```

### 6.2 Sticky-Unavailable 状态机（R13.1, R13.9）

```ascii
       ┌──────────────┐
       │  available   │ ← Mirror_Daemon 启动且 cmuxAvailable()=true
       └──────┬───────┘
              │
              │ 任一 cmux CLI 调用返回 EPIPE / ECONNREFUSED / ENOENT
              │ OR stderr contains "refused"/"broken pipe"
              ▼
       ┌──────────────┐
       │    sticky-   │─── 同进程永不翻转回 available
       │  unavailable │
       └──────┬───────┘
              │
              │ 5 秒内停止 fs.watch + 清 PID 文件
              ▼
            EXIT 0
```

### 6.3 Reviews `layers_status` 状态机（R15）

每个 layer 独立：

```ascii
┌─────────┐   layer Subagent   ┌─────────┐
│ pending │──── completes ────▶│  done   │
└────┬────┘                    └─────────┘
     │
     │ layer Subagent fails / timeout / unreadable
     ▼
┌─────────┐
│ failed  │
└─────────┘
```

所有三个 layer 都 ∈ {done, failed} → review.ts 原子写 `completed_at = now()` → Mirror_Daemon 观察到 `completed_at ≠ null` → 发聚合 notify（session 内 topic 去重）。

---

## 7. Sequence Diagrams

### 7.1 Forge `/forge build` 状态同步到 sidebar

```ascii
User         /forge build    src/review etc.   fs (.tinkerman/)    Mirror_Daemon    cmux CLI
 │                │                │                 │                │               │
 │ /forge build   │                │                 │                │               │
 ├───────────────▶│                │                 │                │               │
 │                │ write status.md phase=build      │                │               │
 │                ├────────────────────────────────▶│                │               │
 │                │                │                 │ fs.watch event │               │
 │                │                │                 ├───────────────▶│               │
 │                │                │                 │                │ reader.read() │
 │                │                │                 │                │◀────────────  │
 │                │                │                 │                │ diff payload  │
 │                │                │                 │                │ emitter.build │
 │                │                │                 │                │ set-status    │
 │                │                │                 │                ├──────────────▶│
 │                │                │                 │                │               │ sidebar updated
 │                │ DAG task 1 done                   │                │               │
 │                │ write progress/<t>.md            │                │               │
 │                ├────────────────────────────────▶│                │               │
 │                │                │                 │ fs.watch event │               │
 │                │                │                 ├───────────────▶│               │
 │                │                │                 │ (250ms debounce)               │
 │                │                │                 │                │ reader.parseProgressDag
 │                │                │                 │                │ set-progress  │
 │                │                │                 │                ├──────────────▶│
 │                │                │                 │                │               │
 │                │ DAG task 2 done ...（重复上面路径）                  │               │
 │                │                │                 │                │               │
 │                │ /forge build 完成                                 │                │
 │                │ write status.md phase=idle                        │                │
 │                ├────────────────────────────────▶│                │               │
 │                │                │                 │ fs.watch event │               │
 │                │                │                 ├───────────────▶│               │
 │                │                │                 │                │ session.end   │
 │                │                │                 │                │ emit log      │
 │                │                │                 │                ├──────────────▶│
```

### 7.2 forge-loop 长任务信号

```ascii
User      forge-loop        src/sdk-driver       events.ndjson    Mirror_Daemon    cmux CLI
 │             │                   │                    │                │               │
 │ forge-loop  │                   │                    │                │               │
 ├────────────▶│                   │                    │                │               │
 │             │ writeEvent        │                    │                │               │
 │             │ session_started   │                    │                │               │
 │             ├──────────────────▶│                    │                │               │
 │             │                   │ appendFileSync     │                │               │
 │             │                   ├───────────────────▶│                │               │
 │             │                   │                    │ fs.watch event │               │
 │             │                   │                    ├───────────────▶│               │
 │             │                   │                    │                │ readEventsSince
 │             │                   │                    │                │ session.start │
 │             │                   │                    │                │ budget.reset()│
 │             │                   │                    │                │ set-status    │
 │             │                   │                    │                │ forge.loop    │
 │             │                   │                    │                ├──────────────▶│
 │             │                   │                    │                │ set-progress 0│
 │             │                   │                    │                ├──────────────▶│
 │             │                   │                    │                │               │
 │ iter 1 ok, git commit                                                  │               │
 │             │ iter_committed    │                    │                │               │
 │             ├──────────────────▶│                    │                │               │
 │             │                   ├───────────────────▶│                │               │
 │             │                   │                    ├───────────────▶│               │
 │             │                   │                    │                │ set-progress ratio
 │             │                   │                    │                │ log success   │
 │             │                   │                    │                ├──────────────▶│
 │             │                   │                    │                │               │
 │ iter 2 fail, 3 consecutive → circuit breaker                           │               │
 │             │ circuit_breaker_tripped                │                │               │
 │             ├──────────────────▶│                    │                │               │
 │             │                   ├───────────────────▶│                │               │
 │             │                   │                    ├───────────────▶│               │
 │             │                   │                    │                │ budget.consume│
 │             │                   │                    │                │ notify        │
 │             │                   │                    │                ├──────────────▶│
 │             │                   │                    │                │               │ 桌面弹窗
 │             │ loop_terminated   │                    │                │               │
 │             ├──────────────────▶│                    │                │               │
 │             │                   ├───────────────────▶│                │               │
 │             │                   │                    ├───────────────▶│               │
 │             │                   │                    │                │ clear-status  │
 │             │                   │                    │                ├──────────────▶│
 │◀────────── forge-loop exits                                           │               │
```

### 7.3 /forge review 三层聚合

```ascii
User     /forge review     src/review.ts    fs (.tinkerman/reviews/)    Mirror_Daemon   cmux
 │             │                 │                     │                    │          │
 │ /forge review                  │                     │                    │          │
 ├────────────▶│                 │                     │                    │          │
 │             │ initReviewFrontmatter                  │                    │          │
 │             ├────────────────▶│                     │                    │          │
 │             │                 │ write topic.md       │                    │          │
 │             │                 │ layers_status: all pending                │          │
 │             │                 ├────────────────────▶│                    │          │
 │             │                 │                     │ fs.watch           │          │
 │             │                 │                     ├───────────────────▶│          │
 │             │                 │                     │                    │ (no-op: 都是 pending)
 │             │                 │                     │                    │          │
 │             │ fan-out 3 Subagents                    │                    │          │
 │             │                                        │                    │          │
 │             │ spec-check done  │                     │                    │          │
 │             │ markLayerStatus("spec_check","done")   │                    │          │
 │             ├────────────────▶│                     │                    │          │
 │             │                 │ atomic rewrite      │                    │          │
 │             │                 ├────────────────────▶│                    │          │
 │             │                 │                     ├───────────────────▶│          │
 │             │                 │                     │                    │ per-layer log
 │             │                 │                     │                    ├─────────▶│
 │             │                 │                     │                    │          │ sidebar log entry
 │             │                 │                     │                    │          │
 │             │ quality-check done（同路径）                                 │          │
 │             │ security-check done（同路径；所有 terminal）                 │          │
 │             │                 │ set completed_at = now                    │          │
 │             │                 ├────────────────────▶│                    │          │
 │             │                 │                     ├───────────────────▶│          │
 │             │                 │                     │                    │ 检测 completed_at ≠ null
 │             │                 │                     │                    │ session 内 topic 去重
 │             │                 │                     │                    │ aggregate notify
 │             │                 │                     │                    ├─────────▶│
 │             │                 │                     │                    │          │ 桌面弹窗
```

### 7.4 冻结拦截 + hook-notify

```ascii
User/AI      Claude Code     PreToolUse hook    src/check-frozen.ts    hook-notify.sh    cmux CLI
  │               │                  │                    │                     │              │
  │ Edit .tinkerman/specs/x/spec.md      │                    │                     │              │
  ├──────────────▶│                  │                    │                     │              │
  │               │ PreToolUse       │                    │                     │              │
  │               ├─────────────────▶│                    │                     │              │
  │               │                  │ node check-frozen  │                     │              │
  │               │                  ├───────────────────▶│                     │              │
  │               │                  │                    │ decision = block    │              │
  │               │                  │                    │ (exit 1 imminent)   │              │
  │               │                  │                    │ spawn hook-notify.sh│              │
  │               │                  │                    ├────────────────────▶│              │
  │               │                  │                    │                     │ check cmux avail
  │               │                  │                    │                     │ check dedupe ts
  │               │                  │                    │                     │ cmux log error
  │               │                  │                    │                     ├─────────────▶│
  │               │                  │                    │                     │              │ sidebar log
  │               │                  │                    │                     │ cmux notify  │
  │               │                  │                    │                     ├─────────────▶│
  │               │                  │                    │                     │              │ 桌面弹窗
  │               │                  │                    │                     │ write dedupe ts
  │               │                  │                    │                     │◀── exit 0    │
  │               │                  │                    │◀── fire-and-forget  │              │
  │               │                  │                    │ exit 1 (UNCHANGED)  │              │
  │               │                  │◀── exit 1          │                     │              │
  │               │◀── blocked       │                    │                     │              │
  │◀── Edit blocked                  │                    │                     │              │
```

### 7.5 sync-once 兜底流程

```ascii
User     Forge SKILL     hook        sync-once.mjs     lib/reader    lib/emitter    cmux CLI
 │            │            │                │                │              │             │
 │            │ writes .tinkerman/status.md                       │              │             │
 │            ├─────────────────────────────────────────────▶ (fs)            │             │
 │            │            │ PostToolUse    │                │              │             │
 │            │            │ Write\|Edit    │                │              │             │
 │            │            ├───────────────▶│                │              │             │
 │            │            │                │ cmuxAvailable? yes           │             │
 │            │            │                │ check .cmux-mirror.pid       │             │
 │            │            │                │                │              │             │
 │            │            │                │ case A: pid 存活 → 只做 sync │             │
 │            │            │                │ case B: pid 不存活 → 尝试 respawn mirror.mjs │
 │            │            │                │                                            │
 │            │            │                │ acquire .locks/cmux-sync.lock              │
 │            │            │                │ (1s timeout; skip if fail)                 │
 │            │            │                │                │              │             │
 │            │            │                │ read state     │              │             │
 │            │            │                ├───────────────▶│              │             │
 │            │            │                │◀── payload     │              │             │
 │            │            │                │ diff vs .cmux-last-sync.json │             │
 │            │            │                │                │ emitter.build              │
 │            │            │                ├────────────────────────────── │             │
 │            │            │                │◀── cmds        │              │             │
 │            │            │                │ runCli for each cmd          │             │
 │            │            │                ├────────────────────────────── ─────────────▶│
 │            │            │                │                │              │             │
 │            │            │                │ update .cmux-last-sync.json  │             │
 │            │            │                │ release lock   │              │             │
 │            │            │                │◀── exit 0 (timeout < 500ms)  │             │
 │            │            │◀── hook done   │                │              │             │
```

### 7.6 Browser_QA_Fallback（R8）

```ascii
User   /forge test   browser-qa.mjs    cmux browser   dev server   fs (.tinkerman/findings/)
 │           │              │                │              │               │
 │           │ engage? (R8.1)                │              │               │
 │           ├─────────────▶│                │              │               │
 │           │              │ cmuxAvailable? │              │               │
 │           │              │ yield to CTK?  │              │               │
 │           │              │                │              │               │
 │           │              │ open <url>     │              │               │
 │           │              ├───────────────▶│              │               │
 │           │              │                │  load        │               │
 │           │              │                ├─────────────▶│               │
 │           │              │ identify --json│              │               │
 │           │              ├───────────────▶│              │               │
 │           │              │◀── surface:N   │              │               │
 │           │              │                │              │               │
 │           │              │ wait --load-state complete    │               │
 │           │              ├───────────────▶│              │               │
 │           │              │◀── ready       │              │               │
 │           │              │                │              │               │
 │           │              │ loop: snapshot / click / fill │               │
 │           │              ├───────────────▶│              │               │
 │           │              │◀── output      │              │               │
 │           │              │ write snapshot-<n>.json / screenshot-<n>.png  │
 │           │              ├─────────────────────────────────────────────▶│
 │           │              │                │              │               │
 │           │              │ console list / errors list    │               │
 │           │              ├───────────────▶│              │               │
 │           │              │◀── output      │              │               │
 │           │              │ write console.log / errors.log                │
 │           │              ├─────────────────────────────────────────────▶│
 │           │              │                │              │               │
 │           │              │ write verdict.md (Three_State_Verdict)        │
 │           │              ├─────────────────────────────────────────────▶│
 │           │              │◀── { verdict }│              │               │
 │           │◀── verdict    │                │              │               │
```

---

## 8. Testing Strategy

### 8.1 Property-based tests（新增 6 个文件）

全部采用 fast-check，默认 200 iterations，匹配 Forge 既有 109 个 property 文件的风格。所有 property 目标模块位于 `scripts/cmux-mirror/lib/`（纯 JS 模块；Vitest 可直接 import）。

| 测试文件 | 目标模块 | 属性 | Requirement |
|---|---|---|---|
| `test/cmux-mirror/availability.property.test.ts` | `lib/availability.mjs` | idempotence：相同 env/fs → 相同返回 | R12.1 |
| `test/cmux-mirror/payload-mapping.property.test.ts` | `lib/payload.mjs` | 总函数性：phase ∈ 域 → icon ∈ 值集；域外 → `circle` | R12.3, R12.4 |
| `test/cmux-mirror/budget-monotonic.property.test.ts` | `lib/budget.mjs` | 单调非增：任意 consume 序列都不增加可用预算 | R12.2 |
| `test/cmux-mirror/dedupe-idempotent.property.test.ts` | `lib/dedupe.mjs` | 5s 窗口内第二次调用返回相同决定 | R12.8 |
| `test/cmux-mirror/events-tolerance.property.test.ts` | `lib/events.mjs` | malformed 行不阻止后续解析；cursor 单调递增 | R12.11, R14.6 |
| `test/cmux-mirror/session-totality.property.test.ts` | `lib/session.mjs` | 任何事件序列下 state ∈ {unknown, active, inactive} | R12.12 |

### 8.2 Integration tests（新增 ≈ 10 个）

使用 `test/cmux-mirror/mock-socket.ts` 做 cmux Unix socket 模拟（R11.8）。CI 在 Linux runner 跑，不依赖真实 cmux。

| 测试文件 | 覆盖 AC |
|---|---|
| `test/cmux-mirror/mirror-startup.test.ts` | R1.5–R1.10, R2.10, R13.5 |
| `test/cmux-mirror/mirror-fs-watch.test.ts` | R2.1–R2.6, R3.1–R3.7 |
| `test/cmux-mirror/mirror-events-consume.test.ts` | R4.1–R4.10, R14.1–R14.10 |
| `test/cmux-mirror/mirror-review-observe.test.ts` | R5.1–R5.7, R15.1–R15.8 |
| `test/cmux-mirror/mirror-session-boundary.test.ts` | R16.1–R16.9 |
| `test/cmux-mirror/sync-once.test.ts` | R2.7–R2.9, R13.12 |
| `test/cmux-mirror/hook-notify.test.ts` | R6.1–R6.7 |
| `test/cmux-mirror/browser-qa.test.ts` | R8.1–R8.9 |
| `test/cmux-mirror/sticky-unavailable.test.ts` | R13.1, R13.9 |
| `test/cmux-mirror/tmux-passthrough.test.ts` | R13.3, R13.4 |

### 8.3 Schema / smoke tests（新增 3 个）

| 测试文件 | 覆盖 |
|---|---|
| `test/cmux-mirror/cmux-json-schema.test.ts` | R9.9：`templates/cmux.json` 合法 JSON 且含 `commands`/`actions`/`ui` |
| `test/cmux-mirror/reviews-frontmatter-schema.test.ts` | R15.8：`/forge review` 输出必含 `layers_status` + `completed_at` |
| `test/cmux-mirror/i18n-parity.test.ts` | R11.4：`locales/zh.json` + `locales/en.json` key 集合一致 |

### 8.4 测试计数目标

```
current:    3526 tests, 212 files, 109 property files, 89.35% stmt coverage
add:        ≈ 6 property + 10 integration + 3 smoke = 19 new files, ≈ 400 new assertions
target:     ≈ 3900 tests, 231 files, 115 property files
coverage:   ≥ 89% statement coverage maintained
```

### 8.5 CI 接入

- 新测试自动被 `npm run check` 捕获（= `tsc --noEmit && biome check && vitest run && scripts/check-readme-metrics.sh`）
- 无需修改 CI 配置；需在 README.md 的测试统计注解里更新数字

---

## 9. Rollout Plan

### Sprint 1（≈ 2 天，打地基）

| Task | Requirement | 产出 |
|---|---|---|
| 1.1 创建 `scripts/cmux-mirror/lib/` 六个纯函数库（availability、capabilities、payload、budget、dedupe、cli） | R1, R7, R12.3, R12.4 | 6 个 mjs + 4 个 property test |
| 1.2 `test/cmux-mirror/mock-socket.ts` | R11.8 | 1 个 mock + fixtures |
| 1.3 `.tinkerman/config.md` 新增 5 个 optional 字段说明 + `templates/config.md` 同步 | R11.9, R16.7, R13.12 | 文档 patch |
| 1.4 i18n key 补全（22 条） + parity 测试 | R11.4 | 2 locale 文件 patch |
| 1.5 `package.json` 新增 `yaml` 依赖（pinned version） | R15.3 | 1 个 patch |

### Sprint 2（≈ 3 天，Events 与 reviews frontmatter）

| Task | Requirement | 产出 |
|---|---|---|
| 2.1 `lib/events.mjs` + property test | R14, R12.11 | 1 lib + 1 property test |
| 2.2 `src/sdk-driver.ts` 追加 `writeEvent` + 9 个切点 | R14, R4 | src 改动 ≤ 100 行 |
| 2.3 `lib/reviews.mjs` | R15 | 1 lib |
| 2.4 `src/review.ts` 追加 `initReviewFrontmatter` + `markLayerStatus` + atomic rewrite（用 `yaml`） | R15 | src 改动 ≤ 80 行 |
| 2.5 Events / reviews 相关 integration tests | R14, R15 | ≈ 3 个 integration test |

### Sprint 3（≈ 3 天，Mirror_Daemon 核心 + push 通道）

| Task | Requirement | 产出 |
|---|---|---|
| 3.1 `lib/session.mjs` + property test | R16, R12.12 | 1 lib + 1 property test |
| 3.2 `lib/reader.mjs` + `lib/emitter.mjs` | R2.1, R2.2, R3.2 | 2 lib |
| 3.3 `lib/push-server.mjs` + `push.sh` | R17 | 1 lib + 1 脚本 + 1 test |
| 3.4 `mirror.mjs` 主循环（fs.watch / polling 自适应 + push-server 绑定 + 防抖 + dispatch） | R2, R3, R4, R5, R7, R13, R16, R17 | 1 主程序 |
| 3.5 Mirror_Daemon 相关 integration tests（startup / fs-watch / polling fallback / push socket / events consume / review observe / session boundary / sticky-unavailable） | 全集 | ≈ 8 个 integration test |

### Sprint 4（≈ 2 天，sync-once / respawn / hook 接入）

| Task | Requirement | 产出 |
|---|---|---|
| 4.1 `lib/respawn.mjs`（原子读写 `.cmux-respawn-count` + budget 检查 + session 边界 reset） | R13.12–14 | 1 lib + 1 test |
| 4.2 `sync-once.mjs`（含受限 respawn 逻辑） | R2.7–R2.10, R13.12–14 | 1 脚本 |
| 4.3 `hook-notify.sh` | R6 | 1 脚本 |
| 4.4 `src/check-frozen.ts` 追加 1 行 exec | R6.1, R12.7 | src 改动 1 行 |
| 4.5 `hooks/hooks.json` 追加 3 条非阻塞 hook | R2.7 | hooks patch |
| 4.6 sync-once / hook-notify / respawn budget integration tests | R2, R6, R13.12–14 | ≈ 3 个 integration test |

### Sprint 5（≈ 2 天，模板与可选包）

| Task | Requirement | 产出 |
|---|---|---|
| 5.1 `templates/cmux.json`（三种布局 + Mirror_Pane + forge.newClaudeCode action + ui.surfaceTabBar） | R9.1–R9.4, R9.7 | 1 JSON |
| 5.2 `scripts/cmux-mirror/install-template.sh` + `scripts/init.sh` 扩展（识别 `--no-cmux` / `--force`） | R9.1, R9.5, R9.6 | 2 脚本 patch |
| 5.3 cmux.json schema smoke test | R9.9, R12.9 | 1 test |
| 5.4 `browser-qa.mjs` + reference | R8 | 1 脚本 + 1 md |
| 5.5 `cmux-skills/` 3 个 SKILL.md + `install.sh` | R10 | 4 个文件 |
| 5.6 `scripts/prune-event-logs.sh` 追加 dedupe GC 分支 | R6.4 | 脚本 patch |

### Sprint 6（≈ 1 天，文档与收尾）

| Task | Requirement | 产出 |
|---|---|---|
| 6.1 `skills/forge-review/references/cmux.md`、`forge-test/references/cmux-browser.md` 等 5 个 reference 文档 | §2.4 | 5 个 md |
| 6.2 README.md 测试统计更新 + cmux 集成段落 | — | README patch |
| 6.3 ROADMAP.md 登记 Events_NDJSON 复用为 `/forge learn --from-runs`、`/forge debug` 未来消费者 | Out of Scope #9 | ROADMAP patch |
| 6.4 端到端演练（手工在装了 cmux 的 macOS 开发机） | 全部 | 验收报告 |

**总计**：13 个工作日（≈ 2.5 周）。

---

## 10. Risk Register

| # | 风险 | 影响 | 概率 | 缓解 |
|---|---|---|---|---|
| 1 | **守护进程挂了但用户不知道** | 中：长任务无 sidebar 更新用户以为 Forge 卡死 | 中 | R13.12 hook 自愈；`.cmux-mirror.pid` + `cmux log warning "respawning after crash"` 让用户能在 sidebar 看到；文档教 `ps -p $(cat .tinkerman/.cmux-mirror.pid)` 自检 |
| 2 | **fs.watch 在 macOS 上对 Network Volume / iCloud Drive 不稳定** | 低-中：在这些路径下事件丢失 | 低 | Forge 项目通常在本地 SSD 上开发；若必须在 Network Volume，Mirror_Daemon 文档里说明降级到 polling 模式（chokidar 支持）；sync-once 的 hook 路径作为兜底 |
| 3 | **Events_NDJSON 格式演进破坏兼容** | 中：老版本 Forge 产生的 ndjson 新版 mirror 读不懂 | 低 | `schema_version` 字段 + R14.9 显式版本检测；新增字段不增 major 版本；删字段或改类型走 `schema_version: 2` |
| 4 | **R15 reviews frontmatter 扩展破坏老 reviews 文件** | 中：旧 reviews/<topic>.md 缺字段 | 中 | R15.7 显式要求 mirror 容忍缺失字段；`src/review.ts` 写入时始终补齐 |
| 5 | **cmux pre-1.0 命令 API 变动** | 中：某些命令被移除或改签名 | 中 | R13.5 cmux capabilities --json 探测；不在能力列表 → 跳过；不做 SemVer 比较；fixtures 里保留 capabilities-full/partial 两套 |
| 6 | **Mirror_Daemon 与 sync-once 并发写 cmux sidebar 竞争** | 低：最终状态正确但中间帧抖动 | 低 | R2.10 sync-once 持有 lock 写；mirror 不持 sync-once 的锁（两者目标不同：sync-once 写完整快照，mirror 增量事件）；接受"偶发 200ms 内的视觉抖动" |
| 7 | **Zero-Impact 被某条路径破坏（Forge 在 cmux 缺席时出错）** | 高：破坏 Forge 核心承诺 | 低 | §5.1 五层防护 + R12.5 property test + CI 在无 cmux 的 Linux runner 跑全套测试 |
| 8 | **cmux socket 权限在共享主机上暴露** | 高：其他用户可向 sidebar 写内容 | 低 | cmux 自身能力（`cmuxOnly` 模式）；本 spec 不改 socket 权限；README 警告共享主机风险 |
| 9 | **hook timeout 2s 不够大** | 低：sync-once 偶发被 kill | 低 | sync-once 设计时 ≤ 500ms（R2.6）；hook timeout 保 4× 富余；真超时 hook 照常继续，下次事件补 |
| 10 | **SKILL 通过 push.sh 疯狂推送导致 sidebar 抖动** | 中：用户体验退化 | 低 | R17.8 硬 rate limit 20/s；超出静默丢弃 + debug log；push.sh 的 type 白名单不包括 notify（R17.4）即便被滥用也不会弹风暴通知 |
| 11 | **Respawn 风暴掩盖真问题** | 中：mirror 反复崩溃用户看不出来 | 中 | R13.12 受限 budget 默认 3；耗尽后每 session 发一次 warning 日志而非每次都发；用户能通过 `cat .tinkerman/.cmux-respawn-count` 诊断 |
| 12 | **Docker mount / NFS 上 fs.watch 事件丢失** | 中：长任务更新不实时 | 中 | Mirror_Daemon 启动时自动检测 fs 类型并降级 polling（§5.8）；polling 模式 p95 ≈ 1.25s 仍可接受；文档说明用户可通过 `cmux_integration: on` 观察 stderr 确认模式 |

---

## 11. Backward Compatibility

### 11.1 已有 13 个 SKILL 保证

| SKILL | 是否受影响 | 契约变化 |
|---|---|---|
| forge-router | 否 | 无 |
| forge-decide | 否 | 无 |
| forge-spec | 否 | 无 |
| forge-plan | 否 | 无 |
| forge-build | 否（仅通过观察 `.tinkerman/progress/` 被 Mirror 消费） | 无 |
| forge-review | 实现扩展 2 个 frontmatter 字段（R15） | **外部契约不变**：body schema 与既有一致，新字段向后兼容（缺失字段 = pending 语义） |
| forge-test | 新增 Browser_QA_Fallback 入口（R8） | 契约不变；只有在 UI 项目且无 Playwright 且 cmux 可用时自动触发 |
| forge-ship | 否 | 无 |
| forge-learn | 否（未来可通过 `--from-runs` 读 Events_NDJSON，本 spec 不实现） | 无 |
| forge-status | 否 | 无 |
| forge-resume | 否 | 无 |
| forge-debug | 否 | 无 |
| forge-abort | 否 | 无 |

### 11.2 已有 10 个 Agent 保证

本 spec **不修改**任何 `.claude/agents/*.md`（R5.6）。CTK spec 的 agent 改动与本 spec 独立。

### 11.3 `src/` 改动清单（仅 3 处，共 ≤ 181 行）

| 文件 | 改动规模 | 契约变化 |
|---|---|---|
| `src/sdk-driver.ts` | +100 行（`writeEvent` 辅助 + 9 切点调用） | 私有，外部契约不变 |
| `src/check-frozen.ts` | +1 行（尾部 exec hook-notify.sh） | exit code 行为完全不变（R12.7） |
| `src/review.ts` | +80 行（`initReviewFrontmatter` + `markLayerStatus` + atomic helper） | 新方法是追加，不修改既有方法 |

### 11.4 CI 行为保证

- `npm run check` 不变
- `scripts/build-dist.sh` 自动捕获新 `scripts/cmux-mirror/` 目录；需验证（Sprint 6 任务 6.4）
- `.tinkerman/config.md` 无新必填字段（R11.9）

### 11.5 用户升级路径

```bash
# 用户从旧版 Forge 升级
git pull
npm install
npx tsc

# 新功能自动 opt-in（cmux_integration: auto）：
#   - 有 cmux → .cmux/cmux.json 存在 → 用户用 Forge Workflow 布局启动 → Mirror_Daemon 自动拉起
#   - 无 cmux → Mirror_Daemon 不启动（ZeroImpact）
#   - 要禁用 → .tinkerman/config.md 设 cmux_integration: off
```

### 11.6 首次使用流程

```bash
# 新项目
cd myproject
~/.claude/skills/forge/scripts/init.sh     # 自动拷贝 .cmux/cmux.json（若 --no-cmux 不传）

# 打开 cmux → ⌘P → 选 "Forge Workflow"
# 布局自动拉起 4 个 pane：
#   - Claude Code（左）
#   - tail -f .tinkerman/status.md（右上）
#   - tail -c 20000 -f .tinkerman/progress/*.md（右中）
#   - node scripts/cmux-mirror/mirror.mjs（底部 Mirror_Pane）
#
# Mirror_Pane 启动后：
#   - cmux 不在 → exit 0（视觉上 pane 显示 shell prompt）
#   - cmux 在 → fs.watch 启动，sidebar 开始接收更新
```

---

## 12. Decision Log

### D1. 为什么选观察者而非适配器？

**选择**：观察者架构 + 强制守护 + Events_NDJSON。

**理由**：
- 适配器方案要求 Forge 主动调 `cmuxAdapter.xxx()`，即便每个调用都守卫 `cmuxAvailable()`，Forge 代码依然被 cmux 污染。Zero-Impact 是**代码层面**的 no-op，不是**结构层面**的解耦。
- 观察者方案让 Forge 仅对 `.tinkerman/` 负责（已有行为），Mirror_Daemon 作为外部消费者。cmux 不可用时 Mirror_Daemon **根本不被启动**，Zero-Impact 是物理保证。
- Events_NDJSON 不是为 cmux 专做：它对 `/forge learn --from-runs`、`/forge debug` 也有长期价值。

**备选**：
- 适配器门面 → 拒绝（耦合面大，src 改 4 个文件）
- SKILL 自驱动（agent 主动调 cmux CLI）→ 拒绝（依赖 agent 记忆，不稳定；仍需定义输出契约）
- 纯 hook 触发（无守护进程）→ 拒绝（hook 频率低，长任务秒级更新丢失）

### D2. 为什么强制守护而非可选守护？

**选择**：强制（通过 `templates/cmux.json` 布局里的 Mirror_Pane 自动拉起）。

**理由**：
- "可选"意味着用户需要记住手动 `node scripts/cmux-mirror/mirror.mjs`，大部分用户不会记得。
- sync-once 作为兜底能工作，但 hook 频率（每次工具调用）对长任务不够细。
- 通过 cmux.json 布局自动拉起，和"打开 Forge Workflow 工作区"的自然动作绑定，用户无感。

**备选**：
- 可选守护 → 拒绝（长任务可观测性不足）
- 启动后 Claude Code 主动拉起 → 拒绝（侵入 Forge 核心）

### D3. 为什么 Events_NDJSON 而非写更多 `.tinkerman/status.md` 字段？

**选择**：Events_NDJSON 作为 Forge Loop 事件源，`.tinkerman/status.md` 维持既有 /forge 会话状态。

**理由**：
- `.tinkerman/status.md` 是"快照"型状态（phase、tier、current_topic），不是事件流。塞事件进去会污染快照语义。
- Forge Loop 的每轮迭代本质是事件（iter_committed、iter_rolled_back）；NDJSON 是标准的事件流格式，`jq` / `tail -f` 都能直接处理。
- NDJSON 可被多消费者共享（Mirror_Daemon、`/forge learn --from-runs`、未来的 webhook），一次投资长期受益。

**备选**：
- status.md 扩展 `loop_iteration` / `loop_last_event` 字段 → 拒绝（覆盖写会丢失历史事件，反复读取 → fs.watch 风暴）
- 每轮写一个 `.tinkerman/runs/<id>/iter-<n>.md` 文件 → 拒绝（文件数量爆炸）

### D4. 为什么 reviews frontmatter 加 2 字段而非走 Events_NDJSON？

**选择**：reviews/<topic>.md frontmatter 扩展 `layers_status` + `completed_at`。

**理由**：
- reviews 是"文档"型产物，用户需要直接看 md 文件。frontmatter 扩展的字段对人类可读。
- 评审不是长流式事件，状态空间很小（3 层 × 3 态）。用 frontmatter 比事件流更简单。
- Events_NDJSON 目前仅对应 Forge Loop 运行；把评审塞进去会混淆语义。

**备选**：
- 另起 `.tinkerman/reviews/<topic>.events.ndjson` → 拒绝（双倍路径复杂度，收益不显著）
- SKILL 显式调 `cmuxAdapter.reviewComplete()` → 拒绝（重新耦合 Forge 核心）

### D5. 为什么 hook-notify.sh 用 bash 而非 Node？

**选择**：bash 脚本。

**理由**：
- PreToolUse hook 执行频繁（几乎每次工具调用），Node 冷启动 60-100ms 累积明显。
- hook-notify 逻辑简单（check avail → dedupe check → cmux cli × 2 → exit），bash 完全够用，≤ 300ms 预算（R6.6）容易达成。
- 依赖 `shasum`、`date`、`basename` 都是 macOS 默认命令。

**备选**：
- 节点脚本 → 拒绝（冷启动成本累积）
- 嵌入 `src/check-frozen.ts` 里直接调 cmux CLI → 拒绝（污染核心 src；ts 脚本每次也要经 node 执行）

### D6. 为什么 per-Workspace_Ref 独立预算而非全局预算？

**选择**：`budget.mjs` 持 Map<workspace_ref, counter>（R16.9）。

**理由**：
- 用户在 cmux 里可能开 5 个 workspace 同时跑 /forge，每个都是独立任务。一个 workspace 达到预算就禁用所有 workspace 的通知反而是用户体验退化。
- cmux `set-status --workspace workspace:2` 本来就是每工作区独立的；预算保持一致性。

**备选**：
- 全局预算 → 拒绝（跨 workspace 污染）
- 完全不限额 → 拒绝（长跑失败 loop 会发几十次通知，反效果）

### D7. 为什么 `.cmux/cmux.json` 不放入 Frozen Zone？

**选择**：非 Frozen Zone；用户可自由编辑。

**理由**：
- `.cmux/cmux.json` 是用户的**工作区布局偏好**，不是 Forge 契约。用户想改 pane 比例、加命令是正常需求。
- Frozen Zone 保护的是 spec/plan/config 这种"冻结后多次使用"的文档；`.cmux/cmux.json` 是 cmux 自身消费，不属于 Forge 契约链。
- 用户自改的布局 Forge 不 auto-repair（R9.8）。

**备选**：
- 放入 Frozen Zone → 拒绝（违反用户定制需求）

### D8. 为什么 Browser_QA_Fallback 不作为独立 SKILL？

**选择**：作为 `/forge test` 内部的一个 tier，不新建 SKILL（R11.10）。

**理由**：
- R11.10 明确不允许新增 SKILL 目录。
- Browser_QA_Fallback 是条件触发（UI 项目 + 无 Playwright + cmux 可用），和 `/forge test` 其他 tier（项目 harness、Playwright、CTK UI_Harness）并列。
- 更适合作为 `/forge test` 的一条候选 controller 而非独立入口。

**备选**：
- 独立 `forge-browser-qa` SKILL → 拒绝（超 SKILL 预算 + 语义与 /forge test 重叠）

### D9. 为什么 Sync_Once 和 Mirror_Daemon 共享 `lib/` 而非独立实现？

**选择**：共享 `scripts/cmux-mirror/lib/` 下的纯函数库。

**理由**：
- 两者的核心逻辑（读 `.tinkerman/` → 生成 payload → 翻译为 cmux 命令）完全相同；只是触发方式不同（fs.watch vs. hook 一次性）。
- 共享 lib 保证语义一致：不可能出现 sync-once 写某个 key 而 mirror 写另一个 key 的分叉。
- 维护成本减半。

**备选**：
- 独立实现 → 拒绝（重复代码；潜在分叉）

### D10. 为什么保留 Push 通道（R17）而不是"纯观察"到底？

**选择**：保留一个 opt-in、受限、不可发通知的 push 通道。

**理由**：
- 观察者路径的延迟本质上是 `fs.watch 触发时刻 + 250ms 防抖 + 读文件 + 生成 payload + cmux CLI 一跳`，p50 约 150ms，p95 约 500ms。绝大多数场景够用。
- 但有少数场景 SKILL 确实想让 sidebar 在**下一次键盘输入前**已经刷新，比如 `/forge spec` 把文件从 draft 改成 locked 的瞬间——若紧接着用户写该文件会触发 Frozen Hook，sidebar 应该先显示"已锁定"状态再触发 hook。500ms 在这种交互中可能显得迟钝。
- Push 通道给 SKILL 作者一个"opt-in 加速"的逃生口：写不写 `push.sh` 都不影响正确性，但愿意写就能把延迟降到 10ms 量级。
- 设计上**严格限制**：只允许 resync_now / phase_changed / layer_completed 三种 type；不允许 force_notify；20/s rate limit；0600 权限；socket 不存在静默 exit 0。这些约束让 push 通道是**优化加速器而非替代路径**，fs.watch 仍是权威。

**备选**：
- 纯观察无推送 → 拒绝（少数实时场景体验欠佳；无逃生口会逼 SKILL 作者等待 fs.watch 或自己直接调 cmux CLI，后者破坏 Forge 核心不认识 cmux 的约定）
- 推送通道允许触发 notify → 拒绝（大幅增加滥用风险；无法集中治理通知预算）
- HTTP endpoint 而非 Unix socket → 拒绝（权限控制更复杂；需要端口分配）

---

## 13. Requirement Traceability Matrix

每条 Requirement 对应的实现模块与测试：

| Requirement | 主要实现 | 主要测试 |
|---|---|---|
| R1 可用性检测 | `lib/availability.mjs` | availability.property.test, mirror-startup.test |
| R2 阶段同步 | `mirror.mjs` + `sync-once.mjs` + `lib/reader.mjs` + `lib/emitter.mjs` | mirror-fs-watch.test, sync-once.test |
| R3 DAG 进度 | `mirror.mjs` + `lib/reader.mjs` parseProgressDag | mirror-fs-watch.test |
| R4 Forge Loop | `src/sdk-driver.ts` writeEvent + `mirror.mjs` onEventsChange | mirror-events-consume.test |
| R5 评审聚合 | `src/review.ts` + `lib/reviews.mjs` + `mirror.mjs` onReviewChange | mirror-review-observe.test |
| R6 冻结拦截 | `scripts/cmux-mirror/hook-notify.sh` + `src/check-frozen.ts` | hook-notify.test |
| R7 通知预算 | `lib/budget.mjs` + `mirror.mjs` session lifecycle | budget-monotonic.property.test, mirror-session-boundary.test |
| R8 浏览器 QA | `scripts/cmux-mirror/browser-qa.mjs` | browser-qa.test |
| R9 工作区布局 | `templates/cmux.json` + `install-template.sh` | cmux-json-schema.test |
| R10 技能包 | `cmux-skills/` + `install.sh` | （手工验收） |
| R11 NFR | 横切 | i18n-parity.test, 性能断言内嵌 |
| R12 不变量 | 横切 | 全部 property tests |
| R13 边界 | `mirror.mjs` state machine + `lib/*.mjs` | sticky-unavailable.test, tmux-passthrough.test |
| R14 Events_NDJSON | `src/sdk-driver.ts` + `lib/events.mjs` | events-tolerance.property.test, mirror-events-consume.test |
| R15 Reviews frontmatter | `src/review.ts` + `lib/reviews.mjs` | reviews-frontmatter-schema.test, mirror-review-observe.test |
| R16 Forge_Session | `lib/session.mjs` + `mirror.mjs` | session-totality.property.test, mirror-session-boundary.test |
| R17 Mirror Push 通道 | `lib/push-server.mjs` + `scripts/cmux-mirror/push.sh` | mirror-push-socket.test（在 Sprint 3.5 integration tests 内） |

---

## 结束

设计 v3 完成（v1 适配器 → v2 观察者 → v3 观察者 + 受限推送 + 自适应 polling + 受限 respawn）。关键数字：

- **文档规模**：≈ 2200 行 Markdown
- **新文件**：22+ 个（集中在 `scripts/cmux-mirror/`）
- **既有 `src/` 改动**：**3 个**文件（`sdk-driver.ts` / `check-frozen.ts` / `review.ts`），合计 ≤ 181 行
- **新 SKILL**：**0 个**（本 spec）
- **新 npm 依赖**：`yaml`（用于 reviews frontmatter 原子重写）
- **新测试**：≈ 22 个文件（6 property + 13 integration + 3 smoke），≈ 450 assertions
- **Sprint 数**：6 个，约 13 个工作日
- **序列图**：6 个
- **风险项**：12 个
- **决策记录**：10 条

下一步：产出 `tasks.md`。
