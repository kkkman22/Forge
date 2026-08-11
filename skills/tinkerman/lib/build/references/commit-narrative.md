---
updated: 2026-08-11
---
# Commit Narrative — 详细规范

> 从 `../instructions.md §6.8` 拆分。SKILL 主文件只保留一行摘要指针。
>
> **Spec: loop-engineering-adoption R3, design.md D7** — 对抗理解腐烂（Understanding Rot）。
> 论文 §07："循环交付你没写的代码越快，'实际存在的东西'和'你真正理解的东西'的差距就越大。"

## 为什么需要 commit narrative

loop 的 build 阶段会连续产出多个 commit。如果不落盘"每个 commit 干了什么 + 为什么"，人只看到一串 `forge(build): xxx`，long-running loop 跑完后变成"看不懂自己项目的看门人"。

commit 时是上下文最丰富的时刻——agent 刚干完，最清楚改了什么、为什么这么改。事后从 git log / commit message 重构会丢失"为什么"。所以 narrative 必须在 commit 时生成、落盘。

## 何时生成

每个 build 原子提交（§6.2 Atomic Commits）前，紧接 §6.6 Change Summary 之后，追加一步：写 narrative 到 `.forge/runs/<run_id>/commit-narrative.md`。

## 落盘位置与格式

文件：`.forge/runs/<run_id>/commit-narrative.md`（append-only，每 commit 追加一节）。

`<run_id>` 从 loop-state.json 的 `id` 字段读取（loop 场景）；非 loop 场景（手动 `/tinkerman build`）用 `manual-<timestamp>`，落到 `.forge/runs/manual-<timestamp>/commit-narrative.md`。

每节格式：

```markdown
## <commit_sha>
- subject: <commit message subject 行>
- what: <一句话：这个 commit 改了什么>
- why: <一句话：为什么这么改，解决了什么>
```

**what / why 约束**：
- 每条一句话，控制在没参与的人 30 秒内能理解。
- `what` 描述行为变更（不是文件清单——那 git diff 有），聚焦"对外可观测的变化"。
- `why` 描述动机/解决的问题，不是"因为 spec 这么说"这种循环论证。

## 文件不存在则创建

首次写入时若 `commit-narrative.md` 不存在，创建文件并加标题行 `# Commit Narrative — <run_id>`，再追加第一节。

## 消费者

- **Mission Summary**（loop instructions.md §10）摘录关键节（≤5 条），超 5 条输出"建议人工逐条复核"。
- **`/tinkerman learn`** 从 runs/ 提取经验时，提示用户至少复述一条关键改动意图。

## 不进 git

`.forge/runs/` 在开放区（Open），是运行时产物，随 run 归档清理，不纳入版本管理。
