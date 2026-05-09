# Hotel PMS Domain Pack

酒店前台管理系统（Property Management System）领域知识包，为 Forge 提供开箱即用的 PMS 限界上下文、统一语言和状态机定义。

## 8 Bounded Contexts

| Context | Responsibility | Type |
|---------|---------------|------|
| `reservations` | 预订全生命周期管理 | Core |
| `front-desk` | 前台接待与入住/退房操作 | Supporting |
| `housekeeping` | 客房清洁与维护调度 | Supporting |
| `folio-billing` | 账单与费用管理 | Core |
| `night-audit` | 夜审与日结处理 | Core |
| `rate-inventory` | 房价与库存管理 | Supporting |
| `channel-integration` | OTA/直连渠道对接 | Supporting |
| `reporting` | 运营报表与数据分析 | Generic |

## 4 State Machines

| State Machine | States | File |
|--------------|--------|------|
| Reservation | Booked → Confirmed → CheckedIn → CheckedOut / NoShow / Cancelled | `state-machines/reservation.yaml` |
| Folio | Open → Posted → Closed / Voided | `state-machines/folio.yaml` |
| Room Status | Available / Occupied / Dirty / Clean / Inspected / OutOfService / OutOfOrder | `state-machines/room-status.yaml` |
| Housekeeping Task | Pending → InProgress → Completed / Skipped | `state-machines/housekeeping-task.yaml` |

## 20 Scenarios

预设 20+ Gherkin 场景覆盖核心业务流程：入住/退房、夜审、预订管理、账单处理。存放于 `scenarios/` 目录。

## Setup

```bash
/forge pack enable pms
```

## Customization

通过 `.forge/custom/` 覆盖 pack 内容：
- `.forge/custom/pms/glossary/` — 自定义术语
- `.forge/custom/pms/banned-patterns.yaml` — 自定义禁用词
- `.forge/custom/pms/state-machines/` — 自定义状态机
