---
status: completed
feature: ship-gate-hardening
layout: requirements
created: 2026-05-29
tier: standard
---
# Ship 门禁加固

## 背景

Forge 的 `/forge ship` 流程当前缺少严格的门禁验证。审计发现：
- `ship-gate-commit-verification` 仅有类型定义（`ship_gate_blocked` effect），无实际门禁逻辑
- `review-no-mainagent-fallback` 的 Fallback Ladder (L0-L3) 未完整验证
- P0/P1 修复清单与 ship 门禁之间无关联
- 可能出现 review 未通过、测试未运行就执行 ship 的情况

## 需求

### 1. 三道 Ship 门禁

在 `/forge ship` 执行前，按序检查三道门禁：

#### 1.1 Review 门禁
- 检查 `.tinkerman/reviews/` 中最新 review 报告的状态
- 如果存在 P0 或 P1 未修复的 issue → 阻断 ship
- 如果无 review 报告 → 提示运行 `/forge review`，阻断 ship
- 如果 review 报告超过 5 个 commit 未更新 → 提示 review 可能过时，建议重新评审（不阻断，仅警告）

#### 1.2 Test 门禁
- 检查最近一次测试运行的结果（`.tinkerman/test-results/` 或 CI 状态）
- 如果测试有失败 → 阻断 ship
- 如果无测试记录 → 提示运行测试，阻断 ship
- `ci_check_command` 在 config.md 中定义时，执行该命令验证

#### 1.3 Progress 门禁
- 检查 `.tinkerman/progress/` 中当前 feature 的任务完成状态
- 如果存在 `in_progress` 状态的任务 → 警告（不阻断，可能任务粒度过大）
- 如果所有任务均 `completed` → 通过

### 2. P1 Fix Checklist 集成

- 2.1 Review 报告中的 P1 issue 记录到 `.tinkerman/reviews/<run-id>-p1-fixlist.json`
- 2.2 Ship Review 门禁读取 fixlist，检查每个 P1 是否有对应修复 commit
- 2.3 修复 commit 通过消息格式 `[fix P1] <issue-title>` 识别
- 2.4 全部 P1 有对应修复 → Review 门禁通过（但仍需最终 review 确认）

### 3. Fallback Ladder 完整实现

确认并实现 `review-no-mainagent-fallback` 中定义的 L0-L3 降级：

| Level | 触发条件 | Ship 阻断 |
|-------|---------|-----------|
| L0 | Interactive + Workflow 可用 | 否 |
| L1 | L0 任何条件失败 | 否 |
| L2 | Subagent 不可用，串行单 agent | 否 |
| L3 | 所有级别不可用 | **是** |

- 3.1 在 `settings.json` 或 SKILL 文档中完整记录 Fallback Ladder
- 3.2 `review-report-methodology-field` 中记录实际使用的 methodology 级别
- 3.3 L3 时 ship 被阻断，并输出明确错误信息
- 3.4 **HARD-GATE**: 主 agent 永远不能在 L3 时自行顶替评审

### 4. 门禁跳过机制

- 4.1 `--skip-gate=<gate-name>` 允许跳过特定门禁（仅限 CI/自动化场景）
- 4.2 `--skip-gate=all` 跳过所有门禁（需要 `--force` 确认）
- 4.3 跳过时在 ship commit 消息中标注 `[skip-gate: <reason>]`
- 4.4 交互模式下禁止 `--skip-gate=all`，必须逐个确认

## 验收标准

- [ ] 三道门禁逻辑实现为纯函数（可独立测试）
- [ ] 门禁结果输出结构化 JSON：`{ gate: string, passed: boolean, reason: string }`
- [ ] P1 fixlist 集成完整
- [ ] Fallback Ladder L0-L3 全部可触发
- [ ] L3 阻断 ship 有 E2E 测试覆盖
- [ ] `--skip-gate` 机制实现且有文档
- [ ] 门禁结果写入 `.tinkerman/ship/` 目录供审计追溯

## 依赖

- `forge-review` SKILL（review 报告格式）
- `forge-build` SKILL（test 运行）
- `.tinkerman/config.md`（ci_check_command）
- `.claude/rules/workflow-fallback-ladder.md`（Fallback Ladder 定义）

## 非目标

- 不改变 ship 的合并/推送/PR 创建逻辑
- 不实现自动化 CI gate（仅本地门禁）
- 不修改 Fallback Ladder 的定义（只补齐实现）
