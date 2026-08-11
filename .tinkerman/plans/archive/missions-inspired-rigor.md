---
topic: "missions-inspired-rigor"
status: "approved"
date: "2026-05-16"
spec_ref: ".tinkerman/specs/missions-inspired-rigor/spec.md"
format: "full"
---

# Plan: Missions-inspired Rigor

> 来源: `.tinkerman/specs/missions-inspired-rigor/tasks.md`

## Objective

把 Factory Missions 演讲四条设计原则落地到 Forge：R1 Validation Contract 前置、R2 原子任务 5 字段 Handoff、R3 Validator 累积知识、R4 Mission-grade Loop。四条可独立合并。

## Research Findings

- **R1 校验脚本需新建**：无现存 contract 校验工具
- **R2 handoff parser 需新建**：`src/handoff-schema.ts` 不存在
- **R3 known-failures 基础设施需新建**：`src/known-failures.ts` + `.tinkerman/knowledge/known-failures.md` 不存在
- **R4 events-cursor 需新建**：`src/events-cursor.ts` 不存在
- **forge-spec SKILL 需修改**：加入 contract 起草模板 + lock 校验
- **spec-check agent 需修改**：Step 0.5 contract 提取
- **forge-build SKILL 需修改**：Section 3.5 handoff + Self-Check 增量
- **三个 review agent 需修改**：Step 0.5 known-failures + Output Format append-block
- **forge-review SKILL 需修改**：Section 4.5 known-failures 累积
- **forge-loop SKILL 需修改**：Section 4.X fresh-context + events.ndjson 增强
- **forge-resume SKILL 需修改**：events.ndjson cursor 恢复

## File Mapping

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `scripts/check-spec-contract.sh` | CREATE | spec contract 校验 shell 入口 |
| `scripts/check-spec-contract.js` | CREATE | contract 校验逻辑（markdown AST 解析 AC 字段） |
| `scripts/mark-legacy-contracts.sh` | CREATE | 批量为旧 spec 加 contract_legacy 标记 |
| `skills/forge-spec/templates/requirements.md.template` | CREATE | spec 起草模板含 Verify-By/Evidence |
| `src/handoff-schema.ts` | CREATE | 5 字段 handoff 解析 + 校验 |
| `src/known-failures.ts` | CREATE | known-failures append-block 生成、解析、去重合并 |
| `src/events-cursor.ts` | CREATE | events.ndjson 解析、容错、cursor 提取 |
| `test/forge-spec/contract-validation.test.ts` | CREATE | R1: contract 校验测试 |
| `test/forge-build/handoff-schema.test.ts` | CREATE | R2: handoff schema 测试 |
| `test/forge-review/known-failures-append.test.ts` | CREATE | R3: append-block 测试 |
| `test/forge-review/known-failures-recurrence.test.ts` | CREATE | R3: recurrence 测试 |
| `test/forge-resume/events-cursor-resume.test.ts` | CREATE | R4: cursor resume 测试 |
| `skills/forge-spec/SKILL.md` | MODIFY | contract 起草模板 + lock 校验 |
| `.claude/agents/spec-check.md` | MODIFY | Step 0.5 contract 提取 + P1 contract incomplete |
| `skills/forge-build/SKILL.md` | MODIFY | Section 3.5 handoff + 3.6 读取 handoff |
| `skills/forge-build/references/self-check.md` | MODIFY | handoff 校验项 |
| `.claude/agents/quality-check.md` | MODIFY | Step 0.5 + Output Format append-block |
| `.claude/agents/security-check.md` | MODIFY | Step 0.5 + Output Format append-block |
| `skills/forge-review/SKILL.md` | MODIFY | Section 4.5 known-failures 累积 |
| `skills/forge-loop/SKILL.md` | MODIFY | Section 4.X fresh-context + events.ndjson 增强 |
| `skills/forge-resume/SKILL.md` | MODIFY | events.ndjson cursor 恢复 |

## Tasks

### Task 1: R1 contract-validation.test.ts（RED）

**Depends On**: []
**Files**:
- Create: `test/forge-spec/contract-validation.test.ts`

**TDD**: RED — 5+ test cases all fail

### Task 2: R1 实现 contract 校验 + spec SKILL + spec-check agent（GREEN）

**Depends On**: ["1"]
**Files**:
- Create: `scripts/check-spec-contract.sh`, `scripts/check-spec-contract.js`, `skills/forge-spec/templates/requirements.md.template`
- Modify: `skills/forge-spec/SKILL.md`, `.claude/agents/spec-check.md`

### Task 3: R1 批量 legacy 标记

**Depends On**: ["2"]
**Files**:
- Create: `scripts/mark-legacy-contracts.sh`

### Task 4: R2 handoff-schema.test.ts（RED）

**Depends On**: []
**Files**:
- Create: `test/forge-build/handoff-schema.test.ts`

### Task 5: R2 实现 handoff schema + build SKILL + self-check（GREEN）

**Depends On**: ["4"]
**Files**:
- Create: `src/handoff-schema.ts`
- Modify: `skills/forge-build/SKILL.md`, `skills/forge-build/references/self-check.md`

### Task 6: R3 known-failures-append.test.ts（RED）

**Depends On**: ["1"]
**Files**:
- Create: `test/forge-review/known-failures-append.test.ts`

### Task 7: R3 known-failures-recurrence.test.ts（RED）

**Depends On**: ["1"]
**Files**:
- Create: `test/forge-review/known-failures-recurrence.test.ts`

### Task 8: R3 实现 known-failures + 三个 review agent + review SKILL（GREEN）

**Depends On**: ["6", "7"]
**Files**:
- Create: `src/known-failures.ts`
- Modify: `.claude/agents/spec-check.md`, `.claude/agents/quality-check.md`, `.claude/agents/security-check.md`, `skills/forge-review/SKILL.md`

### Task 9: R4 events-cursor-resume.test.ts（RED）

**Depends On**: ["3", "5", "8"]
**Files**:
- Create: `test/forge-resume/events-cursor-resume.test.ts`

### Task 10: R4 forge-loop SKILL fresh-context + events.ndjson 增强（GREEN）

**Depends On**: ["9"]
**Files**:
- Create: `src/events-cursor.ts`
- Modify: `skills/forge-loop/SKILL.md`

### Task 11: R4 forge-resume SKILL + 端到端验证（GREEN）

**Depends On**: ["9"]
**Files**:
- Modify: `skills/forge-resume/SKILL.md`

### Task 12: Dogfooding

**Depends On**: ["10", "11"]
**Verify-By**: manual

### Task 13: ROADMAP 更新

**Depends On**: ["12"]
**Verify-By**: bash
