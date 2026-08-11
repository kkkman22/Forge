---
context: reservations
started_at: "2026-05-10T09:00:00Z"
last_updated: 2026-08-11T10:30:00Z"
phase_completed: read_models
---

## Events

- **ReservationBooked** — 新预订已创建。来源：customer web booking
- **ReservationConfirmed** — 预订已支付保证金确认。来源：payment webhook
- **ReservationCancelled** — 预订被取消。来源：guest request / policy timeout
- **GuestCheckedIn** — 客人完成入住登记。来源：front desk
- **GuestCheckedOut** — 客人完成退房。来源：front desk / express checkout
- **NoShowDeclared** — 预订未入住超时声明。来源：night audit

## Commands

- **BookReservation** — 客人或前台提交预订请求
- **ConfirmReservation** — 支付保证金后确认预订
- **CancelReservation** — 取消预订（客人或系统发起）
- **CheckIn** — 前台办理入住
- **CheckOut** — 前台办理退房
- **DeclareNoShow** — 夜审声明未入住

## Aggregates

- **Reservation** — 由 Book/Confirm/Cancel/CheckIn/CheckOut/DeclareNoShow 构成。生命周期从 Booked 到 CheckedOut 或 Cancelled。
- **RoomAssignment** — 管理 check-in 时的房间分配

## Policies

- **AutoCancelOnPaymentTimeout** — 30 分钟未支付保证金自动取消。触发：ReservationBooked → CancelReservation
- **AutoNoShowOnMissedCheckIn** — 次日 cutoff hour 未入住声明 NoShow。触发：cutoff time → DeclareNoShow
- **ReleaseRoomOnCancel** — 取消后释放房间库存。触发：ReservationCancelled → 释放库存

## Read Models

- **OccupancyDashboard** — 从 CheckedIn/CheckedOut 投影实时入住率
- **ReservationCalendar** — 从 Booked/Cancelled/CheckedIn 投影预订日历视图
- **RevenueForecast** — 从 Confirmed/Cancelled 投影预期收入
