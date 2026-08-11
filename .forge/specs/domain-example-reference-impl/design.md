---
feature: domain-example-reference-impl
layout: design
created: 2026-06-29
updated: 2026-06-29
locked_at: 2026-06-29
brownfield: true
related_requirements: ".forge/specs/domain-example-reference-impl/requirements.md"
slice: "A（reservation 聚合）"
---

# Design — Domain Example Reference Impl（切片 A）

## 1. 架构概览

### 当前架构（Current State）

```
src/state-machine/          ← orphan 引擎（无真实生产消费者）
  ├─ loader.ts              loadStateMachineDefinition(yamlPath)
  ├─ validator.ts           validateDefinition(def) → report
  ├─ property-derivation.ts deriveStatePropertyTests(def) → TS string
  └─ types.ts               StateMachineDefinition / TransitionSpec ...

packs/pms/state-machines/
  └─ reservation.yaml       ← 状态真相源（6 状态 / 11 transitions / 4 invariants）

src/domain/                 ← ❌ 不存在（本 spec 创建）

packs/pms/pack.yaml
  mutation_critical_modules:
    - "src/domain/folio/**/*.ts"   ← 空路径（folio 在 slice A.2）
```

state-machine 引擎的 API（已验证，`src/state-machine/loader.ts:37` 等）：
- `loadStateMachineDefinition(name): StateMachineDefinition`
- `validateDefinition(def): ValidationReport`
- `deriveStatePropertyTests(def): string`（生成 TS 测试片段）

### 提议架构（Proposed Change）

```
src/
  ├─ state-machine/         ← engine（INV-2: engine 不 import domain）
  │   └─ ...（不变）
  └─ domain/                ← 【新增】in-repo dogfood 参照域
      ├─ tsconfig.json      独立 project ref（composite:true）
      └─ reservations/
          ├─ reservation.ts         聚合根（消费 state-machine）
          ├─ values.ts              值对象
          ├─ events.ts              领域事件
          ├─ repository.ts          interface + InMemory impl
          ├─ service.ts             Application Service
          ├─ errors.ts              领域异常
          ├─ reservation.test.ts    转换单测（REQ-02/07）
          ├─ reservation.scenarios.test.ts  BDD 场景（REQ-10）
          └─ __generated__/
              └─ state-properties.test.ts  deriveStatePropertyTests 产物（REQ-09）

scripts/
  └─ check-domain-safety.mjs   【新增】CI 巡检（REQ-08）

tsconfig.json                 【改】exclude src/domain/（INV-1）
```

**依赖方向**（单向，INV-2）：
```
src/domain/reservations/  ──import──>  src/state-machine/  （合法）
src/state-machine/        ──x──>       src/domain/          （禁止，CI lint）
src/（engine 主体）       ──x──>       src/domain/          （禁止）
```

## 2. 核心设计决策

### 2.1 tsconfig project ref 怎么配（开放问题 1 解决）

`src/domain/tsconfig.json`：
```json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "outDir": "../../dist-domain",
    "rootDir": ".",
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["./**/*.ts"],
  "references": [{ "path": "../state-machine" }]
}
```

- `composite: true` 让它成为可被引用的 project；`references` 指向 state-machine（若 state-machine 无 tsconfig，则用相对 import + 主 tsconfig 的类型）。
- 根 `tsconfig.json` 的 `include`/`exclude`：在 `exclude` 加 `"src/domain/**"`。主 `tsc --noEmit` 不编译 domain，但 vitest 仍收集 domain 的 `.test.ts`（vitest 用自己的转译，不依赖主 tsc include）。
- 独立验证：`tsc --build src/domain/tsconfig.json` 或 `tsc --noEmit -p src/domain/tsconfig.json` exit 0。
- `package.json` 的 `check` 脚本不变（domain 测试由 vitest 自动收集）；新增独立的 domain 编译校验作为可选步骤（不阻塞主 check，避免循环依赖）。

**关键约束**：state-machine 当前是 src/ 下的普通模块（无独立 tsconfig）。domain 通过相对路径 `../../state-machine` import 它的类型与函数。若 state-machine 无 `composite` tsconfig，domain 的 `references` 可省略，仅靠相对 import + 主 node_modules 解析类型。

### 2.2 state-machine 消费契约（REQ-07，resolve orphan）

Reservation 聚合如何消费引擎：

```ts
// src/domain/reservations/reservation.ts
import { loadStateMachineDefinition } from "../../state-machine";

const reservationMachine = loadStateMachineDefinition("reservation");
// reservationMachine: { states, transitions, invariants, lookupTransition(from,event) }

export class Reservation {
  private state: ReservationState = "Booked";
  private events: DomainEvent[] = [];

  confirm(paymentCaptured: boolean) {
    // guard 是领域逻辑（聚合知晓业务条件）
    if (!paymentCaptured) throw new GuardFailedError("payment_captured");
    // 引擎校验转换结构合法性（from=Booked, event=ConfirmReservation 在 yaml 合法？）
    const t = reservationMachine.lookupTransition("Booked", "ConfirmReservation");
    if (!t) throw new InvalidTransitionError("Booked", "ConfirmReservation");
    this.state = t.to; // "Confirmed"
    this.events.push(new ReservationConfirmed(this.id, new Date()));
  }
  // ... checkIn / cancel / markNoShow 等
}
```

**关键**：`loadStateMachineDefinition` 必须暴露 `lookupTransition(from, event)` 或等价查询 API。若引擎当前只有 `validateDefinition`（校验整个 def），需确认是否有单转换查询。**spec 阶段需核实 loader API**——若无查询函数，design 决定：在 domain 侧薄封装一层（从 def.transitions 线性查找），但**不复制 yaml 内容**，只调引擎加载的 def。

**resolve orphan 验证**：`grep -rn "from \"../../state-machine\"" src/domain/` 命中 → 引擎有真实生产消费者。

### 2.3 deriveStatePropertyTests 集成（开放问题 2 解决——半自动）

**决策：半自动，不在运行时 eval。**

1. 开发者运行：`node -e "import('./src/state-machine/property-derivation.js').then(m=>console.log(m.deriveStatePropertyTests(m.loadStateMachineDefinition('reservation'))))"`（或等价脚本）生成 TS 片段。
2. 输出写入 `src/domain/reservations/__generated__/state-properties.test.ts`，文件头标 `// @generated by deriveStatePropertyTests — do not edit`。
3. commit 该文件。vitest 收集并运行。

**为何不自动 eval**：运行时 `eval` 生成测试违反 INV-4（禁 eval）且不可审计。半自动生成 + commit 是安全且可 review 的。

### 2.4 BDD 场景选择（开放问题 3 解决）

从 packs/pms/scenarios/reservation/ 选 10 条关键路径：

| # | 场景 | 路径 | 覆盖 transition |
|---|------|------|----------------|
| S1 | 标准入住 | Booked→Confirmed→CheckedIn→CheckedOut | ConfirmReservation/CheckIn/CheckOut |
| S2 | 取消（确认前） | Booked→Cancelled | CancelBooking |
| S3 | 取消（确认后） | Confirmed→Cancelled | CancelReservation |
| S4 | NoShow | Confirmed→NoShow | MarkNoShow |
| S5 | 提前入住 | Booked→CheckedIn | EarlyCheckIn |
| S6 | 晚入住 | Confirmed→CheckedIn | LateCheckIn |
| S7 | 自动确认 | Booked→Confirmed | AutoConfirm |
| S8 | 修改预订 | Confirmed→Confirmed | ModifyReservation |
| S9 | 房间调换 | CheckedIn→CheckedIn | RoomMove |
| S10 | 非法转换拒绝 | CheckedOut→CheckedIn | （抛 InvalidTransitionError） |

### 2.5 mutation score_threshold（开放问题 4——本 slice 不调整）

`pack.yaml` 的 `score_threshold: 85` 在 slice A 保持不变。reservation 聚合跑通后，slice A.2 批量补时再据实际 mutation score 评估是否调整。本 spec 不改 pack.yaml。

## 3. 数据模型

### Reservation 聚合（核心）

```ts
type ReservationState = "Booked" | "Confirmed" | "CheckedIn" | "CheckedOut" | "NoShow" | "Cancelled";

interface ReservationProps {
  id: ReservationId;        // 值对象
  guest: GuestInfo;         // 值对象（匿名化标识，无 PII）
  stay: StayPeriod;         // 值对象（checkIn/checkout 日期）
  room?: RoomAssignment;    // 值对象（可选，分房后填）
}

class Reservation {
  private state: ReservationState;
  private events: DomainEvent[];
  // 方法：confirm / checkIn / checkOut / cancel / markNoShow / earlyCheckIn / lateCheckIn / roomMove / modify
  // 每个方法：求值 guard（领域逻辑）→ 引擎校验转换 → 改状态 → push 事件
  aggregateEvents(): DomainEvent[] { return [...this.events]; }
}
```

### 值对象

- `StayPeriod { checkIn: Date; checkOut: Date }` — `nights()` 返回天数；checkout > checkIn 校验
- `GuestInfo { guestRef: string }` — 匿名化引用（无 PII）
- `RoomAssignment { roomNumber: string; roomType: string }`

### 领域事件

- `ReservationConfirmed { reservationId, occurredAt }`
- `GuestCheckedIn { reservationId, roomNumber, occurredAt }`
- `GuestCheckedOut { reservationId, occurredAt }`
- `ReservationCancelled { reservationId, reason, occurredAt }`
- `NoShowMarked { reservationId, occurredAt }`

所有事件载荷无 PII（只有 reservationId + 时间 + 必要业务字段）。

## 4. 错误处理

| 场景 | 处理 |
|------|------|
| 非法状态转换（如 CheckedOut→CheckedIn） | 抛 `InvalidTransitionError(from, event)` |
| guard 未满足（如 confirm 时 payment_captured=false） | 抛 `GuardFailedError(guardName)` |
| 值对象校验失败（如 StayPeriod checkout≤checkIn） | 抛 `InvalidValueError(field)` |
| 仓储找不到聚合 | `findById` 返回 `null`（Service 层判断） |
| yaml 加载失败（state-machine loader） | 抛 `StateMachineLoadError`（启动期暴露，不吞） |

## 5. 回滚清单（Reversibility）

- REQ-01 tsconfig：删除 `src/domain/tsconfig.json`，根 tsconfig 移除 exclude 项
- REQ-02~06 聚合/值对象/事件/仓储/Service：删除 `src/domain/reservations/` 目录
- REQ-07 引擎消费：删除后引擎回归 orphan（可接受，无破坏性）
- REQ-08 CI 巡检：删除 `scripts/check-domain-safety.mjs`，移除 npm run check 接入
- REQ-09 生成测试：删除 `__generated__/` 目录
- REQ-10 BDD 场景：删除 scenarios 测试文件
- 挂载点：`src/domain/`（新建目录）、`scripts/check-domain-safety.mjs`（新文件）、根 `tsconfig.json`（exclude 改动）

## 6. 非目标重申（防 scope creep）

- 不做 7 个非 reservation 上下文（slice A.2）
- 不做持久化真实实现（仅 interface + 内存 impl）
- 不做领域知识贯穿全流程（slice B）
- 不改 state-machine 引擎源码（只消费，不改）
- 不改 pack.yaml mutation threshold
- 不做 Web/API/DI/消息总线基础设施

## 7. 与现有机制的一致性

- **独立 tsconfig** vs Forge 现有单 tsconfig：示例领域是参照物，需独立编译边界，与主 build 解耦。这是有意差异。
- **InMemoryRepository** vs 真实持久化：示例聚焦领域层，持久化是用户接入点（@non-production TODO）。不引入 DB 驱动是安全红线。
- **state-machine 消费** vs 模板 transition switch：decide §4.3 裁决——示例走引擎校验，不走模板自带 switch，让引擎变 load-bearing。
