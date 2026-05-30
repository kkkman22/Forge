# Claude Code CHANGELOG 优化建议 — Forge 落地可行性验证报告

> 基于 Forge 项目代码库全量扫描，逐条交叉验证 `claude-code-changelog-forge-optimization.md` 中 90 个优化点的落地可行性。
> **关键区分**：`plugin.json`（分发给用户的出厂配置）vs `.claude/settings.json`（Forge 项目自身开发配置）。
> 生成时间：2026-05-30 | v2（修正版，基于 plugin.json 重新评估）

---

## 目录

- [一、执行摘要](#一执行摘要)
- [二、plugin.json vs settings.json — 关键发现](#二pluginjson-vs-settingsjson--关键发现)
- [三、落地分类总览](#三落地分类总览)
- [四、逐条可行性分析（按落地路径分组）](#四逐条可行性分析按落地路径分组)
  - [A. 已出厂预置（用户无需操作）](#a-已出厂预置用户无需操作)
  - [B. Agent 文件修改（打包进 plugin，用户无感）](#b-agent-文件修改打包进-plugin用户无感)
  - [C. plugin.json 修改（打包进 plugin，用户无感）](#c-pluginjson-修改打包进-plugin用户无感)
  - [D. 需 forge init 写入用户侧](#d-需-forge-init-写入用户侧)
  - [E. 需新脚本开发](#e-需新脚本开发)
  - [F. 需架构评估](#f-需架构评估)
  - [G. 不推荐落地](#g-不推荐落地)
- [五、行动优先级矩阵](#五行动优先级矩阵)
- [六、快速行动清单](#六快速行动清单)
- [七、风险评估](#七风险评估)

---

## 一、执行摘要

### 核心发现

| 分类 | 数量 | 占比 | 用户感知 |
|------|------|------|----------|
| ✅ **已出厂预置** | 27 | 30.0% | 用户无感，已生效 |
| 🟢 **Agent 文件修改** | 12 | 13.3% | 打包进 plugin，下次更新自动生效 |
| 🔵 **plugin.json 修改** | 3 | 3.3% | 打包进 plugin，下次更新自动生效 |
| 🟡 **需 forge init 写入** | 3 | 3.3% | 需用户重新运行 `forge init` |
| 🔵 **需新脚本开发** | 7 | 7.8% | 打包进 plugin |
| 🟠 **需架构评估** | 13 | 14.4% | 视评估结果决定 |
| 🔴 **不推荐** | 7 | 7.8% | — |
| ⚪ **运行时/升级即可** | 18 | 20.0% | 升级 Claude Code 即可 |

### 关键结论

> **Forge 的 `plugin.json` 已经做了大量工作**——PreCompact、PostCompact、MessageDisplay、CwdChanged、FileChanged hooks 全部已注册并使用 `args` 形式和 `if` 条件。之前的分析仅看了 `settings.json`（开发侧），误判了 6 个优化点为"未注册"，实际上它们在分发侧早已生效。
>
> 剩余可操作的优化集中在 **agent frontmatter**（effort/memory/initialPrompt）和 **环境变量分发机制**。

---

## 二、plugin.json vs settings.json — 关键发现

### 对比表

| 维度 | plugin.json（用户侧） | settings.json（开发侧） |
|------|----------------------|------------------------|
| **Hook 注册** | 12 类事件、30+ 个 hook | 8 类事件、~11 个 hook |
| **Hook 格式** | 大部分使用 `args` 数组形式 | 100% 使用 `command` 字符串形式 |
| **`if` 条件** | 已使用（`exists()`、`Bash()`） | 未使用 |
| **`continueOnBlock`** | 已使用（PostToolUse） | 未使用 |
| **PreCompact** | ✅ 已注册 | ❌ 未注册 |
| **PostCompact** | ✅ 已注册 | ❌ 未注册 |
| **MessageDisplay** | ✅ 已注册 | ❌ 未注册 |
| **CwdChanged** | ✅ 已注册 | ❌ 未注册 |
| **FileChanged** | ✅ 已注册 | ❌ 未注册 |
| **UserPromptSubmit** | ✅ 2 个 hook | ❌ 空 |
| **MCP server** | forge-context（node + args） | 无独立配置 |
| **`${CLAUDE_PLUGIN_ROOT}`** | ✅ 所有脚本路径使用 | ❌ 使用相对路径 |
| **userConfig** | max_parallel_agents, safety_level | 无 |

### plugin.json 已覆盖的 Hook 事件

| 事件 | plugin.json hook 数量 | 功能 |
|------|----------------------|------|
| SessionStart | 3 | auto-resume, inject-evolved-rules, bootstrap-check |
| UserPromptSubmit | 2 | inject-plan-context, cmux-mirror sync |
| MessageDisplay | 1 | 输出简洁性 |
| PreToolUse | 6 | plan context, frozen check×2, sandbox check×2, context boundary |
| PostToolUse | 6 | warnings, status reminder, cmux-mirror, dossier rebuild, continueOnBlock, diff integrity |
| PreCompact | 1 | 保存快照 |
| PostCompact | 1 | 恢复快照 |
| CwdChanged | 1 | 危险分支检测 |
| FileChanged | 1 | spec-lock 监控 |
| Stop | 6 | task check, persistent-loop, evolved-rules, rule violation, stale rules, cmux-mirror, phase check |
| TeammateIdle | 1 | phase check |
| TaskCompleted | 1 | team reminder |

### settings.json 是开发侧"影子副本"

`settings.json` 中的 hook 是 Forge 项目自身开发时使用的配置，功能少于 plugin.json，且使用旧版 `command` 字符串形式。**这不是用户看到的配置。** 用户通过 `claude plugin install forge` 安装后，获得的是 plugin.json 的完整配置。

---

## 三、落地分类总览

### 可落地性判断标准

对于 Forge 这种 marketplace plugin，落地路径取决于配置出现在哪里：

| 落地路径 | 位置 | 用户操作 | 示例 |
|----------|------|---------|------|
| **Agent 文件修改** | `.claude/agents/*.md` | 无（打包进 plugin） | 添加 effort/memory frontmatter |
| **plugin.json 修改** | `.claude-plugin/plugin.json` | 无（打包进 plugin） | 添加 alwaysLoad、新 hook 注册 |
| **forge init 写入** | 用户的 `.claude/settings.json` | 需重新 `forge init` | 环境变量 |
| **新脚本** | `scripts/*.mjs` | 无（打包进 plugin） | StopFailure、WorktreeCreate hook 脚本 |

---

## 四、逐条可行性分析（按落地路径分组）

### A. 已出厂预置（用户无需操作）

以下优化点在 plugin.json 中已完整实现，用户通过 marketplace 安装 Forge 后自动获得。

| # | 优化点 | plugin.json 中的实现 | 原报告误判 |
|---|--------|---------------------|-----------|
| §2 | PreCompact hook | `"PreCompact": [{"hooks": [{"args": ["bash", ".../hook-precompact.sh"], "timeout": 5}]}]` | ❌ 误判为"未注册" |
| §3 | PostCompact hook | `"PostCompact": [{"hooks": [{"args": ["bash", ".../hook-postcompact.sh"], "timeout": 5}]}]` | ❌ 误判为"未注册" |
| §4 | `continueOnBlock` | PostToolUse check-context-boundary 已有 `"continueOnBlock": true` | ❌ 误判为"未使用" |
| §5 | MessageDisplay hook | `"MessageDisplay": [{"hooks": [{"args": ["node", ".../message-display-hook.mjs"], "timeout": 2}]}]` | ❌ 误判为"未注册" |
| §9 | SessionStart 自动命名+热加载 | `inject-evolved-rules.mjs` 返回 `sessionTitle` + `reloadSkills: true` | ✅ 正确 |
| §10 | CwdChanged hook | `"CwdChanged": [{"hooks": [{"args": ["node", ".../cwd-changed-hook.mjs"], "timeout": 3}]}]` | ❌ 误判为"未注册" |
| §10 | FileChanged hook | `"FileChanged": [{"hooks": [{"args": ["node", ".../file-changed-hook.mjs"], "timeout": 3}]}]` | ❌ 误判为"未注册" |
| §14 | TeammateIdle hook | 已注册 1 个 hook | ✅ 正确 |
| §14 | TaskCompleted hook | 已注册 1 个 hook | ✅ 正确 |
| §18 | Hook `if` 条件 | PreToolUse 使用 `"if": "Bash(git commit*)"`，PostToolUse 使用 `"if": "exists(.forge/status.md)"` | ❌ 误判为"未使用" |
| §20 | Hook output >50K 自动存盘 | 运行时行为 | ✅ 正确 |
| §23 | Subagent 进度摘要缓存 | 运行时行为，≥2.1.128 | ✅ 正确 |
| §26 | subagent_type 大小写不敏感 | 运行时行为，≥2.1.140 | ✅ 正确 |
| §27 | Subagent stalling detection | 运行时行为，≥2.1.113 | ✅ 正确 |
| §31 | Task 依赖追踪 | 已在使用 | ✅ 正确 |
| §32 | Background session 保留 MCP | 运行时行为，≥2.1.143 | ✅ 正确 |
| §41 | Plugin dependency enforcement | 运行时行为 | ✅ 正确 |
| §42 | SKILL.md root-level plugin | 已实现 | ✅ 正确 |
| §46 | Lean System Prompt | 运行时行为 | ✅ 正确 |
| §47 | Streaming tool execution | 运行时行为 | ✅ 正确 |
| §49 | /resume 大会话加速 | 运行时行为，≥2.1.116 | ✅ 正确 |
| §50 | Reactive compaction | 运行时行为，≥2.1.142 | ✅ 正确 |
| §51 | Compaction 保留敏感指令 | 运行时行为 | ✅ 正确 |
| §63 | GFM task list checkboxes | 运行时行为 | ✅ 正确 |
| §82 | Fast mode Opus 4.8 | 运行时行为 | ✅ 正确 |
| §86 | /reload-skills | inject-evolved-rules.mjs 已实现 | ✅ 正确 |

**小计：27 项已出厂预置，用户无需任何操作。**

---

### B. Agent 文件修改（打包进 plugin，用户无感）

修改 `.claude/agents/*.md` 文件的 frontmatter，随 plugin 发布自动生效。

#### §1. 创建 spec-check/quality-check/security-check 独立 agent 文件

| 维度 | 评估 |
|------|------|
| **可行性** | 🟡 中等 |
| **现状** | 这 3 个 subagent_type 在系统提示中有定义，但 `.claude/agents/` 中无对应 .md 文件 |
| **差距** | 需创建 3 个独立文件，设置 `disallowedTools: [Bash, Write, Edit, Agent]` |
| **风险** | 中。可能影响 forge-review.md 的 subagent_type 解析逻辑 |
| **建议** | ✅ 推荐。但需测试 forge-review 的 Agent tool spawn 是否正确解析新文件 |

#### §28. `memory` frontmatter 扩展到更多 agent

| 维度 | 评估 |
|------|------|
| **可行性** | 🟢 高 |
| **现状** | 6/19 个 agent 已有 `memory: project`（forge-decide-*） |
| **建议** | 修改 agent .md 文件，零风险 |

**推荐添加 memory 的 agent：**

| Agent | 推荐 | 理由 |
|-------|------|------|
| forge-review | ✅ 强烈推荐 | 记住历史评审模式 |
| forge-build | ✅ 推荐 | 记住 TDD 踩坑记录 |
| forge-plan | ✅ 推荐 | 记住 plan 模式 |
| security | ✅ 推荐 | 记住安全发现模式 |
| architect | 🟠 可选 | 记住架构决策模式 |
| explore | ❌ 不推荐 | 只读搜索，记忆收益低 |

#### §29. `initialPrompt` 扩展到 forge 核心 agent

| 维度 | 评估 |
|------|------|
| **可行性** | 🟢 高 |
| **现状** | 6/19 个 agent 已有（forge-decide-*） |

**推荐添加 initialPrompt 的 agent：**

| Agent | 建议 initialPrompt |
|-------|-------------------|
| forge-build | `"读取 .forge/plans/ 和 .forge/specs/ 中的 plan 和 spec 文件，按照 TDD RED→GREEN→REFACTOR 循环开始实现"` |
| forge-plan | `"读取 .forge/specs/ 中的 spec 文件，分解为原子任务列表"` |
| forge-review | `"读取最近的 git diff，对照 .forge/specs/ 中的 spec 进行三层评审（spec/quality/security）"` |

#### §30. `restrictedSubagents` 限制 forge-review 可 spawn 的 subagent

| 维度 | 评估 |
|------|------|
| **可行性** | 🟢 高 |
| **现状** | 仅 forge-decide-lead 有 |
| **建议** | 为 forge-review 添加，限制为 spec-check、quality-check、security-check |

#### §81. `effort` frontmatter — 最高 ROI 优化

| 维度 | 评估 |
|------|------|
| **可行性** | 🟢 高 |
| **现状** | 0/19 个 agent 使用 `effort` |
| **差距** | 1 行 frontmatter |
| **建议** | ✅ **强烈推荐**。最高 ROI 优化之一 |

**推荐 effort 配置：**

| Agent | effort | 理由 |
|-------|--------|------|
| forge-decide-* (6 个) | `xhigh` | 多视角深度分析，是 decide 的核心价值 |
| forge-review | `high` | 细致代码审查 |
| forge-plan | `high` | 仔细规划任务分解 |
| architect / security | `high` | 深度分析 |
| forge-build | 不设 | TDD 循环不需要最高 effort |
| forge-ship | 不设 | ship 是流程性工作 |

**小计：12 项可通过修改 agent .md 文件落地（含 effort×6, memory×4+, initialPrompt×3, restrictedSubagents×1）。**

---

### C. plugin.json 修改（打包进 plugin，用户无感）

#### §6. Hook exec form — plugin.json 已大部分完成

| 维度 | 评估 |
|------|------|
| **可行性** | ✅ 已大部分完成 |
| **现状** | plugin.json 中大部分 hook 已使用 `args` 形式。仅 Stop 和 PostToolUse 中的 3 个 inline shell 逻辑仍用 `command` |
| **差距** | 3 个 hook 仍用 `command`（含复杂 shell 条件逻辑） |
| **建议** | ✅ 将剩余 3 个包装为独立脚本后迁移 |

**plugin.json 中仍用 `command` 的 hook：**

| Hook | 内容 | 迁移方案 |
|------|------|---------|
| PostToolUse: status reminder | `if [ -d .forge/status ] \|\| [ -f .forge/status.md ]; then echo '📝...'; fi` | 包装为 `scripts/hook-status-reminder.sh` |
| Stop: task completion check | `if [ -f .forge/progress/*.md ]; then ...; fi` | 包装为 `scripts/hook-task-check.sh` |
| Stop: evolved rules pending | `if [ -f ... ] && grep -q 'PENDING'; then ...; fi` | 包装为 `scripts/hook-evolved-rules-pending.sh` |
| Stop: phase verify | `if [ -f .forge/status.md ]; then phase=$(grep ...); ...; fi` | 包装为 `scripts/hook-phase-verify.sh` |
| TeammateIdle: phase check | `phase=$(grep ... \| sed ...); if ...; then ...; fi` | 包装为 `scripts/hook-teammate-idle.sh` |
| TaskCompleted: reminder | `echo '✅ ...'` | 包装为 `scripts/hook-task-completed.sh` |

#### §40. MCP `alwaysLoad` 添加到 plugin.json

| 维度 | 评估 |
|------|------|
| **可行性** | 🟢 高（需验证） |
| **现状** | plugin.json 的 mcpServers 定义了 forge-context 但无 `alwaysLoad` |
| **落地路径** | 在 plugin.json 的 mcpServers 中添加 `"alwaysLoad": true` |
| **风险** | 低。需验证 plugin.json 的 mcpServers 是否支持 `alwaysLoad` 字段 |
| **建议** | ✅ 推荐。验证后添加 |

```json
"mcpServers": {
  "forge-context": {
    "command": "node",
    "args": ["${CLAUDE_PLUGIN_ROOT}/dist/src/mcp/server.js"],
    "alwaysLoad": true
  }
}
```

#### §22. Agent `mcpServers` frontmatter

| 维度 | 评估 |
|------|------|
| **可行性** | 🟢 高 |
| **建议** | 🟠 可选。当前 plugin.json 全局定义 MCP server 已满足需求，agent 级别 mcpServers 可能与全局配置冲突。优先级低 |

**小计：3 项可通过修改 plugin.json 落地（exec form 收尾、alwaysLoad、mcpServers）。**

---

### D. 需 forge init 写入用户侧

以下配置无法通过 plugin.json 预置（plugin.json 无 `env` 字段），需要 `forge init` 脚本写入用户的 `.claude/settings.json`。

#### §48. `ENABLE_PROMPT_CACHING_1H` — 长时间 build 省钱

| 维度 | 评估 |
|------|------|
| **可行性** | 🟢 高 |
| **现状** | **未设置**。plugin.json 无 `env` 字段 |
| **差距** | 需 `forge init` 在初始化时写入用户的 settings.json |
| **风险** | 低。1h cache TTL 不影响行为 |
| **建议** | ✅ **强烈推荐**。最高 ROI 配置项之一 |

**落地路径**：在 `forge init` 的 settings.json 模板中添加：
```json
"env": {
  "ENABLE_PROMPT_CACHING_1H": "1"
}
```

#### §68. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` — 安全清理

| 维度 | 评估 |
|------|------|
| **可行性** | 🟢 高 |
| **建议** | ✅ 推荐。安全级别 1 应默认启用 |

#### §54. `MCP_CONNECTION_NONBLOCKING` — CI 模式

| 维度 | 评估 |
|------|------|
| **可行性** | 🟡 中等 |
| **风险** | 中。如果 CI 需要 forge-context MCP 工具，跳过连接会导致不可用 |
| **建议** | 🟠 需评估。不在 `forge init` 中默认写入，仅在 CI 脚本中使用 |

**小计：2-3 项需 forge init 写入用户侧（PROMPT_CACHING_1H、ENV_SCRUB）。**

---

### E. 需新脚本开发

以下优化需要编写新脚本，打包进 plugin 后用户无感。

#### §7. `terminalSequence` 阶段桌面通知

| 维度 | 评估 |
|------|------|
| **可行性** | 🟢 高 |
| **建议** | 在 `persistent-loop.sh` 阶段切换逻辑中添加 terminalSequence |

#### §12. `TaskCreated` hook — 注入 plan 上下文

| 维度 | 评估 |
|------|------|
| **可行性** | 🟢 高 |
| **建议** | 编写 `scripts/hook-task-created.mjs` |

#### §13. `WorktreeCreate`/`WorktreeRemove` hook

| 维度 | 评估 |
|------|------|
| **可行性** | 🟢 高 |
| **建议** | 编写 `scripts/hook-worktree.mjs` |

#### §15. `StopFailure` hook — 记录 API 错误

| 维度 | 评估 |
|------|------|
| **可行性** | 🟢 高 |
| **建议** | 编写 `scripts/hook-stop-failure.mjs`，记录到 `.forge/debug/` |

#### §52/53. CI `--bare` + `--exclude-dynamic-system-prompt-sections`

| 维度 | 评估 |
|------|------|
| **可行性** | 🟢 高 |
| **建议** | 修改 `scripts/run-ci-ultrareview.sh` |

**小计：5-6 项需新脚本开发。**

---

### F. 需架构评估

| # | 优化点 | 风险 | 建议 |
|---|--------|------|------|
| §33 | Dynamic Workflows POC | 高。新特性，涉及 L0 fallback ladder 重评估 | 先做 POC |
| §34 | ultrareview `--json` 增强 | 低。已有 CI 集成 | 小幅增强 |
| §38 | `defaultEnabled: false` Agent Teams | 中。需创建新 plugin | 可选 |
| §43 | `${CLAUDE_PLUGIN_DATA}` 持久化 | 中。需迁移 | 可选 |
| §60 | `/code-review --fix` 集成 | 中。可能与原子提交冲突 | 可选增强 |
| §61 | `/simplify` post-review | 低 | 推荐 |
| §62 | `/usage` 成本收集 | 低 | 推荐 |
| §69 | `sandbox.failIfUnavailable` CI | 低 | 推荐 |
| §70 | `CLAUDE_CODE_SCRIPT_CAPS` | 中。需确定 cap 值 | 可选 |
| §71-74 | OTEL 可观测性 | 中。需 OTEL 基础设施 | 可选 |
| §84 | `/goal` 命令集成 | 中 | 可选 |
| §88 | `--from-pr` PR 会话恢复 | 低 | 推荐 |
| §11 | ConfigChange hook | 低 | 可选 |

---

### G. 不推荐落地

| # | 优化点 | 原因 |
|---|--------|------|
| §21 | `agent` 全局默认 | 会影响所有 claude 会话（包括非 Forge 用法）。用户安装 Forge 是为了增强，不是替换 |
| §25 | `CLAUDE_CODE_SUBAGENT_MODEL` 全局 | 会覆盖 agent frontmatter 的细粒度 model 选择（sonnet/haiku/inherit）。Forge 已在 agent 层做了成本控制 |
| §36 | `.claude/skills/` 迁移 | 丢失 plugin.json 的 MCP server、hooks、userConfig 能力。`.claude/skills/` 适合轻量 skill，不适合 Forge 框架级插件 |
| §45 | `managed-settings.d/` | 企业管理级配置，不适用个人/团队工具 |
| §44 | `source: 'settings'` 内联 plugin | plugin.json 更结构化 |
| §17 | `InstructionsLoaded` hook | 收益有限 |
| §37 | `claude plugin init` 脚手架 | Forge 已有完整 plugin 结构 |

---

## 五、行动优先级矩阵

### 第一梯队：Agent Frontmatter（改 .md 文件，打包进 plugin）

| # | 操作 | 影响文件数 | ROI |
|---|------|-----------|-----|
| **A1** | forge-decide-* 添加 `effort: xhigh` | 6 个文件 | ⭐⭐⭐⭐⭐ |
| **A2** | forge-review 添加 `effort: high` + `memory: project` + `initialPrompt` | 1 个文件 | ⭐⭐⭐⭐⭐ |
| **A3** | forge-plan 添加 `effort: high` + `initialPrompt` | 1 个文件 | ⭐⭐⭐⭐ |
| **A4** | forge-build 添加 `initialPrompt` | 1 个文件 | ⭐⭐⭐ |
| **A5** | security, architect 添加 `effort: high` | 2 个文件 | ⭐⭐⭐ |

### 第二梯队：plugin.json 修改

| # | 操作 | 复杂度 |
|---|------|--------|
| **P1** | mcpServers 添加 `alwaysLoad: true` | 1 行（需验证） |
| **P2** | 剩余 6 个 `command` hook 包装为脚本后迁移到 `args` | 中（6 个脚本） |

### 第三梯队：forge init 写入

| # | 操作 | 复杂度 |
|---|------|--------|
| **I1** | `forge init` 写入 `ENABLE_PROMPT_CACHING_1H=1` | 修改 init 脚本 |
| **I2** | `forge init` 写入 `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` | 修改 init 脚本 |

### 第四梯队：新脚本

| # | 操作 | 复杂度 |
|---|------|--------|
| **S1** | StopFailure hook 脚本 | 小 |
| **S2** | WorktreeCreate/Remove hook 脚本 | 小 |
| **S3** | TaskCreated hook 脚本 | 小 |
| **S4** | terminalSequence 阶段通知 | 小 |
| **S5** | CI `--bare` flag | 极小 |

### 第五梯队：架构评估

| # | 操作 | 风险 |
|---|------|------|
| **R1** | Dynamic Workflow POC | 高 |
| **R2** | 创建 spec-check/quality-check/security-check 独立文件 | 中 |
| **R3** | ConfigChange hook | 低 |

---

## 六、快速行动清单

### A. Agent Frontmatter 修改（改完直接提交，下个 plugin 版本生效）

```yaml
# .claude/agents/forge-decide-arch.md（及 cost/ops/product/sec 同理）
---
# ... 现有字段 ...
effort: xhigh        # A1: 多视角深度分析
---

# .claude/agents/forge-review.md
---
# ... 现有字段 ...
effort: high          # A2: 细致代码审查
memory: project       # A2: 记住历史评审模式
initialPrompt: "读取最近的 git diff，对照 .forge/specs/ 中的 spec 进行三层评审（spec/quality/security）"  # A2
---

# .claude/agents/forge-plan.md
---
# ... 现有字段 ...
effort: high          # A3: 仔细规划任务分解
initialPrompt: "读取 .forge/specs/ 中的 spec 文件，分解为原子任务列表"  # A3
---

# .claude/agents/forge-build.md
---
# ... 现有字段 ...
initialPrompt: "读取 .forge/plans/ 和 .forge/specs/ 中的 plan 和 spec 文件，按照 TDD RED→GREEN→REFACTOR 循环开始实现"  # A4
---

# .claude/agents/security.md, architect.md
---
# ... 现有字段 ...
effort: high          # A5: 深度分析
---
```

### B. plugin.json 修改

```jsonc
{
  "mcpServers": {
    "forge-context": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/src/mcp/server.js"],
      "alwaysLoad": true  // P1: 确保即时可用
    }
  }
  // P2: 将 6 个 command hook 包装为脚本后迁移（见详细方案）
}
```

### C. forge init 写入（修改 init 脚本的 settings.json 模板）

```jsonc
// forge init 生成的 .claude/settings.json 中应包含：
{
  "env": {
    "ENABLE_PROMPT_CACHING_1H": "1",          // I1: 1h prompt cache
    "CLAUDE_CODE_SUBPROCESS_ENV_SCRUB": "1"     // I2: 安全清理
  },
  "worktree": {
    "baseRef": "fresh"
  }
}
```

---

## 七、风险评估

### 落地风险总览

| 风险等级 | 数量 | 关键项 |
|----------|------|--------|
| 🟢 **无风险** | 27 | 已出厂预置 |
| 🟢 **极低风险** | 12 | Agent frontmatter 修改（effort/memory/initialPrompt） |
| 🟢 **低风险** | 2-3 | plugin.json 修改（alwaysLoad、exec form 收尾） |
| 🟡 **中低风险** | 2-3 | forge init 写入（需用户重新初始化） |
| 🟡 **中风险** | 5-6 | 新脚本开发 |
| 🟠 **高风险** | 2 | Dynamic Workflow POC、独立 review agent 文件创建 |
| 🔴 **阻断** | 0 | 无阻断项 |

### 最大的 3 个风险

1. **Dynamic Workflow POC（R1）**：新特性（2.1.154），稳定性待验证，涉及 L0 fallback ladder 重评估
2. **创建独立 review agent 文件（R2）**：可能影响 forge-review.md 的 subagent_type 解析逻辑
3. **forge init 环境变量写入（I1/I2）**：用户需重新运行 `forge init`，已有项目需手动添加

### 开发侧 settings.json 的维护建议

`settings.json`（开发侧）比 `plugin.json` 落后很多。建议：

1. **长期**：将 settings.json 中的 hook 全部同步为 plugin.json 的 `args` 形式
2. **短期**：开发时直接依赖 plugin.json 的 hook（`claude` 运行时会合并 plugin hooks + settings hooks）
3. **风险**：settings.json 中的 `command` 形式 hook 可能与 plugin.json 的 `args` 形式 hook 产生重复执行

---

*报告生成时间：2026-05-30 | v2 修正版 | 基于 Claude Code CHANGELOG 2.1.0–2.1.157 + Forge plugin.json + settings.json 对比分析*
