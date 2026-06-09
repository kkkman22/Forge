---
title: Policy Profiles 指南
category: reference
audience:
- maintainer
updated: 2026-06-09
owner: forge-maintainers
---

[← 返回索引](../INDEX.md) | [English Version](./policy-profiles.en.md)

# Policy Profiles 指南

Forge 用 `policy_profile` 控制流程成本。缺省值是 `team`，因此既有项目不会因为升级而放松门禁。

## 可选 Profile

| Profile | 适用场景 | Review | Evidence | Mutation | Force Skip |
|---------|----------|--------|----------|----------|------------|
| `solo` | 个人项目、快速迭代 | basic | optional | optional | basic log |
| `team` | 默认团队协作 | required | required review/test | optional | required audit |
| `enterprise` | 合规或高风险交付 | full | required review/test/artifacts | required selected groups | approval artifact |

## 配置方式

在 `.forge/config.md` 添加：

```yaml
policy_profile: enterprise
```

无配置或无效值会回退到 `team`，并输出诊断。

## 选择建议

- 默认使用 `team`。
- 只有在个人项目且能接受较低流程成本时使用 `solo`。
- 需要可审计证据链、强制 artifact freshness 或 mutation gate 时使用 `enterprise`。
