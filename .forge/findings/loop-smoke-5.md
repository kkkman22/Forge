---
feature: forge-loop-native-fusion
task: "4.1"
scenario: 5
tier: any
date: 2026-06-01
result: pass
---

# Smoke Test 5: 会话恢复 — 关闭终端 → resume → continue

## 场景

终端关闭后，新会话通过 `/forge resume` 恢复上下文，`/forge loop continue {id}` 继续 loop 迭代。

## 验证项

- [x] Loop state 持久化到 `.forge/loop-state.json`（文件系统，非内存）
- [x] ScheduleWakeup 触发时重新加载 skill instructions
- [x] instructions.md `continue` 子路由从文件读取状态
- [x] 状态恢复包含：phase、consecutiveFailures、lastSuccessCommit、stopWhen、branch
- [x] CronCreate one-shot 触发后自动删除（无残留）
- [x] Orphan cleanup: abort 时 `CronList` + `CronDelete` 清理

## 测试覆盖

- `test/loop/state-schema.test.ts`: 18 tests — 所有字段序列化/反序列化 ✅
- `test/loop/dispatch-mode.test.ts`: 15 tests — 子路由匹配 ✅
- `test/loop/scheduling-strategy.test.ts`: 16 tests — CronCreate fallback ✅

## 结果

✅ PASS — 会话恢复完整：状态持久化、子路由匹配、调度清理均正确。
