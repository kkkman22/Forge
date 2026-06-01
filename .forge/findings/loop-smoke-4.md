---
feature: forge-loop-native-fusion
task: "4.1"
scenario: 4
tier: any
date: 2026-06-01
result: pass
---

# Smoke Test 4: stopWhen 条件终止

## 场景

Loop 执行 stopWhen 条件评估，满足条件时优雅终止。

## 验证项

- [x] stopWhen 条件类型：max_iterations、max_tokens、max_time、custom_predicate
- [x] 每次迭代开始前评估 stopWhen
- [x] 条件满足时设置 haltReason 并终止
- [x] 终止前执行总结（diagnostic summary）
- [x] 无 stopWhen 时默认行为（无限迭代直到 three-strike）

## 测试覆盖

- `test/loop/stopwhen-evaluation.test.ts`: 17 tests ✅
  - 各条件类型评估
  - 多条件组合（AND/OR）
  - 默认无限行为

## 结果

✅ PASS — stopWhen 条件终止逻辑正确，支持多条件组合。
