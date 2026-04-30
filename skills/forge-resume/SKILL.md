---
name: forge-resume
description: "会话恢复。通过五个问题快速重建工作上下文。"
disable-model-invocation: true
---

# /forge resume — 会话恢复

> **触发方式**：用户在新会话中输入 `/forge resume`
> **职责**：在新会话中快速恢复之前的工作上下文，避免重复理解和重新开始
> **输出路径**：无文件输出，仅终端展示恢复的上下文

---

## 1. 概述

`/forge resume` 通过五个问题重建工作上下文——正在解决什么、当前在哪一步、已知发现、下一步、有什么阻塞。从 `.forge/` 状态文件自动提取答案。

**核心原则**：恢复上下文的成本应接近零。

---

## 2. 数据来源与五问题恢复

### 读取状态文件

**单任务**：读取 `.forge/status.md`。**多任务**：调用 `listActiveTasks(io, forgeRoot)`，多任务显示编号列表让用户选择，单任务自动恢复。

| 字段 | 用途 |
|------|------|
| `current_task` | 定位 plan/progress/findings 文件 |
| `tier` | 判断下一步命令 |
| `phase` | 当前阶段 |
| `updated` | 上次更新时间 |

### 会话层恢复

1. 检查 `.forge/knowledge/sessions/` 中 `*-interim.md`（中断的执行上下文）
2. 有 interim：读取进度快照 → 问题 2；关键发现 → 问题 3；异常记录 → 问题 5
3. 无 interim：读取正式会话日志作补充

**恢复后首次 Restatement**：用户确认继续 build 后，派发第一个 Subagent 前**立即执行一次 Restatement Checkpoint**。

### 五问题映射

| 问题 | 数据来源 |
|------|---------|
| 1. 正在解决什么？ | `.forge/plans/<topic>.md` Objective |
| 2. 当前在哪一步？ | `phase` + progress 中"进行中"任务 |
| 3. 已知发现？ | `.forge/findings/<topic>.md` |
| 4. 下一步？ | plan 中下一个未完成任务 |
| 5. 有什么阻塞？ | progress 中"阻塞"章节 |

---

## 3. 输出格式

```
🔄 Forge 会话恢复
📊 任务：<current_task> | 档位：<tier> | 阶段：<phase> | 更新：<updated>
━━━ 1. 问题 ━━━ <Plan Objective>
━━━ 2. 进度 ━━━ <当前任务描述>
━━━ 3. 发现 ━━━ <Findings 或"暂无">
━━━ 4. 下一步 ━━━ <下一任务描述>
━━━ 5. 阻塞 ━━━ <阻塞项 或"无">
✅ 自动定位到：<phase 对应命令或 Task N> | 继续？(y/n)
```

---

## 4. 自动定位

1. 有"进行中"任务 → 定位到该任务
2. 无进行中 → 第一个未完成任务
3. 全部完成 → 提示进入下一阶段（review/test/ship）

确认 → 从定位任务继续 `/forge build`；拒绝 → 等待指示。

---

## 5. 边界情况处理

| 条件 | 处理 |
|------|------|
| 无 `.forge/` 目录 | ⚠️ 无可恢复上下文。运行 forge init 或 /forge |
| 无 Plan 文件 | ℹ️ 运行 /forge 开始新任务 |
| 无 Progress 文件 | 展示全局状态 + Plan，建议从 Task 1 开始 |
| 所有任务已完成 | 提示运行 /forge review |

---

## 6. 示例

```
$ /forge resume
🔄 会话恢复 | 订单批量导出 | 标准 | build | 2025-01-15 14:30
━━━ 1. 问题 ━━━ 为订单系统提供批量导出功能
━━━ 2. 进度 ━━━ Task 4/5：实现下载链接过期逻辑
━━━ 3. 发现 ━━━ 文件存储支持 signed URL；平均 2MB 无需分片
━━━ 4. 下一步 ━━━ Task 5/5：添加导出历史记录
━━━ 5. 阻塞 ━━━ 无
✅ 定位：Task 4 | 继续？(y/n)
```
