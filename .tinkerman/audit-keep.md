---
updated: "2026-05-17"
purpose: "显式保留清单 — 审计脚本扫描 '孤立' skill 时应跳过以下条目"
---

# Audit Keep List

## 显式保留项

| Item | Location | Rationale | Added |
|------|----------|-----------|-------|
| forge-decide-teams | `skills/forge-decide-teams/` | Agent Teams 趋势 PoC，跟进条件见 ROADMAP v3.0 | 2026-05-13 |
| forge-loop-signals | `cmux-skills/forge-loop-signals/` | 30 行声明式零维护文件，Loop 可视化是核心价值主张 | 2026-05-13 |

## 跨版本回归追踪 (Retest On Version Bump)

| Finding | Location | Trigger | Added |
|---------|----------|---------|-------|
| agent-sdk-task-id-purge | `.tinkerman/findings/agent-sdk-task-id-purge-2.1.143.md` | 每次 Claude Code 版本升级时重测 `/forge review`；上游 issue #14055/#25413/#27371/#29183 修复后可关闭 | 2026-05-17 |

## 已验证清理

| Item | Status | Evidence |
|------|--------|----------|
| teams/ directory | Already removed | `ls teams/` → No such file or directory |
| teams/ references | 1 remaining in docs/api/media/ROADMAP.md:132 | Historical TODO entry, teams/ already cleaned |
