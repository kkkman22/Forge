---
name: forge-decide-teams
description: "[PoC] 使用 Agent Teams 的 /forge decide 并行多视角决策"
allowed-tools: Read, Write, Bash, Agent
---

# forge-decide-teams

## Execution Contract (non-negotiable)

必须：
- 先检查 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`，未设置则报错并退出
- 必须通过 `Agent(subagent_type="forge-decide-lead")` 调用 team-lead
- 最终 ADR 路径必须由 team-lead 写入，skill 本身不写 ADR

禁止：
- 禁止在未启用 Agent Teams 时退化为 DAG（那是另一个 skill 的职责）
- 禁止直接调用 viewpoint agents（必须经过 team-lead 协调）

## Overview

Agent Teams 版 `/forge decide` 的 PoC 实现。使用 Claude Code 原生 Agent Teams 能力（tmux 面板并行）替代现有 DAG subagent 模式。完全 opt-in，通过 `/forge decide --mode=teams <topic>` 触发。

**Not For**: 非 PoC 场景、未设置 Agent Teams 环境变量的会话、需要 DAG 模式的标准 decide。

## Workflow

### Step 1: 前置检查

1. 检查 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` 环境变量是否设置为 `1`
2. 检查 tmux 是否可用（`which tmux`）
3. 检查 Claude Code 版本 ≥ 2.1.32（`claude --version`）

任一检查失败 → 输出诊断信息并退出（exit code 2）：
```
🚫 Agent Teams 前置检查未通过：
  - 环境变量 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 未设置
  - 请设置后重启 Claude Code 会话
```

### Step 2: 解析 Topic

从参数提取决策 topic 字符串。验证非空。

### Step 3: 初始化运行记录

写入 `.forge/runs/<timestamp>-decide-teams-run.md`：

```yaml
---
topic: "<topic>"
mode: teams
started_at: "<ISO timestamp>"
teammates: [arch, sec, cost, ops, product]
status: running
---
```

### Step 4: 调用 Team Lead

```
Agent(subagent_type="forge-decide-lead", prompt=<topic + metadata>)
```

等待 Agent 返回。20 分钟超时提示。

### Step 5: 记录完成

追加 `.forge/runs/<timestamp>-decide-teams-run.md`：

```yaml
finished_at: "<ISO timestamp>"
status: completed | partial | failed
adr_path: ".forge/decisions/<date>-<slug>.md"
```

### Step 6: 汇报

输出：
- ADR 路径
- 5 个视角的完成状态
- 总耗时和 token 摘要（如可获取）

## Error Handling

| 场景 | 行为 | 退出码 |
|------|------|--------|
| env var 未设置 | 报错 + 诊断 | 2 |
| tmux 不可用 | 报错 + 安装建议 | 2 |
| CC 版本不足 | 报错 + 版本信息 | 2 |
| team-lead 超时 > 30min | kill + 写 partial manifest | 1 |
| 所有 teammate 失败 | 报告失败 | 1 |
| 部分 teammate 失败 | 继续，ADR 标注缺失视角 | 0 |

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "没有 env var 也能跑" | PoC 必须验证 Agent Teams 能力存在，退化到 DAG 不是本 skill 的职责 |
| "跳过版本检查" | 版本 <2.1.32 的 Agent Teams API 不稳定，检查是必要防御 |
| "超时不需要提示用户" | 20 分钟是合理的注意力窗口，超时后用户应有权决定是否继续 |
