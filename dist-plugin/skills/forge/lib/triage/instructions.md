---
description: "Use when user runs `/forge triage`, wants automated discovery of what to work on, or needs a periodic scan of Jira sprint / Bitbucket / git for actionable items. The 'discovery' action of loop engineering."
updated: 2026-06-16

dispatch_mode: fork
allowed_tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - CronCreate
  - CronDelete
  - CronList
---

# /forge triage — 自动发现引擎（论文五动作之首"发现"）

> **触发方式**：用户输入 `/forge triage`（手动）或 cron 定时触发 `/forge triage`
> **职责**：从用户的**真实工作流**（Jira active sprint + Bitbucket 仓库 + git）拉取"值得动手但用户还没注意到"的事，写进 triage inbox。
> **Spec: loop-engineering-adoption R2**

---

## 1. Overview

论文五动作之首"发现"——**让 agent 自己去找活，而不是用户把活喂给它**。

Forge 的 loop 是任务驱动（用户给 goal，loop 跑完）。triage 补齐"自动发现该干什么"这一动作：定时扫描 Jira sprint 的 case 状态、Bitbucket 仓库动态、本地 git，把值得做的事写进 `.forge/triage-inbox.md`，保留人工复核点（不自动 build）。

---

## 2. Trigger Semantics（触发语义）

### 默认：手动触发，始终可用

`/forge triage` —— 跑一次发现。**不依赖任何配置即可用**。

### opt-in：定时触发（用户自定义时间）

```
/forge triage --install     # 安装定时触发，用 .forge/config.md 的 triage.cron 表达式
/forge triage --uninstall   # 卸载定时触发
/forge triage --status      # 显示 last_triage_at + inbox 统计
```

`--install` 通过统一安装器 `installCronSkill`（`src/loop/install-cron-skill.ts`，regenerative-checkpoint R5/D7）安装——与 `/forge learn --install` 共用同一套框架：

1. 读 `.forge/config.md` 的 `triage:` 块，用 `resolveCronConfig` 解析（默认 `enabled: false` / `cron: "0 9 * * *"`）。
2. `enabled: false` → 输出指引，不阻断手动 `/forge triage`。
3. 用 `validateCronExpression` 校验 cron 表达式。
4. `buildCronInstallSpec({ skillName: "triage", cron, prompt: "/forge triage" })` → `CronCreate` 安装。

**触发 prompt 是具名 skill `/forge triage`，不是指令墙**（论文 §04 零件一原则：逻辑变了改 skill，不动 cron）。

`triage.enabled`（config）**只控制 `--install` 是否允许**，**不影响手动 `/forge triage`**。即使用户不要定时打扰，也能随时手动跑一次。

### 硬限制（必须讲清）

本地 cron **需要 Claude Code 进程活着**——机器关了、Claude Code 退了，触发就漏掉。这是 Claude Code 本地调度的固有限制（论文 §06 调度选型表）。**不承诺"关机也跑"**。云端/headless scheduling 明确排除（本 skill 范围外）。

---

## 3. Discovery Sources（发现源）

主力发现源通过 MCP 拉取，**MCP 工具名配置化**（读 config 的 `triage.mcp.jira_tools` / `triage.mcp.bitbucket_tools` 映射，不硬编码）。

### 3.1 Jira active sprint case（主力）

通过 `mcp-atlassian`（Jira MCP）拉取当前用户 active sprint 的 case。关注的 case 状态（severity 分级）：

| 关注类型 | severity | 判定 |
|---|---|---|
| 长期滞留 | high | In Progress 超过 `triage.stale_days` 天（默认 5） |
| 分配未启动 | medium | To Do 且 assignee = `triage.assignee`（空则读 MCP 用户上下文） |
| 阻塞 | high | 有 Blocks 链接或标注 blocked |
| 待处理评论 | low | 有未回复的新评论/状态变更 |

**MCP 工具调用**（通过 `src/triage-mcp-adapter.ts` 的 `tryFetchJiraSprint`，工具名从 config 映射读）：

- `get_sprint_issues` → 列出 active sprint cases
- `search`（JQL）→ 过滤滞留/未启动/阻塞

### 3.2 Bitbucket 仓库动态（主力）

通过 Bitbucket MCP 拉取：

| 关注类型 | severity | 判定 |
|---|---|---|
| 失败/冲突 PR | high | build 失败或 merge conflict，需人工介入 |
| 长期未合并分支 | low | 超过 N 天未合并，可清理 |
| 可疑 force-push | medium | 近期 force-push 改写历史 |

**MCP 工具调用**（`tryFetchBitbucketPRs`）。

### 3.3 本地 git（降级兜底，始终可用）

```bash
git log --since="<last_triage_at>" --oneline
```

识别新增 TODO / FIXME / `// HACK` / 大范围重构（单 commit 改动 > 500 行）。

---

## 4. Degradation Chain（降级链，R2-AC3）

Jira/Bitbucket MCP 任一不可用 → **跳过该源，继续其余源 + 本地 git**。全不可用 → 纯 git 发现源。

降级的发现标 `source: git-fallback`。**绝不因 MCP 缺失而阻断 triage**。

MCP **未配置**时（不是运行失败，而是用户没装），输出清晰配置指引（见 §7），**不静默失败**。

---

## 5. Triage Inbox（落盘，R2-AC4）

每个值得处理的发现写入 `.forge/triage-inbox.md`（append-only，人可读 markdown，对应论文 Memory 零件）。

条目格式：

```markdown
## TRIAGE-<YYYYMMDD>-<NNN>
- source: jira-sprint
- external_ref: CH-1234
- severity: high
- detected_at: <ISO now>
- status: open
- summary: <一句话说明>
- suggested_action: <open-worktree | investigate | skip>
```

`source` 取值：`jira-sprint` / `bitbucket-pr` / `bitbucket-branch` / `git-fallback`。
`external_ref`：Jira case key / PR URL / commit sha / 分支名。

---

## 6. Discovery → Execution Separation（发现与执行分离，R2-AC5）

triage **只发现、写 inbox**，**不自动启动 build**。

对每个 high severity 发现，`suggested_action` 建议下一步（开 worktree 进 build / 手动排查 / 标记 skip），但**保留人工复核点**（论文 §09 清单第六条）。用户决定哪些值得动手。

inbox 条目的 `status`：`open` → `in-progress`（用户开始处理）→ `done` / `skip`。

---

## 7. Incremental Scan（增量扫描，R2-AC6）

读 `.forge/state/triage-state.json` 的 `last_triage_at` 时间戳。只扫该时间戳之后的变更（Jira case 状态变更、Bitbucket PR 更新、git commit），**不重复报告已记录的项**。

triage 跑完更新 `last_triage_at` 为本次执行时间。

`/forge triage --status` 显示：`last_triage_at` + inbox 各 status 计数。

---

## 8. MCP Configuration Guide（未配置指引，R2-AC9）

当 Jira/Bitbucket MCP 未配置时，triage 输出：

```
⚠️ Jira/Bitbucket MCP 未配置，本次仅扫描 git 发现源。

启用主力发现源：
  1. 安装 mcp-atlassian（Jira）：https://github.com/sooperset/mcp-atlassian
  2. 配置 Bitbucket MCP
  3. 在 .forge/config.md 的 triage.mcp 块填入工具名映射
  4. 详见 docs/forge-triage.md
```

工具名映射示例（`.forge/config.md`）：

```yaml
triage:
  mcp:
    jira_tools:
      get_sprint_issues: "jira_get_sprint_issues"
      search: "jira_search"
    bitbucket_tools:
      list_prs: ""
      get_pr: ""
```

工具名留空 = 该源未配置 → 自动降级。

---

## 9. Execution Flow

1. **Read config**：`.forge/config.md` 的 `triage.sources` / `stale_days` / `assignee` / `mcp` 映射。
2. **Read state**：`.forge/state/triage-state.json` 的 `last_triage_at`。
3. **Fetch each enabled source**（并行）：
   - jira-sprint → `tryFetchJiraSprint`（MCP 不可用 → null → 降级）
   - bitbucket-pr / bitbucket-branch → `tryFetchBitbucketPRs`（同上）
   - git → `git log --since=<last_triage_at>`（始终可用）
4. **Merge + dedupe**：跨源去重（同一 Jira case 可能关联 Bitbucket PR）。
5. **Write inbox**：新发现 append 到 `.forge/triage-inbox.md`。
6. **Update state**：写 `last_triage_at` = now。
7. **Output summary**：本次发现 N 条（high/medium/low），inbox 总计 M 条 open。给出 `--install` 提示（如未装定时）。

---

## 10. Edge Cases

| Case | Handling |
|------|----------|
| 无 `.forge/` | 提示 `/forge init` |
| 无 `triage-state.json` | 创建，`last_triage_at` = 空（首次全量扫） |
| MCP 全不可用 | 纯 git 发现源，标 `git-fallback`，不阻断 |
| inbox 不存在 | 创建，写入标题 |
| cron 机器关机 | 漏触发，下次开机不补跑（已知限制，§2） |
| Jira 无 active sprint | jira-sprint 源返回空，继续其余源 |
