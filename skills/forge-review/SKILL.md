---
name: forge-review
description: "评审引擎。以 Agent Team 模式运行三层独立评审（Spec 对齐、代码质量、安全与风险）。"
disable-model-invocation: true
---

# /forge review — 评审引擎

> **触发方式**：标准路径的第三步，全量路径的第五步，轻量路径的第二步，或用户直接输入 `/forge review`
> **职责**：独立于实现过程的三层评审，确保代码与规格对齐、质量达标且无安全风险
> **输出路径**：`.forge/reviews/<topic>.md`

---

## 1. 概述

`/forge review` 通过三层评审（Spec 对齐 → 代码质量 → 安全与风险）对 build 阶段的产出进行独立验证。评审以 Agent Team 模式运行，三个评审者各司其职、交叉验证，最终输出结构化的评审报告。

**核心原则**：执行与评估分离。写代码的人不评审自己的代码。build 阶段的 Agent 和 review 阶段的 Agent 是不同的角色，拥有不同的上下文和关注点。这不是流程冗余，是质量保障。

---

## 2. Agent Team 配置

使用 Claude Code Agent Teams 特性创建评审团队。队友类型引用 `.claude/agents/` 下的 subagent 定义。

**成员**（3 个）：

| 队友名称 | Subagent 定义 | 职责 |
|---------|--------------|------|
| spec-check | `spec-check` | Layer 1 — Spec 对齐检查 |
| quality-check | `quality-check` | Layer 2 — 代码质量检查 |
| security-check | `security-check` | Layer 3 — 安全与风险检查 |

**启动指令**：

标准/全量路径（三层评审）：
```
Create an agent team with 3 teammates:
- Spawn a teammate named "spec-check" using the spec-check agent type
- Spawn a teammate named "quality-check" using the quality-check agent type
- Spawn a teammate named "security-check" using the security-check agent type
Each teammate should independently review the code changes and report findings.
Have them share and challenge each other's findings when relevant.
```

轻量路径或无 Spec 模式（跳过 spec-check）：
```
Create an agent team with 2 teammates:
- Spawn a teammate named "quality-check" using the quality-check agent type
- Spawn a teammate named "security-check" using the security-check agent type
Each teammate should independently review the code changes and report findings.
```

**注意**：`.claude/teams/` 下的 JSON 文件是 SKILL.md 的参考材料，不是 Claude Code 原生的团队配置。Claude Code 的团队配置在运行时自动生成到 `~/.claude/teams/`，不要手动编辑。

三个评审者并行工作，各自输出独立的评审结果，最后汇总为统一的评审报告。

---

## 3. 三层评审

### 评审者动态选择

三层评审的评审者始终参与，但每层的**检查深度**根据变更类型动态调整：

| 变更信号 | 评审调整 |
|---------|---------|
| 涉及认证/授权代码 | security-check 升级为深度审查（OWASP Top 10 逐条对照） |
| 涉及数据库 schema 变更 | quality-check 增加迁移一致性检查 |
| 涉及 API 接口变更 | spec-check 增加向后兼容性检查 |
| 涉及前端 UI 变更 | quality-check 增加可访问性检查 |
| 仅涉及内部重构 | spec-check 降级为快速扫描（无新需求时） |

### Layer 1 — Spec 对齐（spec-check）

**评审者**：`.claude/agents/spec-check.md`

**职责**：逐条对照 `.forge/specs/` 中锁定的规格，检查实现完整性。

**检查项**：

| 检查项 | 说明 |
|--------|------|
| **需求覆盖** | Spec 中的每个需求是否都有对应的实现 |
| **场景覆盖** | Spec 场景汇总表中的每个场景是否都有对应的测试 |
| **Scope Creep** | 是否存在超出 Spec 范围的实现（做了 Spec 没要求的东西） |
| **Delta 一致性** | 棕地项目的 Delta 章节中标记"不变"的部分是否真的没被修改 |

**检查方法**：

1. 读取 `.forge/specs/<feature>/spec.md`，提取所有需求和场景。
2. 逐条对照代码变更，确认每个需求有对应实现。
3. 逐条对照测试文件，确认每个场景有对应测试。
4. 扫描代码变更，识别不在 Spec 中的新增功能（Scope Creep）。
5. 如果是棕地项目，检查 Delta "不变"列表中的文件是否被修改。

### Layer 2 — 代码质量（quality-check）

**评审者**：`.claude/agents/quality-check.md`

**职责**：检查代码质量的六个维度。

| 维度 | 检查内容 |
|------|---------|
| **命名一致性** | 变量、函数、类的命名是否遵循项目约定（camelCase/snake_case/PascalCase） |
| **错误处理** | 是否有未捕获的异常、空的 catch 块、缺失的错误边界 |
| **性能热点** | 是否有 N+1 查询、不必要的循环、大数据量未分页、同步阻塞操作 |
| **测试覆盖率** | 新增代码是否有对应测试、边界条件是否覆盖 |
| **代码重复** | 是否有可提取为公共函数的重复逻辑 |
| **可维护性** | 函数是否过长（>50 行）、嵌套是否过深（>3 层）、职责是否单一 |

### Layer 3 — 安全与风险（security-check）

**评审者**：`.claude/agents/security-check.md`

**职责**：检查安全风险的五个维度。

| 维度 | 检查内容 |
|------|---------|
| **硬编码密钥** | 代码中是否有硬编码的 API Key、密码、Token、连接字符串 |
| **注入风险** | 是否有 SQL 注入、XSS、命令注入、路径遍历等注入漏洞 |
| **不安全依赖** | 新增的依赖是否有已知漏洞、是否来自可信源 |
| **权限边界** | 是否有越权访问、缺失的鉴权检查、过宽的权限授予 |
| **敏感数据泄露** | 日志中是否打印敏感信息、错误响应是否暴露内部细节 |

---

## 4. 严重度分级

所有发现的问题按以下四级分类：

| 级别 | 含义 | 处理方式 | 示例 |
|------|------|---------|------|
| **P0** | 阻塞发布 | 必须立即修复，`/forge ship` 阻断 | 硬编码数据库密码、SQL 注入漏洞、核心需求未实现 |
| **P1** | 高影响 | 必须在发布前修复，`/forge ship` 阻断 | 缺失鉴权检查、关键路径无错误处理、Spec 场景未覆盖 |
| **P2** | 中影响 | 应该修复，可协商时间 | 命名不一致、代码重复、缺少边界测试 |
| **P3** | 低影响 | 建议改进，开发者自行决定 | 注释不完整、可优化的性能、代码风格建议 |

**分级原则**：

- 安全问题默认 P0 或 P1，除非影响范围极小。
- Spec 未实现的需求为 P1，超出 Spec 的实现为 P2。
- 代码质量问题通常为 P2 或 P3，除非影响功能正确性。

---

## 5. 修复路由分类

严重度回答"有多紧急"，修复路由回答"谁来修、怎么修"。

| 修复类别 | 默认处理者 | 含义 |
|---------|-----------|------|
| **safe_auto** | 评审者自动修复 | 局部的、确定性的修复，不改变行为契约（如：补缺的 import、修正拼写、添加缺失的类型注解） |
| **gated_auto** | 开发者确认后修复 | 有具体修复方案，但涉及行为变更、权限边界或契约变更，需要开发者确认 |
| **manual** | 开发者手动修复 | 需要设计决策或上下文判断，评审者只能指出问题，不能代替决策 |
| **advisory** | 仅记录 | 观察性输出，如学习建议、发布注意事项、残余风险提示 |

**路由规则**：

- P0/P1 问题的修复类别只能是 `gated_auto` 或 `manual`——不允许自动修复高风险问题
- P2 问题可以是 `safe_auto`（如果修复是确定性的）
- P3 问题默认 `advisory`

---

## 6. 置信度过滤

每个评审发现必须附带置信度评分（0.1-1.0）。**低于 0.8 的发现被过滤**，不出现在最终报告中。

**为什么过滤？** 低置信度的发现是噪音——它们分散注意力，降低开发者对评审报告的信任度。宁可漏报一个不确定的问题，也不要用 20 个"可能有问题"淹没真正的问题。

| 置信度 | 处理 |
|--------|------|
| ≥ 0.8 | 写入评审报告 |
| 0.5-0.7 | 记录到 `.forge/reviews/<topic>-low-confidence.md`，不阻断流程 |
| < 0.5 | 丢弃 |

**评审者输出格式**（每个发现，使用 P5 证据链）：

```
[severity: P1] [confidence: 0.9] [fix: gated_auto]
文件：src/routes/export.ts 第 42 行
[Evidence] 代码：`router.get('/export', exportHandler)` — 无鉴权中间件
[Claim] 缺少鉴权中间件，任何用户都能访问导出接口
建议：添加 authMiddleware 到路由链
```

---

## 7. 发现合并与质量门

三个评审者并行输出后，在生成最终报告前，必须经过**合并管线**和**质量门**。这两步防止评审报告本身质量低下——一份充满重复、误报和模糊建议的评审报告比没有评审更糟糕。

### 7.1 发现去重

三个评审者可能独立发现同一个问题（比如 spec-check 和 quality-check 都发现某个接口缺少错误处理）。重复的发现浪费开发者注意力。

**去重规则**：

1. 对每个发现计算指纹：`normalize(文件路径) + line_bucket(行号, ±3) + normalize(问题描述)`。
2. 行号容差 ±3 行——同一个问题被不同评审者定位到相邻行是正常的。
3. 指纹匹配时，合并为一条发现：
   - 保留**最高严重度**（P0 > P1 > P2 > P3）
   - 保留**最高置信度**
   - 保留**最保守的修复路由**（manual > gated_auto > safe_auto）
   - 在评审者列标注所有发现者（如"spec-check, quality-check"）

**示例**：

```
合并前：
  [spec-check]    P1, confidence 0.85, 文件 src/routes/export.ts:42 — 缺少错误处理
  [quality-check] P2, confidence 0.90, 文件 src/routes/export.ts:43 — 异常未捕获导致 500

合并后：
  [spec-check, quality-check] P1, confidence 0.90, 文件 src/routes/export.ts:42 — 缺少错误处理（异常未捕获导致 500）
```

### 7.2 跨评审者一致性验证

当 2 个以上独立评审者发现同一问题（去重后同一指纹有多个来源），**置信度提升 0.10**（上限 1.0）。

**为什么？** 独立评审者从不同视角收敛到同一问题，是比任何单个评审者的置信度更强的信号。一个评审者说"可能有问题"是猜测，两个评审者独立说"有问题"是证据。

**输出标注**：

```
[severity: P1] [confidence: 0.95 ↑] [fix: gated_auto] [cross-validated: spec-check, quality-check]
文件：src/routes/export.ts 第 42 行
问题：缺少错误处理，异常未捕获导致 500
建议：添加 try-catch 和错误响应
```

`↑` 标记表示置信度因跨评审者一致性而提升。

### 7.3 报告质量门

在输出最终评审报告前，对报告本身执行 **6 项质量自检**。评审报告的质量直接决定开发者对评审系统的信任度——一次误报就能让开发者开始忽略所有评审结果。

| # | 检查项 | 检查内容 | 不通过时的处理 |
|---|--------|---------|--------------|
| 1 | **可操作性** | 每个发现是否有具体的修复建议？ | 将"考虑改进"、"可能需要"等模糊建议改写为具体操作 |
| 2 | **误报排除** | 发现指出的"问题"是否在同一函数的其他位置已处理？ | 重新阅读上下文代码，确认问题确实存在后才保留 |
| 3 | **严重度校准** | 风格问题是否被标为 P0？安全漏洞是否被标为 P3？ | 重新校准严重度 |
| 4 | **行号准确性** | 引用的行号是否指向正确的代码？ | 核对文件内容，修正行号 |
| 5 | **不与 Linter 重复** | 是否报告了项目 Linter/Formatter 会自动捕获的问题（缺少分号、缩进错误）？ | 删除 Linter 能捕获的发现，聚焦语义问题 |
| 6 | **受保护文件** | 是否建议删除 `.forge/` 目录下的状态文件？ | 丢弃该发现——`.forge/` 下的文件是工作流状态，不是代码质量问题 |

**质量门输出**（内部自检，不展示给用户）：

```
📋 报告质量门

✅ 可操作性：所有 N 个发现均有具体修复建议
✅ 误报排除：已验证 N 个发现的上下文
✅ 严重度校准：无异常分级
✅ 行号准确性：所有行号已核对
✅ 不与 Linter 重复：无 Linter 可捕获的发现
✅ 受保护文件：无误标 .forge/ 文件

质量门通过，输出评审报告。
```

如果任一项不通过，自动修正后重新检查，直到全部通过。

---

## 8. 门禁：P0/P1 存在 → 阻断 `/forge ship`

评审完成后，如果存在 P0 或 P1 级别的问题，`/forge ship` 将被阻断。

**阻断行为**：

```
🚫 Ship 阻断：评审未通过

发现 P0/P1 级别问题，必须修复后重新评审：

P0（阻塞发布）：
  1. [security-check] src/config/db.ts 第 12 行：硬编码数据库密码
     → 使用环境变量替代

P1（高影响）：
  1. [spec-check] 需求 2 场景 S3 未实现：当导出超过 10000 条时的异步处理
     → 补充异步导出逻辑
  2. [quality-check] src/routes/export.ts：缺少错误处理，异常会导致 500
     → 添加 try-catch 和错误响应

请修复以上问题后运行 /forge review 重新评审。
```

**放行条件**：评审结果中仅有 P2 和 P3 级别问题时，允许 `/forge ship` 继续执行。

```
✅ 评审通过

发现 2 个 P2 问题和 1 个 P3 问题（不阻塞发布）：

P2（中影响）：
  1. [quality-check] src/services/export.ts：filterOrders 和 exportOrders 有重复的日期校验逻辑
     → 建议提取为公共函数

P3（低影响）：
  1. [quality-check] src/jobs/async-export.ts：建议添加 JSDoc 注释

可以继续执行 /forge ship，或先修复以上问题。
```

---

## 9. 评审报告格式

### 输出路径

`.forge/reviews/<topic>.md`

### YAML Frontmatter

```yaml
---
topic: "<主题>"
date: "YYYY-MM-DD"
result: "pass" | "fail"
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 0
---
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `topic` | string | 评审主题，kebab-case 格式 |
| `date` | string | 评审日期，YYYY-MM-DD 格式 |
| `result` | string | `pass`（无 P0/P1）或 `fail`（有 P0/P1） |
| `p0_count` | number | P0 问题数量 |
| `p1_count` | number | P1 问题数量 |
| `p2_count` | number | P2 问题数量 |
| `p3_count` | number | P3 问题数量 |

### 正文结构

```markdown
---
topic: "order-batch-export"
date: "2025-01-15"
result: "pass"
p0_count: 0
p1_count: 0
p2_count: 1
p3_count: 1
---

## Layer 1 — Spec 对齐

**评审者**：spec-check

| 需求/场景 | 状态 | 说明 |
|-----------|------|------|
| 需求 1 场景 S1 | ✅ 已实现 | — |
| 需求 1 场景 S2 | ✅ 已实现 | — |
| 需求 2 场景 S3 | ✅ 已实现 | — |

Scope Creep：无

## Layer 2 — 代码质量

**评审者**：quality-check

| # | 严重度 | 文件 | 问题 | 建议 |
|---|--------|------|------|------|
| 1 | P2 | `src/services/export.ts` | 重复的日期校验逻辑 | 提取为公共函数 |

## Layer 3 — 安全与风险

**评审者**：security-check

| # | 严重度 | 文件 | 问题 | 建议 |
|---|--------|------|------|------|
| 1 | P3 | `src/config/export.ts` | 导出文件路径未做路径遍历检查 | 添加路径规范化 |

## 总结

- **结果**：✅ 通过（无 P0/P1）
- **P0**：0 个
- **P1**：0 个
- **P2**：1 个
- **P3**：1 个
```

---

## 10. 执行流程

### 完整流程图

```
用户输入 /forge review
        │
        ▼
  ┌─────────────┐
  │  前置检查    │  有代码变更？有 Spec？
  └──────┬──────┘
         │
         ▼
  ┌─────────────────────────────────┐
  │  Agent Team 并行评审             │
  │                                 │
  │  ┌───────────┐ ┌────────────┐ ┌──────────────┐
  │  │spec-check │ │quality-    │ │security-     │
  │  │Spec 对齐  │ │check       │ │check         │
  │  │           │ │代码质量    │ │安全与风险    │
  │  └─────┬─────┘ └─────┬──────┘ └──────┬───────┘
  │        │             │               │
  └────────┼─────────────┼───────────────┘
           │             │               │
           ▼             ▼               ▼
  ┌─────────────────────────────────┐
  │  发现合并                        │
  │  1. 置信度过滤（< 0.8 过滤）    │
  │  2. 去重（指纹匹配 ±3 行）      │
  │  3. 跨评审者一致性（+0.10）     │
  └──────────┬──────────────────────┘
             │
             ▼
  ┌─────────────────────────────────┐
  │  报告质量门（6 项自检）          │
  │  可操作性 / 误报排除 / 严重度   │
  │  行号准确 / 不与 Linter 重复    │
  │  受保护文件                     │
  └──────────┬──────────────────────┘
             │
             ▼
  ┌─────────────┐
  │ P0/P1 存在？│
  └──────┬──────┘
    是 │     │ 否
       ▼     ▼
    🚫 阻断  ✅ 通过
    ship     可以 ship
             │
             ▼
  ┌─────────────────────────────────┐
  │  清理 Agent Team                │
  │  关闭队友 → 清理团队资源        │
  └─────────────────────────────────┘
```

### Step 0：前置检查

1. 检查 `.forge/` 目录是否存在 → 不存在则提示 `forge init`。
2. 检查是否有代码变更（build 阶段的产出）。
3. 读取 `.forge/specs/` 中锁定的 Spec（作为评审基准）。

### Step 1：启动 Agent Team

使用第 2 节中的启动指令创建评审团队。根据路径和 Spec 情况选择三人或两人团队。三个评审者并行工作。

### Step 2：合并与质量门

收集三个评审者的输出，执行发现合并管线（§7）：置信度过滤 → 去重 → 跨评审者一致性验证 → 报告质量门。

### Step 3：输出报告

将评审报告写入 `.forge/reviews/<topic>.md`，并向用户展示摘要。

### Step 4：清理团队

评审报告输出后，清理 Agent Team 资源：

1. 要求所有队友关闭：`Ask all teammates to shut down`
2. 等待队友确认退出
3. 清理团队：`Clean up the team`

---

## 11. 边界情况处理

### 11.1 无 Spec（轻量路径）

轻量路径没有锁定的 Spec。此时**不启动 spec-check agent**，仅运行 quality-check 和 security-check 两个评审者：

```
ℹ️ 轻量路径：未找到锁定的 Spec，跳过 spec-check agent。
仅启动 quality-check + security-check 进行评审。
```

**Agent Team 动态裁剪**：轻量路径下，review 的 Agent Team 配置自动裁剪为：

```json
{
  "name": "review-light",
  "members": [
    {"name": "quality-check", "role": "代码质量", "agent": "quality-check"},
    {"name": "security-check", "role": "安全与风险", "agent": "security-check"}
  ]
}
```

这避免了 spec-check agent 被加载但无 Spec 可对照的 token 浪费。评审报告中 Layer 1 章节标注"轻量路径，已跳过"。

### 11.2 标准路径无 Spec

标准路径下，如果 Plan 文档中标注了 `spec_ref: "none（基于用户需求描述）"`，说明用户选择了无 Spec 模式。此时 **spec-check agent 同样不启动**，行为与轻量路径一致：

```
ℹ️ 标准路径（无 Spec 模式）：Plan 标注 spec_ref: "none"，跳过 spec-check agent。
仅启动 quality-check + security-check 进行评审。
```

评审报告中 Layer 1 章节标注"无 Spec 模式，已跳过"。

### 11.2 无代码变更

如果没有检测到代码变更，提示：

```
⚠️ 未检测到代码变更。请先运行 /forge build 完成代码实现。
```

### 11.3 评审者输出超过限制

每个评审者的输出应控制在合理范围内。如果某个评审者输出过长，截断并提示：

```
⚠️ quality-check 输出过长，已截断。完整报告见 .forge/reviews/<topic>.md。
```

### 11.4 无 `.forge/` 目录

提示先运行初始化：

```
⚠️ 未检测到 .forge/ 目录。请先运行 forge init 初始化项目。
```

### 11.5 Agent Team 清理失败

如果队友关闭超时或清理失败：

```
⚠️ Agent Team 清理未完成。部分队友可能仍在运行。
如果后续需要创建新团队，请先手动清理：
  tmux ls                          # 列出会话
  tmux kill-session -t <session>   # 关闭残留会话
```

---

## 12. 示例

### 示例 1：评审通过

```
$ /forge review

🔍 启动三层评审...

━━━ Layer 1 — Spec 对齐 ━━━
✅ 所有 5 个场景均已实现
✅ 无 Scope Creep

━━━ Layer 2 — 代码质量 ━━━
P2: src/services/export.ts — 重复的日期校验逻辑，建议提取公共函数

━━━ Layer 3 — 安全与风险 ━━━
✅ 无安全问题

📋 评审结果：✅ 通过
  P0: 0 | P1: 0 | P2: 1 | P3: 0

报告已写入：.forge/reviews/order-batch-export.md
下一步：/forge test
```

### 示例 2：评审未通过

```
$ /forge review

🔍 启动三层评审...

━━━ Layer 1 — Spec 对齐 ━━━
P1: 需求 2 场景 S3 未实现（异步导出判定）

━━━ Layer 2 — 代码质量 ━━━
P1: src/routes/export.ts — 缺少错误处理
P2: src/services/export.ts — 重复逻辑

━━━ Layer 3 — 安全与风险 ━━━
P0: src/config/db.ts 第 12 行 — 硬编码数据库密码

📋 评审结果：🚫 未通过
  P0: 1 | P1: 2 | P2: 1 | P3: 0

🚫 Ship 阻断：存在 P0/P1 问题，必须修复后重新评审。
报告已写入：.forge/reviews/order-batch-export.md
```
