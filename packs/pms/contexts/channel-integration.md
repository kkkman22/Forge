---
name: channel-integration
responsibility: "OTA/直连渠道对接：价格同步、库存同步、预订导入、消息转换"
aggregates:
  - ChannelConnection
  - ChannelMapping
  - SyncLog
  - MessageTranslator
inbound_events:
  - RateUpdated
  - InventoryChanged
  - ExternalBookingReceived
  - ExternalCancellationReceived
outbound_events:
  - ChannelSyncCompleted
  - ExternalBookingImported
  - MappingException
upstream:
  - rate-inventory
  - reservations
downstream:
  - reservations
  - rate-inventory
---

# Channel Integration Context

## Scope

Channel Integration Context 管理酒店与外部销售渠道（OTA、GDS、官网、微信小程序等）的数据同步。它是 PMS 的 Supporting 子域，但对酒店收入至关重要——渠道管理不善会导致超售或价格不一致。

ChannelConnection 聚合管理每个渠道的连接配置：认证信息、同步频率、支持的 API 版本。ChannelMapping 聚合处理房型映射：PMS 的房间类型与渠道的房间类型的对应关系，不同渠道可能使用不同的房间分类体系。

SyncLog 聚合记录每次同步的详细结果：成功/失败/部分成功、同步的记录数、发现并自动解决的冲突。MessageTranslator 聚合处理消息格式转换：将 PMS 内部事件格式转换为各渠道的 API 格式（如 OTA XML、JSON API）。

## Boundaries

Channel Integration Context **不**管理房价策略（由 Rate-Inventory 负责），**不**处理预订业务逻辑（由 Reservations 负责）。它是纯粹的技术集成层，负责数据格式转换和传输可靠性。
