---
updated: "YYYY-MM-DD"
---

# SKILL 执行反馈记录

> 每次 forge 命令执行完毕后，自动追加一条反馈记录。
> `/forge learn` 执行时会分析此文件，识别高失败率命令和重复失败模式。

<!-- 格式：每条记录一行，字段用 | 分隔 -->
<!-- command | success | duration_seconds | failure_reason -->
<!-- 示例：
build | true | 45 |
review | false | 120 | P0 security issue found after 3 iterations
plan | true | 30 |
build | false | 60 | test failed: module not found
-->
