# Claude Code CHANGELOG (2.1.0–2.1.161) — Forge 优化建议与落地可行性报告

> 基于 Claude Code CHANGELOG 全量分析（2.1.0 → 2.1.161），结合 Forge 项目代码库结构，按影响域分类的 98 个优化点。
> 2.1.158–161 增补见文末「十五、2.1.158–161 增补分析」。
> **关键区分**：`plugin.json`（分发给用户的出厂配置）vs `.claude/settings.json`（Forge 项目自身开发配置）。
> 生成时间：2026-05-30 | v3 用户决策版

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
- [十二、落地可行性分析](#十二落地可行性分析)
- [十三、优先级排序与用户决策](#十三优先级排序与用户决策)
- [十四、风险评估与实施计划](#十四风险评估与实施计划)
- [十五、2.1.158–161 增补分析](#十五21158161-增补分析2026-06-03)

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

### 2. `PreCompact` hook 保护 Forge 进度状态 `[2.1.105]` ✅ 已出厂预置

**现状**：Forge §6 要求 "阶段间上下文交接通过 `.forge/` 目录文件系统进行"。但 context compaction 可能丢失关键的进度状态。

**状态**：✅ `plugin.json` 已注册 `"PreCompact": [{"hooks": [{"args": ["bash", ".../hook-precompact.sh"], "timeout": 5}]}]`

### 3. `PostCompact` hook 重新注入 Forge 配置 `[2.1.76]` ✅ 已出厂预置

**现状**：compaction 后 Forge 的宪法（CLAUDE.md）和 evolved-rules 可能被压缩丢失。

**状态**：✅ `plugin.json` 已注册 `"PostCompact": [{"hooks": [{"args": ["bash", ".../hook-postcompact.sh"], "timeout": 5}]}]`

### 4. `continueOnBlock` 让门禁引导式修复 `[2.1.139]` ✅ 已出厂预置

**现状**：Forge 的 frozen zone hook 拒绝写操作时，直接中断，agent 不知道原因。

**状态**：✅ `plugin.json` PostToolUse check-context-boundary 已使用 `"continueOnBlock": true`

### 5. `MessageDisplay` hook 优化 Forge 输出展示 `[2.1.152]` ✅ 已出厂预置

**状态**：✅ `plugin.json` 已注册，使用 `args` 形式，timeout 2s

### 6. Hook exec form 消除 shell 注入风险 `[2.1.139]` 🟡 plugin.json 大部分已完成

**现状**：`plugin.json` 大部分 hook 已使用 `args` 数组形式。仅 Stop 和 PostToolUse/TeammateIdle/TaskCompleted 中的 6 个 inline shell 逻辑仍用 `command`。

**优化**：将剩余 6 个 `command` hook 包装为独立脚本后迁移到 `args`。

### 7. `terminalSequence` 实现 Forge 阶段通知 `[2.1.141]`

**优化**：Forge 的 `/forge build` 阶段切换时，hook 可以通过 `terminalSequence` 发出桌面通知。

### 8. `type: "mcp_tool"` hook 直接调用 forge-context `[2.1.118]`

**优化**：Forge 的某些 hook 逻辑可以通过 `type: "mcp_tool"` 直接调用 forge-context MCP 工具，跳过进程启动开销。

### 9. `SessionStart` hook 自动命名 + 热加载 `[2.1.152]` ✅ 已出厂预置

**状态**：✅ `inject-evolved-rules.mjs` 已实现 `sessionTitle` + `reloadSkills: true`

### 10. `CwdChanged` 和 `FileChanged` hook `[2.1.83]` ✅ 已出厂预置

**状态**：✅ `plugin.json` 已注册两个 hook，使用 `args` 形式

### 11. `ConfigChange` hook `[2.1.49]` 🟠 确认实施

**优化**：配置文件变化时触发。监听 `.forge/config.md` 和 `.claude/settings.json` 的变化，输出提示。

**实施计划**：新建 `scripts/config-changed-hook.mjs` + 注册到 `plugin.json`

### 12. `TaskCreated` hook `[2.1.84, 2.1.89]`

**优化**：Forge 的 `/forge build` 创建 TaskCreate 时触发。注入 plan 上下文，确保每个 task 都有 plan 信息。

### 13. `WorktreeCreate`/`WorktreeRemove` hook `[2.1.49, 2.1.50]`

**优化**：worktree 创建/删除时触发。Forge 可以在这里记录 `.forge/progress/` 中的 worktree 状态。

### 14. `TeammateIdle` 和 `TaskCompleted` hook `[2.1.33]` ✅ 已出厂预置

**状态**：✅ `plugin.json` 已注册

### 15. `StopFailure` hook `[2.1.78]`

**优化**：turn 因 API 错误（rate limit、auth failure）结束时触发。记录错误到 `.forge/debug/`，供 `/forge debug` 分析。

### 16. `PermissionDenied` hook `[2.1.89]`

**优化**：auto mode 拒绝操作后触发，可返回 `{retry: true}` 让模型重试。

### 17. `InstructionsLoaded` hook `[2.1.69]` ❌ 不推荐

**原因**：收益有限，仅记录加载状态。

### 18. Hook `if` 条件过滤减少进程开销 `[2.1.85]` ✅ 已出厂预置

**状态**：✅ `plugin.json` 已使用 `"if": "Bash(git commit*)"` 和 `"if": "exists(.forge/status.md)"`

### 19. Hook `duration_ms` 在 PostToolUse `[2.1.119]`

**优化**：PostToolUse hook 输出现在包含 `duration_ms`。Forge 可以追踪每个 build 步骤的执行时间。

### 20. Hook output >50K 自动存盘 `[2.1.89]` ✅ 运行时行为

---

## 二、Agent & Subagent 系统优化

### 21. `settings.json` 的 `agent` 字段设置默认 Forge agent `[2.1.157]` ❌ 不推荐

**原因**：会影响所有 claude 会话（包括非 Forge 用法）。用户安装 Forge 是为了增强，不是替换。

### 22. Agent frontmatter `mcpServers` 和 `hooks` `[2.1.117, 2.1.116]`

**优化**：每个 agent 自包含 MCP server 和 hook 配置，不依赖全局。当前优先级低，全局配置已满足需求。

### 23. Subagent 进度摘要缓存优化 `[2.1.128]` ✅ 运行时行为

### 24. `worktree.bgIsolation: "none"` 适配特殊仓库 `[2.1.143]`

### 25. `CLAUDE_CODE_SUBAGENT_MODEL` 控制 agent 成本 `[2.1.147]` ❌ 不推荐

**原因**：全局 env 会覆盖 agent frontmatter 的细粒度 model 选择（sonnet/haiku/inherit）。

### 26. `subagent_type` case-insensitive matching `[2.1.140]` ✅ 运行时行为

### 27. Subagent stalling detection `[2.1.113]` ✅ 运行时行为

### 28. `memory` frontmatter for agents `[2.1.33]`

**现状**：6/19 个 agent 已有 `memory: project`（forge-decide-*）。推荐为 forge-review、forge-build、forge-plan、security 添加。

### 29. `initialPrompt` frontmatter for agents `[2.1.83]`

**现状**：6/19 个 agent 已有。推荐为 forge-build、forge-plan、forge-review 添加。

### 30. `Task(agent_type)` 限制可 spawn 的 subagent `[2.1.33]`

### 31. Task 依赖追踪 `[2.1.16]` ✅ 已在使用

### 32. Background session 保留 MCP/settings `[2.1.143]` ✅ 运行时行为

---

## 三、Workflow 动态编排优化

### 33. Dynamic Workflows — 从固定脚本到动态扩展 `[2.1.154]` 🚀 🟠 确认实施

**现状**：Forge 的 `multi-agent-review.js` 是固定的三路并行评审。

**优化**：Dynamic workflow 允许 Claude 根据任务复杂度动态生成编排脚本：
- 小 PR → 3 个 reviewer
- 大 PR → 自动扩展到 5-10 个 reviewer
- 安全敏感 PR → 自动增加 security reviewer 数量

**实施计划**：新建 `.claude/workflows/dynamic-review-poc.js` POC 脚本 + 产出 ADR

### 34. `claude ultrareview` 用于 CI 集成 `[2.1.120]` 🟠 确认实施

**实施计划**：增强 `scripts/run-ci-ultrareview.sh`：提取 per-file findings（file/line/severity/category），添加 `--strict` 模式（P1 也阻断 CI）

### 35. Workflow 进度显示优化 `[2.1.152]` ✅ 运行时行为

---

## 四、Plugin 系统优化

### 36. `.claude/skills` 自动加载 — 简化 Forge 安装 `[2.1.157]` ❌ 不推荐

**原因**：丢失 plugin.json 的 MCP server、hooks、userConfig 能力。`.claude/skills/` 适合轻量 skill，不适合 Forge 框架级插件。

### 37. `claude plugin init` — 脚手架 `[2.1.157]` ❌ 不需要

### 38. Agent Teams 双模式并行 `[2.1.154]` 🟠 确认实施

**设计决策**：`decide_dispatch_mode` 新增 `auto` 值——Full tier 自动用 Agent Teams（5 视角 teammate），Standard/Light 用 inline。

**实施计划**：修改 decide/instructions.md + router/instructions.md + `.forge/config.md`

### 39. Plugin `monitors` — 持续后台监控 `[2.1.105]`

### 40. `alwaysLoad` MCP 配置 — forge-context 即时可用 `[2.1.121]`

**优化**：在 plugin.json 的 mcpServers 中添加 `"alwaysLoad": true`（需验证支持）

### 41. Plugin dependency enforcement `[2.1.143]` ✅ 运行时行为

### 42. `SKILL.md` root-level plugin `[2.1.142]` ✅ 已实现

### 43. `${CLAUDE_PLUGIN_DATA}` 插件持久化数据 `[2.1.78]` 🟠 确认实施

**实施计划**：提取共用路径解析函数，迁移知识库缓存到 `${CLAUDE_PLUGIN_DATA}/forge/`

### 44. `source: 'settings'` 内联 plugin 声明 `[2.1.80]` ❌ 不需要

### 45. `managed-settings.d/` drop-in 目录 `[2.1.83]` ❌ 不需要

---

## 五、性能 & Context 优化

### 46. Lean System Prompt `[2.1.154]` ✅ 运行时行为

### 47. Streaming tool execution `[2.1.154]` ✅ 运行时行为

### 48. `ENABLE_PROMPT_CACHING_1H` `[2.1.108]`

**优化**：需 `forge init` 写入用户 settings.json。最高 ROI 配置项之一。

### 49. `/resume` 大会话 67% 加速 `[2.1.116]` ✅ 运行时行为

### 50. Reactive compaction improvement `[2.1.142]` ✅ 运行时行为

### 51. Compaction 保留敏感用户指令 `[2.1.139]` ✅ 运行时行为

### 52. `--bare` flag 用于 CI/脚本 `[2.1.81]`

### 53. `--exclude-dynamic-system-prompt-sections` `[2.1.98]`

### 54. `MCP_CONNECTION_NONBLOCKING=true` `[2.1.89]`

---

## 六、Worktree & 分支优化

### 55. `worktree.baseRef` — 保持 `fresh` 确保纯净起点 `[2.1.133]` ✅ 已是最佳配置

**决策：保持 `fresh`**

理由：
1. **与 §2.2 门禁哲学一致** — 门禁要求工作树干净，`fresh` 每次从已审代码的纯净起点开始
2. **安全边界更强** — 不会意外带入本地实验性 commit
3. **CI 可复现** — build 基于 `origin/main`（已通过 CI 的代码）
4. **2.1.133 故意改回 `fresh` 为默认** — Anthropic 经过实践认为 `fresh` 更安全
5. **连续迭代的替代方案** — 先 `git push` 再 build

> ⚠️ `head` 适用场景：无门禁的迭代开发项目。不推荐用于有 §2.2 门禁约束的 Forge 工作流。

### 56. `EnterWorktree` mid-session 切换 `[2.1.157]`

### 57. Worktree 完成后自动解锁 `[2.1.157]` ✅ 运行时行为

### 58. Worktree 清理安全性 `[2.1.143]` ✅ 运行时行为

### 59. `worktree.sparsePaths` 大 monorepo 优化 `[2.1.76]`

---

## 七、Review & 质量优化

### 60. `/code-review --fix` 自动修复 `[2.1.152]` 🟠 确认实施

**设计决策**：自动执行。P2/P3 → 自动 `/code-review --fix` + 独立 commit；P0/P1 → 不自动 fix，阻断 ship。

### 61. `/simplify` 作为 post-review 清理 `[2.1.154]` 🟠 确认实施

**设计决策**：自动执行。review 通过后自动 `/simplify` + 独立 commit。

### 62. `/usage` per-category 细分 `[2.1.149]` 🟠 确认实施

**实施计划**：集成到 `/forge learn`，运行 `/usage` 获取成本数据，写入 knowledge metadata。

### 63. GFM task list checkboxes `[2.1.149]` ✅ 运行时行为

---

## 八、安全强化

### 64. Subagent MCP 策略执行修复 `[2.1.153]` ✅ 确保版本满足

### 65. `settings.autoMode.hard_deny` — 无条件阻断 `[2.1.136]` ✅ 已配置

### 66. Bash deny rules 匹配 exec wrapper `[2.1.113]` ✅ 运行时行为

### 67. `claude mcp list` 不再 auto-approve `[2.1.154]` ✅ 运行时行为

### 68. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` 清理子进程环境 `[2.1.83]`

**优化**：需 `forge init` 写入用户 settings.json。

### 69. `sandbox.failIfUnavailable` sandbox 不可用时阻断 `[2.1.83]` 🟠 确认实施

**实施计划**：在 `.github/workflows/ci.yml` 中添加 sandbox 配置。

### 70. `CLAUDE_CODE_SCRIPT_CAPS` 限制脚本调用次数 `[2.1.98]`

---

## 九、可观测性

### 71. OTEL `agent_id`/`parent_agent_id` 追踪 `[2.1.145]`

### 72. OTEL `tool_decision` with parameters `[2.1.157]`

### 73. Status line 增强 `[2.1.153, 2.1.145, 2.1.119]`

### 74. `OTEL` `duration_ms` in tool events `[2.1.119]`

---

## 十、关键 Bug 修复（直接影响 Forge）

| # | 修复项 | 最低版本 |
|---|--------|----------|
| §75 | `TaskList` 按 ID 排序 | ≥2.1.119 |
| §76 | Agent Teams 非 ASCII 名字修复 | ≥2.1.145 |
| §77 | Agent worktree 数据丢失修复 | ≥2.1.153 |
| §78 | `worktree.baseRef: "head"` 在 worktree 内解析 | ≥2.1.154 |
| §79 | Opus 4.8 thinking block 修复 | ≥2.1.156 |
| §80 | CLAUDE.md HTML comments hidden | ≥2.1.72 |

**建议**：确认 Claude Code 版本 ≥2.1.157 即可覆盖所有修复。

---

## 十一、其他有价值的特性

### 81. Opus 4.8 + xhigh effort `[2.1.154, 2.1.111]`

Forge 可以在 agent frontmatter 中设置 `effort: xhigh` 给 decide subagent。

### 82. Fast mode Opus 4.8 cost reduction `[2.1.154]` ✅ 运行时行为

### 83. `claude agents` `! <command>` `[2.1.154]`

### 84. `/goal` 命令 `[2.1.139]` 🟠 确认实施

**设计决策**：替代 `persistent-loop.sh`。`/goal` 接管 build 内 TDD 循环，persistent-loop.sh 仅保留 phase transition 职责。

### 85. Session recap `[2.1.108]` ✅ 运行时行为

### 86. `/reload-skills` 无需重启 `[2.1.152]` ✅ 已实现

### 87. `/model` saves as default `[2.1.153]` ✅ 运行时行为

### 88. `--from-pr` PR 会话恢复 `[2.1.27]` 🟠 确认实施

**实施计划**：集成到 `/forge review` 和 `/forge ship`，使用已有 `scripts/resume-from-pr.mjs`。

### 89. Session auto-linked to PR `[2.1.27]` ✅ 运行时行为

### 90. `CLAUDE_CODE_SIMPLE` 最小化模式 `[2.1.50]`

---

## 十二、落地可行性分析

### plugin.json vs settings.json 关键发现

| 维度 | plugin.json（用户侧） | settings.json（开发侧） |
|------|----------------------|------------------------|
| **Hook 注册** | 12 类事件、30+ 个 hook | 8 类事件、~11 个 hook |
| **Hook 格式** | 大部分使用 `args` 数组形式 | 100% 使用 `command` 字符串形式 |
| **`if` 条件** | 已使用 | 未使用 |
| **`continueOnBlock`** | 已使用 | 未使用 |
| **PreCompact/PostCompact** | ✅ 已注册 | ❌ 未注册 |
| **MessageDisplay/CwdChanged/FileChanged** | ✅ 已注册 | ❌ 未注册 |
| **`${CLAUDE_PLUGIN_ROOT}`** | ✅ 所有脚本路径使用 | ❌ 使用相对路径 |

> `settings.json` 是开发侧"影子副本"，**不是用户看到的配置**。用户通过 marketplace 安装后获得 plugin.json 的完整配置。

### 按落地路径分组

**A. 已出厂预置（27 项）**：§2/3/4/5/9/10/14/18/20/23/26/27/31/32/41/42/46/47/49/50/51/63/82/86 — 用户无需操作

**B. Agent 文件修改（12 项）**：§1/28/29/30/81 — 打包进 plugin，用户无感

**C. plugin.json 修改（3 项）**：§6/22/40 — 打包进 plugin

**D. 需 forge init 写入（2-3 项）**：§48/68 — 需用户重新 `forge init`

**E. 需新脚本（5-6 项）**：§7/12/13/15/52 — 打包进 plugin

**F. 确认实施（11 项）**：见下方 §十三

**G. 不推荐（7 项）**：§17/21/25/36/37/44/45

---

## 十三、优先级排序与用户决策

### Top 20 优先级排序

| # | 优化项 | 版本要求 | 影响域 | 工作量 | 状态 |
|---|--------|----------|--------|--------|------|
| **1** | `disallowed-tools` 限制 review agent 工具集 | ≥2.1.152 | §3.1 隔离 | 改 3 个 agent 文件 | 🔴 待做 |
| **2** | `PreCompact` hook 保护 Forge 进度状态 | ≥2.1.105 | §6 上下文不丢失 | 1 个新 hook 脚本 | ✅ plugin.json 已注册 |
| **3** | `PostCompact` hook 重新注入配置 | ≥2.1.76 | §2.5 context refresh | 1 个新 hook 脚本 | ✅ plugin.json 已注册 |
| **4** | `continueOnBlock` 引导式修复 | ≥2.1.139 | §2.2 门禁 | 改 frozen-zone hook | ✅ plugin.json 已使用 |
| **5** | `ENABLE_PROMPT_CACHING_1H` 省钱 | ≥2.1.108 | 成本 | 1 行 env | 🟢 需 forge init |
| **6** | `worktree.baseRef: "fresh"` 保持纯净起点 | ≥2.1.133 | §2.2 分支隔离 | 0 | ✅ 已是最佳配置 |
| **7** | Dynamic Workflows 评估 POC | ≥2.1.154 | L0 fallback | 调研+POC | 🟠 **确认实施** §33 |
| **8** | Hook exec form 迁移 | ≥2.1.139 | 安全+性能 | 中 | 🟡 plugin.json 大部分已完成 |
| **9** | MCP `alwaysLoad: true` | ≥2.1.121 | 工具可用性 | 1 行配置 | 🟢 需验证 |
| **10** | `.claude/skills` 自动加载 | ≥2.1.157 | 安装简化 | 中 | ❌ 不推荐迁移 |
| **11** | `settings.json` agent 字段 | ≥2.1.157 | §2.2 门禁 | 1 行配置 | ❌ 不推荐全局默认 |
| **12** | `TaskList` 排序修复 | ≥2.1.119 | §2.3 验证 | 0 | ⚪ 升级解决 |
| **13** | Subagent MCP 策略修复 | ≥2.1.153 | §3.3 安全 | 0 | ⚪ 升级解决 |
| **14** | Agent Teams 双模式并行（auto） | ≥2.1.154 | Agent Teams | decide+router+config | 🟠 **确认实施** §38 |
| **15** | `initialPrompt` 自动启动 agent | ≥2.1.83 | DX 优化 | 改 agent frontmatter | 🟢 极小 |
| **16** | `memory` frontmatter agent 持久记忆 | ≥2.1.33 | §4 knowledge | 改 agent frontmatter | 🟢 极小 |
| **17** | `CLAUDE_CODE_SUBAGENT_MODEL` 成本控制 | ≥2.1.147 | 成本 | 1 行 env | ❌ 不推荐全局 |
| **18** | `sandbox.failIfUnavailable` CI 安全 | ≥2.1.83 | CI 集成 | 1 行 env | 🟠 **确认实施** §69 |
| **19** | `ConfigChange` hook | ≥2.1.49 | 热配置 | 1 个新 hook 脚本 | 🟠 **确认实施** §11 |
| **20** | `CwdChanged` + `FileChanged` hook | ≥2.1.83, 2.1.49 | DX 优化 | 已有脚本 | ✅ plugin.json 已注册 |

### 额外确认实施的优化项（超出 Top 20）

| # | 优化项 | 版本要求 | 设计决策 |
|---|--------|----------|----------|
| §33 | Dynamic Workflows POC | ≥2.1.154 | 产出 POC 脚本 + ADR |
| §34 | ultrareview `--json` 增强 | ≥2.1.120 | 增强 per-file findings + `--strict` 模式 |
| §43 | `${CLAUDE_PLUGIN_DATA}` 持久化 | ≥2.1.78 | 知识库缓存迁移到 plugin data 目录 |
| §60 | `/code-review --fix` 自动执行 | ≥2.1.152 | P2/P3 自动修复 + 独立 commit |
| §61 | `/simplify` 自动执行 | ≥2.1.154 | review 通过后自动运行 + 独立 commit |
| §62 | `/usage` 成本收集 | ≥2.1.149 | 集成到 `/forge learn`，写入 knowledge metadata |
| §84 | `/goal` 替代 persistent-loop | ≥2.1.139 | `/goal` 接管 build 内 TDD 循环 |
| §88 | `--from-pr` PR 恢复 | ≥2.1.27 | 集成到 review + ship，使用已有 resume-from-pr.mjs |

### 关键设计决策

| 决策点 | 用户选择 | 影响 |
|--------|---------|------|
| **§38 Agent Teams 模式** | 双模式并行（auto） | Full tier → Agent Teams，Standard/Light → inline。`decide_dispatch_mode` 新增 `auto` 值 |
| **§60/§61 Review 增强** | 自动执行 | P2/P3 自动 `/code-review --fix` + 独立 commit；review 通过后自动 `/simplify` + commit |
| **§84 /goal 集成方式** | 替代 persistent-loop.sh | `/goal` 接管 build 内 TDD 循环，persistent-loop.sh 仅保留 phase transition |

### 术语说明

- ✅ 已落地 / 已出厂预置
- 🟠 确认实施 — 用户已确认
- 🟡 中等工作量
- 🟢 极小工作量
- 🔴 待做
- ❌ 不推荐
- ⚪ 升级解决

---

## 十四、风险评估与实施计划

### 风险总览

| 风险等级 | 数量 | 关键项 |
|----------|------|--------|
| 🟢 无风险 | 27 | 已出厂预置 |
| 🟢 极低风险 | 12 | Agent frontmatter 修改 |
| 🟢 低风险 | 2-3 | plugin.json 修改 |
| 🟡 中低风险 | 2-3 | forge init 写入 |
| 🟡 中风险 | 5-6 | 新脚本开发 |
| 🟠 高风险 | 2 | Dynamic Workflow POC、独立 review agent 文件 |
| 🔴 阻断 | 0 | 无 |

### 文件变更计划（11 项确认实施）

| 操作 | 文件 | 涉及优化项 |
|------|------|-----------|
| **新建** | `.claude/workflows/dynamic-review-poc.js` | §33 |
| **新建** | `scripts/config-changed-hook.mjs` | §11 |
| **新建** | `.forge/decisions/2026-05-30-dynamic-workflow-poc.md` | §33 |
| **修改** | `.claude-plugin/plugin.json` | §11, §84 |
| **修改** | `skills/forge/lib/decide/instructions.md` | §38 |
| **修改** | `skills/forge/lib/router/instructions.md` | §38 |
| **修改** | `skills/forge/lib/review/instructions.md` | §60, §61, §88 |
| **修改** | `skills/forge/lib/learn/instructions.md` | §62 |
| **修改** | `skills/forge/lib/build/instructions.md` | §84 |
| **修改** | `skills/forge/lib/loop/instructions.md` | §84 |
| **修改** | `skills/forge/lib/ship/instructions.md` | §88 |
| **修改** | `scripts/run-ci-ultrareview.sh` | §34 |
| **修改** | `scripts/knowledge-hook-dispatch.mjs` | §43 |
| **修改** | `scripts/inject-evolved-rules.mjs` | §43 |
| **修改** | `scripts/record-evolved-rule-violation.mjs` | §43 |
| **修改** | `.github/workflows/ci.yml` | §69 |
| **修改** | `.forge/config.md` | §38, §84 |
| **修改** | `.claude/rules/workflow-fallback-ladder.md` | §38 |

### 实施优先级

| 批次 | 优化项 | 理由 |
|------|--------|------|
| **Batch 1**（独立，无依赖） | §11, §34, §69 | 新脚本/CI 配置，不影响现有 skill |
| **Batch 2**（skill 指令修改） | §60/§61/§88, §62, §84 | 修改 skill instructions，互相独立 |
| **Batch 3**（配置+多文件） | §38, §43 | 涉及 config.md + 多个脚本联动 |
| **Batch 4**（POC） | §33 | 需要前 3 批完成后再评估 |

### 快速行动清单（非确认实施的即刻可做项）

**Agent Frontmatter 修改**（改完直接提交，下个 plugin 版本生效）：

```yaml
# forge-decide-* (6 个)
effort: xhigh

# forge-review
effort: high
memory: project
initialPrompt: "读取最近的 git diff，对照 .forge/specs/ 进行三层评审"

# forge-plan
effort: high
initialPrompt: "读取 .forge/specs/，分解为原子任务列表"

# forge-build
initialPrompt: "读取 plans + specs，按 TDD RED→GREEN→REFACTOR 循环开始实现"

# security, architect
effort: high
```

**plugin.json 修改**：

```jsonc
"mcpServers": {
  "forge-context": {
    "command": "node",
    "args": ["${CLAUDE_PLUGIN_ROOT}/dist/src/mcp/server.js"],
    "alwaysLoad": true  // 确保即时可用
  }
}
```

**forge init 写入**：

```jsonc
"env": {
  "ENABLE_PROMPT_CACHING_1H": "1",
  "CLAUDE_CODE_SUBPROCESS_ENV_SCRUB": "1"
}
```

---

## 十五、2.1.158–161 增补分析（2026-06-03）

> 承接上文（原覆盖至 2.1.157）。本节补齐 2.1.158 → 2.1.161 的相关条目。
> **结论**：2.1.161 以 bug 修复为主，但「配置文件安全」主题（2.1.160–161）与 Forge 最新的 security-check 维度#6（commit `0f19c1f6`）直接呼应；并行失败隔离与 OTEL 资源属性两条有实际落地价值。其余多为 Forge 自动受益的修复。

### 91. `claude mcp` 密钥脱敏 + `${VAR}` 不再展开 `[2.1.161]` 🟢 已落地

**现状**：security-check 维度 1（硬编码密钥）覆盖代码与配置文件明文密钥，但未显式覆盖 **MCP 配置文件**这一面——`.mcp.json` / `plugin.json` 的 `mcpServers` / `settings.json` 中内联 token、`Authorization` header、带密钥的 URL，以及把 MCP 配置回显到日志的脚本。

**优化**：2.1.161 已在 harness 层对 `claude mcp list/get/add` 做脱敏（`${VAR}` 不展开、credential header 与 URL 密钥打码）。Forge 据此在 review 层做同源加固：维度 1 增补「MCP 配置必须用 `${VAR}` 引用密钥、禁止内联字面量」，维度 5 增补「展示/记录 MCP 配置的脚本不得回显密钥」。

**状态**：🟢 已写入 `agents/security-check.md` 维度 1/5。

### 92. 配置文件写入确认（shell 启动文件 / 构建工具配置）`[2.1.160]` 🟢 已对齐

**现状**：Forge 刚在 security-check 维度 6 加入「可执行配置文件变更」清单（`.npmrc/.yarnrc/bunfig.toml/.bazelrc/.pre-commit-config.yaml/.devcontainer/`、shell 启动文件、git 配置）。

**优化**：2.1.160 在 harness 层为**同一组文件**加了写入确认——`acceptEdits` 模式写 `.npmrc/.yarnrc*/bunfig.toml/.bazelrc/.pre-commit-config.yaml/.devcontainer/` 前弹确认；写 `.zshenv/.zlogin/.bash_login`、`~/.config/git/` 前弹确认。这构成 **harness 写入确认 + Forge review 时标记** 的纵深防御。对齐点：Claude 官方清单含 `.zlogin`，Forge 维度 6 原清单缺此项，已补入。

**状态**：🟢 `.zlogin` 已补入维度 6；纵深防御关系已在维度 6 注明。

### 93. 并行工具调用失败隔离 `[2.1.161]` 🟠 语义已记录

**现状**：Forge 的 fallback ladder L0 失败签名含 `subprocess_crash`；并行 fan-out（decide 三视角 / review 三层）与批量验证命令依赖并行工具调用。

**优化**：2.1.161 起，**同一批次内一条 Bash 失败不再取消其它调用，各自独立返回**。影响：(1) 可安全地一次性批量跑多条独立验证命令，单条失败不连坐；(2) 降低并行批次因单条失败而整批失败 → ladder 误降级到 L1 的概率。建议：批量验证时无需再为「避免连坐」而拆成串行或加防御性 `|| true`。

**状态**：🟢 已审计（2026-06-03）：`skills/` 无 `|| true`；`scripts/` 的 21 处均为 fail-open 钩子（必须保留，与并行批处理无关）；build instructions 无「为避免批次取消而串行化」的指引。结论：Forge 从未引入「避免连坐」的 `|| true` 变通，无需清理——2.1.161 的失败隔离收益自动到账。

### 94. `OTEL_RESOURCE_ATTRIBUTES` 作为指标标签 `[2.1.161]` 🟢 本地 JSONL 已落地

**现状**：Forge 可观测性有两条路径——`scripts/track-tool-duration.mjs`（PostToolUse 写本地 `.forge/runs/<date>-tool-durations.jsonl`）与 `scripts/resume-from-pr.mjs` 的 `emitOTel`（stderr 桥接，gated on `OTEL_EXPORTER_OTLP_*`）。两者都未携带 resource 级维度，`/forge learn` 只能聚合、无法按档位/阶段切片。

**优化**：2.1.161 让 `OTEL_RESOURCE_ATTRIBUTES` 的值作为标签附加到指标数据点，可按 team/repo 等自定义维度切片。Forge 借鉴两步：
- **消费侧（已落地）**：`track-tool-duration.mjs` 解析 `OTEL_RESOURCE_ATTRIBUTES`（`k=v,k=v`）并写入每条 JSONL 的 `resource_attributes` 字段。
- **生产侧（已落地）**：PostToolUse 钩子子进程无法回写父会话 env，故改为在钩子内读取 `.forge/status.md` frontmatter 的 `phase`/`tier`/`current_task`，产出 `forge.phase`/`forge.tier`/`forge.task`（与 env 合并，env 优先）。`command` 即活跃 forge 子命令，等同 `phase`，不另设维度。OTLP 导出路径在 2.1.161 后亦可原生按这些维度切片。

**状态**：🟢 消费侧 + 生产侧均已落地并通过功能验证（status.md→forge.*、env 覆盖优先、无状态且无 env 时 fail-open=null）。

### 95. worktree 隔离的后台编辑修复 `[2.1.161]` 🟢 自动受益

**现状**：`agents/forge-build.md` 是唯一带 `isolation: worktree` 的 agent。

**优化**：2.1.161 修复了「`isolation:"worktree"` 的后台 agent 被阻止编辑自己 worktree 内文件」的 bug。影响：若此前因该 bug 规避过「后台 dispatch forge-build」，现可重新启用——属解锁一个被堵的模式，无需 Forge 改代码。

**状态**：🟢 自动受益。

### 96. `grep` 后免 Read 直接 Edit `[2.1.160]` 🟢 自动受益

**现状**：Forge 子代理常「先 grep 定位、再 Edit」，2.1.160 前需在 Edit 前补一次 Read。

**优化**：2.1.160 起，单文件 `grep`/`egrep`/`fgrep` 即满足 read-before-edit 检查。对 explore/build 子代理是一次省 Read 的小便利。

**状态**：🟢 自动受益（无需改动）。

### 97. 自动受益 bug 修复合集 `[2.1.161]` 🟢 自动受益

直接惠及 Forge、无需改动：
- **子代理 finalize 出错卡在 "running" 的修复** → review/decide 的假 stuck 减少，ladder L0→L1 误降级更少（关联 `stuck_timeout` 签名）。
- **OTEL 事件在 telemetry 初始化前被静默丢弃的修复** → `/forge learn` 早期 OTEL probe 更可靠。
- **后台子代理污染 `claude -p` stdout（`--output-format text`/`json`）的修复** → Forge 用 `stream-json`（行分隔），基本不踩坑；PoC/loop 的 JSONL 解析更稳。
- **resume 后渲染 Write 结果崩溃、后台会话用 daemon 旧 model** → Forge 重度依赖 `/forge resume` 与 settings.json model，属稳定性白拿。

### 98. 自查项：`/autofix-pr` 在 worktree 内误判 default branch `[2.1.161]` 🔍 待自查

**现状**：2.1.161 修复了 Claude 自身 `/autofix-pr` 在 linked worktree / 另一 repo 内误报「cannot run on default branch」。

**优化**：误判类型正是 Forge 分支隔离门禁要处理的——在 linked worktree 内判定 default branch。建议扫 `src/worktree-manager.ts` 与分支隔离门禁，确认 linked worktree 内用 `git rev-parse --abbrev-ref HEAD` 判定不会误伤。

**状态**：🟢 已自查（2026-06-03）：Forge 所有分支判定均用 `git branch --show-current` / `git rev-parse --abbrev-ref HEAD`（`cwd-changed-hook.mjs`、ship、`branch-gate.md`），二者在 linked worktree 内均正确返回该 worktree 自身分支；`isValidWorktreeSource` 仅判断是否 `forge/` 前缀；全仓无 `origin/HEAD` / `symbolic-ref` 之类 default-branch 启发式。结论：Forge 不存在 `/autofix-pr` 那类「worktree 内误判 default branch」缺陷，无需改动。

### 其余（2.1.158–161，不相关，已过滤）

`/mcp` 折叠未用 connector、Linux 剪贴板、reduce-motion、`/usage-credits`、`forceLogin*` 第三方 provider、jj workspaces resume、`EADDRINUSE`/`CLAUDE_CODE_TMPDIR`、渲染性能、VSCode GPU 提示、2.1.158 Bedrock/Vertex auto mode、2.1.159 内部改动。

---

---

## 十六、2.1.162 增补分析（2026-06-04）

> 承接上文（原覆盖至 2.1.161）。本节补齐 2.1.162 的相关条目。
> **结论**：2.1.162 以可靠性修复为主。Grep/Glob 工具声明生效、SendMessage + TMPDIR 深路径修复、Emoji 截断 API 400 修复三项与 Forge 直接相关；决定提高 decide-teams 最低 CLI 版本到 `>= 2.1.162` 一次性覆盖所有修复。

### 99. Grep/Glob 工具声明现在生效 `[2.1.162]` 🟠 待验证

**Changelog**: `--tools: explicitly listing Grep/Glob` now provides the dedicated search tools on native builds with embedded search (previously these names were **silently ignored**)

**Forge 影响**: 15 个 agent 定义声明了 Grep/Glob（product、architect、critic、security、所有 decide-* 和 review 子代理）。之前这些声明被**静默忽略**，agent 未获得专用搜索工具。现在声明生效，原生构建搜索性能可能提升。

**涉及文件**:
- `.claude/agents/product.md` — `tools: Read, Glob, Grep`
- `.claude/agents/architect.md` — `tools: Read, Glob, Grep, WebSearch, WebFetch`
- `.claude/agents/critic.md` — `tools: Read, Glob, Grep`
- `.claude/agents/security.md` — `tools: Read, Glob, Grep, WebSearch, WebFetch`
- `.claude/agents/designer.md` — `tools: Read, Glob, Grep`
- `.claude/agents/forge-decide-arch.md` — `allowedTools: [Read, Glob, Grep, ...]`
- `.claude/agents/forge-decide-product.md` — `allowedTools: [Read, Glob, Grep, ...]`
- `.claude/agents/forge-decide-sec.md` — `allowedTools: [Read, Glob, Grep, ...]`
- `.claude/agents/forge-decide-cost.md` — `allowedTools: [Read, Glob, Grep, ...]`
- `.claude/agents/forge-decide-ops.md` — `allowedTools: [Read, Glob, Grep, ...]`
- `.claude/agents/forge-plan.md` — 列出 Glob 和 Grep
- `.claude/agents/forge-build.md` — 列出 Glob 和 Grep
- `.claude/agents/forge-review.md` — 列出 Glob 和 Grep
- `.claude/agents/forge-ship.md` — 列出 Glob 和 Grep

**行动**: 无需修改声明（本身正确）。确认行为一致即可。

---

### 100. SendMessage + TMPDIR 深路径修复 `[2.1.162]` 🟠 版本门控

**Changelog**: Fixed cross-session messaging (SendMessage) silently breaking when `CLAUDE_CODE_TMPDIR` or `$TMPDIR` points at a deep directory

**Forge 影响**: Agent Teams 模式（decide-teams）重度依赖 SendMessage 进行 teammate 通信。Forge 在 SessionStart hook 中使用 `${TMPDIR}/forge-read-budget-*.json`（`.claude/settings.json:27`），read-cache 也写入 `${TMPDIR}/`（`read-cache.d.ts`）。深 TMPDIR 路径会导致 SendMessage 静默失败，Agent Teams 模式下 teammate 间消息丢失。

**涉及文件**:
- `.claude/settings.json:27` — TMPDIR cleanup hook
- `dist-plugin/dist/src/mcp/read-cache.d.ts` — `${TMPDIR}/forge-read-cache-<session>.json`
- `ROADMAP.md` — 记录了 SendMessage 运行时不可用 bug（#47021, #50622）

**行动**: 提高 decide-teams 最低 CLI 版本要求到 `>= 2.1.162`，确保修复生效。

---

### 101. Emoji 截断导致 API 400 修复 `[2.1.162]` 🟠 版本门控

**Changelog**: Fixed API 400 no low surrogate in string errors for classifier side-queries and MCP server descriptions containing emoji near a truncation boundary

**Forge 影响**: 技能指令文件中大量使用 emoji。高风险位置：

| 文件 | 行号 | 模式 | 风险等级 |
|------|------|------|----------|
| `build/instructions.md` | 188 | `🔍 探针...✅/❌` 50+ 字符含多 emoji | 🔴 高 |
| `build/references/closure-probes.md` | 30 | 同上 | 🔴 高 |
| `resume/references/output-format.md` | 6, 43 | `🔄` 在长格式串中 | 🟡 中 |
| `decide/instructions.md` | 219, 220 | `✅` `🔄` | 🟡 中 |
| `status/instructions.md` | 65, 174 | `🔄` | 🟡 中 |
| `debug/instructions.md` | 40, 109-111 | `✅` | 🟢 低 |

**行动**: 通过提高最低 CLI 版本要求覆盖此修复，无需修改 Forge 代码。

---

### 102. MCP Timeout 配置修复 `[2.1.162]` 🟠 添加显式配置

**Changelog**: MCP per-server timeout config values below 1000 ms being floored to a 1-second watchdog that aborted every tool call; sub-1000 ms values are now ignored

**Forge 影响**: `.mcp.json` 无 timeout 配置。forge-context MCP server 的 `forge_exec` 默认 30s，hooks 超时 1-5s。如果用户在 settings 中为 forge-context 配置了 <1000ms 的 timeout，之前所有工具调用都会被 1 秒 watchdog 中断。

**行动**: 为 `.mcp.json` 添加显式 `timeout: 15000`（15s）配置，避免依赖默认值。

---

### 103. 中断信号丢失修复 `[2.1.162]` 🟢 自动受益

**Changelog**: Fixed an interrupt (Esc) sent at the very start of a turn being silently dropped in stream-json/SDK sessions

**Forge 影响**: build/review 流程可能很长，用户需要可靠的中断能力。之前中断被静默丢弃意味着用户以为已停止但实际继续运行。此修复让 Esc 中断可靠生效。

**行动**: 无需代码修改。通过最低 CLI 版本要求覆盖。

---

### 104. 后台代理连接改善 `[2.1.162]` 🟢 自动受益

**Changelog**: Fixed `claude agents attach` bouncing back on first try after background-service restart; Fixed stalling 5 seconds before attaching

**Forge 影响**: Agent Teams 模式下用户通过 `claude agents` 管理 teammate session。之前 attach 会弹回或卡顿 5 秒，现在流畅连接。

**行动**: 无需代码修改。通过最低 CLI 版本要求覆盖。

---

### 105. 安静启动 `[2.1.162]` 🟢 自动受益

**Changelog**: Notices group by severity, shorter warnings with concrete fixes

**Forge 影响**: Forge 有 3 个 SessionStart hooks（auto-resume 5s、TMPDIR cleanup 1s、evolved-rules 5s），总超时 11s。新的分组通知格式让这些输出更整洁。

**行动**: 无需代码修改。自动受益。

---

### 106. 其余（2.1.162，不相关，已过滤）

- `claude agents --json waitingFor` — 监控增强，Forge 不消费 `--json` 输出
- `/effort` 持久化确认 — UX 改善，无功能影响
- Remote Control footer pill — UI 改善，无功能影响
- Slash command autocomplete 填入而非立即执行 — UX 改善
- Windows 路径修复 — Forge 未针对 Windows 做特殊处理
- WebFetch 权限规则修复 — Forge 未配置 WebFetch 权限
- LSP workspaceSymbol 修复 — Forge 未使用此操作
- `claude agents` 状态文本截断修复 — UX 改善
- Windsurf → Devin Desktop 重命名 — 品牌更名
- 启动错误处理改善 — 稳定性提升
- 后台服务启动改善 — 稳定性提升
- 删除冗余启动消息 — 更安静

---

### 2.1.162 行动清单

| # | 行动 | 优先级 | 复杂度 | 涉及文件 |
|---|------|--------|--------|----------|
| **A** | 提高 decide-teams 最低 CLI 版本到 `>= 2.1.162` | 🔴 高 | 低 | `dist-plugin/skills/forge/lib/decide-teams/instructions.md` |
| **B** | 为 `.mcp.json` 添加显式 timeout 配置 | 🟡 中 | 低 | `.mcp.json` |
| **C** | 更新 §80 最低版本建议为 `>= 2.1.162` | 🟡 中 | 低 | 本文档 §十 |
| **D** | 验证 Grep/Glob 声明生效后 agent 行为一致 | 🟢 低 | 低 | 无需修改（验证性） |

**版本门控决策**：decide-teams 最低版本从 `>= 2.1.32` → `>= 2.1.162`，一次性覆盖 SendMessage 修复、Emoji 修复、中断修复、后台连接修复（§100–104）。

*文档生成时间：2026-05-30（初版） / 2026-06-03（2.1.158–161 增补） / 2026-06-04（2.1.162 增补） | v3.2 | 基于 Claude Code CHANGELOG 2.1.0–2.1.162 全量分析 + Forge plugin.json/settings.json 对比 + 可行性验证*
