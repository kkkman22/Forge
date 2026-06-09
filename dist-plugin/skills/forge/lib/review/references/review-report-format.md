# Review Report Format

`.forge/reviews/<topic>.md`。YAML frontmatter + 正文。`result`：`pass`（无 P0/P1 且全部完成）/ `fail`（有 P0/P1）/ `incomplete`（有 Layer 未完成，**不允许 ship**）。

**Frontmatter 模板**：
```yaml
---
topic: "<主题>"
date: "YYYY-MM-DD"
result: "pass" | "fail" | "blocked" | "incomplete"
reviewed_at_commit: "<git rev-parse HEAD>"  # 评审时的 commit SHA
evidence_artifact_id: "<artifact-id>"
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 0
methodology: subagent-parallel  # 评审产出路径，缺省 subagent-parallel
layers:
  spec_check: "pass"
  quality_check: "pass"
  security_check: "pass"
---
```

`reviewed_at_commit` 供 ship 阶段 freshness 验证使用。`evidence_artifact_id` 指向 `.forge/artifacts/<run-id>/<artifact-id>.json` 中的 immutable `review` artifact；`result: pass` 没有该引用时不得作为 ship 证据。

## methodology 字段语义

| 值 | 含义 |
|---|---|
| `subagent-parallel` | 默认。三个 subagent 并行/滚动窗口产出 |
| `subagent-serial` | 降级。`FORGE_REVIEW_CONCURRENCY=1` 时使用 |
| `ci-evidence` | CI ultrareview 异步覆盖路径 |
| `unavailable` | 所有 subagent 路径不可用、CI 也无覆盖。parser 强制 `result=blocked` |
