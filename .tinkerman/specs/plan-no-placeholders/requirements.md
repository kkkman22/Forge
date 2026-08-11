---
status: completed
feature: plan-no-placeholders
layout: requirements
created: 2026-06-04
tier: standard
---
# Requirements Document

## Introduction

obra/superpowers 的 `writing-plans` skill 有一份明确的"计划失败"清单（No Placeholders），外加关键原则："Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste."

Forge 的 plan instructions 有核心原则"计划中不允许任何模糊内容"，但没有枚举具体的 placeholder 模式，导致"添加适当的错误处理"、"参考 Task 3 的模式"、"编写测试"等模糊指令通过了 plan 审核。

**明确不做的事情**：不修改 plan 的五步流程（Research → File Mapping → Task Breakdown → Self-Check → User Approval）；不修改 TypeScript 代码（`src/plan.ts`）；不改变 plan 的输出路径或文件格式。

## Requirements

### Requirement 1: No-Placeholders 黑名单

**User Story:** 作为 plan 执行者，我希望 plan 中没有任何模糊指令，这样我能不依赖猜测地完成每个 step。

#### Acceptance Criteria

1. `skills/forge/lib/plan/instructions.md` SHALL 在 Task Breakdown 步骤后新增 "Plan 质量门禁：No-Placeholders 铁律" 章节。
2. THE 章节 SHALL 定义一个包含至少 7 种禁止模式的表格，每行包含：模式名称、示例、为什么失败。
3. THE 禁止模式 SHALL 覆盖：模糊待办（TBD/TODO）、空泛指令（"添加适当的错误处理"）、无代码测试（"编写测试"不含代码）、跨任务引用（"参考 Task N"）、描述性步骤（"实现导出功能"无代码）、未定义引用、空验证。
4. THE 章节 SHALL 定义正确的 Step 格式模板，包含四个必须要素：文件路径、代码、验证命令、预期输出。
5. THE 章节 SHALL 以自审清单结尾，包含至少 5 个检查项。

### Requirement 2: Placeholder Scan 自审子步骤

**User Story:** 作为 plan 执行者，我希望在 Self-Check 阶段有具体的 grep 命令扫描 placeholder，这样能自动检测而非依赖人工。

#### Acceptance Criteria

1. `skills/forge/lib/plan/instructions.md` Self-Check 步骤 SHALL 新增 "Placeholder Scan" 子步骤。
2. THE 子步骤 SHALL 定义至少 4 条 grep 命令，扫描 TBD/TODO、空泛指令、跨任务引用、无代码测试声明。
3. THE 子步骤 SHALL 规定：任何命中 → 修复后重新扫描，直到零命中。

### Requirement 3: Type Consistency Check 自审子步骤

**User Story:** 作为 plan 执行者，我希望在 Self-Check 阶段检查跨 task 的类型/函数名一致性。

#### Acceptance Criteria

1. `skills/forge/lib/plan/instructions.md` Self-Check 步骤 SHALL 新增 "Type Consistency Check" 子步骤。
2. THE 子步骤 SHALL 要求：从 tasks.md 中提取所有函数签名和类型定义，验证跨 task 引用时名称一致。
3. THE 子章节 SHALL 包含示例：Task 3 定义 `clearLayers()` → Task 7 调用时不能写成 `clearFullLayers()`。

### Requirement 4: Zero Context 原则

**User Story:** 作为 plan 执行者，我希望 plan 的 Overview 中明确声明"假设执行者对代码库零了解"。

#### Acceptance Criteria

1. `skills/forge/lib/plan/instructions.md` Overview 章节 SHALL 追加 "Zero Context 原则" 声明。
2. THE 声明 SHALL 表述：假设执行者对代码库零了解、品味存疑。每个 step 必须包含执行者需要的全部信息——不能假设他们知道项目约定、文件结构或已有代码模式。
