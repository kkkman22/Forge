---
name: forge-decide
description: "四视角前置决策引擎。以 Agent Team 模式从产品、架构、安全、设计视角进行系统性评估。"
disable-model-invocation: true
---

# /forge decide — 决策引擎

> **触发方式**：全量路径的第一步，或用户直接输入 `/forge decide`
> **职责**：以 Agent Team 模式从产品、架构、安全、设计四个视角进行前置决策，在编码前明确问题边界、风险和技术方向
> **Agent 模式**：Agent Team（共享上下文，成员之间相互质疑）

---

## 1. 概述

`/forge decide` 在编码开始前，从四个独立视角对任务进行系统性评估。三个核心视角（产品、架构、安全）始终参与，设计视角仅在任务涉及 UI 变更时动态加入。

每个视角由独立的 Agent 角色承担，通过 Agent Team 模式协作，确保视角之间可以相互质疑和补充。

**核心原则**：先想清楚，再动手。决策阶段的投入远低于返工的代价。

---

## 2. Agent Team 配置

使用 Claude Code Agent Teams 特性创建决策团队。队友类型引用 `.claude/agents/` 下的 subagent 定义。

**默认成员**（3 个，始终参与）：

| 队友名称 | Subagent 定义 | 职责 |
|---------|--------------|------|
| product | `product` | 产品视角 — 苏格拉底式提问 |
| architect | `architect` | 架构视角 — 技术方案评估 |
| security | `security` | 安全视角 — OWASP + STRIDE |

**动态成员**（条件触发）：

| 队友名称 | Subagent 定义 | 触发条件 |
|---------|--------------|---------|
| designer | `designer` | 任务涉及 UI 变更时加入 |
| critic | `critic` | **始终参与**（最后发言，审查其他视角的输出） |

**启动指令**：

负责人（当前会话）使用自然语言创建团队。Critic 始终参与，designer 根据是否涉及 UI 变更决定。

默认（含 Critic）：
```
Create an agent team with 4 teammates:
- Spawn a teammate named "product" using the product agent type
- Spawn a teammate named "architect" using the architect agent type
- Spawn a teammate named "security" using the security agent type
- Spawn a teammate named "critic" using the critic agent type
Require plan approval before they make any changes.
Product, architect, and security should analyze the task from their perspective first.
After they report, critic should review ALL their outputs and challenge any gaps, blind spots, or inconsistencies.
```

含 UI 变更（5 视角）：
```
Create an agent team with 5 teammates:
- Spawn a teammate named "product" using the product agent type
- Spawn a teammate named "architect" using the architect agent type
- Spawn a teammate named "security" using the security agent type
- Spawn a teammate named "designer" using the designer agent type
- Spawn a teammate named "critic" using the critic agent type
Require plan approval before they make any changes.
Product, architect, security, and designer should analyze the task from their perspective first.
After they report, critic should review ALL their outputs and challenge any gaps, blind spots, or inconsistencies.
```

**Critic 的特殊规则**：
- Critic **最后发言**——必须等其他视角输出完毕后再审查
- Critic 审查的是**其他视角的输出**，不是原始任务
- 如果 Critic 发现阻塞性问题，决策文档标记为 `needs_revision`，相关视角需要修正后重新输出

**注意**：`.claude/teams/` 下的 JSON 文件是 SKILL.md 的参考材料，不是 Claude Code 原生的团队配置。Claude Code 的团队配置在运行时自动生成到 `~/.claude/teams/`，不要手动编辑。

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

**当触发时**，动态将 designer 加入 Agent Team：

```json
{
  "name": "designer",
  "role": "设计视角",
  "agent": "designer"
}
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

根据第 3.4 节的触发条件，判断任务是否涉及 UI 变更：

- **涉及 UI 变更** → 将 designer 动态加入 Agent Team，四视角并行评估。
- **不涉及 UI 变更** → 三视角（产品、架构、安全）并行评估。

### Step 3：启动 Agent Team 评估

使用第 2 节中的启动指令创建 Agent Team。各队友并行工作，可以通过消息相互质疑。

**产品视角先行**：产品视角以苏格拉底式提问开始，一次一个问题，逐步厘清问题定义、目标用户和成功标准。

**架构和安全跟进**：在产品视角初步厘清问题后，架构和安全视角基于产品定义进行评估。

**设计视角（如触发）**：与架构和安全视角同步进行。

### Step 4：汇总与否决

汇总各视角的输出，检查是否有否决意见：

- 如果任何视角提出**阻塞性问题**（如严重安全风险、架构不可行），记录到否决记录中，暂停流程与开发者讨论。
- 如果所有视角通过，生成决策文档。

### Step 5：输出决策文档

将决策结果写入 `.forge/decisions/<date>-<topic>.md`。

### Step 6：清理团队

决策文档输出后，清理 Agent Team 资源：

1. 要求所有队友关闭：`Ask all teammates to shut down`
2. 等待队友确认退出
3. 清理团队：`Clean up the team`

**为什么要清理？** Claude Code 每个会话只能管理一个团队。如果 decide 团队不清理，后续的 review 团队无法创建。

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

如果设计视角被触发但开发者认为不需要，开发者可以明确说明跳过设计视角。此时从 Agent Team 中移除 designer，仅保留三视角评估。

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

### 7.5 Agent Team 清理失败

如果队友关闭超时或清理失败：

```
⚠️ Agent Team 清理未完成。部分队友可能仍在运行。
如果后续需要创建新团队（如 /forge review），请先手动清理：
  tmux ls                          # 列出会话
  tmux kill-session -t <session>   # 关闭残留会话
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
