---
updated: 2026-08-11
description: "Use when `/tinkerman decide` is invoked and the topic involves architecture, security, cost, or product trade-offs requiring multiple viewpoints"
allowed-tools: Read, Write, Bash, Agent
dispatch_mode: fork
allowed_tools:
  - Read
  - Write
  - Bash
  - Agent
---

# forge-decide-teams

## 1. Prerequisites

- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 环境变量已设置
- tmux 已安装且可用（cmux 用户：`cmux claude-teams` 自动注入 tmux shim，无需独立安装 tmux）
- Claude Code >= 2.1.162（覆盖 SendMessage 深路径修复、Emoji 截断修复、中断信号修复、后台连接修复）

> **cmux 优先**：在 cmux 终端中（`$CMUX_WORKSPACE_ID` 存在）建议用户使用 `cmux claude-teams` 一键启动——自动设置环境变量、注入 tmux shim、把 teammate 渲染为原生分屏（带 sidebar 元数据 + 注意力提醒环 + macOS 桌面通知）。详见 `reference-advanced.md` 的「cmux 集成」章节。

## Execution Contract (non-negotiable)

必须：
- 先检查 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`，未设置则报错并退出
- 必须通过 `Agent(subagent_type="forge-decide-lead")` 调用 team-lead
- 最终 ADR 路径必须由 team-lead 写入，skill 本身不写 ADR

禁止：
- 禁止在未启用 Agent Teams 时退化为 DAG（那是另一个 skill 的职责）
- 禁止直接调用 viewpoint agents（必须经过 team-lead 协调）

## 1. 概述

Agent Teams 版 `/tinkerman decide` 的 PoC 实现。使用 Claude Code 原生 Agent Teams 能力（tmux 面板并行）替代现有 DAG subagent 模式。完全 opt-in，通过 `/tinkerman decide --mode=teams <topic>` 触发。

**Not For**: 非 PoC 场景、未设置 Agent Teams 环境变量的会话、需要 DAG 模式的标准 decide。

## Workflow

### Step 1: 前置检查

1. **cmux 检测优先**：检查 `$CMUX_WORKSPACE_ID` 是否存在。若存在且当前未设置 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`，提示用户：
   ```
   💡 检测到 cmux 终端环境。建议使用 `cmux claude-teams` 一键启动 Agent Teams：
      - 自动注入 tmux shim（无需独立安装 tmux）
      - 自动设置 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
      - teammate 渲染为原生 cmux 分屏 + sidebar 元数据 + 桌面通知
      退出当前会话并运行：cmux claude-teams
   ```
   然后退出（exit code 2）。
2. 检查 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` 环境变量是否设置为 `1`
3. 检查 tmux 是否可用（`which tmux`；cmux 终端下检测到 tmux shim 即视为通过）
4. 检查 Claude Code 版本 ≥ 2.1.162（`claude --version`）

任一检查失败 → 输出诊断信息并退出（exit code 2）：
```
🚫 Agent Teams 前置检查未通过：
  - 环境变量 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 未设置
  - 请设置后重启 Claude Code 会话（cmux 用户：直接运行 `cmux claude-teams`）
```

### Step 2: 解析 Topic

从参数提取决策 topic 字符串。验证非空。

### Step 3: 初始化运行记录

写入 `.tinkerman/runs/<timestamp>-decide-teams-run.md`：

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

追加 `.tinkerman/runs/<timestamp>-decide-teams-run.md`：

```yaml
finished_at: "<ISO timestamp>"
status: completed | partial | failed
adr_path: ".tinkerman/decisions/<date>-<slug>.md"
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
| "跳过版本检查" | 版本 <2.1.162 存在 SendMessage 深路径断裂、Emoji 截断 400 等已知 bug，检查是必要防御 |
| "超时不需要提示用户" | 20 分钟是合理的注意力窗口，超时后用户应有权决定是否继续 |

## 2. Deliverable

- `.tinkerman/runs/<timestamp>-decide-teams-run.md` 运行记录
- `.tinkerman/decisions/<date>-<slug>.md` 最终 ADR（由 team-lead 写入）
