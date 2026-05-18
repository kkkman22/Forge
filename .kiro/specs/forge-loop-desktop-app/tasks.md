# Implementation Plan: Forge Loop Desktop App

## Overview

将 forge-loop SDK 包装为 macOS Tauri + React 桌面应用。分三大阶段：基础骨架（Tauri 项目 + 进程管理 + 任务持久化）、核心功能（状态监听 + 审核流 + 休眠抑制）、分发打包（签名 + DMG + 自动更新检测）。

**路由档位**：Full（新项目 / 新技术栈 / 多组件协同）。

**技术栈**：
- 前端：Vue 3 + TypeScript + Tailwind CSS 4 + Vite 6
- 后端：Rust (Tauri 2.x) + tokio + notify + serde
- 打包：tauri-bundler → DMG (Universal Binary)
- 测试：Rust (cargo test + proptest) + Vitest (前端组件) + Playwright (E2E UI 交互)

## Tasks

- [ ] 1. Tauri 项目脚手架初始化
  - 1.1 在 `apps/forge-loop-desktop/` 创建 Tauri 2.x 项目（`cargo create-tauri-app`）
  - 1.2 配置 `tauri.conf.json`：identifier `com.forge.loop-desktop`、窗口标题、最小尺寸 800x600、macOS 最低版本 11.0
  - 1.3 前端初始化：Vite 6 + Vue 3 + TypeScript + Tailwind CSS 4
  - 1.4 配置 Rust workspace：`Cargo.toml` 添加 `apps/forge-loop-desktop/src-tauri` 为 member
  - 1.5 验证 `cargo tauri dev` 能启动空白窗口
  - 1.6 配置 CI：GitHub Actions workflow 在 macOS runner 上 `cargo tauri build`
  - _Requirements: 1.1, 1.4, 1.6_
  - _Commit_: `feat(desktop): scaffold Tauri + Vue 3 project`

- [ ] 2. TaskStore 持久化层实现
  - 2.1 定义 Rust 数据模型：`Task`、`BranchStrategy`、`TaskTarget`、`TaskStatus`、`ExecutionRecord`（按 design.md Component 4）
  - 2.2 实现 `TaskStore::load` / `TaskStore::save`（原子写：tmp + rename）
  - 2.3 实现 CRUD 方法：`add`、`update`、`remove`、`reorder`、`prune_completed`
  - 2.4 编写 unit tests：CRUD 操作正确性、原子写入模拟崩溃、schema_version 校验
  - 2.5 编写 proptest：任意 Task 序列 CRUD 后可正确反序列化
  - 2.6 验证 `cargo test -p forge-loop-desktop` 通过
  - _Requirements: 2.6, 2.7, 2.10_
  - _Commit_: `feat(desktop): implement TaskStore with atomic persistence`

- [ ] 3. Tauri IPC — 任务 CRUD Commands
  - 3.1 注册 Tauri commands：`create_task`、`update_task`、`delete_task`、`reorder_task`
  - 3.2 实现前端 TypeScript 类型定义（`Task`、`TaskInput`、`TaskStatus` 等），放置于 `src/types/`
  - 3.3 前端调用 `invoke` 封装为 `useTaskStore` composable（Pinia store 或 Vue composable + ref/reactive）
  - 3.4 编写集成测试：前端 invoke → Rust handler → tasks.json 写入 → 重启读取一致
  - 3.5 验证 `cargo test` + `npm run test` 通过
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.9_
  - _Commit_: `feat(desktop): wire task CRUD via Tauri IPC`

- [ ] 4. Vue 3 前端 — 任务列表 UI
  - 4.1 实现 `TaskListView.vue` 组件：列表渲染、状态徽章、筛选栏
  - 4.2 实现 `TaskCard.vue` 组件：标题、仓库名、分支名、进度条（running 时）、操作按钮
  - 4.3 实现 `FilterBar.vue` 组件：全部 / 运行中 / 待审核 / 已完成 / 失败
  - 4.4 实现 `AddTaskButton.vue` + `TaskFormDialog.vue` 模态弹窗（所有字段按 Requirement 3）
  - 4.5 实现仓库路径选择器：macOS 目录选择器（`tauri-plugin-dialog`）+ 拖拽支持
  - 4.6 实现表单实时校验（红色边框 + 错误文案）
  - 4.7 实现"最近 5 个仓库"下拉建议
  - 4.8 编写 Vitest 组件测试：表单校验逻辑、状态筛选逻辑（`@vue/test-utils`）
  - 4.9 验证 `npm run test` 通过 + 手动验证 UI 交互
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.9, 3.1-3.9_
  - _Commit_: `feat(desktop): implement task list UI with form dialog`

- [ ] 5. ProcessManager — 子进程管理
  - 5.1 实现 `ProcessManager` struct：registry、spawn、stop、is_alive、shutdown_all
  - 5.2 实现 `build_cli_args`：按 design.md 映射 Task 字段到 forge-loop CLI 参数
  - 5.3 实现进程组隔离：`Command::new().process_group(0)` + SIGTERM/SIGKILL 流程
  - 5.4 实现 stdout/stderr 日志落盘：每行限速 ≤ 1KB，写入 runs/<task-id>/<run-id>.log
  - 5.5 实现 exit code 处理：exit 0 → 读 status.md 决定状态；exit ≠ 0 → failed
  - 5.6 实现孤儿进程恢复：启动时扫描 PID 文件，存活则恢复 registry，否则标记 failed
  - 5.7 编写 unit tests：参数构建、exit code 映射、孤儿检测
  - 5.8 编写集成测试：spawn mock 进程 → 正常退出 → 状态更新；spawn → kill → 状态更新
  - 5.9 验证 `cargo test` 通过
  - _Requirements: 4.1-4.9_
  - _Commit_: `feat(desktop): implement ProcessManager with lifecycle control`

- [ ] 6. Tauri IPC — 任务执行 Commands
  - 6.1 注册 Tauri commands：`start_task`、`stop_task`、`retry_task`
  - 6.2 `start_task`：校验 git 状态 → 创建 worktree（如需）→ spawn forge-loop → 更新 TaskStatus
  - 6.3 `stop_task`：调用 ProcessManager::stop_task → 更新状态为 Paused
  - 6.4 `retry_task`：复用原配置 → 新建 ExecutionRecord → spawn
  - 6.5 前端 `TaskCard.vue` 接入启动/暂停按钮
  - 6.6 编写集成测试：start → running → stop → paused 完整流转
  - 6.7 验证 `cargo test` + 手动验证 UI 操作
  - _Requirements: 4.1, 4.2, 4.6, 4.7_
  - _Commit_: `feat(desktop): wire task execution commands`

- [ ] 7. StatusWatcher — 实时状态监听
  - 7.1 实现 `StatusWatcher` struct：使用 `notify` crate debounced watcher（200ms）
  - 7.2 实现 `parse_status_md`：提取 phase + loop_iteration 字段
  - 7.3 实现 `parse_latest_event`：读取 events.ndjson 最后一行，解析 JSON
  - 7.4 实现 Tauri event 推送：`app_handle.emit_all("task-status-update", payload)`
  - 7.5 实现路径不存在检测：标记任务 failed
  - 7.6 前端监听 `task-status-update` 事件（Pinia store action），更新 TaskCard 进度条 + 阶段标签
  - 7.7 实现"详情"侧边面板：events 时间线 + status.md 内容 + 日志滚动
  - 7.8 编写 unit tests：status.md 解析（含乱码不 panic）、events.ndjson 解析
  - 7.9 编写 proptest：任意 status.md 内容不 panic
  - 7.10 验证 `cargo test` + `npm run test` 通过
  - _Requirements: 5.1-5.8_
  - _Commit_: `feat(desktop): implement StatusWatcher with real-time UI updates`

- [ ] 8. KeychainManager — 认证集成
  - 8.1 实现 `KeychainManager`：store / get / delete API key（`security-framework` crate）
  - 8.2 实现 Claude Code session 检测：检查 `~/.claude/.credentials.json` 存在性
  - 8.3 实现 API key 验证：调用轻量 HTTP 请求确认 key 可用
  - 8.4 注册 Tauri commands：`store_api_key`、`get_auth_status`、`clear_credentials`
  - 8.5 前端实现 `SettingsPage.vue` 认证区域：API key 输入 + 验证 + Claude Code session 检测
  - 8.6 ProcessManager spawn 时从 Keychain 读取 key 注入 env
  - 8.7 编写 unit tests：store/get/delete 流程（mock Keychain）
  - 8.8 编写安全测试：断言日志文件不含 API key 子串
  - 8.9 验证 `cargo test` + 手动验证设置页面
  - _Requirements: 8.1-8.8_
  - _Commit_: `feat(desktop): implement Keychain-based credential management`

- [ ] 9. SleepGuard — 休眠抑制
  - 9.1 实现 `SleepGuard::enable` / `disable`：调用 `sudo pmset -a disablesleep 1/0`
  - 9.2 实现 `setup_sudoers`：首次授权流程，写入 `/etc/sudoers.d/forge-loop`
  - 9.3 实现 `LidWatcher` 线程：500ms 轮询 `ioreg -r -k AppleClamshellState`
  - 9.4 内嵌 `backlightctl` Python 脚本：调用 DisplayServices 控制背光
  - 9.5 实现合盖 → 关背光、开盖 → 恢复亮度逻辑
  - 9.6 实现 `recover_stale_inhibition`：启动时检测残留 disablesleep 并恢复
  - 9.7 实现 `cleanup_sudoers`：卸载时删除 sudoers 文件
  - 9.8 注册 Tauri commands：`get_sleep_status`、`toggle_sleep_inhibit`
  - 9.9 前端菜单栏图标显示休眠状态（🔒/🔓）
  - 9.10 编写 unit tests：clamshell state 解析、pmset 命令构建
  - 9.11 编写集成测试：enable → 检测 pmset 状态 → disable → 恢复
  - 9.12 验证 `cargo test` 通过 + 手动验证合盖行为
  - _Requirements: 7.1-7.10_
  - _Commit_: `feat(desktop): implement SleepGuard with lid detection`

- [ ] 10. 完成通知与审核流
  - 10.1 集成 `tauri-plugin-notification`：任务完成时发送 macOS 原生通知
  - 10.2 实现通知点击回调：聚焦 App 窗口 + 打开审核面板
  - 10.3 实现 `ReviewPanel.vue` 组件：三标签页（概览 / 代码变更 / Review 报告）
  - 10.4 实现 `DiffTab.vue`：调用 `git diff` → 解析 unified diff → 文件树 + diff 渲染
  - 10.5 实现 `ReviewReportTab.vue`：读取 `.forge/findings/<topic>/review.md` → Markdown 渲染
  - 10.6 实现 `OverviewTab.vue`：迭代数、运行时长、token 消耗、成本估算
  - 10.7 实现"通过"按钮：标记 completed，关闭面板
  - 10.8 实现"打回"按钮：弹出反馈输入框 → 拼接 objective → 创建新 Execution
  - 10.9 注册 Tauri commands：`approve_task`、`reject_task`、`get_diff`
  - 10.10 实现快捷键：⌘⏎（通过）、⌘⌫（打回）、⎋（关闭）
  - 10.11 编写 Vitest 测试：ReviewPanel 渲染、通过/打回状态流转（`@vue/test-utils`）
  - 10.12 验证 `npm run test` + 手动验证审核流程
  - _Requirements: 6.1-6.8_
  - _Commit_: `feat(desktop): implement notification + review panel`

- [ ] 11. Bundled Node + forge-loop SDK 内嵌
  - 11.1 编写 `scripts/bundle-node.sh`：下载 Node.js v24.15.0 macOS Universal Binary，精简（去 npm/corepack/headers）
  - 11.2 编写 `scripts/bundle-forge-loop.sh`：`npm ci --production` + 复制 dist/ 到 Resources/forge-loop/
  - 11.3 配置 `tauri.conf.json` `bundle.resources`：声明 node/ 和 forge-loop/ 为 App 资源
  - 11.4 实现启动时完整性检查：验证 node binary + forge-loop-cli.js 存在
  - 11.5 编写 CI step：在 build workflow 中调用 bundle 脚本
  - 11.6 验证 `cargo tauri build` 产出的 .app 内含完整资源且可执行
  - 11.7 验证 DMG 体积 ≤ 200MB
  - _Requirements: 1.2, 1.3, 1.7, 9.6_
  - _Commit_: `feat(desktop): bundle Node.js + forge-loop SDK into app resources`

- [ ] 12. DMG 打包与签名
  - 12.1 配置 `tauri.conf.json` `bundle.macOS`：DMG 背景图、图标位置、Universal Binary target
  - 12.2 配置 Apple Developer ID 签名（或首版 ad-hoc 签名 + xattr 说明）
  - 12.3 配置 Apple notarization（`xcrun notarytool`）
  - 12.4 编写 `scripts/build-dmg.sh`：完整构建流程（bundle → sign → notarize → staple）
  - 12.5 配置 GitHub Actions release workflow：tag push → build → upload DMG to Releases
  - 12.6 实现"检查更新"功能：读取 GitHub Releases API latest version → 对比当前版本
  - 12.7 验证 DMG 在全新 macOS 11+ 虚拟机上双击安装 + 启动成功
  - _Requirements: 1.1, 1.4, 1.5, 1.8_
  - _Commit_: `feat(desktop): configure DMG packaging and notarization`

- [ ] 13. 卸载流程与错误处理完善
  - 13.1 实现"卸载"菜单项：清理 ~/Library/Application Support/forge-loop-desktop/、/etc/sudoers.d/forge-loop、App 日志
  - 13.2 实现 App 日志系统：`tracing-subscriber` + `tracing-appender`，JSON 格式，按天轮转 7 天
  - 13.3 实现"导出诊断包"功能：打包日志 + tasks.json（脱敏）为 zip
  - 13.4 实现崩溃恢复：检测 panic marker → 提示用户
  - 13.5 实现 tasks.json 损坏恢复：尝试 .bak → 失败则初始化空列表
  - 13.6 编写集成测试：卸载流程清理完整性、崩溃恢复流程
  - 13.7 验证 `cargo test` 通过
  - _Requirements: 1.9, 9.1-9.7_
  - _Commit_: `feat(desktop): implement uninstall flow and error recovery`

- [ ] 14. E2E 测试与文档
  - 14.1 安装 Playwright：`npm install -D @playwright/test`，配置 `playwright.config.ts`（baseURL 指向 `http://localhost:1420`）
  - 14.2 编写 Playwright E2E 测试：新建任务 → 启动 → 完成 → 审核通过完整流程（`cargo tauri dev` 启动后 Playwright 连接前端）
  - 14.3 编写 Playwright E2E 测试：设置 API key → 验证 → 保存 → 重启后可用
  - 14.4 编写 README.md：安装说明、首次使用引导、截图
  - 14.5 编写 CHANGELOG.md 首版条目
  - 14.6 更新 Forge 主项目 README.md：在"安装方式"段新增"桌面应用（Forge Loop App）"
  - 14.7 验证所有测试通过：`cargo test` + `npm run test` + `npx playwright test`
  - _Requirements: 1.6, 5.5, 10.1-10.14, 11.1-11.3_
  - _Commit_: `docs(desktop): add README, E2E tests, and update main project docs`

- [ ] 15. 知识库沉淀
  - 15.1 运行 `/forge learn`，确认知识条目写入
  - 15.2 确认 `.forge/knowledge/known-failures.md` 含 4 条桌面应用相关模式
  - 15.3 确认 `.forge/knowledge/decisions.md` 含 Tauri/SDK 复用/pmset 决策记录
  - 15.4 验证 `npm run check` 通过
  - _Requirements: 11.1-11.3_
  - _Commit_: `docs(knowledge): record desktop app engineering patterns`


## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1"],
      "description": "Tauri 项目脚手架，所有后续任务的基础"
    },
    {
      "wave": 2,
      "tasks": ["2", "4"],
      "description": "TaskStore 持久化 + 前端 UI 骨架，可并行"
    },
    {
      "wave": 3,
      "tasks": ["3", "5"],
      "description": "IPC CRUD 接入 + ProcessManager 实现，可并行"
    },
    {
      "wave": 4,
      "tasks": ["6", "7", "8"],
      "description": "任务执行 IPC + 状态监听 + 认证，可并行"
    },
    {
      "wave": 5,
      "tasks": ["9", "10"],
      "description": "休眠抑制 + 审核流，可并行"
    },
    {
      "wave": 6,
      "tasks": ["11"],
      "description": "Bundled Node + SDK 内嵌（依赖所有功能完成后集成验证）"
    },
    {
      "wave": 7,
      "tasks": ["12", "13"],
      "description": "DMG 打包签名 + 卸载/错误处理，可并行"
    },
    {
      "wave": 8,
      "tasks": ["14"],
      "description": "E2E 测试与文档"
    },
    {
      "wave": 9,
      "tasks": ["15"],
      "description": "知识库沉淀（所有任务完成后）"
    }
  ],
  "dependencies": {
    "1": [],
    "2": ["1"],
    "3": ["1", "2"],
    "4": ["1"],
    "5": ["1"],
    "6": ["3", "5"],
    "7": ["1", "6"],
    "8": ["1", "5"],
    "9": ["1"],
    "10": ["6", "7"],
    "11": ["5", "6"],
    "12": ["11"],
    "13": ["2", "9"],
    "14": ["6", "7", "8", "9", "10", "11", "12", "13"],
    "15": ["14"]
  }
}
```

## Notes

**项目位置**：`apps/forge-loop-desktop/`（新目录，独立于主 forge-loop 包）。

**与主项目的关系**：
- 桌面应用**引用** forge-loop SDK 产物（`dist/` + `node_modules/`），不 fork 代码
- 主项目 `npm run check` 不覆盖桌面应用（独立 CI workflow）
- 共享 `.forge/` 状态文件格式——桌面应用读写的文件与 CLI 完全兼容

**首版 MVP 范围**：
- Task 1-10 构成可用 MVP（能新建任务、执行、监听状态、审核）
- Task 11-12 构成可分发版本（DMG 安装）
- Task 13-15 为生产就绪补充（错误处理、E2E、文档）

**技术风险缓解**：
- Bundled Node 体积：首版接受 ~80MB Node binary；后续可评估 Bun compile 替代
- Apple 签名：首版可 ad-hoc 签名 + README 说明 `xattr -cr` 解锁；Developer ID 签名作为 Task 12 的可选子任务
- DisplayServices 私有 API：backlightctl 作为独立 Python 脚本，API 变更时可单独更新不影响主 App

**验证清单**（全部任务完成后核对）：
- `cargo tauri build` 产出 Universal Binary .app
- DMG 体积 ≤ 200MB
- 全新 macOS 11+ 系统双击安装 + 启动成功
- 新建任务 → 启动 → 实时进度 → 完成通知 → 审核通过 完整流程
- 合盖后任务继续执行（pmset disablesleep 生效）
- 开盖后屏幕恢复亮度
- App 退出后 disablesleep 恢复为 0
- API key 存入 Keychain，重启后可用
- 任务日志不含 API key 明文
- `cargo test` + `npm run test` + `npx playwright test` 全部通过
