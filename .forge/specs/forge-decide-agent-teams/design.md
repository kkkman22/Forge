---
feature: forge-decide-agent-teams
layout: design
created: 2026-05-12
---

# Design Document: `/forge decide` Agent Teams PoC

## Overview

本 spec 是对 Claude Code Agent Teams 能力的评估性质 PoC。设计目标不是"替换现有实现"，而是"用一个可对比的新实现收集数据，产出 adopt/keep/hybrid 的决策依据"。

**关键非目标**：
- 不修改现有 `skills/forge-decide/SKILL.md` 的行为
- 不改变 `/forge decide` 的默认模式
- 不发布 Agent Teams 模式为稳定特性

**变更范围**：
- 新增 `skills/forge-decide-teams/SKILL.md`
- 新增 `.claude/agents/forge-decide-lead.md` + 5 个 viewpoint agents
- 新增 `scripts/run-decide-poc.sh` 对比脚本
- 新增 PoC 相关文档（`poc-topics.md`、最终 PoC_Report）
- 微调 `skills/forge-decide/SKILL.md`（仅加一行指向 PoC）
- 新增测试 `test/forge-decide-teams.contract.test.ts`

## Architecture

### Teams 模式下的运行拓扑

```
                    /forge decide --mode=teams <topic>
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  forge-decide-teams SKILL (主会话)       │
        │   - check CLAUDE_CODE_EXPERIMENTAL_...  │
        │   - check tmux availability              │
        │   - spawn team-lead agent                │
        └─────────────────────┬───────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  forge-decide-lead agent                 │
        │   - parse topic                          │
        │   - dispatch 5 teammates in parallel    │
        │   - wait for TaskCompleted x5            │
        │   - synthesize ADR draft                 │
        │   - write .forge/decisions/<date>-*.md   │
        └─────────────────────┬───────────────────┘
                              │
           ┌──────┬───────────┼───────────┬──────┐
           ▼      ▼           ▼           ▼      ▼
        ┌─────┐┌─────┐   ┌─────┐    ┌─────┐┌─────┐
        │arch ││sec  │   │cost │    │ops  ││prod │
        │     ││     │   │     │    │     ││     │
        │maxT ││maxT │   │maxT │    │maxT ││maxT │
        │= 15 ││= 15 │   │= 15 │    │= 15 ││= 15 │
        └──┬──┘└──┬──┘   └──┬──┘    └──┬──┘└──┬──┘
           │     │          │          │     │
           └─────┴──────────┴──────────┴─────┘
                  SendMessage (optional)
```

**Observability**：每个 teammate 的 tmux pane 对用户实时可见。`TaskCompleted` hook 在每个 teammate 完成时触发，写入 `.forge/runs/`。

### 对比模式运行（DAG vs Teams）

```
             scripts/run-decide-poc.sh <topic-id>
                          │
           ┌──────────────┴───────────────┐
           ▼                              ▼
    /forge decide --mode=dag       /forge decide --mode=teams
      (existing impl)                  (new skill)
           │                              │
           └──────────────┬───────────────┘
                          ▼
                metrics JSON merged
                          │
                          ▼
            .forge/runs/<ts>-decide-poc.md
              (Markdown table report)
```

**设计决策**：

1. **完全 opt-in**：Teams 模式是新 skill、新命令行 flag，默认路径零影响。PoC 期间 Current_DAG_Implementation 完全不动。

2. **5 个视角是硬编码的**：arch / sec / cost / ops / product。这 5 个足以覆盖典型技术决策，同时不超过 tmux pane 舒适观察上限。未来可扩展到 PM、DX 等，但 PoC 不考虑。

3. **Teammate 只读**：所有 teammate 的 allowedTools 不含 Write/Edit/Bash。只有 team-lead 能写 ADR。避免 5 个 teammate 同时写同一个 ADR 的竞态。

4. **PoC 只跑 3 个固定 topic**：避免样本过少（只跑 1 个）或工作量过大（跑 10 个）。3 个覆盖 simple/medium/complex 三级。

5. **量化 + 定性**：metrics 表格（token、时长、失败率）+ 人工 review 质量打分。单靠任一侧都不够说服力。

## Components and Interfaces

### Component 1: forge-decide-teams SKILL

**文件**：`skills/forge-decide-teams/SKILL.md`

**Frontmatter**：
```yaml
---
name: forge-decide-teams
description: "[PoC] 使用 Agent Teams 的 /forge decide 并行多视角决策"
allowed-tools: Read, Write, Bash, Agent
---
```

**主要逻辑**：

```markdown
# forge-decide-teams

## Execution Contract (non-negotiable)

必须：
- 先检查 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`，未设置则报错并退出
- 必须通过 Agent(subagent_type="forge-decide-lead") 调用 team-lead
- 最终 ADR 路径必须由 team-lead 写入，skill 本身不写 ADR

禁止：
- 禁止在未启用 Agent Teams 时退化为 DAG（那是另一个 skill 的职责）
- 禁止直接调用 viewpoint agents（必须经过 team-lead 协调）

## Workflow

1. 前置检查（env var、tmux、CC 版本 ≥2.1.32）
2. 解析 topic 参数
3. 写 `.forge/runs/<ts>-decide-teams-run.md` 的 `started_at` 段
4. `Agent(subagent_type="forge-decide-lead", prompt=<topic + metadata>)`
5. 等待 Agent 返回（带 20 分钟超时提示）
6. 追加 `.forge/runs/<ts>-decide-teams-run.md` 的 `finished_at` 段
7. 汇报：ADR 路径、5 个视角的 token/duration 摘要
```

### Component 2: Team_Lead_Agent 定义

**文件**：`.claude/agents/forge-decide-lead.md`

**Frontmatter**：
```yaml
---
name: forge-decide-lead
description: "Agent Teams 模式下 /forge decide 的协调 agent"
model: sonnet
maxTurns: 30
allowedTools: [Read, Write, Agent, SendMessage, Bash, TodoWrite]
disallowedTools: [Edit]
memory: project
color: "#6366f1"
restrictedSubagents:
  - forge-decide-arch
  - forge-decide-sec
  - forge-decide-cost
  - forge-decide-ops
  - forge-decide-product
initialPrompt: |
  你是本次决策的协调人。
  1. 解析 topic
  2. 并行派发 5 个 viewpoint teammate
  3. 等所有 teammate 完成
  4. 合成 ADR draft
---

# forge-decide-lead

## Workflow
...

## Learnings
- _本 agent 的经验条目按 ccbp-inspired-hardening R7 格式累积_
```

**Workflow 要点**：
- Step 1：并行调用 5 个 `Agent(subagent_type="forge-decide-<viewpoint>")`
- Step 2：监听 `TaskCompleted` hook，维护 `{viewpoint: status}` 映射
- Step 3：所有完成后（或 20min 超时后），读取每个 teammate 的 final response
- Step 4：用固定模板合成 ADR
- Step 5：写入 `.forge/decisions/<date>-<topic-slug>.md`

### Component 3: Viewpoint Agents

**5 个文件**：`.claude/agents/forge-decide-{arch,sec,cost,ops,product}.md`

**通用 frontmatter 模板**（仅视角描述和 name 不同）：
```yaml
---
name: forge-decide-<viewpoint>
description: "<viewpoint> 视角决策分析 teammate"
model: sonnet
maxTurns: 15
allowedTools: [Read, Glob, Grep, WebFetch, SendMessage]
disallowedTools: [Write, Edit, Bash, Agent]
memory: project
color: "#<各自颜色>"
initialPrompt: |
  你是 <viewpoint> 视角的分析 teammate。
  只从 <viewpoint> 角度评估以下决策 topic，不做其他视角的工作。
  输出格式：
    ## 核心立场
    ## 关键权衡
    ## 建议（接受/拒绝/有条件接受）
    ## Follow-up
---
```

**各视角职责**（写在 SKILL 正文）：
- **arch**：架构一致性、技术债、可扩展性
- **sec**：威胁模型、权限模型、数据流保密性
- **cost**：一次性成本、维护成本、机会成本
- **ops**：可观测性、故障恢复、部署复杂度
- **product**：用户价值、DX、竞品对比

### Component 4: 对比脚本

**文件**：`scripts/run-decide-poc.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

TOPIC_ID="${1:?topic id required}"
TOPIC_FILE=".forge/specs/forge-decide-agent-teams/poc-topics.md"
OUT_DIR=".forge/runs/decide-poc"
mkdir -p "$OUT_DIR"

# Extract topic N by id from poc-topics.md
TOPIC=$(awk "/^## $TOPIC_ID:/,/^## [A-Z0-9]+:/" "$TOPIC_FILE" | head -n -1)

run_mode() {
  local mode="$1"
  local t0=$(date +%s)
  # This calls /forge decide with --mode via the skill or CLI wrapper
  # The actual invocation depends on how Forge skills are triggered;
  # in CI-style PoC, we use a headless `claude -p "/forge decide --mode=$mode $TOPIC"`
  claude -p "/forge decide --mode=$mode $TOPIC" \
    --output-format stream-json > "$OUT_DIR/$TOPIC_ID-$mode.jsonl" || true
  local t1=$(date +%s)
  echo "$((t1 - t0))" > "$OUT_DIR/$TOPIC_ID-$mode.duration"
}

run_mode dag
run_mode teams

# Produce metrics
node scripts/parse-decide-poc-metrics.mjs "$TOPIC_ID" > "$OUT_DIR/$TOPIC_ID-metrics.md"
echo "Metrics: $OUT_DIR/$TOPIC_ID-metrics.md"
```

**辅助脚本**：`scripts/parse-decide-poc-metrics.mjs` 从 JSONL 中提取 token usage、duration、teammate failure，输出 Markdown 表格。

### Component 5: PoC 报告

**文件**：`.forge/decisions/<date>-agent-teams-poc.md`

**结构**：
```markdown
---
id: <adr-id>
date: YYYY-MM-DD
deciders: ...
status: accepted
topic: "Agent Teams PoC for /forge decide"
---

# ADR: Agent Teams PoC for /forge decide

## Context
...

## Setup
- CC version: 2.1.x
- Topics tested: 3 (simple/medium/complex)
- Iterations per topic: 2 (for variance)

## Metrics

| Topic | Mode | Wall-clock | Total tokens | P90 latency | Failures | ADR length |
|---|---|---|---|---|---|---|
| simple (A) | dag | 2m10s | 18k | ... | 0 | 520w |
| simple (A) | teams | 1m45s | 26k | ... | 1 | 680w |
| ...

## Qualitative Observations
- Teammate 视角独立性...
- Team-lead 合成质量...
- 失败恢复体验...

## Recommendation: hybrid

Reason: ...

## Follow-up Actions
- [ ] ...
- [ ] ...
```

## Data Models

### PoC Topic 格式

**文件**：`.forge/specs/forge-decide-agent-teams/poc-topics.md`

```markdown
## A: 添加一个新的 CLI flag
**Complexity**: simple
**Topic**: 在 `claude` CLI 中添加 `--json-output` flag，影响现有 `--output-format` 选项。

## B: 重构 config 系统
**Complexity**: medium
**Topic**: 把 `.forge/config.md` 的 YAML frontmatter 拆成多个独立文件，保留向后兼容。

## C: 引入 plugin 系统
**Complexity**: complex
**Topic**: 为 Forge 设计 plugin 机制，允许第三方扩展 skill/agent/hook，同时保持 `.forge/` 状态一致性。
```

### Metrics JSONL 格式

每个 `.jsonl` 文件是 CC `--output-format stream-json` 的原始流；解析 `{type: "result"}` 得到总 token 和 duration。

## Error Handling

| 场景 | skill 行为 | 用户可见 |
|---|---|---|
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` 未设置 | exit 2 | "请设置 env var 后重启 CC 会话" |
| tmux 不可用 | exit 2 | "Agent Teams 需要 tmux，请安装或切换 DAG 模式" |
| CC 版本 < 2.1.32 | exit 2 | "Agent Teams 需要 CC ≥2.1.32，当前: <ver>" |
| Team_Lead 超时（> 30min） | kill, 写 partial manifest, exit 1 | "team-lead 超时，已保存中间结果" |
| 某个 teammate 失败 | 不中断，记录失败原因 | lead 的最终 ADR 标注缺失视角 |
| 所有 teammate 失败 | exit 1 | "全部 teammate 失败，请检查 `.forge/runs/`" |

## Testing Strategy

本 PoC 以**运行数据**作为主要验收证据，常规单元测试覆盖结构性约束：

1. **Contract test** `test/forge-decide-teams.contract.test.ts`：
   - 所有新 agent 文件存在
   - Frontmatter 必需字段齐全
   - `restrictedSubagents` 列表包含且仅包含 5 个 viewpoint
   - viewpoint agents 的 `disallowedTools` 包含 Write/Edit/Bash

2. **Skill contract test**：`skills/forge-decide-teams/SKILL.md` 含必需章节

3. **脚本测试** `test/run-decide-poc.test.sh`：
   - 用 mock claude 验证脚本调用签名正确
   - metrics 解析不崩溃

4. **PoC 运行本身**（非自动化）：
   - 3 个 topic × 2 模式 × 2 次迭代 = 12 次运行
   - 手动填 metrics 表格，撰写定性观察
   - 产出 PoC_Report

5. **归档条件**：PoC_Report committed 且至少 1 个 reviewer approved 后，spec 移入 `.forge/archive/`。
