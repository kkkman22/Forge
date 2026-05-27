# Forge — 统一 AI 编码工作流框架

[![CI](https://github.com/kkkman22/Forge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kkkman22/Forge/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/badge/security--audit-npm%20audit%20%2B%20deps-blue)](./.github/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

> **统一 `/forge` 入口 + <!-- ssot:begin topic=commands render=count -->21<!-- ssot:end topic=commands --> 个内部子命令覆盖完整开发生命周期，三维路由自动匹配复杂度，统一状态系统跨会话感知。**
>
> 前置条件：Claude Code ≥ 2.1.121 | [安装指南](docs/quick-start.md)
> 建议 Claude Code ≥ 2.1.143（forge-context env-first 路径解析、Stop hook 安全网、PostToolUse 反馈链均依赖此版本平台特性，旧版本会自动降级到 fallback 路径）

---

## 核心价值

- **<!-- ssot:begin topic=commands render=count -->21<!-- ssot:end topic=commands --> 个命令**覆盖从需求分析到代码交付的完整周期
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

---

## 文档导航

| 文档 | 路径 | 适用场景 |
|------|------|----------|
| 快速入门 | [docs/quick-start.md](docs/quick-start.md) | 首次接触，5 分钟上手 |
| 初次接触者引导 | [docs/onboarding-beginner.md](docs/onboarding-beginner.md) | 了解基本概念和常用命令 |
| 日常开发者引导 | [docs/onboarding-daily.md](docs/onboarding-daily.md) | 掌握标准工作流各阶段 |
| 高级用户引导 | [docs/onboarding-advanced.md](docs/onboarding-advanced.md) | 深入全量路径、知识系统、贡献指南 |
| 命令速查 | [docs/reference-commands.md](docs/reference-commands.md) | 查看全部 <!-- ssot:begin topic=commands render=count -->21<!-- ssot:end topic=commands --> 个命令和路由详解 |
| 安全参考 | [docs/reference-security.md](docs/reference-security.md) | 了解安全机制分层和审计 |
| 架构参考 | [docs/reference-architecture.md](docs/reference-architecture.md) | 深入了解 .forge/ 目录结构和状态保护 |
| 高级功能参考 | [docs/reference-advanced.md](docs/reference-advanced.md) | Forge Loop、cmux、Domain Pack、Token 效率 |

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

### 自带 forge-context MCP

Forge plugin 自带 `forge-context` first-party MCP server，为 `/forge review` 提供智能 diff 截断和上下文优化。

- **零网络**：通过 stdio 在本地运行，不发起任何外部请求
- **零配置**：marketplace 安装后自动启用，源仓库用户由 init.sh 配置
- **智能优先级**：源码 > 配置 > 测试 > 生成文件 > lock，确保关键变更进入 token 预算

> 实测效果：`/forge review` 19 文件变更场景 token 消耗从 700K+ 降至 <200K。

---

## 命令概览

| 命令 | 说明 | 路径 |
|------|------|------|
| `/forge` | 入口，三维路由分析任务 | 所有 |
| `/forge plan` | 将 Spec 拆解为原子任务 | 标准、全量 |
| `/forge build` | 按计划 TDD 实现代码 | 所有 |
| `/forge review` | 三层独立评审 | 所有 |
| `/forge test` | 运行完整验证套件 | 标准、全量 |
| `/forge ship` | 门禁检查 + 交付 | 标准、全量 |
| `/forge decide` | 四视角前置决策 | 全量 |
| `/forge learn` | 五维度经验沉淀 | 全量 |

> 完整子命令速查表和三维路由详解 → [docs/reference-commands.md](docs/reference-commands.md)

### 三维路由

| 档位 | 判定条件 | 命令序列 |
|------|---------|----------|
| **轻量路径** | 影响 ≤1 文件，改动 ≤20 行 | `build → review` |
| **标准路径** | 需求明确或有现成 Spec | `plan → build → review → test → ship` |
| **全量路径** | 新服务/数据库/认证变更或需求模糊 | `decide → spec → plan → build → review → test → ship → learn` |

---

## 安全

Forge 从第一天起把安全视为工程纪律。五层防御：工具调用 Hook 冻结区硬阻断、Shell 注入预防、输入威胁检测、依赖供应链审计、109 property-based 不变量测试。敏感区域按"冻结/受保护/开放"分级保护。详见 [docs/reference-security.md](docs/reference-security.md)。

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

**技术栈**：TypeScript 5.9（strict）、196 个 TypeScript 模块、Vitest 3.2、fast-check 4.7（属性测试）、Biome 2.4（lint + format）。运行时依赖：`@anthropic-ai/claude-agent-sdk`、`commander`。

**测试策略**：7409 个测试（374 个测试文件，其中 149 个为 fast-check 属性测试文件）验证不变量。覆盖率 ~89% statements。

---

## 许可证

MIT
