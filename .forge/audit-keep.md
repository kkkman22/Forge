---
updated: "2026-05-13"
purpose: "显式保留清单 — 审计脚本扫描 '孤立' skill 时应跳过以下条目"
---

# Audit Keep List

## 显式保留项

| Item | Location | Rationale | Added |
|------|----------|-----------|-------|
| forge-decide-teams | `skills/forge-decide-teams/` | Agent Teams 趋势 PoC，跟进条件见 ROADMAP v3.0 | 2026-05-13 |
| forge-loop-signals | `cmux-skills/forge-loop-signals/` | 30 行声明式零维护文件，Loop 可视化是核心价值主张 | 2026-05-13 |

## 已验证清理

| Item | Status | Evidence |
|------|--------|----------|
| teams/ directory | Already removed | `ls teams/` → No such file or directory |
| teams/ references | 1 remaining in docs/api/media/ROADMAP.md:132 | Historical TODO entry, teams/ already cleaned |
