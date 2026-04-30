---
name: forge-status
description: "状态查询。读取 .forge/ 状态文件展示当前项目工作状态。"
disable-model-invocation: true
---

# /forge status — Status Query

> **触发方式**：用户输入 `/forge status`
> **职责**：读取 `.forge/status.md` 和 `progress/` 展示当前项目状态
> **输出路径**：无文件输出，仅终端展示

---

## 1. Overview

`/forge status` 是一个只读命令——它不修改任何状态，只读取 `.forge/` 下的状态文件并以结构化格式展示当前项目的工作状态。帮助开发者快速了解"我在哪里、在做什么、做到哪了"。

---

## 2. 数据来源

**单任务模式**：

| 数据 | 来源文件 | 读取字段 |
|------|---------|---------|
| 当前任务 | `.forge/status.md` | YAML frontmatter: `current_task` |
| 当前档位 | `.forge/status.md` | YAML frontmatter: `tier` |
| 当前阶段 | `.forge/status.md` | YAML frontmatter: `phase` |
| 最近更新时间 | `.forge/status.md` | YAML frontmatter: `updated` |
| 任务进度 | `.forge/progress/<topic>.md` | 已完成/进行中/阻塞任务列表 |

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

---

## 4. 边界情况处理

### 4.1 无 `.forge/` 目录

```
⚠️ 未检测到 .forge/ 目录。请先运行 forge init 初始化项目。
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
