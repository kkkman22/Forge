---
id: "ADR-0042"
title: "Raise docs quota max_count to 35 for forge-triage.md"
status: accepted
date: "2026-06-16"
deciders:
  - "@king"
related_adrs:
  - "2026-05-25-docs-governance-rollout.md"
---

# ADR-0042: Raise docs quota max_count to 35

## Context

docs-governance 的 `check-docs-quota` 在 `.tinkerman/config.md` 配置 `docs.max_count`（默认 30）。本次 `loop-engineering-adoption` PR 新增 `docs/forge-triage.md`（`/forge triage` 自动发现文档），使 doc count 从 29 涨到 30，撞到上限 `count >= max_count`（30 >= 30），导致 CI `docs-check` 失败。

这是 docs-governance 设计的预期行为：配额达上限时阻断，要求显式 ADR 授权扩容（`--allow-grow` 机制或调高 `max_count`），防止文档无序膨胀。

## Decision

将 `.tinkerman/config.md` 的 `docs.max_count` 从默认 30 调到 **35**。本次扩容为 forge-triage.md 的合法新增（对应 R2 triage 子命令的参考文档，已在 INDEX 收录），保留 5 个余量给后续合理新增。

35 < 1000（clampInt 上限），不触发任何硬性约束。

## Consequences

### Positive

- forge-triage.md 合法纳入文档治理体系，CI `docs-check` 通过
- 保留 5 个余量，后续小幅新增无需每次写 ADR

### Negative

- 文档总量上限放宽，需靠 docs-governance 其他检查（staleness/quota warning at max_count-1）继续约束无序膨胀
- 余量用尽后仍需新的 ADR
