---
name: reservations
responsibility: "预订管理"
aggregates:
  - Reservation
inbound_events:
  - CheckInCompleted
outbound_events:
  - ReservationConfirmed
upstream:
  - front-desk
downstream:
  - billing
---

## 预订上下文

管理酒店房间预订的完整生命周期。
