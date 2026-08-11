---
updated: 2026-08-11
---
# Delegation Adapter

> 引用 `skills/shared/native-command-matrix.md` 获取完整配置

**Forge review = (可选) `/code-review` + `/security-review` + (始终) Spec_Alignment_Review**

## Delegation Flags

| Flag | Default | Effect |
|------|---------|--------|
| `--delegate-quality` | auto-detect | 委托 Layer 2 (代码质量) 给 `/code-review` |
| `--delegate-security` | auto-detect | 委托 Layer 3 (安全) 给 `/security-review` |

Auto-detect 逻辑：探测 `claude --version` ≥ 2.0.0 且对应 Native_Command 存在 → true；否则 false。

## 三层委托模型

| Layer | 委托时 | 未委托时 |
|-------|--------|----------|
| Layer 1 — Spec_Alignment_Review | **始终由 Forge 执行**（核心差异化） | 同左 |
| Layer 2 — 代码质量 | 调用 `/code-review`，消费 findings | Forge 内建 quality-check subagent |
| Layer 3 — 安全 | 调用 `/security-review`，消费 findings | Forge 内建 security-check subagent |

## 合并规则

1. Native_Command 成功 → 消费 findings + 执行 Forge Spec_Alignment_Review → 合并输出
2. Native_Command 失败(exit ≠ 0) → abort 委托层，回退到内建 subagent
3. 合并输出每条 finding 含 `source` 字段：`"claude:code-review"` | `"claude:security-review"` | `"forge:spec-alignment"`
4. `merged_summary.P0_blockers` 只计入 `source = "forge:spec-alignment"` 的 P0 条目

## 输出 Schema 扩展

```yaml
sources:
  - source: "claude:code-review"
    invocation: "/code-review"
    exit_code: 0
    findings_count: N
  - source: "forge:spec-alignment"
    invocation: "subagent:architect"
    exit_code: 0
    findings_count: N
```

**向后兼容**：原有 `.tinkerman/reviews/*.md` 字段全部保留，`sources` 为新增字段。

## Fallback

版本不满足时：使用内建 subagent + emit Deprecation_Notice。迁移指南：docs/slimming-migration.md
