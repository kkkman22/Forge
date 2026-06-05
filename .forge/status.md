---
current_task: "audit-phase3-infra"
tier: "standard"
phase: "build"
updated: "2026-06-06"
branch: "forge/audit-phase3-infra"
---

# 项目状态

## 当前任务：audit-phase3-infra

基于 PROJECT_AUDIT_REPORT.md Phase 3 的基础设施改进（5 项，不含 Tracing）。

### 范围

1. **T1 — Shadow Migration 清理** (移除 legacy parse 路径，state.ts + config-store.ts)
2. **T2 — Token 估算 CJK 优化** (新建 src/token-estimate.ts)
3. **T3 — findMentionedTerms 测试** (grill.ts export + tests)
4. **T4 — SKILL-src parity 校验脚本** (scripts/skill-parity-check.mjs)
5. **T5 — Metrics 聚合扩展** (dispatch-record.ts + event-writer.ts)

- Tier: standard
- Sequence: plan → build → review → test → ship
