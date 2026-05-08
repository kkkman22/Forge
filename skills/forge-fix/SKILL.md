---
name: forge-fix
description: "Fix a single identified defect with minimal change and without rerunning full build. Use when user runs `/forge fix`, debug phase has produced a confirmed root cause, or a small targeted correction is needed."
disable-model-invocation: true
---

# /forge fix — Fix Engine

> **触发方式**：路由器判定 WorkNature=bugfix 时自动进入，用户入口仍为 `/forge`
> **职责**：通过三阶段流程（analyze → apply → verify）执行结构化 Bug 修复，确保根因定位和验证闭环
> **输出路径**：`.forge/findings/fix-analysis.md`（分析结果）+ `.forge/findings/fix-note.md`（修复记录）+ 代码变更

---

## 1. Overview

`/forge fix` 是 Forge 工作流中专门处理 Bug 修复任务的 SKILL。当路由器通过 WorkNature 维度判定任务为 bugfix 性质时，自动分流到此工作流。用户无需记忆独立命令——入口仍然是 `/forge`。

**核心原则**：先定位根因，再定点修复，最后验证闭环。不靠推测修 bug，不做范围外改动，不跳过验证。

**触发方式**：由路由器 WorkNature=bugfix 自动分流。路由器通过关键词匹配（bug、报错、异常、崩溃、不工作、修复、fix、error、crash、broken、not working）识别 bugfix 任务。用户也可通过 `--nature=bugfix` 显式覆盖。

---

**Not For**：
- 非 review 产出的问题（用 forge-debug）
- P0 问题需要架构变更时（用 forge-debug）

## 2. Three-Phase Workflow

### 2.1 Analyze Phase (fix-analyze)

**职责**：通过实际读代码定位根因，产出结构化分析报告。

**产出**：`.forge/findings/fix-analysis.md`

**分析五步**：1. Locate (Grep/Glob → file:line) → 2. Reproduce (正常 vs 失败路径分叉) → 3. Confirm (根因分类: 逻辑/状态/数据/并发/配置/缺防御) → 4. Assess (影响面) → 5. Propose (2-3 方案+推荐)

**报告格式**：`.forge/findings/fix-analysis.md`（frontmatter: topic/date/status）+ Issue Location (file:line) + Root Cause (category: 逻辑/状态/数据/并发/配置/缺防御) + Impact Assessment + Fix Proposals (2-3 方案含推荐)。

**双模式行为**：interactive 展示分析结果等待用户选择方案；autonomous 自动选择推荐方案（`fix_analyze_confirm`，preset: `auto-recommend`）。

### 2.2 Apply 阶段（fix-apply）

按选定方案定点修复。**只改 analyze 声明的文件**，需改其他文件 → 回 analyze 更新。逐文件修复 → 每文件跑测试 → 全量验证。

### 2.3 Verify 阶段

验证清单：1. 复现验证（问题不再现） 2. 期望验证（行为符合预期） 3. 影响面回归（无回归） 4. 全量测试（全部通过）。产出 fix-note.md。Interactive 等待确认；autonomous 自动验证。

---

## 3. 日志调试升级机制

当修复未生效（verify 阶段验证失败）时：

1. **第 1 轮**：在关键路径添加日志 → 运行复现步骤 → 分析日志 → 调整修复 → 重新 apply + verify
2. **第 2 轮**（仍失败）：扩大日志范围 → 重新分析 → 调整修复
3. **2 轮后仍失败**：回到 analyze 阶段重新做根因分析

**规则**：日志调试最多 2 轮。日志调试完成后清理添加的日志代码。

---

## 4. fix-note.md 模板

修复完成后产出 `.forge/findings/fix-note.md`：frontmatter (topic/date/status:resolved) + 问题描述 / 根因 / 修复方案 / 改动文件 / 验证结果 / 经验总结。

---

## 5. 快速通道（Tier=light）

当路由器判定 Tier=light 且 WorkNature=bugfix 时，走快速通道。

**判定条件**：AI 读代码后能一眼确定根因、修复涉及 1-2 处改动、无跨模块风险。

**流程**：跳过 analyze 阶段，直接 `fix-apply → review`。apply 阶段直接根据任务描述和代码阅读执行修复，仍需运行验证。

---

## 6. 执行流程

1. 路由器判定 WorkNature=bugfix → Tier 判定
2. Tier=light → 直接 Apply；Tier=standard/full → Analyze → Apply
3. Apply → Verify
4. Verify 通过 → 产出 fix-note → Review → Test/Ship
5. Verify 失败 → 日志调试升级（最多 2 轮）→ 仍失败 → 回到 Analyze

---

## 7. 状态更新

| 当前阶段完成 | phase 更新为 |
|-------------|-------------|
| fix-analyze | fix-apply |
| fix-apply | review |

**Commit 策略**：fix-analyze 不 commit（仅产出分析文档）；fix-apply commit（产出代码变更）。

---

## 8. Known AI Failure Modes

| Failure | Wrong | Correct |
|---------|-------|---------|
| 不读代码猜根因 | 从错误信息推测 | 执行分析五步，Grep/Glob定位 |
| 范围外改动 | "顺手"重构 | 只改 analyze 声明的文件 |
| 跳过验证 | 不跑验证清单 | 逐项执行，每项有输出证据 |
| 只修症状 | null check/加大超时 | 追踪根因，修复根因非症状 |

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "P2不重要可跳过" | 积累降低健康度，现在修复成本最低 |
| "直接改代码更快" | 流程确保追踪+验证+记录，绕过质量保障 |
