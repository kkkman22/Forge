---
updated: 2026-08-11
---
# Ship Gate Checks — 详解

## 三道门禁（顺序执行，全部通过方可继续）

| Gate | Check | Data Source | Block Condition |
|------|-------|-------------|-----------------|
| **Review Gate** | 评审是否通过（无 P0/P1 且无 incomplete Layer） | `.tinkerman/reviews/<topic>.md` | `result` 不是 `"pass"` 或 `p0_count > 0` 或 `p1_count > 0` 或任一 Layer 为 `incomplete` |
| **Test Gate** | 测试是否通过 | Layer 1 + Layer 3 验证结果；若 `ci_check_command` 已配置，验证 CI 命令已执行并通过 | 测试未运行或有失败项 |
| **Progress Gate** | 所有任务是否完成 | `.tinkerman/progress/<topic>.md` | 存在未标记完成的任务 |

## 证据格式（P5 Evidence Chain）

每道门禁必须以 `[Command] → [Output] → [Claim]` 呈现：

```
🔍 Gate Checks (P5 Evidence Chain)

[Check]  Review Gate — read .tinkerman/reviews/order-batch-export.md
[Evidence] result: "pass", p0_count: 0, p1_count: 0
[Claim]  ✅ Review passed (0 P0, 0 P1, 1 P2, 0 P3)

[Check]  Test Gate — run npx vitest run
[Evidence] Test Files: 8 passed, Tests: 42 passed
[Claim]  ✅ Test passed (42/42 tests passed)

[Check]  Progress Gate — read .tinkerman/progress/order-batch-export.md
[Evidence] 5/5 tasks marked [x]
[Claim]  ✅ Progress complete (5/5 tasks complete)
```

## CI 命令一致性检查

如果 `ci_check_command` 已配置但 test 阶段只运行了单独命令（未运行完整 CI 命令），输出警告。不阻断 ship 但强烈建议重新运行。

## Review Freshness Check（Review Gate 通过后执行）

1. 读取 `.tinkerman/reviews/<topic>.md` 的 `reviewed_at_commit` 字段
2. **安全验证**：如果字段存在，验证其为合法 commit hash 格式（`/^[a-f0-9]{7,40}$/`）。不合法则视为缺失，静默通过
3. 获取当前 HEAD：`git rev-parse HEAD`
4. 比较：
   - 相同 → ✅ 通过
   - `reviewed_at_commit` 缺失或格式不合法 → ✅ 通过（向后兼容旧报告）
   - 不同 → 获取 diff 文件列表：通过 `execFileSync` 参数化执行（不拼接命令字符串），传入 `["diff", "--name-only", reviewedCommit, "HEAD"]`
     - 仅 `.tinkerman/` 文件 → ✅ 通过（状态更新不影响代码质量）
     - 涉及项目代码 → ⚠️ 警告（不阻断，用户可选择继续或重新 review）

**警告输出格式**：

```
⚠️ Review 时效性警告
  评审时 commit：<reviewed_at_commit>
  当前 commit：<current HEAD>
  评审后变更的项目文件：
    - <file1>
    - <file2>
  建议：运行 /tinkerman review 重新评审，或确认继续交付
```

**此检查不阻断 ship**——仅输出警告，开发者可选择继续交付或重新 review。
