---
status: retired-partial
status_note: "受 forge-loop-native-fusion 影响而关闭：目标 SDK Driver 架构已被重构，toSdkSandboxSettings() 为死代码（零运行时调用者），bypassPermissions→acceptEdits 迁移不再适用。Phase 1（声明式配置层）已由 sandbox-phased-implementation 交付；剩余 OS 级隔离（Phase 2/3）需新 spec 跟踪。"
feature: sandbox-execution
layout: requirements
created: 2026-05-16
tier: standard
---
# Requirements Document

## Introduction

Forge Loop 自主执行引擎当前使用 `permissionMode: "bypassPermissions"` 运行 Claude Agent SDK，完全绕过 SDK 内建权限系统。安全防线依赖外部 shell hook（`hooks.json` 中的 bash 命令调用 `check-sandbox.ts`），存在单点故障风险：hooks 缺失/Node 不在 PATH/dist 未构建时系统裸奔。

Claude Agent SDK `0.3.142` 已原生支持 OS 级沙箱（macOS Seatbelt / Linux bubblewrap），通过 `Options.sandbox: SandboxSettings` 提供完整的文件系统和网络隔离能力。本 spec 将 Forge 的沙箱实现迁移到 SDK 原生沙箱之上，获得 OS 级强制执行能力，同时保留 Forge 特有的 frozen zone 保护和 profile 机制。

**核心变更**：
1. 从"自建 PreToolUse shell hook 拦截"迁移到"SDK 原生 OS 级沙箱 + programmatic hooks 补充"
2. 沙箱模式下从 `bypassPermissions`（全部放行靠 hook 拦截）迁移到 `acceptEdits` + SDK sandbox（默认受限，只放行安全操作）

## Glossary

- **SDK 原生沙箱**：Claude Agent SDK 内建的 `Options.sandbox` 能力，使用 macOS Seatbelt / Linux bubblewrap 在 OS 级别隔离 Bash 命令的文件系统和网络访问
- **SandboxSettings**：SDK 导出的沙箱配置类型，包含 `enabled`、`filesystem`、`network` 等字段
- **SandboxProfile**：Forge 层面的命名沙箱配置（如 builder/ci/strict），定义文件系统和网络的隔离范围，映射到 `SandboxSettings`
- **Programmatic Hook**：SDK `Options.hooks` 中的 TypeScript 回调函数（区别于 shell command hook）
- **Frozen Zone**：Forge 的 spec/plan 锁定保护机制，独立于沙箱，保护 `.forge/specs/`、`.forge/plans/` 等文件
- **Shell Hook（旧）**：`hooks.json` 中通过 bash 命令调用 `check-sandbox.js` 的方式（本 spec 将其废弃）

## Requirements

### Requirement 1: 启用 SDK 原生沙箱

**User Story:** 作为 Forge 用户，我希望在 `--sandbox` 模式下获得 OS 级别的文件系统和网络隔离，而非依赖可能缺失的 shell hook。

#### Acceptance Criteria

1. WHEN `--sandbox` 选项启用时，THE SdkAgentAdapter SHALL 在 SDK `Options` 中传入 `sandbox: { enabled: true, ... }` 配置
2. WHEN `--sandbox` 选项启用时，THE SdkAgentAdapter SHALL 使用 `permissionMode: "acceptEdits"` + `allowedTools` 覆盖全部 Claude Code 内建工具，确保 Forge Loop 无人值守且各阶段功能不受限制
3. THE sandbox 配置 SHALL 设置 `failIfUnavailable: true`，确保沙箱依赖缺失时硬失败而非静默降级
4. THE sandbox 配置 SHALL 设置 `autoAllowBashIfSandboxed: true`，沙箱内 Bash 命令自动批准
5. THE sandbox 配置 SHALL 设置 `allowUnsandboxedCommands: false`，禁止模型通过 `dangerouslyDisableSandbox` 逃逸沙箱
6. WHEN `--sandbox` 未指定且无 `.forge/sandbox.json` 时，THE 系统 SHALL 保持现有 `bypassPermissions` 行为不变（向后兼容）
7. THE sandbox 配置 SHALL 设置 `network.allowLocalBinding: true`，允许 dev server 绑定本地端口

### Requirement 2: 文件系统隔离配置

**User Story:** 作为项目管理者，我希望通过配置文件定义 Agent 可写入的文件路径范围。

#### Acceptance Criteria

1. THE `.forge/sandbox.json` 中的 `fileSystem.allow` SHALL 映射到 SDK `sandbox.filesystem.allowWrite`
2. THE `.forge/sandbox.json` 中的 `fileSystem.deny` SHALL 映射到 SDK `sandbox.filesystem.denyWrite`
3. THE 配置 SHALL 支持新增 `fileSystem.denyRead` 字段，映射到 SDK `sandbox.filesystem.denyRead`
4. THE 默认策略 SHALL 允许写入项目根目录（cwd），禁止写入 `.forge/sandbox.json` 和 `.forge/.sandbox-active.json`
5. PATH 格式 SHALL 支持绝对路径（`/`）、home 相对路径（`~/`）和项目相对路径（`./`）

### Requirement 3: 网络隔离配置

**User Story:** 作为安全管理者，我希望限制 Agent 的网络访问范围，防止数据泄露。

#### Acceptance Criteria

1. THE `.forge/sandbox.json` 中的 `network.allow` SHALL 映射到 SDK `sandbox.network.allowedDomains`
2. THE 配置 SHALL 支持新增 `network.deny` 字段，映射到 SDK `sandbox.network.deniedDomains`
3. WHEN `network.mode` 为 `"none"` 时，SHALL 映射为 `sandbox.network.allowManagedDomainsOnly: true` 且 `allowedDomains: []`
4. WHEN `network.mode` 为 `"restricted"` 时，SHALL 映射为 `sandbox.network.allowManagedDomainsOnly: true` 且 `allowedDomains` 为配置值
5. WHEN `network.mode` 为 `"open"` 时，SHALL 不设置网络限制（SDK 默认行为）

### Requirement 4: Sandbox Profile 机制

**User Story:** 作为 Forge 用户，我希望通过 profile 为不同场景预定义文件系统和网络的隔离范围。

#### Acceptance Criteria

1. THE `.forge/sandbox.json` SHALL 支持 `version: 2` 格式，包含 `profiles` 字段定义多个命名 profile
2. THE CLI SHALL 支持 `--sandbox=<profile-name>` 语法选择特定 profile
3. WHEN `--sandbox` 无参数时，SHALL 使用 `activeProfile` 字段指定的 profile（默认 `"builder"`）
4. EACH profile SHALL 定义独立的 `fileSystem` 和 `network` 隔离范围，但不限制工具可用性（Forge Loop 功能完整性优先）
5. THE 系统 SHALL 支持 `version: 1`（现有格式）自动升级为 `version: 2` 单 profile 映射

### Requirement 5: Frozen Zone 保护迁移

**User Story:** 作为 Forge 用户，我希望 frozen zone 保护从 shell hook 迁移到 SDK programmatic hook，消除对外部 shell 脚本的依赖。

#### Acceptance Criteria

1. THE frozen zone 检查 SHALL 通过 SDK `Options.hooks.PreToolUse` 回调实现（TypeScript 函数，非 shell 命令）
2. THE programmatic hook SHALL 对 Write/Edit 工具调用检查目标路径是否在 frozen zone 内
3. WHEN frozen zone 违规时，THE hook SHALL 返回 `permissionDecision: "deny"` 和描述性 reason
4. THE programmatic hook SHALL 与 SDK 原生沙箱共存，两者独立生效
5. THE 旧 shell hook（`hooks.json` 中的 `check-sandbox` 条目）SHALL 标记为 deprecated

### Requirement 6: 废弃旧沙箱 Shell Hook

**User Story:** 作为维护者，我希望移除对外部 shell hook 的依赖，简化架构。

#### Acceptance Criteria

1. THE `hooks.json` 中的 `check-sandbox` 相关条目 SHALL 标记为 deprecated（Phase 1 保留兼容）
2. THE `check-sandbox.ts` 的 CLI 入口 SHALL 保留但标记为 deprecated，仅用于向后兼容
3. THE `HooksProtectionMissingError` SHALL 在沙箱模式下降级为 warning（不再是唯一防线）
4. THE `.forge/.sandbox-active.json` 运行时文件 SHALL 不再需要（SDK 内部管理沙箱状态）

### Requirement 7: 向后兼容

**User Story:** 作为现有用户，我希望升级后不改变任何配置即可正常使用。

#### Acceptance Criteria

1. WHEN 无 `--sandbox` 选项且无 `.forge/sandbox.json` 时，THE 系统行为 SHALL 与升级前完全一致
2. THE 现有 `sandbox-policy.ts` 的纯函数接口 SHALL 保留（`checkFileAccess`、`checkNetworkAccess`、`validatePolicy`、`buildDefaultPolicy`）
3. THE 现有测试 SHALL 继续通过，无需修改
4. THE `--sandbox` 选项 SHALL 保持与现有 CLI 接口兼容
