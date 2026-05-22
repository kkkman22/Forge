# Requirements Document

## Introduction

Forge Loop 当前以两种形态存在：

1. **Plugin 模式**（marketplace 主推）：`/forge loop` 子命令走 SKILL 内置状态机，依赖 Claude Code session 生命周期，长任务下受 token 预算、Agent tool 调用深度等限制影响可靠性。
2. **CLI 模式**（开发者）：`forge-loop` 二进制基于 `@anthropic-ai/claude-agent-sdk`，可靠性更高，但需要用户 `git clone` + `npm install && npx tsc`，门槛极高。

普通用户拿不到最强的执行引擎。**目标**：把 forge-loop CLI 包装成一个 macOS 原生桌面应用（Tauri + React），用户下载 DMG 双击即可使用。应用界面是一个任务清单，每条任务可选择本地仓库、worktree 或功能分支，以及 spec 或自定义目标；点击启动后无人值守执行直至完成，完成后弹出通知，等待用户审核。

**核心价值主张**：

- **零环境依赖**：用户不需要 Node.js、Git CLI 配置、Anthropic SDK 安装；DMG 双击安装即可。
- **可视化任务队列**：todo list 形式管理多个任务，状态一目了然。
- **真正的无人值守**：合盖不休眠 + 锁屏不掉线 + 完成后系统通知。
- **质量门禁不降级**：底层仍调用 `forge-loop` SDK，TDD、三层 review、P0/P1 阻断、3-strike 熔断器全部保留。

**问题链路**：

1. Plugin 用户：`/forge loop` 在 Claude Code session 内运行，session 关闭即中断；长任务（>1 小时）容易因 context rot / token 耗尽失败。
2. CLI 用户：`forge-loop` 终端命令需保持终端窗口不关、机器不休眠；不能合盖；输出散落 stdout，难以追踪多个并发任务。
3. 缺口：没有一种"启动后完全不需要看着"的形态。

**设计决策**：

- **方案 A（采用）**：Tauri + Vue 3 桌面应用，Rust 后端 spawn `forge-loop` Node.js 子进程；macOS DMG 分发；菜单栏常驻。
- **方案 B（拒绝）**：Electron + React。理由：体积大（~150MB vs ~15MB）、性能开销高、与 Forge "轻量分发"理念冲突。
- **方案 C（拒绝）**：Swift 原生重写执行引擎。理由：与现有 TS/SDK 代码割裂，维护成本翻倍，且无法复用 forge-loop 已积累的状态机逻辑。
- **复用 forge-loop SDK**：桌面应用本质上是 forge-loop CLI 的 GUI 包装，**不重新实现执行引擎**；Rust 层只负责进程管理 + 状态文件监听 + UI 桥接。
- **休眠抑制方案**：借鉴 `nosleep-mac` 思路——`sudo pmset disablesleep 1` + `ioreg AppleClamshellState` 轮询 + `DisplayServices` 控制背光，确保合盖后 CPU 继续跑、屏幕关闭省电。
- **审核流前置**：所有任务完成后**默认停在审核点**（不自动 ship），用户在 App 内查看 diff + review report 后决定通过 / 打回；打回带反馈，重新进入执行流。

**UI 设计风格**：

- 参照 Apple 官网设计语言（[Apple Design Analysis](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/apple/DESIGN.md)）。
- 核心原则：内容优先、UI 退场；单一强调色（Action Blue #0066cc）；明暗交替节奏；零装饰阴影；Pill 形按钮 = 行动信号。
- 字体系统：SF Pro Display/Text，标题 weight 600 + 负字间距，正文 17px/400。
- 详见 design.md §UI/UX Design Language。

**明确不做的事情**：

- 不打包跨平台版本（首版只支持 macOS 11.0+）。
- 不内置 LLM 客户端；继续走 `@anthropic-ai/claude-agent-sdk` 的 API key / OAuth 路径。
- 不实现任务并发执行（首版串行；并发能力留作后续 spec）。
- 不实现 spec 编辑器（用户在外部编辑器写好 spec，App 仅引用路径）。
- 不实现仓库管理（仓库列表是本地路径快捷方式，不内置 git clone / 仓库扫描）。
- 不实现自定义 SKILL（用户在 forge-loop CLI 自身的扩展机制中定义）。

## Glossary

- **Forge Loop App**：本 spec 描述的 macOS 桌面应用，对应代码模块名 `forge-loop-desktop`。
- **Task（任务）**：用户在 App 中创建的一项工作，包含目标描述、目标仓库、分支选择、可选 spec、tier 等配置；映射到一次 `forge-loop` 子进程调用。
- **TaskExecution（执行实例）**：一次具体的 forge-loop 子进程运行；同一 Task 可因失败重跑产生多个 Execution。
- **审核点**：Task 执行完成（或被熔断）后的暂停点，UI 弹出 diff + review 报告，用户选择"通过"或"打回"。
- **打回（Reject）**：用户审核拒绝，附带文字反馈；App 把反馈拼接到原 objective，重新创建一个 Execution。
- **休眠抑制**：操作系统级阻止合盖 / 空闲休眠的机制，依赖 `sudo pmset disablesleep 1`；不依赖 `caffeinate`（caffeinate 不能阻止合盖）。
- **背光控制**：合盖时通过 `DisplayServices` 私有框架关闭屏幕背光，CPU 继续跑；开盖瞬间恢复亮度。
- **资源根（forge-loop binary 路径）**：App 内置的 forge-loop SDK 入口路径，安装后位于 `<App>.app/Contents/Resources/forge-loop/`。
- **Bundled Node**：App 内嵌的 Node.js 运行时（v24.15.0），避免依赖系统 Node；位于 `<App>.app/Contents/Resources/node/bin/node`。
- **Sudoers 免密项**：首次运行时写入 `/etc/sudoers.d/forge-loop`，仅授权 `/usr/bin/pmset`，无密码弹窗即可启停休眠抑制。
- **Status Watcher**：Rust 后端的文件监听器，watch 任务对应仓库下的 `.forge/status.md` 与 `.forge/runs/<run-id>/events.ndjson`，将变更推送给 React UI。

## Requirements

### Requirement 1: 桌面应用形态与分发

**User Story:** 作为 macOS 用户，我希望从 GitHub Releases 下载 DMG 文件、双击拖入 Applications 即可使用 Forge Loop，不需要终端命令、不需要安装 Node.js。

#### Acceptance Criteria

1. THE 应用 SHALL 以 macOS `.app` bundle 形式打包，外部分发为 `.dmg` 安装包。
2. THE `.app` SHALL 内嵌 Node.js 运行时（Bundled Node v24.15.0），位于 `Contents/Resources/node/bin/node`，不依赖系统 Node。
3. THE `.app` SHALL 内嵌 forge-loop SDK 完整产物（`dist/`、`node_modules/`、`package.json`），位于 `Contents/Resources/forge-loop/`。
4. THE `.app` SHALL 编译为 Universal Binary（Apple Silicon arm64 + Intel x86_64），最低支持 macOS 11.0 (Big Sur)。
5. THE `.dmg` SHALL 经 Apple Developer ID 签名 + Apple notarization，避免 Gatekeeper 阻断；首次启动通过右键 → 打开方式弹出系统标准信任流程。
6. WHEN 用户从 Applications 启动 App，THE 应用 SHALL 在 5 秒内显示主窗口或菜单栏图标，无需任何额外配置。
7. THE `.dmg` 体积 SHALL ≤ 200 MB（Tauri + Bundled Node + forge-loop SDK 总和）。
8. THE 应用 SHALL 支持 GitHub Releases 自动检查更新（仅检测，不自动下载安装）；菜单栏菜单提供"检查更新"入口。
9. THE 应用 SHALL 提供"卸载"入口，清理 `~/Library/Application Support/forge-loop-desktop/`、`/etc/sudoers.d/forge-loop`、launchd 守护项（如有）。

### Requirement 2: 任务队列管理

**User Story:** 作为开发者，我希望在 App 主界面看到一个任务清单，可以新建、编辑、删除、重排任务，应用关闭重启后任务保留。

#### Acceptance Criteria

1. THE 主界面 SHALL 以列表形式展示所有任务，每行展示：状态徽章、任务标题、目标仓库名、分支名、迭代进度（运行中）/ 完成时间（已完成）。
2. THE 任务状态 SHALL 至少包含五种：`queued`（排队中）、`running`（执行中）、`paused`（已暂停）、`awaiting_review`（待审核）、`completed`（已通过审核）、`failed`（熔断或错误）。
3. THE 用户 SHALL 可通过"+ 新任务"按钮创建任务，弹出表单收集 §3 列出的配置项。
4. THE 用户 SHALL 可对未启动的任务编辑、删除、上下移调整执行顺序；运行中任务仅可"暂停 / 中止"，不可编辑配置。
5. WHEN 任务为 `awaiting_review` 状态，THE 用户 SHALL 可在该任务上点击"查看"打开审核面板（详见 §6）。
6. THE 任务持久化 SHALL 写入 `~/Library/Application Support/forge-loop-desktop/tasks.json`，原子写（写临时文件 + rename）；应用启动时读取并恢复。
7. THE `tasks.json` schema SHALL 在文件顶部含 `"schema_version": 1`，未来版本迁移依赖此字段。
8. WHEN 用户删除一个 `running` 任务，THE 应用 SHALL 先终止子进程（含子进程组），等待 SIGTERM 30 秒后再 SIGKILL，最后才从列表移除。
9. THE 列表 SHALL 支持按状态筛选（全部 / 运行中 / 待审核 / 已完成 / 失败）。
10. THE 任务记录 SHALL 保留最近 100 个已完成任务；超出按完成时间最早的删除（仅删元数据，不删 git 提交）。

### Requirement 3: 任务配置项

**User Story:** 作为用户，我希望创建任务时能精确指定目标仓库、目标分支或新建 worktree、可选 spec 文件路径或自定义目标，以及 forge 路由档位。

#### Acceptance Criteria

1. THE 新建任务表单 SHALL 包含以下字段：
   - **任务标题**（必填，文本，≤ 80 字符）
   - **目标仓库**（必填，本地路径，可点击"浏览"打开 macOS 标准目录选择器）
   - **执行分支策略**（必填，单选）：`current_branch` / `new_worktree` / `existing_branch`
   - **分支 / Worktree 名**（条件必填）：当策略为 `new_worktree` 或 `existing_branch` 时必填
   - **目标输入方式**（必填，单选）：`spec_file` / `objective_text`
   - **Spec 文件路径**（条件必填）：当目标输入方式为 `spec_file` 时必填，相对仓库根的路径如 `.kiro/specs/my-feature/spec.md`
   - **目标描述**（条件必填）：当目标输入方式为 `objective_text` 时必填，多行文本
   - **路由档位**（可选，单选，默认 `auto`）：`auto` / `light` / `standard` / `full`
   - **最大迭代数**（可选，整数，默认 50）
   - **预算上限**（可选，USD 浮点，默认无）
   - **休眠抑制**（开关，默认开启）
2. WHEN 用户选择 `current_branch`，THE 应用 SHALL 在保存时校验目标仓库当前 git working tree 是否干净；不干净则阻断保存并提示。
3. WHEN 用户选择 `new_worktree`，THE 应用 SHALL 在启动时调用 `git worktree add` 创建独立工作树，路径默认 `<repo-parent>/<repo-name>-<branch>/`。
4. WHEN 用户选择 `existing_branch`，THE 应用 SHALL 校验该分支在远端或本地存在；不存在则阻断保存。
5. WHEN 用户选择 `spec_file`，THE 应用 SHALL 校验该文件在仓库内存在且非空；不存在则阻断保存。
6. THE 表单 SHALL 实时显示校验错误（红色边框 + 错误文案），所有必填项校验通过后"保存"按钮才可点击。
7. THE 仓库路径 SHALL 支持拖拽：用户可从 Finder 拖一个文件夹到仓库路径输入框完成填充。
8. THE 表单 SHALL 在保存后立即触发 git 元数据探测（当前分支、worktree 列表、最近 spec 路径），缓存到任务记录的 `metadata` 字段，便于列表展示。
9. WHERE 用户多次新建任务针对同一仓库，THE 应用 SHALL 记住"最近 5 个使用过的仓库路径"作为下拉建议，加速输入。

### Requirement 4: forge-loop 子进程管理

**User Story:** 作为应用开发者，我希望 Rust 后端能可靠地启动 / 停止 / 监控 forge-loop 子进程，进程异常退出时能正确反映到 UI。

#### Acceptance Criteria

1. WHEN 用户点击"启动"，THE Rust 后端 SHALL spawn forge-loop 子进程：
   - 命令：`<App>/Contents/Resources/node/bin/node <App>/Contents/Resources/forge-loop/dist/src/forge-loop-cli.js <objective_or_spec> [args]`
   - 工作目录：任务的目标仓库 / worktree 路径
   - 环境变量：透传 `ANTHROPIC_API_KEY`（从 macOS Keychain 读取，详见 §8）
2. THE Rust 后端 SHALL 把 forge-loop CLI 参数按以下规则映射：
   - `--tier <tier>`（来自任务的"路由档位"字段）
   - `--worktree`（当分支策略为 `new_worktree`）
   - `--resume <branch>`（当分支策略为 `existing_branch`）
   - `--max-iterations <n>`、`--max-budget-usd <n>`（来自任务字段）
   - `--prevent-sleep off`（始终关闭 forge-loop 自带的 caffeinate；由 App 层用 pmset 接管，详见 §7）
   - `--log-format json --log-file <run_log_path>`（强制 JSON 日志）
3. THE 子进程 SHALL 以独立进程组（`setsid` / `process_group(0)`）启动，便于父进程退出时整组回收。
4. THE Rust 后端 SHALL 维护一个 `ProcessRegistry`：`Map<TaskId, ChildProcessHandle>`，包含 PID、启动时间、stdout/stderr 句柄。
5. WHEN 子进程退出，THE Rust 后端 SHALL 读取 exit code 与最后一段 stderr，更新任务状态：
   - exit 0 → 由 status.md 决定状态（completed / awaiting_review / failed）
   - exit ≠ 0 → 标记为 `failed`，附带最后 1 KB stderr
6. WHEN 用户点击"暂停"，THE Rust 后端 SHALL 向进程组发送 SIGTERM；30 秒超时后发送 SIGKILL。
7. WHEN 应用整体退出（用户 Cmd+Q），THE Rust 后端 SHALL 优雅停止所有运行中子进程（按 §4.6 流程），并持久化所有任务状态到 `tasks.json` 后再退出。
8. THE Rust 后端 SHALL 在 App 启动时扫描 `~/Library/Application Support/forge-loop-desktop/runs/`，检测上次未正常退出的 PID 文件（孤儿进程），若进程仍存活则恢复 ProcessRegistry，否则标记任务为 `failed` 并记录"上次异常退出"。
9. THE 子进程 stdout / stderr SHALL 每行限速 ≤ 1 KB / 行（截断长行），防止日志爆炸；落盘到 `~/Library/Application Support/forge-loop-desktop/runs/<task-id>/<run-id>.log`。

### Requirement 5: 实时状态展示

**User Story:** 作为用户，我希望任务运行时能在 App 内看到实时进度，包括当前阶段（plan/build/review/...）、当前迭代号、最近一条 agent 输出。

#### Acceptance Criteria

1. THE Rust 后端 SHALL 为每个 `running` 任务启动一个 Status Watcher，使用 `notify` crate 监听以下文件：
   - `<repo>/.forge/status.md`
   - `<repo>/.forge/runs/<run-id>/events.ndjson`
   - `<repo>/.forge/progress/*.md`
2. WHEN 上述文件发生变更，THE Watcher SHALL 解析变更内容，通过 Tauri event 推送 `task-status-update` 事件到前端，payload 包含：
   - `task_id`
   - `phase`（来自 status.md `phase:` 字段）
   - `iteration`（来自 status.md `loop_iteration:` 字段）
   - `latest_event`（来自 events.ndjson 最后一行解析的 phase/iteration/exit_code 等信息）
3. THE 前端 SHALL 在任务行显示进度条 + 当前阶段标签 + 最近事件摘要（最近 1 条 events.ndjson 内容，截断 80 字符）。
4. THE 前端 SHALL 提供"详情"侧边面板，展开后显示：
   - 完整 events.ndjson 时间线（最近 50 条，可滚动加载更多）
   - 当前 status.md 完整内容
   - 子进程 stdout/stderr 滚动日志（最近 200 行）
5. WHEN 任务从 `running` 转为 `awaiting_review` 或 `completed` 或 `failed`，THE 前端 SHALL 立即停止该任务的轮询展示，切换为终态视图。
6. THE Status Watcher SHALL 节流推送：同一文件 200 ms 内多次变更只推送最后一次，避免 UI 抖动。
7. THE Watcher 解析失败（status.md 格式损坏 / events.ndjson 行非 JSON）SHALL 记录一条警告到 App 日志，但不阻断任务执行。
8. WHEN 任务对应的仓库 / worktree 被外部删除，THE Watcher SHALL 检测并标记任务为 `failed`，附带"目标路径已不存在"的诊断。

### Requirement 6: 完成通知与审核流

**User Story:** 作为用户，任务完成后我希望立即收到 macOS 系统通知，并能在 App 内审核 diff + review 报告，决定通过或打回。

#### Acceptance Criteria

1. WHEN 任务从 `running` 转为 `awaiting_review`，THE 应用 SHALL 发送 macOS 原生通知：
   - 标题："Forge Loop 任务完成"
   - 副标题：任务标题
   - 正文：仓库名 + 分支名 + 迭代数
   - 操作：点击通知聚焦 App 主窗口并自动打开该任务的审核面板
2. THE 通知 SHALL 通过 `tauri-plugin-notification` 调用 macOS UserNotifications 框架；首次发送前请求通知权限。
3. THE 审核面板 SHALL 在主窗口右侧抽屉打开，包含三个标签页：
   - **概览**：任务标题、迭代数、运行时长、token 消耗、成本估算
   - **代码变更**：调用 `git diff <base>..<head>` 渲染（base = 任务起始 commit；head = 当前 HEAD）；只展示文件树 + 选中文件 diff（不渲染 binary 文件）
   - **Review 报告**：解析 `.forge/findings/<topic>/review.md` 渲染 Markdown
4. THE 审核面板底部 SHALL 提供两个按钮：
   - **通过**：标记任务为 `completed`，关闭审核面板，任务保留在历史列表
   - **打回**：弹出反馈输入框（多行文本，必填），提交后将反馈作为新 objective 拼接（`原 objective\n---\n用户反馈：<feedback>`），创建新的 TaskExecution 重新启动
5. WHEN 用户选择"通过"，THE 应用 SHALL **不自动 ship**（不执行 `git push` / `gh pr create`）；用户需手动在终端 / GitHub 完成发布。
6. WHEN 用户选择"打回"，THE 新 Execution SHALL 复用原任务 ID，并在执行历史中追加一条记录（保留旧 Execution 完整日志）。
7. THE 审核面板 SHALL 支持快捷键：⌘⏎（通过）、⌘⌫（打回）、⎋（关闭面板不操作）。
8. THE 失败任务（`failed` 状态）SHALL 同样可打开审核面板，但仅展示"概览"+"日志"两个标签页（无 diff / review，因可能未生成）；底部按钮替换为"重试"（保留原配置 + 启动）和"删除"。

### Requirement 7: 休眠抑制

**User Story:** 作为用户，我希望长任务运行时我合上 MacBook 盖子也不影响执行，不需要外接显示器，屏幕能自动关闭省电。

#### Acceptance Criteria

1. WHEN 至少一个任务处于 `running` 状态 AND 任务的"休眠抑制"开关开启，THE 应用 SHALL 调用 `sudo pmset -a disablesleep 1`。
2. WHEN 所有 `running` 任务都结束（无论成功失败）OR 用户手动关闭"休眠抑制"，THE 应用 SHALL 调用 `sudo pmset -a disablesleep 0` 恢复默认行为。
3. THE 应用 SHALL 在首次启动时引导用户授权 sudoers 免密：
   - 弹出标准 macOS 授权窗口请求管理员密码
   - 写入 `/etc/sudoers.d/forge-loop` 内容：`%admin ALL=(ALL) NOPASSWD: /usr/bin/pmset`
   - 文件权限设置为 0440，所有者 root
4. WHEN sudoers 写入失败（用户拒绝 / 非管理员账号），THE 应用 SHALL 弹窗提示"无法启用合盖不休眠"，并允许用户手动启动任务（仅效果降级，不阻断使用）。
5. THE 应用 SHALL 启动一个 `LidWatcher` 后台线程，每 500 ms 调用 `ioreg -r -k AppleClamshellState` 检测合盖状态：
   - 检测到合盖 → 调用 `<App>/Contents/Resources/backlightctl` 关闭主显示器背光（亮度 → 0）
   - 检测到开盖 → 恢复用户合盖前的亮度
6. THE `backlightctl` SHALL 通过 Python3（系统自带 `/usr/bin/python3`）+ ctypes 调用 `DisplayServices` 私有框架的 `DisplayServicesSetBrightness`；脚本内嵌为 App 资源。
7. WHEN 用户卸载 App，THE 卸载流程 SHALL 删除 `/etc/sudoers.d/forge-loop`，恢复默认电源策略。
8. THE 应用 SHALL 在菜单栏图标右键菜单显示当前休眠抑制状态：🔒（已抑制）/ 🔓（未抑制）。
9. THE 休眠抑制 SHALL 与 forge-loop CLI 自带的 `caffeinate` 互斥：App 启动子进程时强制传 `--prevent-sleep off`（详见 §4.2），避免双重接管。
10. WHEN 应用崩溃 OR 强制退出（kill -9）OR 系统断电重启，THE App 启动时 SHALL 检测残留的 disablesleep 状态：若 App 没有 `running` 任务但 `pmset -g | grep disablesleep` 显示已禁用，恢复为默认。

### Requirement 8: 认证与凭据管理

**User Story:** 作为用户，我希望首次启动时配置一次 Anthropic API key（或复用已有 Claude Code OAuth 会话），之后所有任务自动使用该凭据。

#### Acceptance Criteria

1. THE 应用 SHALL 在首次启动 OR 检测到无凭据时打开"设置 → 认证"页面，提供两种方式：
   - **API Key**：用户粘贴 `ANTHROPIC_API_KEY`，App 验证有效性后存入 macOS Keychain（service: `forge-loop-desktop`，account: `anthropic-api-key`）
   - **复用 Claude Code 会话**：检测 `~/.claude/.credentials.json` 是否存在，若存在则尝试复用其 OAuth token
2. THE API key 验证 SHALL 调用一次 `messages.list`（轻量请求）确认 key 可用；失败则提示错误，不存入 Keychain。
3. THE 应用 SHALL 在 spawn forge-loop 子进程时，从 Keychain 读取凭据并通过环境变量 `ANTHROPIC_API_KEY` 注入；不写入 disk、不打印到日志。
4. WHEN 用户更新 API key，THE 应用 SHALL 覆盖 Keychain 现有项；同时不影响正在运行的子进程（已注入的 env 不会变化）。
5. THE 设置页面 SHALL 提供"清除凭据"按钮，删除 Keychain 项；点击后所有任务无法启动直至重新配置。
6. THE Keychain 访问 SHALL 通过 `tauri-plugin-keychain` 或等价 Rust crate（`security-framework`）实现；不使用明文文件。
7. WHERE 用户启用了"复用 Claude Code 会话"，THE 应用 SHALL 在 spawn forge-loop 子进程时设置环境变量 `CLAUDE_CONFIG_DIR=~/.claude`，由 SDK 自行读取 OAuth token（不显式注入 token 字符串）。
8. THE 应用日志 SHALL 不记录任何 API key / OAuth token 的明文片段（含截断），违反此规则的代码视为 P0 安全缺陷。

### Requirement 9: 错误处理与日志

**User Story:** 作为用户，任务失败时我希望能查看清晰的错误信息和日志定位问题。

#### Acceptance Criteria

1. THE 应用 SHALL 维护两类日志：
   - **App 日志**：Rust 后端 + Tauri IPC 错误，写入 `~/Library/Logs/forge-loop-desktop/app.log`，按天轮转（保留 7 天）
   - **任务日志**：每个 TaskExecution 独立日志，写入 `~/Library/Application Support/forge-loop-desktop/runs/<task-id>/<run-id>.log`，永久保留（用户可在审核面板手动删除）
2. THE App 日志 SHALL 使用 JSON 格式（`tracing-subscriber` + `tracing-appender`），最低级别 `info`（用户可在设置中调到 `debug`）。
3. WHEN 任务执行过程中发生以下错误，THE 应用 SHALL 在 UI 显示明确错误信息（弹窗或任务详情面板）：
   - forge-loop 子进程启动失败（路径错误 / 权限不足）
   - Anthropic API 调用失败（401 / 429 / 500）
   - Git 操作失败（merge conflict / push rejected）
   - 磁盘空间不足
   - 仓库路径已不存在
4. THE 错误信息 SHALL 包含：错误类型、人类可读描述、建议操作（"检查 API key 是否过期"等）、查看完整日志的链接（点击打开任务日志文件）。
5. THE 应用 SHALL 提供"导出诊断包"功能：打包最近 7 天 App 日志 + 当前任务日志 + `tasks.json`（脱敏 API key）为 zip，便于用户提交 issue。
6. THE 应用 SHALL 在 SessionStart（即应用启动）时检测 forge-loop 资源完整性（dist/、node_modules/ 关键文件存在），缺失时拒绝启动并提示重新安装。
7. WHEN App 自身崩溃（Rust panic），THE Tauri 框架 SHALL 落盘 panic 信息到 App 日志；下次启动时检测到 panic marker 提示用户。

### Requirement 10: UI/UX 设计风格

**User Story:** 作为 macOS 用户，我希望 Forge Loop App 的视觉风格与 macOS 原生应用一致，遵循 Apple 设计语言——简洁、内容优先、零装饰噪音。

#### Acceptance Criteria

1. THE 应用 SHALL 遵循 Apple 设计语言（参考 [Apple Design Analysis](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/apple/DESIGN.md)），核心原则：内容优先、UI chrome 退场、单一强调色。
2. THE 全局交互色 SHALL 为 Action Blue `#0066cc`，所有可点击元素（按钮、链接、进度条、focus ring）统一使用此色；不引入第二品牌色。
3. THE 字体 SHALL 使用 `SF Pro Display`（标题 ≥ 21px）和 `SF Pro Text`（正文 < 21px），回退到 `system-ui, -apple-system, sans-serif`。
4. THE 标题 SHALL 使用 weight 600（非 700）+ 负字间距（-0.28 ~ -0.374px），营造 Apple 标志性的"tight"紧凑感。
5. THE 正文 SHALL 为 17px / weight 400 / line-height 1.47（非 16px），遵循 Apple 的"阅读而非扫描"节奏。
6. THE 主操作按钮（启动、通过、打回）SHALL 使用 pill 形状（`border-radius: 9999px`），背景 `#0066cc`，白色文字；按下态为 `transform: scale(0.97)`。
7. THE 任务列表 SHALL 使用明暗交替背景（`#ffffff` / `#f5f5f7`）代替分割线，遵循 Apple 的"颜色变化即分隔"原则。
8. THE 应用 SHALL 不对卡片、按钮、文本添加阴影；唯一的视觉深度来自 1px hairline 边框（`rgba(0,0,0,0.08)`）和明暗交替。
9. THE 审核面板 diff 区域 SHALL 使用暗色背景（`#1d1d1f`）配白色等宽字体，符合开发者代码阅读习惯。
10. THE 间距系统 SHALL 基于 8px 基础单位，卡片内边距 16px，区块间距 24px+，保持 Apple 式的大量留白。
11. THE 菜单栏图标 SHALL 为简约线条风格，有任务运行时显示微动画（缓慢脉冲），无任务时静态。
12. THE 审核面板操作栏 SHALL 使用毛玻璃效果（`backdrop-filter: saturate(180%) blur(20px)`），与 macOS 原生 UI 一致。
13. THE 动效 SHALL 保持克制：面板滑入 300ms、状态切换 200ms、按钮缩放 100ms；不使用弹跳或过度动画。
14. THE 圆角系统 SHALL 分四级：8px（辅助按钮）、12px（任务卡片）、18px（面板/设置卡片）、pill（主按钮/徽章）；不使用中间值。

### Requirement 11: 知识库沉淀

**User Story:** 作为 Forge 维护者，我希望桌面应用引入的工程经验（Tauri 集成、Bundled Node 打包、休眠抑制、Keychain 集成）能进入知识库。

#### Acceptance Criteria

1. WHEN 本 spec ship 完成，THE `.forge/knowledge/known-failures.md` SHALL 追加以下模式条目（每条置信度 ≥ 0.7）：
   - "Tauri Rust 后端 spawn 子进程时未独立进程组导致父退出僵尸进程"
   - "macOS DMG 未 notarize 导致 Gatekeeper 阻断双击启动"
   - "pmset disablesleep 未在 App 崩溃后恢复导致系统持续不休眠"
   - "Bundled Node 路径含空格导致 spawn 失败"
2. THE `.forge/knowledge/decisions.md` SHALL 记录关键技术决策：
   - 选择 Tauri + React 而非 Electron 的原因
   - 复用 forge-loop SDK 而非用 Rust 重写执行引擎的原因
   - 借鉴 nosleep-mac `pmset disablesleep` 而非 `caffeinate` 的原因
3. THE 知识条目 SHALL 通过 `/forge learn` 在所有任务完成后写入，不在 build 中段手工编辑。
