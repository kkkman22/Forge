---
updated: 2026-08-11
---
# Confidence Filtering

每个评审发现附带置信度评分（0.1-1.0）。**低于 0.8 的发现被过滤**。

| Confidence | Action |
|--------|------|
| ≥ 0.8 | 写入评审报告 |
| 0.5-0.7 | 记录到 `.tinkerman/reviews/<topic>-low-confidence.md`，不阻断 |
| < 0.5 | 丢弃 |

## 评审者输出格式

每个发现使用 P5 证据链：

```
[severity: P1] [confidence: 0.9] [fix: gated_auto]
文件：src/routes/export.ts 第 42 行
[Evidence] 代码：`router.get('/export', exportHandler)` — 无鉴权中间件
[Claim] 缺少鉴权中间件，任何用户都能访问导出接口
建议：添加 authMiddleware 到路由链
```
