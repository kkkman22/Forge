---
name: night-audit
description: "Night Audit Context 术语"
terms:
  - term: Cutoff Time
    aliases: [切日时间, 截止时间]
    definition: "营业日切换的时间点（如凌晨 4:00），由 BusinessDayClock 管理"
  - term: Room Revenue
    aliases: [客房收入, 房费收入]
    definition: "当日所有客房产生的收入总额"
  - term: Room Tax
    aliases: [房税, 住宿税]
    definition: "基于房费计算的税费，按地方法规征收"
  - term: Trial Balance
    aliases: [试算平衡]
    definition: "夜审过程中的财务核对步骤，验证借贷平衡"
  - term: Daily Flash
    aliases: [日报快报, Flash Report]
    definition: "夜审完成后生成的当日运营数据快照"
  - term: Audit Exception
    aliases: [审计异常, 审计例外]
    definition: "夜审过程中发现的异常情况，需要人工关注和处理"
  - term: Auto Posting
    aliases: [自动过账]
    definition: "夜审时自动将当日房费过账到每个在住客人的 Folio"
  - term: Business Day Roll
    aliases: [营业日切换, 日结翻日]
    definition: "夜审完成后将系统营业日前进一天的流程"
  - term: Room Count
    aliases: [房量统计]
    definition: "夜审时的房间状态统计：空闲/入住/维修/锁定的房间数"
  - term: No-Show Processing
    aliases: [未到处理]
    definition: "夜审时自动将超过到店截止时间仍未入住的确认预订标记为 NoShow"
  - term: Rate Verification
    aliases: [房价验证]
    definition: "夜审核对每间在住房的房价是否正确"
  - term: Ledger Reconciliation
    aliases: [分类账核对]
    definition: "核对客人分类账和应收分类账与总账的一致性"
