---
topic: missions-inspired-rigor
status: locked
locked_date: "2026-05-16"
source: ".kiro/specs/missions-inspired-rigor"
contract_legacy: false
---

# Missions-inspired Rigor

Factory Missions 演讲四条设计原则落地：Validation Contract 前置、原子任务 5 字段 Handoff、Validator 累积知识、Mission-grade Loop。

## 文件索引

- [requirements.md](requirements.md) — 4 条需求 (R1-R4)、24 条 Acceptance Criteria、Validation Contract
- [design.md](design.md) — 架构、数据模型、正确性属性、错误处理、测试策略
- [tasks.md](tasks.md) — 13 个任务、5 个 Wave、依赖图、TDD 步骤

## 摘要

| Requirement | 描述 | AC 数 | Wave |
|-------------|------|-------|------|
| R1 | Validation Contract 前置到 spec 锁定阶段 | 6 | 1-2 |
| R2 | 原子任务 5 字段 Handoff Schema | 8 | 3 |
| R3 | Validator 在 review 阶段持续累积知识 | 6 | 4 |
| R4 | forge-loop 升级为 Mission-grade Long-Running Loop | 8 | 5 |
