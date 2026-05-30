---
id: "eval-001"
title: "Agent 自包含 MCP/Hooks 评估（§22）"
status: proposed
date: "2026-05-30"
deciders:
  - "@maintainer"
related_adrs:
  - "ADR-0004-skills-collapse-and-dispatcher.md"
---

> §22 源自 Claude Code CHANGELOG 优化建议收集（spec: misc-forge-optimization）。

# Agent 自包含 MCP/Hooks 评估（§22）

## Context

Claude Code 支持在 agent frontmatter 中定义 `mcpServers` 和 `hooks`，使 agent 可以自包含配置而非依赖全局 settings.json。Forge 有 14 个 agent 定义在 `.claude/agents/` 中，其中 2 个（forge-build、forge-ship）在 frontmatter 中定义了 hooks。

## 评估

### 当前状态

| Agent | 有 hooks | 有 mcpServers | 依赖全局配置 |
|-------|---------|--------------|-------------|
| forge-build | ✅ (Stop hook) | ❌ | 是 |
| forge-ship | ✅ (PreToolUse hook) | ❌ | 是 |
| 其余 12 个 | ❌ | ❌ | 是 |

### 分析

1. **运行上下文**：所有 Forge agent 都在项目目录内运行，项目级 settings.json 始终可用。不存在"agent 在孤立环境中运行"的场景。

2. **hooks 引用项目脚本**：forge-build 的 Stop hook 调用 `scripts/persistent-loop.sh`，forge-ship 的 PreToolUse hook 校验 `git push`。这些路径是项目相对路径，agent 自包含后路径解析方式不变，无额外收益。

3. **MCP 依赖**：forge-review 依赖 `forge-context` MCP server（智能 diff 截断）。该 MCP 在 `init.sh` 中配置到项目 settings.json。如果 agent 自包含 MCP 配置，需要在每个 agent 中硬编码绝对路径，降低可移植性。

4. **维护成本**：将 MCP/hooks 配置散布到 14 个 agent 文件中，任何配置变更需要逐一修改，增加维护负担。

## Decision

**当前阶段不实施 agent 自包含配置。** 全局 settings.json 已满足所有需求。当以下条件之一满足时重新评估：

- Forge agent 需要在非项目目录环境中运行
- 不同 agent 需要互斥的 MCP server 配置
- Claude Code 的 agent frontmatter 支持变量插值（如 `${CLAUDE_PLUGIN_ROOT}`）

## Consequences

### Positive

- 配置集中管理，单一修改点
- 不增加 agent 文件复杂度

### Negative

- 如果未来 agent 需要独立运行，需要返工
- 全局 settings.json 的 hooks 配置对所有 agent 生效，无法按 agent 精细化控制
