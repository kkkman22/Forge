---
feature: plan-no-placeholders
layout: tasks
created: 2026-06-04
spec_ref: ".tinkerman/specs/plan-no-placeholders/requirements.md"
---

# Tasks

## Task 1: plan instructions Overview 追加 Zero Context 原则

- [ ] 1.1 在 `skills/forge/lib/plan/instructions.md` Overview 章节追加 "Zero Context 原则" 声明

## Task 2: plan instructions 追加 No-Placeholders 黑名单

- [ ] 2.1 在 Task Breakdown 步骤后新增 "Plan 质量门禁：No-Placeholders 铁律" 章节
- [ ] 2.2 写入 ≥7 种禁止模式表格（模式/示例/为什么失败）
- [ ] 2.3 写入正确 Step 格式模板（文件路径 + 代码 + 验证命令 + 预期输出）
- [ ] 2.4 写入 ≥5 项自审清单

## Task 3: plan instructions Self-Check 追加 Placeholder Scan

- [ ] 3.1 在 Self-Check 步骤新增 "Placeholder Scan" 子步骤
- [ ] 3.2 写入 ≥4 条 grep 扫描命令
- [ ] 3.3 写入"零命中才通过"的判定规则

## Task 4: plan instructions Self-Check 追加 Type Consistency Check

- [ ] 4.1 在 Self-Check 步骤新增 "Type Consistency Check" 子步骤
- [ ] 4.2 写入跨 task 函数名/类型名一致性验证方法 + 示例

## Task 5: 验证

- [ ] 5.1 确认新增内容与现有 Self-Check 步骤不重复
- [ ] 5.2 用一个已有 plan 文件测试 grep 命令可执行性
- [ ] 5.3 运行 `npm run check` 全量测试通过
