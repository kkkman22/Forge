---
title: 'Forge triage 自动发现'
category: reference
audience:
- daily-developer
- maintainer
updated: 2026-06-16
owner: forge-maintainers
---

[← 返回索引](./INDEX.md)

# /forge triage — 自动发现

> Loop Engineering 五动作之首"发现"（论文 §03）。
> **Spec: loop-engineering-adoption R2**

`/forge triage` 从你的**真实工作流**（Jira active sprint + Bitbucket 仓库 + git）拉取"值得动手但还没注意到"的事，写进 triage inbox。补齐 Forge loop 缺失的"自动发现该干什么"动作。

---

## 触发方式

### 手动触发（默认，始终可用）

```
/forge triage
```

跑一次发现。**不依赖任何配置**——装了 Forge 就能用。

### 定时触发（opt-in，用户自定义时间）

```
/forge triage --install     # 安装定时触发（用 config 的 triage.cron 表达式）
/forge triage --uninstall   # 卸载定时触发
/forge triage --status      # 显示 last_triage_at + inbox 统计
```

`--install` 用 Claude Code 的 `CronCreate` 安装定时触发，通过统一的 `installCronSkill`（`src/loop/install-cron-skill.ts`，regenerative-checkpoint R5/D7）——`/forge learn --install` 与 `/forge triage --install` 共用同一套 `--install/--uninstall/--status` 框架。cron 表达式在 `.forge/config.md` 的 `triage.cron` 配置，**完全由你自定义**（默认 `"0 9 * * *"` 只是示例，可改成任意时间）。

`triage.enabled: false`（config 默认值）**只挡 `--install`**，**不挡手动 `/forge triage`**。即不想要定时打扰，也能随时手动跑。

### ⚠️ 硬限制：本地 cron 需要机器在线

本地 cron **需要 Claude Code 进程活着**——机器关了、Claude Code 退了，触发就漏掉。这是 Claude Code 本地调度的固有限制。**不承诺"关机也跑"。** 云端/headless scheduling 不在本功能范围。

---

## 发现源

主力发现源通过 MCP 拉取。MCP 工具名**配置化**（适配不同 mcp-atlassian / Bitbucket MCP 版本）。

| 发现源 | MCP | 关注什么 |
|---|---|---|
| **Jira active sprint case** | `mcp-atlassian` | 滞留(>N天)/分配未启动/阻塞/待处理评论 |
| **Bitbucket PR/分支** | Bitbucket MCP | 失败冲突 PR、长期未合并分支、可疑 force-push |
| **本地 git（降级兜底）** | git CLI | TODO/FIXME/HACK，始终可用 |

### 降级链

Jira/Bitbucket MCP 任一不可用 → 跳过该源继续其余 + git 兜底；全不可用 → 纯 git 发现源。**绝不因 MCP 缺失而阻断 triage。**

---

## 配置 MCP（启用主力发现源）

### 1. 安装 mcp-atlassian（Jira）

```bash
# 参考 https://github.com/sooperset/mcp-atlassian
# Claude Code 配置（~/.claude.json → mcpServers）：
{
  "jira": {
    "command": "uvx",
    "args": ["mcp-atlassian==0.21.0"],
    "env": {
      "JIRA_URL": "https://YOUR_ORG.atlassian.net",
      "JIRA_EMAIL": "your.email@example.com",
      "JIRA_API_TOKEN": "your-api-token"
    }
  }
}
```

> 安全：API token 存环境变量或 secrets manager，不要提交到仓库。

### 2. 配置 Bitbucket MCP

按你的 Bitbucket MCP 文档配置（工具名可能不同）。

### 3. 在 `.forge/config.md` 填工具名映射

```yaml
triage:
  enabled: false              # 只控制 --install；不影响手动 /forge triage
  cron: "0 9 * * *"           # 你自定义（示例默认）
  sources: [jira-sprint, bitbucket-pr, bitbucket-branch, git]
  stale_days: 5               # Jira case 滞留阈值（天）
  assignee: ""                # Jira 当前用户标识（空=读 MCP 用户上下文）
  mcp:
    jira_tools:               # mcp-atlassian 工具名映射
      get_sprint_issues: "jira_get_sprint_issues"
      search: "jira_search"
    bitbucket_tools:          # Bitbucket MCP 工具名映射
      list_prs: ""
      get_pr: ""
```

工具名留空 = 该源未配置 → 自动降级。MCP 未配置时 triage 会输出配置指引，不静默失败。

> **注意**：`.forge/config.md` 在冻结区，AI 在 build 阶段不得改。需手改或通过 `/forge spec` 流程。

---

## Triage Inbox

发现落盘到 `.forge/triage-inbox.md`（人可读 markdown）。条目含 Jira case key / PR URL / commit sha 引用。

triage **只发现、写 inbox，不自动 build**。每个 high severity 发现建议下一步（开 worktree / 手动排查 / skip），**保留人工复核点**。inbox 条目 status：`open` → `in-progress` → `done` / `skip`。

---

## 增量扫描

`.forge/state/triage-state.json` 记录 `last_triage_at`，下次只扫该时间戳之后的变更，不重复报告。

---

## 设计依据

详见 `.forge/specs/loop-engineering-adoption/`（requirements R2 / design D5-D6）。
