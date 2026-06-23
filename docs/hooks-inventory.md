---
title: 'Hooks Inventory — Hint/Gate 二分清单'
category: reference
audience:
- maintainer
updated: 2026-06-23
owner: forge-maintainers
---

# Hooks Inventory — Hint/Gate 二分清单

> **Requirement 2 (planning-with-files-borrow spec)** [出处: planning-with-files SKILL.md "Always exits 0"]
>
> 借鉴 planning-with-files 的 exit-zero 哲学,把 Forge 所有 hook 按**阻断是否为设计意图**二分为 Hint-Type 与 Gate-Type。

## 二分判据

| 类型 | 判据 | 行为契约 |
|------|------|----------|
| **Hint-Type** | 阻断**不是**设计意图。钩子用于注入上下文/记录/提示 | 必须 `exit 0`,通过 stdout 输出提示(纯文本 Claude Code 直接消费,或 `{"hookSpecificOutput":{"additionalContext":"..."}}` JSON 结构化形式)。**绝不** `exit 2` 或非零退出。最坏情况是提示丢失,agent 流转不停 |
| **Gate-Type** | 阻断**是**设计意图。钩子用于安全/冻结区/完整性强制 | 必须 `exit 2` 阻断工具调用(PreToolUse)或有明确阻断理由。阻断理由:安全/冻结区/沙箱/完整性 |

**核心原则**:提示型钩子永不应意外阻断 agent;门禁型钩子的阻断必须是有意为之且理由明确。两者不可混用——一个钩子要么永远 exit 0(Hint),要么在违规时 exit 2(Gate)。

**转义假设声明(S-5)**:Hint-Type 钩子注入文件内容时用的 `<>`→`&lt;&gt;` 转义是**软防御**——依赖下游模型不在指令解析层还原 HTML 实体,这是合理但不可证明的假设,与 R1 prompt-only 模型一致,非密码学保证。

## 分类清单

> 数据来源:`hooks/hooks.json` + `.claude/settings.json` 全量扫描,按脚本实际 exit 行为 + 阻断语义判定。
> 扫描方法:grep `exit(2)|exit 2|process.exit(2)` + 阻断关键词(deny/block/reject/abort)。

### Gate-Type(阻断型,设计意图为强制)

| 脚本 | 事件 | 阻断理由 |
|------|------|----------|
| `scripts/hook-check-frozen.sh` | PreToolUse(Write\|Edit) | frozen-zone 保护:阻止 AI 改 spec locked / plan approved / config |
| `dist/src/check-frozen.js` | PreToolUse(Write\|Edit) | 同上(SDK 原生实现) |
| `dist/src/check-sandbox.js` | PreToolUse(Write\|Edit\|Bash) | 沙箱边界:文件系统/命令权限强制 |
| `scripts/bash-ban-raw.mjs` | PreToolUse(Bash) | 禁止原始 bash(必须走 forge 封装) |
| `scripts/check-context-boundary.mjs` | PreToolUse(Write\|Edit) / PostToolUse | context 边界强制(8 个 block 路径,强阻断) |
| `scripts/check-diff-context-integrity.mjs` | PostToolUse | diff 完整性:防止评审上下文被篡改 |
| `scripts/hook-task-completed.sh` | TaskCompleted | 任务完成门禁 |
| `scripts/knowledge-hook-dispatch.mjs` | PostToolUse(Write\|Edit) | 知识库写入门禁 |
| `scripts/rebuild-feature-dossier.mjs` | PostToolUse(Write\|Edit) | feature dossier 重建门禁 |

### Hint-Type(提示型,exit 0 + stdout)

**SessionStart**:`auto-resume.sh`、`inject-evolved-rules.mjs`、`bootstrap-check.mjs`、`forge-sync-runtime.mjs`、`check-companions.mjs`、`forge-hook-dispatch.mjs`

**UserPromptSubmit**:`inject-plan-context.mjs`(R3 active-plan 指针 + R4 progress 窗口 + R5 findings 注入,单一权威注入入口)、`cmux-mirror/sync-once.mjs`、`record-prompt-metrics.mjs`、`forge-hook-dispatch.mjs`

**PreToolUse**:`check-context-boundary.mjs`(advisory 模式)、`bash-ban-raw.mjs`(advisory)

> **注(SC-5)**:`inject-plan-context.mjs` 仅在 UserPromptSubmit 注册,不在 PreToolUse。R5 的 findings 注入通过 UserPromptSubmit(每轮提示时)回流 build 阶段,不在每次 Write/Edit 重复触发(避免高频重复注入增噪)。`.claude/settings.json`(本地运行时)在 PreToolUse 注册了 inject,但插件分发 `hooks.json` 不含——两者为不同运行时。

**PostToolUse**:`hook-check-frozen-post.sh`、`cmux-mirror/sync-once.mjs`、`rebuild-feature-dossier.mjs`(advisory)、`knowledge-hook-dispatch.mjs`(advisory)、`check-context-boundary.mjs`、`check-diff-context-integrity.mjs`(advisory)、`track-read-budget.mjs`、`track-tool-duration.mjs`、`phase-transition-guard.sh`

**Stop**:`stop-incomplete-tasks.mjs`(R1 completion gate,prompt-only)、`stop-pending-rules.mjs`、`record-evolved-rule-violation.mjs`、`flag-stale-evolved-rules.mjs`、`cmux-mirror/sync-once.mjs`、`stop-phase-verify.mjs`、`stop-additional-context.mjs`、`stop-failure-hook.mjs`、`forge-hook-dispatch.mjs`

**TeammateIdle / TaskCreated / WorktreeCreate / StopFailure / ConfigChange / PermissionDenied / WorktreeRemove**:`task-created-hook.mjs`、`worktree-create-hook.mjs`、`worktree-remove-hook.mjs`、`config-changed-hook.mjs`、`permission-denied-hook.mjs`、`stop-failure-hook.mjs`、`stop-additional-context.mjs`

**PreCompact / PostCompact**:`hook-precompact.sh`、`hook-postcompact.sh`、`forge-hook-dispatch.mjs`

## 不一致项(应为 Hint 却阻断 / 应为 Gate 却放行)

> 本次梳理**未发现**阻断行为与设计意图不一致的钩子。所有 `exit(2)` 出现的脚本(frozen/sandbox/bash-ban/context-boundary/diff-integrity/task-completed/knowledge-dispatch/feature-dossier)其阻断均符合 Gate-Type 设计意图;所有提示型钩子(inject/stop/metrics/resume 等)均为 `exit 0`。

**潜在观察点(非不一致,供后续关注)**:
- `check-context-boundary.mjs`、`bash-ban-raw.mjs`、`rebuild-feature-dossier.mjs`、`knowledge-hook-dispatch.mjs`、`check-diff-context-integrity.mjs` 同时出现在 PreToolUse 和 PostToolUse,或同时有 Gate 与 advisory 两种模式——这类钩子需确认在**每个挂载点**的 exit 行为一致(同一脚本在 PreToolUse 阻断 vs PostToolUse 提示是合理的,但应文档化)。

## 与 §2.6 Output Conciseness 共存

Hint-Type 钩子的 stdout 提示应遵循 §2.6:简洁、结构化、非决策点散文 ≤200 tokens。提示丢失不应导致 agent 卡死。Gate-Type 钩子的阻断消息应包含:命中检查 + 证据 + 建议路由 + 重入条件。

## 维护

新增 hook 时,必须在本文档登记其类型。判据简单:**问自己"这个钩子的阻断是有意的吗?"**——是 → Gate-Type(exit 2);否 → Hint-Type(exit 0)。
