---
updated: 2026-08-11
---
# Execution Quality Analysis — 详细规范

> 从 `../instructions.md §2` 拆分。SKILL 主文件只保留摘要与函数签名指针。

## Analysis Data Sources

| Data Source | Analysis Content |
|-------------|-----------------|
| `.forge/progress/<topic>.md` | First-pass / repeated failures / blocked tasks |
| `.forge/reviews/<topic>.md` | P0/P1 count and recurring issue types |
| `.forge/debug/<topic>.md` | Whether debug was triggered and root cause |
| `.forge/plans/<topic>.md` | Estimated vs actual time deviation |
| `.forge/specs/<feature>/spec.md` | Scenario coverage rate, Scope Creep |

## Function Calls

**`analyzeSkillFeedback(entries)`**
- 参数：`entries` — 从 `.forge/knowledge/skill-feedback.md` 解析的反馈条目数组（`SkillFeedbackEntry[]`，每条含 command、scenario、suggestion、frequency）
- 返回：`{ commandStats: CommandStats[], alertCommands: string[], totalEntries: number }`
- 用途：识别高失败率命令和不适用 SKILL 场景，`alertCommands` 中的命令需审阅对应 SKILL.md

**`crossValidateFailures(feedbackReasons, knownFailureDescriptions)`**
- 参数：`feedbackReasons` — 从 `analyzeSkillFeedback` 结果中提取的失败原因（`string[]`）；`knownFailureDescriptions` — 从 `.forge/knowledge/known-failures.md` 解析的已知失败描述（`string[]`）
- 返回：交叉验证后的重复失败原因列表（`string[]`）
- 用途：确认反复出现的失败模式是否已在 known-failures 中记录，未记录的新模式应添加

## Analysis Dimensions

| Dimension | Metric | Calculation |
|-----------|--------|-------------|
| **First-pass Rate** | Ratio of tasks completed without rework | First-pass tasks / Total tasks |
| **Plan Accuracy** | Estimated vs actual deviation | Actual total time / Estimated total time |
| **Review Interception Rate** | Issue density | (P0 + P1) / Total tasks |
| **Debug Trigger Rate** | Debug frequency | Trigger count / Total tasks |

## Analysis Output Format

```
📊 执行质量分析

━━━ 执行概况 ━━━
  总任务数：5
  一次通过：4/5（80%）
  返工任务：Task 3（连续失败 2 次后通过）
  Debug 触发：0 次

━━━ Plan 准确度 ━━━
  预估总耗时：17 min → 实际：22 min → 偏差率：1.29

━━━ Review 质量 ━━━
  P0：0 / P1：1（缺少鉴权中间件）/ P2：2 → 拦截率：0.2

━━━ 改进信号 ━━━
  ⚠️ Task 3 反复失败：路由注册模式不熟悉 → 建议沉淀为知识
  ⚠️ Plan 预估偏差 > 20%：复杂任务需要更多缓冲
```

## Improvement Signals Drive Knowledge Extraction

分析的**改进信号**直接作为五维度知识提取的输入：反复失败 → 踩坑记录；Plan 偏差大 → 可复用模式；Review 高频问题 → 直觉模式；Debug 根因 → 解决方案。

## Metrics Persistence

将本次会话指标追加到 `.forge/knowledge/metrics.md`：命令使用统计、路由准确度、四维度执行质量趋势、验证命令健康度。`/tinkerman plan` Research 阶段可读取历史指标校准预估。
