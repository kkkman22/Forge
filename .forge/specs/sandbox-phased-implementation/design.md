---
feature: sandbox-phased-implementation
layout: design
created: 2026-05-29
---

# 分阶段沙箱实现 — 设计文档

## 概述

将 `sandbox-execution` 原 spec 的完整 OS 级沙箱拆分为三阶段渐进实现。Phase 1 实现声明式配置和 SKILL 层 advisory 检查，不依赖平台特定代码。

## 设计决策

### D1: 配置文件位置与格式

文件: `.forge/sandbox.json`

```typescript
interface SandboxConfig {
  version: 1;
  profile: string;
  filesystem: {
    read: string[];    // glob 模式
    write: string[];   // glob 模式
    deny: string[];    // glob 模式（优先级最高）
  };
  network: {
    allow: string[];   // 域名或 URL pattern
    deny: string[];    // "*" 表示全部拒绝
  };
  commands: {
    allow: string[];   // 命令前缀
    deny: string[];    // 完整命令或前缀
  };
}
```

设计考量：
- `deny` 列表优先级高于 `allow`，避免意外放行
- glob 模式使用 `micromatch` 兼容语法（`**`、`*`、`?`）
- `network.deny: ["*"]` 表示默认拒绝所有网络访问
- 配置缺失时等同于全部允许（优雅降级）

### D2: 纯函数 API

```typescript
// src/sandbox-policy.ts 扩展

interface SandboxCheckResult {
  allowed: boolean;
  reason: string;
  matchedRule?: string;  // 匹配到的规则
}

/** 检查文件路径是否允许指定操作 */
function checkFilesystemPolicy(
  path: string,
  operation: 'read' | 'write',
  config: SandboxConfig
): SandboxCheckResult;

/** 检查命令是否允许执行 */
function checkCommandPolicy(
  command: string,
  config: SandboxConfig
): SandboxCheckResult;

/** 检查网络请求是否允许 */
function checkNetworkPolicy(
  url: string,
  config: SandboxConfig
): SandboxCheckResult;

/** 加载配置文件，缺失时返回默认（全部允许） */
function loadSandboxConfig(configPath?: string): SandboxConfig;

/** 合并 profile 配置 */
function resolveProfile(
  config: SandboxConfig,
  profileName: string
): SandboxConfig;
```

匹配逻辑：
```
checkFilesystemPolicy(path, operation, config):
  1. 检查 deny 列表 → 命中则 allowed: false
  2. 检查 allow 列表（read 或 write）→ 命中则 allowed: true
  3. 未命中任何规则 → allowed: true（默认允许）
```

### D3: Advisory 模式集成点

在以下 SKILL 步骤中集成 sandbox 检查：

| SKILL | 步骤 | 检查类型 |
|-------|------|---------|
| forge-build | 写入 src/ 文件 | checkFilesystemPolicy write |
| forge-review | 读取 src/ 文件 | checkFilesystemPolicy read |
| forge-ship | 执行 git 命令 | checkCommandPolicy |
| forge-plan | 读取 .forge/ 文件 | checkFilesystemPolicy read |

集成方式（SKILL 文档中）：
```markdown
### 文件写入前检查

调用 `checkFilesystemPolicy(targetPath, 'write', sandboxConfig)`。
如果返回 `allowed: false`：
- 输出警告：⚠️ 沙箱策略建议阻止此操作：{reason}
- **Phase 1 不阻断**，仅 advisory
- 如果开发者确认需要操作，可继续
```

### D4: Profile 系统

预定义 profile：

| Profile | 说明 |
|---------|------|
| `default` | 全部允许（forge init 生成的默认值） |
| `strict` | 仅允许 src/ 和 .forge/ 的读写，禁止网络 |
| `readonly` | 仅允许读取，禁止任何写入 |
| `ci` | CI 环境 profile，禁止写入 .forge/ 进度文件 |

Profile 定义方式：`.forge/sandbox.json` 中可定义多个 profile，通过 `--sandbox <profile>` 选择。

### D5: forge init 集成

`forge init` 生成的模板：

```json
{
  "version": 1,
  "profile": "default",
  "filesystem": {
    "read": ["**"],
    "write": ["**"],
    "deny": []
  },
  "network": {
    "allow": ["*"],
    "deny": []
  },
  "commands": {
    "allow": ["*"],
    "deny": []
  }
}
```

模板中包含注释（通过 JSONC 或单独的 _sandbox.example.jsonc_ 说明各字段）。

### D6: CLI 选项增强

```
--sandbox            使用 .forge/sandbox.json 中的 default profile
--sandbox <profile>  使用指定 profile
--sandbox=off        禁用沙箱检查（等同于全部允许）
```

无 `--sandbox` 参数时行为不变（不加载沙箱配置）。

## 风险

| 风险 | 缓解 |
|------|------|
| Advisory 模式形同虚设 | Phase 1 目标是建立配置基础设施，enforcement 在 Phase 3 |
| Glob 匹配性能 | 配置文件小（< 50 条规则），micromatch 足够快 |
| Profile 管理复杂度 | Phase 1 仅支持预定义 profile，不支持用户自定义 |

## Phase 2/3 展望

### Phase 2: OS 级隔离
- macOS: 生成 `sandbox-exec` (Seatbelt) profile
- Linux: 生成 `bwrap` (bubblewrap) 命令行
- 从 SandboxConfig 的 filesystem 规则生成平台特定配置
- 需要 `scripts/generate-sandbox-profile.mjs`

### Phase 3: Enforcement 模式
- PreToolUse hook 集成 `checkFilesystemPolicy`
- `allowed: false` 时 exit 2 阻断工具调用
- 网络隔离通过 PreToolUse hook 拦截 WebSearch/WebFetch
