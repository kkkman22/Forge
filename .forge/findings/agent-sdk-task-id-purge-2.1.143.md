---
kind: sdk-bug-investigation
discovered_at: 2026-05-17
discovered_by: forge-single-entry-skills-collapse review session
applicable_to:
  - .claude/agents/spec-check.md (background: false foreground)
  - .claude/agents/quality-check.md (background: true)
  - .claude/agents/security-check.md (background: true)
  - skills/forge/lib/review/instructions.md §2 (parallel launch)
claude_code_version: 2.1.143
status: external-platform-bug
upstream_issues:
  - https://github.com/anthropics/claude-code/issues/14055
  - https://github.com/anthropics/claude-code/issues/25413
  - https://github.com/anthropics/claude-code/issues/27371
  - https://github.com/anthropics/claude-code/issues/29183
mitigation: orchestrator-side-workaround
---

# Finding: Agent SDK Task-ID Purge in Parallel Background Subagents

## Summary

`/forge review` 在 commit `d1ee44b` 对 `forge-single-entry-skills-collapse`
跑三层评审时，三个评审 subagent 都报"task ID 找不到":

```
Task Output(non-blocking) a7f74fab49dfa685c
⎿  Error: No task found with ID: a7f74fab49dfa685c

Task Output(non-blocking) a9b848ecebf5e2f44
⎿  Error: No task found with ID: a9b848ecebf5e2f44

Task Output(non-blocking) a71270ad5695a009f
⎿  Read output (ctrl+o to expand)
```

这是 Claude Code Agent SDK 的平台 bug，**不是** Forge prompt / agent
definition / orchestrator 层面的失败。原 5-spec 截断链 (`subagent-result-truncation`
→ `subagent-foreground-truncation` → `forge-review-diff-context-fidelity`)
已 closure，本 finding 描述的是一个独立的、上游侧的新失败模式。

## Reproduction Profile

| Item | Value |
|---|---|
| Claude Code | 2.1.143 (本地 `claude --version`) |
| 模型 | claude-opus-4.7 (1M context preview, 主 agent) |
| Subagent 模型 | sonnet (review agents 的 frontmatter 默认) |
| 平台 | macOS 24.x (darwin) |
| Skill | `/forge review` |
| 子代理数 | 3 (spec-check / quality-check / security-check) |
| 启动模式 | `Promise.allSettled` 并行 |
| 后台标志 | quality-check + security-check `background: true`；spec-check 前台 |
| 触发后果 | `TaskOutput` 立即返回 `No task found with ID: <id>` |

注意 spec-check **没有** `background: true` (Stage 4 时已移除)，但同样命中
"No task found"。这与 GitHub Issue #27371 / #25413 / #14055 报告的现象完全
一致 —— 不是 Forge frontmatter 决定的行为。

## Root Cause (上游已确认)

GitHub Issue #27371 (Claude Code 2.1.50, 2026-02 提交) 给出可复现的
reproducer：

> The task registry appears to have a lifecycle issue where completed
> background agents are removed from the registry after delivering their
> `task-notification`. This creates a race condition: if the model calls
> `TaskOutput` after the notification arrives (which is the natural flow),
> the task ID is already gone.

并发阈值经其作者实测：

| 并发数 | 大 payload | 结果 |
|---|---|---|
| 2 | yes | 全成功 |
| 4 | yes | 全成功 |
| 6 | yes | 全成功 |
| 10 | yes | 全成功 |
| 20 | yes | 全失败 |

这说明 SDK 在某个阈值以上会触发 task registry 早期清理。

Forge 的 `/forge review` 只并行 3 个 subagent，按上述阈值理论上应该安全。
但本次实测在 3 个并发下仍然命中。可能的额外触发条件：

1. **Claude Opus 4.7 1M context preview** 是新模型，task registry 行为
   可能不同于公开版 Opus 4.6 / Sonnet。
2. **三个 agent 同时写 `.forge/reviews/<topic>.md` / `.diff-context.md` 邻
   近文件**。Issue #20164 / #27977 报告过 "concurrent agents 写入冲突" 与
   "transcript files expire" 之间存在隐式耦合。
3. **`maxTurns` 暴增**（review log 显示 spec-check 跑到 23 turns，远超
   frontmatter `maxTurns: 10`），暗示 SDK 在 task lifecycle 与 turn budget
   之间存在信号穿透 —— 可能 `maxTurns` 字段在新模型路径下未被强制执行。

证据 (3) 不在任何已 closure 的 spec 范围里 —— frontmatter 写 `maxTurns: 10`
但实际跑 23 turns，要么是日志计数偏差（counting tool calls vs assistant
turns），要么是 SDK 调度 bypass。需要单独验证。

## Why Forge's Existing Mitigations Don't Apply

| Mitigation | Why insufficient here |
|---|---|
| `Promise.allSettled` (subagent-runner.ts) | 只 catch JS-side rejection；SDK 返回的 `Error: No task found` 是 **fulfilled** 的工具结果（不是 reject），allSettled 看不到。 |
| Turn-budget IRON-LAW (agents/{spec,quality,security}-check.md) | 只约束 agent 内部行为；SDK 在 agent 还没产出 final report 之前就把 task ID 清理掉，agent 端再守纪也救不回来。 |
| diff-context-fidelity 脚本化 | 这是 prompt 输入侧修复；本次失败发生在 **结果回收侧**。两者正交。 |
| `background: true` / 前台切换 | spec-check 前台、quality-check/security-check 后台都失败，标志位不是决定因素。 |

## Operational Impact

- 主 Agent 在所有 subagent 失败后 fallback 直接评审 (`.forge/reviews/forge-single-entry-skills-collapse.md` line 20: "Subagents hit turn limits before producing reports... Review performed directly by main agent")。
- 这违反 AGENTS.md §3.1 Execution-Assessment Separation。
- 但**本 finding 范围内不处理**这条违规 —— 它由后续独立 spec/finding
  处理（参见 `回到上层` 议题：是否允许 main-agent fallback、还是直接终止）。

## Recommended Mitigations (orchestrator-side, NOT in scope of this finding)

下列三类是可选方向，**本 finding 仅记录，不实施**。任何实施都需要单独
spec 走 plan → build → review → ship。

### M1: Reduce subagent parallelism

参考 GitHub Issue #14055 作者的 workaround：限制并发数到 ≤ 2。Forge
目前是 3。可改为：

```typescript
// skills/forge/lib/review/instructions.md §2
// 串行启动 spec-check → 并行启动 quality-check + security-check
// 或对 frontend-check 使用单独 sequence
```

代价：review 阶段总耗时 +30-50%。

### M2: Switch from TaskOutput polling to task-notification consumption

参考 SimpleClaude PR ([kylesnowschwartz/SimpleClaude#8](https://github.com/kylesnowschwartz/SimpleClaude/issues/8))
采用的方案：完全停用 `TaskOutput`，只信任 `task-notification` 消息内容。

代价：需要在 `subagent-runner.ts` 增加 notification listener 而非
poll；Forge 当前架构没有这个回路。

### M3: Drop background: true entirely

参考 ariccio's GitHub comment (2026-02-13)：
> I've entirely stopped using background subagents as part of my agent
> workflows in part because of stuff like this

把 quality-check / security-check 也改为前台。代价：context budget 重新
紧张（参见已 closure 的 `subagent-hook-context-budget`），且 spec-check
前台仍命中本 bug，所以单这一招不够。

### M4: Wait for upstream fix

跟踪上游 issue 列表里的进展。Anthropic 2026-03 已有 commit/PR 引用
（#29183 标题 "Background task handles are instance-scoped but task
registry is session-scoped — compaction orphans live processes"）。看
样子根因被定位到 task handle 与 registry 的作用域不匹配。建议每个 minor
Claude Code 版本升级时重测。

## Acceptance

This finding is **diagnostic only**. It establishes:

1. The "No task found with ID" error is a Claude Code platform bug
   (Issues #14055 / #25413 / #27371 / #29183 lineage), not a Forge
   defect.
2. Existing Forge mitigations (`Promise.allSettled`, Turn-budget,
   diff-context fidelity, `background` flag) don't address this failure
   mode because they operate on different layers.
3. Any orchestrator-side workaround (M1–M4) requires its own spec.
4. The downstream main-agent direct-review fallback observed in
   `.forge/reviews/forge-single-entry-skills-collapse.md` is a separate
   open issue handled outside this finding.

No build / spec / plan opened. Re-test on each Claude Code version bump.

## Cross-References

- Upstream issues (chronological):
  - 2025-12-15 #14055 Parallel Task agents intermittently lose output
  - 2026-02-13 #25413 ~40% failure in multi-agent session
  - 2026-02-21 #27371 No task found for completed background agents
  - 2026-03-?? #29183 Background task handles instance-scoped vs
    session-scoped (compaction orphans)
- Forge cascade closure (5-spec chain): `.forge/findings/forge-review-diff-context-fidelity-stage2.md`
- Forge known limitation (model preamble, separate axis): `.forge/findings/known-limitations-llm-preamble.md`
- 受影响 review 报告: `.forge/reviews/forge-single-entry-skills-collapse.md`
