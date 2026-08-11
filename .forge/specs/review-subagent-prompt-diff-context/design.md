---
feature: review-subagent-prompt-diff-context
layout: design
created: 2026-05-18
---

# Design — review subagent prompt diff context

# Bugfix Requirements Document

## Introduction

`/forge review` 编排层（`src/review.ts` 中的 `buildReviewSubagents()`）生成的 subagent prompt 与 `skills/forge/lib/review/instructions.md` §2.0 契约不一致：管线确实写出了 `.forge/reviews/.diff-context.md`，但生成的 prompt 仅向 subagent 传递了一份变更文件清单（如 `Changed files: src/file1.ts, ..., src/file20.ts`），从未在 prompt 内引用 diff-context 文件。

这给 subagent 制造了两条相互矛盾的指令：
- SKILL 让其 "Step 0 调 forge_git diff-content" 读取统一 diff；
- 编排层却递给它一份 20 文件清单当 checklist。

agent 选择了文件清单路径，10 turn 预算被逐文件 `Read` / `Grep` 耗尽，未能进入综合输出阶段。

### 实际故障观测（quality-check agent JSONL）

- Total entries: 57（28 user + 29 assistant）
- Assistant tool_use blocks: 27（全部 Read/Grep）
- Assistant text blocks: 2（仅过渡语，非 FINDINGS）
- Last block: `type=tool_use, name=Grep`（仍在分析阶段）
- 最终 status: `completed`，但无 FINDINGS 输出

### 影响

- 3 个 subagent (spec-check / quality-check / security-check) 全部 `status=completed` 但都没有 FINDINGS 文本块
- 主会话提取 findings 失败 → fallback ladder L0 → L1 → L2 → L3 全部缺失 evidence
- L3 = blocked，迫使用户违反宪法 §3.1 自行评审，或使用 `--force-skip-review` 逃生阀
- `review.subagent_concurrency` 默认值（3）下浪费 3 个并行 agent 的 turn 预算

### 已排除的非根因（Counterexample 排查记录）

| 假设 | 验证结果 | 排除依据 |
|------|---------|---------|
| Hook 注入消耗 turn | 否 | JSONL 中无 Evolved Rules / Forge Context / Caveman 注入，hook router short-circuit 正常 |
| 自动压缩截断 | 否 | 压缩发生在父会话；subagent 有独立 turn 预算 |
| Agent crash | 否 | 状态 `completed` 非 `failed`，JSONL 完整 |
| JSONL 解析错误 | 否 | 57 条记录完整，assistant/user 交替正常 |

### Bug Condition C(X) 形式化定义

```pascal
FUNCTION isBugCondition(invocation)
  INPUT: invocation of type ReviewSubagentInvocation
  OUTPUT: boolean

  // 当 buildReviewSubagents() 为 review 类型 subagent
  // (spec-check / quality-check / security-check) 生成的
  // invocation.prompt 不包含 '.forge/reviews/.diff-context.md'
  // 字面量路径时，触发 bug。
  RETURN invocation.kind ∈ {spec-check, quality-check, security-check}
     AND NOT contains(invocation.prompt, '.forge/reviews/.diff-context.md')
END FUNCTION
```

```pascal
// Property: Fix Checking
FOR ALL invocation WHERE isBugCondition(invocation) DO
  result ← buildReviewSubagents'(...).find(i => i.id = invocation.id)
  ASSERT contains(result.prompt, '.forge/reviews/.diff-context.md')
  ASSERT contains(result.prompt, 'Turn Budget')  // SKILL §2.0 protocol 复述
END FOR

// Property: Preservation Checking
FOR ALL ctx WHERE NOT isBugCondition(buildReviewSubagents(ctx)) DO
  ASSERT buildReviewSubagents(ctx) = buildReviewSubagents'(ctx)
END FOR
```

### 不在本 bugfix 范围内（Out of Scope）

- 不修改 `skills/forge/lib/review/instructions.md`（SKILL 文档已正确，是代码没跟上）
- 不修改 `ReviewSubagentContext` 接口签名
- 不修改 review 管线写出 `.forge/reviews/.diff-context.md` 的现有逻辑
- 不修改并发调度、fallback ladder、hook router
- 不修改 `test/review-subagent-selection.property.test.ts` 和 `test/review-layer4.test.ts`（断言不涉及 prompt 内容）

## Bug Analysis

### Current Behavior (Defect)

`buildReviewSubagents()`（`src/review.ts:492-528`）当前生成的 subagent prompt 与 SKILL §2.0 契约脱节，导致 subagent 输出失败。

1.1 WHEN `buildReviewSubagents()` 为 spec-check / quality-check / security-check 生成 invocation THEN 系统生成的 prompt 仅含变更文件清单（如 `Changed files: src/file1.ts, src/file2.ts, ..., src/file20.ts`），不引用 `.forge/reviews/.diff-context.md`

1.2 WHEN subagent 收到含 20 文件清单但无 diff-context 引用的 prompt THEN subagent 选择逐文件 `Read` / `Grep` 路径，10 turn 预算被分析阶段耗尽，未进入综合输出阶段

1.3 WHEN subagent turn 预算耗尽且未生成 FINDINGS 文本块 THEN subagent 以 `status=completed` 终止但无 findings 输出（最后一个 block 为 `tool_use`，非 text）

1.4 WHEN 主会话从 subagent 输出中解析 FINDINGS 块 THEN 提取失败，触发 review fallback ladder

1.5 WHEN fallback ladder L0 → L1 → L2 全部因同根因或 evidence 缺失而失败 THEN L3 = blocked，迫使用户违反宪法 §3.1 自评，或使用 `--force-skip-review`

1.6 WHEN `buildReviewSubagents()` 生成的 prompt 中缺失 SKILL §2.0 的 Turn Budget Discipline 复述 THEN subagent 无法在 prompt 内获得"先输出 FINDINGS 再深挖"的预算约束

### Expected Behavior (Correct)

修复 `buildReviewSubagents()`，让 prompt 与 SKILL §2.0 契约对齐。

2.1 WHEN `buildReviewSubagents()` 为 spec-check / quality-check / security-check 生成 invocation THEN 系统 SHALL 在 prompt 中引用 `.forge/reviews/.diff-context.md` 字面量路径，作为 subagent 读取统一 diff 的入口

2.2 WHEN `buildReviewSubagents()` 生成 invocation prompt THEN 系统 SHALL 在 prompt 中包含与 SKILL §2.0 一致的 Turn Budget Discipline 简短 protocol（复述"先读 diff-context → 综合输出 FINDINGS → 视预算决定深挖范围"）

2.3 WHEN subagent 收到含 diff-context 引用的 prompt THEN subagent SHALL 能直接读取统一 diff hunk，消除逐文件 `Read` 需求

2.4 WHEN subagent 在 turn 预算内完成分析 THEN subagent SHALL 输出 FINDINGS 文本块（非 `tool_use` 收尾）

2.5 WHEN 主会话从 subagent 输出中提取 FINDINGS THEN 提取 SHALL 成功，不再触发 fallback ladder 至 L3 = blocked

2.6 WHEN `buildReviewSubagents()` 为 frontend-check 类型 subagent 生成 invocation（例外条款）THEN prompt SHALL 同时保留 `.vue` 文件名清单，因 Tier A 静态 grep 依赖确切文件名

### Unchanged Behavior (Regression Prevention)

修复仅调整 prompt 文本组装，不改变接口、管线、并发、测试和文档。

3.1 WHEN `buildReviewSubagents()` 被调用 THEN 系统 SHALL CONTINUE TO 返回符合 `ReviewSubagentContext` 接口签名的对象（接口形状不变）

3.2 WHEN review 管线运行 THEN 系统 SHALL CONTINUE TO 在子进程启动前写出 `.forge/reviews/.diff-context.md` 文件（管线写文件的现有逻辑不变）

3.3 WHEN `test/review-subagent-selection.property.test.ts` 被运行 THEN 该测试 SHALL CONTINUE TO 通过（断言不涉及 prompt 内容）

3.4 WHEN `test/review-layer4.test.ts` 被运行 THEN 该测试 SHALL CONTINUE TO 通过（断言不涉及 prompt 内容）

3.5 WHEN `review.subagent_concurrency` 配置生效 THEN 并发 subagent 调度行为 SHALL CONTINUE TO 保持现状（默认 3，不变）

3.6 WHEN hook router 处理 subagent 注入 THEN short-circuit 逻辑 SHALL CONTINUE TO 不消耗 subagent turn 预算

3.7 WHEN review fallback ladder（L0 → L1 → L2 → L3）触发 THEN 各层级判定逻辑 SHALL CONTINUE TO 与 ADR `2026-05-18-review-fallback-ladder.md` 一致

3.8 WHEN `skills/forge/lib/review/instructions.md` §2.0 被读取 THEN 文档内容 SHALL CONTINUE TO 保持现状（不修改 SKILL 文档）

3.9 WHEN `buildReviewSubagents()` 生成 frontend-check（或其他非 spec/quality/security review 类型）的 invocation THEN prompt 中的 `.vue` 文件名清单 SHALL CONTINUE TO 存在（Tier A 静态 grep 依赖）
