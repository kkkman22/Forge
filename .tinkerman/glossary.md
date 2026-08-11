---
schema_version: 2
updated: "2026-06-03"
---

# Forge Glossary

## Tier
**定义**: Forge 三维路由中的复杂度维度，决定运行哪些命令。取值 light / standard / full。
**别名**: 档位, 复杂度档位
**更新**: 2026-05-06
**来源**: 初始预置

## Spec
**定义**: 需求锁定的产物，位于 `.kiro/specs/<feature>/`，一旦 locked 即进入冻结区。
**别名**: 规格, 规格文档
**避免**: PRD（PRD 是产品需求文档，Spec 是技术规格，不是同一层级的产物）
**关系**: → Plan: Spec 被 Plan 拆解为原子任务; → Feature: Spec 锁定一个 feature 的需求
**歧义记录**: "spec" 曾与 "design doc" 混淆 — 结论：Spec 是需求规格（what），design doc 是技术设计（how），两者分离
**更新**: 2026-06-03
**来源**: glossary-enhancement

## Plan
**定义**: 实现计划文档，把 spec 拆分为可独立交付的任务序列。
**别名**: 实现计划, 任务计划
**避免**: 路线图（路线图是长期产品规划，Plan 是单次实现的具体任务拆解）
**关系**: → Spec: Plan 拆解 Spec 的需求; → Vertical Slice: Plan 的每个任务对应一个 Vertical Slice
**歧义记录**: "plan" 曾与 "roadmap" 混淆 — 结论：Plan 是短期实现计划（按天计），roadmap 是产品方向（按月/季计）
**更新**: 2026-06-03
**来源**: glossary-enhancement

## Hint
**定义**: 路由提示关键词（如 `:web`、`:sec`），用于引导 forge-router 的 skill 选择。
**更新**: 2026-05-06
**来源**: 初始预置

## Subagent
**定义**: 委派特定任务给专精 agent 的执行机制，隔离主对话上下文。
**别名**: 子代理, 专精 agent
**避免**: 子进程（Subagent 是逻辑隔离的 agent 实例，不是操作系统子进程）
**关系**: → Frozen Zone: Subagent 受 Frozen Zone 约束不可修改受保护文件; → Three-Strike: Subagent 连续 3 次 TDD 失败触发 Three-Strike 重路由
**更新**: 2026-06-03
**来源**: glossary-enhancement

## Frozen Zone
**定义**: 冻结区：受保护不可修改的文件集合（如 `skills/**/SKILL.md`、锁定 spec）。
**更新**: 2026-05-06
**来源**: 初始预置

## Guarded Zone
**定义**: 保护区：允许追加但禁止删除修改的文件集合（如知识库 sessions、instincts）。
**更新**: 2026-05-06
**来源**: 初始预置

## Open Zone
**定义**: 开放区：允许覆盖重写的文件集合（如 glossary.md、evolution-report.md）。
**更新**: 2026-05-06
**来源**: 初始预置

## Restatement Checkpoint
**定义**: 任务复述检查点：Agent 在开始实现前必须复述目标与边界以确认对齐。
**别名**: 复述检查点, RC
**避免**: 总结（总结是回顾性的，Restatement Checkpoint 是前瞻性的对齐验证）
**关系**: → Tier: Restatement Checkpoint 间隔由 config.md 的 N 值控制; → Context Refresh: Restatement Checkpoint 与 Context Refresh 互补，前者验证任务理解，后者防止上下文漂移
**更新**: 2026-06-03
**来源**: glossary-enhancement

## Three-Strike
**定义**: 三振机制：同任务连续 3 次 TDD 失败触发重路由或退出。
**更新**: 2026-05-06
**来源**: 初始预置

## Closure-First Probe
**定义**: 闭包优先探针：先验证最小闭环再扩展，避免过早泛化。
**更新**: 2026-05-06
**来源**: 初始预置

## Vertical Slice
**定义**: 垂直切片：可独立交付的最小功能单元，对应一条 issue 或一个子任务。
**别名**: 切片, 垂直切片
**避免**: 模块（模块是水平分层的架构概念，Vertical Slice 是垂直贯穿各层的交付单元）
**关系**: → Plan: Plan 的每个任务理想情况下对应一个 Vertical Slice; → Closure-First Probe: Vertical Slice 的验证遵循 Closure-First Probe 原则
**歧义记录**: "slice" 曾与 "module" 混淆 — 结论：slice 强调端到端可交付，module 强调内聚的代码组织
**更新**: 2026-06-03
**来源**: glossary-enhancement
