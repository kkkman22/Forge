---
updated: 2026-08-11
---
# Knowledge Backflow — 详细规范

> 从 `../instructions.md §8` 拆分。SKILL 主文件只保留一行摘要指针。

## Plan Phase Backflow (Mandatory)

`/tinkerman plan` Research 步骤**必须**搜索知识库：

- 匹配 `solutions/` tags 和 `instincts.md` Tags
- 将相关经验注入 Research Findings
- 知识库为空时提示但不阻断

## Build Phase Backflow (Automatic)

`/tinkerman build` 每个任务自动匹配 `instincts.md` Tags，注入 Subagent 上下文作为实现参考。

## Debug Phase Backflow (Automatic)

`/tinkerman debug` Phase 2 自动搜索 `solutions/` 踩坑记录，匹配时直接展示历史方案。

## Backflow Effect Tracking

每次回流被实际采用时更新 confidence：

- 有效 → +0.05（上限 0.9）
- 无效 → -0.1（下限 0.3）
- 未采用则不变

## Known Failure Pattern Recording

反复出现的失败模式（2+ 次）记录到 `.forge/knowledge/known-failures.md`（模式/触发条件/根因/解决方案/出现次数/置信度）。

- 已有相同模式则更新次数
- build 的 Closure-First 探针和 debug Phase 2 自动搜索此文件

## Session Journal

每次 learn 完成后写入 `.forge/knowledge/sessions/<date>-<topic>.md`：

- ≤ 20 行
- 含：摘要 / 关键决策 / 验证结果 / 下次建议
- `/tinkerman resume` 优先读取最近 3 条恢复上下文
