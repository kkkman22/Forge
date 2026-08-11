---
feature: domain-example-reference-impl
layout: tasks
created: 2026-06-29
updated: 2026-06-29
locked_at: 2026-06-29
plan_locked_at: 2026-06-29
brownfield: true
spec_ref: ".forge/specs/domain-example-reference-impl/requirements.md"
slice: "A（reservation 聚合）"
estimated_total_minutes: 90
wave_structure: "W1[T1,T2] → W2[T3,T4,T5,T6] → W3[T7,T8,T9] → W4[T10,T11]"
---

# Tasks — Domain Example Reference Impl（切片 A）

> 11 个 REQ 拆为 11 个原子任务。每个任务一对 RED-GREEN（TDD vertical slice）。
> Wave 顺序遵循依赖：tsconfig(T1)+errors(T2) 先于 聚合(T3) ；聚合(T3) 先于 事件/仓储/Service(T4-T6)；引擎消费(T7) 与 BDD(T9) 依赖聚合；CI 巡检(T8) 独立；最后回归(T10,T11)。

## 关键 API 事实（design §2.2 已核实）

- `loadStateMachineDefinition(yamlContent: string, filePath?: string): StateMachineDefinition`（`src/state-machine/loader.ts:37`）—— **接收 YAML 字符串，非 pack 名**。
- 返回的 `def.transitions: { from, to, event, guards?, side_effects? }[]`。
- **无 `lookupTransition` 便利函数** —— domain 侧薄封装线性查找（design §2.2 fallback）。
- yaml 文件路径：`packs/pms/state-machines/reservation.yaml`（仓库相对路径）。

## Wave 1：基础设施（独立可测）

### Task 1: src/domain/ 目录 + 独立 tsconfig project ref（REQ-01）
- **Depends On**: []
- **Files**: `src/domain/tsconfig.json` + 根 `tsconfig.json`（exclude 改动）+ `test/domain-tsconfig.test.ts`
- **RED**：新建 `test/domain-tsconfig.test.ts`，断言 (a) `src/domain/tsconfig.json` 存在且 `composite: true`；(b) 根 tsconfig 的 exclude 含 `src/domain/**`；(c) `tsc --noEmit -p src/domain/tsconfig.json` exit 0（用一个最小占位 .ts 文件验证编译）。
  - Run: `npx vitest run test/domain-tsconfig.test.ts`
  - Expected: FAIL — src/domain/ 不存在
- **GREEN**：创建 `src/domain/tsconfig.json`（见 design §2.1）；根 tsconfig `exclude` 加 `src/domain/**`；放一个 `src/domain/.gitkeep` 或最小 `index.ts` 让独立编译可跑。
- **Verify**: 测试通过 + `npx tsc --noEmit`（主 build）仍绿（INV-1）。
- **引用**: REQ-01, INV-1

### Task 2: 领域异常类型（errors.ts）（REQ-02/03 前置）
- **Depends On**: [1]
- **Files**: `src/domain/reservations/errors.ts` + `test/domain-errors.test.ts`
- **RED**：断言 `InvalidTransitionError`/`GuardFailedError`/`InvalidValueError` 类存在，可构造且含正确字段（from/event、guardName、field）。
  - Run: `npx vitest run test/domain-errors.test.ts`
  - Expected: FAIL
- **GREEN**：实现三个 Error 子类，文件头 `@non-production` 标注。
- **Verify**: 测试通过。
- **引用**: 前置（REQ-02/03/04 用）

## Wave 2：聚合核心（全套 DDD 原语）

### Task 3: Reservation 聚合根 + state-machine 消费（REQ-02 + REQ-07）
- **Depends On**: [1, 2]
- **Files**: `src/domain/reservations/reservation.ts` + `test/reservation-transitions.test.ts`
- **RED**：测试覆盖 11 transitions —— 合法转换改状态 + push 事件；非法转换（如 CheckedOut→CheckedIn）抛 `InvalidTransitionError`；guard 未满足抛 `GuardFailedError`。断言聚合 import `../../state-machine`。
  - Run: `npx vitest run test/reservation-transitions.test.ts`
  - Expected: FAIL — reservation.ts 不存在
- **GREEN**：
  - 创建薄封装 `loadReservationMachine()`：读 `packs/pms/state-machines/reservation.yaml` 内容 → `loadStateMachineDefinition(yaml)` → 返回带 `lookupTransition(from, event)` 的对象（线性查找 def.transitions）。
  - 实现 `Reservation` 聚合：state 字段 + confirm/checkIn/checkOut/cancel/markNoShow/earlyCheckIn/lateCheckIn/roomMove/modify 方法。每方法：求值 guard → `lookupTransition` 校验 → 改 state → push 事件。
  - 文件头 `@non-production`。
- **Verify**: 测试通过；`grep "from \"../../state-machine\"" src/domain/` 命中（REQ-07 resolve orphan）。
- **引用**: REQ-02, REQ-07

### Task 4: 值对象（values.ts）（REQ-03）
- **Depends On**: [2]
- **Files**: `src/domain/reservations/values.ts` + `test/reservation-values.test.ts`
- **RED**：断言 StayPeriod（nights() + checkout>checkIn 校验）、GuestInfo（匿名 guestRef，无 PII 字段）、RoomAssignment 存在；不可变性（Object.freeze 或 readonly）；值相等性。
  - Run: `npx vitest run test/reservation-values.test.ts`
  - Expected: FAIL
- **GREEN**：实现值对象，创建时校验抛 `InvalidValueError`。文件头 `@non-production`。
- **Verify**: 测试通过。
- **引用**: REQ-03

### Task 5: 领域事件（events.ts）（REQ-04）
- **Depends On**: [3]
- **Files**: `src/domain/reservations/events.ts` + 扩展 `test/reservation-transitions.test.ts`（加事件断言）
- **RED**：断言 5 个事件（ReservationConfirmed/GuestCheckedIn/GuestCheckedOut/ReservationCancelled/NoShowMarked）在转换后被 push；`aggregateEvents()` 返回副本；事件载荷无 PII（只有 reservationId + occurredAt + 必要字段）。
  - Run: `npx vitest run test/reservation-transitions.test.ts`
  - Expected: FAIL（事件未 push）
- **GREEN**：实现事件类型 + 聚合 push 逻辑（Task 3 的方法体内补 push）。文件头 `@non-production`。
- **Verify**: 测试通过（含事件断言）。
- **引用**: REQ-04

### Task 6: 仓储 interface + InMemory impl + Application Service（REQ-05 + REQ-06）
- **Depends On**: [3]
- **Files**: `src/domain/reservations/repository.ts` + `src/domain/reservations/service.ts` + `test/reservation-service.test.ts`
- **RED**：断言 `ReservationRepository` interface（findById/save/findConfirmed）+ `InMemoryReservationRepository`（纯内存，grep 无 SQL/eval）+ `ReservationService`（bookReservation/confirm/checkIn/checkOut/cancel 编排：load→call→save→return events）。impl 含 @non-production TODO。
  - Run: `npx vitest run test/reservation-service.test.ts`
  - Expected: FAIL
- **GREEN**：实现 interface + 内存 impl + Service。文件头 `@non-production`。
- **Verify**: 测试通过；grep repository.ts 无 `eval|new Function|require\(.*sql|SELECT|INSERT`。
- **引用**: REQ-05, REQ-06

## Wave 3：验证与安全

### Task 7: state-machine 消费契约强化 + resolve orphan 验证（REQ-07 完整）
- **Depends On**: [3]
- **Files**: `test/state-machine-consumer.test.ts`（contract 测试）
- **RED**：断言 (a) `src/domain/reservations/reservation.ts` import state-machine；(b) 删除该 import（模拟）→ 测试 fail（验证 import 是 load-bearing 非 dead）；(c) 聚合的转换校验真的查询了 def.transitions（非硬编码 switch）—— 可通过 spy 或断言 lookupTransition 被调。
  - Run: `npx vitest run test/state-machine-consumer.test.ts`
  - Expected: FAIL（contract 断言未写）
- **GREEN**：补 contract 测试（静态分析 import + 运行时断言引擎被调）。
- **Verify**: 测试通过；引擎不再是 orphan。
- **引用**: REQ-07

### Task 8: CI 安全巡检 + @non-production 标注（REQ-08）
- **Depends On**: [3, 4, 5, 6]
- **Files**: `scripts/check-domain-safety.mjs` + 接入 `package.json` check + `no-domain-imports-in-engine` 规则
- **RED**：新建 `test/domain-safety.test.ts`，断言 (a) `scripts/check-domain-safety.mjs` 存在；(b) 对 src/domain/ 扫 eval/new Function/SQL/fs/child_process/fetch/http → exit 0（正常）；(c) 植入一个 eval → exit 1；(d) 扫 src/（排除 domain）import ./domain → exit 1（INV-2）。
  - Run: `npx vitest run test/domain-safety.test.ts`
  - Expected: FAIL
- **GREEN**：实现 check-domain-safety.mjs（grep 巡检）；接入 npm run check（在 check 脚本链加该脚本）；确认所有 src/domain/ 文件头含 @non-production。
- **Verify**: `npm run check` 含 domain-safety 步骤且 exit 0；测试通过。
- **引用**: REQ-08, INV-2, INV-4

### Task 9: deriveStatePropertyTests 半自动集成 + BDD 场景（REQ-09 + REQ-10）
- **Depends On**: [3]
- **Files**: `src/domain/reservations/__generated__/state-properties.test.ts`（生成产物）+ `src/domain/reservations/reservation.scenarios.test.ts`
- **RED**：
  - (a) 断言 `__generated__/state-properties.test.ts` 存在，含 `// @generated` 标注，覆盖 invariants（terminal 无出边 / cancelled_before_check_in 等），测试通过。
  - (b) `reservation.scenarios.test.ts` 含 design §2.4 的 10 个场景（S1-S10），每个 Given/When/Then。
  - Run: `npx vitest run src/domain/reservations/`
  - Expected: FAIL
- **GREEN**：
  - (a) 运行 deriveStatePropertyTests 生成片段 → 写入 `__generated__/state-properties.test.ts`（含 @generated 头）→ 调整 import 路径使其编译运行。
  - (b) 实现 10 个 BDD 场景测试。
- **Verify**: 测试通过。
- **引用**: REQ-09, REQ-10

## Wave 4：回归与交付

### Task 10: 回归保障（npm run check 全绿）（REQ-11）
- **Depends On**: [1,2,3,4,5,6,7,8,9]
- **Files**: 无新文件（验证任务）
- **RED**：无
- **GREEN**：运行 `npm run check`，修复任何回归。特别确认：(a) 主 tsc 不编译 src/domain（INV-1）；(b) vitest 收集 domain 测试且全绿；(c) biome 格式合规。
- **Verify**: `npm run check` EXIT=0。
- **引用**: REQ-11, INV-1, INV-5

### Task 11: 不进 dist 校验 + 文档（REQ-01 INV-3 + 收尾）
- **Depends On**: [10]
- **Files**: 扩展 `test/build-dist-packs.test.sh` 或 contract 测试（断言 dist 不含 src/domain）+ `src/domain/README.md`
- **RED**：断言 `dist/claude-code/bundles/forge/` 不含 `domain/` 子目录（INV-3）。
  - Run: 相关测试
  - Expected: FAIL（无此断言）
- **GREEN**：加 contract 断言；写 `src/domain/README.md` 说明示例定位、如何编译、@non-production 含义、与 state-machine 的关系。
- **Verify**: 测试通过 + README 存在。
- **引用**: INV-3

## DoD（Definition of Done）

- [ ] 11 个 Task 全部 done
- [ ] 11 个 REQ 各自 Evidence 齐全
- [ ] `npm run check` 全绿（INV-1, INV-5）
- [ ] state-machine 引擎不再是 orphan（src/domain/ 真实 import + 调用，REQ-07）
- [ ] reservation 全套 DDD 原语齐全（聚合根 + 值对象 + 事件 + 仓储 interface + Service）
- [ ] src/domain/ 不污染主 build（独立 tsconfig + 主 tsconfig exclude）
- [ ] src/domain/ 不进 dist（INV-3）
- [ ] 安全红线落地（@non-production 标注 + CI check-domain-safety + 纯内存仓储 + engine 不 import domain）
- [ ] 原子提交（每 Task 一个 commit）

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| src/domain/ 测试被主 vitest 收集但独立 tsconfig 类型解析失败 | vitest 用 esbuild 转译，不依赖主 tsc；若类型错则独立 tsc --build 验证 |
| state-machine loader 接收 yaml 字符串非 pack 名，domain 需自己读文件 | design §2.2 薄封装 loadReservationMachine() 读文件 + parse |
| deriveStatePropertyTests 生成片段 import 路径不匹配 | 生成后手动调整 import 路径（半自动，REQ-09 接受） |
| 独立 tsconfig composite 引用 state-machine 无 tsconfig | 用相对 import + node_modules 类型解析，references 可省略 |
| check-domain-safety 误报合法代码 | 白名单注释 `// domain-safety-exempt: reason`（若需要） |
