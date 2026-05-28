---
topic: "branch-lifecycle-enforcement"
spec_ref: ".kiro/specs/branch-lifecycle-enforcement"
status: "approved"
created: "2026-04-29"
---

# Plan: Branch Lifecycle Enforcement

> 来源: `.kiro/specs/branch-lifecycle-enforcement/tasks.md`

## Objective

修复 Forge 分支生命周期管理的四个系统性缺陷：topic 失配放行、keep-branch 无追踪、过期分支未检测、跨 topic 提交无阻止。

## 任务摘要

1. **Bug Condition 探索测试** — 编写 PBT 测试 `test/branch-lifecycle-bug-condition.property.test.ts`，验证四个 bug 场景在未修复代码上失败
2. **Preservation 属性测试** — 编写 PBT 测试 `test/branch-lifecycle-preservation.property.test.ts`，验证现有行为不变
3. **实现 branch-lifecycle 模块**
   - 3.1 `src/loop-types.ts` 新增 4 个类型
   - 3.2 `src/branch-lifecycle.ts` 实现 6 个纯函数
   - 3.3 更新 SKILL 文档（forge-build §2.1 + forge-ship 选项 3）
   - 3.4 验证 bug condition 测试通过
   - 3.5 验证 preservation 测试通过
4. **Checkpoint** — `npm run check` 全量验证

## 依赖关系

```
Task 1, 2 (测试，可并行) → Task 3 (实现) → Task 4 (验证)
```

## 风险评估

- **低风险**：纯函数新模块，不修改现有函数
- **注意点**：barrel-file 导出数量、SKILL 文档纯函数对接验证
