---
name: housekeeping
responsibility: "客房清洁与维护调度：任务分配、进度跟踪、房间状态管理"
aggregates:
  - HousekeepingTask
  - RoomStatus
  - CleaningSchedule
inbound_events:
  - GuestCheckedOut
  - GuestCheckedIn
  - MaintenanceRequested
  - InspectionCompleted
outbound_events:
  - RoomCleaned
  - RoomInspected
  - RoomOutOfService
  - RoomBackInService
upstream:
  - front-desk
  - reservations
downstream:
  - front-desk
  - rate-inventory
---

# Housekeeping Context

## Scope

Housekeeping Context 管理酒店所有客房的物理状态和清洁维护任务。它是 PMS 的 Supporting 子域，但对客户满意度有关键影响——房间状态不准确会导致超售或入住脏房。

RoomStatus 聚合跟踪每间客房的物理状态（Available / Occupied / Dirty / Clean / Inspected / OutOfService / OutOfOrder），状态变更由事件驱动：退房触发 Dirty、清洁完成触发 Clean、检查通过触发 Inspected。

HousekeepingTask 聚合管理具体的清洁任务：创建、分配给清洁员、跟踪进度、完成或跳过。任务有优先级排序规则：退房房间的清洁优先于例行清洁，VIP 房间优先于普通房间。

## Boundaries

Housekeeping Context **不**管理预订（由 Reservations 负责），**不**处理入住/退房的业务流程（由 Front Desk 负责），**不**决定房间是否可售（由 Rate-Inventory 根据状态判断）。它只管理房间的物理状态和清洁任务执行。
