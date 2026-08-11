---
feature: plan-no-placeholders
layout: design
created: 2026-06-04
---

# Design Document: Plan No-Placeholders

## Overview

在 plan instructions 的 Task Breakdown 和 Self-Check 阶段增加 No-Placeholders 质量门禁，包含黑名单表格、grep 扫描命令和类型一致性检查。纯 Markdown 追加。

## Architecture

无架构变更。仅修改 `skills/forge/lib/plan/instructions.md`。

## Components and Interfaces

### 1. Overview 追加 Zero Context 原则

在 Overview 章节的"核心原则"段落后追加：

```markdown
**Zero Context 原则**：假设执行者对代码库零了解、品味存疑。每个 step 必须包含执行者需要的全部信息——不能假设他们知道项目约定、文件结构或已有代码模式。如果需要他们知道什么，写在 step 的上下文中。
```

### 2. Task Breakdown 后追加 No-Placeholders 章节

```markdown
### Plan 质量门禁：No-Placeholders 铁律

每个 task step 必须包含执行者需要的**全部实际内容**。以下模式属于**计划失败**：

| 模式 | 示例 | 为什么失败 |
|------|------|-----------|
| 模糊待办 | "TBD"、"TODO"、"后续补充"、"待确认" | 执行者无法行动 |
| 空泛指令 | "添加适当的错误处理"、"处理边界情况"、"添加验证" | 什么是"适当"？"哪些"边界？ |
| 无代码测试 | "为以上逻辑编写测试"（不含实际测试代码） | 执行者不知测什么、怎么断言 |
| 跨任务引用 | "参考 Task 3 的模式"、"与 Task 1 类似" | 执行者可能不按顺序读 task |
| 描述性步骤 | "实现导出功能"（无代码、无文件路径、无验证命令） | "做什么"≠"怎么做" |
| 未定义引用 | 引用前面 task 中未定义的类型、函数或方法 | 类型/函数在引用点不存在 |
| 空验证 | "验证功能正常"（无具体命令、无预期输出） | 无法判断是否真的验证了 |

#### ✅ 正确的 Step 格式

每个 code step 必须包含：

- [ ] **Step N: {动词} {具体对象}**
  **文件**: `exact/path/to/file.ts:{行号范围}`
  **代码**: 完整的、可复制的代码块
  **验证**: 具体命令
  **预期**: 具体输出/exit code

每个 test step 必须包含完整的测试代码（包括断言）。

#### 自审清单

1. **Placeholder 扫描**：搜索黑名单中所有模式。发现 → 修复。
2. **引用一致性**：Task N 定义的函数名/类型名是否与 Task M 中的引用一致？
3. **路径完整性**：每个 step 是否都包含精确文件路径？
4. **代码完整性**：每个 code step 是否都有完整代码（不是描述）？
5. **验证可执行性**：每个 verify step 是否都有具体命令和预期输出？
```

### 3. Self-Check 追加 Placeholder Scan 子步骤

```markdown
#### 4.x Placeholder Scan（自审子步骤）

对生成的 tasks.md 执行以下 grep 扫描：

grep -nE '(TBD|TODO|待确认|待补|后续补充|implement later|fill in)' .forge/specs/<topic>/tasks.md
grep -nE '(适当|appropriate|合理|properly)' .forge/specs/<topic>/tasks.md
grep -nE '(参考 Task|类似 Task|同 Task|similar to Task)' .forge/specs/<topic>/tasks.md
grep -nE '编写测试|write tests|add tests' .forge/specs/<topic>/tasks.md

任何命中 → 修复后重新扫描，直到零命中。
```

### 4. Self-Check 追加 Type Consistency Check 子步骤

```markdown
#### 4.y Type Consistency Check（自审子步骤）

从 tasks.md 中提取所有函数签名、类型定义、属性名：
1. Task 3 定义了 `clearLayers()` → Task 7 调用时是否也叫 `clearLayers()`（不是 `clearFullLayers()`）
2. Task 1 定义了 `export interface Config { items: Item[] }` → Task 5 是否用了 `items`（不是 `entries`）

类型不一致 → 修复。
```

## Testing Strategy

- 人工审查：确认新增内容与现有 Self-Check 步骤不重复
- 用一个已有 plan 文件测试 grep 扫描命令的可执行性
- `npm run check`：全量测试通过
