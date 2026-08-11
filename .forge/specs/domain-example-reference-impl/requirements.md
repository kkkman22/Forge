---
status: locked
feature: domain-example-reference-impl
layout: requirements
created: 2026-06-29
updated: 2026-06-29
locked_at: 2026-06-29
tier: full
work_nature: feature
brownfield: true
import_source: ".forge/decisions/2026-06-27-domain-example-reference-impl.md"
related_adrs:
  - "ADR-0008 (code-slim-strategy)"
related_decisions:
  - ".forge/decisions/2026-06-27-domain-example-reference-impl.md（切片 A）"
  - ".forge/decisions/2026-06-27-packs-plugin-distribution.md（切片 A'，已合并解除阻塞）"
related_specs:
  - ".forge/specs/pms-pack-v1/（R4.5 state-machine 消费方，本 spec 让 mutation_critical_modules 变真实路径）"
slice: "A（示例领域代码）— 先 ship reservation 聚合验证模式，再补其余 7 上下文"
health:
  score: 0
  verdict: "pending"
---

# Requirements — Domain Example Reference Impl（切片 A）

## 目标

在 Forge 仓库内建一个 **in-repo dogfood 参照域**：`src/domain/` 驻留 DDD PMS 示例领域代码，作为可读可改的参照物（非生产代码）。它解决两个沉没成本变现问题（来自 decide 文档 §4 Critic 裁决）：

1. **state-machine 引擎首次有真实生产消费者**：示例聚合 `import { loadStateMachineDefinition }` 消费 `src/state-machine/`，把 orphan 引擎转为 load-bearing module。
2. **`mutation_critical_modules` 变真实路径**：`packs/pms/pack.yaml` 的 `src/domain/folio/**/*.ts` 当前是空路径，示例领域让它变成 mutation 的真实 target。

**本切片（slice A）范围**：先 ship **reservation 聚合**（1 个完整聚合），验证 state-machine 消费 + 全套 DDD 原语 + 分发链路。其余 7 个限界上下文（front-desk / housekeeping / folio-billing / night-audit / rate-inventory / channel-integration / reporting）在 reservation 观察 1-2 周后批量补（后续 slice A.2）。

**前置阻塞已解除**：切片 A′（packs 分发，PR #145 已合并 main）让示例代码的参照价值成立——plugin 用户能拿到 packs/，示例领域随仓库可见。

## 非目标

- **不做** 7 个非 reservation 上下文（推迟到 slice A.2）
- **不做** 仓储的持久化实现（仅 interface，impl 留 `@non-production` TODO）—— 纯内存，不引入 DB 驱动
- **不做** 领域知识贯穿 decide/plan/build/review（切片 B）
- **不做** state-machine 引擎接进 /forge plan（R4.5.5，切片 B）
- **不做** Web/API 层、依赖注入框架、消息总线基础设施——示例聚焦领域层
- **不进 dist build 产物**——源码入库但不被 CLI 加载，不注册为 Forge 运行时模块

## 全局不变式（所有 REQ 必须满足，任一违反 = 阻断 ship）

| ID | 不变式 | 验证 |
|----|--------|------|
| INV-1 | Forge 主 build（`npm run check` / `tsc`）不被 `src/domain/` 污染——独立 tsconfig project ref，主 tsconfig 排除 src/domain/ | tsc + biome 全绿 |
| INV-2 | engine 侧禁止 import domain——单向依赖（领域可引用引擎，引擎不反向依赖领域） | CI `no-domain-imports-in-engine` lint 规则 |
| INV-3 | src/domain/ 不进 dist build 产物（不随 plugin bundle 分发被 CLI 加载） | build-dist.sh 排除 + grep 校验 |
| INV-4 | 无运行时副作用：禁 SQL 拼接 / eval / new Function / fs / child_process / 网络请求 | CI grep 巡检 src/domain/ |
| INV-5 | 现有 8933 测试不回归（`npm run check` 全绿） | npm run check EXIT=0 |

---

## REQ-01: src/domain/ 目录结构与独立 tsconfig project ref

**问题**：示例领域代码若直接进 src/ 主树，会被 Forge 主 tsc/biome/vitest 编译，污染主 build；且无法独立编译验证。

**Requirement**：
- WHEN 创建 `src/domain/` THEN SHALL 建立 `src/domain/tsconfig.json`，`composite: true` + 引用根 tsconfig 的 `references`，作为独立 TypeScript project。
- THE Forge 主 `tsconfig.json` SHALL 在 `include`/`exclude` 中排除 `src/domain/**`，使主 build 不编译示例代码。
- THE `package.json` 的 build/check 脚本 SHALL 不因 src/domain/ 缺失或存在而变化（独立编译，主流程无感知）。
- WHEN 运行 `tsc --build src/domain/tsconfig.json` THEN SHALL 成功编译示例领域代码（独立验证入口）。

**Verify-By**: `bash:contract`
**Evidence**：`src/domain/tsconfig.json` 存在且 `composite: true`；根 tsconfig 排除 src/domain/；`tsc --build src/domain/tsconfig.json` exit 0。

---

## REQ-02: Reservation 聚合根（消费 state-machine 引擎做转换校验）

**问题**：示例聚合是 state-machine 引擎的首个真实消费者。聚合的状态转换必须受 yaml 真相源校验，而非自带 switch。

**Requirement**：
- WHEN 创建 `src/domain/reservations/reservation.ts` THEN SHALL 定义 `Reservation` 聚合根类，封装预订状态与转换规则。
- THE 聚合 SHALL `import { loadStateMachineDefinition, validateDefinition } from "../../state-machine"` 消费引擎（**不走** 自带 transition switch）。
- THE 状态真相源 SHALL 是 `packs/pms/state-machines/reservation.yaml`（6 状态：Booked/Confirmed/CheckedIn/CheckedOut/NoShow/Cancelled；11 transitions；4 invariants）。
- WHEN 聚合执行转换（如 `confirm()`、`checkIn()`、`cancel()`）THEN SHALL 通过引擎校验该转换在 yaml 中合法（from/to/event 匹配）；非法转换 SHALL 抛出领域异常（如 `InvalidTransitionError`）。
- THE 转换 guard（如 `payment_captured`、`arrival_date_reached`）SHALL 由聚合方法在调用引擎前求值——guard 是领域逻辑（聚合知晓业务条件），引擎校验转换结构合法性。

**Verify-By**: `vitest:unit`
**Evidence**：`src/domain/reservations/reservation.ts` 定义 Reservation 聚合，import state-machine 引擎；单测覆盖 11 transitions（合法转换通过 + 非法转换抛 InvalidTransitionError）。

---

## REQ-03: 值对象（Value Objects）

**Requirement**：
- WHEN 定义预订相关值对象 THEN SHALL 创建不可变值对象类型：至少 `StayPeriod`（checkIn/checkout 日期范围，含 `nights()` 计算）、`GuestInfo`（姓名/联系方式）、`RoomAssignment`（房号/房型）。
- THE 值对象 SHALL 是不可变的（readonly 字段，无 setter），相等性基于字段值而非身份。
- THE 值对象 SHALL 在创建时校验不变量（如 StayPeriod 的 checkout 必须晚于 checkIn，否则抛 `InvalidValueError`）。

**Verify-By**: `vitest:unit`
**Evidence**：`src/domain/reservations/values.ts`（或拆分文件）定义值对象；单测覆盖创建校验 + 不可变性 + 值相等性。

---

## REQ-04: 领域事件（Domain Events）

**Requirement**：
- WHEN 聚合执行转换产生业务事实 THEN SHALL 发布领域事件：至少 `ReservationConfirmed`、`GuestCheckedIn`、`GuestCheckedOut`、`ReservationCancelled`、`NoShowMarked`（对应 reservations.md 的 outbound_events）。
- THE 领域事件 SHALL 携带最小必要载荷（聚合 ID + 事件发生时间 + 状态快照），**禁含 PII**（决策安全红线 #2）—— GuestInfo 只带匿名化标识，不带原始姓名/电话。
- THE 事件 SHALL 可被聚合收集（`aggregateEvents()` 方法）供 Application Service 发布。

**Verify-By**: `vitest:unit`
**Evidence**：`src/domain/reservations/events.ts` 定义事件类型；单测覆盖事件发布（转换后聚合含对应事件）+ 载荷无 PII（断言字段集合）。

---

## REQ-05: 仓储（Repository Interface，纯内存 impl）

**Requirement**：
- WHEN 定义 Reservation 仓储 THEN SHALL 提供 `ReservationRepository` **interface**（`findById`/`save`/`findConfirmed` 等查询契约）。
- THE 仓储实现 SHALL 是纯内存（`InMemoryReservationRepository`），**禁** SQL 拼接 / eval / new Function / 引入 DB 驱动（决策安全红线 #1）。
- THE impl 中持久化部分 SHALL 标 `@non-production` TODO（标注"真实持久化由用户接入，本 impl 仅示例"），不实现真实存储。

**Verify-By**: `vitest:unit`
**Evidence**：`src/domain/reservations/repository.ts` 含 interface + InMemoryReservationRepository；grep 无 SQL/eval/DB-driver；impl 含 @non-production 标注。

---

## REQ-06: Application Service（编排聚合 + 仓储 + 事件）

**Requirement**：
- WHEN 定义 Reservation Application Service THEN SHALL 编排聚合操作与仓储：`ReservationService` 提供 `bookReservation`/`confirmReservation`/`checkIn`/`checkOut`/`cancel` 等用例方法。
- THE Service SHALL 从仓储加载聚合 → 调用聚合方法 → 保存聚合 → 返回收集的领域事件。
- THE Service SHALL 不含业务规则（规则在聚合），仅编排（加载→调用→持久化→发布事件）。

**Verify-By**: `vitest:unit`
**Evidence**：`src/domain/reservations/service.ts` 定义 ReservationService；单测覆盖用例编排（mock 仓储，断言聚合调用 + 事件返回）。

---

## REQ-07: state-machine 引擎消费契约（resolve orphan）

**问题**：state-machine 引擎当前是 orphan（无真实消费者）。示例聚合是首个消费者，必须真正调用引擎 API。

**Requirement**：
- WHEN Reservation 聚合初始化 THEN SHALL 调用 `loadStateMachineDefinition("reservation")` 加载 yaml 真相源（或等价的类型化加载）。
- WHEN 聚合验证转换 THEN SHALL 调用引擎的转换校验逻辑（`validateDefinition` 或转换查找），不复制 yaml 内容到代码。
- THE `src/state-machine/` 模块 SHALL 因本 REQ 首次有真实生产 import（非测试 import）——通过 grep 确认 `src/domain/**/*.ts` import `../state-machine`。

**Verify-By**: `vitest:unit` + `bash:contract`
**Evidence**：Reservation 聚合 import 并调用 state-machine 引擎；grep `from "../../state-machine"` 命中 src/domain/ 文件；引擎不再是 orphan。

---

## REQ-08: @non-production 标注与 CI 安全巡检

**Requirement**：
- WHEN 创建 src/domain/ 下任何文件 THEN SHALL 在文件头标注 `@non-production` / NOT FOR PRODUCTION 注释（决策安全红线 #3）。
- THE CI SHALL 新增 `scripts/check-domain-safety.mjs`（或等价）grep 巡检 src/domain/：禁止 `eval` / `new Function` / SQL 拼接 / `fs` / `child_process` / 硬编码 secret / 网络请求（`fetch`/`http`/`require('net')`）。
- THE 巡检 SHALL 接入 `npm run check`（INV-4），违反 exit 1。
- THE `no-domain-imports-in-engine` lint（INV-2）SHALL 校验 `src/`（排除 src/domain/）无 import `./domain` 或 `../domain`。

**Verify-By**: `bash:contract`
**Evidence**：src/domain/ 所有文件头含 @non-production；`scripts/check-domain-safety.mjs` 存在且接入 npm run check；`no-domain-imports-in-engine` 规则存在。

---

## REQ-09: deriveStatePropertyTests 集成（半自动，开放问题 2 解决）

**问题**：`deriveStatePropertyTests`（`src/state-machine/property-derivation.ts`）从 yaml 生成 TS 测试片段字符串。需决定如何集成进示例测试。

**Requirement**：
- WHEN 实现 reservation 测试 THEN SHALL 用**半自动**方式：运行 `deriveStatePropertyTests(reservationDef)` 生成 TS 片段 → 开发者将其粘贴/写入 `src/domain/reservations/__generated__/state-properties.test.ts` 并 commit（**不**在运行时 eval，避免安全风险）。
- THE 生成的测试 SHALL 覆盖 yaml 的 invariants（如 `terminal_state_has_no_outgoing_transitions`、`cancelled_before_check_in_only`）。
- THE 生成文件 SHALL 标注 `// @generated by deriveStatePropertyTests — do not edit`，便于重新生成。

**Verify-By**: `vitest:unit`
**Evidence**：`src/domain/reservations/__generated__/state-properties.test.ts` 存在，含 generated 标注，覆盖 invariants，测试通过。

---

## REQ-10: BDD 场景（关键路径，开放问题 3 解决）

**Requirement**：
- WHEN 覆盖 reservation 行为 THEN SHALL 用 Gherkin BDD 场景测试关键路径（从 packs/pms/scenarios/reservation/ 选取）：
  - 标准入住路径（Booked → Confirmed → CheckedIn → CheckedOut）
  - 取消路径（Booked/Confirmed → Cancelled，含 cancellation window guard）
  - NoShow 路径（Confirmed → NoShow，含 arrival cutoff guard）
  - 提前入住（EarlyCheckIn）/ 晚入住（LateCheckIn）变体
  - 非法转换拒绝（如 CheckedOut → CheckedIn）
- THE 场景 SHALL 至少 8-12 条（关键路径覆盖，非穷举 103 条）。
- THE 场景 SHALL 与 yaml transitions 一致（场景中的状态转换在 yaml 中合法）。

**Verify-By**: `vitest:unit`（BDD 用 Given/When/Then 注释 + 断言，或 vitest describe 块映射场景）
**Evidence**：`src/domain/reservations/reservation.scenarios.test.ts` 含 8-12 个场景测试，覆盖上述路径。

---

## REQ-11: 回归保障（npm run check 全绿 + 不污染主 build）

**Requirement**：
- THE 改动 SHALL 不破坏现有 `npm run check`（tsc + biome + vitest + 全链）。
- THE src/domain/ 的测试 SHALL 被主 vitest 收集并全绿（示例测试是回归安全网的一部分）。
- WHEN `npm run check` 运行 THEN SHALL exit 0（INV-5）。

**Verify-By**: `bash:contract`
**Evidence**：`npm run check` EXIT=0；新增的 reservation 测试全绿。

---

## 验收标准（spec 级）

- [ ] 11 个 REQ 全部实现，各自 Evidence 齐全
- [ ] 全局不变式 INV-1 ~ INV-5 在最终 PR 全部满足
- [ ] `npm run check` 全绿
- [ ] **state-machine 引擎不再是 orphan**：src/domain/ 真实 import 并调用引擎（REQ-07）
- [ ] reservation 聚合全套 DDD 原语齐全（聚合根 + 值对象 + 事件 + 仓储 interface + Application Service）
- [ ] 示例代码不污染主 build（独立 tsconfig + 不进 dist）
- [ ] 安全红线落地（@non-production + CI 巡检 + 纯内存仓储）
- [ ] 文件头 @non-production 标注

## 依赖

- **切片 A′（已合并）**：packs 分发链路工作，示例参照价值成立。
- **src/state-machine/ 引擎（已存在）**：`loadStateMachineDefinition` / `validateDefinition` / `deriveStatePropertyTests` API 可用。
- **packs/pms/state-machines/reservation.yaml（已存在）**：状态真相源。
