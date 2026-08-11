---
feature: agency-borrow-05-install-wizard
layout: design
created: 2026-06-23
spec_ref: ".forge/specs/agency-borrow-05-install-wizard/requirements.md"
---

# Agent 安装向导 — 设计文档

## 概述

前瞻性、低优先级 spec。核心是"是否引入 + 用什么形式"的决策,而非立即实现。设计文档列出权衡,建议方案 A(朴素 read 扩展)为默认。

## 设计决策

### D1: 交互形式——朴素 read vs alt-screen TUI

- **问题**:若要做 agent 选择性安装,用哪种交互?
- **候选 A:朴素 read 扩展**。在 `init.sh` 现有 `read -rp` 基础上加一个多选步骤。零新代码,约 30 行。
- **候选 B:alt-screen TUI**(移植 agency-agents `lib.sh`)。方向键勾选、分组浏览。体验佳,但 `lib.sh` 第 4 节 TUI 原语(~150 行)+ 测试成本高。
- **选择**:倾向 **A**。理由:Forge 当前 agent 规模小(spec#1 快照约 25 个),一屏 `read` 多选足够;alt-screen TUI 是 agency-agents 为 184 agent + 16 division + 13 工具的规模设计的,Forge 用不上。若未来 marketplace 规模爆发再升级 B。
- **风险**:方案 A 体验粗陋。**缓解**:多选提示用编号 + 分组(`[review] 1.spec-check 2.quality-check...`),清晰度够。

### D2: 与 convert 生成器的协同

- **问题**:选定子集后如何只装这些?
- **选择**:spec #1 的 `convert-agents.mjs` 已支持 `--tool` 限定工具;本 spec 扩展 `--agent <slug>` 限定 agent。向导收集用户选择后,调 `convert-agents.mjs --agent <选中列表>`。
- **理由**:复用 spec #1 生成器,不重复实现安装逻辑。

## 风险

| 风险 | 缓解 |
|------|------|
| 过早实现,实际无 marketplace 需求 | 标 P3,明确"待 marketplace 需求明确后落地";当前只产 ADR |
| 方案 A 在 agent 增多后体验下降 | 预留升级到 B 的路径;agent 分组(spec #2 R3 的 divisions)可作为未来分组浏览的基础 |
