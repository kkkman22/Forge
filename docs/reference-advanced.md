---
title: 'Forge 高级功能参考'
category: advanced
audience:
- maintainer
updated: 2026-06-13
owner: forge-maintainers
---

[← 返回索引](./INDEX.md)

# Forge 高级功能参考

## Forge Loop — 带工程纪律的自主执行引擎

> **注意**：Forge Loop 是独立于 `/forge` 命令的高级功能，需要完整仓库（克隆安装方式）。分发包安装方式不包含 Forge Loop。

Forge Loop 是基于 [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-agent-sdk) 构建的**带工程纪律的自主执行引擎**。与 `/forge` 命令（在 Claude Code 对话中由 AI 解释执行）不同，Forge Loop 是一个独立的 Node.js CLI 程序，在系统终端中运行，通过 Agent SDK 驱动 Claude Code 自主迭代执行任务，无需人工逐步干预。

### 与 Claude Code 官方命令对比

| 差异维度 | Forge Loop | `/goal` + `/loop` |
|----------|-----------|-------------------|
| Git 事务 | 每次成功迭代自动 commit，失败自动 rollback | 无内置 Git 事务 |
| 熔断器 + 指数退避 | 连续失败自动中止，退避时间递增 | 无内置熔断机制 |
| 质量门禁 | Spec 锁定 + 三层评审 + PBT 验证 | 通用代码质量，无 Spec 对齐 |
| Spec 对齐 | Spec_Alignment_Review 独立层 | 无 Spec 级验证 |

### 前置条件

- **完整仓库**：必须通过克隆方式安装（分发包不含 Forge Loop）
- **Claude Code**：Forge Loop 通过 Agent SDK 调用 Claude Code，需要已安装 Claude Code
- **依赖安装**：`npm install`（自动安装 `@anthropic-ai/claude-agent-sdk` 和 `commander`）
- **TypeScript 编译**：`npx tsc`（编译到 `dist/src/`）

### 核心架构

```
/forge loop <objective>
    │
    ├── SdkDriver          迭代循环驱动器
    │     ├── Orchestrator  纯函数状态机（idle → running → waiting → aborted/stopped）
    │     ├── EffectExecutor 副作用执行器（git commit/rollback/backoff）
    │     └── SdkAgentAdapter  Claude Agent SDK 适配层
    │
    ├── RunManager          运行生命周期管理（目录、分支、notes 持久化）
    ├── ContextAccumulator  跨迭代上下文累积（notes document）
    ├── FailureHandler      失败处理（指数退避 + 熔断器）
    └── WorktreeManager     Git Worktree 隔离执行
```

### 工作流程

1. **启动**：校验 Git 仓库状态 → 创建 `forge/<objective>` 分支 → 初始化运行目录
2. **迭代**：每轮调用 Agent SDK 执行任务 → Orchestrator 根据结果决定下一步
   - 成功 → `git commit` → 调度下一轮
   - 软失败 → `git rollback` → 重试
   - 硬失败 → `git rollback` → 指数退避等待后重试
3. **终止**：达到迭代/token 上限、满足停止条件、连续失败熔断、或用户中断（Ctrl+C）

### 安全机制

- **Git 事务**：每次成功迭代自动提交，失败自动回滚（回滚前 `git stash` 保底）
- **熔断器**：连续失败达到阈值（默认 3 次）自动中止，防止无限循环
- **指数退避**：硬失败后等待时间递增，避免频繁重试
- **Worktree 隔离**：`--worktree` 模式在独立工作树中执行，不影响主分支（并发上限可配置）
- **防休眠**：自动阻止系统休眠（macOS `caffeinate` / Linux `systemd-inhibit`）
- **优雅关闭**：SIGINT/SIGTERM 信号触发安全停止，清理所有资源

### 使用方式

Forge Loop 通过 `/forge loop` 命令在 Claude Code 对话中启动：

```
# 基本用法
/forge loop 为用户 API 添加分页功能

# 设置迭代上限
/forge loop 重构认证模块 --max-iterations 10

# 设置 token 上限
/forge loop 优化数据库查询 --max-tokens 500000

# 自然语言停止条件
/forge loop 修复所有 lint 错误 --stop-when "所有 lint 检查通过"

# 在独立 worktree 中执行
/forge loop 添加单元测试 --worktree

# 设置预算上限
/forge loop 实现搜索功能 --max-budget-usd 5.00

# 关闭防休眠
/forge loop 快速修复 --prevent-sleep off
```

### 构建与运行

```bash
# 1. 安装依赖
npm install

# 2. 编译 TypeScript
npx tsc

# 3. 在 Claude Code 中运行
/forge loop "你的目标"
```

> `/forge loop` 是在 Claude Code 对话中使用的自主循环命令。每轮迭代内部调用 Forge Skills，实现结构化流程 + 自主循环的深度融合（参见 [ROADMAP](../ROADMAP.md)）。

---

## cmux 集成（可选）

> **Zero-Impact 不变量**：未安装 cmux 时，Forge 行为零变化。所有 cmux 集成代码在 `cmuxAvailable()` 返回 false 时立即短路退出。

[cmux](https://github.com/manaflow-ai/cmux)（[cmux.dev](https://www.cmux.dev/)）是基于 Ghostty 的原生 macOS 终端，专为 AI coding agent 设计——垂直标签页、注意力提醒环、socket API、内置浏览器、原生 Claude Code Teams 支持。Forge 可选地将生命周期状态投射到 cmux 侧边栏与通知。

### 功能

| 功能 | 说明 |
|------|------|
| **Mirror_Daemon** | 守护进程，实时观察 `.forge/` 状态变化并投射到 cmux 侧边栏 |
| **sync-once** | Hook 触发的一次性状态同步（轻量级替代守护进程） |
| **Events_NDJSON** | 结构化事件流，服务多个消费者 |
| **Reviews Frontmatter** | 评审结果结构化存储（原子重写） |
| **Browser QA** | cmux browser 命令驱动的端到端 QA |
| **工作区布局** | 3 种 Forge 专属 cmux 布局模板 |
| **多窗口隔离** | 自动在 `CMUX_WINDOW_ID` 存在时向所有 cmux 调用注入 `--window`，确保多窗口环境下事件精准投递（cmux 0.64.8+） |

### Agent Teams 在 cmux 下原生可用

cmux 自 0.63 起原生支持 Claude Code Teams（`cmux claude-teams`）。Forge Tier 1 PoC `/forge decide --mode=teams` 在 cmux 终端中**零额外配置**——cmux 自动设置 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`、注入 tmux shim、把 teammate 显示为原生 cmux 分屏（带 sidebar 元数据 + 注意力提醒环 + macOS 桌面通知）。

详见：[Claude Code Teams 集成（cmux 官方文档）](https://cmux.com/docs/agent-integrations/claude-code-teams)。

> Tier 0 hook（`TaskCompleted` / `TaskCreated` / `TeammateIdle`）在 cmux 终端中行为与普通终端**完全一致**，无需 cmux 特殊适配。

### 使用

```bash
# 安装 cmux 后，下次 /forge 调用即可自动检测并启用 cmux SKILL
# sticky 状态机在该进程内保持判定结果
# 无需任何配置或手动安装步骤

# 安装 Forge 专属布局模板（可选）
bash scripts/cmux-mirror/install-template.sh .
```

**推荐 cmux 最低版本**：0.64.3（启用命令面板 `commands` 字段）。强烈推荐 0.64.10 起（启用 `agent_resume_approvals` + `cmux reorder-workspaces` 批量）；0.64.11 起额外启用 Agent Hibernation（多并行 Subagent 场景被动受益）。本复审时 cmux 最新为 0.64.15。

### 0.64+ 原生能力（Forge 直接复用）

cmux 0.64 起为 Claude Code 工作流原生提供以下能力，Forge 不再造轮子，直接复用：

| 能力 | cmux 版本 | Forge 复用方式 |
|------|----------|---------------|
| Session Restore on Quit（Claude Code 会话恢复） | 0.64.0 | 关闭最后一个窗口后重启不丢上下文，Forge 会话连续性自动受益 |
| `cmux top` JSON 状态快照 | 0.64.0 | `/forge status` / `/forge debug` 可调用以获取 surface / 未读 / 孤儿 dev server 信息（opt-in） |
| **多窗口隔离 `--window`** | 0.64.8 | `scripts/cmux-mirror/{cli.mjs, push.sh, hook-notify.sh}` 自动在 `CMUX_WINDOW_ID` 存在时附加；零配置 |
| **`cmux reorder-workspaces` 自动置顶** | 0.64.10 | Mirror_Daemon 启动时把当前 workspace（`CMUX_WORKSPACE_ID`）reorder 到组首；Zero-Impact（无 ref / cmux 缺该命令时静默 no-op）；`lib/workspace-reorder.mjs` 经 `--help` 离线探测支持 |
| **`cmux browser` QA 诊断采集** | 0.64.8–0.64.15 | `collectBrowserDiagnostics()` 用 `screenshot --out`（0.64.8）+ `console list`/`errors list`（0.64.15 view-action）采集只读证据到 `.forge/findings/<topic>/browser-qa/`；每步独立降级，复用 R8 Zero-Impact |
| `cmux config doctor` 离线 cmux.json 校验 | 0.64.3 | `scripts/bootstrap-check.mjs` SessionStart 顺手校验，advisory 不阻断 |
| `agent_resume_approvals` resume 预批准 | 0.64.10 | `templates/cmux.json` 顶层字段；`/forge resume` 不再被 cmux 拦截 |
| `cmux notification jump-to-unread` | 0.64.5 | frozen-zone 拦截通知附跳转；`hook-notify.sh` 自动调用 |
| Agent Hibernation（空闲 agent 休眠） | 0.64.11 | `/forge decide`（四视角）/`review`（三层）/`build` DAG 多并行 Subagent pane 时，空闲 agent 自动休眠降 CPU/内存、按需恢复；被动受益，零配置 |
| `cmux.com/llms.txt` 文档索引 | 0.64.0 | cmux 官方命令面的 agent-consumable 索引（每个文档页有 `.md`/`.txt` 变体）；cmux skill 作者可指向它获取最新命令面，减少 `references/cmux*.md` 静态副本漂移 |

### 卸载

```bash
# 移除布局模板
rm cmux.json

# 卸载或停用 cmux 后，下次 /forge 调用 Conditional_Availability_Gate
# 自动转为拒绝分发，cmux SKILL 自然失活，无需额外清理步骤

# cmux 集成代码随 Forge 一起存在，但不产生任何运行时开销
```

### 升级说明

如果之前安装过旧版 cmux 技能包（`.claude/skills/forge-sidebar-sync/` 等），可以手动清理旧目录：

```bash
rm -rf .claude/skills/forge-sidebar-sync .claude/skills/forge-browser-qa .claude/skills/forge-loop-signals
```

保留旧目录不会破坏 Zero-Impact 不变量：未装 cmux 时旧目录中的 SKILL 仍受其原 `Requirements: cmux installed` 约束而自然失活。

### 新增文件

- `scripts/cmux-mirror/` — 6 个主脚本（mirror、sync-once、push、hook-notify、browser-qa、install-template）+ 13 个库模块
- `templates/cmux.json` — 工作区布局模板（3 种布局）
- `skills/forge/lib/forge-cmux-sidebar-sync/` — cmux sidebar sync SKILL（条件分发）
- `skills/forge/lib/forge-cmux-browser-qa/` — cmux browser QA SKILL（条件分发）
- `skills/forge/lib/forge-cmux-loop-signals/` — cmux loop signals SKILL（条件分发）
- `test/cmux-mirror/` — 33 tests（含 6 个 property tests：availability / budget-monotonic / dedupe-idempotent / events-tolerance / payload-mapping / session-totality）
- `skills/forge/lib/{review,build,ship,abort,test,control-cli,control-ui}/references/cmux*.md` — SKILL 集成参考

> **提示（cmux 0.64.7+ 用户）**：宪法 §2.4 三连失败要求 reroute。cmux 用户可在 `/forge debug` 触发后用 `cmux conversation fork` 保留失败链、从原始 turn 分叉新假设。零代码变更，零集成成本。

---

## Token 效率

| 方案 | Token 开销 | 说明 |
|------|-----------|------|
| Forge 全部 SKILL.md | **~42K** | 25 个 SKILL 文件总量（含 forge-verify、forge-control-cli、forge-control-ui、forge-fix-conflicts、forge-recap、forge-learn --from-chats） |
| Forge 单次会话（按需加载） | **~10K** | 只加载当前命令需要的 SKILL |

按需加载意味着轻量路径只加载 `build` + `review` 两个 SKILL，标准路径加载 5 个，全量路径加载 8 个。辅助命令（status/resume/debug/verify/control-cli/control-ui/fix-conflicts/recap）按需单独加载。

**进一步节省**：启用 [opusplan 模式](opusplan-guide.md)（plan 用 opus，执行用 sonnet）可额外节省 20-40% token，与 Agent 级模型路由互补。

---

## Domain Packs

Forge 支持 Domain Pack 机制，为特定行业提供开箱即用的领域知识。

### PMS Domain Pack v1.0

酒店前台管理系统（Property Management System）领域包，包含：

- **8 个限界上下文**：Reservations、Front Desk、Housekeeping、Folio-Billing、Night Audit、Rate-Inventory、Channel-Integration、Reporting
- **分 Context 术语表**：每个上下文 12+ 术语，含中文别名
- **4 个状态机**：Reservation、Folio、RoomStatus、HousekeepingTask（YAML 定义 + 自动 property test 派生）
- **20 个 Gherkin 场景**：覆盖入住/退房/夜审/预订/账单核心流程
- **禁用词清单**：防止实现泄漏到规格文档
- **BusinessDayClock**：酒店营业日时钟（支持 DST）

```bash
# 启用 PMS Pack
/forge init --pack pms

# 场景可直接复制到 spec 的 ## Scenarios 部分
```

详见 `packs/pms/README.md`。
