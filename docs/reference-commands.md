---
title: 'Forge 命令速查与路由详解'
category: reference
audience:
- maintainer
updated: 2026-06-09
owner: forge-maintainers
---

[← 返回索引](./INDEX.md)

# Forge 命令速查与路由详解

> **单入口模式 (v2.5.0)**：所有子命令通过 `/forge <子命令>` 调用。`/forge-<sub>` 形式的旧 wrapper 已移除。

## 子命令速查表

| 命令 | 阶段 | 说明 | 适用路径 |
|------|------|------|---------|
| `/forge` | 入口 | 三维路由，分析任务复杂度并建议档位 | 所有 |
| `/forge decide` | 决策 | 四视角前置决策（产品/架构/安全/设计） | 全量 |
| `/forge spec` | 规格 | 将需求固化为可锁定的规格文档，支持从外部文件导入 | 全量 |
| `/forge plan` | 规划 | 将 Spec 拆解为含 TDD 步骤的原子任务 | 标准、全量 |
| `/forge build` | 执行 | 按计划以 TDD 方式逐任务实现 | 所有 |
| `/forge review` | 评审 | 三层独立评审（Spec 对齐/质量/安全），支持 `--canvas` 可视化模式 | 所有 |
| `/forge test` | 测试 | 三层验证（单元测试/浏览器 QA/清单），支持 `--cli`/`--ui` 模式 | 标准、全量 |
| `/forge ship` | 交付 | 门禁检查 + 四选项交付 | 标准、全量 |
| `/forge learn` | 知识 | 五维度经验提取和沉淀，支持 `--from-chats` 从历史对话提取 | 全量 |
| `/forge status` | 辅助 | 查看当前任务状态 | 所有 |
| `/forge resume` | 辅助 | 五问题恢复上次会话上下文，支持 `--from-pr` 跨会话恢复 | 所有 |
| `/forge debug` | 辅助 | 四阶段结构化根因分析 | 所有 |
| `/forge verify` | 验证 | 证据化三态验证（VERIFIED/NOT_VERIFIED/INCONCLUSIVE） | 所有 |
| `/forge replay` | 辅助 | 回放任务证据链，区分 fact/missing/superseded | 所有 |
| `/forge accept` | 验收 | 运行场景脚本并记录验收结果 | 所有 |
| `/forge grill` | 需求 | 苏格拉底式需求澄清，生成决策树 | 所有 |
| `/forge storm` | 探索 | 头脑风暴，多视角发散思考 | 所有 |
| `/forge recap` | 辅助 | 会话摘要与上下文回顾 | 所有 |
| `/forge abort` | 辅助 | 安全中止当前任务，归档状态并重置 | 所有 |
| `/forge zoom-out` | 辅助 | 宏观视角回顾当前任务全局 | 所有 |
| `/forge mutate` | 辅助 | 变异测试分析 | 所有 |
| `/forge pack` | 辅助 | Domain Pack 管理 | 所有 |
| `/forge refactor` | 辅助 | 结构化重构 | 所有 |
| `/forge fix` | 辅助 | 定向修复 | 所有 |
| `/forge build-light` | 辅助 | 轻量路径构建（≤1 文件，≤20 行） | 轻量 |
| `/forge decide-teams` | 决策 | Agent Teams 模式决策（高 token / 高质量补充） | 全量 |
| `/forge fix-conflicts` | 辅助 | 结构化冲突修复 | 所有 |
| `/forge control-cli` | 辅助 | CLI 控制面板交互 | 所有 |
| `/forge control-ui` | 辅助 | Web UI 控制面板交互 | 所有 |
| `/forge review-comment-bitbucket` | 评审 | Bitbucket PR 评论发布 | 所有 |
| `/forge loop` | 执行 | 带工程纪律的自主循环执行 | 所有 |
| `/forge router` | 辅助 | 路由器行为调试 | 所有 |

## 三维路由

Forge 路由器从三个维度分析任务：

| 维度 | 决定什么 | 可选值 |
|------|---------|--------|
| **复杂度（Tier）** | 运行**哪些**命令 | 轻量 / 标准 / 全量 |
| **任务类型（TaskType）** | 每个命令**怎么**执行 | frontend / backend / fullstack / data / infra / docs |
| **项目阶段（ProjectPhase）** | **强调**什么 | greenfield / iteration / refactor / bugfix |

复杂度决定命令序列。任务类型和项目阶段生成**行为提示（Hints）**，注入到命令序列中，让下游 skill 调整行为。同样是标准路径，一个"前端 + 重构"任务和一个"后端 + 新功能"任务会收到完全不同的行为提示。

### 轻量路径 — 小改动

**判定条件**：影响文件 ≤ 1 且改动 ≤ 20 行

**命令序列**：`build → review`

适用场景：修复拼写错误、调整配置、小 bug 修复。

### 标准路径 — 明确需求

**判定条件**：有明确需求或现成 Spec

**命令序列**：`plan → build → review → test → ship`

适用场景：新功能开发、已知范围的重构、有明确需求的改进。

### 全量路径 — 复杂任务

**判定条件**：涉及新服务/新数据库/认证体系变更，或需求描述模糊

**命令序列**：`decide → spec → plan → build → review → test → ship → learn`

适用场景：新服务搭建、架构变更、需求不明确的探索性任务。

### 用户覆盖

用户可以随时指定档位，覆盖 AI 建议：

```bash
/forge --tier=full 添加用户通知功能   # 强制全量路径
/forge --tier=light 修复样式问题      # 强制轻量路径
```
