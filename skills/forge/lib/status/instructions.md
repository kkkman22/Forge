---
description: "Use when user runs `/forge status`, wants to see what tasks are in flight, or needs to know which phase a task currently sits in"
updated: 2026-06-09

dispatch_mode: inline
allowed_tools:
  - Read
  - Bash
---

## Current Context

!`cat .forge/status.md 2>/dev/null || echo "no status file"`
Branch: !`git branch --show-current`
Progress files: !`ls .forge/progress/*.md 2>/dev/null || echo "none"`

# /forge status — Status Query

> **触发方式**：用户输入 `/forge status`
> **职责**：读取 `.forge/status.md` 和 `progress/` 展示当前项目状态
> **输出路径**：无文件输出，仅终端展示

---

## 1. Overview

`/forge status` 是一个只读命令——它不修改任何状态，只读取 `.forge/` 下的状态文件并以结构化格式展示当前项目的工作状态。帮助开发者快速了解"我在哪里、在做什么、做到哪了"。

---

**Not For**：无——status 是只读查询，任何时候都可以执行。

## 2. 数据来源

**共享健康模型**：优先调用 `buildHealthSnapshot({ projectRoot, currentHead })` 读取 workflow graph、policy profile、artifact freshness 和 next-step blockers，再用 `renderStatusSummary(snapshot)` 生成 concise status 输出。`.forge/status.md` / `.forge/progress/` 的直接读取仅作为低层数据源或 fallback，不再作为独立状态逻辑。

**单任务模式**：

| 数据 | 来源文件 | 读取字段 |
|------|---------|---------|
| 当前任务 | `.forge/status.md` | YAML frontmatter: `current_task` |
| 当前档位 | `.forge/status.md` | YAML frontmatter: `tier` |
| 当前阶段 | `.forge/status.md` | YAML frontmatter: `phase` |
| 最近更新时间 | `.forge/status.md` | YAML frontmatter: `updated` |
| 任务进度 | `.forge/progress/<topic>.md` | 已完成/进行中/阻塞任务列表 |
| Policy Profile | `.forge/config.md` + health model | `policy_profile` |
| Next Step | workflow graph + health model | allowed/blocked edge and reasons |

**多任务模式**：调用 `listActiveTasks(io, forgeRoot)` 扫描 `.forge/status.md` + `.forge/status/*.md`，返回所有活跃任务的汇总表。为每个活跃任务分别读取 `.forge/progress/<topic>.md` 展示进度详情。

---

## 3. 输出格式

```
📊 Forge 状态

当前任务：<current_task>
档位：<tier>（轻量/标准/全量）
阶段：<phase>
最近更新：<updated>

━━━ 任务进度 ━━━

✅ 已完成（3/5）
  - [x] Task 1：创建通知服务核心接口
  - [x] Task 2：实现异步导出判定
  - [x] Task 3：添加导出 API 路由

🔄 进行中（1/5）
  - [ ] Task 4：实现下载链接过期逻辑

⏸️ 未开始（1/5）
  - [ ] Task 5：添加导出历史记录

🚫 阻塞（0）
  （无）
```

## 6. Frozen-Zone 活动摘要

在输出末尾追加 frozen-zone 活动摘要。运行：

```bash
bash scripts/summarize-frozen-events.sh --days=7
```

将输出追加到标准 status 输出的末尾。如果没有 frozen-zone 事件（日志为空），则跳过此节。

## Gotchas
- **Stale status**: Status says "in progress" but work completed hours ago → misleading → always cross-check with git log
- **Missing status file**: New project has no .forge/status.md → status returns nothing → create initial status file
- **Phase value unexpected**: Custom phase value not in expected range → status display breaks → handle gracefully with fallback
- **Clone + Plugin conflict**: Both `~/.claude/skills/forge/` and `~/.claude/plugins/forge/` exist → warn user → plugin takes precedence

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "我知道当前状态不需要查" | 你知道的是你记忆中的状态。实际状态可能因为 Subagent 执行、并发操作等原因与记忆不同 |
| "看代码就知道进度" | 代码变更不等于任务完成。status 展示的是 Forge 流程视角的进度，包括门禁状态和阻塞项 |
| "查状态浪费时间" | 5 秒的状态查询能避免在错误的阶段执行错误的操作 |

---

## 4. 边界情况处理

### 4.1 无 `.forge/` 目录

```
⚠️ 未检测到 .forge/ 目录。请先运行 /forge init 初始化项目。
```

### 4.2 无 status.md

```
ℹ️ 未找到 .forge/status.md。当前没有活跃的任务。
运行 /forge 开始新任务。
```

### 4.3 无 progress 文件

```
📊 Forge 状态

当前任务：<current_task>
档位：<tier>
阶段：<phase>
最近更新：<updated>

━━━ 任务进度 ━━━

ℹ️ 未找到进度文件。任务可能尚未开始执行。
```

### 4.4 Clone + Plugin 安装冲突

检测以下两个路径同时存在：
- `~/.claude/skills/forge/`（clone 或 dist 安装）
- `~/.claude/plugins/forge/`（plugin 安装）

同时存在时输出：

```
⚠️ 检测到 Forge 同时通过 clone 和 plugin 两种方式安装。
  - Clone: ~/.claude/skills/forge/
  - Plugin: ~/.claude/plugins/forge/

建议移除其中一种以避免冲突：
  claude plugin uninstall forge          # 保留 clone
  rm -rf ~/.claude/skills/forge          # 保留 plugin

Plugin 安装享有优先级。
```

---

## 5. 示例

### 示例 1：正常状态查询

```
$ /forge status

📊 Forge 状态

当前任务：订单批量导出功能
档位：标准（standard）
阶段：build
最近更新：2025-01-15 14:35

━━━ 任务进度 ━━━

✅ 已完成（3/5）
  - [x] Task 1：创建通知服务核心接口（3 min）
  - [x] Task 2：实现异步导出判定（3 min）
  - [x] Task 3：添加导出 API 路由（4 min）

🔄 进行中（1/5）
  - [ ] Task 4：实现下载链接过期逻辑（4 min）

⏸️ 未开始（1/5）
  - [ ] Task 5：添加导出历史记录（3 min）

🚫 阻塞（0）
  （无）
```

## 6. Frozen-Zone 活动摘要

在输出末尾追加 frozen-zone 活动摘要。运行：

```bash
bash scripts/summarize-frozen-events.sh --days=7
```

将输出追加到标准 status 输出的末尾。如果没有 frozen-zone 事件（日志为空），则跳过此节。
