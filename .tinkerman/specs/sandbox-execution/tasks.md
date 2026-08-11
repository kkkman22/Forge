---
feature: sandbox-execution
layout: tasks
created: 2026-05-16
spec_ref: ".tinkerman/specs/sandbox-execution/requirements.md"
---

# Implementation Plan: Sandbox Execution v2 — SDK Native Sandbox

## Overview

将 Forge 沙箱从自建 PreToolUse shell hook 迁移到 Claude Agent SDK 原生 OS 级沙箱（macOS Seatbelt / Linux bubblewrap），同时引入 profile 机制和 programmatic hooks。

## Task Dependency Graph

```json
{
  "waves": [
    { "id": "wave1", "tasks": ["1.1", "1.2"], "description": "SDK 升级验证" },
    { "id": "wave2", "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5"], "description": "Sandbox Profile 模块" },
    { "id": "wave3", "tasks": ["3.1", "3.2"], "description": "Frozen Zone Hook" },
    { "id": "wave4", "tasks": ["4.1", "4.2", "4.3"], "description": "SdkAgentAdapter 集成" },
    { "id": "wave5", "tasks": ["5.1", "5.2"], "description": "CLI 集成" },
    { "id": "wave6", "tasks": ["6.1", "6.2", "6.3", "6.4"], "description": "废弃旧机制" },
    { "id": "wave7", "tasks": ["7.1", "7.2", "7.3"], "description": "最终验证" }
  ]
}
```

## Tasks

- [ ] 1. 升级 SDK 并验证兼容性
  - [x] 1.1 升级 `@anthropic-ai/claude-agent-sdk` 到 `0.3.142`
    - `npm install @anthropic-ai/claude-agent-sdk@latest`
    - 验证 `SandboxSettings` 类型可用
    - _Requirements: 1.1_

  - [ ] 1.2 运行全量测试确认无 breaking changes
    - `npm run check`（tsc + biome + vitest + scripts）
    - 确认所有现有测试通过
    - _Requirements: 7.3_

## 

- [ ] 2. 实现 Sandbox Profile 模块 (`src/sandbox-profile.ts`) — TDD
  - [ ] 2.1 编写测试 → 实现：类型定义和 v1/v2 格式解析
    - `SandboxConfigV1`、`SandboxConfigV2`、`SandboxProfile` 类型
    - `loadSandboxProfile(cwd, profileName?)` 函数
    - v1 格式自动升级为 v2 单 profile
    - 无配置文件时返回默认 builder profile
    - _Requirements: 4.1, 4.6, 7.2_

  - [ ] 2.2 编写测试 → 实现：`toSdkSandboxSettings()` 配置转换
    - `fileSystem.allow` → `sandbox.filesystem.allowWrite`
    - `fileSystem.deny` → `sandbox.filesystem.denyWrite`
    - `fileSystem.denyRead` → `sandbox.filesystem.denyRead`
    - `network.mode` 三种模式映射
    - `network.allow` → `sandbox.network.allowedDomains`
    - `network.deny` → `sandbox.network.deniedDomains`
    - 固定字段：`enabled: true`、`failIfUnavailable: true`、`autoAllowBashIfSandboxed: true`、`allowUnsandboxedCommands: false`、`network.allowLocalBinding: true`
    - _Requirements: 1.1, 1.4-1.8, 2.1-2.5, 3.1-3.5_

  - [ ] 2.3 编写测试 → 实现：profile 只控制文件系统和网络隔离
    - builder profile → 宽松文件系统 + restricted 网络
    - strict profile → 限制文件系统 + none 网络
    - 所有 profile 下工具可用性不受限制
    - _Requirements: 4.4_

  - [ ] 2.4 定义 `FORGE_LOOP_TOOLS` 常量
    - 包含全部 Claude Code 内建工具：Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, Agent, NotebookEdit, TodoWrite
    - 编写测试验证常量完整性（覆盖 plan/decide/build/review/ship 各阶段无人值守）
    - _Requirements: 1.2_

  - [ ] 2.5 编写属性测试 (`test/sandbox-profile.property.test.ts`)
    - P1: `toSdkSandboxSettings` 输出始终包含 `enabled: true` 和 `failIfUnavailable: true`
    - P2: `network.mode = "none"` 映射后 `allowedDomains` 为空数组
    - P3: 所有 profile 下 `FORGE_LOOP_TOOLS` 包含 Write/Edit/Bash/Read 等核心工具（无人值守不变量）
    - _Requirements: 1.2, 1.4, 3.3_

## 

- [ ] 3. 实现 Frozen Zone Programmatic Hook (`src/frozen-zone-hook.ts`) — TDD
  - [ ] 3.1 编写测试 → 实现：`createFrozenZoneHook()` 工厂函数
    - 返回符合 SDK `HookCallback` 签名的函数
    - 对 Write/Edit 工具提取 `file_path` 或 `path` 字段
    - 调用现有 `checkFrozenZone()` 纯函数判断
    - frozen zone 违规时返回 `{ hookSpecificOutput: { permissionDecision: "deny", ... } }`
    - 非 frozen zone 路径返回 `{}`（放行）
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 3.2 编写测试：hook 与 SDK 沙箱共存
    - 验证 hook 返回格式符合 `SyncHookJSONOutput` 类型
    - 验证 frozen zone 检查独立于 sandbox filesystem 配置
    - _Requirements: 5.4_

## 

- [ ] 4. 集成到 SdkAgentAdapter (`src/sdk-agent-adapter.ts`) — 修改
  - [ ] 4.1 修改 `SdkAgentAdapterConfig` 接口
    - 新增 `sandboxProfile?: SandboxProfile` 可选字段
    - _Requirements: 1.1_

  - [ ] 4.2 修改 `run()` 方法中的 `sdkOptions` 构建
    - 当 `sandboxProfile` 存在时：`permissionMode: "acceptEdits"`，注入 `allowedTools: FORGE_LOOP_TOOLS`、`sandbox`、`hooks` 字段，不设置 `allowDangerouslySkipPermissions`
    - 当 `sandboxProfile` 不存在时：保持现有 `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true`
    - _Requirements: 1.1, 1.2, 1.6, 5.1_

  - [ ] 4.3 更新 `sdk-agent-adapter.test.ts`
    - 新增测试：sandbox profile 存在时 `permissionMode` 为 `"acceptEdits"`
    - 新增测试：sandbox profile 存在时 `allowedTools` 包含 FORGE_LOOP_TOOLS 全部工具
    - 新增测试：sandbox profile 存在时 Options 包含 sandbox 字段
    - 新增测试：sandbox profile 不存在时保持 `permissionMode: "bypassPermissions"`
    - 新增测试：hooks 字段包含 frozen zone hook
    - _Requirements: 1.2, 1.6, 5.1, 7.1_

## 

- [ ] 5. CLI 集成 (`src/forge-loop-cli.ts`) — 修改
  - [ ] 5.1 扩展 `--sandbox` 选项支持 profile 名称
    - `--sandbox`（无参数）→ 使用 activeProfile
    - `--sandbox=reviewer` → 使用指定 profile
    - `--sandbox=false` → 禁用沙箱
    - _Requirements: 4.2, 4.3_

  - [ ] 5.2 在 SdkDriver 启动流程中加载 profile
    - 调用 `loadSandboxProfile(cwd, profileName)`
    - 将 profile 传递给 `SdkAgentAdapterConfig`
    - _Requirements: 1.1, 4.2_

## 

- [ ] 6. 废弃旧沙箱机制
  - [ ] 6.1 标记 `check-sandbox.ts` CLI 入口为 deprecated
    - 添加 `@deprecated` JSDoc 注释
    - 保留功能不删除（向后兼容）
    - _Requirements: 6.2_

  - [ ] 6.2 标记 `hooks.json` 中 check-sandbox 条目为 deprecated
    - 添加注释说明已被 SDK 原生沙箱替代
    - 保留条目不删除（向后兼容）
    - _Requirements: 6.1_

  - [ ] 6.3 修改 SdkDriver 中 `.sandbox-active.json` 写入逻辑
    - 沙箱模式下不再写入 `.sandbox-active.json`（SDK 内部管理）
    - 非沙箱模式保持现有行为（shell hook 仍需此文件）
    - _Requirements: 6.4_

  - [ ] 6.4 修改 `HooksProtectionMissingError` 行为
    - 沙箱模式下降级为 warning（SDK 沙箱是主防线）
    - 非沙箱模式保持现有 error 行为
    - _Requirements: 6.3_

## 

- [ ] 7. 最终验证
  - [ ] 7.1 运行全量测试套件
    - `npm run check` 全部通过
    - 现有 `sandbox-policy.test.ts` 和 `check-sandbox.test.ts` 不修改仍通过
    - _Requirements: 7.3_

  - [ ] 7.2 向后兼容验证
    - 无 `--sandbox` 时行为与升级前完全一致
    - 有 `--sandbox` 但无 `.tinkerman/sandbox.json` 时使用默认 builder profile
    - _Requirements: 7.1, 7.4_

  - [ ] 7.3 类型检查 + lint
    - `tsc --noEmit` 通过
    - `biome check src/ test/` 通过
    - _Requirements: 7.3_


## Notes

### 实现注意事项

- **沙箱模式 vs 非沙箱模式分支**：sdk-agent-adapter.ts 中的 `sdkOptions` 构建必须明确区分两种模式，避免参数混用导致类型错误（`allowDangerouslySkipPermissions: true` 仅在非沙箱模式下设置）
- **SDK 沙箱平台依赖**：macOS 上 Seatbelt 开箱即用；Linux/WSL2 需要 `bubblewrap + socat`，`failIfUnavailable: true` 会硬失败而非静默降级
- **`startup()` 与 sandbox 配置**：`Options` 在 `startup()` 调用时传入即可生效，不需要在每次 `query()` 时重传

### 已知风险

- **TLS 检查限制**：SDK sandbox 的网络代理基于 hostname 过滤，不做 TLS 检查，存在 domain fronting 风险（参考官方文档）。如果项目威胁模型要求 TLS 检查，需配置自定义代理
- **Write/Edit 不经过 OS 沙箱**：SDK sandbox 只隔离 Bash 子进程，Write/Edit 工具的路径限制依赖 `acceptEdits` permissionMode（cwd 内自动批准，cwd 外不自动批准），需通过测试验证 cwd 外路径的实际行为

### 开放问题

- 后续是否需要为 `forge review` 阶段定义只读 profile（disallowedTools 包含 Write/Edit）？当前 spec 范围仅覆盖文件系统/网络隔离，工具级限制留待后续 spec 决策
- `dangerouslyDisableSandbox` 逃逸路径已通过 `allowUnsandboxedCommands: false` 关闭，但需要在集成测试中验证模型确实无法逃逸
