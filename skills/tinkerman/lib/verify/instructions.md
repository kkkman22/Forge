---
updated: 2026-08-11
description: "Use when user runs `/tinkerman verify <topic>` or during bugfix auto / debug Phase 4"

dispatch_mode: inline
allowed_tools:
  - Read
  - Bash
---

# /tinkerman verify — 证据化验证引擎

**Use when** you need to produce an evidence-based three-state verdict (VERIFIED / NOT_VERIFIED / INCONCLUSIVE) for a specific deliverable or claim. This is *evidence aggregation and tri-state judgment* — collecting all available evidence and producing a falsifiable conclusion. Do not confuse with `/tinkerman accept` (running acceptance scenarios) or `/tinkerman ship` (merge + release).

> **触发**：`/tinkerman verify <topic>` / bugfix tier 自动 / `/tinkerman debug` Phase 4
> **输出**：`.tinkerman/findings/<topic>/verify-this/`

## 1. Overview

将"应该可以了"替换为三态证据化结论。每个结论必须附完整的 `[Command] → [Output] → [Claim]` 证据链。

**Not For**：纯文档变更（无可验证运行时行为）/ 无 git 且无 baseline 快照。

## 2. Three-State Verdict

| Verdict | 条件 |
|---------|------|
| `VERIFIED` | treatment 满足 threshold，baseline 不满足，证据链完整 |
| `NOT_VERIFIED` | treatment 不满足 threshold，证据链完整 |
| `INCONCLUSIVE` | 字段缺失 / artifact 缺失 / baseline 不可解析 |

## 3. Execution Flow

1. Write Falsifiable_Claim → `claim.md`（condition/metric/threshold 必填）
2. Validate claim → 任一为空则 INCONCLUSIVE 中止
3. Resolve baseline → 4 级优先级回退
4. Capture artifacts → baseline/ + treatment/ 各 ≥1 log + ≥1 metric
5. Compute diff → `diff/`
6. Build Evidence Chain → 每个 artifact 一条链
7. Write verdict → `verdict.md`

→ `references/workflow.md`

## 4. Baseline Resolution

`--baseline <ref>` → `merge-base(origin/main)` → `HEAD^` → last treatment snapshot → INCONCLUSIVE

→ `references/baseline-resolution.md`

## 5. Artifact Layout

`claim.md` + `baseline/` + `treatment/` + `diff/` + `verdict.md`

→ `references/artifact-layout.md`（完整 schema、模板引用、invariant）

## 6. Harness Integration

CLI_Harness 和 UI_Harness 产出相同 schema 的 `verdict.md`，Forge_Verify 解析重放不修改结论。

## 7. Concurrency

`.tinkerman/.locks/<topic>.lock` 互斥锁保护并发调用。

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "代码看起来没问题，直接 VERIFIED" | 没有运行验证命令 = 不能声明通过（§2.3） |
| "baseline 和上次一样，跳过 capture" | 每次必须完整捕获 |
| "改动太小不需要 claim" | 所有验证都需要 Falsifiable_Claim |

## Gotchas
- **Vague claim**: "The feature works" → not falsifiable → claims must be specific (input X produces output Y)
- **Self-attestation**: Agent verifies own work without external evidence → bias → require runnable evidence, not assertion
- **Partial verification**: Verify happy path only → edge cases unverified → verify failure paths and boundary conditions
