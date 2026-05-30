# Claude Code CHANGELOG (2.1.0–2.1.157) 对 Forge 项目的优化建议

> 基于 Claude Code CHANGELOG 全量分析（2.1.0 → 2.1.157，约 4100 行），结合 Forge 项目代码库结构，按影响域分类的 70 个优化点。

---

## 目录

- [一、Hook 系统优化](#一hook-系统优化forge-的核心基础设施)
- [二、Agent & Subagent 系统优化](#二agent--subagent-系统优化)
- [三、Workflow 动态编排优化](#三workflow-动态编排优化)
- [四、Plugin 系统优化](#四plugin-系统优化)
- [五、性能 & Context 优化](#五性能--context-优化)
- [六、Worktree & 分支优化](#六worktree--分支优化)
- [七、Review & 质量优化](#七review--质量优化)
- [八、安全强化](#八安全强化)
- [九、可观测性](#九可观测性)
- [十、关键 Bug 修复（直接影响 Forge）](#十关键-bug-修复直接影响-forge)
- [十一、其他有价值的特性](#十一其他有价值的特性)
- [Top 20 优先级排序](#top-20-优先级排序)

---

## 一、Hook 系统优化（Forge 的核心基础设施）

### 1. `disallowed-tools` frontmatter 限制 Agent 工具集 `[2.1.152]`

**现状**：Forge 的 review agent（spec-check、quality-check、security-check）定义在 `.claude/agents/` 中，但没有限制它们的工具集。理论上 review agent 可以执行 Bash 命令。

**优化**：在每个 review agent 的 frontmatter 中添加：

```yaml
# .claude/agents/spec-check.md
---
disallowed-tools:
  - Bash
  - Write
  - Edit
  - Agent
---
```

这直接强化了 CLAUDE.md §3.1 "写代码的 Agent 不评审自己的代码" 的隔离性。

### 2. `PreCompact` hook 保护 Forge 进度状态 `[2.1.105]`

**现状**：Forge §6 要求 "阶段间上下文交接通过 `.forge/` 目录文件系统进行"。但 context compaction 可能丢失关键的进度状态。

**优化**：添加 PreCompact hook，在 compaction 前检查 `.forge/progress/` 和 `.forge/status.md` 是否已更新：

```json
{
  "event": "PreCompact",
  "type": "command",
  "args": ["node", "scripts/hooks/pre-compact-guard.mjs"],
  "timeout": 3
}
```

如果 progress 文件比最后一条 user message 更旧，返回 `{"decision":"block"}` 阻断 compaction。

### 3. `PostCompact` hook 重新注入 Forge 配置 `[2.1.76]`

**现状**：compaction 后 Forge 的宪法（CLAUDE.md）和 evolved-rules 可能被压缩丢失。

**优化**：添加 PostCompact hook，在 compaction 完成后重新注入 `.forge/status.md` 和 `.forge/knowledge/evolved-rules.md` 的关键内容，确保上下文不丢失。

### 4. `continueOnBlock` 让门禁引导式修复 `[2.1.139]`

**现状**：Forge 的 frozen zone hook 拒绝写操作时，直接中断，agent 不知道原因。

**优化**：在 PostToolUse frozen-zone hook 中设置 `continueOnBlock: true`，让拒绝原因反馈给 Claude：

```json
{
  "event": "PostToolUse",
  "matcher": "Write|Edit",
  "continueOnBlock": true,
  "args": ["node", "scripts/hooks/frozen-zone-check.mjs"]
}
```

这样 Claude 会收到 "此文件在 frozen zone 中，不允许修改 locked spec" 的引导，而不是无声中断。

### 5. `MessageDisplay` hook 优化 Forge 输出展示 `[2.1.152]`

**优化**：Forge 的结构化输出（decision_point、review_result）可以通过 MessageDisplay hook 做格式优化——自动折叠冗长的 subagent 输出，只保留决策摘要。

### 6. Hook exec form 消除 shell 注入风险 `[2.1.139]`

**现状**：Forge 的 hook 配置使用 `command` 字符串形式：

```json
{"command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/foo.mjs\" 2>/dev/null || true"}
```

**优化**：迁移到 `args` 数组形式：

```json
{"args": ["node", "${CLAUDE_PLUGIN_ROOT}/scripts/foo.mjs"], "timeout": 5}
```

好处：无 shell 解释 → 无注入风险、无需引号处理、~30% 更少的进程开销。项目已有 `hook-design-principles.md` 记录了这一点，但 `.claude/settings.json` 中的 hook 尚未全部迁移。

### 7. `terminalSequence` 实现 Forge 阶段通知 `[2.1.141]`

**优化**：Forge 的 `/forge build` 阶段切换时，hook 可以通过 `terminalSequence` 发出桌面通知：

```json
{"terminalSequence": ["\033]9;Forge: build 阶段完成，进入 review"]}
```

让用户 alt-tab 后知道 Forge 到了哪个阶段。

### 8. `type: "mcp_tool"` hook 直接调用 forge-context `[2.1.118]`

**优化**：Forge 的某些 hook 逻辑可以通过 `type: "mcp_tool"` 直接调用 forge-context MCP 工具，跳过进程启动开销：

```json
{"type": "mcp_tool", "server": "forge-context", "tool": "forge_git", "input": {"command": "status"}}
```

### 9. `SessionStart` hook 自动命名 + 热加载 `[2.1.152]`

**优化**：Forge 的 SessionStart hook 可以：
- 返回 `sessionTitle: "[forge-build] feat/auth"` 让 `claude agents` 中一目了然
- 返回 `reloadSkills: true` 让 `forge init` 安装的新 skill 即时生效

### 10. `CwdChanged` 和 `FileChanged` hook `[2.1.83]`

**优化**：当工作目录切换或文件变化时触发。Forge 的 frozen zone guard 可以用 `FileChanged` 监听 `.forge/specs/` 目录的变化，自动刷新冻结文件列表。`CwdChanged` 可用于 direnv 等环境管理。

### 11. `ConfigChange` hook `[2.1.49]`

**优化**：配置文件变化时触发。可以监听 `.forge/config.md` 和 `.claude/settings.json` 的变化，自动重新加载 Forge 配置。

### 12. `TaskCreated` hook `[2.1.84, 2.1.89]`

**优化**：Forge 的 `/forge build` 创建 TaskCreate 时触发。可以在这里注入 plan 上下文，确保每个 task 都有 plan 信息。支持 `defer` 决策，让 headless 模式可以暂停在 tool call 并通过 `-p --resume` 重新评估。

### 13. `WorktreeCreate`/`WorktreeRemove` hook `[2.1.49, 2.1.50]`

**优化**：worktree 创建/删除时触发。Forge 可以在这里记录 `.forge/progress/` 中的 worktree 状态。支持 `type: "http"` 返回 `hookSpecificOutput.worktreePath`。

### 14. `TeammateIdle` 和 `TaskCompleted` hook `[2.1.33]`

**优化**：Agent Teams 的 teammate 空闲或任务完成时触发。Forge 的 `/forge review` 可以用此来检测三层评审是否全部完成。支持 `{"continue": false, "stopReason": "..."}` 来停止 teammate。

### 15. `StopFailure` hook `[2.1.78]`

**优化**：turn 因 API 错误（rate limit、auth failure）结束时触发。Forge 可以在此记录错误到 `.forge/debug/`，供 `/forge debug` 分析。

### 16. `PermissionDenied` hook `[2.1.89]`

**优化**：auto mode 拒绝操作后触发，可返回 `{retry: true}` 让模型重试。Forge 的门禁拒绝时可以自动给模型更详细的引导。

### 17. `InstructionsLoaded` hook `[2.1.69]`

**优化**：当 CLAUDE.md 或 `.claude/rules/*.md` 加载到上下文时触发。可以在此记录 Forge 规则的加载状态。

### 18. Hook `if` 条件过滤减少进程开销 `[2.1.85]`

**优化**：使用 permission rule 语法的 `if` 字段过滤何时运行 hook，减少不必要的进程启动：

```json
{"if": "Bash(git commit*)", "matcher": "Bash", "args": ["node", "scripts/hooks/commit-guard.mjs"]}
```

### 19. Hook `duration_ms` 在 PostToolUse/PostToolUseFailure `[2.1.119]`

**优化**：PostToolUse hook 输入现在包含 `duration_ms`（工具执行时间，排除权限提示和 PreToolUse hooks）。Forge 可以追踪每个 build 步骤的执行时间，用于性能分析。

### 20. Hook output >50K 自动存盘 `[2.1.89]`

**优化**：hook 输出超过 50K 字符时自动保存到磁盘并返回文件路径+预览，而非直接注入 context。防止 Forge hook 的大量输出撑爆 context window。

---

## 二、Agent & Subagent 系统优化

### 21. `settings.json` 的 `agent` 字段设置默认 Forge agent `[2.1.157]`

**优化**：在 `.claude/settings.json` 中配置默认 agent：

```json
{"agent": "forge-build"}
```

从 `claude agents` dispatch 出来的 session 自动带上 Forge agent 配置（tools、disallowedTools、effort）。结合 §2.2 的门禁。

### 22. Agent frontmatter `mcpServers` 和 `hooks` `[2.1.117, 2.1.116]`

**优化**：Forge 的 agent 定义可以自带 MCP server 和 hook 配置：

```yaml
---
mcpServers:
  forge-context:
    command: node
    args: ["dist/src/mcp/server.js"]
hooks:
  PreToolUse:
    - matcher: "Write|Edit"
      args: ["node", "scripts/hooks/frozen-zone-check.mjs"]
---
```

每个 agent 自包含，不依赖全局配置。

### 23. Subagent 进度摘要缓存优化 `[2.1.128]`

**现状**：Forge 的 `/forge build` 同时运行多个 subagent（review 层），进度摘要频繁触发，消耗大量 token。

**优化**：2.1.128 修复了 subagent summary 在空闲时反复触发的问题（`capping worst-case token cost on idle sub-agents`）。确保 Forge 运行在 ≥2.1.128 可直接受益，无需代码修改。

### 24. `worktree.bgIsolation: "none"` 适配特殊仓库 `[2.1.143]`

**优化**：某些 monorepo 不支持 worktree。在 `.forge/config.md` 中增加配置，当 `worktree_impractical: true` 时自动设置 `worktree.bgIsolation: "none"`。

### 25. `CLAUDE_CODE_SUBAGENT_MODEL` 控制 agent 成本 `[2.1.147]`

**优化**：Forge 的 review subagent 不需要最强模型。在 agent frontmatter 或 settings 中设置 subagent 用更便宜的模型：

```json
{"env": {"CLAUDE_CODE_SUBAGENT_MODEL": "claude-sonnet-4-6"}}
```

review 用 Sonnet，decide 用 Opus，降低成本。

### 26. `subagent_type` case-insensitive matching `[2.1.140]`

**优化**：Agent tool 的 `subagent_type` 现在接受大小写和分隔符不敏感的值（如 `"Code Reviewer"` 解析为 `code-reviewer`）。Forge 的 agent 引用更灵活。

### 27. Subagent stalling detection `[2.1.113]`

**优化**：Subagent 如果 10 分钟无响应会自动失败并返回清晰错误，而非无限挂起。Forge 的 build subagent 直接受益。

### 28. `memory` frontmatter for agents `[2.1.33]`

**优化**：Agent 定义支持 `memory: project`，让每个 Forge agent 有独立的持久化记忆。例如 `security-check` agent 记住之前发现的安全模式。

### 29. `initialPrompt` frontmatter for agents `[2.1.83]`

**优化**：Agent 可以定义 `initialPrompt` 自动提交第一轮。Forge 的 `/forge build` agent 可以自动启动 "读取 plan 和 spec" 作为第一轮，无需等待用户输入。

### 30. `Task(agent_type)` 限制可 spawn 的 subagent `[2.1.33]`

**优化**：在 agent 定义的 `tools:` frontmatter 中限制可 spawn 的 subagent 类型。例如 `forge-review` agent 只允许 spawn `spec-check`、`quality-check`、`security-check`：

```yaml
---
tools:
  - Agent(spec-check)
  - Agent(quality-check)
  - Agent(security-check)
  - Read
  - Grep
  - Glob
---
```

### 31. Task 依赖追踪 `[2.1.16]`

**优化**：Forge 的 `/forge plan` 生成的任务列表可以利用 TaskUpdate 的 `addBlocks`/`addBlockedBy` 建立依赖关系。build 阶段按依赖拓扑排序执行。

### 32. Background session 保留 MCP/settings `[2.1.143]`

**优化**：Forge 的 `/forge build` 在 `/bg` 后台运行时，保留 forge-context MCP server 和 settings 配置。`/bg` 现在也保留 `--fallback-model` 和 `--allow-dangerously-skip-permissions`。

---

## 三、Workflow 动态编排优化

### 33. Dynamic Workflows — 从固定脚本到动态扩展 `[2.1.154]` 🚀

**现状**：Forge 的 `multi-agent-review.js` 是固定的三路并行评审。

**优化**：Dynamic workflow 允许 Claude 根据任务复杂度动态生成编排脚本：
- 小 PR → 3 个 reviewer
- 大 PR → 自动扩展到 5-10 个 reviewer，每个聚焦不同文件/模块
- 安全敏感 PR → 自动增加 security reviewer 数量

**配置**：在 `/config` 中关闭 "Workflow keyword trigger" 防止误触发，让 Forge 自己控制何时使用 workflow。

### 34. `claude ultrareview` 用于 CI 集成 `[2.1.120]`

**优化**：Forge 的 `/forge review` 可以在 CI 中通过 `claude ultrareview --json` 非交互运行：

```yaml
# .github/workflows/forge-review.yml
- run: claude ultrareview --json > review-report.json
```

`exit 1` 表示有发现，`exit 0` 表示通过。

### 35. Workflow 进度显示优化 `[2.1.152]`

**优化**：`Simplified the Workflow tool's inline progress display` — Forge workflow 不再刷屏 agent 数量，只在持久状态行显示。Forge 的 `/forge build` 输出更干净。

---

## 四、Plugin 系统优化

### 36. `.claude/skills` 自动加载 — 简化 Forge 安装 `[2.1.157]`

**现状**：Forge 的 skills 放在项目根目录 `skills/` 和 `.claude-plugin/` 中，需要通过 plugin.json 注册。

**优化**：将核心 skill 迁移到 `.claude/skills/` 目录，**自动加载，无需 marketplace**。`forge init` 只需复制文件即可，降低安装门槛。

### 37. `claude plugin init` — 脚手架 `[2.1.157]`

**优化**：`/forge learn` 提取的经验可以包装成 plugin。这个脚手架降低了从 knowledge → plugin 的门槛。

### 38. `defaultEnabled: false` — Agent Teams 默认禁用 `[2.1.154]`

**现状**：CLAUDE.md 说 "Agent Teams 为可选 Tier-1 模式（非默认）"，但没有技术手段强制。

**优化**：将 `decide-teams` 封装为 plugin 并设置 `defaultEnabled: false`：

```json
{"name": "forge-decide-teams", "defaultEnabled": false}
```

用户必须 `claude plugin enable forge-decide-teams` 才能用，防止新手误入高 token 模式。

### 39. Plugin `monitors` — 持续后台监控 `[2.1.105]`

**优化**：Forge 的 evolved-rules（13 条错误预防规则）可以封装为 monitor plugin，在 session 开始时自动检查：

```json
{"monitors": ["./monitors/evolved-rules-guard.json"]}
```

### 40. `alwaysLoad` MCP 配置 — forge-context 即时可用 `[2.1.121]`

**现状**：Forge 的 MCP server（forge-context）可能被 tool-search deferral 延迟加载。

**优化**：

```json
{"mcpServers": {"forge-context": {"alwaysLoad": true}}}
```

确保 `forge_git`、`forge_context` 等工具在任何时候都可用，不会被延迟发现。

### 41. Plugin dependency enforcement `[2.1.143]`

**优化**：`claude plugin disable` 拒绝当另一个 plugin 依赖它时。`claude plugin enable` 自动启用传递依赖。Forge 的 plugin 依赖链更安全。

### 42. `SKILL.md` root-level plugin `[2.1.142]`

**优化**：Plugins 只有根目录 `SKILL.md` 而无 `skills/` 子目录时，也能被识别为 skill。Forge 的轻量 skill 可以用这种简化结构。

### 43. `${CLAUDE_PLUGIN_DATA}` 插件持久化数据 `[2.1.78]`

**优化**：Forge plugin 的持久化状态（如知识库缓存）存储在独立目录中，更新 plugin 时不会丢失。

### 44. `source: 'settings'` 内联 plugin 声明 `[2.1.80]`

**优化**：在 settings.json 中直接声明 plugin 条目，无需 marketplace。

### 45. `managed-settings.d/` drop-in 目录 `[2.1.83]`

**优化**：企业管理员可以为 Forge 配置独立的策略片段（`.json` 文件按字母序合并），与其他工具的策略分开管理。

---

## 五、性能 & Context 优化

### 46. Lean System Prompt — 更多 Context 给 Forge `[2.1.154]`

**优化**：Lean prompt 现在默认启用（Opus 4.8、Sonnet 4.6+），减少了 Claude Code 自身的 system prompt 开销。Forge 的 agent 定义（`.claude/agents/` 中详细指令）获得更多 context window。

### 47. Streaming tool execution 始终启用 `[2.1.154]`

**优化**：Forge 的 `/forge build` 在 TDD 循环中频繁调用 Bash。Streaming 意味着长时间运行的测试命令可以实时看到输出，不再需要等命令结束才能查看。对 §2.1 TDD 的 RED 阶段调试体验提升明显。

### 48. `ENABLE_PROMPT_CACHING_1H` — 长时间 build 会话省钱 `[2.1.108]`

**优化**：Forge 的 `/forge build` 经常超过 5 分钟。启用 1 小时 prompt cache TTL：

```json
{"env": {"ENABLE_PROMPT_CACHING_1H": "1"}}
```

每次 TDD 循环的重复 system prompt 部分（CLAUDE.md、agent 定义）命中缓存，节省大量 token。

### 49. `/resume` 大会话 67% 加速 `[2.1.116]`

**优化**：Forge 的 `/forge resume` 恢复大型 build 会话时显著加快。`/resume` 还会在大会话前主动建议 summarize。

### 50. Reactive compaction improvement `[2.1.142]`

**优化**：第一次 summarize 尝试现在从原始请求的 overflow size 开始，避免在近乎满 context 时的浪费重试。Forge 的长 build 会话更稳定。

### 51. Compaction 保留敏感用户指令 `[2.1.139]`

**优化**：Forge 的 CLAUDE.md 宪法作为 "敏感用户指令" 在 compaction 时被保留。结合 PreCompact hook（第 2 点），确保 Forge 铁律不会在长会话中被压缩丢失。

### 52. `--bare` flag 用于 CI/脚本 `[2.1.81]`

**优化**：`claude -p --bare` 跳过 hooks、LSP、plugin sync、skill walks。Forge 的 CI 集成（如 `claude ultrareview`）可以用 `--bare` 减少启动时间。

### 53. `--exclude-dynamic-system-prompt-sections` `[2.1.98]`

**优化**：在 `-p` 模式下排除动态 system prompt sections，提高跨用户的 prompt cache 命中率。Forge 的 CI 脚本可以启用。

### 54. `MCP_CONNECTION_NONBLOCKING=true` `[2.1.89]`

**优化**：在 `-p` 模式下完全跳过 MCP 连接等待。Forge 的非交互式命令（如 `claude ultrareview`）启动更快。

---

## 六、Worktree & 分支优化

### 55. `worktree.baseRef` — 保持 `fresh` 确保纯净起点 `[2.1.133]`

**现状**：Forge §2.2 要求分支隔离。`EnterWorktree` 默认从 `origin/<default-branch>` 创建分支。

**决策：保持 `fresh`**（当前配置无需修改）

理由：
1. **与 §2.2 门禁哲学一致** — 门禁要求工作树干净，`fresh` 每次从已审代码的纯净起点开始，与"分支隔离"语义最匹配
2. **安全边界更强** — 不会意外带入本地实验性 commit 或未审代码
3. **CI 可复现** — build 基于 `origin/main`（已通过 CI 的代码），而非本地未推送的 WIP
4. **2.1.133 故意改回 `fresh` 为默认** — Anthropic 经过实践认为 `fresh` 更安全
5. **连续迭代的替代方案** — 如需在第 1 轮 build 的修复 commit 上继续，应先 `git push` 再 build，而非依赖 `head` 携带未审代码

```json
// 当前配置（保持不变）
{"worktree": {"baseRef": "fresh"}}
```

> ⚠️ `head` 适用场景：无门禁的迭代开发项目。不推荐用于有 §2.2 门禁约束的 Forge 工作流。

### 56. `EnterWorktree` mid-session 切换 `[2.1.157]`

**优化**：Forge 的 `/forge build` 可以在同一会话中处理多个 feature，通过 `EnterWorktree` 的 `path` 参数切换到已有 worktree，不必新建会话。

### 57. Worktree 完成后自动解锁 `[2.1.157]`

**优化**：Forge 的 `/forge ship` 清理 worktree 时不再被锁阻断。`.claude/worktrees/` 下的 worktree 在 agent 完成后自动解锁。

### 58. Worktree 清理安全性 `[2.1.143]`

**优化**：`git worktree remove` 失败时不再 fallback 到 `rm -rf`，防止丢失 gitignored 或 in-progress 文件。Forge 的 ship 清理更安全。

### 59. `worktree.sparsePaths` 大 monorepo 优化 `[2.1.76]`

**优化**：大 monorepo 中 worktree 只 checkout 需要的目录。Forge 可以在 `.forge/config.md` 中配置 `sparsePaths`，减少 worktree 创建时间和磁盘占用。

---

## 七、Review & 质量优化

### 60. `/code-review --fix` 自动修复 `[2.1.152]`

**优化**：Forge 的 `/forge review` 后可以自动调用 `/code-review --fix` 应用 reuse/simplification/efficiency 修复建议。这可以作为 `/forge review` 的可选增强步骤。

### 61. `/simplify` 作为 post-review 清理 `[2.1.154]`

**优化**：`/simplify` 现在做 cleanup-only（不再做 bug hunting），与 Forge review Layer 2 互补。在 `/forge review` 通过后运行 `/simplify` 做代码清理。

### 62. `/usage` per-category 细分 `[2.1.149]`

**优化**：Forge 可以通过 `/usage` 追踪每个 skill、subagent、MCP server 的成本。在 `/forge learn` 中自动收集这些数据作为知识库输入。

### 63. GFM task list checkboxes `[2.1.149]`

**优化**：Markdown 输出现在渲染 GFM task list checkboxes（`- [ ] todo` / `- [x] done`）。Forge 的 plan 和 progress 文件中的 checkbox 更直观。

---

## 八、安全强化

### 64. Subagent MCP 策略执行修复 `[2.1.153]`

**现状**：Subagent 的 frontmatter MCP server 会绕过 `--strict-mcp-config` 和 managed-settings 的 allow/deny 策略。

**优化**：2.1.153 修复了这个问题。Forge 的 review subagent 不再能绕过项目的 MCP 安全策略。**确保运行 ≥2.1.153**。

### 65. `settings.autoMode.hard_deny` — 无条件阻断 `[2.1.136]`

**优化**：Forge 可以定义无论用户意图如何都必须阻断的 auto-mode 规则：

```json
{"autoMode": {"hard_deny": ["rm -rf /", "git push --force *"]}}
```

### 66. Bash deny rules 匹配 exec wrapper `[2.1.113]`

**优化**：`env`/`sudo`/`watch`/`ionice`/`setsid` 包装的命令现在也会匹配 deny 规则。Forge 的安全策略不再被这些 wrapper 绕过。

### 67. `claude mcp list` 不再 auto-approve `[2.1.154]`

**优化**：未审批的 `.mcp.json` server 显示为 `⏸ Pending approval` 而非静默连接。Forge 的 MCP 安全边界更严格。

### 68. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` 清理子进程环境 `[2.1.83]`

**优化**：从 Bash、hooks、MCP 的子进程环境中清除 Anthropic 和云厂商凭证。Forge 的安全级别 1 可以默认启用。

### 69. `sandbox.failIfUnavailable` sandbox 不可用时阻断 `[2.1.83]`

**优化**：当 sandbox 启用但依赖缺失时直接退出，而非静默降级为无沙箱。Forge 可以在 CI 中启用，确保安全边界不被绕过。

### 70. `CLAUDE_CODE_SCRIPT_CAPS` 限制脚本调用次数 `[2.1.98]`

**优化**：限制每个 session 的脚本调用次数，防止无限循环（与 §2.4 Three-Strike Reroute 互补）。

---

## 九、可观测性

### 71. OTEL `agent_id`/`parent_agent_id` 追踪 `[2.1.145]`

**优化**：Forge 的 subagent 层级现在可以在 OTEL trace 中可视化。decide → architect → critic 的调用链完整可追踪。

### 72. OTEL `tool_decision` with parameters `[2.1.157]`

**优化**：当 `OTEL_LOG_TOOL_DETAILS=1` 时，tool_decision 事件包含 bash commands、MCP/skill names。Forge 可以详细追踪每个工具调用。

### 73. Status line 增强 `[2.1.153, 2.1.145, 2.1.119]`

**优化**：Forge 的 status line 脚本现在能获取：
- `COLUMNS`/`LINES` — 按终端宽度调整输出
- GitHub repo/PR 信息 — 显示当前 PR 状态
- `effort.level`/`thinking.enabled` — 实时显示 Forge 的工作模式
- `rate_limits` — 显示 rate limit 使用百分比和重置时间

### 74. `OTEL` `duration_ms` in tool events `[2.1.119]`

**优化**：`tool_result` 和 `tool_decision` 事件包含 `tool_use_id` 和 `tool_input_size_bytes`。Forge 可以精确追踪每个 build 步骤的执行时间。

---

## 十、关键 Bug 修复（直接影响 Forge）

### 75. `TaskList` 按 ID 排序 `[2.1.119]`

**影响**：Forge 的 `/forge build` 依赖 TaskList 按序执行任务。之前返回文件系统随机顺序，可能导致依赖关系混乱。**必须 ≥2.1.119**。

### 76. Agent Teams 非 ASCII 名字修复 `[2.1.145]`

**影响**：Forge 的 subagent 名称和 agent 定义文件注释包含中文。**必须 ≥2.1.145**。

### 77. `Agent` tool `claude` subagent worktree 数据丢失修复 `[2.1.153]`

**影响**：`subagent_type: 'claude'` 之前在临时 worktree 中运行，可能丢弃 gitignored 文件。Forge 的 build subagent 直接受益。

### 78. `worktree.baseRef: "head"` 在 worktree 内正确解析 `[2.1.154]`

**影响**：之前从 linked worktree 内调用 `EnterWorktree` 会错误使用 main checkout 的 HEAD。修复后 Forge 在 worktree 内继续开发正确。

### 79. Opus 4.8 thinking block 修复 `[2.1.156]`

**影响**：使用 Opus 4.8 时 thinking block 被修改导致 API 错误。Forge 如果使用 Opus 4.8，**必须 ≥2.1.156**。

### 80. CLAUDE.md HTML comments hidden from auto-inject `[2.1.72]`

**影响**：CLAUDE.md 中的 HTML 注释（`<!-- ... -->`）在自动注入时被隐藏，但 Read 工具仍可见。Forge 的 CLAUDE.md 包含 HTML 注释（如 `<important>` 标签），这些现在不会浪费 context。

---

## 十一、其他有价值的特性

### 81. Opus 4.8 + xhigh effort `[2.1.154, 2.1.111]`

Forge 的 `/forge decide`（Full tier）需要多视角深度分析。Opus 4.8 + `xhigh` effort 显著提升 decide 阶段的产品、架构、安全三视角评审质量。Forge 可以在 agent frontmatter 中设置 `effort: xhigh` 给 decide subagent。

### 82. Fast mode Opus 4.8 cost reduction `[2.1.154]`

Fast mode on Opus 4.8 现在只需 2x 标准费率即可获得 2.5x 速度。Forge 的 `/forge build` TDD 循环可以用 fast mode 加速。

### 83. `claude agents` `! <command>` `[2.1.154]`

在 `claude agents` 中输入 `! <command>` 可以把 shell 命令作为后台 session 运行。Forge 的 `/forge test` 阶段可以 `! npm test` 在后台跑测试。

### 84. `/goal` 命令 `[2.1.139]`

Forge 的 `/forge build` 可以内部使用 `/goal` 机制，设置 "所有 plan 任务完成 + 测试通过" 为目标，让 Claude 自动循环直到满足。Shows live elapsed/turns/tokens overlay。

### 85. Session recap `[2.1.108]`

返回 session 时自动提供上下文摘要。Forge 的 `/forge resume` 体验更好，用户回到长时间 build 会话时能快速理解当前状态。

### 86. `/reload-skills` 无需重启 `[2.1.152]`

Forge 动态安装新 skill 后不需要重启会话。`SessionStart` hook 返回 `reloadSkills: true` 即可即时生效。

### 87. `/model` saves as default `[2.1.153]`

Forge 可以在 decide 阶段切换到 Opus 4.8，设为默认后后续 build 阶段也用同模型。

### 88. `--from-pr` PR 会话恢复 `[2.1.27]`

`/forge review` 可以直接从 PR URL 恢复会话，自动加载 PR 上下文。

### 89. Session auto-linked to PR `[2.1.27]`

`gh pr create` 后自动关联 session 到 PR。Forge 的 `/forge ship` 可以利用这个关联。

### 90. `CLAUDE_CODE_SIMPLE` 最小化模式 `[2.1.50]`

禁用 MCP、hooks、CLAUDE.md。Forge 的某些轻量操作（如 `scripts/check-*.mjs`）可以在此模式下运行。

---

## Top 20 优先级排序

| # | 优化项 | 版本要求 | 影响域 | 工作量 | 状态 |
|---|--------|----------|--------|--------|------|
| **1** | `disallowed-tools` 限制 review agent 工具集 | ≥2.1.152 | §3.1 隔离 | 改 3 个 agent 文件 | 🔴 待做 |
| **2** | `PreCompact` hook 保护 Forge 进度状态 | ≥2.1.105 | §6 上下文不丢失 | 1 个新 hook 脚本 | 🔴 待做 |
| **3** | `PostCompact` hook 重新注入配置 | ≥2.1.76 | §2.5 context refresh | 1 个新 hook 脚本 | 🔴 待做 |
| **4** | `continueOnBlock` 引导式修复 | ≥2.1.139 | §2.2 门禁 | 改 frozen-zone hook | 🔴 待做 |
| **5** | `ENABLE_PROMPT_CACHING_1H` 省钱 | ≥2.1.108 | 成本 | 1 行 env | 🟢 1 行配置 |
| **6** | `worktree.baseRef: "fresh"` 保持纯净起点 | ≥2.1.133 | §2.2 分支隔离 | 0（当前已是 fresh） | ✅ 已是最佳配置 |
| **7** | Dynamic Workflows 评估 POC | ≥2.1.154 | L0 fallback | 调研+POC | 🟡 需调研 |
| **8** | Hook exec form 迁移 | ≥2.1.139 | 安全+性能 | 中（改 settings.json） | 🟡 中等工作量 |
| **9** | MCP `alwaysLoad: true` | ≥2.1.121 | 工具可用性 | 1 行配置 | 🟢 1 行配置 |
| **10** | `.claude/skills` 自动加载 | ≥2.1.157 | 安装简化 | 中（迁移目录结构） | 🟡 中等工作量 |
| **11** | `settings.json` agent 字段 | ≥2.1.157 | §2.2 门禁 | 1 行配置 | 🟢 1 行配置 |
| **12** | `TaskList` 排序修复 | ≥2.1.119 | §2.3 验证 | 0（升级即可） | ⚪ 升级解决 |
| **13** | Subagent MCP 策略修复 | ≥2.1.153 | §3.3 安全 | 0（升级即可） | ⚪ 升级解决 |
| **14** | `defaultEnabled: false` Agent Teams | ≥2.1.154 | Agent Teams opt-in | 封装 plugin | 🔴 待做 |
| **15** | `initialPrompt` 自动启动 agent | ≥2.1.83 | DX 优化 | 改 agent frontmatter | 🟢 极小 |
| **16** | `memory` frontmatter agent 持久记忆 | ≥2.1.33 | §4 knowledge | 改 agent frontmatter | 🟢 极小 |
| **17** | `CLAUDE_CODE_SUBAGENT_MODEL` 成本控制 | ≥2.1.147 | 成本 | 1 行 env | 🟢 1 行配置 |
| **18** | `sandbox.failIfUnavailable` CI 安全 | ≥2.1.83 | CI 集成 | 1 行 env | 🟢 1 行配置 |
| **19** | `ConfigChange` + `FileChanged` hook | ≥2.1.83, 2.1.49 | 热配置 | 2 个新 hook 脚本 | 🔴 待做 |
| **20** | `CwdChanged` hook 环境管理 | ≥2.1.83 | DX 优化 | 1 个新 hook 脚本 | 🔴 待做 |

### 术语说明

- 🔴 待做 — 需要编写新脚本或修改多个文件
- 🟡 中等工作量 — 需要迁移或重构
- 🟢 1 行配置 — 只需在 settings.json 或 env 中添加/修改 1 行
- ⚪ 升级解决 — 升级 Claude Code 版本即可，无需修改 Forge 代码

---

## 快速行动清单（可立即执行的配置变更）

以下优化只需修改配置文件，无需编写代码：

```jsonc
// .claude/settings.json 追加/修改
{
  // #5: 1小时 prompt cache
  "env": {
    "ENABLE_PROMPT_CACHING_1H": "1",
    // #17: review subagent 用 Sonnet 省钱
    "CLAUDE_CODE_SUBAGENT_MODEL": "claude-sonnet-4-6"
  },

  // #6: worktree 从 origin/<default> 创建（保持 fresh，与 §2.2 门禁一致）
  "worktree": {
    "baseRef": "fresh"
  },

  // #11: 默认使用 forge-build agent
  "agent": "forge-build",

  // MCP 配置
  "mcpServers": {
    // #9: forge-context 即时可用
    "forge-context": {
      "alwaysLoad": true
    }
  }
}
```

```jsonc
// CI 环境变量（.github/workflows/forge-review.yml）
{
  "env": {
    // #18: sandbox 不可用时阻断
    "CLAUDE_CODE_SUBPROCESS_ENV_SCRUB": "1",
    // #52: CI 模式跳过非必要初始化
    // "CLAUDE_CODE_SIMPLE": "1"  // 如需最小化
  }
}
```

---

*文档生成时间：2026-05-30 | 基于 Claude Code CHANGELOG 2.1.0–2.1.157 全量分析*
