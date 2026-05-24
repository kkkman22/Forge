---
current_task: "cmux-claude-uplift-0.64"
tier: "standard"
task_type: "feature"
project_phase: "implementation"
phase: "build"
work_nature: "feature"
updated: "2026-05-24"
branch: "worktree-cmux-claude-uplift-0.64"
spec_path: ".kiro/specs/cmux-claude-uplift-0.64/"
plan_path: ".kiro/specs/cmux-claude-uplift-0.64/tasks.md"
hints: "zero-impact,window-injection,property-test,cmux-0.64-uplift"
assumptions:
  - "spec 目录含 requirements+design+tasks = decide+spec+plan 完成"
  - "11 tasks / 4 tiers / 6 waves"
  - "cli.mjs push.sh hook-notify.sh 三处注入 --window"
  - "templates/cmux.json 追加 commands + agent_resume_approvals"
  - "bootstrap-check.mjs 接入 cmux config doctor"
  - "docs/reference-advanced.md 刷新到 0.64"
---

# 项目状态

## 当前任务：cmux-claude-uplift-0.64

Standard-tier build。cmux 0.64 增量升级：多窗口 `--window` 注入、命令面板、resume 预批准、config doctor、文档刷新。

**Spec**：`.kiro/specs/cmux-claude-uplift-0.64/`
**Plan**：`.kiro/specs/cmux-claude-uplift-0.64/tasks.md`（11 tasks，4 tiers，6 waves）

## 已完成

forge-single-entry-skills-collapse: 47 commits merged to main (6127feb).
cmux-skills-collapse: merged to main.
