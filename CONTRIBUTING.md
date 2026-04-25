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
teams/        # 2 个 Agent Team 参考配置
commands/     # Forge Command 入口
hooks/        # Claude Code Hooks
templates/    # 文件模板
scripts/      # Shell 脚本（init、build-dist、install-dist）
```

## 提交 PR

1. Fork 仓库并创建功能分支：`git checkout -b feature/your-feature`
2. 确保 `npm run check` 全部通过
3. 如果修改了 `src/` 中的逻辑，添加对应的属性测试
4. 如果修改了 agent/team 配置，确保 `contract.test.ts` 通过
5. 提交信息使用中文或英文均可，简洁描述变更内容
6. 提交 PR 到 `main` 分支

## 测试要求

- `src/` 中的所有函数必须有对应的属性测试（`test/*.property.test.ts`）
- 测试验证的是**不变量**（invariant），不是特定输入输出
- 配置一致性通过 `test/contract.test.ts` 验证
- PR 合并前 CI 必须全绿

## 需要帮助？

如果有任何问题，欢迎提 Issue 讨论。
