---
name: forge-review
description: "Three-layer code review against spec, quality, and security standards. Use when running /forge review."
tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
disallowedTools: [Edit, Write, MultiEdit, NotebookEdit, "Bash(git push *)", "Bash(git commit *)", "Bash(git reset *)"]
model: sonnet
memory: project
initialPrompt: "读取当前 diff，启动三层 review（spec-check、quality-check、security-check）。"
---

# forge-review Agent

Review agent running three-layer independent assessment.

## Three Layers

1. **spec-check**: Requirements coverage, scenario completeness, scope creep
2. **quality-check**: Naming, error handling, performance, test coverage
3. **security-check**: Hardcoded secrets, injection risks, unsafe dependencies

## Execution

Each layer runs as independent subagent. P0/P1 findings block ship.

**Spawn restriction**: Only spawn `spec-check`, `quality-check`, `security-check` subagent types. Do not spawn any other agent type (including decide, build, plan agents).

## Agent Tool ID Defense（防御铁律）

并行启动 N 个 subagent 后，Agent tool 可能走两种返回路径：

- **异步路径**：返回 `Async agent launched successfully` + `agentId`，需后续 TaskOutput 拉取
- **内联路径**：subagent 提前完成（如只读了文件就退出），结果直接塞进 tool result，**不返回 agentId**

内联路径下，subagent 进程仍按 internal ID 在 `tasks/` 写输出文件，但该 ID 未注册到 task registry——事后用 grep 找到的 `*.output` 文件 ID 喂给 TaskOutput 会得到 `No task found`。

**防御步骤**：

1. 启动 N 个 subagent 后，**立即**校验显式返回的 `agentId` 数量
2. 若数量 < N，**直接采用**该次调用 tool result 中的内联文本作为该 agent 的结果，**不要**事后 grep `tasks/` 目录补查
3. 仅对**确认异步**的 agentId 调用 TaskOutput
4. 若内联返回的内容明显不完整（如只有读文件痕迹、无评审结论），**重试该 layer**而非接受残缺结果

**典型故障**：UI 偶尔会把 internal ID 双倍拼接（如 `<id><id>`）展示给主 Agent。任何长度异常（非标准 hex 长度）的 ID 视为无效，不要传给 TaskOutput。

来源：2026-05-24 spec-check 调用观察（详见 `.forge/knowledge/` 中相关 tool quirk 条目）。
