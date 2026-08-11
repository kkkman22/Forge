---
updated: 2026-08-11
---
# Change Summary — 详细规范

> 从 `../instructions.md §6.6` 拆分。SKILL 主文件只保留一行摘要指针。

每个 Subagent 在原子提交前，必须输出三段式变更摘要：

```
📝 Task N 变更摘要
  变更：<文件列表 + 每个文件的变更描述>
  未触碰（有意）：<注意到但不在范围内的问题>
  关注点：<需要用户确认的决策>
```

## 语义说明

- **"未触碰"部分证明范围纪律**——表明 Agent 注意到了相邻问题但选择不修复
- **"关注点"部分**：
  - Autonomous 模式下记录到 findings
  - Interactive 模式下等待用户确认

此摘要属于 Structured_Output，豁免于散文压缩规则（→ CLAUDE.md §2.6）。
