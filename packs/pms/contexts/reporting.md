---
name: reporting
responsibility: "运营报表与数据分析：收入报告、入住率统计、渠道绩效"
aggregates:
  - DailyReport
  - OccupancyReport
  - RevenueReport
  - ChannelPerformanceReport
inbound_events:
  - NightAuditCompleted
  - DailyRevenueReported
  - ReservationConfirmed
  - ReservationCancelled
  - ChannelSyncCompleted
outbound_events: []
upstream:
  - night-audit
  - folio-billing
  - reservations
  - channel-integration
downstream: []
---

# Reporting Context

## Scope

Reporting Context 是 PMS 的 Generic 子域，提供运营数据的汇总、统计和可视化。它从其他 Context 消费事件数据，生成各类管理报表。

DailyReport 聚合汇总每日运营指标：入住率（Occupancy Rate）、平均房价（ADR - Average Daily Rate）、每间可售房收入（RevPAR - Revenue Per Available Room）。OccupancyReport 聚合提供多维度的入住分析：按房型、按渠道、按时间段的入住率趋势。

RevenueReport 聚合处理收入分析：房费收入、非房费收入（餐饮、SPA 等）、渠道收入占比。ChannelPerformanceReport 聚合评估各渠道的绩效：预订量、取消率、平均房价、佣金成本。

报表支持按日/周/月/季度/年维度查看，支持与历史同期对比。

## Boundaries

Reporting Context 是只读的数据消费方，**不**修改任何业务数据，**不**参与业务流程的决策（决策由各 Context 自己负责），**不**直接查询数据库（通过事件投影构建读模型）。
