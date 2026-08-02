---
id: "ADR-0009"
title: "P2 zcode-p2-native-architecture supersedes P1 non-goals (建 shim / 动治理 / 完整 compact 补偿)"
status: proposed
date: "2026-08-02"
deciders:
  - "@maintainer"
related_adrs:
  - "ADR-0008"
supersedes_non_goals_of: "zcode-p1-base-integration"
---

# ADR-0009: P2 supersedes P1 non-goals（建 shim / 动治理 / 完整 compact 补偿）

## Context

P1 Spec `zcode-p1-base-integration`（status: locked）显式排除三项,推迟到 P2-P5：

1. **不建 platform-paths 跨平台 shim**（v2 已撤销,但 P1 维持该约束）
2. **不动 plan/build/review/ship 治理逻辑**（P2-P5）
3. **不处理 PreCompact 不支持的完整补偿**（仅 Stop 最小补偿,P4 纪律恢复）

P1 的约束在"基础接入"阶段正确——P1 只验证"插件格式兼容",不动内核架构。但 P2
`zcode-p2-native-architecture` 已提出 **运行期 HostAdapter 架构 + capability-driven 治理派生**,
这两项**正是 P1 non-goals #1 和 #2 描述的工作**。继续受 P1 non-goals 约束会导致 P2 无法落地。

宪法 §5 自演化协议规定:Propose → Declare → Approve → Log。本 ADR 是 **Propose + Declare** 阶段。
P1 Spec frontmatter 不直接改（locked 不可改）,而是由 P2 Spec frontmatter `supersedes` 字段
显式声明仅 supersede non-goals,P1 已落地的 R1-R6 实现保留为 fallback 安全网。

## Decision

P2 Spec `zcode-p2-native-architecture` **正式 supersede P1 的三条 non-goals**（仅 non-goals）:

| P1 non-goal | P2 处置 | 依据 |
|---|---|---|
| 不建 platform-paths shim | **supersede** → P2 引入运行期 HostAdapter（这是"shim"的架构升级版） | docs/zcode-dual-platform-adaptation.md §0.1 §2.5 |
| 不动 plan/build/review/ship 治理逻辑 | **supersede** → P2 经 HostAdapter.governance() 注入 capability-driven 治理参数 | §0.3 可改 vs 不可改边界 |
| 不处理完整 compact 补偿 | **supersede** → P2 验证/完善 compact 补偿链（PreCompact + PostCompact + Stop 补偿） | §3.2 recap 委托 / §4.5 Stop 补偿 |

**不 supersede** 的 P1 non-goals（P2 仍遵守）:
- 不改 mjs 脚本为 .sh（P2 维持）
- 不改 hooks.json 事件结构（P2 维持,不支持事件静默跳过是设计预期）

**P1 实现保留为 fallback 安全网**:
- `.zcode/config.json` 生成（P1 R1）
- `scripts/lib/zcode-platform.mjs` 探测+裁剪（P1 R2）
- 三项验证脚本（P1 R3/R4/R5）+ 透明回归（P1 R6）

## Consequences

- **正向**:P2 可落地 HostAdapter + capability-driven 治理;P1 fallback 保留双保险。
- **负向**:P2 引入运行期 shim 复杂度（单例注入,探测开销 <1ms,可接受）。
- **后续**:supersede 需 maintainer Approve（§5 协议);批准后本 ADR status → accepted。
- **不碰**:宪法 §5.6 iron laws（TDD/验证/三振/隔离评审/P0-P1/Knowledge/Frozen Zone/Spec 系统）
  —— 这些是 immutable,不在本 ADR 范围,需独立的宪法修正（§5.5）。
