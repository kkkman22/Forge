---
status: completed
feature: process-lifecycle-management
layout: requirements
created: 2026-04-29
tier: standard
status_note: "Req1–4 delivered (process-registry.ts shutdownAll/SIGTERM→SIGKILL/process-group kill; process-tree-cleaner). Req5 delivered 2026-06-13: every execFileSync('git',...) across src/ now carries a timeout + killSignal: doctor.ts readGit gained timeout:30_000+SIGTERM (baseline-resolver already had 10s, cleanup-chain 30s+SIGTERM). A static contract test (test/process-lifecycle-git-timeout.contract.test.ts) scans the known git-calling files to guard against regressions. The spec's named effect-executor.ts/run-manager.ts were never created as separate modules; the timeout is applied inline at each call site, which satisfies R5's intent (no git call can block forever)."
---
# 需求文档：进程生命周期管理

## 简介

Forge 当前缺乏统一的子进程生命周期管理机制。在测试阶段（vitest 等）和并行开发场景下，多个 node 子进程可能在任务完成后仍然存活，导致系统资源耗尽和卡顿。根因包括：无进程注册表、无进程组管理、清理逻辑为 fire-and-forget、sleep prevention 进程使用 detached+unref 可能变成孤儿、git 操作无超时、多 worktree 并发无跨会话协调。

这是一个在 Claude Code 生态中被广泛验证的系统性问题。Claude Code 官方仓库存在多个相关 Issue（[#19024](https://github.com/anthropics/claude-code/issues/19024)、[#19097](https://github.com/anthropics/claude-code/issues/19097)、[#33947](https://github.com/anthropics/claude-code/issues/33947)、[#20369](https://github.com/anthropics/claude-code/issues/20369)、[#40550](https://github.com/anthropics/claude-code/issues/40550)），社区已有三个独立项目（cc-reaper、claude-cleanup gist、clean-orphans）收敛到相同的解决方案：**进程组 kill 作为主要手段，PPID=1 孤儿扫描作为兜底**。

社区确认的核心根因：
1. macOS 没有 `prctl(PR_SET_PDEATHSIG)` — 无法在 OS 层面让子进程随父进程自动终止
2. 子进程 PID 不被追踪 — 没有进程注册表
3. 通过 `npm exec` 启动的进程会产生 2 个 node 进程（wrapper + child），都不被注册
4. SIGHUP 不会转发给子进程 — 终端关闭时子进程变成孤儿（PPID=1，被 launchd 收养）
5. 进程组管理缺失 — 子进程不在同一个 process group 中

本功能通过三层防御架构（进程组隔离、进程注册表+统一清理、跨会话兜底清理）建立通用的子进程生命周期管理机制，确保所有通过 Forge 启动的子进程都能被正确追踪和清理。

## 术语表

- **Process_Registry**：进程注册表，一个集中式的内存数据结构，负责追踪所有通过 Forge 启动的子进程的 PID、启动时间、来源等元数据
- **Process_Group**：进程组，操作系统级别的进程分组机制，允许通过 `kill(-pgid, signal)` 向同一组内所有进程发送信号
- **PGID**：Process Group ID，进程组标识符，同一进程组内所有进程共享相同的 PGID
- **PPID**：Parent Process ID，父进程标识符；当父进程退出后，macOS 上孤儿进程的 PPID 变为 1（被 launchd 收养）
- **PID_File**：PID 文件，存储在 `.tinkerman/.pids/` 目录下的文件，记录某个会话所管理的子进程 PID 列表，用于跨会话的孤儿进程检测
- **Orphan_Process**：孤儿进程，父进程已退出但仍在运行的子进程，在 macOS 上表现为 PPID=1
- **Session**：会话，一次 Forge CLI 的完整执行生命周期，从 `main()` 启动到进程退出
- **Graceful_Shutdown**：优雅关闭，在收到终止信号后，按顺序清理所有子进程并等待其退出的过程
- **Sleep_Prevention_Process**：睡眠防止进程，由 Forge 启动的平台特定子进程（如 macOS 的 caffeinate），用于防止系统在长时间运行期间进入睡眠状态
- **Effect_Executor**：效果执行器，负责执行 git 命令等 I/O 操作的模块（`effect-executor.ts`）
- **Forge_CLI**：Forge 命令行入口（`forge-loop-cli.ts`），负责解析参数、启动驱动循环和信号处理
- **Process_Tree**：进程树，由父进程及其所有直接和间接子进程组成的层级结构；`npm exec` 等包装器会产生多层进程树

## 需求

### 需求 1：进程注册表核心功能

**用户故事：** 作为 Forge 开发者，我希望有一个集中式的进程注册表来追踪所有子进程，以便在任何时刻都能知道当前有哪些子进程在运行。

#### 验收标准

1. THE Process_Registry SHALL 提供 `register(child: ChildProcess, metadata: ProcessMetadata)` 方法，将子进程及其元数据注册到注册表中
2. THE Process_Registry SHALL 提供 `unregister(pid: number)` 方法，将指定 PID 的子进程从注册表中移除
3. WHEN 一个已注册的子进程退出时，THE Process_Registry SHALL 通过监听 `exit` 事件自动将该子进程从注册表中移除
4. THE Process_Registry SHALL 提供 `getAll()` 方法，返回当前所有已注册子进程的元数据列表
5. THE Process_Registry SHALL 提供 `size()` 方法，返回当前已注册子进程的数量
6. THE Process_Registry SHALL 以单例模式实现，确保整个 Forge 进程内只有一个注册表实例
7. THE Process_Registry SHALL 为每个注册的子进程记录以下元数据：PID、PGID、启动时间戳、来源标识（如 "sleep-prevention"、"git-command"、"test-runner"）、detached 标志、和可选的描述信息

### 需求 2：统一清理机制

**用户故事：** 作为 Forge 开发者，我希望在 Forge 退出时能统一清理所有子进程，以避免进程泄漏。

#### 验收标准

1. WHEN Forge_CLI 收到 SIGINT 信号时，THE Process_Registry SHALL 向所有已注册子进程发送 SIGTERM 信号
2. WHEN Forge_CLI 收到 SIGTERM 信号时，THE Process_Registry SHALL 向所有已注册子进程发送 SIGTERM 信号
3. WHEN Forge_CLI 收到 SIGHUP 信号时（如终端关闭、tmux kill-session），THE Process_Registry SHALL 向所有已注册子进程发送 SIGTERM 信号
4. WHEN Process_Registry 执行统一清理时，THE Process_Registry SHALL 等待所有子进程退出，最长等待时间为 5 秒
5. IF 子进程在 5 秒内未响应 SIGTERM，THEN THE Process_Registry SHALL 向该子进程发送 SIGKILL 信号强制终止
6. WHEN 统一清理完成后，THE Process_Registry SHALL 记录清理结果日志，包括成功终止和强制终止的子进程数量
7. THE Process_Registry SHALL 提供 `shutdownAll()` 异步方法，按照 SIGTERM → 等待 → SIGKILL 的顺序清理所有已注册子进程
8. WHEN `requestStop()` 被调用时，THE Forge_CLI SHALL 调用 `Process_Registry.shutdownAll()` 并等待其完成，而非 fire-and-forget

### 需求 3：进程组隔离

**用户故事：** 作为 Forge 开发者，我希望所有子进程在同一个进程组中启动，以便在父进程退出时能一次性清理整个进程树（包括 `npm exec` 等包装器产生的多层子进程）。

#### 验收标准

1. WHEN Forge_CLI 启动子进程时，THE Forge_CLI SHALL 默认不使用 `detached: true` 选项，使子进程继承父进程的进程组
2. IF 某个子进程确实需要 `detached: true`（如 Sleep_Prevention_Process），THEN THE Forge_CLI SHALL 将该子进程注册到 Process_Registry 中并记录 detached 标志和独立的 PGID
3. WHEN Forge 主进程退出时，THE Forge_CLI SHALL 通过 `process.kill(-process.pid, 'SIGTERM')` 向整个进程组发送终止信号，作为注册表清理之外的兜底机制
4. THE Forge_CLI SHALL 在 `process.on('exit')` 回调中执行进程组级别的清理，确保即使异常退出（crash、SIGHUP）也能触发
5. WHEN 清理 detached 子进程时，THE Process_Registry SHALL 使用 `kill(-child.pgid, 'SIGTERM')` 终止该子进程的整个进程树，而非仅终止单个 PID

### 需求 4：Sleep Prevention 进程安全管理

**用户故事：** 作为 Forge 开发者，我希望 Sleep Prevention 进程能被安全管理，避免在 Forge 退出后变成孤儿进程。

#### 验收标准

1. WHEN Sleep_Prevention_Process 被启动时，THE Forge_CLI SHALL 将其注册到 Process_Registry 中，来源标识为 "sleep-prevention"
2. WHEN Sleep_Prevention_Process 被启动时，THE Forge_CLI SHALL 不使用 `detached: true` 选项（macOS caffeinate 的 `-w` 参数已能确保父进程退出时自动终止）
3. IF Sleep_Prevention_Process 的 `kill()` 调用失败，THEN THE Forge_CLI SHALL 记录警告日志并在进程组级别清理中兜底处理
4. WHEN Forge_CLI 执行 Graceful_Shutdown 时，THE Process_Registry SHALL 确保 Sleep_Prevention_Process 在其他子进程之前或同时被终止

### 需求 5：Git 命令超时保护

**用户故事：** 作为 Forge 开发者，我希望所有 git 命令都有超时保护，以避免因 git 操作无限阻塞导致整个进程挂起。

#### 验收标准

1. WHEN Effect_Executor 执行 git 命令时，THE Effect_Executor SHALL 为 `execFileSync` 调用设置 30 秒的超时时间
2. WHEN Run_Manager 执行 git 命令时（如 `rev-parse`、`checkout`、`worktree` 操作），THE Run_Manager SHALL 为 `execFileSync` 调用设置 30 秒的超时时间
3. IF git 命令在 30 秒内未完成，THEN THE Effect_Executor SHALL 抛出包含超时信息的错误，错误消息中包含被执行的 git 命令和超时时长
4. IF git 命令超时，THEN THE Effect_Executor SHALL 确保超时的子进程被终止（`execFileSync` 的 `killSignal` 设置为 `SIGTERM`），不留下孤儿进程

### 需求 6：跨会话孤儿进程检测与清理

**用户故事：** 作为 Forge 用户，我希望新启动的 Forge 会话能自动检测并清理之前会话遗留的孤儿进程，以避免系统资源被无用进程占用。

#### 验收标准

1. WHEN 一个新的 Session 启动时，THE Forge_CLI SHALL 在 `.tinkerman/.pids/` 目录下创建一个 `session-<sessionId>.pid` 文件，记录当前会话的 PID、PGID 和所有已注册子进程的 PID
2. WHEN Process_Registry 中的子进程列表发生变化时，THE Process_Registry SHALL 更新对应的 PID 文件内容
3. WHEN 一个新的 Session 启动时，THE Forge_CLI SHALL 扫描 `.tinkerman/.pids/` 目录下的所有 PID 文件
4. WHEN 扫描发现某个 PID 文件对应的会话主进程已不存在时，THE Forge_CLI SHALL 检查该 PID 文件中记录的子进程 PID 是否仍在运行
5. IF 发现仍在运行的 Orphan_Process，THEN THE Forge_CLI SHALL 向其发送 SIGTERM 信号进行清理，并记录清理日志
6. WHEN Session 正常退出时，THE Forge_CLI SHALL 删除自己的 PID 文件
7. IF PID 文件的读取或解析失败，THEN THE Forge_CLI SHALL 记录警告日志并跳过该文件，不影响正常启动流程

### 需求 7：PPID=1 孤儿进程兜底检测

**用户故事：** 作为 Forge 用户，我希望即使 PID 文件机制失效（如进程 crash 导致 PID 文件未写入），系统仍能检测到孤儿进程。

#### 验收标准

1. WHEN 一个新的 Session 启动时，THE Forge_CLI SHALL 在 PID 文件扫描之后，额外执行一次 PPID=1 孤儿进程检测
2. THE Forge_CLI SHALL 通过 `ps` 命令查找所有 PPID=1 且命令行匹配 Forge 相关模式（如包含 `forge`、`vitest`、`caffeinate` 等关键字）的进程
3. IF 检测到疑似 Forge 孤儿进程，THEN THE Forge_CLI SHALL 记录警告日志，列出进程 PID、命令行和运行时长
4. IF 检测到的孤儿进程运行时长超过 1 小时，THEN THE Forge_CLI SHALL 自动向其发送 SIGTERM 信号进行清理
5. IF 检测到的孤儿进程运行时长不超过 1 小时，THEN THE Forge_CLI SHALL 仅记录警告日志，不自动清理（避免误杀用户手动启动的进程）
6. THE PPID=1 检测 SHALL 仅在 macOS 和 Linux 平台上执行（Windows 的孤儿进程机制不同）

### 需求 8：子进程启动封装

**用户故事：** 作为 Forge 开发者，我希望有一个统一的子进程启动接口，确保所有子进程都自动注册到 Process_Registry 中。

#### 验收标准

1. THE Process_Registry SHALL 提供 `spawnTracked(command, args, options)` 方法，封装 `child_process.spawn` 并自动将子进程注册到注册表中
2. THE Process_Registry SHALL 提供 `execTracked(command, args, options)` 方法，封装 `child_process.execFileSync` 并自动设置超时（默认 30 秒）
3. WHEN 使用 `spawnTracked` 启动子进程时，THE Process_Registry SHALL 自动监听子进程的 `exit` 事件以实现自动注销
4. WHEN 使用 `execTracked` 执行同步命令时，THE Process_Registry SHALL 在命令完成后自动从注册表中移除对应记录
5. IF `spawnTracked` 或 `execTracked` 的调用者提供了 `source` 元数据，THEN THE Process_Registry SHALL 将其记录在注册表条目中
6. WHEN 使用 `spawnTracked` 启动子进程时，THE Process_Registry SHALL 自动记录子进程的 PGID，用于进程树级别的清理

### 需求 9：Vitest 并发控制

**用户故事：** 作为 Forge 开发者，我希望 vitest 测试运行时的并发度受到限制，以避免多个 worktree 同时跑测试时产生过多 node 进程。

#### 验收标准

1. THE Forge 项目的 vitest 配置 SHALL 设置 `pool` 为 `forks` 模式，并限制 `poolOptions.forks.maxForks` 为 2
2. WHEN vitest 以 `vitest run` 模式执行时，THE vitest 配置 SHALL 确保最多同时运行 2 个 worker 进程
3. THE vitest 配置 SHALL 设置 `fileParallelism` 为 `true`，在限制 fork 数量的同时保持文件级并行以维持测试效率

### 需求 10：requestStop 清理完整性

**用户故事：** 作为 Forge 开发者，我希望 `requestStop()` 的清理逻辑是同步等待完成的，而非 fire-and-forget，以确保所有清理操作在进程退出前完成。

#### 验收标准

1. WHEN `requestStop()` 被调用时，THE SdkDriver SHALL 将 `executeEffects()` 的返回 Promise 存储并在退出前等待其完成
2. WHEN Forge_CLI 的信号处理器触发 `requestStop()` 后，THE Forge_CLI SHALL 设置一个合理的最大等待时间（10 秒），超时后强制退出
3. IF `executeEffects()` 在最大等待时间内未完成，THEN THE Forge_CLI SHALL 记录警告日志并调用 `process.exit(1)` 强制退出
4. WHEN 强制退出发生时，THE Forge_CLI SHALL 确保进程组级别的清理（需求 3）作为最后的兜底机制被触发

### 需求 11：Process_Registry 序列化与持久化

**用户故事：** 作为 Forge 开发者，我希望能将 Process_Registry 的当前状态序列化为结构化数据，以便写入 PID 文件和调试日志。

#### 验收标准

1. THE Process_Registry SHALL 提供 `serialize()` 方法，返回包含所有已注册子进程元数据的 JSON 字符串
2. THE Process_Registry SHALL 提供 `deserialize(json: string)` 静态方法，从 JSON 字符串解析出子进程元数据列表
3. FOR ALL 有效的 Process_Registry 状态，序列化后再反序列化 SHALL 产生与原始状态等价的元数据列表（round-trip 属性）
4. WHEN `serialize()` 被调用时，THE Process_Registry SHALL 包含以下字段：sessionPid、sessionPgid、sessionStartTime、processes 数组（每项包含 pid、pgid、source、startTime、detached、description）
5. IF `deserialize()` 接收到无效的 JSON 字符串，THEN THE Process_Registry SHALL 抛出包含描述性错误信息的异常

### 需求 12：多层进程树清理

**用户故事：** 作为 Forge 开发者，我希望清理机制能处理 `npm exec` 等包装器产生的多层进程树，而非仅终止直接子进程。

#### 验收标准

1. WHEN Process_Registry 清理一个已注册子进程时，THE Process_Registry SHALL 先通过 `pgrep -P <pid>` 或等效方式查找该子进程的所有后代进程
2. WHEN 发现后代进程时，THE Process_Registry SHALL 按照从叶子到根的顺序（深度优先逆序）发送 SIGTERM 信号，确保子进程先于父进程被终止
3. IF 后代进程在 3 秒内未响应 SIGTERM，THEN THE Process_Registry SHALL 向其发送 SIGKILL 信号
4. THE Process_Registry SHALL 在清理日志中记录每个被终止的后代进程的 PID 和命令行信息
5. WHEN 使用进程组 kill（`kill(-pgid, signal)`）时，THE Process_Registry SHALL 优先使用此方式清理整个进程树，仅在进程组 kill 失败时回退到逐个 PID 清理
