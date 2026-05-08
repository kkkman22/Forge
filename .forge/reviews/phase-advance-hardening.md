---
topic: "phase-advance-hardening"
date: "2026-05-09"
result: "pass"
reviewed_at_commit: "1f8beb38c3766d23891d8cd51523202e420778d5"
p0_count: 0
p1_count: 0
p2_count: 5
p3_count: 7
layers:
  - "spec-check"
  - "quality-check"
  - "security-check"
---

## Review Summary

三层并行评审完成。无 P0/P1 阻断问题。P2 以代码重构建议为主，不阻断 ship。

## Layer 1 — Spec 对齐

9 个 Requirements 全部被实现覆盖。无 scope creep。Spec 约束（Zero-SKILL-contract-change、Zero-runtime-dependency、Zero-regression）均满足。

## Layer 2 — 代码质量

| Severity | File | Finding |
|----------|------|---------|
| P2 | scripts/persistent-loop.sh | 重复 pending 计算逻辑（3处），建议提取 `count_pending_tasks` |
| P2 | scripts/persistent-loop.sh | Case 5-9 重复 hash+dedupe 模式，建议提取 `should_inject_advance` |
| P2 | scripts/persistent-loop.sh | Case 10 函数较长（29行），可拆分子函数 |
| P2 | scripts/lint-evolved-rules.mjs | 错误提示不够友好 |
| P2 | src/plan.ts | normalizeTaskTerms 线性遍历性能（pre-existing，非本 spec 引入） |

评审者标记 4 项 P1，经审查均不符合 P1 标准：
- `checkPlanStructure` 参数验证：TypeScript 类型系统保证，降 P3
- `compute_phase_state_hash` find_latest 失败：stat_mtime 返回 "0" 是设计行为
- `check_and_mark_dedupe` mkdir fail-open：spec Requirement 4.4 明确要求 fail-open
- `remove_field` 返回值：既有代码，不在本 spec 范围

## Layer 3 — 安全

无安全发现。shell 脚本不使用 eval/exec，变量引用通过双引号保护，path traversal 通过 read_field 的 grep 模式转义防护。dedupe marker 目录在 .gitignore 中排除。

## P2/P3 Findings (不阻断 ship)

P2 建议作为后续重构处理（提取公共函数、拆分长函数）。P3 建议补充魔法数字常量化和和边界测试。
