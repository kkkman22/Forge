---
feature: forge-loop-native-fusion
task: "4.1"
scenario: 2
tier: standard
date: 2026-06-01
result: pass
---

# Smoke Test 2: Standard tier `plan → build → review → test → ship → complete`

## 场景

Standard tier 完整路径：需求明确或已有 Spec。

## 验证项

- [x] Phase transition: standard × plan → build → review → test → ship → complete
- [x] Review P0/P1 → rollback to build（重新执行 build 阶段）
- [x] Review passed → 自动进入 test
- [x] Test failed → three-strike 计数递增
- [x] Scheduling: 迭代间 delay 按策略表选择

## 测试覆盖

- `test/loop/phase-transition.test.ts`: standard tier 全组合 + P0/P1 rollback ✅
- `test/loop/three-strike.test.ts`: consecutiveFailures 递增/重置 ✅
- `test/loop/scheduling-strategy.test.ts`: delaySeconds 选择 ✅

## 结果

✅ PASS — Standard tier 6 阶段流转正确，P0/P1 回退到 build，three-strike 计数逻辑正确。
