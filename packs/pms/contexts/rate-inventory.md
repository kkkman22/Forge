---
name: rate-inventory
responsibility: "房价策略与房间库存管理：房价计划、可用量控制、超售策略"
aggregates:
  - RatePlan
  - Inventory
  - OverbookingPolicy
  - Allocation
inbound_events:
  - RoomCleaned
  - RoomOutOfService
  - ReservationConfirmed
  - ReservationCancelled
  - NightAuditCompleted
outbound_events:
  - RateUpdated
  - InventoryChanged
  - OverbookingThresholdReached
upstream:
  - housekeeping
  - reservations
  - night-audit
downstream:
  - reservations
  - channel-integration
  - reporting
---

# Rate-Inventory Context

## Scope

Rate-Inventory Context 管理 PMS 的定价策略和房间可用量，是收入管理（Revenue Management）的技术支撑。它决定"卖什么价"和"能卖多少间"。

RatePlan 聚合定义房价计划：基础房价、季节性调价、长住折扣、企业协议价、促销价等。支持多种定价模型：BAR（Best Available Rate）、动态定价、封闭价格（Closed to Arrival/Departure）。

Inventory 聚合跟踪房间可用量：总房间数减去已预订、已入住、维修中、锁定的房间。OverbookingPolicy 聚合管理超售策略：设置超售比例、自动停止销售阈值、超售时的升降级规则。

Allocation 聚合管理渠道分配：为不同渠道（OTA、官网、旅行社）分配可售房间配额，防止渠道间库存冲突。

## Boundaries

Rate-Inventory Context **不**处理实际预订（由 Reservations 负责），**不**管理渠道对接（由 Channel-Integration 负责），**不**生成收入报表（由 Reporting 负责）。它提供定价和库存的查询接口，供 Reservations 和 Channel-Integration 消费。
