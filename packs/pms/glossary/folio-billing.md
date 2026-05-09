---
name: folio-billing
description: "Folio-Billing Context 术语"
terms:
  - term: Folio
    aliases: [账单, 客账]
    definition: "记录客人住店期间所有费用和支付的账务文档。一个预订可关联多个 Folio"
  - term: Folio Line Item
    aliases: [账目, 费用明细, 账务条目]
    definition: "Folio 中的单笔交易记录：费用或支付"
  - term: Posting
    aliases: [过账, 记账]
    definition: "将费用或支付记录到 Folio 上的操作"
  - term: Guest Ledger
    aliases: [客人分类账]
    definition: "所有在住客人 Folio 的汇总，夜审时需要核对"
  - term: City Ledger
    aliases: [应收分类账, 公司账]
    definition: "挂账到公司或旅行社的 Folio，需要后续对账收款"
  - term: Payer
    aliases: [付款人, 结账人]
    definition: "实际支付 Folio 费用的人，可能是客人本人或公司"
  - term: Room Charge
    aliases: [房费]
    definition: "按夜计算的房间使用费用，夜审时自动过账"
  - term: Allowance
    aliases: [减免, 折扣]
    definition: "对已过账费用的减少，如经理免单、投诉补偿"
  - term: Settlement
    aliases: [结算, 结账]
    definition: "Folio 的最终支付处理，关闭账单"
  - term: Void
    aliases: [作废, 冲正]
    definition: "将已过账的错误账目标记为无效，需要审计追踪"
  - term: Transfer
    aliases: [转账, 转账到另一账单]
    definition: "将费用从一个 Folio 转移到另一个 Folio"
  - term: Split Folio
    aliases: [拆账, 分账]
    definition: "将一个 Folio 的费用拆分到多个 Folio，如公司与个人各付一部分"
