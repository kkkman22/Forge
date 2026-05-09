---
name: front-desk
responsibility: "前台接待操作：入住登记、退房处理、换房、客人咨询"
aggregates:
  - CheckIn
  - CheckOut
  - RoomMove
  - KeyCard
inbound_events:
  - ReservationConfirmed
  - WalkInRequest
  - CheckOutRequested
  - RoomMoveRequested
outbound_events:
  - GuestCheckedIn
  - GuestCheckedOut
  - RoomMoved
  - KeyCardIssued
  - KeyCardRevoked
upstream:
  - reservations
  - housekeeping
downstream:
  - folio-billing
  - housekeeping
---

# Front Desk Context

## Scope

Front Desk Context 处理酒店前台的所有面对面操作，是客人体验的直接触点。核心职责包括入住登记（Check-In）、退房处理（Check-Out）、换房操作（Room Move）和钥匙卡管理。

入住操作验证预订状态、确认房间就绪（与 Housekeeping 协作）、发放钥匙卡、触发 Folio 开账。退房操作结算账单、回收钥匙卡、释放房间并触发清洁任务。换房操作在保持同一预订关联的同时变更房间分配，需要同步更新 Housekeeping 和 Folio-Billing 的关联数据。

Walk-In（散客入住）是前台特有的流程：无需预订，直接根据可用房型和当前房价创建即时预订并入住。

## Boundaries

Front Desk Context **不**管理预订的创建和修改（由 Reservations 负责），**不**直接计算费用（由 Folio-Billing 负责），**不**管理房间清洁调度（由 Housekeeping 负责）。它是操作执行层，将 Reservations 的决策转化为实际的物理操作。
