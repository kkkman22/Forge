---
topic: "token-language-optimization"
spec_ref: ".kiro/specs/token-language-optimization"
status: "approved"
created: "2026-04-30"
approved: "2026-04-30"
format: "lightweight"
---

# Plan: Token Language Optimization

> 来源: `.kiro/specs/token-language-optimization/tasks.md`

## Objective

通过两个独立策略优化 Forge 的 BPE token 消耗：P3（条件 SKILL 加载，为轻量路径加载精简 build SKILL）和 P2（混合语言策略，将结构性内容转为英文）。P3 先行（代码变更，可属性测试），P2 随后（纯文档变更）。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#p3-conditional-skill-loading` | SkillPhase 扩展、命令序列更新、状态机扩展 |
| `design.md#p2-mixed-language-strategy` | 28 文件的结构性内容英文转换规则 |
| `design.md#components-and-interfaces` | SkillPhase 类型、SKILL_COMMAND_SEQUENCES、COMMITABLE_PHASES、forge-build-light SKILL 结构 |
| `design.md#correctness-properties` | Property 1-4 定义（命令序列、状态转换、提交策略、SKILL 映射） |
| `design.md#error-handling` | P3/P2 错误场景和回滚策略 |
| `design.md#testing-strategy` | 属性测试配置、单元测试、契约测试检查点协议 |

## File Mapping

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/skill-scheduler.ts` | MODIFY | 添加 `"build-light"` 到 SkillPhase、SKILL_COMMAND_SEQUENCES.light、COMMITABLE_PHASES、determineNextSkill() |
| `test/skill-scheduler.test.ts` | MODIFY | 更新 light tier 断言为 `["build-light", "review"]`，新增 build-light 单元测试 |
| `test/skill-scheduler-p3.property.test.ts` | CREATE | P3 属性测试（Property 1-4） |
| `skills/forge-build-light/SKILL.md` | CREATE | 轻量 build SKILL（≤4,000 chars） |
| `skills/forge-build/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-learn/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-plan/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-review/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-spec/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-loop/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-router/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-refactor/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-test/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-debug/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-fix/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-decide/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-ship/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-status/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-resume/SKILL.md` | MODIFY | P2 混合语言转换 |
| `skills/forge-abort/SKILL.md` | MODIFY | P2 混合语言转换 |
| `CLAUDE.md` | MODIFY | P2 混合语言转换 |
| `templates/CLAUDE.md` | MODIFY | P2 混合语言转换 |
| `agents/architect.md` | MODIFY | P2 混合语言转换 |
| `agents/critic.md` | MODIFY | P2 混合语言转换 |
| `agents/debugger.md` | MODIFY | P2 混合语言转换 |
| `agents/designer.md` | MODIFY | P2 混合语言转换 |
| `agents/explore.md` | MODIFY | P2 混合语言转换 |
| `agents/product.md` | MODIFY | P2 混合语言转换 |
| `agents/quality-check.md` | MODIFY | P2 混合语言转换 |
| `agents/security-check.md` | MODIFY | P2 混合语言转换 |
| `agents/security.md` | MODIFY | P2 混合语言转换 |
| `agents/spec-check.md` | MODIFY | P2 混合语言转换 |

## Task Breakdown

### Task 1: Add "build-light" to SkillPhase and update constants
- **Goal**: Extend SkillPhase union type, update light tier command sequence, and add to COMMITABLE_PHASES
- **File**: `src/skill-scheduler.ts`
- **Design Reference**: `design.md#components-and-interfaces` — SkillPhase 类型扩展、命令序列更新、COMMITABLE_PHASES 更新
- **Property**: Property 1, Property 3
- **Depends On**: (none)
- **Verify**: `npx tsc --noEmit`
- **Commit**: `feat(scheduler): add build-light phase for conditional SKILL loading`

### Task 2: Add "build-light" case in determineNextSkill()
- **Goal**: Add state machine transition logic for build-light phase (mirrors build phase)
- **File**: `src/skill-scheduler.ts`
- **Design Reference**: `design.md#components-and-interfaces` §4 State Machine Extension
- **Property**: Property 2
- **Depends On**: Task 1
- **Verify**: `npx tsc --noEmit`
- **Commit**: `feat(scheduler): add build-light state machine transitions`

### Task 3: Update existing unit tests for build-light
- **Goal**: Update light tier assertion and add build-light unit tests in existing test file
- **File**: `test/skill-scheduler.test.ts`
- **Design Reference**: `design.md#testing-strategy` — Unit tests table
- **Property**: (covered by Task 5 property tests)
- **Depends On**: Task 2
- **Verify**: `npx vitest run test/skill-scheduler.test.ts`
- **Commit**: `test(scheduler): update light tier and add build-light unit tests`

### Task 4: Create forge-build-light SKILL file
- **Goal**: Create lightweight build SKILL with frontmatter, §1 Overview, §2 Light Path, §3-5 reference directives (≤4,000 chars)
- **File**: `skills/forge-build-light/SKILL.md`
- **Design Reference**: `design.md#components-and-interfaces` §5 forge-build-light SKILL File
- **Property**: (validated by contract tests)
- **Depends On**: (none)
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` && `wc -c skills/forge-build-light/SKILL.md`
- **Commit**: `feat(skills): add forge-build-light lightweight SKILL`

### Task 5: Create P3 property-based tests
- **Goal**: Create property test file with Property 1-4 using fast-check
- **File**: `test/skill-scheduler-p3.property.test.ts`
- **Design Reference**: `design.md#correctness-properties` — Property 1-4 definitions; `design.md#testing-strategy` — Property test configuration
- **Property**: Property 1, 2, 3, 4
- **Depends On**: Task 2
- **Verify**: `npx vitest run test/skill-scheduler-p3.property.test.ts`
- **Commit**: `test(scheduler): add P3 property-based tests for build-light`

### Task 6: P3 final validation
- **Goal**: Run full CI to verify P3 has no regressions
- **File**: (no file changes, validation only)
- **Design Reference**: `design.md#testing-strategy` — P3 checkpoints
- **Property**: (all)
- **Depends On**: Task 3, Task 4, Task 5
- **Verify**: `npm run check`
- **Commit**: (no commit — validation step)

### Task 7: P2 batch 1 — Convert forge-build, forge-learn, forge-plan, forge-review
- **Goal**: Apply mixed language strategy to 4 largest SKILL files
- **File**: `skills/forge-build/SKILL.md`, `skills/forge-learn/SKILL.md`, `skills/forge-plan/SKILL.md`, `skills/forge-review/SKILL.md`
- **Design Reference**: `design.md#p2-mixed-language-strategy` — Conversion rules table
- **Depends On**: Task 6
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(skills): convert batch 1 structural content to English (P2)`

### Task 8: P2 batch 2 — Convert forge-spec, forge-loop, forge-router, forge-refactor
- **Goal**: Apply mixed language strategy to next 4 SKILL files
- **File**: `skills/forge-spec/SKILL.md`, `skills/forge-loop/SKILL.md`, `skills/forge-router/SKILL.md`, `skills/forge-refactor/SKILL.md`
- **Design Reference**: `design.md#p2-mixed-language-strategy` — Conversion rules table
- **Depends On**: Task 7
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(skills): convert batch 2 structural content to English (P2)`

### Task 9: P2 batch 3 — Convert forge-test, forge-debug, forge-fix, forge-decide
- **Goal**: Apply mixed language strategy to next 4 SKILL files
- **File**: `skills/forge-test/SKILL.md`, `skills/forge-debug/SKILL.md`, `skills/forge-fix/SKILL.md`, `skills/forge-decide/SKILL.md`
- **Design Reference**: `design.md#p2-mixed-language-strategy` — Conversion rules table
- **Depends On**: Task 8
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(skills): convert batch 3 structural content to English (P2)`

### Task 10: P2 batch 4 — Convert forge-ship, forge-status, forge-resume, forge-abort
- **Goal**: Apply mixed language strategy to remaining 4 SKILL files
- **File**: `skills/forge-ship/SKILL.md`, `skills/forge-status/SKILL.md`, `skills/forge-resume/SKILL.md`, `skills/forge-abort/SKILL.md`
- **Design Reference**: `design.md#p2-mixed-language-strategy` — Conversion rules table
- **Depends On**: Task 9
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(skills): convert batch 4 structural content to English (P2)`

### Task 11: P2 — Convert CLAUDE.md and templates/CLAUDE.md
- **Goal**: Apply mixed language strategy to project constitution and template
- **File**: `CLAUDE.md`, `templates/CLAUDE.md`
- **Design Reference**: `design.md#p2-mixed-language-strategy` — Conversion rules; Requirement 2
- **Depends On**: Task 10
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(claude-md): convert structural content to English (P2)`

### Task 12: P2 — Convert agent definition files
- **Goal**: Apply mixed language strategy to all 10 agent files
- **File**: `agents/architect.md`, `agents/critic.md`, `agents/debugger.md`, `agents/designer.md`, `agents/explore.md`, `agents/product.md`, `agents/quality-check.md`, `agents/security-check.md`, `agents/security.md`, `agents/spec-check.md`
- **Design Reference**: `design.md#p2-mixed-language-strategy` — Conversion rules; Requirement 3
- **Depends On**: Task 11
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(agents): convert structural content to English (P2)`

### Task 13: P2 final validation
- **Goal**: Run full CI + measure BPE token savings
- **File**: (no file changes, validation only)
- **Design Reference**: `design.md#testing-strategy` — P2 checkpoints; Requirement 7
- **Depends On**: Task 12
- **Verify**: `npm run check`
- **Commit**: (no commit — validation step)

## Spec Coverage

| Spec Requirement | Covered Tasks |
|-----------------|---------------|
| Req 1: Convert SKILL files structural content | Task 7, 8, 9, 10 |
| Req 2: Convert CLAUDE.md and template | Task 11 |
| Req 3: Convert agent definitions | Task 12 |
| Req 4: Create forge-build-light SKILL | Task 4 |
| Req 5: Add build-light phase to scheduler | Task 1, 2 |
| Req 6: Map build-light in context accumulator | Task 5 (Property 4 validates auto-mapping) |
| Req 7: Token savings measurement | Task 6, 13 |
| Req 8: Rollback safety via i18n fallback | Task 4 (no changes to skill-resolver/locale-detector) |
| Req 9: Behavioral semantics preservation | Task 7-12 (contract tests validate) |
| Req 10: P2/P3 independence | Task 1-5 (P3 only), Task 7-12 (P2 only), no cross-dependency |

## Dependency Graph

```
Task 1 → Task 2 → Task 3 ──┐
               → Task 5 ──┤→ Task 6 → Task 7 → Task 8 → Task 9 → Task 10 → Task 11 → Task 12 → Task 13
Task 4 ────────────────────┘
```
