---
topic: process-lifecycle-management
generated_at: 2026-05-11T13:25:17.591Z
auto_generated: true
stage_count: 2
total_files: 2
---

# Feature: process-lifecycle-management

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | — | — | — |
| Plan | [process-lifecycle-management.md](../plans/process-lifecycle-management.md) | approved | 2026-04-29 |
| Build | — | — | — |
| Review | [process-lifecycle-management.md](../reviews/process-lifecycle-management.md) | (no status) | 2026-04-29 |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Plan** (approved, 2026-04-29)：为 Forge 引入三层防御架构的子进程生命周期管理：进程组隔离、进程注册表 + 统一清理、跨会话兜底清理。新增 ProcessRegistry、ProcessTreeCleaner、OrphanDetector 三个模块，修改 sleep-preventer、effect-executor、...
- **Review** (unknown, 2026-04-29)：### 需求覆盖矩阵  \| 需求 \| 状态 \| 说明 \| \|------\|------\|------\| \| R1 进程注册表核心 \| ✅ 全部实现 \| register/unregister/getAll/size/单例/元数据 \| \| R2 统一清理 \| ⚠️ 部分实现 \| shutdown...
