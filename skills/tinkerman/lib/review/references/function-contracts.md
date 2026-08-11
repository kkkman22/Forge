---
updated: 2026-08-11
---
# Function Contracts

## `serializeReviewSummary(summary)`

- **参数**：`summary` — 评审者输出（需解析为 `ReviewSummary` 类型，包含 severity 分布、findings 列表、文件路径）
- **返回**：结构化摘要字符串（≤400 tokens）
- **用途**：替换 context 中的评审完整输出。评审者完整输出写入 `.tinkerman/reviews/<topic>.md` 后，context 中仅保留此摘要

零 findings 时保留单行确认消息。
