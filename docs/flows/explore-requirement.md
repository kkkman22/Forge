---
title: 探索模糊需求任务流
category: getting-started
audience:
- maintainer
updated: 2026-06-09
owner: forge-maintainers
---

[← 返回索引](../INDEX.md) | [English Version](./explore-requirement.en.md)

# 探索模糊需求任务流

适用场景：你知道问题方向，但还没有明确方案、范围或验收标准。

## 你给 Forge 的输入

描述目标、约束、已知风险，以及你不确定的地方。

```text
/forge 设计一个更可靠的发布前检查流程。现在 review/test/ship 的证据经常散落，用户不知道下一步为什么被阻断。
```

## Forge 会做什么

- 走全量路径：`decide -> spec -> plan -> build -> review -> test -> ship -> learn`。
- decide 阶段比较产品、架构和安全方向。
- spec 阶段把模糊目标固化成可验收要求。
- plan 阶段再拆成可执行任务。

## 你需要决定什么

- decide 输出的方向是否正确。
- spec 是否锁定，或需要继续修改。
- plan 是否批准执行。

## 完成标准

- 模糊目标转化为明确 requirements/design/tasks。
- 每个关键取舍有决策记录。
- 实现后的证据链能说明为什么完成。
