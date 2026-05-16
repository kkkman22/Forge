---
status: locked
contract_legacy: true
created: "2026-04-30"
source: ".kiro/specs/parallel-status-tracking"
---

# Spec: Parallel Status Tracking

> 来源: `.kiro/specs/parallel-status-tracking/`

## 概述

引入多文件状态追踪模式（`.forge/status/<task-id>.md`），使每个并行任务拥有独立的状态文件，同时保持单任务场景下的完全向后兼容。两个新模块（status-resolver.ts、status-manager.ts）+ 现有模块适配。

## 需求来源

- requirements.md — 10 个需求（R1-R10），涉及 Status_Resolver、Status_Manager、Router/Loop/Resume/Abort/Status 适配、Hook 兼容、向后兼容迁移
- design.md — 分层架构、模式切换状态机、12 个正确性属性、IO 接口抽象
- tasks.md — 7 个任务的 TDD 实现计划（slugify/resolver → manager 核心 → 迁移归档 → sdk-driver 适配 → SKILL 更新 → hooks 适配 → 集成验证）
