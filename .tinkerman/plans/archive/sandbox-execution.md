---
status: approved
created: "2026-04-29"
task: "沙箱执行环境（v3.0）"
tier: standard
spec: ".kiro/specs/sandbox-execution/requirements.md"
---

# 实现计划：沙箱执行环境

## 架构决策

### 执行机制
沙箱策略通过 **PreToolUse hook** 执行（与现有 `check-frozen.ts` 相同模式）。`hooks/hooks.json` 添加 sandbox hook 条目，hook 脚本读取运行时策略配置进行拦截。

### 运行时激活
`--sandbox` CLI 选项激活沙箱模式时，SdkDriver 写入 `.tinkerman/.sandbox-active.json`（含解析后的策略）。hook 脚本检查此文件是否存在来决定是否执行。进程退出时清理。

### 依赖
- 添加 `minimatch` 为直接依赖（已有传递依赖 v10.2.5，需显式声明）

## 实现步骤

### Task 1: 沙箱策略模块 (`src/sandbox-policy.ts`) — TDD

**RED → GREEN → REFACTOR**

1.1 添加 minimatch 依赖
- `npm install minimatch`（运行时依赖）

1.2 编写测试 → 实现：类型定义
- `FileSystemPolicy`, `NetworkPolicy`, `PermissionPolicy`, `AccessDecision`
- `SandboxRuntimeConfig`（含 projectRoot）

1.3 编写测试 → 实现：`checkFileAccess()`
- 纯函数，glob 匹配（minimatch）
- deny 优先级高于 allow
- 无匹配 allow → 拒绝

1.4 编写测试 → 实现：`checkNetworkAccess()`
- 纯函数，三种模式：none/restricted/open
- 域名:端口匹配

1.5 编写测试 → 实现：`validatePolicy()`
- 验证 JSON 结构、glob 语法、端点格式

1.6 编写测试 → 实现：`buildDefaultPolicy()`
- 允许项目根目录下所有文件
- 网络模式 open

1.7 编写属性测试 (`test/sandbox-policy.property.test.ts`)
- P1: deny 始终覆盖 allow
- P2: 默认策略拒绝项目外路径
- P3: network none 模式拒绝所有端点

### Task 2: PolicyEnforcer hook 脚本 (`src/check-sandbox.ts`) — TDD

2.1 编写测试 → 实现：`checkSandboxAccess()`
- 读取 `.tinkerman/.sandbox-active.json`
- Write/Edit → 提取路径 → `checkFileAccess()`
- Bash → 检测网络命令 → `checkNetworkAccess()`

2.2 编写测试 → 实现：网络命令检测
- 检测 curl/wget/npm publish/git push/ssh/scp
- 提取目标端点

2.3 CLI 入口 (`main()`)
- 从 `process.argv` 或 stdin 读取输入
- 调用 `checkSandboxAccess()`
- exit 0 允许 / exit 1 拒绝（输出原因到 stderr）

### Task 3: CLI & SdkDriver 集成

3.1 `src/forge-loop-cli.ts` 添加 `--sandbox` 选项
- Boolean flag
- 传递到 SdkDriverConfig

3.2 `src/sdk-driver.ts` 集成
- `SdkDriverConfig` 添加 `sandboxEnabled` 字段
- `run()` 启动时：加载 sandbox.json → validatePolicy → 写入 `.sandbox-active.json`
- cleanup 时删除 `.sandbox-active.json`

3.3 更新 `hooks/hooks.json`
- 添加 Write|Edit sandbox hook
- 添加 Bash sandbox hook

3.4 编写集成测试
- 端到端：sandbox 阻止拒绝路径写入
- sandbox 允许允许路径写入
- sandbox + frozen zone 独立生效

### Task 4: 最终验证

- 全量测试套件通过
- 向后兼容验证：无 `--sandbox` 时行为不变
- 类型检查 + lint 通过

## 新增文件

| 文件 | 用途 |
|------|------|
| `src/sandbox-policy.ts` | 纯函数策略模块 |
| `src/check-sandbox.ts` | PreToolUse hook 脚本 |
| `test/sandbox-policy.test.ts` | 单元测试 |
| `test/sandbox-policy.property.test.ts` | 属性测试 |
| `test/check-sandbox.test.ts` | hook 脚本测试 |
| `test/sandbox-integration.test.ts` | 集成测试 |

## 修改文件

| 文件 | 改动 |
|------|------|
| `package.json` | 添加 minimatch 依赖 |
| `src/forge-loop-cli.ts` | 添加 `--sandbox` 选项 |
| `src/sdk-driver.ts` | sandbox 启动/清理逻辑 |
| `hooks/hooks.json` | 添加 sandbox hook 条目 |
