---
feature: skill-document-optimization
layout: design
created: 2026-04-29
---

# Design Document: SKILL Document Optimization

## Overview

本设计将 16 个 SKILL 文档从 ~320K 字符压缩至 ≤192K 字符（40% 压缩率），通过三种互补的压缩策略实现：输出模板去冗余、Constitution 引用替代重述、失败模式表格化。优化不改变任何行为语义，所有现有 contract test 必须继续通过。

## Design Strategy

### 策略 1：Canonical Example（输出模板去冗余）

**原则**：每种输出格式类型保留一个完整示例（Canonical Example），其余变体用一行差异描述替代。

**适用范围**：
- forge-build §2 前置检查拒绝输出（4 个示例 → 1 个 + 3 行描述）
- forge-build §2.1 分支切换输出（4 个示例 → 1 个 + 3 行描述）
- forge-build §10 执行示例（2 个示例 → 1 个精简版）
- forge-review §8 门禁输出（阻断 + 放行各 1 个，删除 §12 中的重复示例）
- forge-review §13 前置检查拒绝输出（2 个示例 → 1 个 + 1 行描述）
- forge-learn §11 示例（3 个示例 → 1 个 + 2 行描述）

**变体描述格式**：
```
其他场景：替换 `<字段名>` 为对应值。Spec 未锁定 → 证据改为 spec status；多项不通过 → 逐条列出。
```

### 策略 2：Reference Directive（Constitution 引用替代重述）

**原则**：CLAUDE.md 中已完整定义的规则，在 SKILL 中用 `→ 遵循 CLAUDE.md §X.Y` 引用，仅保留 SKILL 特有的补充。

**适用范围与引用映射**：

| SKILL 章节 | 引用目标 | 保留内容 |
|------------|---------|---------|
| forge-build §4 TDD 铁律（~150 行） | → CLAUDE.md §2.1 | Subagent 内 TDD 执行方式（~15 行） |
| forge-build §6.1-§6.5 执行纪律 | → CLAUDE.md §2.2-§2.4 | §6.0 反漂移护栏、状态文件保护（build 特有） |
| forge-build §6.3 P5 证据链 | → CLAUDE.md §2.3 | 一个 build 阶段具体示例 |
| forge-review §4 严重度分级 | → CLAUDE.md §3.3 | 评审阶段特有的分级原则 |

**引用格式**：
```markdown
### 4. TDD 铁律

→ 遵循 CLAUDE.md §2.1 TDD 强制（RED → GREEN → REFACTOR 不可跳过）

**Build 阶段补充**：
- Subagent 内 TDD：每个 Subagent 独立执行完整 TDD 循环...
```

### 策略 3：Failure Mode Table（失败模式表格化）

**原则**：三段式（错误行为 / 为什么错 / 正确做法）压缩为表格，每个模式一行。

**表格格式**：
```markdown
| # | 失败模式 | 错误行为 | 正确做法 |
|---|---------|---------|---------|
| 1 | TDD RED 阶段写实现 | RED 阶段"顺手"写实现代码 | RED 只写测试，已写实现则删除重来 |
```

### 策略 4：Restatement 去重

forge-build §3.2（标准路径）和 §3.3（全量路径）中 Restatement 机制几乎完全重复。§3.2 保留完整定义，§3.3 改为：

```markdown
**Restatement Checkpoint**：与 §3.2 机制完全相同（计数器初始化、检查、递减、异常触发、摘要格式）。阶段二开始时初始化计数器。
```

### 策略 5：流程图简化

ASCII 流程图替换为编号步骤列表：

```markdown
**执行流程**：
1. 路径判定（轻量/标准/全量）
2. 前置门禁检查（标准/全量）
3. 初始化 Restatement 计数器（标准/全量）
4. 循环：Closure-First 探针 → Subagent TDD → 检查状态 → 更新 progress → 原子提交 → 计数器 -1
5. 全量测试 + 删除 interim 日志
6. → /forge review
```

### 策略 6：forge-learn 规则蒸馏精简

§6.5 的 10 个子章节（§6.5.1-§6.5.10）精简为：
- 保留蒸馏算法伪代码（§6.5.2）
- 保留阈值条件表格（§6.5.4）
- 保留排除过滤器列表（§6.5.5）
- 压缩：转换过程、冲突检测、容量管理、陈旧检测、提案展示、写入日志 → 每个 3-5 行规则描述 + 1 个示例

## 预估压缩效果

| SKILL | 当前字符数 | 目标字符数 | 主要压缩来源 |
|-------|-----------|-----------|-------------|
| forge-build | 58,409 | ≤29,000 | TDD 章节引用化、Restatement 去重、模板去冗余、流程图简化、失败模式表格化 |
| forge-learn | 41,218 | ≤21,000 | 规则蒸馏精简、示例去冗余、流程图简化 |
| forge-plan | 32,172 | ≤19,000 | 模板去冗余、示例精简 |
| forge-review | 28,497 | ≤17,000 | 严重度引用化、示例去冗余、失败模式表格化、流程图简化 |
| 其余 12 个 | 160,535 | ≤106,000 | 各自适用的策略组合 |
| **总计** | **320,831** | **≤192,000** | — |

## Contract Test 兼容性

以下 contract test 断言必须在优化后继续通过：

1. **frontmatter 完整性**：每个 SKILL.md 以 `---` 开头，包含 `name` 和 `description` 字段
2. **disable-model-invocation**：除 forge-router 外所有 SKILL 包含 `disable-model-invocation: true`
3. **章节结构**：每个 SKILL.md 在 frontmatter 后有 `##` 标题
4. **概述/指令章节**：每个 SKILL.md 包含 `## Instructions`、`## 概述` 或编号 `##` 标题
5. **forge-learn 规则蒸馏**：包含 `Rule Distillation` 或 `规则蒸馏`、四个数据源引用、五个阈值条件

## 执行顺序

按文件大小降序优化，最大收益优先：
1. forge-build（58K → ≤29K）
2. forge-learn（41K → ≤21K）
3. forge-plan（32K → ≤19K）
4. forge-review（28K → ≤17K）
5. 其余 12 个 SKILL（按大小降序）

每个文件优化后立即运行 contract test 验证，确保不破坏断言。

## 不做的事情

- **不修改 CLAUDE.md**：Constitution 是 immutable 的（§5.6），本次只优化 SKILL 文档
- **不改变行为语义**：所有规则、阈值、流程保持不变，只改变表达方式
- **不合并 SKILL 文件**：每个 forge 子命令保持独立的 SKILL.md
- **不修改 YAML frontmatter**：name、description、disable-model-invocation 保持原值
