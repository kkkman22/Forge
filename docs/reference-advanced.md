[← 返回索引](./INDEX.md)

# Forge 高级功能参考

## Forge Loop — 自主执行引擎

> **注意**：Forge Loop 是独立于 `/forge` 命令的高级功能，需要完整仓库（克隆安装方式）。分发包安装方式不包含 Forge Loop。

Forge Loop 是基于 [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-agent-sdk) 构建的自主循环执行引擎。与 `/forge` 命令（在 Claude Code 对话中由 AI 解释执行）不同，Forge Loop 是一个独立的 Node.js CLI 程序，在系统终端中运行，通过 Agent SDK 驱动 Claude Code 自主迭代执行任务，无需人工逐步干预。

### 前置条件

- **完整仓库**：必须通过克隆方式安装（分发包不含 Forge Loop）
- **Claude Code**：Forge Loop 通过 Agent SDK 调用 Claude Code，需要已安装 Claude Code
- **依赖安装**：`npm install`（自动安装 `@anthropic-ai/claude-agent-sdk` 和 `commander`）
- **TypeScript 编译**：`npx tsc`（编译到 `dist/src/`）

### 核心架构

```
forge-loop <objective>
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

```bash
# 基本用法
forge-loop "为用户 API 添加分页功能"

# 设置迭代上限
forge-loop "重构认证模块" --max-iterations 10

# 设置 token 上限
forge-loop "优化数据库查询" --max-tokens 500000

# 自然语言停止条件
forge-loop "修复所有 lint 错误" --stop-when "所有 lint 检查通过"

# 在独立 worktree 中执行
forge-loop "添加单元测试" --worktree

# 设置预算上限
forge-loop "实现搜索功能" --max-budget-usd 5.00

# 关闭防休眠
forge-loop "快速修复" --prevent-sleep off
```

### 构建与运行

```bash
# 1. 安装依赖
npm install

# 2. 编译 TypeScript
npx tsc

# 3. 运行（以下三种方式任选）
npx forge-loop "你的目标"                    # 通过 npx
node dist/src/forge-loop-cli.js "你的目标"   # 直接调用
npm link && forge-loop "你的目标"            # 全局链接后直接使用
```

> `/forge` 是在 Claude Code 对话中使用的交互式命令，`forge-loop` 是在系统终端中运行的自主循环程序。两者互补：前者适合人机协作，后者适合无人值守的批量任务。未来计划让 Forge Loop 的每轮迭代内部调用 Forge Skills，实现结构化流程 + 自主循环的深度融合（参见 [ROADMAP](../ROADMAP.md)）。

---

## cmux 集成（可选）

> **Zero-Impact 不变量**：未安装 cmux 时，Forge 行为零变化。所有 cmux 集成代码在 `cmuxAvailable()` 返回 false 时立即短路退出。

[cmux](https://github.com/nickgnd/tmux-mcp) 是一个终端复用器，Forge 可选地将生命周期状态投射到 cmux 侧边栏和通知。

### 功能

| 功能 | 说明 |
|------|------|
| **Mirror_Daemon** | 守护进程，实时观察 `.forge/` 状态变化并投射到 cmux 侧边栏 |
| **sync-once** | Hook 触发的一次性状态同步（轻量级替代守护进程） |
| **Events_NDJSON** | 结构化事件流，服务多个消费者 |
| **Reviews Frontmatter** | 评审结果结构化存储（原子重写） |
| **Browser QA** | cmux browser 命令驱动的端到端 QA |
| **工作区布局** | 3 种 Forge 专属 cmux 布局模板 |

### 使用

```bash
# 安装 cmux 后，Forge 自动检测并启用集成
# 无需任何配置

# 安装 Forge 专属布局模板（可选）
bash scripts/cmux-mirror/install-template.sh .

# 安装 cmux 可选技能包（可选）
bash cmux-skills/install.sh --apply .claude/skills
```

### 卸载

```bash
# 移除布局模板
rm cmux.json

# 移除技能包
bash cmux-skills/install.sh --uninstall .claude/skills

# cmux 集成代码随 Forge 一起存在，但不产生任何运行时开销
```

### 新增文件

- `scripts/cmux-mirror/` — 4 个主脚本 + 14 个库模块
- `templates/cmux.json` — 工作区布局模板
- `cmux-skills/` — 3 个可选 SKILL.md + 安装器
- `test/cmux-mirror/` — 25 tests (including 10 property tests)

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
