# Review Report Format

`.forge/reviews/<topic>.md`。YAML frontmatter + 正文。`result`：`pass`（无 P0/P1 且全部完成）/ `fail`（有 P0/P1）/ `incomplete`（有 Layer 未完成，**不允许 ship**）。

**Frontmatter 模板**：
```yaml
---
topic: "<主题>"
date: "YYYY-MM-DD"
result: "pass" | "fail" | "incomplete"
reviewed_at_commit: "<git rev-parse HEAD>"  # 评审时的 commit SHA
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 0
layers:
  spec_check: "pass"
  quality_check: "pass"
  security_check: "pass"
---
```

`reviewed_at_commit` 供 ship 阶段 freshness 验证使用。
