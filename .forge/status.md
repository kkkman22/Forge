---
current_task: "audit-remediate-p0p1"
tier: "full"
phase: "decide"
updated: "2026-06-06"
branch: "forge/audit-remediate-p0p1"
---

# 项目状态

## 当前任务：audit-remediate-p0p1

修复 FORGE_CODE_AUDIT_2026-06-06.md 审核报告中的 P0/P1 问题（10 项）。

### 范围

**P0（必须修复）**：
1. P0-1: `forge_read` 可绕过项目根路径约束读取任意本地文件
2. P0-2: `forge_exec` 声称禁止变更但没有硬性只读/只测命令边界

**P1（发布前修复）**：
3. P1-1: `src/` 与 tracked `dist/` 大面积漂移
4. P1-2: dispatcher allowlist 与 registry 漂移
5. P1-3: Router intent dictionary 在 Node ESM runtime 中失效
6. P1-4: plugin dist 缺少 `hooks/` 和 `.mcp.json`
7. P1-5: coverage gate 失败（branches 78.96% < 79%）
8. P1-6: npm package `postinstall` 副作用
9. P1-7: tag publish job 未依赖完整质量门禁
10. P1-8: Stop hook 127 多层 hook 配置漂移

- Tier: full
- Sequence: decide → spec → plan → build → review → test → ship → learn
