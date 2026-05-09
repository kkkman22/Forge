---
name: front-desk
responsibility: "前台管理"
aggregates:
  - Room
inbound_events:
  - ReservationConfirmed
outbound_events:
  - CheckInCompleted
upstream: []
downstream:
  - reservations
---

## 前台上下文

管理房间物理状态和入住/退房流程。
