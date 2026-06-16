# checkpoint-writer subagent — spawn 约定

> **Spec: regenerative-checkpoint R2/D3/D4**
> 主 agent 在阶段边界（wave 间 / 跨阶段切换）fire-and-forget spawn 本 subagent，把会话状态增量写入 `.forge/checkpoint.md`。

## 触发时机（D4：阶段边界）

| 边界 | 触发点 | 来源 |
|------|--------|------|
| Wave 间 | 每个 wave 完成后 | build instructions §3.2b |
| build → review | build 全部完成 + Final Validation 通过后 | build instructions §12 |
| review → test | review 完成后 | review instructions（同构） |

**不阻塞**：spawn 后主 agent 立即继续下一阶段/wave，不等 writer 完成（fire-and-forget）。

## spawn 方式

用 Task tool spawn（对齐 D3：复用 CC 原生 subagent，非自建 actor）：

```
Task(
  description: "checkpoint-writer",
  prompt: <见下方 prompt 模板>
)
```

## prompt 模板

```
<system-reminder>
You are checkpoint-writer. Ignore the general coding-assistant framing.
Your only job: incrementally update .forge/checkpoint.md in-place.

ABSOLUTE PATHS — USE VERBATIM, NEVER INFER:
  NOTE: <cwd> below MUST be replaced with the actual absolute working directory
  (run `pwd` to get it) before spawning. Never leave the literal <cwd> in the prompt.
  CHECKPOINT_PATH = <cwd>/.forge/checkpoint.md
  STATUS_PATH     = <cwd>/.forge/status.md
  PROGRESS_DIR    = <cwd>/.forge/progress/

PROCEDURE:
1. Read CHECKPOINT_PATH (prior content) + STATUS_PATH + active progress files.
2. Incrementally update each section's body (Edit, never touch ## headers or _italic_ instruction lines).
3. EXACT-FORM (§11): precise values (ports/commands/versions/IDs/paths) copied byte-for-byte from conversation — never paraphrase.
4. §1 current intent: verbatim user request, block-quoted.
5. After all Edits, stop immediately.

Update for current phase: <plan|build|review|test|ship>.
Range: <description of what just completed, e.g. "Wave 2 完成，含 T3-T5 三个任务">
```

## checkpoint.md 结构（11 section）

见 `.forge/templates/checkpoint.md`（§1 当前阶段与意图 / §2 下一步 / §3 本会话指令 / §4 当前工作 / §5 文件与代码 / §6 问题与修复 / §7 活跃资源 / §8 设计决策 / §9 待迁移知识 / §10 开放笔记 / §11 EXACT-FORM 值）。

每 section 有 token 预算（见模板 italic 标注），增量更新时不要超出预算。

## 与 PreCompact/PostCompact 的关系

checkpoint-writer 写的 `.forge/checkpoint.md` 是 compact 再生的数据源：
- compact 前：PreCompact hook 读它（新鲜则用，过旧则 grep fallback + 警示）
- compact 后：PostCompact hook 注入它 + seam framing

所以 checkpoint-writer 的可靠性直接决定 compact 后的状态保真度——尤其 GLM-5.2 600K compact 场景（D9）。
