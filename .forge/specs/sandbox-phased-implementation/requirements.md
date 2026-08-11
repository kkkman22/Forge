---
status: retired-partial
status_note: "受 forge-loop-native-fusion 影响而关闭：--sandbox <profile> CLI 的消费方 SdkDriver 已被删除，.sandbox-active.json 激活路径失效。已交付：checkSandboxPolicy 纯函数、sandbox-profile.ts、forge init 模板、4 处 SKILL checkpoint（advisory 模式）。Phase 2/3（OS 级隔离 + enforcement）需新 spec 针对后 fusion 架构设计。"
feature: sandbox-phased-implementation
layout: requirements
created: 2026-05-29
tier: standard
---
# 分阶段沙箱实现

## 背景

`sandbox-execution` spec 设计了完整的 OS 级沙箱隔离，但实际实现仅有 CLI `--sandbox` 选项声明和 SDK 沙箱策略类型定义。完整沙箱需要平台特定代码（macOS Seatbelt / Linux bubblewrap），工程量大且平台差异高。

本 spec 将原 sandbox-execution 拆分为可独立交付的阶段，优先实现高价值、低成本的声明式配置层。

## 阶段规划

### Phase 1: 声明式沙箱配置（本 spec 重点）

**目标**：让项目通过 `.forge/sandbox.json` 声明文件系统访问权限，即使没有 OS 级隔离，也能在 SKILL 层面做基本的权限检查。

#### 1.1 配置文件格式

```json
{
  "version": 1,
  "profile": "default",
  "filesystem": {
    "read": ["src/**", ".forge/**", "package.json", "tsconfig.json"],
    "write": ["src/**", ".forge/progress/**", ".forge/reviews/**"],
    "deny": [".env", "**/*.key", "**/*.pem", "node_modules/**"]
  },
  "network": {
    "allow": [],
    "deny": ["*"]
  },
  "commands": {
    "allow": ["git", "node", "npm", "npx"],
    "deny": ["rm -rf /", "sudo"]
  }
}
```

#### 1.2 SKILL 层权限检查

- SKILL 文档中，涉及文件写入的步骤增加 sandbox 检查点
- 纯函数 `checkSandboxPolicy(path, operation, config) => { allowed, reason }`
- `allowed: false` 时 SKILL 输出警告但不阻断（Phase 1 为 advisory 模式）

#### 1.3 `forge init` 集成

- `forge init` 生成 `.forge/sandbox.json` 模板（全部允许）
- 模板中包含注释说明各字段用途

#### 1.4 `--sandbox` CLI 增强

- `--sandbox` 选项接受 profile 名称（如 `--sandbox strict`）
- `--sandbox` 无参数时使用 `.forge/sandbox.json` 中的 `default` profile
- Profile 不存在时报错退出

### Phase 2: OS 级隔离（后续 spec）

- macOS: Seatbelt (sandbox-exec) profile 生成
- Linux: bubblewrap (bwrap) 命令行生成
- Docker: 容器化执行环境
- 此阶段需要专门的平台测试环境，不在本 spec 范围内

### Phase 3: 运行时强制（后续 spec）

- Phase 1 的 advisory 模式升级为 enforcement 模式
- `allowed: false` 时阻断操作
- 需要 PreToolUse hook 集成

## 验收标准（Phase 1）

- [ ] `.forge/sandbox.json` schema 定义完成
- [ ] `checkSandboxPolicy` 纯函数实现并有单元测试
- [ ] `forge init` 生成 sandbox.json 模板
- [ ] `--sandbox <profile>` CLI 选项解析正确
- [ ] SKILL 文档中至少 3 个步骤集成 sandbox 检查点（advisory 模式）
- [ ] 配置缺失时优雅降级（等同于全部允许）

## 依赖

- `sandbox-execution` 原 spec（参考设计意图）
- `src/sandbox-policy.ts`（已有类型定义）
- `src/sandbox-profile.ts`（已有 profile 支持）
- `forge init` SKILL

## 非目标

- Phase 1 不实现 OS 级隔离
- Phase 1 不实现 enforcement 模式（仅 advisory）
- 不实现网络级沙箱（仅配置声明）
