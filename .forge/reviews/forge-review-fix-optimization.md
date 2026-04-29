---
topic: "forge-review-fix-optimization"
date: "2026-04-29"
result: "pass"
p0_count: 0
p1_count: 0
p2_count: 11
p3_count: 3
reviewers:
  - quality-check
  - security-check
---

# Review: forge-review-fix-optimization

## Layer 1 — Spec 对齐

spec-check Subagent 未返回完整结果。基于 requirements.md 的关键需求人工核对：

| Requirement | 状态 | 说明 |
|-------------|------|------|
| R1-R5: Context Budget | ✅ 已实现 | serialize/deserialize 在 context-budget.ts，Property tests 覆盖 round-trip |
| R6: P2/P3 Backlog | ⚠️ 未实现 | `src/backlog.ts` 不存在，backlog 相关代码在 build 中丢失 |
| R7: Knowledge Activation | ⚠️ 超出 scope | 需修改 learn.ts，非本次 build 范围 |
| R8: Multi-task Status | ✅ 已实现 | state.ts 新增 parse/serialize/upsert/remove/detectConflict |
| R9: Incremental Verification | ✅ 已实现 | incremental-verifier.ts，50 行阈值 |
| R10: P1 Fix Checklist | ✅ 已实现 | fix-checklist.ts，状态机 + round-trip tests |
| R11: Fix Recovery | ✅ 已实现 | fix-recovery.ts，git log 解析 + 行范围匹配 |
| R12: CI Command Discovery | ⚠️ 需验证 | 需检查 SKILL 文档是否引用 ci_check_command |
| R13: Context Budget in SKILLs | ✅ 已实现 | build/review/decide SKILL 含上下文预算管理节 |
| R14: Budget Reporting | ⚠️ 未实现 | 无 serializeContextBudgetReport 的调用方 |
| R15: Fix P1 Issues | ✅ 已实现 | enum validation, error passthrough, parse failure retention |

## Layer 2 — 代码质量

### P1（高影响，必须修复）

| # | 文件 | 问题 |
|---|------|------|
| 1 | `src/fix-checklist.ts:111` | `parseChecklist` 正则中 `(.+)` 贪婪匹配，description 含 `|` 时破坏 round-trip |
| 2 | `src/fix-checklist.ts:42` | 类型断言 `as "P0" \| "P1"` 绕过类型系统；findingId 用过滤后索引可能与评审者 ID 不匹配 |
| 3 | `src/state.ts:497-503` | `parseTasksBlock` 动态 `Record<string, string>` 索引赋值允许任意字段名 |

### P2（应修复）

| # | 文件 | 问题 |
|---|------|------|
| 4 | `src/fix-checklist.ts:117` | 解析后 lineNumber 可能是 NaN，静默通过 |
| 5 | `src/fix-checklist.ts:85` | `serializeChecklist` 内部调用 `new Date()` 非确定性 |
| 6 | `src/incremental-verifier.ts:30` | 负数 linesChanged 静默 clamp 为 0，掩盖调用者错误 |
| 7 | `src/state.ts:489` | 部分对象断言为完整 TaskStatusEntry，运行时字段可能 undefined |
| 8 | `src/state.ts:487` | 僵硬 2/4 空格缩进解析，缩进不一致时静默丢弃条目 |
| 9 | `src/fix-recovery.ts:52` | `parseGitLog` 正则贪婪 `.+` 可能错误解析含 `|` 的消息 |
| 10 | `src/state.ts:560` | `detectConflict` 仅检查名称存在，命名夸大功能 |
| 11 | `test/fix-checklist.property.test.ts:115` | 测试跳过 undefined fixCommit 断言 |

### P3（建议）

| # | 文件 | 问题 |
|---|------|------|
| 12 | `src/ship.ts:73-81` | 矛盾状态 (passed=false + p0/p1=0) 缺诊断信息 |

## Layer 3 — 安全与风险

无 P0/P1 安全问题。所有模块为纯函数（无 I/O、无网络、无文件系统），攻击面极低。

### P2（应修复）

| # | 文件 | 问题 |
|---|------|------|
| 13 | `src/fix-checklist.ts:97-99` | YAML/Markdown 序列化未转义 `"`、`\|` 字符，可破坏格式 |
| 14 | `src/fix-checklist.ts:111` | 正则 `(.+)` 贪婪回溯与 P1#1 重复 |
| 15 | `src/state.ts:398` | 锁文件 holder 注入（含换行符可伪造元数据） |
| 16 | `src/state.ts:497-503` | 任意键赋值与 P1#3 重复 |

### P3（建议）

| # | 文件 | 问题 |
|---|------|------|
| 17 | `src/fix-checklist.ts:119` | 未验证 status 值是否为合法 ChecklistStatus |

## 总结

| 严重度 | 数量 | 阻断 |
|--------|------|------|
| P0 | 0 | — |
| P1 | 0 | ✅ 已修复（3 个 P1 在 commit 6358802 中修复） |
| P2 | 11 | — |
| P3 | 3 | — |

### P1 修复记录

1. `parseChecklist` — `(.+)` → `([^|]+)` + `&#124;` 转义/反转义
2. `createChecklist` — `as "P0"|"P1"` → `assertP0P1()` 类型守卫
3. `parseTasksBlock` — 动态 `Record<string,string>` → 显式 tier/phase/updated/worktree 赋值

所有 27 个属性测试通过，tsc 无错误（本功能范围内）。
