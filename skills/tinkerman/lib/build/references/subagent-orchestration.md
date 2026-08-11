---
updated: 2026-08-11
---
# Subagent Orchestration — 详细规范

> 从 `../instructions.md §3.2 Standard Path` 拆分。SKILL 主文件只保留摘要指针。

## Restatement Checkpoint（mandatory）

- Counter init N（default 3）
- Decrement per task
- At zero → Checkpoint：re-read progress/status/instincts → 3-block summary → interim log → reset
- Exception-triggered on BLOCKED / NEEDS_CONTEXT / DONE_WITH_CONCERNS（no counter reset）
- ≤ 800 tokens

## Subagent Status

| Status | Action |
|---|---|
| DONE | Review, complete |
| DONE_WITH_CONCERNS | Correctness → resolve. Observability → record, continue |
| NEEDS_CONTEXT | Supplement, re-dispatch |
| BLOCKED | Context → supplement / large → split / Plan → report |
| 429_THROTTLED | `git diff --stat` → assess. No Three-strike. Degrade, continue |

## Invocation

```
Agent(prompt, skills=["forge-test"], permissionMode="acceptEdits", maxTurns=20)
```

**Prompt 必须包含**：

- 探针结果
- 任务描述
- 文件上下文
- 知识（instincts.md 匹配条目）
- TDD 要求
- 验证命令
- Self-check 清单
- 禁止事项
- **Framework API 验证**
- **Charter grounding 摘要**（若 `.tinkerman/charter.md` status:active）：核心架构边界 + 与本任务相关的 INV-NNN 列表。charter 不存在 / 非 active 时跳过此项，不产生空字段。详见 build instructions.md §2.5。

## Framework API 验证

当任务涉及框架特定 API（React hooks、Express middleware、Prisma query 等）时：

- Subagent 应先验证 API 签名与项目 `package.json` 中的依赖版本一致
- 不依赖训练数据记忆
- 对于非平凡 API 或不确定当前版本签名时，应查阅官方文档确认
- 纯逻辑和标准库调用可跳过此步骤

## Self-check Output

```
📋 ✅/❌ Spec 场景 ✅/❌ 安全快扫 ✅/❌ 范围检查 → DONE
```

## Full Path Phase 1/2

**Phase 1**: Parallel research Subagents。`Promise.allSettled`，`max_parallel_agents` default 6。

**Phase 2**: Module-by-module Subagent TDD。Optional Git Worktree for file overlap。Restatement counter init at Phase 2 start（same as §3.2）。→ Final Validation。
