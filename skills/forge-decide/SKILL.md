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

**核心原则**：先想清楚，再动手。决策阶段的投入远低于返工的代价。

---

## 2. 两轮 Subagent 执行

### Round 1 — 视角 Subagent（并行启动）

**默认成员**（始终参与）：

| Subagent | 定义文件 | 职责 |
|---------|----------|------|
| product | `.claude/agents/product.md` | 苏格拉底式提问：问题定义、目标用户、成功标准 |
| architect | `.claude/agents/architect.md` | 技术选型、架构风险、扩展性、兼容性 |
| security | `.claude/agents/security.md` | OWASP Top 10 + STRIDE 威胁建模 |

**动态成员**：designer（`.claude/agents/designer.md`），仅当任务涉及 UI 变更时加入。判定信号：任务描述提及前端/UI/组件/样式、涉及文件含 `.tsx`/`.jsx`/`.vue`/`.svelte`/`.css`。

**启动方式**：Agent tool 同时启动 3-4 个独立 Subagent，`Promise.allSettled` 等待完成。**每个视角输出限制 500 tokens**。

### Round 2 — Critic Subagent（串行）

收集 Round 1 所有视角输出，启动 Critic 交叉审查，寻找盲点和矛盾。发现阻塞性问题 → 标记 `needs_revision` + 具体视角和理由 → 修正后重新输出。

**容错**：单个视角失败不阻断其他。失败标注"评估失败"。全部失败则终止并报告。

---

## 3. 四视角评估

**约束**：每个视角 ≤500 tokens。安全视角**不可跳过**。各视角可引用和质疑其他视角结论。

### 3.1 产品视角（product.md）

苏格拉底式提问：一次只问一个问题，不给答案只提问，模糊回答则追问。

**输出**：问题定义（一句话）+ 目标用户/场景 + 成功标准（可衡量）+ 边界（不做什么）。

### 3.2 架构视角（architect.md）

**输出**：技术选型及理由 + 风险清单（风险/影响/缓解）+ 扩展性 + 兼容性。

### 3.3 安全视角（security.md）

基于 OWASP Top 10 和 STRIDE。**不可跳过**——结论可以是"无显著安全风险"，但过程不能省略。

**输出**：OWASP 检查（相关项/风险等级/说明）+ STRIDE 分析 + 结论。

### 3.4 设计视角（designer.md）— 条件触发

评估可用性、可访问性（WCAG）、一致性。**输出**：可用性评估 + WCAG 建议 + 一致性评估 + 建议。

---

## 4. 执行流程

1. **读取上下文**：`.forge/config.md`、`.forge/decisions/`、`.forge/knowledge/instincts.md`
2. **判定设计视角**（§3.4 触发条件）
3. **Round 1**：并行启动 3-4 个视角 Subagent（`Promise.allSettled`）
4. **Round 2**：Critic 交叉审查。通过 → 生成决策文档
5. **输出**：写入 `.forge/decisions/<YYYY-MM-DD>-<topic>.md`

---

## 5. 决策文档格式

输出路径：`.forge/decisions/<YYYY-MM-DD>-<topic>.md`

字段：frontmatter（topic/date/status: "confirmed"）+ 产品定义 + 技术方案 + 安全评估 + 设计评估（仅当触发）+ 否决记录（无否决写"无"）。

---

## 上下文预算管理

每个视角 ≤500 tokens。Round 2 输入使用 Subagent_Summary_Protocol 摘要（`serializeSubagentSummary(summary)`，≤200 tokens/视角）替代原始输出。决策文档采用 Write-and-discard：完整写入 `.forge/decisions/<topic>.md`，context 只保留结论。

---

## 7. 边界情况处理

| 条件 | 处理 |
|------|------|
| 安全视角被要求跳过 | 拒绝。过程不能省略 |
| 设计视角误触发 | 开发者可明确跳过 |
| 视角冲突 | 记录冲突 → 呈现给开发者 → 记录到否决记录 |
| 无 `.forge/` 目录 | ⚠️ 请先运行 forge init |

---

## 8. 示例

### Canonical：纯后端任务（三视角）

任务："为订单系统添加批量导出功能"

- **product**：提问导出格式、数据量级、权限要求
- **architect**：评估流式 vs 分页导出、文件存储策略
- **security**：检查权限控制、敏感字段脱敏、导出审计
- **designer**：不触发

**UI 任务变体**：任务"重新设计用户设置页面" → designer 触发，评估布局、表单可用性、WCAG、设计系统一致性。
