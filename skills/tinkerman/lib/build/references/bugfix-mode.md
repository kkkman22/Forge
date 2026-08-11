---
updated: 2026-08-11
---
# Bugfix Mode — forge-build 内部分支

> 当 `work_nature=bugfix` 时，build 进入 bugfix mode。
> 核心原则：先定位根因，再定点修复，最后验证闭环。

## 1. Pre-flight Checks（3 项入口约束）

任一命中 → 不得继续修复 → 结构化拒绝 → 回路由器。

| # | Check Item | Route on Hit |
|---|------------|-------------|
| 1 | **Non-review issue** — 问题非 review 产出 | → Use `/tinkerman debug` |
| 2 | **Requires architecture change** — P0 需架构变更 | → Use `/tinkerman debug` → ADR |
| 3 | **Insufficient description** — 无错误信息、无复现步骤 | → 补充信息，回路由 |

**Rejection**: `🚫 命中检查：<条目> 证据：<路径/分析> 建议：<路由> 重入：<条件>`

## 2. Analyze Phase (fix-analyze)

**职责**：通过读代码定位根因，产出结构化分析报告。

**产出**：`.forge/findings/fix-analysis.md`

**5 步分析**：
1. **Locate** — Grep/Glob → file:line
2. **Reproduce** — 正常 vs 失败路径分叉
3. **Confirm** — 根因分类（→ references/bugfix-method-library.md）：逻辑/状态/数据/并发/配置/缺防御
4. **Assess** — 影响面评估
5. **Propose** — 2-3 修复方案 + 推荐

**报告格式**：`.forge/findings/fix-analysis.md`（frontmatter: topic/date/status）+ Issue Location + Root Cause + Impact Assessment + Fix Proposals。

**Skip condition**: Tier=light 时跳过 analyze，直接 apply。

## 3. Apply Phase (fix-apply)

按选定方案定点修复。**只改 analyze 声明的文件**。需改其他文件 → 回 analyze 更新。

逐文件修复 → 每文件跑测试 → 全量验证。

## 4. Verify Phase

验证清单：
1. 复现验证（问题不再现）
2. 期望验证（行为符合预期）
3. 影响面回归（无回归）
4. 全量测试（全部通过）

产出 `.forge/findings/fix-note.md`（frontmatter: topic/date/status:resolved + 问题描述/根因/修复方案/改动文件/验证结果/经验总结）。

## 5. 日志调试升级机制

修复未生效（verify 阶段验证失败）时：

1. **第 1 轮**：关键路径添加日志 → 运行复现 → 分析 → 调整修复 → apply + verify
2. **第 2 轮**（仍失败）：扩大日志范围 → 重新分析 → 调整修复
3. **2 轮后仍失败**：回到 analyze 阶段重新做根因分析

日志调试完成后清理添加的日志代码。

## 6. Tier=light 快速通道

**入场条件**：AI 读代码后能一眼确定根因、修复涉及 1-2 处改动、无跨模块风险。

**流程**：跳过 analyze，直接 apply → verify → review。

## 7. Phase 更新 + Commit 策略

| 当前阶段完成 | phase 更新为 |
|-------------|-------------|
| fix-analyze | fix-apply |
| fix-apply | review |

fix-analyze 不 commit（仅产出分析文档）；fix-apply commit（产出代码变更）。

## Known AI Failure Modes

| Failure | Correct |
|---------|---------|
| 不读代码猜根因 | 执行分析五步，Grep/Glob 定位 |
| 范围外改动 | 只改 analyze 声明的文件 |
| 跳过验证 | 逐项执行，每项有输出证据 |
| 只修症状 | 追踪根因，修复根因非症状 |
