---
status: approved
feature: review-pipeline-enhancement
layout: tasks
created: 2026-05-30
spec_ref: ".forge/specs/review-pipeline-enhancement/requirements.md"
---

# Tasks

## Task 1: ultrareview --json 增强

- [ ] 1.1 修改 `scripts/run-ci-ultrareview.sh`，解析 `findings` 数组的 file/line/severity/category/description 字段
- [ ] 1.2 生成 per-file findings Markdown 表格（按 file → severity 排序）
- [ ] 1.3 为每个 finding 添加 code snippet 引用（file:line 格式）
- [ ] 1.4 实现 `--strict` 模式：P1 findings 同样阻断 CI（exit 1）
- [ ] 1.5 保持向后兼容：不带 `--strict` 时仅 P0 阻断

**Verify-By**: bash — `bash scripts/run-ci-ultrareview.sh --strict` 在含 P1 问题的仓库中阻断
**关联需求**: R1

## Task 2: review skill P2/P3 auto-fix 流程

- [ ] 2.1 在 `skills/forge/lib/review/instructions.md` 三层 review 后新增 "Step 3: P2/P3 Auto-Fix" 章节
- [ ] 2.2 说明自动执行 `/code-review --fix` 的条件：存在 P2/P3 且无 P0/P1
- [ ] 2.3 定义 fix commit 格式：`fix(review): auto-fix P2/P3 findings from code-review`
- [ ] 2.4 定义 fix 后验证步骤：运行 `ci_check_command`
- [ ] 2.5 定义验证失败回退策略：revert commit + 保留 findings

**Verify-By**: manual — 含 P2/P3 代码 → `/forge review` → 自动修复
**关联需求**: R2, R3

## Task 3: review skill post-review simplify

- [ ] 3.1 在 review instructions 新增 "Step 4: Post-Review Simplify" 章节
- [ ] 3.2 说明 `/simplify` cleanup-only 模式的调用
- [ ] 3.3 定义 simplify commit 格式：`refactor: simplify code after review`
- [ ] 3.4 定义 diff >50 行警告阈值
- [ ] 3.5 定义验证失败回退：revert simplify commit

**Verify-By**: manual — 无问题代码 → `/forge review` → 自动 simplify
**关联需求**: R4

## Task 4: review skill from-pr 入口

- [ ] 4.1 在 `skills/forge/lib/review/instructions.md` 头部新增 "从 PR 恢复" 章节
- [ ] 4.2 说明 PR URL/编号 → `node scripts/resume-from-pr.mjs <value>` 的调用
- [ ] 4.3 定义成功/失败路径的处理
- [ ] 4.4 在 `skills/forge/lib/ship/instructions.md` 添加同样的 from-pr 入口

**Verify-By**: manual — `/forge review https://github.com/.../pull/123`
**关联需求**: R5

## Task 5: P0/P1 处理策略

- [ ] 5.1 在 review instructions 新增 "Step 2: P0/P1 处理" 章节
- [ ] 5.2 说明 P0/P1 不自动 fix，输出修复建议（file:line + 建议）
- [ ] 5.3 说明 ship 阻断标记

**Verify-By**: manual — 含 P0 代码 → `/forge review` → 确认阻断
**关联需求**: R3

## Task 6: Pipeline 完整流程编排

- [ ] 6.1 在 review instructions 中确保 Step 1-4 的执行顺序和状态标记
- [ ] 6.2 每步骤完成后输出 `✅ <步骤> 完成`（遵循 §2.7 不暂停询问）
- [ ] 6.3 确保 pipeline 遵循 §2.7 No Confirmation Between Steps 铁律

**Verify-By**: manual — 端到端 review pipeline 测试
**关联需求**: R6

## Task 7: 回归验证

- [ ] 7.1 `npm run check` 通过
- [ ] 7.2 `/forge review`（无 from-pr、无 fix）行为不变
- [ ] 7.3 三层 review agent 行为不变

**Verify-By**: bash + manual
**关联需求**: 全部
