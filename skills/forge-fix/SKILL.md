---
name: forge-fix
description: "修复引擎。通过三阶段流程（analyze → apply → verify）执行结构化 Bug 修复。"
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

## 2. Three-Phase Workflow

### 2.1 Analyze Phase (fix-analyze)

**职责**：通过实际读代码定位根因，产出结构化分析报告。

**产出**：`.forge/findings/fix-analysis.md`

**分析五步**：

| Step | Action | Output |
|------|--------|--------|
| 1. Locate | 用 Grep/Glob 搜索相关代码，记录 file:line | 问题代码位置 |
| 2. Reproduce | 追踪正常路径 vs 失败路径的分叉点 | 失败路径描述 |
| 3. Confirm | 分类根因（逻辑/状态/数据/并发/配置/缺防御） | 根因分类 |
| 4. Assess | 评估影响面（哪些模块/功能受影响） | 影响面清单 |
| 5. Propose | 提出 2-3 种修复方案 + 推荐 | 方案选项 |

**分析报告格式**：

```markdown
---
topic: "<topic>"
date: "YYYY-MM-DD"
status: "analyzed"
---

## Issue Location
- **Position**: `<file>:<line>`
- **Failure Path**: <正常 vs 失败的分叉描述>

## Root Cause Analysis
- **Category**: <逻辑/状态/数据/并发/配置/缺防御>
- **Root Cause**: <具体描述>

## Impact Assessment
- <受影响的模块/功能>

## Fix Proposals
### Proposal A (Recommended)
- **Description** / **Files to Change** / **Risk**
### Proposal B
- **Description** / **Files to Change** / **Risk**
```

**双模式行为**：interactive 展示分析结果等待用户选择方案；autonomous 自动选择推荐方案（`fix_analyze_confirm`，preset: `auto-recommend`）。

### 2.2 Apply 阶段（fix-apply）

**职责**：按选定方案执行定点修复。

**范围约束规则**：

- **只改 analyze 中声明的文件**——不允许范围外改动
- 如果发现需要改动 analyze 未声明的文件，回到 analyze 阶段更新分析
- 每个改动必须有明确的根因关联

**流程**：按方案中的改动文件列表逐文件修复 → 每个文件修改后运行相关测试 → 所有修改完成后运行全量验证。

### 2.3 Verify 阶段

**职责**：执行验证清单，确认修复有效且无副作用。

**验证清单**：

| # | 验证项 | 方法 | 通过标准 |
|---|--------|------|---------|
| 1 | **复现验证** | 按原始复现步骤执行 | 问题不再出现 |
| 2 | **期望验证** | 验证修复后的期望行为 | 行为符合预期 |
| 3 | **影响面回归** | 运行影响面相关的测试 | 无回归 |
| 4 | **全量测试** | 运行项目完整测试套件 | 全部通过 |

**产出**：`.forge/findings/fix-note.md`

**双模式行为**：interactive 展示验证结果等待用户确认；autonomous 自动执行验证（`fix_apply_verify`，preset: `auto-verify`）。

---

## 3. 日志调试升级机制

当修复未生效（verify 阶段验证失败）时：

1. **第 1 轮**：在关键路径添加日志 → 运行复现步骤 → 分析日志 → 调整修复 → 重新 apply + verify
2. **第 2 轮**（仍失败）：扩大日志范围 → 重新分析 → 调整修复
3. **2 轮后仍失败**：回到 analyze 阶段重新做根因分析

**规则**：日志调试最多 2 轮。日志调试完成后清理添加的日志代码。

---

## 4. fix-note.md 模板

每次修复完成后必须产出 fix-note.md：

```markdown
---
topic: "<主题>"
date: "YYYY-MM-DD"
status: "resolved"
---

## 问题描述 / 根因 / 修复方案 / 改动文件 / 验证结果 / 经验总结
```

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

## 8. 已知 AI 失败模式

| 失败模式 | 错误行为 | 正确做法 |
|---------|---------|---------|
| 不读代码就猜根因 | 根据错误信息直接推测根因，不实际读取代码 | 严格执行分析五步，用 Grep/Glob 定位代码，追踪正常/失败路径分叉点 |
| 修复范围外的代码 | "顺手"重构旁边代码或修改 analyze 未声明的文件 | 只修改 analyze 报告中声明的文件，需改其他文件则回到 analyze 更新 |
| 跳过验证就声称修复 | 修改代码后不运行验证清单直接声称"bug 已修复" | 逐项执行验证清单，每项有实际命令输出作为证据 |
| 只修表面症状不修根因 | 加 null check / 加大超时 / 加数据修复脚本 | 追踪到根因（为什么 null？为什么超时？），修复根因而非症状 |
