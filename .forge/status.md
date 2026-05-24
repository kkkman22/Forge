---
current_task: "cmux-skills-collapse"
tier: "standard"
task_type: "feature"
project_phase: "implementation"
phase: "build"
work_nature: "feature"
updated: "2026-05-24"
branch: "worktree-cmux-skills-collapse"
spec_path: ".kiro/specs/cmux-skills-collapse/"
plan_path: ".kiro/specs/cmux-skills-collapse/tasks.md"
hints: "tdd-enforced,cmux-gate,physical-migration,zero-impact,10-step-dispatcher"
assumptions:
  - "spec 目录含 requirements+design+tasks = decide+spec+plan 完成"
  - "18 tasks / 5 tiers / 9 waves"
  - "cmux-gate.ts 为新模块，shim 复刻 availability 判定"
  - "3 个 SKILL 物理迁移 + cmux-skills/ 删除"
  - "dispatcher 9 步链路扩展为 10 步（插入 Step 2.5）"
---

# 项目状态

## 当前任务：cmux-skills-collapse

Standard-tier build。将三个 cmux SKILL 从 `cmux-skills/` 迁移到 collapsed dispatcher 路径，新增 Conditional_Availability_Gate 闸门。

**Spec**：`.kiro/specs/cmux-skills-collapse/`
**Plan**：`.kiro/specs/cmux-skills-collapse/tasks.md`（18 tasks，5 tiers，9 waves）

## 已完成

forge-single-entry-skills-collapse: 47 commits merged to main (6127feb).
