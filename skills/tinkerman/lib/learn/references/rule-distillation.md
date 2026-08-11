---
updated: 2026-08-11
---
# Error-Prevention Rule Distillation — 详细规范

> 从 `../instructions.md §6.5` 拆分。SKILL 主文件只保留一行摘要指针。

从积累的知识数据中蒸馏出"错误预防规则"——Claude 在没有明确指导时会犯错的高价值模式。规则写入 `.tinkerman/knowledge/evolved-rules.md`（最多 15 条），通过 SessionStart hook 注入上下文。

**核心原则**：只添加"没有这条规则 Claude 就会犯错"的规则——不是知识转储。

## Data Sources

| Data Source | File Path | Extraction Content |
|-------------|-----------|-------------------|
| Known failure patterns | `.tinkerman/knowledge/known-failures.md` | Failure patterns with occurrence >= 3 |
| Instinct patterns | `.tinkerman/knowledge/instincts.md` | Experience rules with confidence >= 0.8 |
| SKILL feedback | `.tinkerman/knowledge/skill-feedback.md` | Inapplicable SKILL guidance with frequency >= 3 |
| Execution metrics | `.tinkerman/knowledge/metrics.md` | Degradation trend across 3+ consecutive sessions |
| Session journals | `.tinkerman/knowledge/sessions/*.md` | Same issue appearing in 3+ sessions |

## Distillation Algorithm

```
1. READ evolved-rules.md → current_rules[], rule_count, max_rules
2. READ 数据源 → failures[], instincts[], feedback[], metrics[], cross_session_issues[]
3. candidates = []
4. FOR each entry WHERE meets_threshold:
     candidates.push(transform(entry))
5. IF candidates is empty: SKIP
6. FOR each candidate:
     APPLY exclusion filter → APPLY conflict detection → APPLY capacity check
7. PRESENT proposals → FOR each approved: WRITE + UPDATE changelog
```

## Transformation Process

每条达标知识转为规则候选：

1. 提取原始模式
2. 蒸馏为可执行规则声明
3. 声明防止的具体错误
4. 继承置信度
5. 设置 last_triggered

## 阈值条件

| Category | Data Source | Threshold |
|------|--------|------|
| 项目特定陷阱 | known-failures.md | occurrence >= 3 |
| 重复纠正模式 | instincts.md | confidence >= 0.8 |
| 环境/工具怪癖 | skill-feedback.md | frequency >= 3 |
| 跨会话行为纠正 | session journals | 同一问题出现在 3+ 会话 |
| 规则摩擦调整 | metrics.md | 连续 3+ 会话退化趋势 |

无达标条目时输出 `ℹ️ No qualifying entries found. Skipping rule distillation.`

## 排除过滤器

非有效候选：

- 架构描述（可从代码推断）
- 文件路径列表
- 通用最佳实践（Claude 已知）
- 原始知识数据
- 工具已执行的标准（如 Biome 代码风格）

## 冲突检测

比较新候选与现有规则的 `Prevents` 声明。同一组件 + 矛盾指令 = 冲突。冲突候选标注冲突信息，由用户选择保留/替换/同时保留。

## 容量管理与退役

上限 15 条。满时计算价值分数：

```
value = confidence × recency_factor
  2 会话内: 1.0
  3-4 会话: 0.7
  5+ 会话: 0.3
```

最低价值规则成为退役候选。

## 陈旧检测

`last_triggered` 距今超过 5 个会话（通过 sessions/ 目录条目数确定）→ 标记为陈旧候选，向用户展示退役建议。

## 提案展示与审批

每条提案独立审批。被拒绝的不写入、不记录。所有被拒绝则不修改 evolved-rules.md。

## 写入与变更日志

批准后：

1. 追加规则到 evolved-rules.md
2. 更新 rule_count 和 updated
3. 在 rule-changelog.md 追加条目（含 Action/Source/Confidence/Reason）

如有退役，移除规则并追加退役条目。
