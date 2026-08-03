# Forge — 统一 AI 编码工作流框架

[![CI](https://github.com/kkkman22/Forge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kkkman22/Forge/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/badge/security--audit-npm%20audit%20%2B%20deps-blue)](./.github/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

> **统一 `/forge` 入口 + <!-- ssot:begin topic=commands render=count -->38<!-- ssot:end topic=commands --> 个内部子命令覆盖完整开发生命周期，三维路由自动匹配复杂度，统一状态系统跨会话感知。**
>
> 前置条件：Claude Code ≥ 2.1.163 | [安装指南](docs/quick-start.md)
> 完整兼容性矩阵和降级策略见 [docs/claude-code-compatibility.md](docs/claude-code-compatibility.md)

---

## 核心价值

- **<!-- ssot:begin topic=commands render=count -->38<!-- ssot:end topic=commands --> 个命令**覆盖从需求分析到代码交付的完整周期
- **三维路由**自动匹配任务复杂度（轻量/标准/全量）
- **统一状态**目录 `.forge/`，跨命令状态感知和会话恢复
- **按需加载**，单次会话约 10K tokens
- **TDD 强制** + 三层独立评审，保障代码质量

---

## 快速开始

```bash
# 1. 安装（Plugin 方式，推荐）
claude plugin marketplace add https://github.com/kkkman22/Forge
claude plugin install forge

# 2. 初始化项目（仅首次）
/forge init

# 3. 验证安装
/forge status

# 4. 第一次使用
/forge 修复 README 中的拼写错误
```

> 完整快速入门指南（含 3 种安装方式、故障排除、端到端示例）→ [docs/quick-start.md](docs/quick-start.md)

### 日常开发：90% 场景只需 7 个命令

安装后，绝大多数工作流由这 7 个核心命令覆盖，无需记忆全部子命令：

| 命令 | 用途 |
|------|------|
| `/forge` | **统一入口**——描述任务，自动路由到合适档位（推荐起步） |
| `/forge plan` | 将需求/Spec 拆解为原子任务清单 |
| `/forge build` | 按计划 TDD 实现代码 |
| `/forge review` | 三层独立评审（spec / quality / security） |
| `/forge test` | 运行完整验证套件 |
| `/forge ship` | 门禁检查 + 合并/发版交付 |
| `/forge learn` | 完成后沉淀经验到知识库 |

> 其余 31 个命令（decide / spec / loop / grill / debug 等）在特定场景按需触发，三维路由会自动建议。完整速查表 → [docs/reference-commands.md](docs/reference-commands.md)

---

## 选择任务流

| 文档 | 路径 | 适用场景 |
|------|------|----------|
| 修复 Bug | [docs/flows/fix-bug.md](docs/flows/fix-bug.md) | 现有功能出错、测试失败、CI 回归 |
| 构建明确功能 | [docs/flows/build-feature.md](docs/flows/build-feature.md) | 需求清楚，有验收标准或现成 Spec |
| 探索模糊需求 | [docs/flows/explore-requirement.md](docs/flows/explore-requirement.md) | 方向存在，但方案、范围或验收标准未定 |
| 检查交付就绪 | [docs/flows/check-ship-readiness.md](docs/flows/check-ship-readiness.md) | 代码完成后确认 review/test/ship 证据是否足够 |
| 快速入门 | [docs/quick-start.md](docs/quick-start.md) | 首次接触，安装并完成第一个任务 |
| 命令速查 | [docs/reference-commands.md](docs/reference-commands.md) | 查看全部 <!-- ssot:begin topic=commands render=count -->38<!-- ssot:end topic=commands --> 个命令和路由详解 |
| Policy Profiles | [docs/best-practices/policy-profiles.md](docs/best-practices/policy-profiles.md) | 在 solo/team/enterprise 流程成本之间选择 |
| 安全参考 | [docs/reference-security.md](docs/reference-security.md) | 了解安全机制分层和审计 |
| 架构参考 | [docs/reference-architecture.md](docs/reference-architecture.md) | 深入了解 .forge/ 目录结构和状态保护 |
| 高级功能参考 | [docs/reference-advanced.md](docs/reference-advanced.md) | Forge Loop、cmux、Domain Pack、Token 效率 |
| 兼容性参考 | [docs/claude-code-compatibility.md](docs/claude-code-compatibility.md) | Claude Code 版本兼容性和降级策略 |
| API 参考 | [GitHub Pages](https://kkkman22.github.io/Forge/) | typedoc 生成的源码 API 文档（CI 自动发布，不入库） |

---

## Gate Skills 对比

| 维度 | `/forge accept` | `/forge verify` | `/forge ship` |
|------|----------------|-----------------|---------------|
| 触发时机 | Spec 验收场景执行 | 证据化三态验证收尾 | 最终交付前合规/合并/release |
| 主要责任 | 运行场景脚本并记录验收结果 | 汇总所有证据、产出三态结论 | 综合前置门禁、执行合并/tag |
| 典型输出 | `.forge/acceptance/<scenario>.md` | `.forge/findings/<topic>/verify-this/` | PR merge + tag + CHANGELOG |
| 下游接续 | → `/forge verify` 或 `/forge ship --with-acceptance` | → `/forge ship` | Release 完成 |

---

## 安装方式

### Plugin 安装（推荐）

```bash
claude plugin marketplace add https://github.com/kkkman22/Forge
claude plugin install forge
```

> 所有新用户推荐此方式。无需 git 或 Node.js。

### 直接克隆（Forge Loop 开发者）

```bash
git clone https://github.com/kkkman22/Forge.git ~/.claude/skills/forge
```

> 包含完整功能：`/forge` 命令 + Forge Loop 带工程纪律的自主执行引擎。额外需要 `npm install && npx tsc`。

### 分发包安装（企业内网）

```bash
git clone https://github.com/kkkman22/Forge.git /tmp/forge
bash /tmp/forge/scripts/build-dist.sh
bash /tmp/forge/scripts/install-dist.sh
```

> 只含 `/forge` 命令，不含 Forge Loop。适合团队统一部署。

## bin/ 命令

Plugin 安装后，以下命令可直接在终端使用：

| 命令 | 说明 |
|------|------|
| `forge-doctor` | 项目健康检查（`.forge/` 结构、配置、hooks） |
| `forge-status` | 显示当前任务状态（tier/phase/progress） |
| `forge-restate` | 触发 restatement checkpoint（可选 `--check` 工具） |

所有命令支持 `--help`。

### 自带 forge-context MCP

Forge plugin 自带 `forge-context` first-party MCP server，为 `/forge review` 提供智能 diff 截断和上下文优化。

- **零网络**：通过 stdio 在本地运行，不发起任何外部请求
- **零依赖**：server 以自包含 bundle 形式随仓库分发（`dist/forge-context.mjs`），marketplace 安装后无需 `npm install` 或编译即可启用；源仓库用户由 init.sh 配置
- **智能优先级**：源码 > 配置 > 测试 > 生成文件 > lock，确保关键变更进入 token 预算

> 实测效果：`/forge review` 19 文件变更场景 token 消耗从 700K+ 降至 <200K。

---

## 命令概览

| 命令 | 说明 | 路径 |
|------|------|------|
| `/forge` | 入口，三维路由分析任务 | 所有 |
| `/forge decide` | 四视角前置决策 | 全量 |
| `/forge spec` | 将需求固化为可锁定规格 | 全量 |
| `/forge plan` | 将 Spec 拆解为原子任务 | 标准、全量 |
| `/forge build` | 按计划 TDD 实现代码 | 所有 |
| `/forge review` | 三层独立评审 | 所有 |
| `/forge test` | 运行完整验证套件 | 标准、全量 |
| `/forge ship` | 门禁检查 + 交付 | 标准、全量 |
| `/forge learn` | 五维度经验沉淀 | 全量 |
| `/forge verify` | 证据化三态验证 | 所有 |
| `/forge replay` | 回放任务证据链 | 所有 |
| `/forge accept` | 场景验收执行（支持 agent-browser agentic UI 验收） | 所有 |
| `/forge debug` | 四阶段结构化根因分析 | 所有 |
| `/forge triage` | 自动发现可执行项（Loop Engineering discovery） | 所有 |
| `/forge grill` | 苏格拉底式需求澄清 | 所有 |
| `/forge storm` | 头脑风暴 / DDD 前置 | 所有 |
| `/forge recap` | 会话摘要与上下文回顾 | 所有 |
| `/forge loop` | 带工程纪律的自主循环 | 所有 |
| `/forge charter` | 项目宪章（cross-spec 工程约束锚点） | 所有 |
| `/forge status` | 查看当前任务状态 | 所有 |
| `/forge resume` | 会话恢复 | 所有 |
| `/forge continue` | 交互式推进当前任务下一阶段 | 所有 |

> 完整子命令速查表和三维路由详解 → [docs/reference-commands.md](docs/reference-commands.md)
> ADR-0004 之后，所有子命令由统一 skill `forge` 内部分发，`commands/` 仅保留入口占位。

### 三维路由

<!-- ssot:begin topic=routing render=routing-table locale=zh -->
| 档位 | 判定条件 | 命令序列 |
|------|---------|----------|
| **轻量路径** | 影响文件 ≤ 1 且改动 ≤ 20 行 | `build → review` |
| **标准路径** | 需求明确或已有 Spec | `plan → build → review → test → ship` |
| **全量路径** | 新服务 / 新数据库 / 认证变更 / 需求模糊 | `decide → spec → plan → build → review → test → ship → learn` |
<!-- ssot:end topic=routing -->

---

## 安全

Forge 从第一天起把安全视为工程纪律。五层防御：工具调用 Hook 冻结区硬阻断、Shell 注入预防、输入威胁检测、依赖供应链审计、145 property-based 不变量测试。敏感区域按"冻结/受保护/开放"分级保护。详见 [docs/reference-security.md](docs/reference-security.md)。

---

## 开发

```bash
# 安装依赖
npm install

# 完整检查（CI 使用此命令）
npm run check        # typecheck + lint + test + 文档检查

# 单独运行
npm run typecheck    # 类型检查
npm run lint         # Lint 检查
npm run lint:fix     # 自动修复
npm run test         # 运行测试
npm run test:coverage # 测试 + 覆盖率报告

# 构建分发包
bash scripts/build-dist.sh
```

### 发版流程

Forge 提供一键发版命令，自动完成版本更新 → dist 重建 → git commit → tag 创建：

```bash
# 一键发版（推荐）
node scripts/bump-version.mjs minor --commit --tag
git push origin main --follow-tags

# 分步操作
node scripts/bump-version.mjs minor             # 仅更新版本 + 重建 dist
node scripts/bump-version.mjs minor --commit     # + git commit
node scripts/bump-version.mjs minor --commit --tag  # + 创建 tag

# 指定具体版本号
node scripts/bump-version.mjs 3.2.0 --commit --tag

# 推送前本地验证
bash scripts/pre-push-ci-check.sh
```

| 参数 | 说明 |
|------|------|
| `patch` | 3.1.0 → 3.1.1（bug fix） |
| `minor` | 3.1.0 → 3.2.0（新功能） |
| `major` | 3.1.0 → 4.0.0（破坏性变更） |
| `x.y.z` | 指定具体版本号 |
| `--commit` | 自动 git add + commit（含 dist/） |
| `--tag` | 创建 annotated tag（需配合 `--commit`） |

`bump-version.mjs` 会自动同步 `package.json`、`.claude-plugin/plugin.json`、`dist-plugin/` 三个位置的版本号，并重建 dist 包。`pre-push-ci-check.sh` 在推送前检查版本一致性、shell 脚本、JSON 有效性和 bundle 完整性。

**技术栈**：TypeScript 5.9（strict）、377 个 TypeScript 模块、Vitest 4.1、fast-check 4.7（属性测试）、Biome 2.4（lint + format）。运行时依赖：`@anthropic-ai/claude-agent-sdk`、`@modelcontextprotocol/sdk`、`commander`、`minimatch`、`yaml`、`zod`。

**测试策略**：9281 个测试（756 个测试文件）验证不变量。覆盖率 ~87% statements。

---

## 许可证

MIT
