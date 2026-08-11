---
topic: "skill-behavioral-guardrails"
status: "approved"
date: "2026-05-01"
spec_ref: ".kiro/specs/skill-behavioral-guardrails"
format: "lightweight"
---

## Objective

为 Forge 全部 17 个 SKILL.md 增加两种行为护栏：反合理化表（Common Rationalizations）和反触发条件（Not For）。纯 Markdown 追加，不修改任何 TypeScript 代码。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#1-common-rationalizations-表格式` | 统一的表格格式定义 |
| `design.md#2-not-for-段落格式` | 统一的段落格式定义 |
| `design.md#3-各-skill-反合理化内容设计` | 16 个 SKILL 的定制化反合理化内容 |
| `design.md#4-各-skill-not-for-内容设计` | 17 个 SKILL 的反触发条件 |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `skills/forge-router/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-spec/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-plan/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-build/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-build-light/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-review/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-test/SKILL.md` | MODIFY | Add Not For only (already has §3.4) |
| `skills/forge-ship/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-decide/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-learn/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-debug/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-resume/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-abort/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-status/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-loop/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-fix/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |
| `skills/forge-refactor/SKILL.md` | MODIFY | Add Not For + Common Rationalizations |

## Task Breakdown

### Task 1: Add Not For paragraphs to all 17 SKILLs

- **Goal**: Insert "Not For" paragraph immediately after Overview section in all 17 SKILL.md files
- **File**: All 17 `skills/forge-*/SKILL.md`
- **Design Reference**: `design.md#4-各-skill-not-for-内容设计` — 每个 SKILL 的反触发条件清单
- **Depends On**: (none)
- **Verify**: `grep -rl "Not For" skills/forge-*/SKILL.md | wc -l` returns 17
- **Commit**: `feat(skills): add Not For anti-trigger paragraphs to all 17 SKILLs`

Insertion points (line before next ## section):

| SKILL | Insert after line |
|-------|-------------------|
| forge-abort | 22 |
| forge-build-light | 22 |
| forge-build | 22 |
| forge-debug | 24 |
| forge-decide | 24 |
| forge-fix | 24 |
| forge-learn | 22 |
| forge-loop | 24 |
| forge-plan | 22 |
| forge-refactor | 24 |
| forge-resume | 24 |
| forge-review | 22 |
| forge-router | 26 |
| forge-ship | 24 |
| forge-spec | 22 |
| forge-status | 20 |
| forge-test | 22 |

### Task 2: Add Common Rationalizations to 6 core SKILLs (≥3 rows each)

- **Goal**: Add Common Rationalizations table to forge-spec, forge-plan, forge-build, forge-review, forge-ship, forge-decide
- **File**: 6 core SKILL.md files
- **Design Reference**: `design.md#3-各-skill-反合理化内容设计` — 每个 SKILL 的定制化反合理化表
- **Depends On**: (none, can run parallel with Task 1)
- **Verify**: Each file contains a `## Common Rationalizations` section with ≥3 table rows
- **Commit**: `feat(skills): add Common Rationalizations to 6 core execution SKILLs`

Insertion points:

| SKILL | Insert after | Location |
|-------|-------------|----------|
| forge-spec | Known AI Failure Modes (end of file ~456) | After failure patterns |
| forge-plan | Known AI Failure Modes (end of file ~507) | After failure patterns |
| forge-build | Known AI Failure Patterns (~523) | After failure patterns |
| forge-review | Known AI Failure Modes (~423) | After failure patterns |
| forge-ship | Edge Case Handling (~153) | Before edge cases |
| forge-decide | Edge Case Handling (~197) | Before edge cases |

### Task 3: Add Common Rationalizations to 6 auxiliary SKILLs (≥3 rows each)

- **Goal**: Add Common Rationalizations table to forge-learn, forge-debug, forge-resume, forge-abort, forge-status, forge-loop
- **File**: 6 auxiliary SKILL.md files
- **Design Reference**: `design.md#3-各-skill-反合理化内容设计` — 辅助阶段定制内容
- **Depends On**: (none, can run parallel with Task 1 & 2)
- **Verify**: Each file contains a `## Common Rationalizations` section with ≥3 table rows
- **Commit**: `feat(skills): add Common Rationalizations to 6 auxiliary SKILLs`

Insertion points:

| SKILL | Insert before | Location |
|-------|--------------|----------|
| forge-learn | Edge Case Handling (~344) | Before edge cases |
| forge-debug | Edge Case Handling (~125) | Before edge cases |
| forge-resume | 边界情况处理 (~111) | Before edge cases |
| forge-abort | 边界情况处理 (~94) | Before edge cases |
| forge-status | 边界情况处理 (~66) | Before edge cases |
| forge-loop | Edge Case Handling (~318) | Before edge cases |

### Task 4: Add Common Rationalizations to 3 lightweight SKILLs (≥2 rows each)

- **Goal**: Add Common Rationalizations table to forge-build-light, forge-fix, forge-refactor
- **File**: 3 lightweight SKILL.md files
- **Design Reference**: `design.md#forge-build-light--forge-fix--forge-refactor轻量变体各-2-行` — 轻量变体定制内容
- **Depends On**: (none, can run parallel with Task 1-3)
- **Verify**: Each file contains a `## Common Rationalizations` section with ≥2 table rows
- **Commit**: `feat(skills): add Common Rationalizations to 3 lightweight SKILLs`

Insertion points:

| SKILL | Insert before/after | Location |
|-------|-------------------|----------|
| forge-build-light | End of file (~61) | Append |
| forge-fix | End of file (~169) | After 已知 AI 失败模式 |
| forge-refactor | End of file (~226) | After 已知 AI 失败模式 |

### Task 5: Verify consistency and run contract tests

- **Goal**: Verify all 17 SKILLs have both sections, forge-test rationalizations untouched, contract tests pass
- **File**: None (verification only)
- **Design Reference**: `design.md#testing-strategy` — 验证方式
- **Depends On**: Task 1, Task 2, Task 3, Task 4
- **Verify**: `npm run check`
- **Commit**: (no commit — verification step)

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| Req 1: Core SKILL rationalizations (≥3 rows, 6 files) | Task 2 |
| Req 2: Auxiliary + lightweight rationalizations (≥3/2 rows) | Task 3, Task 4 |
| Req 3: Not For paragraphs (all 17 files) | Task 1 |
| Req 4: Content quality & consistency (format, placement, existing content) | Task 5 |
| Req 4.5: forge-test NOT modified for rationalizations | Task 2/3/4 (excluded) |
| Req 4.6: contract.test.ts passes | Task 5 |
