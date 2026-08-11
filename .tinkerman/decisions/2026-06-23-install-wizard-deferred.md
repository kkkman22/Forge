---
id: "ADR-0011"
title: "Agent 选择性安装:暂不实现,记录前瞻决策"
status: "accepted"
date: "2026-06-23"
deciders:
  - "@king (Gruby.Wang)"
related_adrs:
  - "ADR-0010"
---

# ADR-0011: Agent 选择性安装 — 暂不实现

## Context

spec#5(`agency-borrow-05-install-wizard`)源自调研 agency-agents 的 install.sh 交互式向导(允许用户勾选安装哪些 agent 子集)。原 spec 是前瞻性、P3 优先级,待 marketplace 需求明确后落地。

实现前核实发现:
- Forge 当前 `init.sh` 已有朴素 `read -rp` 交互(项目名/技术栈/安全级别),不是 alt-screen TUI,但够用。
- Forge 没有 agent marketplace 需求(`.claude-plugin/marketplace.json` 是分发机制,非"用户选 agent 子集")。
- ADR-0010 后,`init.sh` 从 `agents/` 唯一源复制 7 个精选 agent 到用户项目(L778-794),已是"子集安装"的简朴实现。

## Decision

**暂不实现 agent 选择性安装向导。** 理由:

1. **无明确需求**:项目不规划 agent marketplace,当前全量/7-agent 子集安装满足需求。
2. **现有机制够用**:`init.sh` 的子集复制 + `--agents` flag 可在需要时低成本扩展(方案 A,约 30 行)。
3. **避免过度工程**:agency-agents 的 alt-screen TUI(方案 B)是为 184-agent + 16-division + 13-工具规模设计,Forge 用不上。

**若未来需要**:`init.sh` 加 `--agents <slug,slug>` flag(方案 A),convert 不适用(已改 symlink,见 ADR-0010),改为 symlink 选择性创建。预计 ~30 行,触发条件为 marketplace 或子集需求明确。

## Consequences

- **正向**:不引入无需求的功能,保持 init.sh 精简。
- **负向**:用户无法选择性地只装部分 agent(当前 init 装 7 个固定子集)。可接受——这是设计意图。

## 影响的 spec

- **spec#5**(`install-wizard`):标记为"暂不实现",本 ADR 关闭其决策需求。Task 2/3(条件性实现)搁置。

## 参考

- spec#5: `.tinkerman/specs/agency-borrow-05-install-wizard/`
- ADR-0010: symlink 统一架构(本 ADR 的前提)
