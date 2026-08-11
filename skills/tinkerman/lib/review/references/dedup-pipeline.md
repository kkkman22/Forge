---
updated: 2026-08-11
---
# Finding Deduplication & Cross-Reviewer Consistency

## Finding Deduplication

**去重规则**：指纹 = `normalize(文件路径) + line_bucket(行号, ±3) + normalize(问题描述)`。匹配时合并，保留最高严重度、最高置信度、最保守修复路由，标注所有发现者。

**示例**：
```
合并前：
  [spec-check]    P1, conf 0.85, src/routes/export.ts:42 — 缺少错误处理
  [quality-check] P2, conf 0.90, src/routes/export.ts:43 — 异常未捕获导致 500
合并后：
  [spec-check, quality-check] P1, conf 0.90, src/routes/export.ts:42 — 缺少错误处理（异常未捕获导致 500）
```

## Cross-Reviewer Consistency Validation

2 个以上独立评审者发现同一问题（去重后同一指纹有多个来源）→ **置信度提升 0.10**（上限 1.0）。独立收敛到同一问题是最强信号。输出标注 `↑` 表示跨评审者提升。
