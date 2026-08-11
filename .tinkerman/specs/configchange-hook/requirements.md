---
status: completed
feature: configchange-hook
layout: requirements
created: 2026-05-30
tier: light
---
# ConfigChange Hook — 需求文档

## 引言

Claude Code 2.1.49 引入 `ConfigChange` 生命周期事件：当 `.claude/settings.json`、`CLAUDE.md` 等配置文件变化时自动触发 hook。Forge 依赖 `.tinkerman/config.md` 作为项目级配置（`ci_check_command`、`decide_dispatch_mode`、`max_parallel_agents` 等），但配置变更后 Claude 不感知，导致行为与配置不一致。

本特性在 Forge plugin 中注册 `ConfigChange` hook，监听关键配置文件的变化，通过 `additionalContext` 机制提示 Claude 重新读取配置，实现配置热感知。

**来源**：Claude Code CHANGELOG §11 `ConfigChange` hook `[2.1.49]`。

## 术语

- **ConfigChange Event**：Claude Code v2.1.49+ 新增的 hook 生命周期事件，配置文件变化时触发。
- **additionalContext**：Hook 输出中可包含的 JSON 字段 `{ "additionalContext": "..." }`，Claude 会将其作为额外上下文注入。
- **Forge Config**：`.tinkerman/config.md`，Forge 项目的配置单一事实源。
- **Fail-Open**：Hook 出错时 exit 0 不阻断工作流，仅通过 stderr 诊断。

## 需求

### Requirement 1: ConfigChange Hook 脚本

**User Story:** 作为 Forge 用户，我希望修改 `.tinkerman/config.md` 后 Claude 能感知变化并重新加载配置，以避免使用过时的配置继续工作。

#### 验收标准

1. THE `scripts/config-changed-hook.mjs` SHALL 作为 `ConfigChange` 事件的 hook 脚本运行。
2. WHEN hook 被触发且变化文件匹配 `.tinkerman/config.md`，THE script SHALL 输出 JSON `{ "additionalContext": "📝 Forge 配置已变更（<changed_files>），建议重新读取 .tinkerman/config.md" }`。
3. WHEN hook 被触发且变化文件匹配 `.claude/settings.json`，THE script SHALL 输出 JSON `{ "additionalContext": "📝 Claude Code 配置已变更，建议检查影响范围" }`。
4. WHEN 变化文件不匹配任何监听目标，THE script SHALL 静默退出（无输出）。
5. THE script SHALL 使用 `trap 'exit 0' ERR` 或 Node.js 等价机制实现 fail-open 设计，任何内部错误都不阻断工作流。
6. THE script 执行时间 SHALL 不超过 3 秒。

### Requirement 2: Plugin.json 注册

**User Story:** 作为 Forge 用户，我希望 ConfigChange hook 通过 marketplace plugin 自动注册，无需手动配置。

#### 验收标准

1. THE `.claude-plugin/plugin.json` SHALL 新增 `ConfigChange` 事件注册，使用 `args` 数组形式指向 `scripts/config-changed-hook.mjs`。
2. THE hook timeout SHALL 设置为 3 秒。
3. THE hook 注册 SHALL 不影响已有的 12 类事件、30+ 个 hook 的正常工作。
4. THE hook 注册 SHALL 遵循 fail-open 设计：不包含阻断性逻辑。

### Requirement 3: 监听范围可扩展

**User Story:** 作为 Forge 维护者，我希望监听的配置文件列表可在脚本内轻松扩展，以支持未来的配置文件。

#### 验收标准

1. THE `config-changed-hook.mjs` SHALL 使用可配置的监听列表（数组常量），便于未来添加新的配置文件路径。
2. THE 监听列表 SHALL 至少包含：`.tinkerman/config.md`、`.claude/settings.json`。
3. WHEN 新增监听文件到列表中，THE 脚本 SHALL 无需修改核心逻辑即可生效。
