---
status: completed
feature: forge-init-env-optimization
layout: requirements
created: 2026-05-30
tier: light
---
# forge init 环境变量与 MCP 配置优化 — 需求文档

## 引言

Claude Code 提供多个环境变量和 MCP 配置项，可显著提升性能、安全性和用户体验。这些配置需要写入用户的 `.claude/settings.json`，最适合的入口是 `forge init`。

本特性为 `forge init` 新增 4 项环境变量/MCP 配置推荐，用户运行 `forge init` 时自动写入或提示。

**涵盖优化项**：§40 `alwaysLoad` MCP、§48 `ENABLE_PROMPT_CACHING_1H`、§54 `MCP_CONNECTION_NONBLOCKING`、§68 `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`。

## 术语

- **alwaysLoad**：MCP server 配置项，设为 `true` 时 server 在会话启动时立即加载，不等待首次工具调用。消除首次 MCP 调用的冷启动延迟。
- **ENABLE_PROMPT_CACHING_1H**：环境变量，将 prompt cache TTL 从默认 5 分钟延长到 1 小时。最高 ROI 配置项之一——重复使用相同 system prompt 的会话可大幅节省 token。
- **MCP_CONNECTION_NONBLOCKING**：环境变量，设为 `true` 时 MCP server 连接不阻塞会话启动。MCP 不可用时会话仍可正常使用。
- **CLAUDE_CODE_SUBPROCESS_ENV_SCRUB**：环境变量，设为 `true` 时清理子进程环境变量中的敏感信息（API key 等）。

## 需求

### Requirement 1: MCP alwaysLoad 配置（§40）

**User Story:** 作为 Forge 用户，我希望 forge-context MCP server 在会话启动时立即可用，消除首次调用的冷启动延迟。

#### 验收标准

1. THE `forge init` 生成的用户 settings.json 中 SHALL 在 `mcpServers.forge-context` 配置中包含 `"alwaysLoad": true`。
2. WHEN `alwaysLoad: true`，THE forge-context server SHALL 在会话启动时立即连接。
3. THE `plugin.json` 中的 MCP 配置 SHALL 同步添加 `"alwaysLoad": true`（如 Claude Code marketplace plugin 支持）。
4. IF `alwaysLoad` 不被当前 Claude Code 版本支持，THE 配置 SHALL 静默忽略（不报错）。

### Requirement 2: ENABLE_PROMPT_CACHING_1H 环境变量（§48）

**User Story:** 作为 Forge 用户，我希望 prompt cache 有效期延长到 1 小时，以减少重复 system prompt 的 token 消耗。

#### 验收标准

1. THE `forge init` 生成的用户 settings.json 中 SHALL 在 `env` 部分包含 `"ENABLE_PROMPT_CACHING_1H": "true"`。
2. THE 环境变量 SHALL 仅影响 cache TTL，不改变其他行为。
3. THE `forge init` 输出中 SHALL 说明此配置的用途："⚡ Prompt cache TTL 延长至 1 小时（节省 token）"。

### Requirement 3: MCP_CONNECTION_NONBLOCKING 环境变量（§54）

**User Story:** 作为 Forge 用户，我希望 MCP server 连接失败时不阻塞会话启动，以避免因 MCP 问题导致整个工作流卡住。

#### 验收标准

1. THE `forge init` 生成的用户 settings.json 中 SHALL 在 `env` 部分包含 `"MCP_CONNECTION_NONBLOCKING": "true"`。
2. THE 环境变量 SHALL 确保会话启动不等待 MCP 连接完成。
3. THE `forge init` 输出中 SHALL 说明此配置的用途。

### Requirement 4: CLAUDE_CODE_SUBPROCESS_ENV_SCRUB 环境变量（§68）

**User Story:** 作为 Forge 用户，我希望 hook 脚本的子进程环境变量中不包含敏感信息，以降低泄露风险。

#### 验收标准

1. THE `forge init` 生成的用户 settings.json 中 SHALL 在 `env` 部分包含 `"CLAUDE_CODE_SUBPROCESS_ENV_SCRUB": "true"`。
2. THE 环境变量 SHALL 清理子进程环境中的 API key 等敏感字段。
3. THE `forge init` 输出中 SHALL 说明此配置的安全用途。

### Requirement 5: forge init 输出汇总

**User Story:** 作为 Forge 用户，我希望 `forge init` 的输出清晰展示所有配置变更及其用途。

#### 验收标准

1. THE `forge init` 完成后 SHALL 输出配置汇总表：

```markdown
## 🔧 配置优化

| 配置项 | 值 | 用途 |
|--------|-----|------|
| alwaysLoad | true | MCP 即时加载，消除冷启动 |
| ENABLE_PROMPT_CACHING_1H | true | Cache TTL 1h，节省 token |
| MCP_CONNECTION_NONBLOCKING | true | MCP 不阻塞启动 |
| CLAUDE_CODE_SUBPROCESS_ENV_SCRUB | true | 清理子进程敏感环境变量 |
```

2. WHEN 用户已有部分配置，THE `forge init` SHALL 不覆盖已有值，仅添加缺失项。
3. THE 已有 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 配置 SHALL 保持不变。
