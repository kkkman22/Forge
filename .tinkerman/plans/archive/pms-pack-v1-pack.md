---
topic: "pms-pack-v1-pack"
status: "approved"
date: "2026-05-09"
spec_ref: ".kiro/specs/pms-pack-v1"
parent_plan: "pms-pack-v1"
format: "lightweight"
---

# Plan: PMS Pack v1 — Pack 内容（Phase 6-9）

> 来源: 拆分自 `.tinkerman/plans/pms-pack-v1.md`（用户选择 split-into-3）

## Objective

交付 PMS Domain Pack 全量内容：Pack 骨架（manifest + contexts + map）、分 Context Glossary、禁用词清单、4 个核心状态机 YAML、BusinessDayClock 工具。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#31-packsppmspackyaml` | PMS Pack manifest 含 feature_flags |
| `design.md#32-state-machine-definition-schema` | YAML 状态机 schema |
| `design.md#47-packspmsutilsbusiness-day-clockts` | BusinessDayClock 实现 |

## File Mapping

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `packs/pms/pack.yaml` | CREATE | PMS Pack manifest |
| `packs/pms/README.md` | CREATE | PMS Pack 文档 |
| `packs/pms/contexts/_map.yaml` | CREATE | Context Map |
| `packs/pms/contexts/reservations.md` | CREATE | Reservations BC |
| `packs/pms/contexts/front-desk.md` | CREATE | Front Desk BC |
| `packs/pms/contexts/housekeeping.md` | CREATE | Housekeeping BC |
| `packs/pms/contexts/folio-billing.md` | CREATE | Folio Billing BC |
| `packs/pms/contexts/night-audit.md` | CREATE | Night Audit BC |
| `packs/pms/contexts/rate-inventory.md` | CREATE | Rate Inventory BC |
| `packs/pms/contexts/channel-integration.md` | CREATE | Channel Integration BC |
| `packs/pms/contexts/reporting.md` | CREATE | Reporting BC |
| `packs/pms/glossary/_shared.md` | CREATE | 跨 Context 共享术语 |
| `packs/pms/glossary/reservations.md` | CREATE | Reservations 术语 |
| `packs/pms/glossary/front-desk.md` | CREATE | Front Desk 术语 |
| `packs/pms/glossary/housekeeping.md` | CREATE | Housekeeping 术语 |
| `packs/pms/glossary/folio-billing.md` | CREATE | Folio Billing 术语 |
| `packs/pms/glossary/night-audit.md` | CREATE | Night Audit 术语 |
| `packs/pms/glossary/rate-inventory.md` | CREATE | Rate Inventory 术语 |
| `packs/pms/glossary/channel-integration.md` | CREATE | Channel Integration 术语 |
| `packs/pms/glossary/reporting.md` | CREATE | Reporting 术语 |
| `packs/pms/banned-patterns.yaml` | CREATE | PMS 禁用词 |
| `packs/pms/state-machines/reservation.yaml` | CREATE | Reservation 状态机 |
| `packs/pms/state-machines/folio.yaml` | CREATE | Folio 状态机 |
| `packs/pms/state-machines/room-status.yaml` | CREATE | RoomStatus 状态机 |
| `packs/pms/state-machines/housekeeping-task.yaml` | CREATE | HousekeepingTask 状态机 |
| `packs/pms/utils/business-day-clock.ts` | CREATE | BusinessDayClock 类 |
| `packs/pms/utils/business-day-clock.test.ts` | CREATE | BusinessDayClock 测试 |

## Task Breakdown

### Phase 6: PMS Pack 骨架

#### Task 1: PMS Pack manifest 与 README
- **Goal**: 创建 pack.yaml 含完整 feature_flags + README.md
- **File**: `packs/pms/pack.yaml`, `packs/pms/README.md`
- **Design Reference**: `design.md#31-packsppmspackyaml` — manifest schema 含 forced_acceptance_contexts / mutation_critical_modules / business_day_defaults
- **Depends On**: (none)
- **Verify**: `npx vitest run test/pack/`
- **Commit**: `feat(pms-pack): add pack manifest and README`

#### Task 2: 8 个 Bounded Context 文档
- **Goal**: 创建 8 个 context markdown 文件含完整 frontmatter 和 150-300 字 body
- **File**: `packs/pms/contexts/*.md` (8 files)
- **Design Reference**: R1.2 — 每文件含 name / responsibility / aggregates / inbound_events / outbound_events / upstream / downstream
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/pack/`
- **Commit**: `feat(pms-pack): add 8 bounded context documents`

#### Task 3: Context Map 声明
- **Goal**: 创建 _map.yaml 声明 ≥6 条边覆盖 4 种关系类型
- **File**: `packs/pms/contexts/_map.yaml`
- **Design Reference**: R1.3 — partnership / customer-supplier / acl / open-host
- **Depends On**: Task 2
- **Verify**: `npx vitest run test/pack/`
- **Commit**: `feat(pms-pack): add context map with 6+ edges`

### Phase 7: Glossary 与禁用词

#### Task 4: 分 Context Glossary
- **Goal**: 创建 9 个 glossary 文件含 ≥10 terms/context，Room/Guest 在 3+ context 分别定义，含中文 aliases
- **File**: `packs/pms/glossary/*.md` (9 files)
- **Design Reference**: R2.1-2.6
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/pack/`
- **Commit**: `feat(pms-pack): add context-specific glossary files`

#### Task 5: PMS 禁用词清单
- **Goal**: 创建 banned-patterns.yaml 含 4 类别，每类至少 3 条 regex
- **File**: `packs/pms/banned-patterns.yaml`
- **Design Reference**: R3.1-3.7 — code / infrastructure / framework / technical
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/pack/`
- **Commit**: `feat(pms-pack): add banned patterns for PMS domain`

### Phase 8: PMS 状态机

#### Task 6: Reservation 状态机
- **Goal**: 定义 6 states + ≥10 transitions + ≥3 invariants
- **File**: `packs/pms/state-machines/reservation.yaml`
- **Design Reference**: `design.md#32-state-machine-definition-schema` — Booked/Confirmed/CheckedIn/CheckedOut/NoShow/Cancelled
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/state-machine/` (validateDefinition 通过)
- **Commit**: `feat(pms-pack): add reservation state machine definition`

#### Task 7: Folio 状态机
- **Goal**: 定义 4 states + ≥6 transitions + closed-then-void-only invariant
- **File**: `packs/pms/state-machines/folio.yaml`
- **Design Reference**: R5.3 — Open/Posted/Closed/Voided
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/state-machine/`
- **Commit**: `feat(pms-pack): add folio state machine definition`

#### Task 8: RoomStatus 状态机
- **Goal**: 定义 7 states + transitions 覆盖 check-in/out/housekeeping/inspection/maintenance
- **File**: `packs/pms/state-machines/room-status.yaml`
- **Design Reference**: R5.4
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/state-machine/`
- **Commit**: `feat(pms-pack): add room status state machine definition`

#### Task 9: HousekeepingTask 状态机
- **Goal**: 定义 4 states + Skipped 从任何非终态可达
- **File**: `packs/pms/state-machines/housekeeping-task.yaml`
- **Design Reference**: R5.5
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/state-machine/`
- **Commit**: `feat(pms-pack): add housekeeping task state machine definition`

### Phase 9: BusinessDayClock

#### Task 10: BusinessDayClock 实现
- **Goal**: 实现 getBusinessDay / nextCutoff / isSameBusinessDay / addBusinessDays + withBusinessDay fixture
- **File**: `packs/pms/utils/business-day-clock.ts`, `packs/pms/utils/business-day-clock.test.ts`
- **Design Reference**: `design.md#47-packspmsutilsbusiness-day-clockts` — Intl.DateTimeFormat，无 moment/date-fns，不内部 new Date()
- **Property**: fast-check 反身对称 / 零 delta 不变 / round-trip
- **Depends On**: (none)
- **Verify**: `npx vitest run packs/pms/utils/business-day-clock.test.ts`
- **Commit**: `feat(pms-pack): implement BusinessDayClock with DST support`

## Spec Coverage

| Spec Requirement | Covering Tasks |
|------------------|----------------|
| R1 PMS Pack 骨架 | Task 1, 2, 3 |
| R2 分 Context 语言 | Task 4 |
| R3 禁用词清单 | Task 5 |
| R5 PMS 4 状态机 | Task 6, 7, 8, 9 |
| R8 PMS Mutation 集成 | Task 1 (feature_flags) |
| R12 BusinessDayClock | Task 10 |

## Inter-Plan Dependencies

- **上游**: 依赖 `pms-pack-v1-core` Task 2 (state-machine loader) 用于 Task 6-9 状态机 YAML 验证
- **下游**: `pms-pack-v1-scenarios` 依赖本 plan 全部完成（glossary + banned-patterns + state-machines）
