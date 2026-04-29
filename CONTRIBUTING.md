# Contributing to Forge

感谢你对 Forge 的关注！以下是参与贡献的指南。

## 开发环境搭建

```bash
# 克隆仓库
git clone https://github.com/anthropics/forge.git
cd forge

# 安装依赖（需要 Node.js >= 20）
npm install

# 验证环境
npm run check
```

## 代码规范

- **语言**：TypeScript，strict 模式
- **Linter/Formatter**：Biome（不使用 ESLint 或 Prettier）
- **测试框架**：Vitest + fast-check（属性测试）
- **代码风格**：2 空格缩进，双引号，100 字符行宽

运行检查：

```bash
npm run typecheck    # 类型检查
npm run lint         # Lint 检查
npm run lint:fix     # 自动修复 lint 问题
npm run test         # 运行测试
npm run check        # 以上全部（CI 使用此命令）
```

## 项目结构

```
src/          # 核心逻辑（纯函数，无副作用）
test/         # 属性测试（fast-check PBT）
skills/       # 13 个 SKILL.md（AI 行为规范）
agents/       # 10 个 Agent 角色定义
commands/     # Forge Command 入口
hooks/        # Claude Code Hooks
templates/    # 文件模板
scripts/      # Shell 脚本（init、build-dist、install-dist）
```

## 提交 PR

1. Fork 仓库并创建功能分支：`git checkout -b feature/your-feature`
2. 确保 `npm run check` 全部通过
3. 如果修改了 `src/` 中的逻辑，添加对应的属性测试
4. 如果修改了 agent 配置，确保 `contract.test.ts` 通过
5. 提交信息使用中文或英文均可，简洁描述变更内容
6. 提交 PR 到 `main` 分支

## 测试要求

- `src/` 中的所有函数必须有对应的属性测试（`test/*.property.test.ts`）
- 测试验证的是**不变量**（invariant），不是特定输入输出
- 配置一致性通过 `test/contract.test.ts` 验证
- PR 合并前 CI 必须全绿

## 安全模型 (Security Model)

### SDK 权限绕过策略

`SDK_Agent_Adapter`（`src/sdk-agent-adapter.ts`）在调用 Claude Agent SDK 时使用了 `bypassPermissions` 和 `allowDangerouslySkipPermissions` 选项。这是因为 SDK 内置的交互式权限提示（interactive permission prompts）专为人机交互场景设计，与 Forge Loop 的无人值守自主执行模式不兼容。在自主循环中，没有人类操作员来响应权限弹窗，因此必须绕过 SDK 层的权限检查。

### 上层防线 (Upper Layer Defenses)

绕过 SDK 权限后，访问控制由以下多层防御机制替代：

1. **PreToolUse Hook 拦截** — 通过 `hooks/hooks.json` 中配置的 PreToolUse 钩子，在 Write、Edit、Bash 等工具调用执行前进行拦截，运行冻结区检查以阻止对受保护文件的修改。
2. **冻结区保护 (Frozen Zone Protection)** — 由 `src/check-frozen.ts` 和 `scripts/check-frozen.sh` 实现，当 `.forge/specs/*`、`.forge/plans/*` 和 `.forge/config.md` 的状态为 "locked" 或 "approved" 时，拒绝对这些文件的写入操作。路径分类和状态解析逻辑统一由 `src/state.ts` 提供，`check-frozen.ts` 作为 CLI 入口委托给 `state.ts`，确保规则来源唯一。
3. **状态门禁检查 (State Gate Checks)** — `build.ts` 等编排器模块在允许状态转换前，会验证 spec/plan 的当前状态是否满足前置条件。
4. **内层提交保护 (Inner-Layer Commit Guard)** — `src/effect-executor.ts` 在执行 `git commit` 前，会扫描暂存区中的 `.forge/` 文件，对冻结区文件进行二次校验。即使 Hook 层未能拦截写入，此层也能阻止冻结文件被提交。

### 风险声明

> **警告**：如果上述防御层中的任何一层被禁用或配置错误，`SDK_Agent_Adapter` 将在没有任何访问控制限制的情况下运行。对钩子配置（`hooks/hooks.json`）或冻结区逻辑（`check-frozen.ts` / `state.ts`）的任何修改都必须经过严格审查。

### 实现参考

权限绕过的具体实现位于 `src/sdk-agent-adapter.ts` 第 118–135 行。该段代码包含了 `permissionMode: "bypassPermissions"` 和 `allowDangerouslySkipPermissions: true` 的设置，以及上层防御机制的详细注释说明。

## 需要帮助？

如果有任何问题，欢迎提 Issue 讨论。

## SKILL-纯函数对接检查

每次新增或修改 `src/*.ts` 中的 exported 函数时，检查：

1. [ ] 该函数是否被某个 SKILL 文档引用？
2. [ ] 引用是否包含完整调用路径？
   - 函数名（含模块路径）
   - 参数来源（从哪个上下文变量/文件/命令输出获取）
   - 返回值用途（如何影响后续流程：替换 context / 写入文件 / 阻断流程）
3. [ ] 如果是 Forge Loop 专用函数（由 SdkDriver/EffectExecutor 直接调用），标注为"非 SKILL 调用"

**例外**：Forge Loop 模块（`orchestrator`、`effect-executor`、`sdk-driver`、`sdk-agent-adapter`、`run-manager`、`failure-handler`、`worktree-manager` 等）的函数由程序直接调用，不需要 SKILL 引用。
