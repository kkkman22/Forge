---
topic: sandbox-execution
generated_at: 2026-05-11T13:25:17.593Z
auto_generated: true
stage_count: 1
total_files: 1
---

# Feature: sandbox-execution

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | — | — | — |
| Plan | [sandbox-execution.md](../plans/sandbox-execution.md) | approved | 2026-04-29 |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Plan** (approved, 2026-04-29)：### 执行机制 沙箱策略通过 **PreToolUse hook** 执行（与现有 `check-frozen.ts` 相同模式）。`hooks/hooks.json` 添加 sandbox hook 条目，hook 脚本读取运行时策略配置进行拦截。  ### 运行时激活 `--sandbo...
