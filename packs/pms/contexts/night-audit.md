---
name: night-audit
responsibility: "夜审与日结处理：营业日切换、自动过账、日终核对"
aggregates:
  - NightAuditSession
  - DailyRevenue
  - RoomRevenue
  - AuditException
inbound_events:
  - BusinessDayCutoff
  - FolioPosted
  - AuditDiscrepancy
outbound_events:
  - NightAuditCompleted
  - DailyRevenueReported
  - AuditExceptionRaised
  - BusinessDayRolled
upstream:
  - folio-billing
  - reservations
  - front-desk
downstream:
  - folio-billing
  - reporting
  - rate-inventory
---

# Night Audit Context

## Scope

Night Audit Context 是 PMS 的 Core 子域，负责每日营业结算。夜审通常在凌晨执行（依赖 BusinessDayClock 确定营业日边界），是酒店财务日和业务日的切换点。

NightAuditSession 聚合管理整个夜审流程：开始夜审 → 检查未处理预订 → 自动过账房费 → 核对收入 → 检查异常 → 完成日结。DailyRevenue 聚合汇总当日所有收入，按部门和类别分类。AuditException 聚合记录发现的异常（如房间状态不一致、未结算账单、手工干预记录）。

夜审完成后触发 Business Day Roll，所有系统的"今天"前进一天。这是 PMS 最复杂的时间相关操作，涉及跨日入住、跨月账单等边界场景。

## Boundaries

Night Audit Context **不**直接修改 Folio 内容（通过事件触发 Folio-Billing 过账），**不**管理房间状态（由 Housekeeping 负责），**不**生成最终财务报表（由 Reporting 负责）。它是日终协调者，确保所有系统在营业日切换时处于一致状态。
