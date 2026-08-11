---
status: completed
feature: plugin-distribution
layout: requirements
created: 2026-05-12
tier: standard
---
# Requirements Document

## Introduction

Claude Code 2.0.12（2025-10）发布 Plugin 系统，至 2026-05 已稳定迭代半年。Plugin 是 CC 的原生扩展分发机制，单个 plugin 可携带 commands、skills、agents、hooks、MCP servers、themes、monitors、bin executables，支持从 git repo / npm / zip / local 源安装，有 `claude plugin install/update/uninstall/validate/prune/tag` 的完整生命周期命令，以及 marketplace 概念支持团队内部分发。

Forge 当前分发方式（见 `README.md`）：

- 方式一：`git clone ... ~/.claude/skills/forge`（完整克隆 + `npm install && npx tsc`）
- 方式二：`scripts/build-dist.sh` + `scripts/install-dist.sh`（分发包）

两种方式都**不经过 CC 的 plugin marketplace**，因此无法享受：

- `claude plugin update` 自动更新
- 版本 commit SHA 锁定
- `plugin validate` 预安装校验
- 分发包内 MCP server 自动注册
- 企业级 `blockedMarketplaces` / `allowedChannelPlugins` 管控

本 spec 评估并（若评估通过则）实现 Forge 的 plugin 化分发，同时保留既有两种方式作为 fallback。

**本 spec 是评估 + 实施**：Phase A 做评估，Phase B 依据评估结论决定是否实施。

## Glossary

- **CC_Plugin_System**：Claude Code 的 plugin 能力，入口命令 `claude plugin`，配置文件 `plugin.json` + `marketplace.json`。
- **Plugin_Manifest**：`plugin.json`，声明 plugin 的 name、version、commands/skills/agents/hooks/mcp 等子资源。
- **Marketplace_Manifest**：`marketplace.json`，声明一组 plugin 的 git/npm 源、版本、依赖。
- **Forge_Plugin_Package**：本 spec 产出的 Forge plugin 形态（含 `plugin.json` + 必要的文件布局调整）。
- **Forge_Marketplace**：Forge 提供的官方 marketplace（github 仓库或 forge-marketplace repo），含 Forge_Plugin_Package 和未来可能的扩展 plugin。
- **Current_Dist_Script**：现有的 `scripts/build-dist.sh` + `scripts/install-dist.sh`，本 spec 保留但降级为备用方案。
- **Forge_State_Dir**：`.forge/` 项目状态目录，是"项目级资产"，与 plugin（全局或用户级资产）有本质区别。
- **Plugin_Data_Dir**：`${CLAUDE_PLUGIN_DATA}`，CC 为 plugin 提供的持久化目录（存活于 plugin 更新过程）。

## Requirements

### Requirement 1: Phase A — Plugin 化可行性评估

**User Story:** As a Forge maintainer, I want a written feasibility report before investing in plugin packaging, so that I don't discover blockers after committing to the change.

#### Acceptance Criteria

1. THE project SHALL produce a feasibility report at `.forge/specs/plugin-distribution/feasibility.md` covering: current file layout vs plugin-required layout diff, required refactors, migration risk, rollback plan, and a go/no-go recommendation.
2. THE feasibility report SHALL enumerate every Forge asset (skills, agents, hooks, scripts, templates, docs, TypeScript dist) and classify each as: (a) compatible with plugin layout as-is, (b) needs minor renaming/relocation, (c) needs substantial refactor, (d) cannot be part of plugin (must stay as project-level assets).
3. THE feasibility report SHALL document how Forge_State_Dir (`.forge/`) interacts with plugin semantics: the plugin ships skills/agents/hooks but `.forge/` is always project-local and **not** part of the plugin distribution.
4. THE feasibility report SHALL benchmark the install UX: compare `claude plugin install forge` vs the current two methods across dimensions (user steps, prerequisites, update path, uninstall cleanliness, CI installation).
5. WHEN the feasibility report recommends go, THE report SHALL produce an implementation plan linking to Phase B requirements; WHEN no-go, THE report SHALL archive this spec and document the blockers so future re-evaluation has context.

### Requirement 2: Phase B — Forge_Plugin_Package 基础布局

**User Story:** As a user installing Forge via plugin, I want the plugin to declare all Forge commands and skills in `plugin.json`, so that `claude plugin install forge` makes `/forge` immediately available without additional steps.

#### Acceptance Criteria

1. THE repository root SHALL include a `plugin.json` file declaring Forge as a plugin, with fields: `name: "forge"`, `version` (synchronized with `package.json`), `description`, `author`, `license: "MIT"`, `commands`, `skills`, `agents`, `hooks`, optional `mcpServers`, optional `bin`.
2. THE `plugin.json` SHALL reference existing paths without requiring file relocation: `skills: ["./skills"]`, `agents: ["./agents"]`, `hooks: "./hooks/hooks.json"`, `commands: ["./commands"]` (creating the `commands/` directory if absent).
3. THE `plugin.json` SHALL declare all Forge commands (`forge`, `forge-plan`, `forge-build`, etc.) via the `commands` array, referencing markdown files in `commands/` that invoke the corresponding skill.
4. THE `plugin.json` SHALL use `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` variables correctly for any paths that must survive plugin updates (e.g. cached knowledge, user preferences persisted by the plugin).
5. THE `plugin.json` SHALL pass `claude plugin validate` with zero errors or warnings (or documented warnings with rationale).

### Requirement 3: Phase B — Forge_Marketplace 分发入口

**User Story:** As a team lead rolling out Forge to my team, I want a single marketplace URL or registry to add, so that team members install Forge with one command.

#### Acceptance Criteria

1. THE project SHALL publish a `marketplace.json` at the repo root or a dedicated `forge-marketplace` branch, declaring Forge_Plugin_Package with: `name`, `description`, `source: { type: "git", url }`, `versionConstraint`, optional `ref` (commit SHA or tag for version pinning).
2. THE `marketplace.json` SHALL support both `ref: "main"` (rolling) and tagged releases via `claude plugin tag`; users can pin to a specific tag with `claude plugin install forge@v1.2.3`.
3. THE `README.md` SHALL add a new installation method "方式三：Plugin 安装（推荐）" as the preferred path: `claude plugin marketplace add https://github.com/<org>/Forge` followed by `claude plugin install forge`.
4. THE Forge_Marketplace source location SHALL be stable for at least 12 months; any relocation requires a deprecation notice in CHANGELOG and `marketplace.json` frontmatter pointing to the new URL.
5. IF Forge is ever blocked by org policy (e.g. user's admin added Forge's marketplace URL to `blockedMarketplaces`), THEN THE installation SHALL fail clearly without partial state; no fallback is attempted.

### Requirement 4: Phase B — 兼容性与双分发期

**User Story:** As an existing Forge user on the clone-based install, I want the plugin transition to not break my existing setup, so that I can migrate at my own pace.

#### Acceptance Criteria

1. WHEN the plugin distribution is introduced, THE Current_Dist_Script SHALL continue to function; `scripts/build-dist.sh` and `scripts/install-dist.sh` still produce and install the traditional dist package for at least 6 months after plugin GA.
2. THE `README.md` SHALL document all three installation methods (clone, dist, plugin) with clear recommendations: plugin is preferred for new users, clone remains for Forge Loop developers, dist remains for air-gapped corporate deployments.
3. THE Forge_Plugin_Package SHALL coexist with an installation done via clone: the `plugin.json` only takes effect when CC discovers the repo as a plugin source; a clone install into `~/.claude/skills/forge/` bypasses `plugin.json` entirely and behaves as before.
4. WHEN a user has Forge installed both via plugin and via clone, THE `/doctor` command output SHALL detect the conflict and suggest removing one; the plugin path wins precedence.
5. THE feasibility report SHALL specify an end-of-life date for Current_Dist_Script (typically 12 months post plugin GA); CHANGELOG and README document the deprecation timeline.

### Requirement 5: Phase B — Plugin 更新与版本管理

**User Story:** As a user running `claude plugin update forge`, I want updates to be incremental and non-destructive to my project-level Forge state, so that upgrades don't wipe my `.forge/` or break pinned skill customizations.

#### Acceptance Criteria

1. THE Forge_Plugin_Package SHALL clearly distinguish "plugin-owned" files (skills, agents, hooks, templates) from "project-owned" files (`.forge/`, `.claude/settings.json` user-added entries); updates never touch project-owned paths.
2. WHEN a user has locally modified a file inside the plugin (e.g. edited a skill frontmatter), THE plugin update SHALL follow CC's standard behavior (overwrite with user warning via `/doctor`); Forge does not add custom merge logic.
3. THE `plugin.json` SHALL include a `scripts.postUpdate` entry (if CC supports it, otherwise document manually) reminding users to run `/forge init` or equivalent after major version updates.
4. THE Forge_Plugin_Package SHALL declare its semver version aligned with `package.json`; breaking changes bump major, new features bump minor, fixes bump patch.
5. THE CHANGELOG SHALL continue to use `[ADDED]`/`[CHANGED]`/`[FIXED]`/`[SECURITY]` prefixes; plugin version bumps are correlated with CHANGELOG entries 1:1.

### Requirement 6: Phase B — MCP server 集成（可选）

**User Story:** As a Forge user who also uses common MCP servers (bitbucket, jira, confluence), I want the plugin to optionally declare a curated MCP bundle, so that I don't need separate `claude mcp add` calls for the standard Forge workflow.

#### Acceptance Criteria

1. THE Forge_Plugin_Package SHALL NOT bundle any third-party MCP servers by default; the base plugin is MCP-free to minimize attack surface and version coupling.
2. THE project SHALL provide an optional secondary plugin `forge-mcp-bundle` (or a profile within the main `plugin.json` if CC supports) that declares a curated set of MCP servers useful for Forge workflows (bitbucket, mcp-atlassian, markitdown).
3. WHEN `forge-mcp-bundle` is installed, THE plugin SHALL use `${user_config.*}` placeholders so users provide their own credentials at enable time, with `sensitive: true` values stored in keychain.
4. THE README SHALL document `forge-mcp-bundle` as optional, explicitly stating no MCP server is required for `/forge` commands to function.
5. THE Forge_Plugin_Package's own MCP declarations (if any in future) SHALL be documented with threat model, data flow, and opt-out path.

### Requirement 7: CI 与测试

**User Story:** As a Forge CI maintainer, I want the plugin packaging to be validated on every push, so that we don't ship a broken plugin to users.

#### Acceptance Criteria

1. THE CI pipeline SHALL include a new step running `claude plugin validate` against `plugin.json`; validation failures block the build.
2. THE CI pipeline SHALL include an integration test that performs `claude plugin install <path-to-local-plugin>`, runs a smoke test `claude -p "/forge status"`, and asserts successful execution.
3. THE contract test suite SHALL verify `plugin.json` schema compliance: required fields present, paths resolvable, version format valid.
4. THE `scripts/build-dist.sh` SHALL also package the plugin form and produce a `dist-plugin/` output alongside the traditional dist, verifying both remain buildable.
5. THE CI SHALL produce an artifact `forge-plugin-<version>.zip` on tag releases, ready for marketplace distribution or manual install.

### Requirement 8: 文档与迁移指南

**User Story:** As an existing user migrating from clone to plugin, I want a written migration guide, so that I understand what changes and what stays the same.

#### Acceptance Criteria

1. THE `README.md` SHALL include a clearly marked "Plugin 迁移指南" section for users switching from clone-install to plugin-install, covering: uninstall current, install plugin, verify, troubleshooting.
2. THE `CHANGELOG.md` SHALL have an entry under the version that introduces plugin distribution, labelled `[ADDED]`, linking to the migration guide.
3. THE `SECURITY.md` SHALL be updated to reference the plugin distribution channel and CC's plugin trust model (trust warning, blocked marketplaces).
4. THE `CONTRIBUTING.md` SHALL document how contributors test local changes via `--plugin-dir` flag without publishing to marketplace.
5. THE `.forge/decisions/` SHALL include an ADR documenting the decision to adopt plugin distribution, Phase A outcome, and the timeline for deprecating Current_Dist_Script.
