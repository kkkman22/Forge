---
topic: cmux-integration
generated_at: 2026-05-11T13:25:17.580Z
auto_generated: true
stage_count: 2
total_files: 2
---

# Feature: cmux-integration

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | — | — | — |
| Plan | [cmux-integration.md](../plans/cmux-integration.md) | approved | 2026-05-08 |
| Build | [cmux-integration.md](../progress/cmux-integration.md) | (no status) | 2026-05-08 |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Plan** (approved, 2026-05-08)：为 Forge 增加可选的 cmux 集成层：通过独立守护进程 Mirror_Daemon 观察 `.tinkerman/` 状态文件，将 Forge 生命周期（路由、DAG 进度、评审结果、Forge Loop 迭代、冻结拦截）以结构化形式投射到 cmux 侧边栏、通知和浏览器 surface。同时...
- **Build** (unknown, 2026-05-08)：\| Task \| Status \| Commit \| \|------\|--------\|--------\| \| 1. mock-socket 测试基础设施 \| done \| — \| \| 2. 添加 yaml npm 依赖 \| done \| — \| \| 3. lib/availability.m...
