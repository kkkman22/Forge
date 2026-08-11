---
topic: "pms-pack-v1-scenarios"
status: "approved"
date: "2026-05-09"
spec_ref: ".kiro/specs/pms-pack-v1"
parent_plan: "pms-pack-v1"
format: "lightweight"
---

# Plan: PMS Pack v1 — 场景、Init 与集成（Phase 10-13）

> 来源: 拆分自 `.tinkerman/plans/pms-pack-v1.md`（用户选择 split-into-3）

## Objective

交付 PMS 20 个预置 Gherkin 场景、init.sh --pack 扩展、Zero-Pack 回归测试扩展、PMS 集成测试、文档更新与 smoke test。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#53-forge-init---packpms` | Init --pack 流程 |
| `design.md#62-property-tests` | 集成测试覆盖 |
| `design.md#63-integration-tests` | PMS Pack 集成测试 |

## File Mapping

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `packs/pms/scenarios/check-in/*.feature` | CREATE | 5 个 Check-in 场景 |
| `packs/pms/scenarios/check-out/*.feature` | CREATE | 3 个 Check-out 场景 |
| `packs/pms/scenarios/night-audit/*.feature` | CREATE | 4 个 Night Audit 场景 |
| `packs/pms/scenarios/reservation/*.feature` | CREATE | 4 个 Reservation 场景 |
| `packs/pms/scenarios/folio/*.feature` | CREATE | 4 个 Folio 场景 |
| `scripts/init.sh` | MODIFY | --pack 参数 + PMS 交互 |
| `test/pack/zero-pack-invariant.test.ts` | MODIFY | Zero-Pack 回归扩展 |
| `test/pms-pack/integration.test.ts` | CREATE | PMS 集成测试 |
| `test/pms-pack/fixtures/**/*` | CREATE | 测试 fixtures |
| `README.md` | MODIFY | PMS Pack 章节 |
| `CHANGELOG.md` | MODIFY | Sprint 2 变更 |
| `.tinkerman/knowledge/adr-index.md` | MODIFY | ADR 条目 |
| `.tinkerman/decisions/ADR-NNNN-pms-pack-v1.md` | CREATE | ADR 文档 |

## Task Breakdown

### Phase 10: PMS 预置场景

#### Task 1: Check-in 场景（5 个）
- **Goal**: walk-in / early-arrival / late-arrival / group-check-in / payment-failure 场景
- **File**: `packs/pms/scenarios/check-in/*.feature` (5 files)
- **Design Reference**: R14.1, R14.4 — 含 Given/When/Then 完整结构
- **Depends On**: (none，但需 Pack 的 banned-patterns 用于 Leak Detector 校验)
- **Verify**: Scenario Linter pass + Leak Detector empty
- **Commit**: `feat(pms-pack): add 5 check-in scenarios`

#### Task 2: Check-out 场景（3 个）
- **Goal**: express-checkout / late-checkout-with-fee / dispute 场景
- **File**: `packs/pms/scenarios/check-out/*.feature` (3 files)
- **Design Reference**: R14.4
- **Depends On**: (same as Task 1)
- **Verify**: Scenario Linter pass + Leak Detector empty
- **Commit**: `feat(pms-pack): add 3 check-out scenarios`

#### Task 3: Night Audit 场景（4 个）
- **Goal**: normal-run / no-show-processing / room-move-reconciliation / interrupted-resumed
- **File**: `packs/pms/scenarios/night-audit/*.feature` (4 files)
- **Design Reference**: R14.4
- **Depends On**: (same as Task 1)
- **Verify**: Scenario Linter pass + Leak Detector empty
- **Commit**: `feat(pms-pack): add 4 night audit scenarios`

#### Task 4: Reservation 场景（4 个）
- **Goal**: individual / group / modification / cancellation-within-policy
- **File**: `packs/pms/scenarios/reservation/*.feature` (4 files)
- **Design Reference**: R14.4
- **Depends On**: (same as Task 1)
- **Verify**: Scenario Linter pass + Leak Detector empty
- **Commit**: `feat(pms-pack): add 4 reservation scenarios`

#### Task 5: Folio 场景（4 个）
- **Goal**: charge-posting / split-folio / tax-adjustment / deposit-refund
- **File**: `packs/pms/scenarios/folio/*.feature` (4 files)
- **Design Reference**: R14.4
- **Depends On**: (same as Task 1)
- **Verify**: Scenario Linter pass + Leak Detector empty
- **Commit**: `feat(pms-pack): add 4 folio scenarios`

#### Task 6: 场景质量校验
- **Goal**: 所有 20 场景通过 SCN001-SCN004 + Leak Detector
- **File**: (verification)
- **Design Reference**: R14.2, R14.3, R14.5 — 每场景含业务 context comment block
- **Depends On**: Task 1, 2, 3, 4, 5
- **Verify**: `npx vitest run test/pms-pack/`
- **Commit**: `test(pms-pack): validate all 20 scenarios pass linter and leak detector`

### Phase 11: Init Template 扩展

#### Task 7: init.sh --pack 参数支持
- **Goal**: 解析 multi-valued --pack 参数，写入 config.md frontmatter
- **File**: `scripts/init.sh`
- **Design Reference**: `design.md#53-forge-init---packpms` — 幂等、不存在 warn 继续
- **Depends On**: (none)
- **Verify**: `bash scripts/init.sh --help` 显示 --pack
- **Commit**: `feat(init): add --pack flag for pack enablement during init`

#### Task 8: PMS 专属交互流程
- **Goal**: --pack pms 时提示 cutoff_hour/timezone，创建 .tinkerman/custom/，打印欢迎消息
- **File**: `scripts/init.sh`
- **Design Reference**: R13.2, R13.3 — 交互提示含默认值
- **Depends On**: Task 7
- **Verify**: `echo -e "4\nAsia/Shanghai" | bash scripts/init.sh --pack pms`
- **Commit**: `feat(init): add PMS-specific interactive prompts`

### Phase 12: Zero-Pack 回归 + 集成测试

#### Task 9: Zero-Pack 回归扩展
- **Goal**: 扩展 zero-pack-invariant.test.ts 覆盖 accept-gate / mutate / micro-review / state-machine 空输入
- **File**: `test/pack/zero-pack-invariant.test.ts`
- **Design Reference**: R15.4
- **Depends On**: (依赖 Core plan 的 accept-gate / mutate / micro-review / state-machine 已实现)
- **Verify**: `npx vitest run test/pack/zero-pack-invariant.test.ts`
- **Commit**: `test(zero-pack): extend regression for Sprint 2 engines`

#### Task 10: PMS Pack 集成测试
- **Goal**: detectSpecLeak + detectContextTermMismatch + 4 状态机 property 派生编译
- **File**: `test/pms-pack/integration.test.ts`, `test/pms-pack/fixtures/**/*`
- **Design Reference**: `design.md#63-integration-tests`
- **Depends On**: Task 6 (场景校验)
- **Verify**: `npx vitest run test/pms-pack/`
- **Commit**: `test(pms-pack): add integration tests for leak detection and state machines`

### Phase 13: 文档与发布验证

#### Task 11: 文档更新与 smoke test
- **Goal**: 更新 README/CHANGELOG/ADR，运行完整验证
- **File**: `README.md`, `CHANGELOG.md`, `.tinkerman/knowledge/adr-index.md`, `.tinkerman/decisions/ADR-NNNN-pms-pack-v1.md`
- **Design Reference**: 全部 Exit Criteria
- **Depends On**: all previous tasks
- **Verify**: `npm run check && bash scripts/check-iron-laws.sh`
- **Commit**: `docs(pms-pack): add README section, CHANGELOG, and ADR`

## Spec Coverage

| Spec Requirement | Covering Tasks |
|------------------|----------------|
| R13 Init Template | Task 7, 8 |
| R14 预置场景 | Task 1, 2, 3, 4, 5, 6 |
| R15 NFR (zero-pack/integration) | Task 9, 10 |
| R1.5 README | Task 11 |
| R15.6 CI 集成 | Task 10 |

## Inter-Plan Dependencies

- **上游**: 依赖 `pms-pack-v1-core` 全部完成（accept-gate / mutate / micro-review / state-machine / iron-laws）
- **上游**: 依赖 `pms-pack-v1-pack` 全部完成（glossary / banned-patterns / state-machines / BusinessDayClock）
- 本 plan 是最后一个执行的子 plan
