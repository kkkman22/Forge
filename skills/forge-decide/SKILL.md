---
name: forge-decide
description: "四视角前置决策引擎。以两轮 Subagent 模式从产品、架构、安全、设计视角进行系统性评估。"
disable-model-invocation: true
---

# /forge decide — 决策引擎

> **触发方式**：全量路径的第一步，或用户直接输入 `/forge decide`
> **职责**：以两轮 Subagent 模式从产品、架构、安全、设计四个视角进行前置决策，在编码前明确问题边界、风险和技术方向
> **Agent 模式**：两轮 Subagent（Round 1 并行视角评估，Round 2 Critic 交叉审查）

---

## 1. 概述

`/forge decide` 在编码开始前，从四个独立视角对任务进行系统性评估。三个核心视角（产品、架构、安全）始终参与，设计视角仅在任务涉及 UI 变更时动态加入。

每个视角由独立的 Subagent 承担，通过两轮 Subagent 模式协作，确保视角之间可以相互质疑和补充。

**核心原则**：先想清楚，再动手。决策阶段的投入远低于返工的代价。

---

## 2. 两轮 Subagent 执行

使用 Agent tool 独立启动视角 Subagent，无需创建 Agent Team。

### Round 1 — 视角 Subagent（并行启动）

**默认成员**（3 个，始终参与）：

| Subagent 名称 | 定义文件 | 职责 |
|---------|--------------|------|
| product | `.claude/agents/product.md` | 产品视角 — 苏格拉底式提问 |
| architect | `.claude/agents/architect.md` | 架构视角 — 技术方案评估 |
| security | `.claude/agents/security.md` | 安全视角 — OWASP + STRIDE |

**动态成员**（条件触发）：

| Subagent 名称 | 定义文件 | 触发条件 |
|---------|--------------|---------|
| designer | `.claude/agents/designer.md` | 任务涉及 UI 变更时加入 |

**启动方式**：使用 Agent tool 同时启动 3 或 4 个独立 Subagent（含 UI 时加 designer），使用 `Promise.allSettled` 等待所有 Subagent 完成。**每个视角输出限制在 500 tokens 以内**。

**Designer 条件触发**：仅当 `involvesUIChanges()` 返回 true 时加入。判定信号：任务描述提及前端/UI/页面/组件/样式、涉及的文件含 UI 扩展名（`.tsx`/`.jsx`/`.vue`/`.svelte`/`.css`）、任务涉及用户交互流程变更。不触发：纯后端 API、数据库变更、CI/CD、纯逻辑重构。

### Round 2 — Critic Subagent（串行，Round 1 完成后启动）

收集 Round 1 所有视角输出，启动 Critic Subagent 审查所有视角输出，寻找盲点和矛盾。

**Critic 规则**：
- 必须在所有 Round 1 视角输出完毕后才能审查
- 如果发现阻塞性问题 → 标记 `needs_revision`，相关视角修正后重新输出
- 标记 `needs_revision` 时返回具体哪些视角需要修正以及理由

**容错机制**：Round 1 使用 `Promise.allSettled`，单个视角失败不阻断其他。失败的视角标注"评估失败"。如果所有 Round 1 Subagent 均失败，决策终止并向用户报告。

---

## 3. 四视角评估

**约束**：每个角色输出限制在 **500 tokens 以内**。安全视角**不可跳过**。各视角独立输出，但可以引用和质疑其他视角的结论。

### 3.1 产品视角（product.md）

以苏格拉底式提问厘清问题本质：问题定义、目标用户、成功标准。

**行为规则**：一次只问一个问题，不给答案只提问，模糊回答则追问具体化。

**输出格式**：

```markdown
### 产品定义

**问题**：<一句话描述要解决的核心问题>
**用户**：<目标用户和使用场景>
**成功标准**：- <可衡量的标准>
**边界**：<明确不做什么>
```

### 3.2 架构视角（architect.md）

评估技术方案的合理性和风险：技术选型合理性、架构风险、扩展性、兼容性。

**输出格式**：

```markdown
### 技术方案

**选型**：<技术选型及理由>
**风险**：- <风险>：<影响> / <缓解措施>
**扩展性**：<扩展性评估>
**兼容性**：<与现有系统的兼容性评估>
```

### 3.3 安全视角（security.md）

基于 OWASP Top 10 和 STRIDE 进行威胁建模。**此视角不可跳过**，即使任务看起来与安全无关。结论可以是"无显著安全风险"，但过程不能省略。

**输出格式**：

```markdown
### 安全评估

**OWASP 检查**：- <相关项>：<风险等级> — <说明>
**STRIDE 分析**：- <相关威胁>：<说明> / <建议措施>
**结论**：<整体安全评估结论>
```

### 3.4 设计视角（designer.md）— 条件触发

评估 UI/UX 方面的可用性、可访问性和一致性。仅当 `involvesUIChanges()` 返回 true 时动态加入。

**输出格式**：

```markdown
### 设计评估

**可用性**：<评估结论>
**可访问性**：<WCAG 相关建议>
**一致性**：<与现有设计系统的一致性评估>
**建议**：- <建议>
```

---

## 4. 执行流程

1. **读取上下文**：`.forge/config.md`、`.forge/decisions/`、`.forge/knowledge/instincts.md`
2. **判定是否需要设计视角**（§3.4 的触发条件）
3. **Round 1**：并行启动 3 或 4 个视角 Subagent，使用 `Promise.allSettled` 等待
4. **Round 2**：收集所有视角输出，启动 Critic 交叉审查。阻塞性问题 → 标记 `needs_revision`；通过 → 生成决策文档
5. **输出决策文档**：写入 `.forge/decisions/<date>-<topic>.md`

---

## 5. 决策文档格式

输出路径：`.forge/decisions/<YYYY-MM-DD>-<topic>.md`

```markdown
---
topic: "<主题>"
date: "YYYY-MM-DD"
status: "confirmed"
---

## 产品定义
<产品视角的输出>

## 技术方案
<架构视角的输出>

## 安全评估
<安全视角的输出>

## 设计评估
<设计视角的输出，仅当触发时包含>

## 否决记录
<被否决的方案及理由，无否决时写"无">
```

---

## 6. Token 控制

每个角色的输出**严格限制在 500 tokens 以内**。超出时截断并提示精简。

| 角色 | 上限 |
|------|------|
| product | 500 tokens |
| architect | 500 tokens |
| security | 500 tokens |
| designer | 500 tokens |

---

## 上下文预算管理

| 信息源 | 裁剪策略 |
|--------|---------|
| 视角 Subagent 输出 | Subagent_Summary_Protocol：Round 2 输入时只使用摘要，≤200 tokens/视角 |
| 最终决策文档 | Write-and-discard：完整决策写入 `.forge/decisions/<topic>.md`，context 中只保留决策结论 |

---

## 7. 边界情况处理

| 条件 | 处理 |
|------|------|
| 安全视角被要求跳过 | 拒绝。⚠️ 安全评估不可跳过。结论可以是"无显著安全风险"，但过程不能省略 |
| 设计视角误触发 | 开发者可明确跳过，Round 1 不启动 designer |
| 视角之间存在冲突 | 记录冲突点 → 呈现给开发者 → 开发者做最终决定 → 记录到否决记录 |
| 无 `.forge/` 目录 | ⚠️ 请先运行 forge init |

---

## 8. 示例

### 示例 1：纯后端任务（三视角）

任务："为订单系统添加批量导出功能"

- **产品视角**：提问导出格式、数据量级、权限要求
- **架构视角**：评估大数据量导出方案（流式 vs 分页）、文件存储策略
- **安全视角**：检查权限控制、敏感字段脱敏、导出日志审计
- **设计视角**：不触发

输出：`.forge/decisions/2025-01-15-order-batch-export.md`

### 示例 2：涉及 UI 的任务（四视角）

任务："重新设计用户设置页面"

- **产品视角**：提问设置项优先级、移动端适配需求
- **架构视角**：评估设置数据存储和同步方案、前后端接口设计
- **安全视角**：检查敏感设置修改流程安全性
- **设计视角**：**触发** — 评估页面布局、表单可用性、WCAG、设计系统一致性

输出：`.forge/decisions/2025-01-15-user-settings-redesign.md`
