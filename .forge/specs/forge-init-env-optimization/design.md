---
feature: forge-init-env-optimization
layout: design
created: 2026-05-30
---

# Design Document: forge init 环境变量与 MCP 配置优化

## Overview

为 `forge init` 新增 4 项配置推荐，写入用户的 `.claude/settings.json`。所有配置都是环境变量或 MCP 配置项，不涉及代码逻辑变更。

**变更范围**：
- 修改 `forge init` 模板/脚本（新增 4 项配置写入）
- 可选修改 `plugin.json` MCP 配置（添加 alwaysLoad）

**不涉及**：hook 脚本、agent 定义、SKILL 文档。

## Architecture

```
forge init
  │
  ├── 写入 .claude/settings.json
  │   ├── env:
  │   │   ├── ENABLE_PROMPT_CACHING_1H: "true"
  │   │   ├── MCP_CONNECTION_NONBLOCKING: "true"
  │   │   ├── CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "true"
  │   │   └── CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" (已有)
  │   │
  │   └── mcpServers:
  │       └── (plugin.json 负责，settings.json 不重复)
  │
  └── 可选修改 plugin.json
      └── mcpServers.forge-context.alwaysLoad: true
```

## Components and Interfaces

### Component 1: forge init 模板更新

`templates/settings.json` 或 `scripts/forge-init.mjs` 中新增：

```json
{
  "env": {
    "ENABLE_PROMPT_CACHING_1H": "true",
    "MCP_CONNECTION_NONBLOCKING": "true",
    "CLAUDE_CODE_SUBPROCESS_ENV_SCRUB": "true",
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### Component 2: plugin.json MCP alwaysLoad

```json
{
  "mcpServers": {
    "forge-context": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/src/mcp/server.js"],
      "alwaysLoad": true
    }
  }
}
```

## Key Design Decisions

| Decision | Chosen Path | Rejected Path | Reason |
|----------|-------------|---------------|--------|
| 写入位置 | settings.json env | 启动脚本 export | settings.json 是 Claude Code 标准配置位置 |
| alwaysLoad 位置 | plugin.json + settings.json | 仅 plugin.json | 双端确保生效 |
| 是否覆盖已有 | 不覆盖，仅添加缺失 | 始终覆盖 | 尊重用户自定义 |

## Testing Strategy

1. **模板验证**：检查 settings.json 模板包含 4 项配置
2. **手动验证**：运行 `forge init` → 检查生成的 settings.json
3. **回归验证**：`npm run check` 通过
