---
title: 修复 Bug 任务流
category: getting-started
audience:
- maintainer
updated: 2026-06-09
owner: forge-maintainers
---

[← 返回索引](../INDEX.md) | [English Version](./fix-bug.en.md)

# 修复 Bug 任务流

适用场景：已有功能出错、测试失败、CI 报错、用户报告回归。

## 你给 Forge 的输入

提供错误现象、复现步骤、相关日志或失败测试。范围越具体，Forge 越可能走轻量或标准路径。

```text
/forge 修复登录后跳回首页的问题。复现：打开 /login，输入正确账号，提交后仍停留在登录页。
```

## Forge 会做什么

- 判定这是 bugfix，而不是新功能。
- 小范围问题通常执行 `build -> review`。
- 影响面更大时执行 `plan -> build -> review -> test -> ship`。
- build 阶段先写失败测试，再修复，再重跑验证。

## 你需要决定什么

- 是否接受 Forge 对影响范围的判断。
- 当复现信息不足时，补充最小复现或允许 Forge 先做诊断。
- ship 阶段选择保留分支、创建 PR，或合并交付。

## 完成标准

- 原失败场景有测试或命令证据。
- review 没有 P0/P1。
- ship 前门禁引用最新验证证据。
