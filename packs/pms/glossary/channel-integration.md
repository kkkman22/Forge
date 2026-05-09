---
name: channel-integration
description: "Channel Integration Context 术语"
terms:
  - term: Channel
    aliases: [渠道, 销售渠道]
    definition: "酒店房间的销售来源：OTA、GDS、官网、微信、电话等"
  - term: Channel Manager
    aliases: [渠道管理器]
    definition: "管理多个渠道库存和价格同步的系统或模块"
  - term: Rate Mapping
    aliases: [价格映射]
    definition: "PMS 内部价格方案与渠道价格代码的对应关系"
  - term: Room Mapping
    aliases: [房型映射]
    definition: "PMS 内部房型与渠道房型的对应关系，不同渠道可能使用不同分类"
  - term: ARI
    aliases: [Availability-Rate-Inventory]
    definition: "Availability, Rate, Inventory — 向渠道推送的三类核心数据"
  - term: Booking Confirmation
    aliases: [预订确认回调]
    definition: "渠道在客人完成预订后通知 PMS 的机制"
  - term: Commission
    aliases: [佣金, 手续费]
    definition: "OTA 从每笔预订中收取的费用，通常为房价的百分比"
  - term: Commission Report
    aliases: [佣金报表]
    definition: "汇总各渠道佣金费用的报表，用于财务对账"
  - term: Sync Frequency
    aliases: [同步频率]
    definition: "PMS 与渠道之间的数据同步间隔"
  - term: Rate Parity
    aliases: [价格一致性, 平价条款]
    definition: "各渠道之间保持相同房价的商业约束"
  - term: Last Room Availability
    aliases: [最后房间可用性, LRA]
    definition: "渠道要求在所有渠道售罄前保持供应的合同条款"
  - term: Stop Sell
    aliases: [停止销售]
    definition: "主动通知渠道停止销售特定日期或房型"
