---
updated: 2026-08-11
---
# Known AI Failure Patterns & Rationalizations

## Known AI Failure Patterns

| # | Wrong | Correct |
|---|-------|---------|
| 1 | Impl during RED | Tests only; delete impl, restart |
| 2 | Skip tests, mark done | Verify gate + P5 chain |
| 3 | Multi-task commit | 1 task 1 commit |
| 4 | Code without plan | Read Plan fully first |
| 5 | Out-of-scope edits | Plan scope only, record issues |
| 6 | Narrating edits | Silent, brief at Decision_Point |
| 7 | Self-assemble commands | ci_check_command as-is |
| 8 | 任务间停下来问"是否继续"或"工作量大，是否暂停" | 完成任务 → 一行摘要 → 立即下一个任务。Plan 已批准，build 只管执行 |

## Reflection Triggers

以下场景触发**思考暂停**——遇到时先自问，再决定下一步。不机械执行阈值判断，结合上下文综合判断。

| 触发条件 | 自问 | 交互处理 | 自主处理 |
|----------|------|----------|----------|
| **Chesterton's Fence**：删除或大幅修改现有代码 | 我理解这段代码为什么被写成这样吗？git blame 的上下文是什么？ | 解释原因 → 确认修改 | 记录到 `.forge/findings/`（原因 + 修改理由）→ 继续执行 |

## Common Rationalizations

| 合理化 | 反驳 |
|---|---|
| "几行不值得写测试" | 小 bug 最难发现 |
| "先实现再补测试" | 只证明代码做了什么，不证明需求满足 |
| "太简单不会出错" | 简单函数没人检查 |
| "这个任务工作量较大，先确认一下" | Plan 已批准所有任务。build 的职责是执行，不是重新评估工作量。直接开始 |
| "涉及渲染层/核心模块修改，是否先暂停进入 review" | review 在所有 build 任务完成后自动触发。中途暂停违反执行纪律 |
