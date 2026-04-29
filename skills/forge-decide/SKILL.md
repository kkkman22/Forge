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

使用 Agent tool 独立启动视角 Subagent，无需创建 Agent Team。决策通过两轮执行完成：Round 1 并行视角评估，Round 2 Critic 交叉审查。

**Round 1 — 视角 Subagent（并行启动）**：

**默认成员**（3 个，始终参与）：

| Subagent 名称 | 定义文件 | 职责 |
|---------|--------------|------|
| product | `.claude/agents/product.md` | 产品视角 — 苏格拉底式提问 |
| architect | `.claude/agents/architect.md` | 架构视角 — 技术方案评估 |
| security | `.claude/agents/security.md` | 安全视角 — OWASP + STRIDE |

**动态成员**（条件触发）：

| Subagent 名称 | 定义文件 | 触发条件 |
|---------|--------------|---------|
| designer | `.claude/agents/designer.md` | 任务涉及 UI 变更时加入（`involvesUIChanges()` 返回 true） |

**Round 1 启动方式**：

默认（3 视角）：
```
使用 Agent tool 同时启动 3 个独立 Subagent：
- Agent(prompt="product 视角评估指令，限制 500 tokens", subagent_type="product")
- Agent(prompt="architect 视角评估指令，限制 500 tokens", subagent_type="architect")
- Agent(prompt="security 视角评估指令，限制 500 tokens", subagent_type="security")
使用 Promise.allSettled 等待所有 Subagent 完成。
```

含 UI 变更（4 视角）：
```
使用 Agent tool 同时启动 4 个独立 Subagent：
- Agent(prompt="product 视角评估指令，限制 500 tokens", subagent_type="product")
- Agent(prompt="architect 视角评估指令，限制 500 tokens", subagent_type="architect")
- Agent(prompt="security 视角评估指令，限制 500 tokens", subagent_type="security")
- Agent(prompt="designer 视角评估指令，限制 500 tokens", subagent_type="designer")
使用 Promise.allSettled 等待所有 Subagent 完成。
```

**Designer 条件触发**：designer Subagent 仅当 `involvesUIChanges()` 返回 true 时加入 Round 1。判定逻辑见 §3.4。

**每个视角 Subagent 的输出限制在 500 tokens 以内**。超出时截断并提示精简。

**Round 2 — Critic Subagent（串行，在 Round 1 完成后启动）**：

```
收集 Round 1 所有视角 Subagent 的输出，启动 Critic Subagent：
- Agent(prompt="所有 Round 1 视角输出 + 交叉审查指令", subagent_type="critic")
Critic 审查所有视角输出，寻找盲点和矛盾。
```

**Critic 的特殊规则**：
- Critic 在 Round 2 启动——必须在所有 Round 1 视角输出完毕后才能审查
- Critic 审查的是**所有视角 Subagent 的输出**，不是原始任务
- 如果 Critic 发现阻塞性问题，决策文档标记为 `needs_revision`，相关视角需要修正后重新输出
- Critic 标记 `needs_revision` 时，返回具体哪些视角需要修正以及理由

**容错机制**：

- Round 1 使用 `Promise.allSettled`：单个视角 Subagent 失败不阻断其他视角
- 失败的视角在决策文档中标注"评估失败"
- Critic 可以指出缺失的视角评估作为发现之一
- 如果所有 Round 1 Subagent 均失败，决策终止并向用户报告

---

## 3. 四视角评估

### 约束

- **每个角色输出限制在 500 tokens 以内**。超出时截断并提示精简。
- 安全视角**不可跳过**，即使任务看起来与安全无关。
- 各视角独立输出，但可以引用和质疑其他视角的结论。

### 3.1 产品视角（product.md）

**角色**：以苏格拉底式提问厘清问题本质。

**职责**：
- 问题定义：这个任务到底要解决什么问题？
- 目标用户：谁会使用这个功能？使用场景是什么？
- 成功标准：怎样算做完了？可衡量的指标是什么？

**行为规则**：
- **一次只问一个问题**，等待回答后再问下一个。
- 不给答案，只提问。通过提问引导开发者自己想清楚。
- 如果开发者的回答模糊，追问具体化。

**输出格式**：

```markdown
### 产品定义

**问题**：<一句话描述要解决的核心问题>
**用户**：<目标用户和使用场景>
**成功标准**：
- <可衡量的标准 1>
- <可衡量的标准 2>
**边界**：<明确不做什么>
```

### 3.2 架构视角（architect.md）

**角色**：评估技术方案的合理性和风险。

**职责**：
- 技术选型合理性：选择的技术栈是否适合这个场景？
- 架构风险：有哪些潜在的架构风险？
- 扩展性：方案能否应对未来的增长？
- 兼容性：与现有系统的集成点和兼容性如何？

**输出格式**：

```markdown
### 技术方案

**选型**：<技术选型及理由>
**风险**：
- <风险 1>：<影响> / <缓解措施>
- <风险 2>：<影响> / <缓解措施>
**扩展性**：<扩展性评估>
**兼容性**：<与现有系统的兼容性评估>
```

### 3.3 安全视角（security.md）

**角色**：基于 OWASP Top 10 和 STRIDE 进行威胁建模。

**职责**：
- OWASP Top 10 逐项检查：注入、认证失效、敏感数据暴露、XXE、访问控制失效、安全配置错误、XSS、不安全反序列化、使用含已知漏洞的组件、日志与监控不足
- STRIDE 威胁建模：Spoofing（欺骗）、Tampering（篡改）、Repudiation（抵赖）、Information Disclosure（信息泄露）、Denial of Service（拒绝服务）、Elevation of Privilege（权限提升）

**⚠️ 此视角不可跳过**，即使任务看起来与安全无关。安全评估的结论可以是"当前任务无显著安全风险"，但评估过程不能省略。

**输出格式**：

```markdown
### 安全评估

**OWASP 检查**：
- <相关项 1>：<风险等级> — <说明>
- <相关项 2>：<风险等级> — <说明>
- 其余项：无显著风险

**STRIDE 分析**：
- <相关威胁 1>：<说明> / <建议措施>
- <相关威胁 2>：<说明> / <建议措施>

**结论**：<整体安全评估结论>
```

### 3.4 设计视角（designer.md）— 条件触发

**角色**：评估 UI/UX 方面的可用性、可访问性和一致性。

**触发条件**：仅当任务涉及 UI 变更时动态加入。判定信号：

| 信号 | 示例 |
|------|------|
| 任务描述提及前端/UI/页面/组件/样式 | "添加用户设置页面"、"重新设计导航栏" |
| 涉及的文件包含 UI 相关扩展名 | `.tsx`、`.jsx`、`.vue`、`.svelte`、`.css`、`.scss`、`.html` |
| 任务涉及用户交互流程变更 | "修改注册流程"、"添加搜索功能" |

**不触发的场景**：纯后端 API、数据库变更、CI/CD 配置、纯逻辑重构。

**当触发时**，在 Round 1 中额外启动 designer Subagent：

```
Agent(prompt="designer 视角评估指令，限制 500 tokens", subagent_type="designer")
```

**职责**：
- 可用性：用户能否直觉地完成目标操作？
- 可访问性：是否符合 WCAG 基本要求？
- 一致性：与现有 UI 模式和设计系统是否一致？

**输出格式**：

```markdown
### 设计评估

**可用性**：<评估结论>
**可访问性**：<WCAG 相关建议>
**一致性**：<与现有设计系统的一致性评估>
**建议**：
- <建议 1>
- <建议 2>
```

---

## 4. 执行流程

### Step 1：读取上下文

读取以下文件获取项目背景：

- `.forge/config.md` — 项目配置（技术栈、安全级别）
- `.forge/decisions/` — 已有的决策文档（避免重复讨论）
- `.forge/knowledge/instincts.md` — 历史经验模式

### Step 2：判定是否需要设计视角

根据第 3.4 节的触发条件，判断任务是否涉及 UI 变更（`involvesUIChanges()`）：

- **涉及 UI 变更** → Round 1 启动 4 个视角 Subagent（含 designer）
- **不涉及 UI 变更** → Round 1 启动 3 个视角 Subagent（不含 designer）

### Step 3：Round 1 — 并行视角评估

使用第 2 节中的启动方式通过 Agent tool 并行启动视角 Subagent。使用 `Promise.allSettled` 等待所有视角完成。

各视角独立工作，输出限制在 500 tokens 以内。

### Step 4：Round 2 — Critic 交叉审查

收集 Round 1 所有视角的输出，启动 Critic Subagent 进行交叉审查。

Critic 检查是否有否决意见：
- 如果 Critic 发现阻塞性问题 → 标记 `needs_revision`，相关视角需要修正后重新输出
- 如果所有视角通过 → 生成决策文档

### Step 5：输出决策文档

将决策结果写入 `.forge/decisions/<date>-<topic>.md`。

---

## 5. 决策文档格式

输出路径：`.forge/decisions/<YYYY-MM-DD>-<topic>.md`

其中：
- `<YYYY-MM-DD>` 为当天日期，如 `2025-01-15`
- `<topic>` 为任务主题的 kebab-case 形式，如 `user-notification-system`

### 文档结构

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

<设计视角的输出，仅当触发时包含此章节>

## 否决记录

<被否决的方案及理由，无否决时写"无">
```

### YAML Frontmatter 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `topic` | string | 决策主题 |
| `date` | string | 日期，YYYY-MM-DD 格式 |
| `status` | string | `confirmed`（已确认）或 `rejected`（已否决） |

---

## 6. Token 控制

每个角色的输出**严格限制在 500 tokens 以内**。

| 角色 | 上限 | 说明 |
|------|------|------|
| product | 500 tokens | 产品定义（问题、用户、成功标准、边界） |
| architect | 500 tokens | 技术方案（选型、风险、扩展性、兼容性） |
| security | 500 tokens | 安全评估（OWASP + STRIDE + 结论） |
| designer | 500 tokens | 设计评估（可用性、可访问性、一致性、建议） |

如果某个角色的输出接近或超过 500 tokens，要求其精简：聚焦最关键的发现，省略低风险项的详细说明。

---

## 上下文预算管理

本节定义 decide 阶段的上下文消耗控制策略。

### 分类与裁剪策略

| 信息源 | 生命周期 | 裁剪策略 |
|--------|---------|---------|
| 视角 Subagent 输出 | Ephemeral（一次性消费） | Subagent_Summary_Protocol：Round 2 输入时只使用摘要，≤200 tokens/视角 |
| 最终决策文档 | Write-and-discard（写入即丢弃） | 完整决策写入 `.forge/decisions/<topic>.md`，context 中只保留决策结论 |

### 裁剪执行流程

1. **视角 Subagent 完成评估后**：提取 Subagent_Summary_Protocol 摘要，丢弃详细分析过程
2. **Round 2 输入时**：仅使用 Subagent 摘要作为 Critic 的输入，不重新加载完整输出
3. **决策文档生成后**：写入 `.forge/decisions/<topic>.md`，context 中只保留最终决策结论（决策结果 + 关键理由）

---

## 7. 边界情况处理

### 7.1 安全视角被要求跳过

拒绝跳过。输出提醒：

```
⚠️ 安全评估不可跳过。即使当前任务看起来与安全无关，仍需完成 OWASP Top 10 和 STRIDE 检查。
评估结论可以是"无显著安全风险"，但评估过程不能省略。
```

### 7.2 设计视角误触发

如果设计视角被触发但开发者认为不需要，开发者可以明确说明跳过设计视角。此时 Round 1 不启动 designer Subagent，仅保留三视角评估。

### 7.3 视角之间存在冲突

当视角之间存在冲突（如架构方案与安全建议矛盾）时：

1. 记录冲突点和各方理由。
2. 将冲突呈现给开发者，由开发者做最终决定。
3. 将开发者的决定和理由记录到否决记录中。

### 7.4 无 `.forge/` 目录

如果 `.forge/` 目录不存在，提示先运行初始化：

```
⚠️ 未检测到 .forge/ 目录。请先运行 forge init 初始化项目。
```

---

## 8. 示例

### 示例 1：纯后端任务（三视角）

任务："为订单系统添加批量导出功能"

- **产品视角**：提问导出格式、数据量级、权限要求
- **架构视角**：评估大数据量导出的性能方案（流式 vs 分页）、文件存储策略
- **安全视角**：检查数据导出的权限控制、敏感字段脱敏、导出日志审计
- **设计视角**：不触发（纯后端任务）

输出：`.forge/decisions/2025-01-15-order-batch-export.md`

### 示例 2：涉及 UI 的任务（四视角）

任务："重新设计用户设置页面"

- **产品视角**：提问设置项优先级、用户最常修改的设置、移动端适配需求
- **架构视角**：评估设置数据的存储和同步方案、前后端接口设计
- **安全视角**：检查敏感设置（密码、邮箱）的修改流程安全性
- **设计视角**：**触发** — 评估页面布局、表单可用性、WCAG 可访问性、与现有设计系统一致性

输出：`.forge/decisions/2025-01-15-user-settings-redesign.md`
