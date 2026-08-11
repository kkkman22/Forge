# 借鉴 agency-agents — Spec 索引

> 调研 [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) 后提炼的 5 个可借鉴点,按 ROI 排序成独立 spec。
> 详见调研报告(会话历史)。各 spec 有单向依赖关系(无循环),建议按下文顺序落地。

## Spec 清单

| # | Spec | 优先级 | tier | 依赖 |
|---|------|--------|------|------|
| 1 | [unified-agent-source](./agency-borrow-01-unified-agent-source/) | P0 | standard | #4(i18n 决策,弱依赖) |
| 2 | [catalog-governance](./agency-borrow-02-catalog-governance/) | P1 | standard | #1(唯一源), #3(单向:section 名) |
| 3 | [agent-persona-template](./agency-borrow-03-agent-persona-template/) | P2 | light | #1(唯一源);被 #2 单向依赖 |
| 4 | [i18n-governance](./agency-borrow-04-i18n-governance/) | P2 | light | 无(决策类) |
| 5 | [install-wizard](./agency-borrow-05-install-wizard/) | P3 | light | #1(convert 生成器) |

## 建议落地顺序

1. **#4 i18n**(最快,产 ADR,解锁 #1 的 R4)
2. **#1 unified-agent-source**(核心,消除三目录漂移)
3. **#2 catalog-governance**(质量门禁,依赖 #1 的源)
4. **#3 agent-persona-template**(内容规范,依赖 #1)
5. **#5 install-wizard**(前瞻,待 marketplace 需求)

## 一句话总结

- #1 解决"agent 三目录漂移"硬伤(最高 ROI)
- #2 引入查重 + lint 门禁防内容腐化
- #3 标准化 agent 人格结构 + 铁律内嵌
- #4 定源语言策略(决策类)
- #5 前瞻性 agent 选择性安装(待需求)
