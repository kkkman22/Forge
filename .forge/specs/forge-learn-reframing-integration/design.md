---
feature: forge-learn-reframing-integration
layout: design
created: 2026-06-04
---

# Design Document: `/forge learn` Reframing 日志集成

## 一、变更范围

极小改动 — 仅修改 `skills/forge/lib/learn/instructions.md`，在 learn 的知识提取流程中增加一个 Gate 日志分析步骤。

## 二、设计决策

### D1 — 为什么不新增独立命令？

**选择**：嵌入 `/forge learn` 的现有流程

**理由**：
- Gate 日志分析是"从开发中学习"的一种，属于 learn 的职责范围
- 用户不需要记住额外的命令
- learn 已经有完整的 evolved-rule 提升流程（§5.2），直接复用

### D2 — 为什么阈值是 50% + 3 样本？

**选择**：`outcome_changed=true` > 50% 且样本 ≥ 3

**理由**：
- < 3 样本时统计不显著，偶然性太高
- 50% 意味着"大多数时候这个问题改变了结果"，值得固化
- 用户仍需批准 evolved-rule，有最终把关

## 三、Blueprint Delta

| 路径 | 改动 |
|------|------|
| `skills/forge/lib/learn/instructions.md` | 增加 Gate 日志分析步骤 |

文件数净变化：新增 0，修改 1，删除 0。
