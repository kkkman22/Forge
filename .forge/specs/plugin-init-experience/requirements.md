---
status: completed
feature: plugin-init-experience
layout: requirements
created: 2026-05-18
tier: standard
---
# Requirements Document

## Introduction

V2.5.0 通过 Claude Code marketplace 安装 Forge 的用户，**没有**对应于 clone 模式下 `bash forge/scripts/init.sh` 的等价入口。用户必须自己定位 plugin 根路径并手工执行脚本，而所有 SKILL（forge-spec、forge-plan、forge-build、forge-test、forge-ship、forge-debug、forge-learn、forge-resume、forge-abort、forge-decide、forge-status、forge-loop）的 Edge Cases 段落仍然指向 `forge init` 这个旧文案，不存在的命令。

**问题链路**：

1. Plugin 安装：`.claude-plugin/plugin.json` 注册了 hooks、commands、skills、forge-context MCP server，但 `commands/forge.md` 的子命令表不含 `init`。
2. Init 仍是脚本：`scripts/init.sh` 创建 `.forge/` 目录、复制 7 个 agent 角色、生成 `CLAUDE.md` 项目宪法、按交互收集项目名/技术栈/安全级别/CI 检查命令。
3. **缺口**：plugin 用户运行 `/forge plan` 时，SKILL 检测到 `.forge/` 不存在 → 提示"请先运行 forge init" → 用户找不到该命令。
4. SKILL 文案 `forge init` 在 plugin 模式下不可达，文档与运行环境脱节。

**改进目标**：让 plugin 用户也能通过统一入口完成项目初始化，并在用户首次使用时主动引导。

**设计决策**：

- **方案 A**：`/forge init` 暴露为 `commands/forge.md` 的正式子命令，路由到 Bash 调用 plugin 自带的 `${CLAUDE_PLUGIN_ROOT}/scripts/init.sh`。clone 模式下保持运行 `bash forge/scripts/init.sh`，体验对齐。
- **方案 C**：SessionStart 钩子检测"plugin 已激活但 `.forge/` 不存在"的状态，**非阻断**地输出引导文本，提示用户运行 `/forge init`。
- **不做自动初始化**：init.sh 收集的字段（项目名、技术栈、安全级别、CI 检查命令）会显著影响后续 spec/plan/review 行为，必须显式动作；同时 init 还会复制 agent 文件、生成项目宪法，悄悄做掉会让用户失去对项目的控制感。
- **SKILL 文案统一**：所有"先运行 forge init"提示改为"先运行 `/forge init`"，与新入口对齐。

**明确不做的事情**：不引入新的 init 实现（仍复用 `scripts/init.sh`）；不实现 `--auto`、`--non-interactive` 等无人值守初始化（保留为未来能力）；不为已初始化项目重复提示；不阻断任何 SKILL 流程，引导仅作信息提示。

## Glossary

- **Plugin 模式**：用户通过 Claude Code marketplace（`.claude-plugin/marketplace.json`）安装 Forge，plugin 根目录由 `${CLAUDE_PLUGIN_ROOT}` 环境变量提供。
- **Clone 模式**：用户 `git clone` Forge 仓库到本地（如 `./forge/`）并直接运行 `bash forge/scripts/init.sh` 的传统方式。
- **Bootstrap 提示**：SessionStart 钩子在 `.forge/` 不存在时输出的非阻断引导文本，建议用户运行 `/forge init`。
- **冷启动**：用户从未在当前项目运行过 init，`.forge/` 目录不存在。
- **`forge_init_dispatcher`**：`/forge init` 子命令的内部分发逻辑，按运行环境（plugin / clone / global）选择正确的 `init.sh` 路径。
- **Init 脚本根**：`init.sh` 所在目录的父目录，含 `agents/`、`templates/`、`hooks/` 等资源。

## Requirements

### Requirement 1: `/forge init` 子命令暴露

**User Story:** 作为 plugin 安装的用户，我希望像调用 `/forge plan`、`/forge build` 一样调用 `/forge init`，以便在不知道 plugin 物理路径的情况下完成项目初始化。

#### Acceptance Criteria

1. THE `commands/forge.md` 子命令分发表 SHALL 包含 `init` 行，对应描述为"项目初始化"。
2. WHEN 用户输入 `/forge init`，THE Command 路由 SHALL 通过 Bash 工具调用对应模式的 `init.sh`，不再走 `Skill(forge-router)` 任务分析路径。
3. WHEN plugin 模式下调用 `/forge init`，THE 调用 SHALL 使用 `${CLAUDE_PLUGIN_ROOT}/scripts/init.sh`。
4. WHEN clone 模式下调用 `/forge init`，THE 调用 SHALL 使用项目根下 `forge/scripts/init.sh`（沿用现状）。
5. WHEN 既无 `${CLAUDE_PLUGIN_ROOT}` 也无 `forge/scripts/init.sh`，THE Command SHALL 输出明确的诊断提示，列出已检查的路径与建议安装方式（plugin install / git clone），并退出非零码。
6. THE 子命令 SHALL 透传 `init.sh` 的所有命令行参数（如 `--pack pms`、`--help`）；用户输入 `/forge init --help` SHALL 等价于直接运行 `init.sh --help`。
7. THE `commands/forge.md` 的"用户输入路由示例"段落 SHALL 增加一个 `/forge init` 的示例以提高可见性。

### Requirement 2: `init.sh` 支持 plugin 根路径检测

**User Story:** 作为 init.sh 的维护者，我希望脚本本身能识别 plugin 安装环境，找到正确的资源根，让 `/forge init` 子命令的分发逻辑保持薄。

#### Acceptance Criteria

1. WHEN `init.sh` 启动时 `${CLAUDE_PLUGIN_ROOT}` 环境变量已设置且 `${CLAUDE_PLUGIN_ROOT}/agents/` 目录存在，THE `detect_forge_root` 函数 SHALL 返回 `${CLAUDE_PLUGIN_ROOT}` 作为 `FORGE_ROOT`。
2. THE `${CLAUDE_PLUGIN_ROOT}` 检测分支 SHALL 优先于"脚本相对路径检测"和"全局安装路径检测"两个旧分支。
3. WHEN 三种检测方式均失败，THE `detect_forge_root` SHALL 输出现有错误信息，附加一行新的诊断提示："已检查路径：`${CLAUDE_PLUGIN_ROOT}`、`<script_dir>/..`、`~/.claude/skills/forge`"。
4. THE 检测逻辑 SHALL 用纯函数 `resolveForgeRoot(env, fsExists): string | null` 在 `src/forge-root-resolver.ts`（新模块）实现，shell 脚本通过调用 `node` 子命令复用此函数。
5. THE 纯函数 SHALL 有 property tests 覆盖：(a) plugin 路径优先；(b) 缺 plugin 时回退到 script-relative；(c) 缺 script-relative 时回退到 global 路径；(d) 三种均失败时返回 `null`；(e) 任意非法字符串输入不抛错。
6. WHERE `init.sh` 已经初始化过项目（`.forge/` 已存在），THE 现有"是否覆盖"交互提示 SHALL 保持不变，与 plugin / clone 模式无关。

### Requirement 3: SessionStart Bootstrap 引导提示

**User Story:** 作为首次在新项目中使用 plugin 的开发者，我希望在第一次开启会话时就能看到"运行 /forge init 初始化"的引导，以避免在第一次执行 SKILL 时才被告知缺失。

#### Acceptance Criteria

1. THE plugin SHALL 提供 `scripts/bootstrap-check.mjs`（新文件），由 `.claude-plugin/plugin.json` 的 SessionStart hook 调用。
2. WHEN bootstrap-check 启动，THE 脚本 SHALL 检测当前工作目录的 `.forge/config.md` 是否存在。
3. WHEN `.forge/config.md` 不存在 AND `.forge/.bootstrap-dismissed` 标记不存在 AND `${CLAUDE_PLUGIN_ROOT}` 已设置（说明 plugin 已激活），THE 脚本 SHALL 输出引导文本到 stdout：

   ```
   💡 Forge plugin 已激活，但当前项目尚未初始化。
      运行 `/forge init` 创建 .forge/ 目录、配置项目宪法与 7 个 Subagent。
      若不打算在本项目使用 Forge，可创建空文件 `.forge/.bootstrap-dismissed` 跳过此提示。
   ```

4. WHEN `.forge/config.md` 已存在，THE 脚本 SHALL 静默退出码 0，不输出任何文本。
5. WHEN `.forge/.bootstrap-dismissed` 文件存在，THE 脚本 SHALL 静默退出码 0。
6. WHEN bootstrap-check 自身出错（fs 异常、磁盘只读等），THE 脚本 SHALL 静默吞掉异常退出码 0，不阻断 SessionStart 流程（与现有 `auto-resume.sh`、`inject-evolved-rules.mjs` 的"|| true"行为对齐）。
7. THE bootstrap-check 调用 SHALL 通过 `.claude-plugin/plugin.json` `SessionStart.hooks` 注册，timeout 设置为 5 秒，与现有 SessionStart hook 一致。
8. THE bootstrap-check SHALL 不读取或写入 `.forge/` 内部任何受保护文件；仅检测 `.forge/config.md` 存在性与 `.forge/.bootstrap-dismissed` 存在性。
9. THE bootstrap 提示文本 SHALL 中文为主、不超过 4 行，避免污染 SessionStart 输出。
10. THE bootstrap 检测逻辑 SHALL 用纯函数 `shouldShowBootstrap(env, fsExists): BootstrapDecision` 实现，与 `bootstrap-check.mjs` 的 IO 部分分离；`BootstrapDecision = { kind: "show" } | { kind: "skip"; reason: "already_initialized" | "user_dismissed" | "no_plugin_context" }`。

### Requirement 4: SKILL Edge Cases 文案统一

**User Story:** 作为 SKILL 维护者，我希望所有"先运行 forge init"的提示统一改为"先运行 `/forge init`"，避免引导用户走不存在的命令。

#### Acceptance Criteria

1. THE 以下文件中所有出现的字符串 `forge init`（独立命令短语）SHALL 替换为 `/forge init`：
   - `skills/forge/lib/build/instructions.md`
   - `skills/forge/lib/spec/instructions.md`
   - `skills/forge/lib/plan/instructions.md`
   - `skills/forge/lib/test/instructions.md`
   - `skills/forge/lib/ship/instructions.md`
   - `skills/forge/lib/debug/instructions.md`
   - `skills/forge/lib/learn/instructions.md`
   - `skills/forge/lib/resume/instructions.md`
   - `skills/forge/lib/abort/instructions.md`
   - `skills/forge/lib/decide/instructions.md`
   - `skills/forge/lib/status/instructions.md`
   - `skills/forge/lib/loop/instructions.md`
   - `skills/forge/lib/spec/references/edge-cases.md`
2. WHERE 文档明确指代"脚本"或"shell 命令"上下文（如 `init.sh` 自身的注释、`README` 安装章节、`docs/onboarding-advanced.md` 的"`/forge init --pack pms`"已是新格式），THE 这些位置 SHALL 不被替换。
3. THE 替换 SHALL 不影响 `templates/CLAUDE.md`、`templates/AGENTS.md`、`AGENTS.md`、`CLAUDE.md` 中"本文件由 `forge init` 自动生成"这条历史出处描述（保持向后兼容，避免误解为新命令）。
4. THE 替换 SHALL 通过 `scripts/check-doc-links.sh` + `npm run check` 验证不破坏现有文档结构。
5. THE contract 测试 `test/contract.test.ts` SHALL 增加一条断言：扫描上述文件确保不再含独立 `forge init` 字符串（仅允许 `/forge init`）。

### Requirement 5: 文档与契约更新

**User Story:** 作为新用户，我希望 README 和 onboarding 文档明确告诉我 plugin 安装后的下一步是 `/forge init`，避免文档与实际入口不一致。

#### Acceptance Criteria

1. THE `README.md` 的"快速开始 / Quick Start"段落 SHALL 在描述 plugin 安装方式后明确指出"下一步：在你的项目中运行 `/forge init`"。
2. THE `docs/onboarding.md`（或等价 onboarding 文档）SHALL 增加一段说明：plugin 用户可通过 `/forge init` 初始化，clone 用户可通过 `bash forge/scripts/init.sh` 初始化，两者效果等价。
3. THE `CHANGELOG.md` SHALL 新增一项："`/forge init` 子命令暴露 + plugin SessionStart bootstrap 引导提示"。
4. THE 现有"是否启用 CI AI 评审"、"CI 检查命令"等 init.sh 交互问题 SHALL 在 plugin 模式下与 clone 模式下表现一致；本 spec 不修改交互内容。
5. THE contract 测试 SHALL 校验 `commands/forge.md` 子命令分发表至少包含以下行（顺序不强制）：`plan`、`build`、`review`、`test`、`ship`、`learn`、`decide`、`spec`、`debug`、`loop`、`status`、`resume`、`abort`、`refactor`、`fix`、`init`。

### Requirement 6: 知识库沉淀

**User Story:** 作为 Forge 维护者，我希望本次"plugin 模式 init 缺口"的根因与修复进入知识库，避免后续新增分发渠道（如 npm 包、GitHub Release zip）时再次出现等价缺口。

#### Acceptance Criteria

1. WHEN 本 spec ship 完成，THE `.forge/knowledge/known-failures.md` SHALL 追加一条模式："新分发渠道引入但 SKILL 提示文案与 Command 入口未同步"，置信度 ≥ 0.7。
2. THE 知识条目 SHALL 包含：(a) 检测信号——SKILL Edge Cases 提及的命令在新渠道下不可达；(b) 验证命令——`grep -r "forge init" skills/`；(c) 修复参考——本 spec 的路径与 commit。
3. THE 知识条目 SHALL 通过 `/forge learn` 在所有任务完成后写入，不在 build 中段手工编辑。
