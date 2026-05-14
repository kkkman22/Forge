# Bugfix Mode

> forge-build 内部分支模式。`work_nature=bugfix` 时由 build SKILL 读取本文件。

## Pre-flight Checks

修复启动前必须逐条验证。**任一命中不得继续**。

| # | Check Item | Route on Hit |
|---|------------|-------------|
| 1 | **Not from review output** | → Use `/forge debug` |
| 2 | **Requires architecture change** | → Use `/forge debug` (trigger ADR) |
| 3 | **Description insufficient** (no error msg, no reproduction steps) | → Prompt for info, return to router |

**Rejection**: `🚫 命中检查：<条目> 证据：<路径/分析> 建议：<路由> 重入：<条件>`

## Phases

### Analyze (tier=standard/full)

通过实际读代码定位根因，产出 `.forge/findings/fix-analysis.md`。

**5-Step Analysis**:

1. **Locate** — Grep/Glob → file:line
2. **Reproduce** — Normal vs failure path divergence
3. **Confirm** — Root cause classification (→ bugfix-method-library.md): 逻辑/状态/数据/并发/配置/缺防御
4. **Assess** — Impact scope evaluation
5. **Propose** — 2-3 fix proposals with recommendation

Report format: `.forge/findings/fix-analysis.md` (frontmatter: topic/date/status) + Issue Location + Root Cause + Impact + Fix Proposals.

### Apply

按选定方案定点修复。**只改 analyze 声明的文件**，需改其他文件 → 回 analyze 更新。

逐文件修复 → 每文件跑测试 → 全量验证。

Commit 策略：analyze 不 commit；apply commit。

### Verify

验证清单：1. 复现验证（问题不再现） 2. 期望验证（行为符合预期） 3. 影响面回归（无回归） 4. 全量测试（全部通过）。

产出 `.forge/findings/fix-note.md`。

## Log Escalation (max 2 rounds)

修复未生效时：

1. **Round 1**: 关键路径添加日志 → 运行复现 → 分析 → 调整修复 → apply + verify
2. **Round 2** (still fails): 扩大日志范围 → 重新分析 → 调整修复
3. **2 rounds exhausted**: 回 analyze 重新做根因分析

日志调试完成后清理添加的日志代码。

## Light Tier Fast-Track

**条件**：AI 能一眼确定根因、修复涉及 1-2 处改动、无跨模块风险。

**流程**：跳过 analyze，直接 apply → review。apply 仍需运行验证。

## Phase Transitions

| 当前阶段完成 | phase 更新为 |
|-------------|-------------|
| fix-analyze | fix-apply |
| fix-apply | review |

## fix-note.md Template

修复完成后产出 `.forge/findings/fix-note.md`：frontmatter (topic/date/status:resolved) + 问题描述 / 根因 / 修复方案 / 改动文件 / 验证结果 / 经验总结。

## Escape Hatch

- `--nature=bugfix` 显式覆盖 router 判定
- `/forge fix` 子命令直接进入 bugfix mode
- 预检不通过 → 结构化拒绝 → 回路由器
