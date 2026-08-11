---
status: completed
status_note: "Meta-spec：8 个子 spec 基于 gsd-core v1.4.4。Spec 1/2/4/6/7 已通过现有实现满足；Spec 3/8（L3/L4 wiring + status matrix + must-haves merge）已实现于 review/instructions.md §3a；Spec 5（Hypothesis type 扩展 + strict mode）已实现于 src/debug.ts + debug SKILL。全部 8 项已落地。"
feature: gsd-core-adoption
layout: requirements
created: 2026-06-04
updated: 2026-06-12
baseline: v1.4.4
tier: standard
---

# Requirements Document — GSD Core Adoption (v1.4.4)

## 概述

本 spec 为 meta-spec，包含从 [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core) v1.4.4 调研中识别出的 8 个高价值借鉴点。每个子 spec 独立成文，详见 [README.md](README.md) 和 `spec-1` 至 `spec-8` 文件。

**版本演进**：v1.3.0 基线（2026-06-04 首版）→ v1.4.4 全面重写（2026-06-12）→ 代码交叉验证（2026-06-12）。

## 子 Spec 列表（含代码交叉验证结论）

| # | Spec | 评估结论 | Forge 现有实现 | 可执行项 |
|---|------|---------|--------------|---------|
| 1 | [Prompt 注入防御](spec-1-prompt-injection-defense.md) | ✅ 已满足 | forge-prompt-guard + forge-read-injection-scanner + 39 regex | 无 |
| 2 | [上下文分层裁剪](spec-2-context-layered-trimming.md) | ✅ 已满足（Forge 更优） | context-budget.ts 797 行（InformationLifecycle 4 类型 + 13 source types + 6 trimmers） | 无 |
| 3 | [Goal-Backward 验证](spec-3-goal-backward-verification.md) | ⚠️ 部分借鉴 | spec-check agent（adversarial + stub detection + confidence） | L3 Wired + L4 Data-Flow + must-haves merge + status matrix |
| 4 | [判别联合结果类型](spec-4-discriminated-union-results.md) | ✅ 已满足 | branch-gate.ts BranchGateResult（5 kind discriminated union） | 无（createHub 不适用） |
| 5 | [科学调试框架](spec-5-scientific-debugging.md) | ⚠️ 部分借鉴 | debug.ts（4 阶段 + 假设验证 + 3-strike） | checkpoint 5 字段 + debug 文件协议 + 4 模式 |
| 6 | [偏差分级规则](spec-6-deviation-tier-rules.md) | ✅ 已满足 | error-recovery/engine.ts（safe_auto/gated_auto/manual/advisory） | 无 |
| 7 | [文件锁定与原子操作](spec-7-file-locking-atomic-ops.md) | ✅ 已满足 | state.ts（通用锁系统）+ tool-health-writer.ts（O_EXCL + spin-wait + jitter） | 无 |
| 8 | [4 级 Artifact 验证](spec-8-four-level-artifact-verification.md) | ⚠️ 合并到 Spec 3 | spec-check（L1/L2 已有） | L3/L4 与 Spec 3 重叠，合并处理 |

## 可执行工作汇总

**仅 Spec 3 + Spec 5 有可执行项**，合计 9-13h：

- **Spec 3**（5-7h）：增强 spec-check agent instructions — L3/L4 wiring 验证 + must-haves merge + 状态矩阵
- **Spec 5**（4-6h）：增强 debug SKILL — Hypothesis type 扩展 2 字段 + reasoning checkpoint 模板 + debug session 文件协议 + 4 模式

Spec 8 的 L3/L4 内容与 Spec 3 完全重叠，合并到 Spec 3 处理。
