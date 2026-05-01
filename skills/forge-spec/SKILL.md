---
name: forge-spec
description: "规格引擎。将需求固化为可审阅、可测试、可锁定的规格文档。"
disable-model-invocation: true
---

# /forge spec — 规格引擎

> **触发方式**：全量路径的第二步，用户直接输入 `/forge spec`，或 `/forge spec <file-path>` 导入外部规格
> **职责**：将需求固化为可审阅、可测试、可锁定的规格文档，锁定后成为 build 和 review 的唯一真理源。支持从外部规格文档导入并转化为 Forge 格式。
> **输出路径**：`.forge/specs/<feature>/spec.md`

---

## 1. Overview

`/forge spec` 通过三步流程（Propose → Review → Lock）将模糊的需求转化为结构化的规格文档。规格文档是 Forge 工作流的核心合同——锁定后，build 按它实现，review 按它验收，任何偏离都会被拦截。

**核心原则**：规格描述行为，不描述实现。写"当用户提交表单时，系统返回成功提示"，不写"调用 FormService.submit() 方法"。

---

**Not For**：
- 单行修复、typo 纠正
- 需求已明确且自包含的变更
- 已有外部 PM 交付的完整 spec（用导入模式）

## 1.5. Import Mode

当开发者从产品经理处收到外部规格文档时，使用导入模式将其转化为 Forge 格式：

```
/forge spec path/to/external-spec.md
```

### Applicable Scenarios

- 产品经理交付了独立的 spec 文档（Markdown、纯文本等格式）
- 开发者需要将外部 spec 纳入 Forge 工作流，享受 spec 门禁、review 对齐等保障
- 替代手动编写 Forge 格式 spec 的重复劳动

### Import Flow

1. 读取指定路径的规格文档
2. 提取需求/场景，转化为 Forge SpecDocument 格式
3. 复用现有五项自检（可测试性/边界清晰度/人类可读性/棕地兼容性/反漂移完整性），未通过则自动修正
4. 展示转化结果，用户确认或修改
5. 写入 `.forge/specs/<feature>/spec.md`，status: "locked"，frontmatter 中标注 import_source 原始文件路径

### Conversion Rules

| Extraction Target | Conversion Strategy |
|---------|---------|
| **Purpose** | Extract as the "Purpose" section, describing the problem to solve and for whom |
| **Requirement Items** | Decompose into independent requirement items, each with an ID and title |
| **Scenarios** | Convert to "When...Then..." format. Existing acceptance criteria are adapted directly; narrative descriptions must be rewritten |
| **Non-goals** | Direct mapping. When the original text is unclear, infer from requirements and prompt user for confirmation |
| **Anti-drift Declaration** | Auto-generated during conversion, inferring main goal and non-goal proxy signals from extracted requirements |
| **Delta** | If the original text describes modifications to existing functionality, extract as a Delta section |

### Conversion Quality Assurance

1. **No information loss**: All requirement points in the original text must appear in the conversion result. Unmappable content is placed in a "pending confirmation" list
2. **No information addition**: Do not speculate on requirements not present in the original text. Newly added content (such as anti-drift declarations) must be labeled "auto-generated"
3. **Scenarios must be testable**: Converted scenarios must conform to the "When...Then..." format. Overly vague scenarios are flagged with a prompt to supplement
4. **Remove implementation details**: Class names, function names, and technical solutions from the original text are removed during conversion, preserving only behavioral descriptions

### Frontmatter Format (Import Mode)

```yaml
---
feature: "<从文档内容推断的功能名，kebab-case>"
status: "draft"
date: "YYYY-MM-DD"
import_source: "<原始文件的相对路径>"
---
```

`import_source` 字段记录规格的来源，便于追溯。导入完成后，原始文件保留在原位，不做移动或删除。

### Integration with Existing Flow

导入并锁定后，规格成为标准的 `.forge/specs/<feature>/spec.md`，后续流程无需区分来源：

1. `/forge <任务描述>` → Router 检测到已锁定 Spec → 路由到标准路径
2. `/forge plan` → 基于锁定的 Spec 生成计划
3. `/forge build` → Spec 门禁检查通过，按 Spec 实现
4. `/forge review` → Review 的 Spec 对齐检查正常执行

---

## 2. Three-step Flow

### Step 1: Propose (Generate Draft)

读取以下上下文，生成规格草案：

| Input Source | Description |
|--------|------|
| `.forge/decisions/` | 已有的决策文档（如有），提取产品定义、技术方案、安全评估 |
| `.forge/config.md` | 项目配置（技术栈、安全级别） |
| `.forge/specs/` | 现有规格文档，避免重复定义、确保一致性 |
| User Input | 当前任务的需求描述 |

**生成规则**：

1. **先读代码再写 spec**：在生成草案之前，AI **必须**先读取与需求相关的代码文件，理解当前的模块结构、函数签名和行为。不允许在未读代码的情况下填写"Current State"部分。
2. 从决策文档中提取已确认的产品定义和技术方向，不重复讨论已决事项。
3. 从现有 specs 中识别相关功能，确保新规格与已有规格不冲突。
4. 将需求拆解为独立的需求条目，每个条目附带至少一个可测试场景。
5. 如果项目为棕地开发（现有代码库上的变更），自动包含 Delta 章节。

草案生成后，向用户展示完整草案内容，进入 Review 步骤。

### Step 2: Review (Self-check)

对草案执行以下自检，逐项报告结果：

| Check Item | Pass Criteria |
|--------|---------|
| **Testability** | 所有需求均有"当...则..."格式的场景 |
| **Boundary Clarity** | 无模糊用语（如"适当的"、"合理的"、"等等"） |
| **Human Readability** | 不包含类名、函数名、库名等实现细节 |
| **Brownfield Compatibility** | 棕地项目有完整的新增/修改/不变章节 |
| **Anti-drift Completeness** | 主目标、非目标代理信号、验证材料角色三项均已填写 |
| **Two-part Structure** | Current State 有 file:line 引用；Proposed Change 有"要改变的"和"明确不改变的" |
| **Reversibility** | 回滚清单和挂载点清单均已填写 |

**自检输出格式**：

```
📋 规格自检

✅ 可测试性：所有 N 个需求均有可测试场景
✅ 边界清晰度：无模糊用语
✅ 人类可读性：无实现细节泄露
✅ 棕地兼容性：Delta 章节完整（或：非棕地项目，跳过）
✅ 反漂移完整性：主目标、非目标代理信号、验证材料角色均已填写
✅ 两段式结构：Current State 有 file:line 引用，Proposed Change 有变更/不变声明
✅ 可卸载性：回滚清单和挂载点清单已填写

自检通过。确认锁定此规格？(y/n)
```

如果任一检查项未通过，列出具体问题并自动修正草案，然后重新自检，直到全部通过。

### Step 3: Lock (Lock)

用户确认后执行锁定：

1. 将 YAML frontmatter 中的 `status` 从 `"draft"` 改为 `"locked"`。
2. 将规格文档写入 `.forge/specs/<feature>/spec.md`。
3. 输出确认信息：

```
🔒 规格已锁定：.forge/specs/<feature>/spec.md

此规格现在是 build 和 review 的唯一真理源。
后续修改需要先解锁（将 status 改回 draft），修改后重新走 Review → Lock 流程。

下一步 → 自动调用 /forge plan（→ 详见 shared/next-step-protocol.md）
```

**未锁定时的行为**：如果用户不确认（回复 n、否、不等），规格保持 `draft` 状态，可以继续修改。用户可以提出修改意见，Forge 据此更新草案并重新进入 Review。

---

## 3. Spec Document Format

### YAML Frontmatter

```yaml
---
feature: "<功能名>"
status: "draft" | "locked"
date: "YYYY-MM-DD"
import_source: "<原始文件路径>"  # 可选，仅导入模式
---
```

| Field | Type | Description |
|------|------|------|
| `feature` | string | 功能名称，kebab-case 格式，如 `user-notification` |
| `status` | string | `draft`（草案）或 `locked`（已锁定） |
| `date` | string | 创建或最后修改日期，YYYY-MM-DD 格式 |
| `import_source` | string? | 可选。导入模式下记录原始规格文件的相对路径 |

### Body Structure

```markdown
---
feature: "user-notification"
status: "draft"
date: "2025-01-15"
---

## 目的

<一段话说明这个功能要解决什么问题，为谁解决>

## 需求

### 需求 1：<需求标题>

<需求描述，描述行为而非实现>

**场景**：

- 当 <前置条件>，则 <预期结果>
- 当 <前置条件>，则 <预期结果>

### 需求 2：<需求标题>

...

## 场景汇总

| ID | Scenario | Requirement |
|------|------|---------|
| S1 | 当 ...，则 ... | 需求 1 |
| S2 | 当 ...，则 ... | 需求 2 |

## Current State

<**必填**。描述与本次变更相关的代码现状。AI 必须在生成此部分之前实际读取相关代码文件。>

### Related Modules

| Module/Function | Location | Current Behavior |
|-----------|------|---------|
| <模块或函数名> | <file:line 或文件路径> | <当前行为的简要描述> |

### Current Structure Overview

<用 1-3 段文字描述相关模块/函数的当前结构和职责划分，引用具体的 file:line 或函数名>

## Proposed Change

<**必填**。明确描述本次要改变什么、不改变什么。>

### To Change

- <变更项 1>：<具体描述变更内容>

### Explicitly Unchanged

- <不变项 1>：<为什么不需要改>

## 不做什么

<明确列出本次不做的事情，划清边界>

## Reversibility

<**必填**。回答：如果要回滚这个 feature，需要撤销哪些改动？>

### Rollback Checklist

- <需要撤销的改动>

### Mount Points

<列出 feature 的所有外部接入点。判据：删了这一项，feature 是否从用户/系统视角消失？>

## 反漂移声明

### 主目标

<用一句话描述本次功能的核心目标。>

### 非目标代理信号

<列出看起来相关但不应被优化的指标。>

### 验证材料角色

声明：本规格中的场景和示例数据仅用于验证行为正确性，不构成产品需求的一部分。

## Delta

<仅棕地开发时包含此章节>

### New / Modified / Unchanged

- <对应条目>
```

---

## 4. Quality Standards

### 4.1 Testability

每个需求**至少包含一个可测试场景**。可测试场景使用"当...则..."格式：

```
当 <前置条件/触发动作>，则 <可观测的预期结果>
```

**合格示例**：
- 当用户提交空表单，则系统显示"请填写必填字段"错误提示
- 当 API 返回 404，则页面展示"未找到"提示并提供返回链接

**不合格示例**：
- 系统应该有良好的错误处理 ← 不可测试，什么是"良好的"？
- 页面应该快速加载 ← 不可测试，什么是"快速"？

### 4.2 Behavior Description, Not Implementation Description

规格**只描述系统的外部行为**，不涉及内部实现。

**禁止出现**：类名（如 `UserService`）、函数名（如 `handleSubmit()`）、库名（如 `使用 Redis 缓存`）、数据库表名、具体技术方案（如 `使用 WebSocket 实现实时推送`）

**允许出现**：用户可见的行为（如"系统发送通知"）、业务规则（如"订单金额超过 1000 元时需要审批"）、性能约束（如"响应时间不超过 2 秒"）

### 4.3 Brownfield Development Delta Section

当项目为棕地开发（在现有代码库上进行变更）时，规格**必须包含 Delta 章节**（新增/修改/不变三个子章节）。"不变"子章节防止 build 阶段误改，也帮助 review 确认没有意外副作用。

**判定棕地开发的信号**：项目已有代码库（非空项目）、任务是对现有功能的修改或增强、`.forge/specs/` 中已有其他功能的规格

### 4.4 "Current State → Proposed Change" Two-part Structure

规格文档**必须包含** "Current State" 和 "Proposed Change" 两个部分。

**Current State 要求**：必须引用具体代码位置（`file:line` 格式或函数名）、必须描述当前行为和结构、AI 必须先读代码

**Proposed Change 要求**：必须明确"要改变什么"和"不改变什么"

### 4.5 Reversibility

规格文档**必须包含** "Reversibility" 部分，回答：如果要回滚这个 feature，需要撤销哪些改动？包含回滚清单和挂载点清单。提前思考可卸载性能帮助发现隐藏的耦合和副作用。

---

## 5. Gate: Spec Not Locked → Block `/forge build`

→ 遵循 CLAUDE.md §2.2 前置检查。在标准路径和全量路径下，`/forge build` 启动前**必须检查** `.forge/specs/` 中是否存在锁定的规格。

如果相关 spec 的 status 不是 `"locked"`，阻断 build：

```
🚫 Build 阻断：规格未锁定

当前任务的规格状态为 "draft"，需要先锁定规格才能开始 build。
请运行 /forge spec 完成规格的 Review 和 Lock 流程。

规格路径：.forge/specs/<feature>/spec.md
当前状态：draft
```

**轻量路径例外**：轻量路径不要求锁定的 spec，直接执行 build。

---

## 6. Execution Flow

1. **前置检查**：`.forge/` 目录是否存在。不存在 → 提示先运行 `forge init`
2. **读取上下文**：`.forge/decisions/`（如有）→ `.forge/config.md` → `.forge/specs/`
3. **Propose**：基于上下文生成规格草案（详见 §2 Step 1）
4. **Review**：执行自检（详见 §2 Step 2），未通过则自动修正并重新自检
5. **用户确认或修改**：确认 → 进入 Lock；修改意见 → 更新草案回到 Review；拒绝 → 保持 draft
6. **Lock**：锁定规格（详见 §2 Step 3）

---

## 7. Edge Case Handling

| Condition | Output |
|------|------|
| 无 decisions/ 文档 | ℹ️ 未找到决策文档，将直接基于你的需求描述生成规格草案。如需先进行多视角决策分析，可运行 /forge decide |
| 已有同名 spec (draft) | 读取现有草案作为基础，在其上修改 |
| 已有同名 spec (locked) | ⚠️ 该功能的规格已锁定。如需修改，请先将 status 改为 "draft"，然后重新运行 /forge spec |
| 需求描述过于模糊 | 追问：1. 要解决什么问题？2. 目标用户是谁？3. 有哪些关键的使用场景？ |
| 自检反复不通过（3次） | 停止自动修正，将问题呈现给用户请其提供更具体的场景描述 |
| 无 `.forge/` 目录 | ⚠️ 未检测到 .forge/ 目录。请先运行 forge init 初始化项目 |
| 导入模式：文件不存在 | ⚠️ 指定的文件不存在。请检查文件路径是否正确 |
| 导入模式：无法提取需求 | ⚠️ 无法从文档中提取有效的需求条目。请确认文档包含具体的功能需求 |
| 导入模式：原文含实现细节 | ℹ️ 转化过程中移除了实现细节（规格只描述行为）。如需保留作为技术参考，原始文件中不会丢失 |

---

## 8. Examples

### Example: Greenfield Project (New Project)

任务："为订单系统添加批量导出功能"

```markdown
---
feature: "order-batch-export"
status: "draft"
date: "2025-01-15"
---

## 目的

为订单管理系统提供批量导出功能，让运营人员能够按条件筛选并导出订单数据，用于对账和报表分析。

## 需求

### 需求 1：按条件筛选导出

运营人员可以按时间范围、订单状态、金额范围筛选订单并导出。

**场景**：

- 当运营人员选择"最近 7 天"并点击导出，则系统生成包含最近 7 天所有订单的文件并开始下载
- 当筛选结果为空，则系统提示"没有符合条件的订单"且不生成文件

### 需求 2：大数据量导出

**场景**：

- 当导出订单数超过 10000 条，则系统提示"导出任务已提交，完成后将通知你"并在后台处理
- 当后台导出完成，则系统发送通知并提供下载链接
- 当下载链接超过 24 小时，则链接失效并提示"链接已过期，请重新导出"

## 场景汇总

| ID | Scenario | Requirement |
|------|------|---------|
| S1 | 当运营人员选择"最近 7 天"并点击导出，则系统生成文件并开始下载 | 需求 1 |
| S2 | 当筛选结果为空，则提示"没有符合条件的订单" | 需求 1 |
| S3 | 当导出超过 10000 条，则提示"导出任务已提交" | 需求 2 |
| S4 | 当后台导出完成，则发送通知并提供下载链接 | 需求 2 |
| S5 | 当下载链接超过 24 小时，则链接失效 | 需求 2 |

## 不做什么

- 不做导出模板自定义（固定格式）
- 不做定时自动导出（仅支持手动触发）
- 不做导出历史记录管理

## 反漂移声明

### 主目标

让运营人员能够按条件筛选并导出订单数据，大数据量时支持异步处理。

### 非目标代理信号

- 导出速度优化不是目标，功能正确性和数据完整性才是
- 文件格式丰富度不是目标，固定格式能满足对账和报表需求即可

### 验证材料角色

声明：本规格中的场景和示例数据（如"10000 条"、"24 小时"）仅用于验证行为正确性，不构成产品需求的一部分。
```

**棕地项目变体**：额外包含 Delta 章节（新增/修改/不变）和 Current State / Proposed Change 两段式结构。详见 §3 Body Structure template.

---

## 9. Known AI Failure Modes

| Failure Mode | Wrong Behavior | Correct Approach |
|---------|---------|---------|
| 不读现有代码就写 spec | Current State 凭推测填写或留空 | 先用工具读取相关代码文件，确认模块结构和行为后用 file:line 引用填写 |
| spec 与代码实际结构不一致 | 引用的文件路径、函数名、行号与实际代码不匹配 | 每个 file:line 引用都经过实际读取验证 |
| 遗漏"明确不做"边界 | 只写"要做什么"，没有写"不做什么"和"明确不改变什么" | 在 Proposed Change 中明确列出"明确不改变的"条目，在"不做什么"章节列出用户可能期望但本次不实现的功能 |

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "需求很明确不需要写 spec" | 明确的需求也有隐含假设。spec 的价值是把假设显式化，15 分钟的 spec 能避免数小时的返工 |
| "先写代码再补 spec" | 那是文档不是规格。spec 的价值在于编码前强制厘清需求，事后补写无法发现前置假设错误 |
| "这个功能太小了不值得写 spec" | 小功能不需要长 spec，但仍需要验收标准。两行 spec 也是 spec |
