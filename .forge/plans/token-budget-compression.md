---
status: approved
created: "2026-04-30"
approved: "2026-04-30"
source: ".kiro/specs/token-budget-compression/tasks.md"
---

# Plan: Token Budget Compression

> 来源: `.kiro/specs/token-budget-compression/tasks.md`

## Objective

压缩 7 个 SKILL 文件 + CLAUDE.md，总 SKILL ≤145K 字符，CLAUDE.md ≤9.5K 字符。

## 执行顺序（按大小降序）

每个文件压缩后运行 checkpoint 验证。

### Task 1: forge-spec SKILL.md (17,499 → ≤12,000)

- §3 Spec template → Canonical Example（保留 greenfield，brownfield 改 one-line diff）
- §8 Full example → Canonical Example（保留 greenfield，brownfield 改 one-line）
- §1.5 Import Mode table → Table Compression（verbose cells → single-line）
- §2 Step 1 input/rules → compact format
- §4 quality + §7 edge cases → 压缩
- Checkpoint: contract tests + `wc -c` ≤ 12,000

### Task 2: forge-loop SKILL.md (14,741 → ≤10,000)

- §4.2 State machine table → Reference Directive to skill-scheduler.ts
- §4.4 Confirmation presets → compact single-column
- §12 Full example → ≤15-line Canonical Example + one-line variants
- §10 Status file format → 移除与 §3 Step 2 重复的 field lifecycle table
- §3 startup flow + §11 edge cases → 压缩
- Checkpoint: contract tests + `wc -c` ≤ 10,000

### Task 3: forge-router SKILL.md (11,693 → ≤8,500)

- §2 Three-tier table → Reference Directive to CLAUDE.md §1，保留 refactor/fix variants
- §6 Classification examples → 1 example/tier，其余 one-line
- §8 Behavior hints → 合并 3 表为 1（Hint | Scope | Trigger）
- §3 Signal details → 压缩
- Checkpoint: contract tests + `wc -c` ≤ 8,500

### Task 4: CLAUDE.md + templates/CLAUDE.md (11,956/11,479 → ≤9,500 each)

- §2.5 Restatement Checkpoint → 2-3 line principle + Reference Directive to forge-build §3.2
- §2.6 Output conciseness → 压缩 Before/After example
- templates/CLAUDE.md 同步相同压缩
- Checkpoint: contract tests + `wc -c` ≤ 9,500 each

### Task 5: forge-refactor SKILL.md (8,544 → ≤6,500)

- §2 Pre-check rejection → 移除 full code block，保留 format reference
- §3.1 Scan output → 保留 table header + 1 row
- §6 Execution flow → ≤6-line numbered step list
- §4 Method library → tighten descriptions
- Checkpoint: contract tests + `wc -c` ≤ 6,500

### Task 6: forge-test SKILL.md (7,930 → ≤6,500)

- §3 Verification rules → Reference Directive to CLAUDE.md §2.3，保留 gate function + false claims table
- §7 Examples → 保留 passing，failing 改 one-line diff
- §2 Layer 3 checklist → 移除 code block，保留 7-item table
- Checkpoint: contract tests + `wc -c` ≤ 6,500

### Task 7: forge-debug SKILL.md (6,748 → ≤5,500)

- §4 Execution flow → ≤6-line numbered step list
- §6 Four-phase example → 保留 Phase 1 + 4，Phase 2-3 改 two-line summaries
- §3 Red flag table → 合并 suggested action 列到 signal description
- Checkpoint: contract tests + `wc -c` ≤ 5,500

### Task 8: forge-fix SKILL.md (6,321 → ≤5,500)

- §2.1 Analysis report template → 移除 code block，保留 heading list
- §4 fix-note template → 移除 code block，保留 field list
- §6 Execution flow → ≤5-line numbered step list
- Checkpoint: contract tests + `wc -c` ≤ 5,500

### Task 9: Final Validation

- Total SKILL `wc -c` sum ≤ 145,000
- CLAUDE.md ≤ 9,500, templates/CLAUDE.md ≤ 9,500
- `npm run check` 通过
- YAML frontmatter 完整性验证

## Dependencies

顺序执行，Task 1-8 互相无依赖但按大小降序处理以尽早发现策略问题。
Task 9 依赖 Task 1-8 全部完成。

## Risk

- **低风险**：纯文档编辑，contract tests 提供安全网
- **注意点**：CLAUDE.md §2.5 压缩需保留 contract test §14 Self-Evolution 断言所需内容
