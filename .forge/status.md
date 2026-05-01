---
current_task: "ship-gate-commit-verification"
tier: "standard"
task_type: "fullstack"
project_phase: "iteration"
phase: "build"
hints: "backward-compat, pure-function, property-test"
assumptions:
  - "src/review.ts 存在，无 ReviewReportFrontmatter 类型（基于代码库分析）"
  - "src/ship.ts 存在，需扩展（基于代码库分析）"
  - "测试框架为 Vitest + fast-check 4.7.0（基于 package.json）"
  - "纯增量改动，不涉及架构变更（基于 design.md 声明）"
updated: "2026-05-01"
---

# 项目状态

当前任务：ship-gate-commit-verification（build 阶段）。

## 已完成工作

- routing-assumptions: 路由器输出增加假设段落
- skill-behavioral-guardrails: SKILL 行为护栏
- Group C: 社区基础设施
- Group D: SKILL 插件机制
- Group E: 示例项目
