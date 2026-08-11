---
status: locked
feature: review-pipeline-enhancement
layout: design
created: 2026-05-30
---

# Design Document: Review Pipeline 增强

## Overview

对 `/forge review` 的四项增强：ultrareview per-file 报告、P2/P3 自动修复、post-review 代码简化、PR URL 直接恢复。所有增强都在 `skills/forge/lib/review/instructions.md` 中编排，不引入新的 hook 或 agent。

**变更范围**：
- 修改 `scripts/run-ci-ultrareview.sh`（per-file findings + `--strict`）
- 修改 `skills/forge/lib/review/instructions.md`（auto-fix + simplify + from-pr）
- 修改 `skills/forge/lib/ship/instructions.md`（from-pr 入口）

**不涉及**：三层 review 的 agent 定义、sandbox 机制、CI workflow 本身。

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│               /forge review [<pr-url>]                   │
└──────────────────────────┬──────────────────────────────┘
                           │
               ┌───────────▼────────────┐
               │  PR URL 提供了吗？       │
               │  Yes → resume-from-pr   │
               │  No  → 继续             │
               └───────────┬────────────┘
                           │
               ┌───────────▼────────────┐
               │ Step 1: 三层 review     │
               │  spec / quality / sec   │
               └───────────┬────────────┘
                           │
               ┌───────────▼────────────┐
               │ P0/P1 存在？            │
               │  Yes → 输出建议，阻断   │
               │  No  → 继续             │
               └───────────┬────────────┘
                           │
               ┌───────────▼────────────┐
               │ P2/P3 存在？            │
               │  Yes → /code-review     │
               │        --fix + commit   │
               │  No  → 继续             │
               └───────────┬────────────┘
                           │
               ┌───────────▼────────────┐
               │ Step 4: /simplify       │
               │  cleanup-only + commit  │
               └───────────┬────────────┘
                           │
               ┌───────────▼────────────┐
               │ ✅ Review 通过          │
               │   + 代码优化完成        │
               └────────────────────────┘
```

## Components and Interfaces

### Component 1: run-ci-ultrareview.sh 增强

**文件**：`scripts/run-ci-ultrareview.sh`

**新增功能**：
1. 解析 `--json` 输出的 `findings` 数组（当前仅提取 P0-P3 计数）
2. 生成 per-file findings Markdown 表格
3. `--strict` 模式：P1 也阻断 CI

**输出格式**（Markdown 报告新增部分）：

```markdown
## Per-File Findings

| File | Line | Severity | Category | Description |
|------|------|----------|----------|-------------|
| src/review.ts | 42 | P2 | maintainability | ... |

## Summary
- Total findings: 5
- P0: 0 | P1: 1 | P2: 3 | P3: 1
```

### Component 2: review/instructions.md 修改

**新增流程节点**（在三层 review 之后）：

```markdown
## Post-Review Pipeline

### Step 2: P0/P1 处理
- 存在 P0/P1 → 输出修复建议（file:line + 建议），标记 ship 阻断
- 不自动 fix P0/P1

### Step 3: P2/P3 Auto-Fix
- 存在 P2/P3 → 执行 `/code-review --fix`
- fix 后 commit: `fix(review): auto-fix P2/P3 findings from code-review`
- 运行 ci_check_command 验证
- 验证失败 → revert commit + 警告

### Step 4: Post-Review Simplify
- review 全部通过 → 执行 `/simplify`（cleanup-only）
- simplify 后 commit: `refactor: simplify code after review`
- diff >50 行 → 输出警告
- 验证失败 → revert commit
```

### Component 3: from-pr 入口

**review 和 ship instructions 各新增**：

```markdown
## 从 PR 恢复

当用户以 `/forge review <pr-url-or-number>` 或 `/forge review --from-pr <value>` 调用时：

1. 运行 `node scripts/resume-from-pr.mjs <value>`
2. 成功 → 基于 PR context 执行 review/ship 流程
3. 失败 → 输出诊断 + 建议手动恢复步骤
```

## Key Design Decisions

| Decision | Chosen Path | Rejected Path | Reason |
|----------|-------------|---------------|--------|
| P2/P3 修复策略 | 自动 fix + 独立 commit | 仅报告不修复 | 减少手动修复摩擦，独立 commit 可 revert |
| Simplify 触发 | review 通过后自动 | 用户手动触发 | 保持代码质量一致性 |
| P0/P1 处理 | 不自动 fix | 也自动 fix | 安全优先，P0/P1 需人工审查 |
| from-pr 实现 | 复用现有 resume-from-pr.mjs | 重写 | DRY，脚本已实现完整逻辑 |

## Error Handling

| 场景 | 行为 |
|------|------|
| `/code-review --fix` 无变化 | 跳过 fix commit，继续 |
| fix 后 check 失败 | revert commit + 保留 P2/P3 findings |
| simplify 后 check 失败 | revert simplify commit |
| simplify diff >50 行 | commit 但输出警告 |
| resume-from-pr 失败 | 输出诊断 + 建议手动步骤 |
| ultrareview --json 解析失败 | 回退到当前行为（仅计数） |

## Testing Strategy

1. **手动验证**：创建含 P2/P3 问题的代码 → `/forge review` → 确认自动修复
2. **手动验证**：无问题代码 → `/forge review` → 确认 simplify 自动运行
3. **手动验证**：含 P0 代码 → `/forge review` → 确认不自动 fix，阻断 ship
4. **CI 验证**：`bash scripts/run-ci-ultrareview.sh` → 确认 per-file 报告
5. **CI 验证**：`bash scripts/run-ci-ultrareview.sh --strict` → 确认 P1 阻断
6. **回归验证**：`npm run check` 通过
