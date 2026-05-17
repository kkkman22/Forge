---
current_task: "forge-single-entry-skills-collapse"
tier: "full"
task_type: "feature"
project_phase: "active"
phase: "plan_approved"
work_nature: "refactor"
updated: "2026-05-17"
branch: "feature/forge-single-entry-poc"
spec_path: ".forge/specs/forge-single-entry-skills-collapse/spec.md"
plan_path: ".forge/plans/forge-single-entry-skills-collapse.md"
runtime_handoff: "kiro→claude-code"
---

# 项目状态

## 当前任务（plan→build 交接中）

**forge-single-entry-skills-collapse**（全量路径）—— 把 29 个 forge-* skill 物理迁移到 `skills/forge/lib/<sub>/instructions.md`，让 `forge` 成为唯一注册的 skill。修复 `Skill(forge-X) → Unknown skill` 与 forge-loop §13 死信。

- decide：`.kiro/specs/forge-single-entry-skills-collapse/decide.md`（kiro 完成）
- spec：locked at `.forge/specs/forge-single-entry-skills-collapse/spec.md`
- plan：approved at `.forge/plans/forge-single-entry-skills-collapse.md`（17 个 task：Wave 0 spike + Task 1-3 RED + Task 4a-4d dispatcher 实现 + Task 5-15 迁移与重写）
- 下一步：build（在 Claude Code CLI 通过菜单直选 `/forge-build` 启动，因为 `Skill(forge-X)` 当前断链）
- PoC 证据：`.forge/poc/single-entry-dispatch/RESULTS.md`

## 已交付

missions-inspired-rigor: 8 commits merged to main (7edd3ff).

single-entry-command-consolidation: 9 commits merged to main (4390392).

subagent-hook-context-budget: 19 commits merged to main (4331fac).
Fix subagent truncation from unbounded hook injection.
New: hook-stdin-router.mjs, inject-evolved-rules.mjs.
25 new tests, 0 P0/P1 findings.
