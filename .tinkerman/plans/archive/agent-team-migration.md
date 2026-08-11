---
status: approved
created: "2026-04-29"
approved: "2026-04-29"
source: ".kiro/specs/agent-team-migration/tasks.md"
---

# Plan: Agent Team Migration

> 来源: `.kiro/specs/agent-team-migration/tasks.md`

## Objective

将 Forge 的三个 Agent Teams 场景（review、decide、build 研究）迁移到独立 Subagent 并行执行模式，消除 Team 生命周期管理带来的可靠性问题。

## 任务摘要

1. **Subagent 调用协议** — 在 `src/loop-types.ts` 新增 `SubagentInvocation`、`SubagentResult`、`ParallelExecutionResult` 接口；在 `src/subagent-runner.ts` 新增 `runSubagentsInParallel()` 函数；编写属性测试 Property 2 和 Property 5
2. **Review 引擎迁移** — 在 `src/review.ts` 新增 `buildReviewSubagents()` 和 `mergeReviewResults()` 函数；编写属性测试 Property 1；验证现有 review 测试通过
3. **Decide 引擎迁移** — 在 `src/decide.ts` 重命名 `TeamMember` → `SubagentConfig`，新增 `buildDecideRound1Subagents()`、`buildDecideCriticInvocation()`、`resolveDecideStatus()` 函数；编写属性测试 Property 3 和 Property 4
4. **Build 研究阶段迁移** — 在 `src/build.ts` 新增 `buildResearchSubagents()` 和 `mergeResearchFindings()` 函数；编写属性测试 Property 6；验证现有 build 测试通过
5. **SKILL 文档更新** — 更新 forge-review、forge-decide、forge-build 的 SKILL.md
6. **CLAUDE.md 和模板更新** — 更新 CLAUDE.md 和 templates/CLAUDE.md
7. **废弃配置清理** — 删除 teams/ 和 .claude/teams/ 目录，清理引用
8. **集成测试与回归验证** — 运行 npm run check 全量验证

## 依赖关系

```
Task 1 (协议层) → Task 2/3/4 (并行) → Task 5/6/7 (文档+清理) → Task 8 (验证)
```

Task 2、3、4 之间无依赖，可顺序实现。

## 风险评估

- **低风险**：纯函数迁移，merge pipeline 不变
- **注意点**：barrel-file 测试需更新 export 数量（新增 subagent-runner 导出）
