---
name: folio-billing
responsibility: "账单与费用管理：账务记录、结算、退款、审计追踪"
aggregates:
  - Folio
  - FolioLineItem
  - Payment
  - Refund
inbound_events:
  - GuestCheckedIn
  - ChargePosted
  - PaymentReceived
  - RefundRequested
  - NightAuditCompleted
outbound_events:
  - FolioOpened
  - FolioPosted
  - FolioClosed
  - FolioVoided
  - PaymentProcessed
upstream:
  - reservations
  - front-desk
  - night-audit
downstream:
  - night-audit
  - reporting
---

# Folio-Billing Context

## Scope

Folio-Billing Context 是 PMS 的 Core 子域，管理所有与金钱相关的操作。Folio（账单）是核心聚合，记录客人在住店期间产生的所有费用和支付。

每个预订关联一个或多个 Folio（主账单、额外账单、公司账单）。FolioLineItem 记录每笔交易：房费、餐饮、迷你吧、洗衣、损坏赔偿等。Payment 聚合处理支付方式（现金、信用卡、公司挂账、预付）和支付状态。

状态机严格控制 Folio 生命周期（Open → Posted → Closed / Voided），其中 Closed Folio 不可重新打开（除非通过 Void → Open 路径），这是核心业务不变量——防止篡改已结算账单。

## Boundaries

Folio-Billing Context **不**管理房价策略（由 Rate-Inventory 负责），**不**处理夜审的业务逻辑（由 Night-Audit 负责，但夜审会触发 Folio 的过账操作）。它提供精确的财务记录和审计追踪，是酒店财务合规的基础。
