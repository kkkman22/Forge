---
current_task: "audit-phase2-quality-perf"
tier: "standard"
phase: "build"
updated: "2026-06-05"
branch: "forge/audit-phase2-quality-perf"
---

# 项目状态

## 当前任务：audit-phase2-quality-perf

基于 PROJECT_AUDIT_REPORT.md Phase 2 的质量与性能改进（4 项）。

### 范围

1. **T2 — Path traversal 扩展加固** (forge-read-cached.ts + shared validator)
2. **T4 — 算法复杂度优化** (`detectDrifts`, `checkContradictions`, `findMentionedTerms`)
3. **T3 — 配置管理统一** (Zod schema default, remove env var gate)
4. **T1 — Sync I/O 核心路径改造** (`knowledge-hooks.ts`, `spec-bundle-io.ts`)

- Tier: standard
- Sequence: plan → build → review → test → ship
