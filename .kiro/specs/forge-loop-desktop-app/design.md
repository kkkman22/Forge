# Design Document: Forge Loop Desktop App

## Overview

将 forge-loop SDK 包装为 macOS 原生桌面应用（Tauri + React），提供可视化任务队列、合盖不休眠、完成通知与审核流。用户下载 DMG 双击安装，无需终端命令或 Node.js 环境。

**核心架构**：Tauri Rust 后端负责进程管理、文件监听、休眠抑制、Keychain 集成；Vue 3 前端负责任务列表 UI、审核面板、设置页面。两者通过 Tauri IPC（commands + events）通信。forge-loop SDK 作为内嵌资源，由 Rust 后端 spawn 为独立子进程。

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Forge Loop Desktop (.app)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────┐     Tauri IPC      ┌────────────────┐  │
│  │    Vue 3 Frontend    │ ◄═══════════════► │  Rust Backend   │  │
│  │                      │   commands/events  │                 │  │
│  │  • TaskListView      │                    │  • ProcessMgr   │  │
│  │  • TaskFormDialog    │                    │  • StatusWatch  │  │
│  │  • ReviewPanel       │                    │  • SleepGuard   │  │
│  │  • SettingsPage      │                    │  • KeychainMgr  │  │
│  │  • NotificationMgr   │                    │  • TaskStore    │  │
│  └─────────────────────┘                    └────────────────┘  │
│                                                      │           │
├──────────────────────────────────────────────────────┼───────────┤
│  Contents/Resources/                                  │           │
│  ├── node/bin/node          (Bundled Node v24.15.0)   │           │
│  ├── forge-loop/            (SDK dist + deps)         │           │
│  │   ├── dist/src/forge-loop-cli.js                  │ spawn     │
│  │   ├── node_modules/                               │           │
│  │   └── package.json                                │           │
│  ├── backlightctl           (Python3 背光控制脚本)     │           │
│  └── icons/                                          ▼           │
│                                              ┌──────────────┐    │
│                                              │ forge-loop   │    │
│                                              │ 子进程        │    │
│                                              │ (per task)   │    │
│                                              └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  用户项目仓库                                                      │
│  ├── .forge/status.md          ← StatusWatcher 监听              │
│  ├── .forge/runs/<id>/events.ndjson  ← StatusWatcher 监听        │
│  ├── .forge/progress/*.md      ← StatusWatcher 监听              │
│  └── .forge/findings/          ← ReviewPanel 读取                │
└─────────────────────────────────────────────────────────────────┘
```


## UI/UX Design Language — Apple-Inspired

> 设计参考：[Apple Design Analysis](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/apple/DESIGN.md)
> 核心理念：**内容优先，UI 退场**。任务状态和代码变更是"产品"，界面本身应像博物馆的白墙一样消失。

### 设计原则

1. **Photography-first → Task-first**：Apple 让产品照片说话，Forge Loop 让任务状态说话。进度条、阶段标签、diff 渲染是视觉焦点，UI chrome 退到最低存在感。
2. **单一强调色**：全局仅使用一个交互色（Action Blue `#0066cc`），所有可点击元素统一使用此色。不引入第二品牌色。
3. **明暗交替节奏**：任务列表使用 light/parchment 交替背景（`#ffffff` / `#f5f5f7`），审核面板 diff 区域使用 near-black（`#1d1d1f`）背景配白色代码文本。
4. **零装饰阴影**：不对卡片、按钮、文本加阴影。唯一的阴影保留给任务状态图标（运行中的脉冲动画光晕）。
5. **Pill 形按钮 = 行动信号**：主操作按钮（启动、通过、打回）使用 `border-radius: 9999px` 的 pill 形状；辅助按钮使用 `8px` 圆角。

### 色彩系统

| Token | Hex | 用途 |
|-------|-----|------|
| `--color-primary` | `#0066cc` | 所有交互元素：按钮、链接、进度条、focus ring |
| `--color-primary-on-dark` | `#2997ff` | 暗色背景上的链接和强调 |
| `--color-canvas` | `#ffffff` | 主背景 |
| `--color-canvas-parchment` | `#f5f5f7` | 交替行背景、设置页面、审核面板概览 |
| `--color-surface-dark` | `#1d1d1f` | diff 代码区域背景、菜单栏弹出 |
| `--color-ink` | `#1d1d1f` | 标题和正文（非纯黑，保持柔和） |
| `--color-ink-muted` | `#6e6e73` | 次要文本（仓库路径、时间戳） |
| `--color-success` | `#34c759` | 完成状态徽章（仅此一处绿色） |
| `--color-warning` | `#ff9500` | 待审核状态徽章 |
| `--color-error` | `#ff3b30` | 失败状态徽章、错误提示 |
| `--color-hairline` | `#e0e0e0` | 卡片边框（1px，极淡） |

### 字体系统

```css
/* 遵循 Apple 的 SF Pro 体系 */
--font-display: "SF Pro Display", system-ui, -apple-system, sans-serif;
--font-body: "SF Pro Text", system-ui, -apple-system, sans-serif;
```

| 层级 | 大小 | 字重 | 行高 | 字间距 | 用途 |
|------|------|------|------|--------|------|
| Hero | 34px | 600 | 1.10 | -0.374px | 主窗口标题"Forge Loop" |
| Display | 24px | 600 | 1.14 | -0.28px | 审核面板标题、空状态提示 |
| Title | 21px | 600 | 1.19 | 0.231px | 任务标题 |
| Body | 17px | 400 | 1.47 | -0.374px | 正文、描述、日志 |
| Caption | 14px | 400 | 1.43 | -0.224px | 次要信息、按钮文本、时间戳 |
| Fine Print | 12px | 400 | 1.0 | -0.12px | 版本号、法律文本 |

**关键规则**：
- 标题用 weight 600（不是 700）
- 正文 17px（不是 16px）——Apple 的"阅读而非扫描"节奏
- 负字间距用于 21px 以上的标题——"Apple tight"标志性紧凑感
- 不使用 weight 500——阶梯为 300/400/600

### 圆角系统

| Token | 值 | 用途 |
|-------|-----|------|
| `--rounded-sm` | 8px | 辅助按钮、输入框 |
| `--rounded-md` | 12px | 任务卡片 |
| `--rounded-lg` | 18px | 审核面板、设置卡片 |
| `--rounded-pill` | 9999px | 主操作按钮、状态徽章、搜索框 |

### 间距系统

基础单位 8px：

| Token | 值 | 用途 |
|-------|-----|------|
| `--space-xs` | 4px | 图标与文本间距 |
| `--space-sm` | 8px | 卡片内元素间距 |
| `--space-md` | 16px | 卡片内 padding |
| `--space-lg` | 24px | 区域间距 |
| `--space-xl` | 32px | 主要区块间距 |
| `--space-section` | 48px | 页面级区块分隔 |

### 组件规范

#### 任务卡片（TaskCard）

```
┌─────────────────────────────────────────────────────────────┐
│  ● 运行中    为用户 API 添加分页功能                    ⏸ ⋯  │
│  📁 ~/code/my-app  ·  🌿 forge/add-pagination              │
│  ████████████░░░░░░░░  迭代 7 · build · Task 4/5           │
└─────────────────────────────────────────────────────────────┘
```

- 背景：`--color-canvas`（奇数行）/ `--color-canvas-parchment`（偶数行）
- 边框：`1px solid --color-hairline`
- 圆角：`--rounded-md`（12px）
- 内边距：`--space-md`（16px）
- 状态徽章：pill 形，颜色对应状态
- 操作按钮：右对齐，hover 时显示
- 进度条：`--color-primary`，高度 4px，圆角 pill

#### 主操作按钮（Primary Button）

- 背景：`--color-primary`
- 文字：白色，17px/400
- 圆角：`--rounded-pill`
- 内边距：11px × 22px
- Active 状态：`transform: scale(0.97)`（Apple 标志性微缩交互）
- Focus 状态：`outline: 2px solid #0071e3`

#### 审核面板（ReviewPanel）

- 从右侧滑入，宽度 60% 主窗口
- 背景：`--color-canvas`
- 标签页切换：底部无边框，选中态用 `--color-primary` 下划线
- Diff 区域：`--color-surface-dark` 背景，等宽字体，行号左对齐
- 操作栏固定底部：毛玻璃效果（`backdrop-filter: saturate(180%) blur(20px)`）

#### 菜单栏图标

- 常驻 macOS 菜单栏
- 图标：简约线条风格的锤子/循环图标
- 右键菜单：休眠状态、显示/隐藏窗口、退出
- 有任务运行时图标微动画（缓慢旋转或脉冲）

### 动效规范

| 交互 | 动效 | 时长 | 缓动 |
|------|------|------|------|
| 按钮按下 | `scale(0.97)` | 100ms | ease-out |
| 面板滑入 | translateX(100%) → 0 | 300ms | cubic-bezier(0.25, 0.1, 0.25, 1) |
| 状态切换 | 背景色渐变 | 200ms | ease |
| 通知弹出 | 系统原生（不自定义） | — | — |
| 进度条更新 | width 过渡 | 400ms | ease-in-out |
| 任务卡片新增 | opacity 0→1 + translateY(8px→0) | 250ms | ease-out |

### Do's and Don'ts

**Do：**
- 用 `--color-primary` 作为唯一交互色，不引入第二强调色
- 标题用 weight 600 + 负字间距，营造"Apple tight"紧凑感
- 用明暗交替（canvas / parchment）代替分割线
- 用 `scale(0.97)` 作为按钮按下反馈
- 保持大量留白——任务卡片之间至少 8px 间距，区块之间 24px+
- Diff 渲染用暗色背景（开发者习惯的暗色代码阅读体验）

**Don't：**
- 不给卡片加阴影（用 1px hairline 边框代替）
- 不使用渐变背景（氛围感来自留白和排版，不是渐变）
- 不使用 weight 500（阶梯为 300/400/600）
- 不在浅色背景上使用 `--color-primary-on-dark`
- 不给全出血区域加圆角（窗口边缘是直角）
- 不使用超过一种阴影（唯一阴影保留给运行状态的光晕动画）

---

## Components and Interfaces

### Component 1：Rust Backend — ProcessManager

**职责**：管理 forge-loop 子进程的生命周期（spawn / monitor / kill）。

**接口**：

```rust
pub struct ProcessManager {
    registry: HashMap<TaskId, ProcessHandle>,
    node_path: PathBuf,       // <App>/Contents/Resources/node/bin/node
    cli_path: PathBuf,        // <App>/Contents/Resources/forge-loop/dist/src/forge-loop-cli.js
    runs_dir: PathBuf,        // ~/Library/Application Support/forge-loop-desktop/runs/
}

pub struct ProcessHandle {
    pid: u32,
    child: Child,
    started_at: DateTime<Utc>,
    log_path: PathBuf,
    task_id: TaskId,
}

impl ProcessManager {
    /// 启动 forge-loop 子进程，返回 run_id
    pub async fn spawn_task(&mut self, task: &Task, api_key: &str) -> Result<RunId>;

    /// 优雅停止：SIGTERM → 30s timeout → SIGKILL
    pub async fn stop_task(&mut self, task_id: &TaskId) -> Result<()>;

    /// 检查子进程是否仍存活
    pub fn is_alive(&self, task_id: &TaskId) -> bool;

    /// 应用启动时扫描孤儿进程
    pub async fn recover_orphans(&mut self, tasks: &[Task]) -> Vec<OrphanReport>;

    /// 应用退出时停止所有子进程
    pub async fn shutdown_all(&mut self) -> Result<()>;
}
```

**spawn 参数构建逻辑**：

```rust
fn build_cli_args(task: &Task) -> Vec<String> {
    let mut args = vec![self.cli_path.to_string()];

    // objective or spec
    match &task.target {
        TaskTarget::Objective(text) => args.push(text.clone()),
        TaskTarget::SpecFile(path) => {
            args.push(format!("--spec {}", path));
        }
    }

    // tier
    if let Some(tier) = &task.tier {
        args.extend(["--tier".into(), tier.clone()]);
    }

    // worktree / resume
    match &task.branch_strategy {
        BranchStrategy::NewWorktree { name } => args.push("--worktree".into()),
        BranchStrategy::ExistingBranch { name } => {
            args.extend(["--resume".into(), name.clone()]);
        }
        BranchStrategy::CurrentBranch => {}
    }

    // limits
    if let Some(n) = task.max_iterations {
        args.extend(["--max-iterations".into(), n.to_string()]);
    }
    if let Some(usd) = task.max_budget_usd {
        args.extend(["--max-budget-usd".into(), usd.to_string()]);
    }

    // 强制关闭 forge-loop 自带 caffeinate（由 App 层 pmset 接管）
    args.extend(["--prevent-sleep".into(), "off".into()]);

    // JSON 日志
    args.extend(["--log-format".into(), "json".into()]);
    args.extend(["--log-file".into(), self.log_path(task).to_string()]);

    args
}
```


### Component 2：Rust Backend — StatusWatcher

**职责**：监听任务对应仓库的 `.forge/` 状态文件变更，解析后推送到前端。

**接口**：

```rust
pub struct StatusWatcher {
    watchers: HashMap<TaskId, WatcherHandle>,
    event_sender: tauri::AppHandle,
}

#[derive(Serialize, Clone)]
pub struct TaskStatusUpdate {
    pub task_id: TaskId,
    pub phase: Option<String>,
    pub iteration: Option<u32>,
    pub latest_event: Option<String>,  // events.ndjson 最后一行摘要
    pub progress_summary: Option<String>,  // progress/*.md 摘要
}

impl StatusWatcher {
    /// 为指定任务启动文件监听
    pub fn watch(&mut self, task_id: TaskId, repo_path: &Path, run_id: &RunId) -> Result<()>;

    /// 停止指定任务的监听
    pub fn unwatch(&mut self, task_id: &TaskId);

    /// 解析 status.md 提取 phase + iteration
    fn parse_status_md(content: &str) -> (Option<String>, Option<u32>);

    /// 解析 events.ndjson 最后一行
    fn parse_latest_event(path: &Path) -> Option<String>;
}
```

**节流策略**：使用 `notify` crate 的 debounced watcher，200ms 窗口合并事件。

**推送方式**：`app_handle.emit_all("task-status-update", payload)`。

### Component 3：Rust Backend — SleepGuard

**职责**：管理 macOS 休眠抑制（pmset）与合盖背光控制（backlightctl）。

**接口**：

```rust
pub struct SleepGuard {
    is_inhibited: AtomicBool,
    lid_watcher: Option<JoinHandle<()>>,
    backlight_ctl_path: PathBuf,  // <App>/Contents/Resources/backlightctl
    saved_brightness: AtomicU32,
}

impl SleepGuard {
    /// 启用休眠抑制：sudo pmset -a disablesleep 1
    pub async fn enable(&self) -> Result<()>;

    /// 禁用休眠抑制：sudo pmset -a disablesleep 0
    pub async fn disable(&self) -> Result<()>;

    /// 启动 LidWatcher 线程（500ms 轮询 ioreg）
    pub fn start_lid_watcher(&mut self) -> Result<()>;

    /// 停止 LidWatcher
    pub fn stop_lid_watcher(&mut self);

    /// 首次授权：写入 /etc/sudoers.d/forge-loop
    pub async fn setup_sudoers() -> Result<()>;

    /// 检测残留 disablesleep 状态并恢复
    pub async fn recover_stale_inhibition(&self) -> Result<bool>;

    /// 卸载时清理 sudoers
    pub async fn cleanup_sudoers() -> Result<()>;
}
```

**LidWatcher 实现**：

```rust
fn lid_watcher_loop(backlight_ctl: &Path, saved_brightness: &AtomicU32) {
    loop {
        let output = Command::new("ioreg")
            .args(["-r", "-k", "AppleClamshellState"])
            .output();

        let is_closed = parse_clamshell_state(&output);

        if is_closed && !was_closed {
            // 保存当前亮度，关闭背光
            let current = get_brightness();
            saved_brightness.store(current, Ordering::Relaxed);
            set_brightness(backlight_ctl, 0);
        } else if !is_closed && was_closed {
            // 恢复亮度
            let saved = saved_brightness.load(Ordering::Relaxed);
            set_brightness(backlight_ctl, saved);
        }

        was_closed = is_closed;
        thread::sleep(Duration::from_millis(500));
    }
}
```


### Component 4：Rust Backend — TaskStore

**职责**：任务持久化（CRUD + 原子写入）。

**接口**：

```rust
pub struct TaskStore {
    path: PathBuf,  // ~/Library/Application Support/forge-loop-desktop/tasks.json
    tasks: Vec<Task>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: TaskId,
    pub title: String,
    pub repo_path: PathBuf,
    pub branch_strategy: BranchStrategy,
    pub target: TaskTarget,
    pub tier: Option<String>,  // auto | light | standard | full
    pub max_iterations: Option<u32>,
    pub max_budget_usd: Option<f64>,
    pub sleep_inhibit: bool,
    pub status: TaskStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub executions: Vec<ExecutionRecord>,
    pub metadata: Option<TaskMetadata>,
}

#[derive(Serialize, Deserialize, Clone)]
pub enum BranchStrategy {
    CurrentBranch,
    NewWorktree { name: String },
    ExistingBranch { name: String },
}

#[derive(Serialize, Deserialize, Clone)]
pub enum TaskTarget {
    Objective(String),
    SpecFile(String),  // 相对仓库根的路径
}

#[derive(Serialize, Deserialize, Clone)]
pub enum TaskStatus {
    Queued,
    Running { run_id: RunId, started_at: DateTime<Utc> },
    Paused,
    AwaitingReview { run_id: RunId, completed_at: DateTime<Utc> },
    Completed { run_id: RunId, completed_at: DateTime<Utc> },
    Failed { run_id: RunId, error: String, failed_at: DateTime<Utc> },
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ExecutionRecord {
    pub run_id: RunId,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub exit_code: Option<i32>,
    pub iterations: Option<u32>,
    pub outcome: ExecutionOutcome,
}

#[derive(Serialize, Deserialize, Clone)]
pub enum ExecutionOutcome {
    Success,
    Failed(String),
    Aborted,
    Pending,
}

impl TaskStore {
    pub fn load(path: &Path) -> Result<Self>;
    pub fn save(&self) -> Result<()>;  // 原子写：tmp + rename
    pub fn add(&mut self, task: Task) -> Result<()>;
    pub fn update(&mut self, task_id: &TaskId, f: impl FnOnce(&mut Task)) -> Result<()>;
    pub fn remove(&mut self, task_id: &TaskId) -> Result<()>;
    pub fn reorder(&mut self, task_id: &TaskId, new_index: usize) -> Result<()>;
    pub fn prune_completed(&mut self, max_keep: usize);  // 保留最近 100 个
}
```

**原子写入**：写入 `tasks.json.tmp` → `rename` 到 `tasks.json`，避免写入中途崩溃导致数据损坏。

**Schema 版本**：文件顶层 `"schema_version": 1`，未来迁移时按版本号执行 migration。


### Component 5：Rust Backend — KeychainManager

**职责**：macOS Keychain 读写 Anthropic API key。

**接口**：

```rust
pub struct KeychainManager {
    service: &'static str,  // "forge-loop-desktop"
}

impl KeychainManager {
    /// 存储 API key 到 Keychain
    pub fn store_api_key(&self, key: &str) -> Result<()>;

    /// 从 Keychain 读取 API key
    pub fn get_api_key(&self) -> Result<Option<String>>;

    /// 删除 Keychain 中的 API key
    pub fn delete_api_key(&self) -> Result<()>;

    /// 检测 Claude Code OAuth 凭据是否可用
    pub fn detect_claude_code_session(&self) -> Result<bool>;
}
```

**实现**：使用 `security-framework` crate 调用 macOS Security.framework。

### Component 6：Vue 3 Frontend — 页面结构

**路由**（Vue Router）：

```
/                   → TaskListView（主页面）
/settings           → SettingsPage（认证、日志级别、休眠抑制全局开关）
/task/:id/review    → ReviewPanel（审核面板，抽屉式覆盖在主页面上）
```

**组件树**：

```
App.vue
├── MenuBar (Tauri system tray)
│   ├── 状态指示（🔒/🔓 休眠抑制）
│   ├── 显示/隐藏窗口
│   └── 退出
├── TaskListView.vue
│   ├── FilterBar.vue（状态筛选）
│   ├── TaskCard.vue[] （每个任务一行）
│   │   ├── StatusBadge.vue
│   │   ├── TaskTitle + RepoName + BranchName
│   │   ├── ProgressBar.vue（running 时）
│   │   └── ActionButtons.vue（启动/暂停/查看/删除）
│   └── AddTaskButton.vue → TaskFormDialog.vue
├── TaskFormDialog.vue（模态弹窗）
│   ├── TitleInput
│   ├── RepoPathPicker（浏览 + 拖拽）
│   ├── BranchStrategySelector
│   ├── TargetInputSelector（spec_file / objective_text）
│   ├── TierSelector
│   ├── LimitsSection（max_iterations, max_budget_usd）
│   └── SleepInhibitToggle
├── ReviewPanel.vue（右侧抽屉）
│   ├── TabBar（概览 / 代码变更 / Review 报告）
│   ├── OverviewTab.vue
│   ├── DiffTab.vue（文件树 + diff 渲染）
│   ├── ReviewReportTab.vue（Markdown 渲染）
│   └── ActionBar.vue（通过 / 打回）
└── SettingsPage.vue
    ├── AuthSection（API key / Claude Code session）
    ├── LogLevelSelector
    └── SleepInhibitGlobalToggle
```

**状态管理**：Pinia store（`useTaskStore`、`useAuthStore`、`useSleepStore`），通过 Tauri `invoke` 与 Rust 后端同步。

**Tauri 事件监听**：在 `App.vue` 的 `onMounted` 中通过 `listen()` 注册全局事件监听器，分发到对应 store。

### Component 7：Tauri IPC Commands

**前端 → 后端（invoke commands）**：

```typescript
// 任务 CRUD
invoke('create_task', { task: TaskInput }): Promise<Task>
invoke('update_task', { taskId: string, patch: Partial<TaskInput> }): Promise<Task>
invoke('delete_task', { taskId: string }): Promise<void>
invoke('reorder_task', { taskId: string, newIndex: number }): Promise<void>

// 任务执行
invoke('start_task', { taskId: string }): Promise<RunId>
invoke('stop_task', { taskId: string }): Promise<void>
invoke('retry_task', { taskId: string }): Promise<RunId>

// 审核
invoke('approve_task', { taskId: string }): Promise<void>
invoke('reject_task', { taskId: string, feedback: string }): Promise<RunId>

// 认证
invoke('store_api_key', { key: string }): Promise<boolean>  // true=验证通过
invoke('get_auth_status'): Promise<AuthStatus>
invoke('clear_credentials'): Promise<void>

// 休眠
invoke('get_sleep_status'): Promise<SleepStatus>
invoke('toggle_sleep_inhibit', { enabled: boolean }): Promise<void>

// 系统
invoke('get_task_log', { taskId: string, runId: string, lines: number }): Promise<string[]>
invoke('get_diff', { taskId: string }): Promise<DiffResult>
invoke('export_diagnostics'): Promise<string>  // 返回 zip 路径
invoke('check_update'): Promise<UpdateInfo | null>
```

**后端 → 前端（events）**：

```typescript
// 在 App.vue onMounted 中注册
import { listen } from '@tauri-apps/api/event'

listen('task-status-update', (event: Event<TaskStatusUpdate>) => void)
listen('task-completed', (event: Event<{ taskId: string, outcome: string }>) => void)
listen('sleep-status-changed', (event: Event<SleepStatus>) => void)
listen('error', (event: Event<{ taskId?: string, message: string, severity: string }>) => void)
```


## Data Models

### tasks.json Schema

```json
{
  "schema_version": 1,
  "tasks": [
    {
      "id": "uuid-v4",
      "title": "为用户 API 添加分页功能",
      "repo_path": "/Users/king/code/my-app",
      "branch_strategy": { "type": "new_worktree", "name": "forge/add-pagination" },
      "target": { "type": "objective", "text": "为用户 API 添加分页功能，支持 cursor-based pagination" },
      "tier": "standard",
      "max_iterations": 50,
      "max_budget_usd": null,
      "sleep_inhibit": true,
      "status": { "type": "running", "run_id": "run-uuid", "started_at": "2026-05-18T10:00:00Z" },
      "created_at": "2026-05-18T09:55:00Z",
      "updated_at": "2026-05-18T10:00:00Z",
      "executions": [
        {
          "run_id": "run-uuid",
          "started_at": "2026-05-18T10:00:00Z",
          "ended_at": null,
          "exit_code": null,
          "iterations": null,
          "outcome": "pending"
        }
      ],
      "metadata": {
        "current_branch": "main",
        "recent_specs": [".kiro/specs/add-pagination/spec.md"]
      }
    }
  ],
  "recent_repos": [
    "/Users/king/code/my-app",
    "/Users/king/code/another-project"
  ]
}
```

### App 配置文件

路径：`~/Library/Application Support/forge-loop-desktop/config.json`

```json
{
  "log_level": "info",
  "sleep_inhibit_global": true,
  "auth_mode": "api_key",
  "max_completed_tasks": 100,
  "check_update_on_launch": true,
  "notification_enabled": true
}
```

## Correctness Properties

### Property 1: 进程生命周期一致性

*For any* Task 状态为 `Running`，ProcessRegistry 中必存在对应 PID 且进程存活；反之，ProcessRegistry 中存在的 PID 必对应一个 `Running` 状态的 Task。

**Validates: Requirements 4.4, 4.5**

### Property 2: 休眠抑制状态一致性

*For any* 时刻，`pmset disablesleep` 为 1 当且仅当至少一个 Task 状态为 `Running` 且其 `sleep_inhibit` 为 true。

**Validates: Requirements 7.1, 7.2, 7.10**

### Property 3: 原子持久化

*For any* `tasks.json` 写入操作，若进程在写入过程中崩溃，下次启动时 `tasks.json` 内容要么是写入前的完整状态，要么是写入后的完整状态，不会出现半写状态。

**Validates: Requirements 2.6**

### Property 4: 凭据不泄漏

*For any* 日志文件（App 日志 + 任务日志），不包含 API key / OAuth token 的任何子串（含前 8 位截断）。

**Validates: Requirements 8.8**

### Property 5: 审核流完整性

*For any* Task 从 `Running` 转为 `AwaitingReview`，必须经过用户显式操作（通过 / 打回）才能转为 `Completed` 或重新 `Running`；不存在自动跳过审核的路径。

**Validates: Requirements 6.4, 6.5**

## Error Handling

| 失败场景 | 处理方式 | 用户可见输出 |
|---|---|---|
| Bundled Node 不存在 / 损坏 | 启动时完整性检查失败，拒绝启动 | 弹窗"应用资源损坏，请重新安装" |
| forge-loop CLI spawn 失败 | 标记任务 `failed`，记录 stderr | 任务卡片显示红色错误 + 错误摘要 |
| API key 无效（401） | 子进程退出 code ≠ 0，解析 stderr | 弹窗"API key 无效或已过期，请在设置中更新" |
| API 限流（429） | forge-loop 内部处理退避；若最终失败则 exit ≠ 0 | 任务详情显示"API 限流，已重试 N 次后失败" |
| 仓库路径被删除 | StatusWatcher 检测到路径不存在 | 标记 `failed` + "目标路径已不存在" |
| Git worktree 创建失败 | spawn 前校验失败 | 弹窗"无法创建 worktree：<git error>" |
| sudoers 写入失败 | 降级：不启用合盖不休眠 | 弹窗"无法启用合盖不休眠，任务仍可正常执行" |
| App 崩溃后残留 disablesleep | 启动时 recover_stale_inhibition 恢复 | 静默恢复，App 日志记录 |
| 磁盘空间不足 | 子进程写日志失败 / git commit 失败 | 任务 `failed` + "磁盘空间不足" |
| tasks.json 损坏 | 尝试读取 `.bak` 备份；都失败则初始化空列表 | 弹窗"任务数据损坏，已恢复为空列表" |

## Testing Strategy

### Unit Tests（Rust）

| 模块 | 测试重点 |
|------|---------|
| `process_manager` | spawn 参数构建、exit code 映射、孤儿检测逻辑 |
| `status_watcher` | status.md 解析、events.ndjson 解析、节流逻辑 |
| `sleep_guard` | pmset 命令构建、clamshell state 解析、状态一致性 |
| `task_store` | CRUD 操作、原子写入（模拟崩溃）、schema migration |
| `keychain_manager` | store/get/delete 流程（mock Security.framework） |

### Integration Tests（Rust）

| 场景 | 验证 |
|------|------|
| 完整任务生命周期 | create → start → running → awaiting_review → approve → completed |
| 打回重试流 | create → start → awaiting_review → reject(feedback) → running → completed |
| 崩溃恢复 | 模拟 kill -9 → 重启 → 孤儿检测 → 状态恢复 |
| 休眠抑制生命周期 | 任务启动 → disablesleep=1 → 任务结束 → disablesleep=0 |

### E2E Tests（Playwright）

`cargo tauri dev` 启动应用后，Playwright 连接 `http://localhost:1420` 测试前端 UI 交互流程。

| 场景 | 验证 |
|------|------|
| 新建任务表单 | 填写所有字段 → 保存 → 列表出现新任务 |
| 任务状态流转 | 启动 → 进度更新 → 完成通知 → 审核面板 |
| 设置页面 | 输入 API key → 验证 → 保存 → 重启后仍可用 |

**为什么 Playwright 而非 WebDriver**：Tauri 的 `tauri-driver` 依赖 Safari WebDriver，macOS 兼容性差且配置复杂。Tauri dev 模式下前端就是 localhost，Playwright 直接测页面，开箱即用，测试编写更简洁。

### Property Tests（Rust，proptest）

- Property 1：任意 Task 序列的 CRUD 操作后，tasks.json 可正确反序列化回原始状态
- Property 2：任意 status.md 内容（含乱码），parse_status_md 不 panic
- Property 3：任意 CLI 参数组合，build_cli_args 产出的参数列表不含空字符串

## Risk and Mitigation

| 风险 | 影响 | 缓解 |
|---|---|---|
| Bundled Node 体积大（~80MB） | DMG 超 200MB 限制 | 使用 Node.js slim build（去 npm/corepack）；或考虑 Bun 替代 |
| Apple notarization 流程复杂 | 首版发布延迟 | 首版可 ad-hoc 签名 + README 说明右键打开；后续补 Developer ID |
| DisplayServices 私有框架 API 变更 | 背光控制失效 | backlightctl 作为独立脚本，可热更新；失效时降级为不控制背光 |
| forge-loop SDK 版本与 App 不同步 | 状态文件格式不兼容 | App 内嵌固定版本 SDK；更新 App = 更新 SDK |
| 长时间运行子进程内存泄漏 | 系统变慢 | forge-loop 自身有 max-iterations 限制；App 层监控子进程 RSS |
| macOS 权限收紧（未来版本限制 pmset） | 合盖不休眠失效 | 降级为 caffeinate -s（阻止系统休眠但不阻止合盖）；UI 提示 |
| Tauri WebView 兼容性（macOS 11 WKWebView） | UI 渲染异常 | 使用标准 CSS，避免最新 Web API；CI 在 macOS 11 runner 测试 |

## Out of Scope

- 跨平台支持（Windows / Linux）——首版仅 macOS
- 任务并发执行——首版串行，后续 spec 扩展
- 内置 spec 编辑器——用户在外部编辑器编写
- 仓库管理 / git clone——仅引用本地路径
- 自定义 SKILL 扩展——通过 forge-loop CLI 自身机制
- GUI 内的 diff 编辑（只读展示）
- 自动 ship（push / PR）——审核通过后用户手动操作
- Homebrew tap 分发——首版仅 GitHub Releases DMG
