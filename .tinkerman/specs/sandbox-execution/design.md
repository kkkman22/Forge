---
feature: sandbox-execution
layout: design
created: 2026-05-16
---

# 设计文档：沙箱执行环境 v2 — 基于 SDK 原生沙箱

## Overview

将 Forge 的沙箱实现从"自建 PreToolUse shell hook"迁移到"Claude Agent SDK 原生 OS 级沙箱"。SDK 沙箱使用 macOS Seatbelt / Linux bubblewrap 在内核级别隔离 Bash 命令的文件系统和网络访问，所有子进程（kubectl、terraform、npm 等）自动继承限制。Forge 层面保留配置管理（`.tinkerman/sandbox.json`）和 profile 机制，通过配置转换层将 Forge 格式映射为 SDK `SandboxSettings`。

**关键架构决策**：
- 沙箱模式下使用 `permissionMode: "acceptEdits"` 替代 `bypassPermissions`——Write/Edit 由 `acceptEdits` 自动批准（限制在 cwd 内），Bash 由 SDK sandbox 自动批准（OS 级隔离），不再是"全部放行靠 hook 拦截"
- 非沙箱模式保留 `bypassPermissions` 作为向后兼容
- Write/Edit 工具不经过 OS 沙箱（只隔离 Bash），通过 SDK programmatic hooks 保护 frozen zone

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  .tinkerman/sandbox.json (Forge 配置层)                              │
│  version: 2, profiles: { builder, ci, strict }                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  src/sandbox-profile.ts (配置转换层)                              │
│  loadSandboxProfile(cwd, profileName?) → SandboxProfile          │
│  toSdkSandboxSettings(profile) → SandboxSettings                 │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ SDK Options      │ │ SDK Options      │ │ SDK Options      │
│ .sandbox         │ │ .allowedTools    │ │ .hooks           │
│ (OS 级 Bash 隔离)│ │ (全工具预批准)    │ │ (frozen zone)    │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

## Data Models

## Components and Interfaces

### 1. SandboxProfile 类型 (`src/sandbox-profile.ts` — 新模块)

```typescript
/** Forge sandbox.json v2 格式 */
interface SandboxConfigV2 {
  version: 2;
  activeProfile: string;
  profiles: Record<string, SandboxProfile>;
}

/** Forge sandbox.json v1 格式（现有，向后兼容） */
interface SandboxConfigV1 {
  fileSystem: FileSystemPolicy;
  network: NetworkPolicy;
}

/** 单个 profile 定义 — 只控制文件系统和网络隔离范围，不限制工具可用性 */
interface SandboxProfile {
  /** 文件系统策略 */
  fileSystem: {
    allow: string[];
    deny: string[];
    denyRead?: string[];
  };
  /** 网络策略 */
  network: {
    mode: "none" | "restricted" | "open";
    allow?: string[];
    deny?: string[];
  };
}

/** 加载 profile，支持 v1 自动升级 */
function loadSandboxProfile(cwd: string, profileName?: string): SandboxProfile;

/** 将 Forge profile 转换为 SDK SandboxSettings */
function toSdkSandboxSettings(profile: SandboxProfile, cwd: string): SandboxSettings;
```

### 2. SDK Options 集成 (`src/sdk-agent-adapter.ts` — 修改)

```typescript
// 沙箱模式下的 SDK Options 构建
const sdkOptions: Options = {
  cwd,

  // ★ 沙箱模式：acceptEdits（默认受限）vs 非沙箱：bypassPermissions（向后兼容）
  permissionMode: sandboxProfile ? "acceptEdits" : "bypassPermissions",
  allowDangerouslySkipPermissions: !sandboxProfile,

  // ★ 预批准全部 Claude Code 内建工具（Forge Loop 无人值守 + 功能不受限制）
  ...(sandboxProfile && {
    allowedTools: FORGE_LOOP_TOOLS,
  }),

  // ★ SDK 原生沙箱（OS 级 Bash 隔离）
  sandbox: sandboxProfile ? toSdkSandboxSettings(sandboxProfile, cwd) : undefined,

  // ★ Programmatic hooks（frozen zone 保护）
  hooks: sandboxProfile ? {
    PreToolUse: [{
      matcher: "Write|Edit",
      hooks: [createFrozenZoneHook(cwd)],
      timeout: 5,
    }],
  } : undefined,

  outputFormat: { ... },
  systemPrompt: { ... },
};

/**
 * Forge Loop 全流程所需的完整工具集。
 * 覆盖 plan/decide/build/review/ship 各阶段的无人值守执行。
 * 沙箱模式下所有工具功能不受限制，安全边界由 OS 级沙箱（文件系统+网络）和 frozen zone hook 提供。
 */
const FORGE_LOOP_TOOLS = [
  "Read", "Write", "Edit",           // 文件操作
  "Bash",                             // 命令执行（沙箱内 OS 级隔离）
  "Glob", "Grep",                     // 搜索
  "WebFetch", "WebSearch",            // 网络查询（decide/plan 阶段研究）
  "Agent",                            // Subagent（decide 多视角、review 多层）
  "NotebookEdit",                     // Notebook 编辑
  "TodoWrite",                        // 任务追踪
];
```

**权限模式对比**：

| 工具 | 非沙箱模式 (`bypassPermissions`) | 沙箱模式 (`acceptEdits` + `allowedTools` + sandbox) |
|------|------|------|
| Write/Edit | 全部放行（靠 shell hook 拦截 frozen zone） | `allowedTools` 预批准 + programmatic hook 保护 frozen zone |
| Bash | 全部放行（靠 shell hook 检测网络命令） | `allowedTools` 预批准 + SDK sandbox OS 级隔离 + `autoAllowBashIfSandboxed` |
| Read/Glob/Grep | 全部放行 | `allowedTools` 预批准 |
| WebFetch/WebSearch | 全部放行 | `allowedTools` 预批准 |
| Agent | 全部放行 | `allowedTools` 预批准（subagent 继承父级 permissionMode） |

**无人值守保证**：`allowedTools` 覆盖全部工具 → 不会触发交互式权限提示。安全边界完全由 OS 级沙箱（文件系统/网络隔离）和 frozen zone hook 提供，不依赖工具级限制。

### 3. Frozen Zone Programmatic Hook (`src/frozen-zone-hook.ts` — 新模块)

```typescript
import type { HookCallback, PreToolUseHookInput, SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk";

/**
 * 创建 frozen zone 保护的 SDK programmatic hook。
 * 替代旧的 shell hook（hooks.json 中的 check-frozen bash 命令）。
 */
function createFrozenZoneHook(cwd: string): HookCallback {
  return async (input, toolUseId, { signal }) => {
    const preInput = input as PreToolUseHookInput;
    const toolInput = preInput.tool_input as Record<string, unknown>;
    const filePath = (toolInput.file_path ?? toolInput.path ?? "") as string;

    if (!filePath) return {};

    // 复用现有 checkFrozenZone 纯函数
    const decision = checkFrozenZone(filePath, cwd);
    if (!decision.allowed) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: decision.reason,
        },
      };
    }
    return {};
  };
}
```

### 4. sandbox.json v2 格式示例

```json
{
  "version": 2,
  "activeProfile": "builder",
  "profiles": {
    "builder": {
      "fileSystem": {
        "allow": ["."],
        "deny": [".tinkerman/sandbox.json"]
      },
      "network": {
        "mode": "restricted",
        "allow": ["registry.npmjs.org", "api.anthropic.com"]
      }
    },
    "ci": {
      "fileSystem": {
        "allow": ["."],
        "deny": [".tinkerman/sandbox.json", ".env"]
      },
      "network": {
        "mode": "restricted",
        "allow": ["registry.npmjs.org", "api.anthropic.com", "github.com"]
      }
    },
    "strict": {
      "fileSystem": {
        "allow": ["./src", "./test"],
        "deny": [".tinkerman/sandbox.json", ".env", ".git"]
      },
      "network": { "mode": "none" }
    }
  }
}
```

### 5. 配置映射规则

| Forge 配置 | SDK SandboxSettings 字段 |
|-----------|-------------------------|
| `fileSystem.allow` | `sandbox.filesystem.allowWrite` |
| `fileSystem.deny` | `sandbox.filesystem.denyWrite` |
| `fileSystem.denyRead` | `sandbox.filesystem.denyRead` |
| `network.mode = "none"` | `sandbox.network.allowManagedDomainsOnly: true, allowedDomains: []` |
| `network.mode = "restricted"` | `sandbox.network.allowManagedDomainsOnly: true, allowedDomains: [...]` |
| `network.mode = "open"` | 不设置网络限制 |
| `network.allow` | `sandbox.network.allowedDomains` |
| `network.deny` | `sandbox.network.deniedDomains` |

## Correctness Properties

### Property 1: OS 级隔离不可绕过

*For any* Bash 命令在沙箱模式下执行，其文件写入和网络访问 SHALL 受 OS 级限制，无论命令如何编码或串联。**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: 向后兼容

*For any* 不使用 `--sandbox` 的调用，系统行为 SHALL 与升级前完全一致（`bypassPermissions` + shell hooks）。**Validates: Requirements 7.1**

### Property 3: Profile 隔离

*For any* profile 下的执行，Forge Loop 全部工具功能 SHALL 不受限制，安全边界仅由文件系统/网络隔离和 frozen zone 提供。**Validates: Requirements 1.2, 4.4**

### Property 4: Frozen zone 独立性

*For any* frozen zone 内的文件，无论沙箱是否启用，Write/Edit SHALL 被 programmatic hook 拒绝。**Validates: Requirements 5.2, 5.4**

### Property 5: 沙箱 + frozen zone 双重防线

*For any* 同时在 frozen zone 和 sandbox deny 列表中的路径，两个机制 SHALL 独立生效，任一拒绝即阻断。**Validates: Requirements 5.4**

## Error Handling

| 错误场景 | 处理方式 |
|---------|---------|
| macOS 上 Seatbelt 不可用 | `failIfUnavailable: true` → SDK 返回 error result，SdkDriver 抛出异常 |
| Linux 上 bubblewrap 未安装 | 同上，错误信息包含安装指引 |
| `.tinkerman/sandbox.json` 格式错误 | `validatePolicy()` 返回错误，回退到默认 builder profile + warning 日志 |
| Profile 名称不存在 | 抛出 `ForgeError`，提示可用 profile 列表 |
| Frozen zone hook 超时（>5s） | SDK 自动终止 hook，工具调用被拒绝 |
| v1 格式 sandbox.json 加载 | 自动升级为 v2 单 profile，不报错 |

## Testing Strategy

### 单元测试
- `sandbox-profile.ts`：v1→v2 升级、profile 加载、`toSdkSandboxSettings` 映射正确性
- `frozen-zone-hook.ts`：hook 回调返回正确的 deny/allow 决策

### 属性测试（PBT）
- Property 1：`toSdkSandboxSettings` 输出始终包含 `enabled: true` 和 `failIfUnavailable: true`
- Property 2：`network.mode = "none"` 映射后 `allowedDomains` 为空数组
- Property 3：所有 profile 下 `allowedTools` 始终包含 FORGE_LOOP_TOOLS 全部工具（无人值守不变量）
- Property 4：frozen zone 路径在任何 profile 下都被 hook 拒绝
- 现有 `sandbox-policy.property.test.ts` 继续通过

### 集成测试
- SDK sandbox option 正确传递（mock SDK 验证 Options 结构）
- `--sandbox` 启用时 `sandbox.enabled = true` 且 `permissionMode = "acceptEdits"`
- `--sandbox` 启用时 `allowedTools` 包含 FORGE_LOOP_TOOLS 全部工具
- 无 `--sandbox` 时 Options 中无 sandbox 字段，`permissionMode = "bypassPermissions"`

### E2E 测试（手动验证）
- macOS 上 Seatbelt 实际拦截项目外文件写入
- 网络限制实际阻断未授权域名访问

## Migration Path

```
Phase 1（本 spec）— SDK 原生沙箱集成
├── 新增 src/sandbox-profile.ts（配置转换 + FORGE_LOOP_TOOLS 常量）
├── 新增 src/frozen-zone-hook.ts（programmatic hook）
├── 修改 sdk-agent-adapter.ts（沙箱模式下：acceptEdits + allowedTools + sandbox + hooks）
├── 保留 shell hooks 兼容（deprecated 标记）
├── 保留 check-sandbox.ts（deprecated 标记）
└── 所有现有测试继续通过

Phase 2（后续）— 清理旧代码
├── 移除 hooks.json 中的 check-sandbox 条目
├── 移除 .sandbox-active.json 写入逻辑
├── HooksProtectionMissingError 降级为 warning
└── 更新文档
```
