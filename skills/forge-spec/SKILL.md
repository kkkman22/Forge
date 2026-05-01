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

| Target | Strategy |
|--------|----------|
| Purpose | Extract as "Purpose" section |
| Requirements | Decompose into independent items (ID + title each) |
| Scenarios | Convert to "When...Then..." format; narratives must be rewritten |
| Non-goals | Direct mapping; unclear text → infer + user confirmation |
| Anti-drift | Auto-generated from extracted requirements |
| Delta | Extract if original describes modifications |

### Quality Assurance

No info loss (unmappable → "pending confirmation" list) · No info addition (auto-generated content labeled) · Scenarios must be testable (vague → flagged) · Remove implementation details (class/function/tech names)

### Frontmatter (Import Mode)

添加 `import_source: "<原始文件相对路径>"` 字段。原始文件保留原位。

### Integration

导入锁定后成为标准 `.forge/specs/<feature>/spec.md`，后续 plan/build/review 流程无区别。

---

## 2. Three-step Flow

### Step 1: Propose (Generate Draft)

读取以下上下文，生成规格草案：

| Input Source | Description |
|--------|------|
| `.forge/decisions/` | 决策文档（产品定义、技术方案、安全评估） |
| `.forge/config.md` | 项目配置（技术栈、安全级别） |
| `.forge/specs/` | 现有规格，避免重复、确保一致 |
| User Input | 当前需求描述 |

**生成规则**：

1. **先读代码再写 spec**：AI 必须先读取相关代码文件理解模块结构和行为，不允许未读代码就填写 Current State
2. 从决策文档提取已确认方向，不重复讨论
3. 从现有 specs 识别相关功能，确保不冲突
4. 需求拆解为独立条目，每条至少一个可测试场景
5. 棕地开发自动包含 Delta 章节

草案生成后，向用户展示完整草案内容，进入 Review 步骤。

### Step 2: Review (Self-check)

对草案执行以下自检，逐项报告结果：

| Check | Pass Criteria |
|--------|---------|
| Testability | 所有需求均有"当...则..."格式场景 |
| Boundary Clarity | 无模糊用语（"适当的"、"合理的"、"等等"） |
| Human Readability | 无类名/函数名/库名等实现细节 |
| Brownfield Compat | 棕地项目有完整新增/修改/不变章节 |
| Anti-drift | 主目标、非目标代理信号、验证材料角色三项已填写 |
| Two-part Structure | Current State 有 file:line 引用；Proposed Change 有变更/不变声明 |
| Reversibility | 回滚清单和挂载点清单已填写 |

自检未通过 → 自动修正并重新自检。全部通过后提示用户确认锁定。

如果任一检查项未通过，列出具体问题并自动修正草案，然后重新自检，直到全部通过。

### Step 3: Lock

用户确认后：frontmatter `status` → `"locked"`，写入 `.forge/specs/<feature>/spec.md`。修改需先解锁（status → draft）重走 Review → Lock。用户不确认则保持 draft 可继续修改。

---

## 3. Spec Document Format

### YAML Frontmatter

```yaml
---
feature: "<功能名>"        # kebab-case
status: "draft" | "locked"
date: "YYYY-MM-DD"
import_source: "<path>"    # 可选，仅导入模式
---
```

### Body Structure

```markdown
## 目的 — <解决问题，为谁>
## 需求 — ### 需求 N：<标题> + 行为描述 + **场景**：当...则...
## 场景汇总 — | ID | Scenario | Requirement |
## Current State — **必填**，AI 必须先读代码。Related Modules 表 + Structure Overview
## Proposed Change — **必填**。To Change + Explicitly Unchanged
## 不做什么 — 划清边界
## Reversibility — **必填**。Rollback Checklist + Mount Points
## 反漂移声明 — 主目标 + 非目标代理信号 + 验证材料角色
## Delta — 仅棕地开发：New / Modified / Unchanged
```

---

## 4. Quality Standards

### 4.1 Testability

每个需求至少一个可测试场景，格式：`当 <前置条件/触发动作>，则 <可观测的预期结果>`。

合格：当用户提交空表单，则显示"请填写必填字段" · 不合格："系统应该有良好的错误处理"（不可测试）

### 4.2 Behavior, Not Implementation

**禁止**：类名/函数名/库名/表名/技术方案 · **允许**：用户可见行为、业务规则、性能约束

### 4.3 Brownfield Delta

棕地开发必须包含 Delta（新增/修改/不变）。"不变"防止 build 误改。信号：已有代码库、修改现有功能、specs 中已有其他规格。

### 4.4 Two-part Structure

必须包含 Current State（file:line 引用 + 当前行为）和 Proposed Change（要改变的 + 明确不改变的）。AI 必须先读代码。

### 4.5 Reversibility

必须包含回滚清单和挂载点清单。提前思考可卸载性帮助发现隐藏耦合。

---

## 5. Gate: Spec Not Locked → Block `/forge build`

→ 遵循 CLAUDE.md §2.2 前置检查。status 非 `"locked"` → 阻断 build，提示运行 `/forge spec`。轻量路径例外。

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
| 无 decisions/ | 基于需求描述直接生成；如需决策分析可运行 /forge decide |
| 同名 spec (draft) | 读取现有草案为基础修改 |
| 同名 spec (locked) | ⚠️ 先将 status 改为 draft，再重新运行 |
| 需求模糊 | 追问：问题？目标用户？关键场景？ |
| 自检反复失败（3次） | 停止自动修正，呈现问题给用户 |
| 无 `.forge/` | ⚠️ 先运行 forge init |
| 导入：文件不存在 | ⚠️ 检查路径 |
| 导入：无法提取需求 | ⚠️ 确认文档含功能需求 |
| 导入：含实现细节 | ℹ️ 转化时移除实现细节，原始文件不丢失 |

---

## 8. Examples

### Canonical Example: Greenfield

任务："为订单系统添加批量导出功能"

```markdown
---
feature: "order-batch-export"
status: "draft"
date: "2025-01-15"
---
## 目的
为运营人员提供按条件筛选并导出订单数据的功能，用于对账和报表。
## 需求
### 需求 1：按条件筛选导出
**场景**：当选择"最近7天"并导出，则生成文件开始下载 · 当结果为空，则提示"没有符合条件的订单"
### 需求 2：大数据量导出
**场景**：当超过10000条，则提示"导出任务已提交"后台处理 · 当完成，则通知+下载链接 · 当链接超24h，则失效
## 不做什么
不做模板自定义、定时导出、历史记录管理
## 反漂移声明
主目标：按条件筛选导出，大数据量异步处理 · 非目标：导出速度、格式丰富度
```

**Brownfield 变体**：额外包含 Current State（file:line 引用）+ Proposed Change（变更/不变）+ Delta（新增/修改/不变）。结构见 §3。

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
