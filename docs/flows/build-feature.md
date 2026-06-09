---
title: 构建明确功能任务流
category: getting-started
audience:
- maintainer
updated: 2026-06-09
owner: forge-maintainers
---

[← 返回索引](../INDEX.md) | [English Version](./build-feature.en.md)

# 构建明确功能任务流

适用场景：需求边界清楚，已有验收条件或现成 Spec。

## 你给 Forge 的输入

描述目标用户、功能行为、边界条件和验收方式。

```text
/forge 给导出功能增加 CSV 格式，要求保留现有 JSON 导出，新增测试覆盖空数据和中文字段。
```

## Forge 会做什么

- 走标准路径：`plan -> build -> review -> test -> ship`。
- plan 阶段拆成可验证的原子任务。
- build 阶段按 RED/GREEN/REFACTOR 推进。
- review 阶段由独立检查者查需求、质量和安全。

## 你需要决定什么

- plan 是否覆盖了必要场景。
- 是否接受任何 scope 调整。
- ship 阶段采用 PR、合并或保留。

## 完成标准

- 所有计划任务完成。
- 新功能有直接测试覆盖。
- 文档或示例在用户可见行为变化时同步更新。
