---
updated: 2026-08-11
---
# Subagent 结果返回协议模板

> 供 spec-check、quality-check、security-check agent 定义引用。

## 摘要格式

Subagent 的最终返回文本**限制在 800 chars 以内**，格式：

```
status: <pass|fail>
findings: <total_count>
p0: <count>
p1: <count>
report: .tinkerman/reviews/<layer>-<YYYYMMDD-HHmmss>.md
```

## 报告文件

完整报告 Write 到 `.tinkerman/reviews/<layer>-<timestamp>.md`。

### 命名约定

- `<layer>`: `spec-check` | `quality-check` | `security-check`
- `<timestamp>`: `YYYYMMDD-HHmmss` 格式（UTC）
- 示例：`.tinkerman/reviews/spec-check-20260530-071500.md`

### 报告内容结构

```markdown
# <Layer> Review Report

**Status**: pass/fail
**Date**: YYYY-MM-DD HH:mm:ss UTC
**Findings**: total / P0 / P1 / P2 / P3

## Findings

### [P0/P1/P2/P3] <finding-title>
- **File**: path/to/file.ts:L42
- **Description**: ...
- **Recommendation**: ...

---

## Summary
<brief summary>
```

## 主 Agent 处理规则

`/tinkerman review` 主 agent 收到 subagent 结果后：

1. **解析摘要**（status / findings / p0 / p1 / report_path）
2. **p0 > 0 或 p1 > 0** → `Read report_path` 获取完整详情
3. **p0 = 0 且 p1 = 0** → **不读取**报告文件，仅基于摘要
4. 综合评审报告仍输出到 `.tinkerman/reviews/<timestamp>-combined.md`

## 向后兼容

- 用户看到的仍然是合并后的综合评审报告
- 仅当 MCP server 或 agent 不支持此协议时，退化为原内联返回模式
