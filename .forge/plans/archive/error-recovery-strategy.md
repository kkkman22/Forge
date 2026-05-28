---
status: approved
created: "2026-04-29"
approved: "2026-04-29"
source: ".kiro/specs/error-recovery-strategy/tasks.md"
---

# Plan: Error Recovery Strategy

> 来源: `.kiro/specs/error-recovery-strategy/tasks.md`

## Objective

为 `/forge resume` 实现系统性错误恢复机制。纯 TypeScript 模块，所有核心逻辑为纯函数，不执行 I/O。

## 任务摘要

1. **核心数据模型** — 创建 `src/error-recovery.ts`，定义所有 TypeScript 接口、类型、常量（PHASE_SEQUENCES、TEST_FILE_PATTERNS），更新 `src/index.ts` barrel file
2. **Git_State_Scanner** — 实现 `parseGitLog`、`extractCommitPatterns`、`filterCommitsSince`、`matchCommitsToTasks`，编写 Properties 1-2
3. **Uncommitted_Change_Detector** — 实现 `parseGitStatus`、`matchChangesToTask`，编写 Properties 3-4
4. **Progress_Reconciler** — 实现 `findProgressInconsistencies`、`findDependencyGaps`、`buildReconciliationPatch`，编写 Properties 5-7
5. **Phase_Reconciler** — 实现 `getPhaseSequence`、`getNextPhase`、`findPhaseInconsistencies`，编写 Properties 8-9
6. **Interruption_Classifier** — 实现 `classifyInterruption`、`isTestFile`、`inferTDDPhase`，编写 Properties 10-13
7. **Recovery_Engine report builder** — 实现 `buildRecoveryReport`、`calculateSegmentation`，编写 Properties 14-15
8. **Recovery_Report serializer/deserializer** — 实现 `serializeRecoveryReport`、`deserializeRecoveryReport`，编写 Property 16
9. **InterruptionClassification/CheckpointMarker serializers** — 实现四个序列化函数，编写 Properties 17-18
10. **单元测试** — 边界情况、报告选项、阶段序列、修复依赖顺序
11. **导出验证 + 全量测试** — 更新 barrel file，运行 `npm run check`

## 依赖关系

```
Task 1 (类型) → Task 2/3/4/5 (并行扫描器) → Task 6 (分类器) → Task 7 (报告) → Task 8/9 (序列化) → Task 10 (单元测试) → Task 11 (验证)
```

Task 2-5 依赖 Task 1 的类型定义，但彼此无依赖。Task 6 依赖 Task 2-5 的扫描结果。Task 7 依赖 Task 6 的分类结果。Task 8-9 依赖 Task 7 的报告结构。

## 风险评估

- **低风险**：纯函数模块，无 I/O，不影响现有代码
- **注意点**：barrel file 测试需更新导出数量（新增 error-recovery 导出）
- **注意点**：fuzzy matching 的 commit message 匹配需精心设计，避免误匹配

## 实现策略

TDD 强制：每个 Task 先写失败的属性测试（RED），再实现纯函数让测试通过（GREEN），最后重构（REFACTOR）。
