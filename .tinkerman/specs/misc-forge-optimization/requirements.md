---
status: completed
feature: misc-forge-optimization
layout: requirements
created: 2026-05-30
tier: light
---
# 零散小优化收集 — 需求文档

## 引言

Claude Code CHANGELOG 中有 9 项较小的优化建议，无法独立成 spec，但对 Forge 有实际价值。本 spec 将它们收集在一起，按实施难度排序。

**涵盖优化项**：§22 agent mcpServers/hooks、§24 bgIsolation、§39 monitors、§52 --bare、§53 exclude-dynamic、§56 EnterWorktree、§59 sparsePaths、§83 !command、§90 SIMPLE 模式。

## 术语

- **bgIsolation**：worktree 配置 `worktree.bgIsolation: "none"`，禁用后台 agent 的 worktree 隔离。适用于特殊仓库结构。
- **monitors**：Plugin 配置项，定义持续运行的后台监控进程。适合长时间运行的检查任务。
- **--bare**：Claude Code 的 `--bare` 标志，最小化系统 prompt 加载，适合 CI/脚本场景。
- **sparsePaths**：worktree 配置 `worktree.sparsePaths`，只 checkout 指定目录，适合大 monorepo。
- **CLAUDE_CODE_SIMPLE**：环境变量，启用最小化模式，减少输出和交互。

## 需求

### Requirement 1: Agent 自包含 MCP/Hooks（§22）

**User Story:** 作为 Forge 维护者，我希望某些 agent 自包含 MCP server 和 hook 配置，减少对全局配置的依赖。

#### 验收标准

1. WHEN Claude Code 支持在 agent frontmatter 中定义 `mcpServers` 和 `hooks`，THE Forge SHALL 评估哪些 agent 适合自包含。
2. THE 评估 SHALL 产出 ADR 文档（`.tinkerman/decisions/`），记录哪些 agent 需要、哪些不需要。
3. THE 当前阶段 SHALL 为评估阶段，不强制实施。全局 MCP 配置已满足当前需求。

### Requirement 2: worktree.bgIsolation 配置（§24）

**User Story:** 作为 Forge 用户，我希望在特殊仓库（如 git submodule 仓库）中禁用 worktree 隔离。

#### 验收标准

1. THE `.claude/settings.json` 中 SHALL 支持配置 `"worktree.bgIsolation": "none"`。
2. THE `forge init` 模板 SHALL 注释说明此配置的适用场景。
3. THE 默认值 SHALL 保持默认（不禁用），仅特殊仓库启用。

### Requirement 3: Plugin Monitors 持续监控（§39）

**User Story:** 作为 Forge 用户，我希望 Forge 能运行持续的后台监控（如 stale evolved-rules 检测）。

#### 验收标准

1. WHEN Claude Code 的 `monitors` 功能可用于 plugin，THE Forge SHALL 评估是否利用它替代当前的 Stop hook 轮询机制。
2. THE 评估 SHALL 产出 ADR 文档。
3. THE 当前阶段 SHALL 为评估阶段，不强制实施。

### Requirement 4: CI --bare 模式（§52）

**User Story:** 作为 CI 管理者，我希望 Claude Code 在 CI 中使用 `--bare` 模式，减少不必要的系统 prompt 加载。

#### 验收标准

1. THE `scripts/run-ci-ultrareview.sh` SHALL 评估是否在 `claude` 调用中添加 `--bare` 标志。
2. IF `--bare` 与 Forge 的 SKILL 加载不兼容，THE 脚本 SHALL 不添加此标志。
3. THE 决策 SHALL 记录在脚本注释中。

### Requirement 5: CI --exclude-dynamic-system-prompt-sections（§53）

**User Story:** 作为 CI 管理者，我希望 CI 中的 Claude Code 排除动态 system prompt 段，减少 context 消耗。

#### 验收标准

1. THE `scripts/run-ci-ultrareview.sh` SHALL 评估是否添加 `--exclude-dynamic-system-prompt-sections` 标志。
2. THE 评估 SHALL 考虑此标志是否影响 ultrareview 的分析质量。

### Requirement 6: EnterWorktree mid-session 利用（§56）

**User Story:** 作为 Forge 用户，我希望在已有会话中切换到 worktree，无需重启。

#### 验收标准

1. THE Forge 的 `/forge build` SHALL 在检测到需要 worktree 隔离时，指导使用 `EnterWorktree` 工具。
2. THE build SKILL instructions SHALL 说明 mid-session worktree 切换的工作流。
3. THE 此为文档/指导层面的优化，不涉及代码变更。

### Requirement 7: sparsePaths 大 Monorepo 优化（§59）

**User Story:** 作为大 monorepo 用户，我希望 worktree 只 checkout 相关目录，减少 checkout 时间和磁盘占用。

#### 验收标准

1. THE `forge init` 模板 SHALL 注释说明 `worktree.sparsePaths` 配置选项。
2. THE 默认 SHALL 不启用（仅在 monorepo 场景按需配置）。

### Requirement 8: `! <command>` 文档化（§83）

**User Story:** 作为 Forge 用户，我希望了解如何在 Claude Code 中执行 shell 命令。

#### 验收标准

1. THE Forge README 或文档 SHALL 添加 `! <command>` 使用说明。
2. THE 说明 SHALL 包含示例（如 `! npm run test`）。

### Requirement 9: CLAUDE_CODE_SIMPLE 最小化模式（§90）

**User Story:** 作为 Forge 用户，我希望在简单场景中使用最小化模式减少干扰。

#### 验收标准

1. THE `forge init` 模板 SHALL 注释说明 `CLAUDE_CODE_SIMPLE` 环境变量的用途。
2. THE 默认 SHALL 不启用。
3. THE 文档 SHALL 说明此模式可能影响 Forge 的完整功能。
