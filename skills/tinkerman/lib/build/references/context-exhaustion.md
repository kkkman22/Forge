---
updated: 2026-08-11
---
# Context Exhaustion Protocol

> 由 forge-build SKILL.md §11 引用。当所有 Trimmer 仍不足以维持上下文时的应急协议——这不是失败，而是长时间 build 会话的正常边界条件。

## Detection Signals

观察到以下**任一**信号时，立即触发耗尽协议：

1. Auto-compact 触发且丢失已完成的任务跟踪
2. 无法在不重读 progress 文件的情况下回忆当前任务编号
3. Restatement Checkpoint 摘要超过 800 tokens（正常预算的两倍）
4. 推理质量退化——重复提问、丢失 TDD 阶段跟踪
5. 上下文利用率超过 80%

## Mandatory Exhaustion Sequence

检测到耗尽时，**替代**输出手动续接提示，执行以下序列：

### Step 1: 写入 Interim 状态（必须成功后再做其他操作）

写入 `.tinkerman/knowledge/sessions/<date>-<topic>-interim.md`：

```yaml
---
date: "<ISO timestamp>"
task: "<status.md 中的 current_task>"
phase: "build-exhaustion"
exhaustion_signal: "<触发了哪个检测信号>"
next_task_number: "<N>"
total_tasks: "<M>"
completed_tasks: "<K>"
---

## Progress Snapshot
<已完成的任务名称，每行一个>

## Key Findings
<从 .tinkerman/findings/<topic>.md 复制>

## Active Constraints
<剩余任务的阻塞项或特殊注意事项>

## Anomalies
<本会话中发生的意外情况>
```

### Step 2: 更新 Status 文件

更新 `.tinkerman/status.md`：`phase` 保持 `"build"` 不变，添加字段 `exhaustion_pending: "true"`，更新 `updated` 时间戳。

### Step 3: 输出 Handoff 并自动恢复

输出**仅此消息**：

```
⚠️ Context exhaustion detected. Interim state saved.
→ Continuing with /tinkerman resume
```

然后立即调用：`Skill(skill="forge", args="resume")`

## What NOT to Do

- **禁止**输出长段"剩余任务"清单让用户手动复制
- **禁止**输出"请在新会话中运行 /tinkerman resume"
- **禁止**在写入 interim 文件之前停止
- **禁止**因为"progress 文件已经跟踪了"而跳过 interim 写入

## Safety Limits

- 单次 build 会话最多 **5 次**耗尽轮转。达到 5 次后停止并报告。
- Interim 文件写入连续失败 2 次时，输出最小化 JSON handoff 到 stdout 作为 fallback。
- Three-strike 触发期间**不执行**耗尽协议——让 Three-strike 先自行处理。
- `next_task_number` 必须为正整数。解析失败时默认为 1，并记录 anomaly。
