---
feature: misc-forge-optimization
layout: design
created: 2026-05-30
---

# Design Document: 零散小优化

## Overview

9 项小型优化的收集 spec。多数为配置项或评估类任务，不涉及大量代码变更。

**变更范围**：配置、文档、评估 ADR。

**不涉及**：核心 hook/agent/SKILL 逻辑。

## Components

### §22 Agent 自包含 MCP/Hooks — 评估

当前优先级低。全局 MCP 配置已满足需求。评估是否需要在 agent 级定义 MCP server。

**产出**：ADR 文档。

### §24 bgIsolation — 配置

```json
// .claude/settings.json (特殊仓库才启用)
{
  "worktree": {
    "bgIsolation": "none"
  }
}
```

### §39 Monitors — 评估

Claude Code plugin 的 `monitors` 功能。评估是否可替代 Stop hook 轮询。

**产出**：ADR 文档。

### §52 --bare CI — 脚本评估

```bash
# scripts/run-ci-ultrareview.sh 中评估添加
claude --bare ultrareview --json
```

需验证 `--bare` 是否影响 SKILL 加载。

### §53 --exclude-dynamic — 脚本评估

```bash
claude --exclude-dynamic-system-prompt-sections ultrareview --json
```

### §56 EnterWorktree — 文档

在 build SKILL instructions 中添加 mid-session worktree 切换指导。

### §59 sparsePaths — 配置

```json
{
  "worktree": {
    "sparsePaths": ["src/", "tests/"]
  }
}
```

### §83 !command — 文档

README 中添加 shell 命令执行说明。

### §90 SIMPLE — 配置

```json
{
  "env": {
    "CLAUDE_CODE_SIMPLE": "true"
  }
}
```

## Testing Strategy

1. **配置验证**：检查各配置项格式正确
2. **文档验证**：README 和 SKILL instructions 包含新增内容
3. **回归验证**：`npm run check` 通过
