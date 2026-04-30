---
name: forge-fix
description: "修复引擎。通过三阶段流程（analyze → apply → verify）执行结构化 Bug 修复。"
disable-model-invocation: true
---

# /forge fix — 修复引擎

> **触发方式**：路由器判定 WorkNature=bugfix 时自动进入，用户入口仍为 `/forge`
> **职责**：通过三阶段流程（analyze → apply → verify）执行结构化 Bug 修复，确保根因定位和验证闭环
> **输出路径**：`.forge/findings/fix-analysis.md`（分析）+ `.forge/findings/fix-note.md`（修复记录）+ 代码变更

---

## 1. 概述

`/forge fix` 专门处理 Bug 修复任务。路由器通过关键词匹配（bug/报错/异常/崩溃/修复/fix/error/crash/broken 等）识别 bugfix 任务，或用户通过 `--nature=bugfix` 指定。

**核心原则**：先定位根因，再定点修复，最后验证闭环。不靠推测修 bug，不做范围外改动，不跳过验证。

---

## 2. 三阶段流程

### 2.1 Analyze 阶段（fix-analyze）

通过实际读代码定位根因，产出 `.forge/findings/fix-analysis.md`。

**分析五步**：定位（Grep/Glob 搜索，记录 file:line）→ 还原（追踪正常 vs 失败路径分叉点）→ 确认（分类根因：逻辑/状态/数据/并发/配置/缺防御）→ 评估（影响面）→ 方案（2-3 种 + 推荐）。

**分析报告字段**：frontmatter（topic/date/status: "analyzed"）+ 问题定位（位置/失败路径）+ 根因分析（分类/根因）+ 影响面评估 + 修复方案（每个方案含描述/改动文件/风险）。

**双模式**：interactive 展示等用户选择方案；autonomous 自动选推荐方案（`fix_analyze_confirm`，preset: `auto-recommend`）。

### 2.2 Apply 阶段（fix-apply）

按选定方案执行定点修复。**只改 analyze 中声明的文件**——需改其他文件则回到 analyze 更新。每个改动必须有根因关联。逐文件修复 → 每个文件后运行相关测试 → 全部完成后全量验证。

### 2.3 Verify 阶段

| # | 验证项 | 通过标准 |
|---|--------|---------|
| 1 | 复现验证 | 问题不再出现 |
| 2 | 期望验证 | 行为符合预期 |
| 3 | 影响面回归 | 无回归 |
| 4 | 全量测试 | 全部通过 |

产出 `.forge/findings/fix-note.md`。**双模式**：interactive 等用户确认；autonomous 自动验证（`fix_apply_verify`，preset: `auto-verify`）。

---

## 3. 日志调试升级机制

Verify 失败时：第 1 轮添加日志 → 分析 → 调整修复 → re-apply + verify。第 2 轮扩大日志范围。2 轮后仍失败 → 回 analyze 重新根因分析。调试完成后清理日志代码。

---

## 4. fix-note.md 模板

frontmatter（topic/date/status: "resolved"）+ 问题描述 / 根因 / 修复方案 / 改动文件 / 验证结果 / 经验总结。

---

## 5. 快速通道（Tier=light）

判定条件：一眼确定根因、1-2 处改动、无跨模块风险。跳过 analyze，直接 `fix-apply → review`。仍需运行验证。

---

## 6. 执行流程

1. 路由器判定 bugfix → Tier 判定
2. light → 直接 Apply；standard/full → Analyze → Apply
3. Apply → Verify → 通过 → fix-note → Review → Test/Ship
4. Verify 失败 → 日志调试（≤2 轮）→ 仍失败 → 回 Analyze

---

## 7. 状态更新

| 当前阶段完成 | phase 更新为 |
|-------------|-------------|
| fix-analyze | fix-apply |
| fix-apply | review |

fix-analyze 不 commit；fix-apply commit（代码变更）。

---

## 8. 已知 AI 失败模式

| 失败模式 | 错误行为 | 正确做法 |
|---------|---------|---------|
| 不读代码就猜根因 | 根据错误信息推测 | 严格分析五步，Grep/Glob 定位 + 追踪路径分叉 |
| 修复范围外代码 | "顺手"重构旁边代码 | 只改 analyze 声明的文件，需改其他则回 analyze |
| 跳过验证声称修复 | 不运行验证清单 | 逐项执行，每项有命令输出证据 |
| 只修表面症状 | 加 null check/加大超时 | 追踪根因（为什么 null？为什么超时？），修复根因 |
