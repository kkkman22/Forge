---
title: 'Forge 架构与状态保护'
category: reference
audience:
- maintainer
updated: '2026-05-12'
owner: forge-maintainers
---

[← 返回索引](./INDEX.md)

# Forge 架构与状态保护

## 状态文件保护

`.forge/` 目录下的文件按修改权限分为三个区域，通过 PreToolUse Hook 技术强制执行：

| 区域 | 规则 | 文件 |
|------|------|------|
| 🔒 **冻结区** | 锁定/批准后 AI 不可修改，PreToolUse Hook 通过非零退出码阻断写入（覆盖 Write/Edit/Bash 工具路径） | `specs/`（locked）、`plans/`（approved）、`config.md` |
| 🛡️ **受保护区** | AI 可追加，不可删除或覆盖（建议性约束，后续将通过 diff 分析实现强制校验） | `progress/`、`reviews/`、`knowledge/instincts.md`、`knowledge/known-failures.md`、`knowledge/solutions/` |
| 🟢 **开放区** | AI 可自由修改 | `status.md`、`decisions/`、`findings/`、`debug/`、`inbox/`、`knowledge/sessions/` |

### Hook 行为说明

Forge 通过 Claude Code 的 [Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) 机制实现状态保护和上下文注入：

- **执行上下文注入**：Write、Edit、Bash 工具触发前，PreToolUse Hook 自动打印 `.forge/plans/*.md` 前 30 行内容，为 AI 提供当前计划的执行上下文。
- **冻结文件保护**：Write/Edit 工具写入 `.forge/` 冻结区文件时，PreToolUse Hook 调用 `check-frozen.js`（TypeScript 编译产物，shell 脚本 `check-frozen.sh` 作为 fallback）检查文件的 frontmatter status，对 `locked`/`approved` 文件以非零退出码阻断写入。Bash 工具执行的命令中若涉及 `.forge/` 冻结区路径，同样触发保护。

## `.forge/` 目录结构

```
.forge/                          # 统一状态根目录
├── config.md                    # 项目配置（名称、技术栈、安全级别）
├── status.md                    # 当前状态快照（任务、档位、阶段）
├── .locks/                      # 并发写入锁文件（自动管理）
├── decisions/                   # /forge decide 输出
│   └── <date>-<topic>.md       #   决策文档
├── inbox/                       # 外部规格暂存区
│   └── *.md                    #   PM 交付的 spec 文档（供 /forge spec <file> 导入）
├── specs/                       # /forge spec 输出
│   └── <feature>/              #   功能规格
│       └── spec.md
├── plans/                       # /forge plan 输出
│   └── <topic>.md              #   任务计划（含 DAG 依赖关系）
├── findings/                    # 执行中发现
│   └── <topic>.md
├── progress/                    # 实时进度
│   └── <topic>.md
├── reviews/                     # /forge review 输出
│   └── <topic>.md              #   评审报告
├── handoffs/                    # 跨阶段决策传递
├── knowledge/                   # /forge learn 输出
│   ├── catalog.md              #   全景索引（Layer A，~50 行入口）
│   ├── solutions/              #   解决方案文档
│   │   └── <topic>.md
│   ├── sessions/               #   会话日志
│   │   └── <date>-<topic>.md
│   ├── patterns/               #   经验模式分类
│   ├── known-failures.md       #   已知失败模式
│   ├── instincts.md            #   经验模式库
│   ├── metrics.md              #   指标追踪
│   ├── tool-health.md          #   工具健康度
│   └── skill-feedback.md       #   SKILL 执行反馈（自进化数据源）
├── debug/                       # /forge debug 记录
│   └── <topic>.md
├── features/                    # 自动生成的功能索引（PostToolUse Hook 维护）
│   └── <topic>.md              #   派生视图，可随时重建
└── archive/                     # 已完成任务归档
```

所有状态文件统一使用 `.md` 格式 + YAML frontmatter，避免 AI 写纯 YAML 的缩进错误。

## 并行执行

Forge 的 Plan 阶段支持为任务声明依赖关系（`dependsOn` 字段），形成有向无环图（DAG）。Build 阶段根据 DAG 调度并行 Subagent：

- **独立任务**自动并行派发，无需等待
- **并行度上限**可配置（默认 3），防止资源耗尽
- **失败传播**：任务失败时，所有传递依赖自动标记为 blocked
- **并发写入保护**：文件锁机制（30 秒超时）防止多 Subagent 同时写入状态文件

```
任务 DAG 示例：

  task-1 ──→ task-3 ──→ task-5
  task-2 ──→ task-4 ──↗

Wave 1: task-1, task-2（并行）
Wave 2: task-3, task-4（并行，task-1/2 完成后）
Wave 3: task-5（task-3/4 完成后）
```
