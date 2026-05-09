---
name: reservations
responsibility: "预订全生命周期管理：创建、确认、修改、取消、NoShow 标记"
aggregates:
  - Reservation
  - GuestProfile
  - RoomAllocation
inbound_events:
  - BookingRequested
  - ModificationRequested
  - CancellationRequested
  - NoShowDetected
outbound_events:
  - ReservationConfirmed
  - ReservationCancelled
  - GuestCheckedIn
  - GuestCheckedOut
  - NoShowMarked
upstream:
  - rate-inventory
  - channel-integration
downstream:
  - front-desk
  - folio-billing
  - housekeeping
---

# Reservations Context

## Scope

Reservations Context 管理酒店预订的完整生命周期，从最初的预订请求到最终的退房或取消。这是 PMS 的 Core 子域——预订管理的效率直接影响酒店收入和客户满意度。

核心聚合是 Reservation，它封装了预订状态的所有业务规则：何时可以确认、何时可以修改、何时可以取消、何时标记为 NoShow。状态机严格定义了合法的状态转换路径（Booked → Confirmed → CheckedIn → CheckedOut / NoShow / Cancelled），任何不合法的转换都必须被拒绝。

GuestProfile 聚合管理客人信息，支持回头客识别和偏好记录。RoomAllocation 聚合处理预分房逻辑，在确认预订时根据房型和客人偏好预留房间资源。

## Boundaries

Reservations Context **不**直接管理房间实体的状态（由 Housekeeping Context 负责），**不**处理费用计算（由 Folio-Billing Context 负责），**不**管理房价策略（由 Rate-Inventory Context 负责）。它通过事件与其他 Context 协作：确认预订时通知 Housekeeping 准备房间，入住时通知 Folio-Billing 开账，取消时通知 Rate-Inventory 释放库存。
