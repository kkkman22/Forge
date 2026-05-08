# Tasks Document

## Task Summary

| # | Task | Files | Depends |
|---|------|-------|---------|
| 1 | 新增 R4 evolved rule | `.forge/knowledge/evolved-rules.md` | — |
| 2 | forge-resume SKILL Reload Step | `skills/forge-resume/SKILL.md` | — |
| 3 | forge-ship Compaction Recovery Check | `skills/forge-ship/SKILL.md` | — |
| 4 | forge-review Compaction Recovery Check | `skills/forge-review/SKILL.md` | — |
| 5 | forge-test Compaction Recovery Check | `skills/forge-test/SKILL.md` | — |
| 6 | forge-learn Compaction Recovery Check | `skills/forge-learn/SKILL.md` | — |
| 7 | 验证 lint-evolved-rules.mjs | `scripts/lint-evolved-rules.mjs` | Task 1 |
| 8 | SKILL.md 内容测试 | `test/` | Task 2-6 |
| 9 | CHANGELOG 更新 | `CHANGELOG.md` | Task 1-6 |
| 10 | 最终验证 | — | Task 1-9 |

## Tasks

### Task 1: 新增 R4 evolved rule

**Priority**: P0
**Type**: 内容

在 `.forge/knowledge/evolved-rules.md` 新增 R4: SKILL Reload After Context Recovery。

- frontmatter `rule_count` 从 3 更新为 4
- 新增 `### R4: SKILL Reload After Context Recovery` 段落
- Content 覆盖：compaction/session 恢复后必须重读 SKILL.md，禁止凭 summary 跳步
- Confidence: 0.9, Last_triggered: 2026-05-09

**验证**: `npm run lint:rules` 通过

### Task 2: forge-resume SKILL Reload Step

**Priority**: P0
**Type**: 内容

修改 `skills/forge-resume/SKILL.md`:

1. §2 新增 "SKILL Reload" 子段落
2. §4 自动定位追加 SKILL.md 读取步骤
3. §4.1 Auto-triggered Resume 扩展触发条件（增加 compaction 恢复信号）和追加第 4 步
4. §5 边界情况新增 compaction 恢复行
5. Common Rationalizations 表新增"不需要重读"反驳行

**验证**: 文件包含 `SKILL Reload` 和 `Compaction Recovery` 关键文字

### Task 3: forge-ship Compaction Recovery Check

**Priority**: P0
**Type**: 内容

在 `skills/forge-ship/SKILL.md` §3 之后、§4 之前新增 §3.5 "Compaction Recovery Check"。

检查项：
- 重新读取本 SKILL.md
- 确认三道门禁有 P5 证据链
- 确认未跳过 §4 的 AskUserQuestion
- 从中断点继续

**验证**: 文件包含 `Compaction Recovery Check` 段落

### Task 4: forge-review Compaction Recovery Check

**Priority**: P1
**Type**: 内容

在 `skills/forge-review/SKILL.md` 门禁之后、主操作之前新增 Compaction Recovery Check 段落。

检查项：
- 重读本 SKILL.md
- 确认三层评审 Subagent 配置完整
- 从中断点继续

**验证**: 文件包含 `Compaction Recovery Check` 段落

### Task 5: forge-test Compaction Recovery Check

**Priority**: P1
**Type**: 内容

在 `skills/forge-test/SKILL.md` 门禁之后、主操作之前新增 Compaction Recovery Check 段落。

检查项：
- 重读本 SKILL.md
- 确认测试执行命令与 SKILL 定义一致
- 从中断点继续

**验证**: 文件包含 `Compaction Recovery Check` 段落

### Task 6: forge-learn Compaction Recovery Check

**Priority**: P1
**Type**: 内容

在 `skills/forge-learn/SKILL.md` 门禁之后、主操作之前新增 Compaction Recovery Check 段落。

检查项：
- 重读本 SKILL.md
- 确认五维度提取覆盖全部维度
- 从中断点继续

**验证**: 文件包含 `Compaction Recovery Check` 段落

### Task 7: 验证 lint-evolved-rules.mjs

**Priority**: P1
**Type**: 验证

确认 `scripts/lint-evolved-rules.mjs` 在 R4 新增后仍通过。rule_count=4 应与实际规则数一致。

**验证**: `npm run lint:rules` 通过

### Task 8: SKILL.md 内容测试

**Priority**: P1
**Type**: 测试

新增或扩展测试验证：
1. `skills/forge-resume/SKILL.md` 包含 `SKILL Reload` 段落
2. 4 个阶段 SKILL.md 包含 `Compaction Recovery Check` 段落
3. `evolved-rules.md` rule_count=4

测试方式：简单文本 grep 或专用 lint 脚本。

**验证**: `npm test` 或专用测试命令通过

### Task 9: CHANGELOG 更新

**Priority**: P2
**Type**: 文档

在 `CHANGELOG.md` Unreleased 段落追加条目描述 compaction 恢复覆盖所有阶段。

### Task 10: 最终验证

**Priority**: P0
**Type**: 验证

全量验证：
1. `npm run lint:rules` 通过
2. `tsc --noEmit` 通过
3. `npm test` 通过
4. 所有 SKILL.md 包含预期段落
5. evolved-rules.md rule_count 正确
