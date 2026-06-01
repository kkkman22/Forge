---
feature: forge-loop-native-fusion
task: "4.1"
scenario: 3
tier: any
date: 2026-06-01
result: pass
---

# Smoke Test 3: Three-strike → halted + Git rollback

## 场景

连续 3 次失败触发 three-strike 机制，loop 进入 halted 状态并回滚 Git。

## 验证项

- [x] consecutiveFailures 从 0 递增到 3
- [x] 达到 3 时 haltReason 设为 "three-strike"
- [x] Git 回滚逻辑：`git reset --hard` 到 lastSuccessCommit
- [x] 成功时 consecutiveFailures 重置为 0 + 自动 commit
- [x] Halted 后 ScheduleWakeup/CronCreate 不再调度

## 测试覆盖

- `test/loop/three-strike.test.ts`: 17 tests ✅
  - consecutiveFailures 递增
  - ≥3 halt + git reset
  - 成功重置 + commit
  - halt 后不调度

## 结果

✅ PASS — Three-strike 机制完整：递增、halt、回滚、重置均正确。
